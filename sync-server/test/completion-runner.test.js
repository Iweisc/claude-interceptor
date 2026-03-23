const test = require('node:test');
const assert = require('node:assert/strict');

const { runCompletion } = require('../src/services/completion-runner');

function createResponseRecorder() {
  return {
    headers: {},
    writes: [],
    statusCode: 200,
    writableEnded: false,
    headersSent: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    type(value) {
      this.setHeader('content-type', value);
      return this;
    },
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

test('completion commits the user turn before streaming and assistant on success', async () => {
  const calls = [];
  const req = {
    body: {
      prompt: 'hello world',
      turn_message_uuids: {
        human_message_uuid: 'u1',
        assistant_message_uuid: 'a1',
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
        async appendUserTurn(_context, turn) {
          calls.push(['appendUserTurn', turn.uuid]);
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
          streamResponse.write('chunk-1');
          return {
            historyTurns: [
              {
                role: 'assistant',
                uuid: 'a1',
                created_at: '2026-03-23T00:00:01.000Z',
                content: 'response text',
              },
            ],
          };
        },
      },
    },
    isRetry: false,
  });

  assert.deepEqual(calls, [
    ['appendUserTurn', 'u1'],
    ['streamConversation'],
    ['appendAssistantTurn', 'a1'],
  ]);
  assert.equal(res.writes[0], 'chunk-1');
  assert.equal(res.writableEnded, true);
});
