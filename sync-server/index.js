'use strict';

require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const {
  buildSkillArchive,
  buildSkillDetail,
  extractSkillArchive,
  inferSkillNameFromFilename,
  isValidPartition,
  mapSkillRowToClaudeSkill,
  validateNewSkillName,
  validateSimpleSkillInput,
  validateSkillId,
} = require('./skills');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
const DATABASE_URL = process.env.DATABASE_URL;
const SYNC_API_KEY = process.env.SYNC_API_KEY; // Required — shared secret with the extension

if (!DATABASE_URL) { console.error('DATABASE_URL is required'); process.exit(1); }
if (!SYNC_API_KEY || SYNC_API_KEY.length < 16) {
  console.error('SYNC_API_KEY must be set and at least 16 characters');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

async function initDB() {
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
      CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations (user_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS memories (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_memories_user ON memories (user_id);

      CREATE TABLE IF NOT EXISTS skills (
        id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        prompt TEXT NOT NULL DEFAULT '',
        enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        creator_type TEXT NOT NULL DEFAULT 'user',
        partition_by TEXT NOT NULL DEFAULT 'user',
        is_public_provisioned BOOLEAN NOT NULL DEFAULT false,
        user_invocable BOOLEAN NOT NULL DEFAULT true,
        is_shared BOOLEAN NOT NULL DEFAULT false,
        files JSONB NOT NULL DEFAULT '[]',
        PRIMARY KEY (id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_skills_user ON skills (user_id);

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        instructions TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#6c63ff',
        links JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_projects_user ON projects (user_id);
    `);
    await client.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS creator_type TEXT NOT NULL DEFAULT 'user';
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS partition_by TEXT NOT NULL DEFAULT 'user';
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_public_provisioned BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS user_invocable BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS files JSONB NOT NULL DEFAULT '[]';
    `);
    console.log('[sync] Database initialized');
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  const token = header.slice(7);
  if (token !== SYNC_API_KEY) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  // User identity from X-User-Id header (email)
  const userId = req.headers['x-user-id'];
  if (!userId || userId.length < 3 || userId.length > 256) {
    return res.status(400).json({ error: 'Missing or invalid X-User-Id header' });
  }
  req.userId = userId.toLowerCase().trim();
  next();
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// Rate limit: 120 req/min per IP
app.use(rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
}));

// CORS — allow from claude.ai and extension origins
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  // Allow claude.ai, chrome-extension://, moz-extension://, and localhost
  if (origin.includes('claude.ai') || origin.startsWith('chrome-extension://') ||
      origin.startsWith('moz-extension://') || origin.includes('localhost')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// All API routes require auth
app.use('/api', auth);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check (no auth)
app.get('/health', (_req, res) => res.json({ ok: true }));

// List conversations (recent first, paginated)
app.get('/api/conversations', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);
    const { rows } = await pool.query(
      'SELECT id, updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3',
      [req.userId, limit, offset]
    );
    res.json({ conversations: rows });
  } catch (e) {
    console.error('[sync] List error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Get a single conversation
app.get('/api/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[a-f0-9-]{36}$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });

    const { rows } = await pool.query('SELECT * FROM conversations WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('[sync] Get error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Upsert a conversation
app.put('/api/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[a-f0-9-]{36}$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });

    const { history, tracked, settings, artifacts } = req.body;

    await pool.query(`
      INSERT INTO conversations (id, user_id, history, tracked, settings, artifacts, updated_at)
      VALUES ($1, $2, COALESCE($3, '[]'::jsonb), COALESCE($4, '{}'::jsonb), COALESCE($5, '{}'::jsonb), COALESCE($6, '{}'::jsonb), NOW())
      ON CONFLICT (id, user_id) DO UPDATE SET
        history = COALESCE($3, conversations.history),
        tracked = COALESCE($4, conversations.tracked),
        settings = COALESCE($5, conversations.settings),
        artifacts = COALESCE($6, conversations.artifacts),
        updated_at = NOW()
    `, [
      id,
      req.userId,
      history ? JSON.stringify(history) : null,
      tracked ? JSON.stringify(tracked) : null,
      settings ? JSON.stringify(settings) : null,
      artifacts ? JSON.stringify(artifacts) : null,
    ]);

    res.json({ ok: true });
  } catch (e) {
    console.error('[sync] Upsert error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Bulk sync — push multiple conversations at once
app.put('/api/sync', async (req, res) => {
  try {
    const { conversations } = req.body;
    if (!Array.isArray(conversations)) return res.status(400).json({ error: 'Expected conversations array' });
    if (conversations.length > 100) return res.status(400).json({ error: 'Max 100 conversations per sync' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const conv of conversations) {
        if (!conv.id || !/^[a-f0-9-]{36}$/.test(conv.id)) continue;
        await client.query(`
          INSERT INTO conversations (id, user_id, history, tracked, settings, artifacts, updated_at)
          VALUES ($1, $2, COALESCE($3, '[]'::jsonb), COALESCE($4, '{}'::jsonb), COALESCE($5, '{}'::jsonb), COALESCE($6, '{}'::jsonb), NOW())
          ON CONFLICT (id, user_id) DO UPDATE SET
            history = COALESCE($3, conversations.history),
            tracked = COALESCE($4, conversations.tracked),
            settings = COALESCE($5, conversations.settings),
            artifacts = COALESCE($6, conversations.artifacts),
            updated_at = NOW()
        `, [
          conv.id,
          req.userId,
          conv.history ? JSON.stringify(conv.history) : null,
          conv.tracked ? JSON.stringify(conv.tracked) : null,
          conv.settings ? JSON.stringify(conv.settings) : null,
          conv.artifacts ? JSON.stringify(conv.artifacts) : null,
        ]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ ok: true, synced: conversations.length });
  } catch (e) {
    console.error('[sync] Bulk sync error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Pull conversations updated after a given timestamp
app.get('/api/sync', async (req, res) => {
  try {
    const since = req.query.since || '1970-01-01T00:00:00Z';
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const { rows } = await pool.query(
      'SELECT * FROM conversations WHERE user_id = $1 AND updated_at > $2 ORDER BY updated_at ASC LIMIT $3',
      [req.userId, since, limit]
    );
    res.json({ conversations: rows });
  } catch (e) {
    console.error('[sync] Pull error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Delete a conversation
app.delete('/api/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[a-f0-9-]{36}$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });
    await pool.query('DELETE FROM conversations WHERE id = $1 AND user_id = $2', [id, req.userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[sync] Delete error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ---------------------------------------------------------------------------
// Memory endpoints
// ---------------------------------------------------------------------------

// List all memories for user
app.get('/api/memories', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, text, created_at FROM memories WHERE user_id = $1 ORDER BY created_at ASC',
      [req.userId]
    );
    res.json({ memories: rows });
  } catch (e) {
    console.error('[sync] Memories list error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Get memories formatted as markdown (for system prompt injection)
app.get('/api/memories/formatted', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT text, created_at FROM memories WHERE user_id = $1 ORDER BY created_at ASC',
      [req.userId]
    );
    if (rows.length === 0) {
      return res.json({ formatted: '', count: 0 });
    }
    const formatted = rows.map(r => {
      const date = new Date(r.created_at).toISOString().split('T')[0];
      return `[${date}] - ${r.text}`;
    }).join('\n');
    res.json({ formatted, count: rows.length });
  } catch (e) {
    console.error('[sync] Memories formatted error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Add a memory
app.post('/api/memories', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.length < 1 || text.length > 200) {
      return res.status(400).json({ error: 'text required, max 200 chars' });
    }
    const { rows } = await pool.query(
      'INSERT INTO memories (user_id, text) VALUES ($1, $2) RETURNING id, text, created_at',
      [req.userId, text.trim()]
    );
    res.json({ ok: true, memory: rows[0] });
  } catch (e) {
    console.error('[sync] Memory add error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Replace a memory
app.put('/api/memories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.length < 1 || text.length > 200) {
      return res.status(400).json({ error: 'text required, max 200 chars' });
    }
    const { rowCount } = await pool.query(
      'UPDATE memories SET text = $1 WHERE id = $2 AND user_id = $3',
      [text.trim(), id, req.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[sync] Memory replace error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Delete a memory
app.delete('/api/memories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    await pool.query('DELETE FROM memories WHERE id = $1 AND user_id = $2', [id, req.userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[sync] Memory delete error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ---------------------------------------------------------------------------
// Conversation search endpoints
// ---------------------------------------------------------------------------

// Full-text search conversations by keyword
app.get('/api/conversations/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.status(400).json({ error: 'Query too short' });
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);

    // Search in history JSONB for text content
    const { rows } = await pool.query(`
      SELECT id, updated_at,
        (SELECT string_agg(elem->>'content', ' ')
         FROM jsonb_array_elements(history) AS elem
         WHERE elem->>'content' IS NOT NULL
         LIMIT 5
        ) AS snippet
      FROM conversations
      WHERE user_id = $1
        AND history::text ILIKE '%' || $2 || '%'
      ORDER BY updated_at DESC
      LIMIT $3
    `, [req.userId, q, limit]);

    res.json({ results: rows });
  } catch (e) {
    console.error('[sync] Search error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Time-based conversation retrieval (for recent_chats tool)
app.get('/api/conversations/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const before = req.query.before || new Date().toISOString();
    const after = req.query.after || '1970-01-01T00:00:00Z';
    const order = req.query.sort_order === 'asc' ? 'ASC' : 'DESC';

    const { rows } = await pool.query(`
      SELECT id, updated_at,
        (SELECT elem->>'content'
         FROM jsonb_array_elements(history) AS elem
         WHERE elem->>'role' = 'user'
         LIMIT 1
        ) AS first_message
      FROM conversations
      WHERE user_id = $1 AND updated_at < $2 AND updated_at > $3
      ORDER BY updated_at ${order}
      LIMIT $4
    `, [req.userId, before, after, limit]);

    res.json({ conversations: rows });
  } catch (e) {
    console.error('[sync] Recent error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ---------------------------------------------------------------------------
// Skills endpoints
// ---------------------------------------------------------------------------

const SKILL_SELECT_FIELDS = `
  id,
  user_id,
  name,
  description,
  prompt,
  enabled,
  created_at,
  updated_at,
  creator_type,
  partition_by,
  is_public_provisioned,
  user_invocable,
  is_shared,
  files
`;

async function listSkillsForUser(userId, partitionBy) {
  const params = [userId];
  const where = ['user_id = $1'];

  if (partitionBy) {
    params.push(partitionBy);
    where.push(`partition_by = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT ${SKILL_SELECT_FIELDS} FROM skills WHERE ${where.join(' AND ')} ORDER BY updated_at DESC, created_at ASC`,
    params
  );

  return rows;
}

async function getSkillById(userId, skillId) {
  const { rows } = await pool.query(
    `SELECT ${SKILL_SELECT_FIELDS} FROM skills WHERE id = $1 AND user_id = $2`,
    [skillId, userId]
  );

  return rows[0] || null;
}

async function upsertSkillRow({
  userId,
  skillId,
  name,
  description,
  instructions,
  enabled = true,
  partitionBy = 'user',
  creatorType = 'user',
  isPublicProvisioned = false,
  userInvocable = true,
  isShared = false,
  files = [],
}) {
  const { rows } = await pool.query(`
    INSERT INTO skills (
      id,
      user_id,
      name,
      description,
      prompt,
      enabled,
      updated_at,
      creator_type,
      partition_by,
      is_public_provisioned,
      user_invocable,
      is_shared,
      files
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10, $11, $12::jsonb)
    ON CONFLICT (id, user_id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      prompt = EXCLUDED.prompt,
      enabled = EXCLUDED.enabled,
      updated_at = NOW(),
      creator_type = EXCLUDED.creator_type,
      partition_by = EXCLUDED.partition_by,
      is_public_provisioned = EXCLUDED.is_public_provisioned,
      user_invocable = EXCLUDED.user_invocable,
      is_shared = EXCLUDED.is_shared,
      files = EXCLUDED.files
    RETURNING ${SKILL_SELECT_FIELDS}
  `, [
    skillId,
    userId,
    name,
    description,
    instructions,
    enabled,
    creatorType,
    partitionBy,
    isPublicProvisioned,
    userInvocable,
    isShared,
    JSON.stringify(files),
  ]);

  return rows[0];
}

async function saveUploadedSkill(req, partitionBy) {
  const file = Array.isArray(req.files) ? req.files[0] : null;
  if (!file || !file.buffer) {
    return { status: 400, error: 'skill file required' };
  }

  const requestedName = typeof req.query.check_skill_name === 'string' && req.query.check_skill_name.trim()
    ? req.query.check_skill_name.trim()
    : inferSkillNameFromFilename(file.originalname);
  const nameValidation = validateNewSkillName(requestedName);
  if (!nameValidation.ok) {
    return { status: 400, error: nameValidation.error };
  }

  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  if (description.length > 2000) {
    return { status: 400, error: 'description max 2000 chars' };
  }

  let extracted;
  try {
    extracted = await extractSkillArchive(file.buffer);
  } catch (e) {
    return { status: 400, error: e.message || 'invalid skill archive' };
  }

  const existing = await getSkillById(req.userId, nameValidation.value.skillId);
  if (existing && req.query.overwrite !== 'true') {
    return { status: 409, error: 'Skill already exists' };
  }

  const skill = await upsertSkillRow({
    userId: req.userId,
    skillId: nameValidation.value.skillId,
    name: nameValidation.value.name,
    description,
    instructions: extracted.instructions,
    enabled: existing ? existing.enabled : true,
    partitionBy,
    creatorType: existing?.creator_type || 'user',
    isPublicProvisioned: existing?.is_public_provisioned === true,
    userInvocable: existing?.user_invocable !== false,
    isShared: existing?.is_shared === true,
    files: extracted.files,
  });

  return { status: 200, skill };
}

// List all skills for user
app.get('/api/skills', async (req, res) => {
  try {
    const rows = await listSkillsForUser(req.userId);
    res.json({ skills: rows });
  } catch (e) {
    console.error('[sync] Skills list error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/skills/list-skills', async (req, res) => {
  try {
    const rows = await listSkillsForUser(req.userId, 'user');
    res.json({ skills: rows.map(mapSkillRowToClaudeSkill) });
  } catch (e) {
    console.error('[sync] Skills list-skills error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/skills/list-org-skills', async (req, res) => {
  try {
    const rows = await listSkillsForUser(req.userId, 'organization');
    res.json({ skills: rows.map(mapSkillRowToClaudeSkill) });
  } catch (e) {
    console.error('[sync] Skills list-org-skills error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/skills/download-dot-skill-file', async (req, res) => {
  try {
    const skillIdResult = validateSkillId(req.query.skill_id);
    if (!skillIdResult.ok) return res.status(400).json({ error: skillIdResult.error });

    const skill = await getSkillById(req.userId, skillIdResult.value);
    if (!skill) return res.status(404).json({ error: 'Not found' });

    const archive = await buildSkillArchive(skill);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${skill.id}.skill"`);
    res.send(archive);
  } catch (e) {
    console.error('[sync] Skills download error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/skills/upload-skill', upload.any(), async (req, res) => {
  try {
    const result = await saveUploadedSkill(req, 'user');
    if (result.error) return res.status(result.status).json({ error: result.error });

    res.json(mapSkillRowToClaudeSkill(result.skill));
  } catch (e) {
    console.error('[sync] Skills upload-skill error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/skills/upload-org-skill', upload.any(), async (req, res) => {
  try {
    const result = await saveUploadedSkill(req, 'organization');
    if (result.error) return res.status(result.status).json({ error: result.error });

    res.json(mapSkillRowToClaudeSkill(result.skill));
  } catch (e) {
    console.error('[sync] Skills upload-org-skill error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/skills/create-simple-skill', async (req, res) => {
  try {
    const validation = validateSimpleSkillInput(req.body);
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    const { skillId, name, description, instructions } = validation.value;
    const existing = await getSkillById(req.userId, skillId);
    if (existing) return res.status(409).json({ error: 'Skill already exists' });

    const skill = await upsertSkillRow({
      userId: req.userId,
      skillId,
      name,
      description,
      instructions,
    });

    res.json(mapSkillRowToClaudeSkill(skill));
  } catch (e) {
    console.error('[sync] Skills create-simple-skill error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/skills/edit-simple-skill', async (req, res) => {
  try {
    const skillIdResult = validateSkillId(req.body?.skill_id);
    if (!skillIdResult.ok) return res.status(400).json({ error: skillIdResult.error });

    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const instructions = typeof req.body?.instructions === 'string' ? req.body.instructions.trim() : '';
    if (description.length > 2000) return res.status(400).json({ error: 'description max 2000 chars' });
    if (!instructions || instructions.length > 200000) {
      return res.status(400).json({ error: 'instructions required, max 200000 chars' });
    }

    const existing = await getSkillById(req.userId, skillIdResult.value);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const skill = await upsertSkillRow({
      userId: req.userId,
      skillId: existing.id,
      name: existing.name,
      description,
      instructions,
      enabled: existing.enabled,
      partitionBy: existing.partition_by,
      creatorType: existing.creator_type,
      isPublicProvisioned: existing.is_public_provisioned,
      userInvocable: existing.user_invocable,
      isShared: existing.is_shared,
      files: existing.files,
    });

    res.json(mapSkillRowToClaudeSkill(skill));
  } catch (e) {
    console.error('[sync] Skills edit-simple-skill error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/skills/enable-skill', async (req, res) => {
  try {
    const skillIdResult = validateSkillId(req.body?.skill_id);
    if (!skillIdResult.ok) return res.status(400).json({ error: skillIdResult.error });

    const { rows } = await pool.query(
      `UPDATE skills SET enabled = true, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING ${SKILL_SELECT_FIELDS}`,
      [skillIdResult.value, req.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

    res.json(mapSkillRowToClaudeSkill(rows[0]));
  } catch (e) {
    console.error('[sync] Skills enable-skill error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/skills/disable-skill', async (req, res) => {
  try {
    const skillIdResult = validateSkillId(req.body?.skill_id);
    if (!skillIdResult.ok) return res.status(400).json({ error: skillIdResult.error });

    const { rows } = await pool.query(
      `UPDATE skills SET enabled = false, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING ${SKILL_SELECT_FIELDS}`,
      [skillIdResult.value, req.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

    res.json(mapSkillRowToClaudeSkill(rows[0]));
  } catch (e) {
    console.error('[sync] Skills disable-skill error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/skills/delete-skill', async (req, res) => {
  try {
    const skillIdResult = validateSkillId(req.body?.skill_id);
    if (!skillIdResult.ok) return res.status(400).json({ error: skillIdResult.error });

    await pool.query('DELETE FROM skills WHERE id = $1 AND user_id = $2', [skillIdResult.value, req.userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[sync] Skills delete-skill error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/skills/delete-org-skill', async (req, res) => {
  try {
    const skillIdResult = validateSkillId(req.body?.skill_id);
    if (!skillIdResult.ok) return res.status(400).json({ error: skillIdResult.error });

    await pool.query(
      'DELETE FROM skills WHERE id = $1 AND user_id = $2 AND partition_by = $3',
      [skillIdResult.value, req.userId, 'organization']
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[sync] Skills delete-org-skill error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/skills/duplicate-skill', async (req, res) => {
  try {
    const sourceSkillId = validateSkillId(req.body?.skill_id);
    if (!sourceSkillId.ok) return res.status(400).json({ error: sourceSkillId.error });

    const newName = validateNewSkillName(req.body?.new_name);
    if (!newName.ok) return res.status(400).json({ error: newName.error });

    const sourceSkill = await getSkillById(req.userId, sourceSkillId.value);
    if (!sourceSkill) return res.status(404).json({ error: 'Not found' });

    const existing = await getSkillById(req.userId, newName.value.skillId);
    if (existing) return res.status(409).json({ error: 'Skill already exists' });

    const skill = await upsertSkillRow({
      userId: req.userId,
      skillId: newName.value.skillId,
      name: newName.value.name,
      description: sourceSkill.description,
      instructions: sourceSkill.prompt,
      enabled: sourceSkill.enabled,
      partitionBy: sourceSkill.partition_by,
      creatorType: sourceSkill.creator_type,
      isPublicProvisioned: sourceSkill.is_public_provisioned,
      userInvocable: sourceSkill.user_invocable,
      isShared: sourceSkill.is_shared,
      files: sourceSkill.files,
    });

    res.json(mapSkillRowToClaudeSkill(skill));
  } catch (e) {
    console.error('[sync] Skills duplicate-skill error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/skills/rename-skill', async (req, res) => {
  try {
    const sourceSkillId = validateSkillId(req.body?.skill_id);
    if (!sourceSkillId.ok) return res.status(400).json({ error: sourceSkillId.error });

    const newName = validateNewSkillName(req.body?.new_name);
    if (!newName.ok) return res.status(400).json({ error: newName.error });

    const sourceSkill = await getSkillById(req.userId, sourceSkillId.value);
    if (!sourceSkill) return res.status(404).json({ error: 'Not found' });

    if (newName.value.skillId !== sourceSkill.id) {
      const existing = await getSkillById(req.userId, newName.value.skillId);
      if (existing) return res.status(409).json({ error: 'Skill already exists' });
    }

    const { rows } = await pool.query(`
      UPDATE skills
      SET id = $1, name = $2, updated_at = NOW()
      WHERE id = $3 AND user_id = $4
      RETURNING ${SKILL_SELECT_FIELDS}
    `, [newName.value.skillId, newName.value.name, sourceSkill.id, req.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

    res.json(mapSkillRowToClaudeSkill(rows[0]));
  } catch (e) {
    console.error('[sync] Skills rename-skill error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/skills/:id', async (req, res) => {
  try {
    const skillIdResult = validateSkillId(req.params.id);
    if (!skillIdResult.ok) return res.status(400).json({ error: skillIdResult.error });

    const skill = await getSkillById(req.userId, skillIdResult.value);
    if (!skill) return res.status(404).json({ error: 'Not found' });

    res.json(buildSkillDetail(skill));
  } catch (e) {
    console.error('[sync] Skill get error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Upsert a skill
app.put('/api/skills/:id', async (req, res) => {
  try {
    const skillIdResult = validateSkillId(req.params.id);
    if (!skillIdResult.ok) return res.status(400).json({ error: skillIdResult.error });

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const partitionBy = typeof req.body?.partition_by === 'string' ? req.body.partition_by.trim() : 'user';

    if (!name) return res.status(400).json({ error: 'name required' });
    if (!isValidPartition(partitionBy)) return res.status(400).json({ error: 'invalid partition_by' });

    const skill = await upsertSkillRow({
      userId: req.userId,
      skillId: skillIdResult.value,
      name,
      description,
      instructions: prompt,
      enabled: req.body?.enabled !== false,
      partitionBy,
      creatorType: typeof req.body?.creator_type === 'string' ? req.body.creator_type : 'user',
      isPublicProvisioned: req.body?.is_public_provisioned === true,
      userInvocable: req.body?.user_invocable !== false,
      isShared: req.body?.is_shared === true,
      files: Array.isArray(req.body?.files) ? req.body.files : [],
    });

    res.json({ ok: true, skill: buildSkillDetail(skill) });
  } catch (e) {
    console.error('[sync] Skill upsert error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Delete a skill
app.delete('/api/skills/:id', async (req, res) => {
  try {
    const skillIdResult = validateSkillId(req.params.id);
    if (!skillIdResult.ok) return res.status(400).json({ error: skillIdResult.error });

    await pool.query('DELETE FROM skills WHERE id = $1 AND user_id = $2', [skillIdResult.value, req.userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[sync] Skill delete error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ---------------------------------------------------------------------------
// Projects endpoints
// ---------------------------------------------------------------------------

// List projects
app.get('/api/projects', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.userId]
    );
    res.json({ projects: rows });
  } catch (e) {
    console.error('[sync] Projects list error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Get a project
app.get('/api/projects/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('[sync] Project get error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Upsert a project
app.put('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, instructions, color, links } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    await pool.query(`
      INSERT INTO projects (id, user_id, name, description, instructions, color, links, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (id, user_id) DO UPDATE SET
        name = $3, description = $4, instructions = $5, color = $6, links = $7, updated_at = NOW()
    `, [
      id, req.userId, name, description || '', instructions || '',
      color || '#6c63ff', JSON.stringify(links || []),
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[sync] Project upsert error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Delete a project
app.delete('/api/projects/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[sync] Project delete error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[sync] Server listening on :${PORT}`);
  });
}).catch(e => {
  console.error('[sync] Failed to initialize:', e);
  process.exit(1);
});
