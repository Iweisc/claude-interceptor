const test = require('node:test');
const assert = require('node:assert/strict');

const { runCompletion } = require('../src/services/completion-runner');

function createResponseRecorder() {
  return {
    writes: [],
    writableEnded: false,
    headersSent: false,
    setHeader() {},
    status() { return this; },
    type() { return this; },
    json(payload) {
      this.jsonPayload = payload;
      this.writableEnded = true;
      return this;
    },
    send(payload) {
      this.payload = payload;
      this.writableEnded = true;
      return this;
    },
    write(chunk) {
      this.headersSent = true;
      this.writes.push(chunk);
      return true;
    },
    end(chunk) {
      if (chunk) this.writes.push(chunk);
      this.writableEnded = true;
    },
    flushHeaders() {
      this.headersSent = true;
    },
  };
}

test('retry removes the last assistant turn before rerunning generation', async () => {
  const calls = [];
  const req = {
    body: {
      turn_message_uuids: {
        assistant_message_uuid: 'a2',
      },
    },
    headers: {
      'x-litellm-endpoint': 'https://litellm.example.com',
      'x-litellm-key': 'secret',
    },
    on() {},
  };
  const res = createResponseRecorder();

  await runCompletion({
    req,
    res,
    context: {
      userId: 'user@example.com',
      orgId: 'org-1',
      conversationId: 'conv-1',
    },
    repositories: {
      conversations: {
        async removeLastAssistantTurn() {
          calls.push(['removeLastAssistantTurn']);
          return {
            history: [
              {
                role: 'user',
                uuid: 'u1',
                created_at: '2026-03-23T00:00:00.000Z',
                content: 'hello again',
              },
            ],
          };
        },
        async appendUserTurn() {
          calls.push(['appendUserTurn']);
        },
        async appendAssistantTurn(_context, turn) {
          calls.push(['appendAssistantTurn', turn.uuid]);
        },
      },
    },
    services: {
      litellm: {
        async streamConversation({ res: streamResponse }) {
          calls.push(['streamConversation']);
          streamResponse.write('retry-chunk');
          return {
            historyTurns: [
              {
                role: 'assistant',
                uuid: 'a2',
                created_at: '2026-03-23T00:00:01.000Z',
                content: 'retry text',
              },
            ],
          };
        },
      },
    },
    isRetry: true,
  });

  assert.deepEqual(calls, [
    ['removeLastAssistantTurn'],
    ['streamConversation'],
    ['appendAssistantTurn', 'a2'],
  ]);
  assert.equal(res.writes[0], 'retry-chunk');
});
