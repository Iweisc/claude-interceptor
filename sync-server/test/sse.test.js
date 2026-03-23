const test = require('node:test');
const assert = require('node:assert/strict');

const {
  augmentClaudeEvent,
  formatSseEvent,
  generateCreateFileUpdateSse,
  generateMessageLimitEvent,
  generateToolResultSse,
} = require('../src/services/sse');

test('message_limit event emits claude-compatible windows payload', () => {
  const payload = JSON.parse(generateMessageLimitEvent());
  assert.equal(payload.type, 'message_limit');
  assert.equal(payload.message_limit.type, 'within_limit');
  assert.ok(payload.message_limit.windows['5h']);
});

test('formatSseEvent uses CRLF framing', () => {
  assert.equal(
    formatSseEvent('message_stop', '{"type":"message_stop"}'),
    'event: message_stop\r\ndata: {"type":"message_stop"}\r\n\r\n'
  );
});

test('augmentClaudeEvent patches message_start metadata', () => {
  const result = JSON.parse(augmentClaudeEvent(JSON.stringify({
    type: 'message_start',
    message: {
      usage: { input_tokens: 10 },
    },
  }), {
    humanUuid: 'human-uuid',
    assistantUuid: 'assistant-uuid',
  }, 0));

  assert.equal(result.message.parent_uuid, 'human-uuid');
  assert.equal(result.message.uuid, 'assistant-uuid');
  assert.ok(typeof result.message.trace_id === 'string' && result.message.trace_id.length > 0);
  assert.ok(typeof result.message.request_id === 'string' && result.message.request_id.startsWith('req_'));
  assert.equal(result.message.model, '');
  assert.equal(result.message.usage, undefined);
});

test('generateToolResultSse emits claude-compatible tool result blocks', () => {
  const sse = generateToolResultSse('tool-1', 'present_files', {
    filepaths: ['/mnt/user-data/outputs/demo.js'],
  }, 4);

  assert.match(sse, /event: content_block_start/);
  assert.match(sse, /"type":"tool_result"/);
  assert.match(sse, /"tool_use_id":"tool-1"/);
  assert.match(sse, /"index":4/);
});

test('generateCreateFileUpdateSse emits a code preview delta', () => {
  const sse = generateCreateFileUpdateSse(2, {
    path: '/mnt/user-data/outputs/demo.js',
    description: 'Creating demo file',
    file_text: 'console.log("hi");',
  });

  assert.match(sse, /tool_use_block_update_delta/);
  assert.match(sse, /Creating demo file/);
  assert.match(sse, /demo\.js/);
});
