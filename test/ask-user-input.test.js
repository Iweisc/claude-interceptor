const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ASK_USER_INPUT_TOOL,
  shouldAutoExecuteToolCall,
} = require('../background.js');

test('ask_user_input_v0 tool definition is exposed for interactive clarifying questions', () => {
  assert.equal(ASK_USER_INPUT_TOOL.name, 'ask_user_input_v0');
  assert.equal(ASK_USER_INPUT_TOOL.input_schema.type, 'object');
  assert.ok(Array.isArray(ASK_USER_INPUT_TOOL.input_schema.required));
  assert.ok(ASK_USER_INPUT_TOOL.input_schema.required.includes('questions'));
});

test('ask_user_input_v0 is handled client-side and should not auto-execute', () => {
  assert.equal(shouldAutoExecuteToolCall({ name: 'ask_user_input_v0' }), false);
  assert.equal(shouldAutoExecuteToolCall({ name: 'web_search' }), true);
});
