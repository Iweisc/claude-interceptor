const test = require('node:test');
const assert = require('node:assert/strict');

const { executeToolCall } = require('../src/services/tool-runner');

test('create_file stores artifact payloads by path', async () => {
  const updates = [];

  const result = await executeToolCall({
    toolCall: {
      id: 'tool-1',
      name: 'create_file',
      input: {
        path: '/mnt/user-data/outputs/demo.js',
        file_text: 'console.log("hi");',
      },
    },
    repositories: {
      conversations: {
        async upsertArtifact(context, path, artifact) {
          updates.push({ context, path, artifact });
        },
      },
    },
    context: {
      userId: 'user@example.com',
      orgId: 'org-1',
      conversationId: 'conv-1',
    },
  });

  assert.match(result.resultText, /File created successfully/);
  assert.equal(updates[0].path, '/mnt/user-data/outputs/demo.js');
  assert.equal(updates[0].artifact.content, 'console.log("hi");');
  assert.equal(updates[0].artifact.mimeType, 'application/javascript');
});
