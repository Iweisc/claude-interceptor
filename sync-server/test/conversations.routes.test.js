const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { createSessionIdentityCache } = require('../src/services/session-identity');

function buildConversationRepositories() {
  return {
    conversations: {
      async createConversation(context, input) {
        return {
          id: context.conversationId,
          org_id: context.orgId,
          title: input.title || '',
          settings: input.settings || {},
          history: [],
          artifacts: {},
        };
      },
      async updateConversationSettings(context, settingsPatch) {
        return {
          id: context.conversationId,
          org_id: context.orgId,
          title: settingsPatch.title || '',
          settings: settingsPatch,
          history: [],
          artifacts: {},
        };
      },
      async getConversation(context) {
        return {
          id: context.conversationId,
          org_id: context.orgId,
          title: 'Stored chat',
          settings: { paprika_mode: 'extended', compass_mode: 'advanced' },
          history: [
            {
              role: 'user',
              uuid: 'u1',
              created_at: '2026-03-23T00:00:00.000Z',
              content: 'hello',
            },
            {
              role: 'assistant',
              uuid: 'a1',
              created_at: '2026-03-23T00:00:01.000Z',
              content: 'world',
            },
          ],
          artifacts: {},
        };
      },
    },
  };
}

function buildSessionCache() {
  const cache = createSessionIdentityCache({ ttlMs: 60_000 });
  cache.set('sessionKey=abc123', 'user@example.com');
  return cache;
}

async function withServer(app, callback) {
  const server = app.listen(0);

  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('post conversation returns claude-facing metadata with settings', async () => {
  const app = createApp({
    config: {
      corsOrigin: 'https://claude.ai',
      claudeUpstreamBaseUrl: 'https://claude.ai',
      requestTimeoutMs: 5_000,
      sessionCacheTtlMs: 60_000,
    },
    repositories: buildConversationRepositories(),
    services: {
      sessionIdentityCache: buildSessionCache(),
      fetchImpl: async () => { throw new Error('unexpected upstream fetch'); },
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/organizations/org-1/chat_conversations`, {
      method: 'POST',
      headers: {
        origin: 'https://claude.ai',
        'content-type': 'application/json',
        'x-forward-cookie': 'sessionKey=abc123',
      },
      body: JSON.stringify({
        uuid: 'conv-1',
        name: 'Stored chat',
        settings: { paprika_mode: 'extended' },
        is_temporary: true,
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.uuid, 'conv-1');
    assert.equal(body.settings.paprika_mode, 'extended');
    assert.equal(body.is_temporary, true);
  });
});

test('put conversation returns updated settings metadata', async () => {
  const app = createApp({
    config: {
      corsOrigin: 'https://claude.ai',
      claudeUpstreamBaseUrl: 'https://claude.ai',
      requestTimeoutMs: 5_000,
      sessionCacheTtlMs: 60_000,
    },
    repositories: buildConversationRepositories(),
    services: {
      sessionIdentityCache: buildSessionCache(),
      fetchImpl: async () => { throw new Error('unexpected upstream fetch'); },
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/organizations/org-1/chat_conversations/conv-1`, {
      method: 'PUT',
      headers: {
        origin: 'https://claude.ai',
        'content-type': 'application/json',
        'x-forward-cookie': 'sessionKey=abc123',
      },
      body: JSON.stringify({
        settings: { paprika_mode: 'extended', compass_mode: 'advanced' },
        is_temporary: true,
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.uuid, 'conv-1');
    assert.equal(body.settings.compass_mode, 'advanced');
    assert.equal(body.is_temporary, true);
  });
});

test('title route updates conversation metadata for proxy-owned conversations', async () => {
  const app = createApp({
    config: {
      corsOrigin: 'https://claude.ai',
      claudeUpstreamBaseUrl: 'https://claude.ai',
      requestTimeoutMs: 5_000,
      sessionCacheTtlMs: 60_000,
    },
    repositories: buildConversationRepositories(),
    services: {
      sessionIdentityCache: buildSessionCache(),
      fetchImpl: async () => { throw new Error('unexpected upstream fetch'); },
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/organizations/org-1/chat_conversations/conv-1/title`, {
      method: 'POST',
      headers: {
        origin: 'https://claude.ai',
        'content-type': 'application/json',
        'x-forward-cookie': 'sessionKey=abc123',
      },
      body: JSON.stringify({ title: 'Meow skill' }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.uuid, 'conv-1');
    assert.equal(body.name, 'Meow skill');
  });
});

test('tree=True responses return chat_messages from stored history', async () => {
  const app = createApp({
    config: {
      corsOrigin: 'https://claude.ai',
      claudeUpstreamBaseUrl: 'https://claude.ai',
      requestTimeoutMs: 5_000,
      sessionCacheTtlMs: 60_000,
    },
    repositories: buildConversationRepositories(),
    services: {
      sessionIdentityCache: buildSessionCache(),
      fetchImpl: async () => { throw new Error('unexpected upstream fetch'); },
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/organizations/org-1/chat_conversations/conv-1?tree=True`, {
      headers: {
        origin: 'https://claude.ai',
        'x-forward-cookie': 'sessionKey=abc123',
      },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.chat_messages.length, 2);
    assert.equal(body.chat_messages[0].sender, 'human');
    assert.equal(body.chat_messages[1].sender, 'assistant');
    assert.equal(body.current_leaf_message_uuid, 'a1');
  });
});
