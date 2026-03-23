'use strict';

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createConfig(env) {
  const databaseUrl = typeof env.DATABASE_URL === 'string' ? env.DATABASE_URL.trim() : '';
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  return {
    port: parseInteger(env.PORT, 3000),
    databaseUrl,
    dbSsl: env.DB_SSL === 'true',
    claudeUpstreamBaseUrl: typeof env.CLAUDE_UPSTREAM_BASE_URL === 'string' && env.CLAUDE_UPSTREAM_BASE_URL.trim()
      ? env.CLAUDE_UPSTREAM_BASE_URL.trim()
      : 'https://claude.ai',
    corsOrigin: typeof env.CORS_ORIGIN === 'string' && env.CORS_ORIGIN.trim()
      ? env.CORS_ORIGIN.trim()
      : 'https://claude.ai',
    requestTimeoutMs: parseInteger(env.REQUEST_TIMEOUT_MS, 120000),
    sessionCacheTtlMs: parseInteger(env.SESSION_CACHE_TTL_MS, 300000),
  };
}

module.exports = {
  createConfig,
};
