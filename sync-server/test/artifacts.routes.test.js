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

test('artifact download serves persisted file content and tools route is empty', async () => {
  const app = createApp({
    config: {
      corsOrigin: 'https://claude.ai',
      claudeUpstreamBaseUrl: 'https://claude.ai',
      requestTimeoutMs: 5_000,
      sessionCacheTtlMs: 60_000,
    },
    repositories: {
      conversations: {
        async findArtifactByPath(_context, path) {
          if (path === '/mnt/user-data/outputs/demo.js') {
            return {
              content: 'console.log("hi");',
              mimeType: 'application/javascript',
            };
          }
          return null;
        },
      },
    },
    services: {
      sessionIdentityCache: buildSessionCache(),
      fetchImpl: async () => { throw new Error('unexpected upstream fetch'); },
    },
  });

  await withServer(app, async (baseUrl) => {
    const fileResponse = await fetch(`${baseUrl}/wiggle/download-file?path=%2Fmnt%2Fuser-data%2Foutputs%2Fdemo.js`, {
      headers: {
        origin: 'https://claude.ai',
        'x-forward-cookie': 'sessionKey=abc123',
      },
    });

    assert.equal(fileResponse.status, 200);
    assert.match(fileResponse.headers.get('content-type'), /application\/javascript/);
    assert.equal(await fileResponse.text(), 'console.log("hi");');

    const toolsResponse = await fetch(`${baseUrl}/artifacts/wiggle_artifact/demo/tools`, {
      headers: {
        origin: 'https://claude.ai',
        'x-forward-cookie': 'sessionKey=abc123',
      },
    });

    assert.equal(toolsResponse.status, 200);
    assert.deepEqual(await toolsResponse.json(), { tools: [] });
  });
});
