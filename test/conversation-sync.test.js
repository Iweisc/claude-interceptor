const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTrackedConversationFromHistory,
  buildConversationSyncPayload,
  hydrateConversationSyncState,
  mergeTrackedConversation,
} = require('../inject.js');

test('buildConversationSyncPayload includes tracked messages, settings, and referenced artifacts', () => {
  const payload = buildConversationSyncPayload(
    {
      messages: [{ uuid: 'm1' }],
      artifactPaths: ['/mnt/user-data/outputs/file.js'],
    },
    {
      paprikaMode: 'extended',
      compassMode: 'advanced',
      isTemporary: false,
    },
    {
      '/mnt/user-data/outputs/file.js': { content: 'console.log("hi")', mimeType: 'application/javascript' },
      '/mnt/user-data/outputs/unused.js': { content: 'unused', mimeType: 'application/javascript' },
    }
  );

  assert.deepEqual(payload, {
    tracked: {
      messages: [{ uuid: 'm1' }],
      artifactPaths: ['/mnt/user-data/outputs/file.js'],
      lastGetResponse: null,
    },
    settings: {
      paprikaMode: 'extended',
      compassMode: 'advanced',
      isTemporary: false,
    },
    artifacts: {
      '/mnt/user-data/outputs/file.js': {
        content: 'console.log("hi")',
        mimeType: 'application/javascript',
      },
    },
  });
});

test('mergeTrackedConversation prefers the longer synced tracker and preserves artifact paths', () => {
  const merged = mergeTrackedConversation(
    {
      messages: [{ uuid: 'local-1' }],
      artifactPaths: ['/mnt/user-data/outputs/local.js'],
    },
    {
      messages: [{ uuid: 'sync-1' }, { uuid: 'sync-2' }],
      artifactPaths: ['/mnt/user-data/outputs/sync.js'],
    }
  );

  assert.deepEqual(merged, {
    messages: [{ uuid: 'sync-1' }, { uuid: 'sync-2' }],
    artifactPaths: [
      '/mnt/user-data/outputs/sync.js',
      '/mnt/user-data/outputs/local.js',
    ],
    lastGetResponse: null,
  });
});

test('hydrateConversationSyncState restores synced tracker, settings, and artifacts', () => {
  const hydrated = hydrateConversationSyncState(
    { messages: [], artifactPaths: [] },
    {
      tracked: {
        messages: [{ uuid: 'sync-1' }],
        artifactPaths: ['/mnt/user-data/outputs/sync.js'],
      },
      settings: { paprikaMode: 'extended' },
      artifacts: {
        '/mnt/user-data/outputs/sync.js': {
          content: 'synced',
          mimeType: 'application/javascript',
        },
      },
    },
    {}
  );

  assert.deepEqual(hydrated, {
    tracker: {
      messages: [{ uuid: 'sync-1' }],
      artifactPaths: ['/mnt/user-data/outputs/sync.js'],
      lastGetResponse: null,
    },
    settings: { paprikaMode: 'extended' },
    artifacts: {
      '/mnt/user-data/outputs/sync.js': {
        content: 'synced',
        mimeType: 'application/javascript',
      },
    },
  });
});

test('buildTrackedConversationFromHistory reconstructs messages from synced history', () => {
  const tracked = buildTrackedConversationFromHistory('conv-123', [
    { role: 'user', content: 'what are all the skills?' },
    { role: 'assistant', content: 'Here is the list.' },
  ]);

  assert.equal(tracked.messages.length, 2);
  assert.equal(tracked.messages[0].sender, 'human');
  assert.equal(tracked.messages[0].content[0].text, 'what are all the skills?');
  assert.equal(tracked.messages[1].sender, 'assistant');
  assert.equal(tracked.messages[1].content[0].text, 'Here is the list.');
});

test('hydrateConversationSyncState falls back to synced history when tracked messages are missing', () => {
  const hydrated = hydrateConversationSyncState(
    { messages: [], artifactPaths: [] },
    {
      id: 'conv-123',
      history: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' },
      ],
      tracked: {},
      settings: null,
      artifacts: {},
    },
    {}
  );

  assert.equal(hydrated.tracker.messages.length, 2);
  assert.equal(hydrated.tracker.messages[0].content[0].text, 'hello');
  assert.equal(hydrated.tracker.messages[1].content[0].text, 'world');
});
