const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PROXY_ORIGIN,
  getProxyUserEmail,
  mergeCompletionBodyWithSettings,
  readProxySettingsFromDataAttributes,
  rewriteClaudeUrl,
  setProxyUserEmailForTests,
} = require('../inject.js');
const chromeInject = require('../chrome/inject.js');
const firefoxContent = require('../content.js');
const chromeContent = require('../chrome/content.js');

test('api and artifact routes are rewritten to the proxy origin', () => {
  assert.equal(
    rewriteClaudeUrl('/api/organizations/org-1/chat_conversations'),
    `${PROXY_ORIGIN}/api/organizations/org-1/chat_conversations`
  );
  assert.equal(
    rewriteClaudeUrl('/wiggle/download-file?path=%2Fmnt%2Fuser-data%2Foutputs%2Fdemo.js'),
    `${PROXY_ORIGIN}/wiggle/download-file?path=%2Fmnt%2Fuser-data%2Foutputs%2Fdemo.js`
  );
  assert.equal(
    rewriteClaudeUrl('https://claude.ai/api/organizations/org-1/chat_conversations'),
    `${PROXY_ORIGIN}/api/organizations/org-1/chat_conversations`
  );
});

test('auth and logged-out login bootstrap requests stay on claude.ai', () => {
  assert.equal(
    rewriteClaudeUrl('/api/auth/verify_google', { pagePath: '/login' }),
    '/api/auth/verify_google'
  );
  assert.equal(
    rewriteClaudeUrl('/api/bootstrap/abc/app_start?growthbook_format=sdk', { pagePath: '/login' }),
    '/api/bootstrap/abc/app_start?growthbook_format=sdk'
  );
  assert.equal(
    rewriteClaudeUrl('/api/account', { pagePath: '/login' }),
    '/api/account'
  );
});

test('stored popup settings overlay model and thinking on completion bodies', () => {
  const body = mergeCompletionBodyWithSettings({ prompt: 'hi' }, {
    model: 'claude-sonnet-4-6',
    enableThinking: true,
    thinkingBudget: 10000,
  });

  assert.equal(body.model, 'claude-sonnet-4-6');
  assert.equal(body._thinkingEnabled, true);
  assert.equal(body._thinkingBudget, 10000);
});

test('chrome and firefox injectors share identical rewrite behavior', () => {
  assert.equal(
    chromeInject.rewriteClaudeUrl('/api/account'),
    rewriteClaudeUrl('/api/account')
  );
  assert.deepEqual(
    chromeInject.mergeCompletionBodyWithSettings({ prompt: 'hi' }, {
      model: 'claude-sonnet-4-6',
      enableThinking: true,
      thinkingBudget: 10000,
    }),
    mergeCompletionBodyWithSettings({ prompt: 'hi' }, {
      model: 'claude-sonnet-4-6',
      enableThinking: true,
      thinkingBudget: 10000,
    })
  );
});

test('proxy settings can be read from injected script data attributes', () => {
  const dataset = {
    endpoint: 'https://litellm.example.com',
    model: 'claude-sonnet-4-6',
    apiKey: 'secret',
    enableThinking: 'true',
    thinkingBudget: '12000',
  };

  assert.deepEqual(
    readProxySettingsFromDataAttributes(dataset),
    {
      endpoint: 'https://litellm.example.com',
      model: 'claude-sonnet-4-6',
      apiKey: 'secret',
      enableThinking: true,
      thinkingBudget: 12000,
    }
  );
  assert.deepEqual(
    chromeInject.readProxySettingsFromDataAttributes(dataset),
    readProxySettingsFromDataAttributes(dataset)
  );
});

test('resolved user email is available for proxy headers', () => {
  setProxyUserEmailForTests('user@example.com');
  assert.equal(getProxyUserEmail(), 'user@example.com');
});

test('content scripts skip page-script injection on login routes', () => {
  assert.equal(firefoxContent.shouldInjectProxyScript('/login'), false);
  assert.equal(chromeContent.shouldInjectProxyScript('/login'), false);
  assert.equal(firefoxContent.shouldInjectProxyScript('/new'), true);
  assert.equal(chromeContent.shouldInjectProxyScript('/chat/example'), true);
});
