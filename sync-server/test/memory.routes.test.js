const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { createSessionIdentityCache } = require('../src/services/session-identity');

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

test('memory route returns ordered rows from the memories table', async () => {
  const app = createApp({
    config: {
      corsOrigin: 'https://claude.ai',
      claudeUpstreamBaseUrl: 'https://claude.ai',
      requestTimeoutMs: 5_000,
      sessionCacheTtlMs: 60_000,
    },
    repositories: {
      memories: {
        async listMemories() {
          return [
            { text: 'prefers terse replies', created_at: '2026-03-23T00:00:00.000Z' },
            { text: 'works in Node', created_at: '2026-03-24T00:00:00.000Z' },
          ];
        },
      },
    },
    services: {
      sessionIdentityCache: buildSessionCache(),
      fetchImpl: async () => { throw new Error('unexpected upstream fetch'); },
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/organizations/org-1/memory`, {
      headers: {
        origin: 'https://claude.ai',
        'x-forward-cookie': 'sessionKey=abc123',
      },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.memory, '');
    assert.deepEqual(body.controls, [
      '[2026-03-23] - prefers terse replies\n[2026-03-24] - works in Node',
    ]);
  });
});

test('subscription details route returns the fixed inactive payload', async () => {
  const app = createApp({
    config: {
      corsOrigin: 'https://claude.ai',
      claudeUpstreamBaseUrl: 'https://claude.ai',
      requestTimeoutMs: 5_000,
      sessionCacheTtlMs: 60_000,
    },
    services: {
      sessionIdentityCache: buildSessionCache(),
      fetchImpl: async () => { throw new Error('unexpected upstream fetch'); },
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/organizations/org-1/subscription_details`, {
      headers: {
        origin: 'https://claude.ai',
        'x-forward-cookie': 'sessionKey=abc123',
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      subscription: null,
      is_active: false,
    });
  });
});
