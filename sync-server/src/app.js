'use strict';

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const {
  buildUpstreamHeaders,
  extractAccountEmail,
  fetchUpstreamJson,
  patchAccountPayload,
  patchBootstrapPayload,
} = require('./services/claude-upstream');
const { createSessionIdentityCache } = require('./services/session-identity');

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

  void pool;
  void repositories;

  const app = express();

  app.use(helmet());
  app.use(rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use((req, res, next) => {
    const origin = req.headers.origin || '';

    if (origin === appConfig.corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Forward-Cookie, X-LiteLLM-Endpoint, X-LiteLLM-Key');
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

  return app;
}

module.exports = {
  createApp,
};
