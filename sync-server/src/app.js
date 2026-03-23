'use strict';

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const {
  buildPassthroughHeaders,
  buildUpstreamHeaders,
  extractAccountEmail,
  fetchUpstreamJson,
  patchAccountPayload,
  patchBootstrapPayload,
  proxyUpstreamRequest,
} = require('./services/claude-upstream');
const { createConversationRepository } = require('./repositories/conversations');
const { createMemoryRepository } = require('./repositories/memories');
const { registerArtifactRoutes } = require('./routes/artifacts');
const { createSessionIdentityCache } = require('./services/session-identity');
const { registerCompletionRoutes } = require('./routes/completion');
const { registerConversationRoutes } = require('./routes/conversations');
const { registerMemoryRoutes } = require('./routes/memory');

function createApp({ config, pool, repositories = {}, services = {} }) {
  const appConfig = {
    corsOrigin: config?.corsOrigin || 'https://claude.ai',
    claudeUpstreamBaseUrl: config?.claudeUpstreamBaseUrl || 'https://claude.ai',
    requestTimeoutMs: config?.requestTimeoutMs || 120000,
    sessionCacheTtlMs: config?.sessionCacheTtlMs || 300000,
  };
  const fetchImpl = services.fetchImpl || fetch;
  const sessionIdentityCache = services.sessionIdentityCache || createSessionIdentityCache({
    ttlMs: appConfig.sessionCacheTtlMs,
  });
  const appRepositories = {
    conversations: repositories.conversations || (pool ? createConversationRepository(pool) : null),
    memories: repositories.memories || (pool ? createMemoryRepository(pool) : null),
  };

  void pool;

  const app = express();

  app.use(helmet());
  app.use(rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }));
  const captureRawBody = (req, _res, buffer) => {
    if (buffer && buffer.length > 0) {
      req.rawBody = Buffer.from(buffer);
    }
  };
  app.use(express.json({ limit: '10mb', verify: captureRawBody }));
  app.use(express.urlencoded({ extended: false, limit: '10mb', verify: captureRawBody }));
  app.use(express.text({ type: 'text/*', limit: '10mb', verify: captureRawBody }));
  app.use((req, res, next) => {
    const origin = req.headers.origin || '';
    const requestedHeaders = typeof req.headers['access-control-request-headers'] === 'string'
      ? req.headers['access-control-request-headers']
      : '';

    if (origin === appConfig.corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin, Access-Control-Request-Headers');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      requestedHeaders || 'Content-Type, Authorization, X-Forward-Cookie, X-LiteLLM-Endpoint, X-LiteLLM-Key'
    );
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  async function handlePatchedJsonProxy(req, res, patchPayload) {
    try {
      const cookieHeader = typeof req.headers['x-forward-cookie'] === 'string'
        ? req.headers['x-forward-cookie']
        : '';
      const upstreamUrl = new URL(req.originalUrl, appConfig.claudeUpstreamBaseUrl);
      const upstream = await fetchUpstreamJson({
        fetchImpl,
        url: upstreamUrl,
        headers: buildUpstreamHeaders(req.headers, cookieHeader),
        timeoutMs: appConfig.requestTimeoutMs,
      });

      if (!upstream.payload) {
        res.status(upstream.response.status);
        res.type(upstream.response.headers.get('content-type') || 'application/json');
        res.send(upstream.text);
        return;
      }

      const patchedPayload = patchPayload(upstream.payload);
      const email = extractAccountEmail(patchedPayload);
      if (email) {
        sessionIdentityCache.set(cookieHeader, email);
      }

      res.status(upstream.response.status);
      res.type('application/json');
      res.send(JSON.stringify(patchedPayload));
    } catch (error) {
      const status = error?.name === 'AbortError' ? 504 : 502;
      res.status(status).json({ error: 'Upstream request failed' });
    }
  }

  app.get('/api/account', async (req, res) => {
    await handlePatchedJsonProxy(req, res, patchAccountPayload);
  });

  app.get('/api/bootstrap/:id/app_start', async (req, res) => {
    await handlePatchedJsonProxy(req, res, patchBootstrapPayload);
  });

  async function attachResolvedUser(req, res, next) {
    try {
      const cookieHeader = typeof req.headers['x-forward-cookie'] === 'string'
        ? req.headers['x-forward-cookie']
        : '';
      let userId = sessionIdentityCache.get(cookieHeader);

      if (!userId && cookieHeader) {
        const upstream = await fetchUpstreamJson({
          fetchImpl,
          url: new URL('/api/account', appConfig.claudeUpstreamBaseUrl),
          headers: buildUpstreamHeaders(req.headers, cookieHeader),
          timeoutMs: appConfig.requestTimeoutMs,
        });

        if (upstream.payload) {
          const patchedPayload = patchAccountPayload(upstream.payload);
          const email = extractAccountEmail(patchedPayload);
          if (email) {
            userId = sessionIdentityCache.set(cookieHeader, email);
          }
        }
      }

      if (!userId) {
        res.status(401).json({ error: 'Unable to resolve user session' });
        return;
      }

      req.userId = userId;
      next();
    } catch (error) {
      res.status(502).json({ error: 'Unable to resolve user session' });
    }
  }

  app.use('/api/organizations/:orgId', attachResolvedUser);
  app.use('/wiggle', attachResolvedUser);
  app.use('/artifacts', attachResolvedUser);

  registerConversationRoutes(app, appRepositories);
  registerCompletionRoutes(app, {
    repositories: appRepositories,
    services,
    config: appConfig,
  });
  registerMemoryRoutes(app, appRepositories);
  registerArtifactRoutes(app, appRepositories);

  app.use('/api', async (req, res) => {
    try {
      const cookieHeader = typeof req.headers['x-forward-cookie'] === 'string'
        ? req.headers['x-forward-cookie']
        : '';
      const upstreamUrl = new URL(req.originalUrl, appConfig.claudeUpstreamBaseUrl);
      const body = req.rawBody && req.rawBody.length > 0
        ? req.rawBody
        : undefined;
      const upstream = await proxyUpstreamRequest({
        fetchImpl,
        url: upstreamUrl,
        method: req.method,
        headers: buildPassthroughHeaders(req.headers, cookieHeader),
        body,
        timeoutMs: appConfig.requestTimeoutMs,
      });

      res.status(upstream.response.status);
      const contentType = upstream.response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      const location = upstream.response.headers.get('location');
      if (location) {
        res.setHeader('Location', location);
      }
      res.send(upstream.body);
    } catch (error) {
      const status = error?.name === 'AbortError' ? 504 : 502;
      res.status(status).json({ error: 'Upstream request failed' });
    }
  });

  return app;
}

module.exports = {
  createApp,
};
