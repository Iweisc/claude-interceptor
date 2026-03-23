const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSystemPrompt } = require('../src/services/system-prompt');
const { buildToolDefinitions } = require('../src/services/tool-definitions');

test('system prompt includes memories and past-chat guidance when not temporary', () => {
  const prompt = buildSystemPrompt({
    body: {
      is_temporary: false,
      personalized_styles: [],
    },
    memories: '[2026-03-23] - prefers terse replies',
  });

  assert.match(prompt, /prefers terse replies/);
  assert.match(prompt, /conversation_search/);
  assert.match(prompt, /recent_chats/);
});

test('system prompt omits memory and past-chat sections for temporary chats', () => {
  const prompt = buildSystemPrompt({
    body: {
      is_temporary: true,
      personalized_styles: [],
    },
    memories: '[2026-03-23] - prefers terse replies',
  });

  assert.doesNotMatch(prompt, /prefers terse replies/);
  assert.doesNotMatch(prompt, /conversation_search/);
});

test('tool definitions exclude memory tools in temporary mode', () => {
  const toolNames = buildToolDefinitions({ isTemporary: true }).map((tool) => tool.name);

  assert.ok(toolNames.includes('web_search'));
  assert.ok(toolNames.includes('create_file'));
  assert.ok(!toolNames.includes('memory_user_edits'));
  assert.ok(!toolNames.includes('conversation_search'));
  assert.ok(!toolNames.includes('recent_chats'));
});
