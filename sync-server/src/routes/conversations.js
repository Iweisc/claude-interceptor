'use strict';

const crypto = require('node:crypto');

const {
  buildConversationMetadataResponse,
  buildTreeResponse,
} = require('../services/claude-shapes');

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createConversationContext(req, conversationId) {
  return {
    userId: req.userId,
    orgId: req.params.orgId,
    conversationId,
  };
}

function buildSettingsPatch(body) {
  const settings = isPlainObject(body?.settings) ? { ...body.settings } : {};
  if (body?.is_temporary === true) {
    settings.is_temporary = true;
  } else if (body?.is_temporary === false) {
    settings.is_temporary = false;
  }
  return settings;
}

function registerConversationRoutes(app, repositories) {
  app.post('/api/organizations/:orgId/chat_conversations', async (req, res) => {
    if (!repositories?.conversations) {
      res.status(500).json({ error: 'Conversations repository unavailable' });
      return;
    }

    const body = isPlainObject(req.body) ? req.body : {};
    const conversationId = typeof body.uuid === 'string' && body.uuid.trim()
      ? body.uuid.trim()
      : crypto.randomUUID();
    const title = typeof body.name === 'string'
      ? body.name
      : typeof body.title === 'string'
        ? body.title
        : '';

    try {
      const row = await repositories.conversations.createConversation(
        createConversationContext(req, conversationId),
        {
          title,
          settings: buildSettingsPatch(body),
        }
      );
      res.json(buildConversationMetadataResponse(row));
    } catch (error) {
      res.status(500).json({ error: 'Failed to create conversation' });
    }
  });

  app.put('/api/organizations/:orgId/chat_conversations/:convId', async (req, res) => {
    if (!repositories?.conversations) {
      res.status(500).json({ error: 'Conversations repository unavailable' });
      return;
    }

    const body = isPlainObject(req.body) ? req.body : {};
    const title = typeof body.name === 'string'
      ? body.name
      : typeof body.title === 'string'
        ? body.title
        : undefined;

    try {
      const row = await repositories.conversations.updateConversationSettings(
        createConversationContext(req, req.params.convId),
        {
          ...buildSettingsPatch(body),
          ...(title !== undefined ? { title } : {}),
        }
      );
      res.json(buildConversationMetadataResponse(row));
    } catch (error) {
      res.status(500).json({ error: 'Failed to update conversation' });
    }
  });

  app.get('/api/organizations/:orgId/chat_conversations/:convId', async (req, res) => {
    if (!repositories?.conversations) {
      res.status(500).json({ error: 'Conversations repository unavailable' });
      return;
    }

    try {
      const row = await repositories.conversations.getConversation(
        createConversationContext(req, req.params.convId)
      );
      if (!row) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      if (req.query.tree === 'True') {
        res.json(buildTreeResponse(row));
        return;
      }

      res.json(buildConversationMetadataResponse(row));
    } catch (error) {
      res.status(500).json({ error: 'Failed to load conversation' });
    }
  });
}

module.exports = {
  registerConversationRoutes,
};
