const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { patchAccountPayload, patchBootstrapPayload } = require('../src/services/claude-upstream');
const { createSessionIdentityCache } = require('../src/services/session-identity');

test('account payload is patched and email is preserved', () => {
  const payload = patchAccountPayload({
    email_address: 'user@example.com',
    memberships: [
      {
        organization: {
          capabilities: ['chat'],
          billing_type: 'free',
        },
      },
    ],
  });

  assert.equal(payload.email_address, 'user@example.com');
  assert.equal(payload.memberships[0].organization.billing_type, 'stripe');
  assert.equal(payload.memberships[0].organization.rate_limit_tier, 'claude_pro_2025_06');
  assert.ok(payload.memberships[0].organization.capabilities.includes('claude_pro'));
});

test('bootstrap payload gets pro flags and minimum tiers', () => {
  const payload = patchBootstrapPayload({
    account: {
      memberships: [
        {
          organization: {
            capabilities: ['chat'],
            billing_type: 'free',
          },
        },
      ],
    },
    growthbook: { attributes: { isPro: false } },
    org_growthbook: {
      user: { isPro: false, orgType: 'free' },
      features: {
        modelAccess: {
          defaultValue: {
            models: [{ model_id: 'claude-sonnet', minimum_tier: 'pro' }],
          },
        },
      },
    },
    org_statsig: {
      user: { isPro: false, orgType: 'free' },
    },
    models: [{ name: 'claude-sonnet', minimum_tier: 'pro' }],
  });

  assert.equal(payload.growthbook.attributes.isPro, true);
  assert.equal(payload.org_growthbook.user.isPro, true);
  assert.equal(payload.org_growthbook.user.orgType, 'claude_pro');
  assert.equal(payload.org_statsig.user.isPro, true);
  assert.equal(payload.account.memberships[0].organization.billing_type, 'stripe');
  assert.equal(payload.models[0].minimum_tier, 'free');
  assert.equal(payload.org_growthbook.features.modelAccess.defaultValue.models[0].minimum_tier, 'free');
});

test('account proxy route patches the upstream response and caches the email', async () => {
  const requests = [];
  const sessionIdentityCache = createSessionIdentityCache({ ttlMs: 60_000 });
  const app = createApp({
    config: {
      corsOrigin: 'https://claude.ai',
      claudeUpstreamBaseUrl: 'https://claude.ai',
      requestTimeoutMs: 5_000,
      sessionCacheTtlMs: 60_000,
    },
    services: {
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return new Response(JSON.stringify({
          email_address: 'user@example.com',
          memberships: [
            {
              organization: {
                capabilities: ['chat'],
                billing_type: 'free',
              },
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        });
      },
      sessionIdentityCache,
    },
  });

  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/account`, {
      headers: {
        origin: 'https://claude.ai',
        'x-forward-cookie': 'sessionKey=abc123',
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://claude.ai');

    const body = await response.json();
    assert.equal(body.memberships[0].organization.billing_type, 'stripe');
    assert.ok(body.memberships[0].organization.capabilities.includes('claude_pro'));
    assert.equal(sessionIdentityCache.get('sessionKey=abc123'), 'user@example.com');
    assert.equal(String(requests[0].url), 'https://claude.ai/api/account');
    assert.equal(requests[0].options.headers.cookie, 'sessionKey=abc123');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
