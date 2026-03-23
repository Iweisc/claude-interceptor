const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildProxyHeaderValues,
  PROXY_ORIGIN,
  getProxyCookieHeader,
  getProxyUserEmail,
  mergeCompletionBodyWithSettings,
  readProxyCookieHeaderFromDataAttributes,
  readProxySettingsFromDataAttributes,
  rewriteClaudeUrl,
  setProxyCookieHeaderForTests,
  setProxyUserEmailForTests,
} = require('../inject.js');
const chromeInject = require('../chrome/inject.js');
const firefoxBackground = require('../background.js');
const chromeBackground = require('../chrome/background.js');
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

test('cookie headers can be built and read for proxy forwarding', () => {
  const cookies = [
    { name: 'a', value: '1' },
    { name: 'session', value: 'abc' },
  ];
  const cookieHeader = 'a=1; session=abc';

  assert.equal(firefoxBackground.buildCookieHeader(cookies), cookieHeader);
  assert.equal(chromeBackground.buildCookieHeader(cookies), cookieHeader);
  assert.equal(readProxyCookieHeaderFromDataAttributes({ cookieHeader }), cookieHeader);

  setProxyCookieHeaderForTests(cookieHeader);
  assert.equal(getProxyCookieHeader(), cookieHeader);
});

test('proxy header values include cookie header and resolved user email', () => {
  setProxyCookieHeaderForTests('a=1; session=abc');
  setProxyUserEmailForTests('user@example.com');

  assert.deepEqual(
    buildProxyHeaderValues({
      endpoint: 'https://litellm.example.com',
      apiKey: 'secret',
    }),
    {
      cookieHeader: 'a=1; session=abc',
      userEmail: 'user@example.com',
      endpoint: 'https://litellm.example.com',
      apiKey: 'secret',
    }
  );
});

test('content scripts skip page-script injection on login routes', () => {
  assert.equal(firefoxContent.shouldInjectProxyScript('/login'), false);
  assert.equal(chromeContent.shouldInjectProxyScript('/login'), false);
  assert.equal(firefoxContent.shouldInjectProxyScript('/new'), true);
  assert.equal(chromeContent.shouldInjectProxyScript('/chat/example'), true);
});

test('content scripts build injected dataset with both cookie header and user email', () => {
  const settings = {
    endpoint: 'https://litellm.example.com',
    model: 'claude-sonnet-4-6',
    apiKey: 'secret',
    enableThinking: true,
    thinkingBudget: 12000,
  };
  const expected = {
    endpoint: 'https://litellm.example.com',
    model: 'claude-sonnet-4-6',
    apiKey: 'secret',
    enableThinking: 'true',
    thinkingBudget: '12000',
    cookieHeader: 'a=1; session=abc',
    userEmail: 'user@example.com',
  };

  assert.deepEqual(
    firefoxContent.buildInjectedScriptDataset(settings, 'user@example.com', 'a=1; session=abc'),
    expected
  );
  assert.deepEqual(
    chromeContent.buildInjectedScriptDataset(settings, 'user@example.com', 'a=1; session=abc'),
    expected
  );
});
