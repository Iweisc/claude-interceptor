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
  };
}

module.exports = {
  createConfig,
};
