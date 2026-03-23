const test = require('node:test');
const assert = require('node:assert/strict');

const {
  appendHistoryTurn,
  normalizeConversationRow,
  removeLastAssistantHistoryTurn,
  replaceLastAssistantHistoryTurn,
} = require('../src/repositories/conversations');
const { formatMemoriesMarkdown } = require('../src/repositories/memories');

test('conversation rows default missing JSON columns to claude-safe shapes', () => {
  const row = normalizeConversationRow({
    id: 'conv-1',
    user_id: 'user@example.com',
    org_id: 'org-1',
    history: null,
    settings: null,
    artifacts: null,
  });

  assert.deepEqual(row.history, []);
  assert.deepEqual(row.settings, {});
  assert.deepEqual(row.artifacts, {});
});

test('appendHistoryTurn appends a single turn to normalized history', () => {
  const result = appendHistoryTurn(
    {
      history: [{ role: 'user', uuid: 'u1' }],
    },
    { role: 'assistant', uuid: 'a1' }
  );

  assert.deepEqual(result.history, [
    { role: 'user', uuid: 'u1' },
    { role: 'assistant', uuid: 'a1' },
  ]);
});

test('removeLastAssistantHistoryTurn removes the newest assistant turn only', () => {
  const result = removeLastAssistantHistoryTurn({
    history: [
      { role: 'user', uuid: 'u1' },
      { role: 'assistant', uuid: 'a1' },
      { role: 'user', uuid: 'u2' },
      { role: 'assistant', uuid: 'a2' },
    ],
  });

  assert.deepEqual(result.history, [
    { role: 'user', uuid: 'u1' },
    { role: 'assistant', uuid: 'a1' },
    { role: 'user', uuid: 'u2' },
  ]);
});

test('replaceLastAssistantHistoryTurn swaps only the newest assistant turn', () => {
  const result = replaceLastAssistantHistoryTurn({
    history: [
      { role: 'user', uuid: 'u1' },
      { role: 'assistant', uuid: 'a1' },
    ],
  }, { role: 'assistant', uuid: 'a2' });

  assert.deepEqual(result.history, [
    { role: 'user', uuid: 'u1' },
    { role: 'assistant', uuid: 'a2' },
  ]);
});

test('formatMemoriesMarkdown renders ordered dated bullets', () => {
  const formatted = formatMemoriesMarkdown([
    { text: 'prefers terse replies', created_at: '2026-03-23T00:00:00.000Z' },
    { text: 'works in Node', created_at: '2026-03-24T00:00:00.000Z' },
  ]);

  assert.equal(formatted, '[2026-03-23] - prefers terse replies\n[2026-03-24] - works in Node');
});
