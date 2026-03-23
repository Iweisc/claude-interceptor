'use strict';

const { Pool } = require('pg');

function createPool(config) {
  return new Pool({
    connectionString: config.databaseUrl,
    ssl: config.dbSsl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
  });
}

async function initDb(pool) {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        history JSONB NOT NULL DEFAULT '[]',
        tracked JSONB NOT NULL DEFAULT '{}',
        settings JSONB NOT NULL DEFAULT '{}',
        artifacts JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, user_id)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } finally {
    client.release();
  }
}

module.exports = {
  createPool,
  initDb,
};
