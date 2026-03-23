const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PROXY_ORIGIN,
  mergeCompletionBodyWithSettings,
  rewriteClaudeUrl,
} = require('../inject.js');

test('api and artifact routes are rewritten to the proxy origin', () => {
  assert.equal(
    rewriteClaudeUrl('/api/account'),
    `${PROXY_ORIGIN}/api/account`
  );
  assert.equal(
    rewriteClaudeUrl('/wiggle/download-file?path=%2Fmnt%2Fuser-data%2Foutputs%2Fdemo.js'),
    `${PROXY_ORIGIN}/wiggle/download-file?path=%2Fmnt%2Fuser-data%2Foutputs%2Fdemo.js`
  );
  assert.equal(
    rewriteClaudeUrl('https://claude.ai/api/account'),
    `${PROXY_ORIGIN}/api/account`
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
