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
  const ccp = isPlainObject(body?.create_conversation_params) ? body.create_conversation_params : {};
  if (body?.paprika_mode || ccp.paprika_mode) settings.paprika_mode = body.paprika_mode || ccp.paprika_mode;
  if (body?.model || ccp.model) settings.model = body.model || ccp.model;
  if (body?.compass_mode || ccp.compass_mode) settings.compass_mode = body.compass_mode || ccp.compass_mode;
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
      const settingsPatch = buildSettingsPatch(body);
      if (body.model) settingsPatch.model = body.model;
      const row = await repositories.conversations.createConversation(
        createConversationContext(req, conversationId),
        {
          title,
          settings: settingsPatch,
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

  app.post('/api/organizations/:orgId/chat_conversations/:convId/title', async (req, res) => {
    if (!repositories?.conversations) {
      res.status(500).json({ error: 'Conversations repository unavailable' });
      return;
    }

    const body = isPlainObject(req.body) ? req.body : {};
    let title = typeof body.title === 'string'
      ? body.title
      : typeof body.name === 'string'
        ? body.name
        : '';

    if (!title) {
      try {
        const conv = await repositories.conversations.getConversation(
          createConversationContext(req, req.params.convId)
        );
        if (conv && Array.isArray(conv.history) && conv.history.length > 0) {
          const messages = conv.history.slice(0, 4).map((e) => {
            const text = typeof e.content === 'string'
              ? e.content
              : Array.isArray(e.content)
                ? e.content.filter((b) => b && b.type === 'text').map((b) => b.text).join(' ')
                : '';
            return { role: e.role === 'assistant' ? 'assistant' : 'user', content: text.slice(0, 300) };
          }).filter((m) => m.content);

          if (messages.length > 0) {
            const endpoint = typeof req.headers['x-litellm-endpoint'] === 'string' ? req.headers['x-litellm-endpoint'].trim() : '';
            const apiKey = typeof req.headers['x-litellm-key'] === 'string' ? req.headers['x-litellm-key'].trim() : '';
            if (endpoint && apiKey) {
              const fetchImpl = typeof fetch !== 'undefined' ? fetch : require('node:fetch');
              const titleResp = await fetchImpl(`${endpoint.replace(/\/+$/, '')}/v1/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({
                  model: 'claude-haiku-4-5-20251001',
                  max_tokens: 30,
                  messages: [
                    ...messages,
                    { role: 'user', content: 'Generate a short title (3-6 words) for this conversation. Reply with ONLY the title, nothing else.' },
                  ],
                }),
              });
              if (titleResp.ok) {
                const titleData = await titleResp.json();
                const generated = titleData?.content?.[0]?.text?.trim().replace(/^["']|["']$/g, '') || '';
                if (generated && generated.length <= 80) title = generated;
              }
            }
          }

          if (!title) {
            const firstText = messages[0]?.content || '';
            title = firstText.slice(0, 60) || 'Untitled';
            if (firstText.length > 60) title += '...';
          }
        }
      } catch (error) { /* ignore */ }
    }

    if (!title) title = 'Untitled';

    try {
      const row = await repositories.conversations.updateConversationSettings(
        createConversationContext(req, req.params.convId),
        { title }
      );
      res.json(buildConversationMetadataResponse(row));
    } catch (error) {
      res.status(500).json({ error: 'Failed to update conversation title' });
    }
  });

  app.get('/api/organizations/:orgId/chat_conversations_v:version', async (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('ETag', `W/"${Date.now()}"`);

    if (req.query.starred === 'true') {
      res.json({ data: [] });
      return;
    }

    if (!repositories?.conversations) {
      res.json({ data: [] });
      return;
    }

    try {
      const rows = await repositories.conversations.listRecentConversations(
        { userId: req.userId, orgId: req.params.orgId },
        { limit: req.query.limit || 50 }
      );
      res.json({ data: rows.map((row) => ({
        uuid: row.id,
        name: row.title || '',
        summary: '',
        model: 'claude-sonnet-4-6',
        created_at: row.updated_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
        settings: {},
        is_starred: false,
        is_temporary: false,
        project_uuid: null,
        session_id: null,
        platform: 'CLAUDE_AI',
        current_leaf_message_uuid: null,
      })) });
    } catch (error) {
      res.json({ data: [] });
    }
  });

  app.get('/api/organizations/:orgId/chat_conversations', async (req, res) => {
    if (!repositories?.conversations) {
      res.json([]);
      return;
    }

    try {
      const rows = await repositories.conversations.listRecentConversations(
        { userId: req.userId, orgId: req.params.orgId },
        { limit: req.query.limit || 50 }
      );
      res.json(rows.map((row) => ({
        uuid: row.id,
        name: row.title || '',
        created_at: row.updated_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
      })));
    } catch (error) {
      res.json([]);
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
  app.delete('/api/organizations/:orgId/chat_conversations/:convId', async (req, res) => {
    if (!repositories?.conversations) {
      res.status(500).json({ error: 'Conversations repository unavailable' });
      return;
    }

    try {
      await repositories.conversations.deleteConversation(
        createConversationContext(req, req.params.convId)
      );
      res.json({ uuid: req.params.convId, deleted: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete conversation' });
    }
  });

  app.post('/api/organizations/:orgId/chat_conversations/:convId/tool_result', async (req, res) => {
    res.json({ ok: true });
  });
}

module.exports = {
  registerConversationRoutes,
};
