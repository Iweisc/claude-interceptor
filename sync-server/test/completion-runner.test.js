const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { runCompletion } = require('../src/services/completion-runner');
const { createSessionIdentityCache } = require('../src/services/session-identity');

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

function createEventStreamResponse(chunks) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }), {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
    },
  });
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

test('default streaming injects message_limit before message_stop', async () => {
  const history = [];
  const req = {
    body: {
      prompt: 'hello world',
      model: 'claude-sonnet-4-6',
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
          history.push(turn);
        },
        async appendAssistantTurn(_context, turn) {
          history.push(turn);
        },
        async getConversation() {
          return {
            id: 'conv-1',
            org_id: 'org-1',
            title: '',
            settings: {},
            history: [...history],
            artifacts: {},
          };
        },
      },
      memories: {
        async getFormattedMemories() {
          return { formatted: '', count: 0 };
        },
      },
    },
    services: {
      fetchImpl: async () => createEventStreamResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":1}}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    },
    isRetry: false,
  });

  const output = res.writes.join('');
  assert.ok(output.indexOf('event: message_limit') > -1);
  assert.ok(output.indexOf('event: message_limit') < output.indexOf('event: message_stop'));
});

test('tree=True reflects the freshly stored assistant turn after a streamed completion', async () => {
  const conversation = {
    id: 'conv-1',
    org_id: 'org-1',
    title: 'Stored chat',
    settings: {},
    history: [],
    artifacts: {},
  };
  const sessionCache = createSessionIdentityCache({ ttlMs: 60_000 });
  sessionCache.set('sessionKey=abc123', 'user@example.com');
  const app = createApp({
    config: {
      corsOrigin: 'https://claude.ai',
      claudeUpstreamBaseUrl: 'https://claude.ai',
      requestTimeoutMs: 5_000,
      sessionCacheTtlMs: 60_000,
    },
    repositories: {
      conversations: {
        async getConversation() {
          return {
            ...conversation,
            history: [...conversation.history],
          };
        },
        async appendUserTurn(_context, turn) {
          conversation.history.push(turn);
        },
        async appendAssistantTurn(_context, turn) {
          conversation.history.push(turn);
        },
        async removeLastAssistantTurn() {
          return conversation;
        },
      },
      memories: {
        async listMemories() { return []; },
        async getFormattedMemories() { return { formatted: '', count: 0 }; },
      },
    },
    services: {
      sessionIdentityCache: sessionCache,
      fetchImpl: async () => { throw new Error('unexpected upstream fetch'); },
      litellm: {
        async streamConversation({ res: streamResponse }) {
          streamResponse.write('event: message_limit\r\ndata: {"type":"message_limit"}\r\n\r\n');
          streamResponse.write('event: message_stop\r\ndata: {"type":"message_stop"}\r\n\r\n');
          return {
            historyTurns: [
              {
                role: 'assistant',
                uuid: 'a1',
                created_at: '2026-03-23T00:00:01.000Z',
                content: 'stored response',
              },
            ],
          };
        },
      },
    },
  });

  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const completionResponse = await fetch(`${baseUrl}/api/organizations/org-1/chat_conversations/conv-1/completion`, {
      method: 'POST',
      headers: {
        origin: 'https://claude.ai',
        'content-type': 'application/json',
        'x-forward-cookie': 'sessionKey=abc123',
        'x-litellm-endpoint': 'https://litellm.example.com',
        'x-litellm-key': 'secret',
      },
      body: JSON.stringify({
        prompt: 'hello world',
        turn_message_uuids: {
          human_message_uuid: 'u1',
          assistant_message_uuid: 'a1',
        },
      }),
    });

    assert.equal(completionResponse.status, 200);
    await completionResponse.text();

    const treeResponse = await fetch(`${baseUrl}/api/organizations/org-1/chat_conversations/conv-1?tree=True`, {
      headers: {
        origin: 'https://claude.ai',
        'x-forward-cookie': 'sessionKey=abc123',
      },
    });

    assert.equal(treeResponse.status, 200);
    const treeBody = await treeResponse.json();
    assert.equal(treeBody.chat_messages.length, 2);
    assert.equal(treeBody.chat_messages[1].content[0].text, 'stored response');
    assert.equal(treeBody.current_leaf_message_uuid, 'a1');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
