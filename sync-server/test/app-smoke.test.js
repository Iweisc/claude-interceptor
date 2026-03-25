const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');

test('health endpoint responds from the modular app bootstrap', async () => {
  const app = createApp({
    config: { corsOrigin: 'https://claude.ai' },
    repositories: {},
    services: {},
  });

  const server = app.listen(0);

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('rate-limited responses still include claude cors headers', async () => {
  const app = createApp({
    config: { corsOrigin: 'https://claude.ai' },
    repositories: {},
    services: {},
  });

  const server = app.listen(0);

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    let response;

    for (let attempt = 0; attempt <= 120; attempt += 1) {
      response = await fetch(`${baseUrl}/health`, {
        headers: { origin: 'https://claude.ai' },
      });
    }

    assert.equal(response.status, 429);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://claude.ai');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
