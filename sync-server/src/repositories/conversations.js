'use strict';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeConversationRow(row = {}) {
  return {
    ...row,
    org_id: typeof row.org_id === 'string' ? row.org_id : '',
    title: typeof row.title === 'string' ? row.title : '',
    history: Array.isArray(row.history) ? row.history : [],
    settings: isPlainObject(row.settings) ? row.settings : {},
    artifacts: isPlainObject(row.artifacts) ? row.artifacts : {},
    tracked: isPlainObject(row.tracked) ? row.tracked : {},
  };
}

function appendHistoryTurn(row, turn) {
  const normalized = normalizeConversationRow(row);
  return {
    ...normalized,
    history: [...normalized.history, turn],
  };
}

function removeLastAssistantHistoryTurn(row) {
  const normalized = normalizeConversationRow(row);
  const history = [...normalized.history];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === 'assistant') {
      history.splice(index, 1);
      break;
    }
  }

  return {
    ...normalized,
    history,
  };
}

function replaceLastAssistantHistoryTurn(row, replacementTurn) {
  const normalized = normalizeConversationRow(row);
  const history = [...normalized.history];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === 'assistant') {
      history[index] = replacementTurn;
      break;
    }
  }

  return {
    ...normalized,
    history,
  };
}

function getQueryable(pool, options = {}) {
  return options.client || pool;
}

async function loadConversation(pool, context, options = {}) {
  const queryable = getQueryable(pool, options);
  const { rows } = await queryable.query(
    `SELECT *
     FROM conversations
     WHERE id = $1 AND user_id = $2 AND org_id = $3`,
    [context.conversationId, context.userId, context.orgId]
  );

  return rows[0] ? normalizeConversationRow(rows[0]) : null;
}

async function createConversation(pool, context, input = {}, options = {}) {
  const queryable = getQueryable(pool, options);
  const title = typeof input.title === 'string' ? input.title : '';
  const settings = isPlainObject(input.settings) ? input.settings : {};

  const { rows } = await queryable.query(
    `INSERT INTO conversations (id, user_id, org_id, title, history, settings, artifacts, updated_at)
     VALUES ($1, $2, $3, $4, '[]'::jsonb, $5::jsonb, '{}'::jsonb, NOW())
     ON CONFLICT (id, user_id) DO UPDATE SET
       org_id = EXCLUDED.org_id,
       title = EXCLUDED.title,
       settings = EXCLUDED.settings,
       updated_at = NOW()
     RETURNING *`,
    [context.conversationId, context.userId, context.orgId, title, JSON.stringify(settings)]
  );

  return normalizeConversationRow(rows[0]);
}

async function updateConversation(pool, context, updater, options = {}) {
  const queryable = getQueryable(pool, options);
  const existing = await loadConversation(pool, context, options);
  const next = updater(existing || normalizeConversationRow({
    id: context.conversationId,
    user_id: context.userId,
    org_id: context.orgId,
  }));

  const { rows } = await queryable.query(
    `INSERT INTO conversations (id, user_id, org_id, title, history, settings, artifacts, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, NOW())
     ON CONFLICT (id, user_id) DO UPDATE SET
       org_id = EXCLUDED.org_id,
       title = EXCLUDED.title,
       history = EXCLUDED.history,
       settings = EXCLUDED.settings,
       artifacts = EXCLUDED.artifacts,
       updated_at = NOW()
     RETURNING *`,
    [
      context.conversationId,
      context.userId,
      context.orgId,
      next.title || '',
      JSON.stringify(next.history || []),
      JSON.stringify(next.settings || {}),
      JSON.stringify(next.artifacts || {}),
    ]
  );

  return normalizeConversationRow(rows[0]);
}

function createConversationRepository(pool) {
  return {
    normalizeConversationRow,
    appendHistoryTurn,
    removeLastAssistantHistoryTurn,
    replaceLastAssistantHistoryTurn,
    async getConversation(context, options) {
      return loadConversation(pool, context, options);
    },
    async createConversation(context, input, options) {
      return createConversation(pool, context, input, options);
    },
    async updateConversationSettings(context, settingsPatch, options) {
      const patch = isPlainObject(settingsPatch) ? settingsPatch : {};
      const { title, ...settingsOnly } = patch;
      return updateConversation(pool, context, (row) => ({
        ...row,
        title: typeof title === 'string' ? title : row.title,
        settings: {
          ...row.settings,
          ...settingsOnly,
        },
      }), options);
    },
    async appendUserTurn(context, turn, options) {
      return updateConversation(pool, context, (row) => appendHistoryTurn(row, turn), options);
    },
    async appendAssistantTurn(context, turn, options) {
      return updateConversation(pool, context, (row) => appendHistoryTurn(row, turn), options);
    },
    async replaceLastAssistantTurn(context, turn, options) {
      return updateConversation(pool, context, (row) => replaceLastAssistantHistoryTurn(row, turn), options);
    },
    async removeLastAssistantTurn(context, options) {
      return updateConversation(pool, context, (row) => removeLastAssistantHistoryTurn(row), options);
    },
    async searchConversationHistory(context, search = {}, options = {}) {
      const queryable = getQueryable(pool, options);
      const value = typeof search.query === 'string' ? search.query.trim() : '';
      const limit = Math.min(Number.parseInt(search.limit, 10) || 10, 50);
      const { rows } = await queryable.query(
        `SELECT id, org_id, title, history, updated_at
         FROM conversations
         WHERE user_id = $1
           AND ($2 = '' OR org_id = $2)
           AND history::text ILIKE '%' || $3 || '%'
         ORDER BY updated_at DESC
         LIMIT $4`,
        [context.userId, context.orgId || '', value, limit]
      );
      return rows.map(normalizeConversationRow);
    },
    async listRecentConversations(context, search = {}, options = {}) {
      const queryable = getQueryable(pool, options);
      const limit = Math.min(Number.parseInt(search.limit, 10) || 10, 50);
      const before = search.before || new Date().toISOString();
      const after = search.after || '1970-01-01T00:00:00Z';
      const sortOrder = search.sortOrder === 'asc' ? 'ASC' : 'DESC';
      const { rows } = await queryable.query(
        `SELECT id, org_id, title, history, updated_at
         FROM conversations
         WHERE user_id = $1
           AND ($2 = '' OR org_id = $2)
           AND updated_at < $3
           AND updated_at > $4
         ORDER BY updated_at ${sortOrder}
         LIMIT $5`,
        [context.userId, context.orgId || '', before, after, limit]
      );
      return rows.map(normalizeConversationRow);
    },
    async getArtifactByPath(context, path, options) {
      const row = await loadConversation(pool, context, options);
      if (!row) return null;
      return row.artifacts[path] || null;
    },
    async upsertArtifact(context, path, artifact, options) {
      return updateConversation(pool, context, (row) => ({
        ...row,
        artifacts: {
          ...row.artifacts,
          [path]: artifact,
        },
      }), options);
    },
  };
}

module.exports = {
  appendHistoryTurn,
  createConversationRepository,
  normalizeConversationRow,
  removeLastAssistantHistoryTurn,
  replaceLastAssistantHistoryTurn,
};
