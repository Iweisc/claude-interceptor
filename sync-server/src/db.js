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
        org_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
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
    await client.query(`
      ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT '';
    `);
    await client.query(`
      ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_user_org_updated
      ON conversations (user_id, org_id, updated_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_user_created
      ON memories (user_id, created_at ASC);
    `);
  } finally {
    client.release();
  }
}

module.exports = {
  createPool,
  initDb,
};
