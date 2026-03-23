# Claude Proxy Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the background-script interception flow with a Sealos-hosted Claude-compatible proxy that owns conversations, memory, completions, and account/bootstrap patching while keeping the claude.ai frontend wire-compatible.

**Architecture:** Refactor `sync-server/` into a modular Express proxy that separates upstream Claude proxying, session identity caching, PostgreSQL repositories, completion/tool streaming, and Claude-shaped route serialization. Simplify both browser extensions into thin request rewriters that forward cookies and LiteLLM credentials to the proxy, with artifact/file fetches also routed through the proxy so browser state is never authoritative.

**Tech Stack:** Node.js 20, Express 4, PostgreSQL via `pg`, built-in `fetch`, built-in `node:test`, browser extension MV2/MV3 manifests, Kubernetes Ingress/Service/Deployment on Sealos.

---

### Task 1: Replace the `sync-server` monolith with a proxy app scaffold

**Files:**
- Create: `sync-server/src/app.js`
- Create: `sync-server/src/config.js`
- Create: `sync-server/src/db.js`
- Create: `sync-server/test/app-smoke.test.js`
- Modify: `sync-server/index.js`
- Modify: `sync-server/package.json`
- Modify: `sync-server/Dockerfile`
- Delete: `sync-server/skills.js`
- Delete: `sync-server/test/skills-contract.test.js`

**Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

test('health endpoint responds from the modular app bootstrap', async () => {
  const app = createApp({
    config: { corsOrigin: 'https://claude.ai' },
    repositories: {},
    services: {},
  });

  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${baseUrl}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });

  server.close();
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/sertdev/Projects/claude-intercepter/sync-server && node --test test/app-smoke.test.js`
Expected: FAIL with `Cannot find module '../src/app'` or equivalent.

**Step 3: Write minimal implementation**

```js
// sync-server/src/app.js
const express = require('express');

function createApp({ config, repositories, services }) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  return app;
}

module.exports = { createApp };
```

```js
// sync-server/index.js
require('dotenv').config();
const { createConfig } = require('./src/config');
const { createPool, initDb } = require('./src/db');
const { createApp } = require('./src/app');

async function main() {
  const config = createConfig(process.env);
  const pool = createPool(config);
  await initDb(pool);
  const app = createApp({ config, pool });
  app.listen(config.port, () => console.log(`[proxy] listening on ${config.port}`));
}

main().catch((error) => {
  console.error('[proxy] startup failed', error);
  process.exit(1);
});
```

Update `sync-server/package.json` to remove the legacy skills-only dependencies that are no longer needed, keep `dotenv`, `express`, `express-rate-limit`, `helmet`, and `pg`, and point `test` at the new `sync-server/test/*.test.js` suite. Update `sync-server/Dockerfile` to copy the new `src/` tree instead of only `index.js`.

**Step 4: Run test to verify it passes**

Run: `cd /home/sertdev/Projects/claude-intercepter/sync-server && node --test test/app-smoke.test.js`
Expected: PASS with `ok 1 - health endpoint responds from the modular app bootstrap`.

**Step 5: Commit**

```bash
cd /home/sertdev/Projects/claude-intercepter
git add sync-server/index.js sync-server/package.json sync-server/Dockerfile sync-server/src/app.js sync-server/src/config.js sync-server/src/db.js sync-server/test/app-smoke.test.js sync-server/skills.js sync-server/test/skills-contract.test.js
git commit -m "refactor: scaffold claude proxy server"
```

### Task 2: Add session-email resolution and upstream JSON patching

**Files:**
- Create: `sync-server/src/services/session-identity.js`
- Create: `sync-server/src/services/claude-upstream.js`
- Create: `sync-server/test/account-bootstrap.proxy.test.js`
- Modify: `sync-server/src/app.js`
- Modify: `sync-server/src/config.js`

**Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { patchAccountPayload, patchBootstrapPayload, createSessionIdentityCache } = require('../src/services/claude-upstream');

test('account payload is patched and email is extracted', async () => {
  const payload = patchAccountPayload({
    email_address: 'user@example.com',
    capabilities: ['basic'],
    billing_type: 'free',
  });

  assert.equal(payload.email_address, 'user@example.com');
  assert.equal(payload.billing_type, 'stripe');
  assert.ok(payload.capabilities.includes('claude_pro'));
});

test('bootstrap payload gets pro flags and minimum tiers', async () => {
  const payload = patchBootstrapPayload({
    models: [{ name: 'claude-sonnet', minimum_tier: 'pro' }],
    growthbook: { attributes: { isPro: false } },
  });

  assert.equal(payload.growthbook.attributes.isPro, true);
  assert.equal(payload.models[0].minimum_tier, 'free');
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/sertdev/Projects/claude-intercepter/sync-server && node --test test/account-bootstrap.proxy.test.js`
Expected: FAIL with missing module or missing exported functions.

**Step 3: Write minimal implementation**

```js
// sync-server/src/services/session-identity.js
const crypto = require('node:crypto');

function createSessionIdentityCache(ttlMs) {
  const cache = new Map();
  return {
    get(cookieHeader) {
      const key = crypto.createHash('sha256').update(cookieHeader || '').digest('hex');
      const entry = cache.get(key);
      if (!entry || entry.expiresAt < Date.now()) return null;
      return entry.email;
    },
    set(cookieHeader, email) {
      const key = crypto.createHash('sha256').update(cookieHeader || '').digest('hex');
      cache.set(key, { email, expiresAt: Date.now() + ttlMs });
    },
  };
}
```

```js
// sync-server/src/services/claude-upstream.js
function patchAccountPayload(payload) {
  return {
    ...payload,
    capabilities: Array.from(new Set([...(payload.capabilities || []), 'claude_pro'])),
    billing_type: 'stripe',
  };
}

function patchBootstrapPayload(payload) {
  return {
    ...payload,
    capabilities: Array.from(new Set([...(payload.capabilities || []), 'claude_pro'])),
    billing_type: 'stripe',
    rate_limit_tier: 'claude_pro_2025_06',
    growthbook: {
      ...(payload.growthbook || {}),
      attributes: {
        ...((payload.growthbook && payload.growthbook.attributes) || {}),
        isPro: true,
      },
    },
    models: (payload.models || []).map((model) => ({ ...model, minimum_tier: 'free' })),
  };
}
```

Extend `createApp()` so the proxy routes forward `X-Forward-Cookie` to Claude, buffer upstream JSON for `/api/account` and `/api/bootstrap/:id/app_start`, patch the response bodies, and update the session-email cache whenever an email is present.

**Step 4: Run tests to verify they pass**

Run: `cd /home/sertdev/Projects/claude-intercepter/sync-server && node --test test/account-bootstrap.proxy.test.js`
Expected: PASS with both patching tests green.

**Step 5: Commit**

```bash
cd /home/sertdev/Projects/claude-intercepter
git add sync-server/src/app.js sync-server/src/config.js sync-server/src/services/session-identity.js sync-server/src/services/claude-upstream.js sync-server/test/account-bootstrap.proxy.test.js
git commit -m "feat: proxy and patch account bootstrap responses"
```

### Task 3: Normalize the PostgreSQL conversation and memory repositories

**Files:**
- Create: `sync-server/src/repositories/conversations.js`
- Create: `sync-server/src/repositories/memories.js`
- Create: `sync-server/test/repositories.test.js`
- Modify: `sync-server/src/db.js`

**Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConversationRow } = require('../src/repositories/conversations');

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
```

**Step 2: Run test to verify it fails**

Run: `cd /home/sertdev/Projects/claude-intercepter/sync-server && node --test test/repositories.test.js`
Expected: FAIL with missing module or missing export.

**Step 3: Write minimal implementation**

```js
// sync-server/src/db.js
async function initDb(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      org_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      history JSONB NOT NULL DEFAULT '[]',
      settings JSONB NOT NULL DEFAULT '{}',
      artifacts JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id, user_id)
    );
  `);
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';`);
}
```

```js
// sync-server/src/repositories/conversations.js
function normalizeConversationRow(row) {
  return {
    ...row,
    history: Array.isArray(row.history) ? row.history : [],
    settings: row.settings && typeof row.settings === 'object' ? row.settings : {},
    artifacts: row.artifacts && typeof row.artifacts === 'object' ? row.artifacts : {},
  };
}
```

Add repository methods for:
- `getConversation(userId, orgId, conversationId)`
- `createConversation(userId, orgId, input)`
- `updateConversationSettings(userId, orgId, conversationId, settingsPatch)`
- `appendUserTurn(...)`
- `replaceLastAssistantTurn(...)`
- `appendAssistantTurn(...)`
- `removeLastAssistantTurn(...)`
- `searchConversationHistory(...)`
- `listRecentConversations(...)`
- `getArtifactByPath(...)`

Add memory repository methods for ordered list, create, replace by numeric id, delete by numeric id, and formatted memory text.

**Step 4: Run tests to verify they pass**

Run: `cd /home/sertdev/Projects/claude-intercepter/sync-server && node --test test/repositories.test.js`
Expected: PASS with repository normalization and helper tests green.

**Step 5: Commit**

```bash
cd /home/sertdev/Projects/claude-intercepter
git add sync-server/src/db.js sync-server/src/repositories/conversations.js sync-server/src/repositories/memories.js sync-server/test/repositories.test.js
git commit -m "feat: add conversation and memory repositories"
```

### Task 4: Expose Claude-shaped conversation and memory routes from PostgreSQL

**Files:**
- Create: `sync-server/src/routes/conversations.js`
- Create: `sync-server/src/routes/memory.js`
- Create: `sync-server/src/services/claude-shapes.js`
- Create: `sync-server/test/conversations.routes.test.js`
- Create: `sync-server/test/memory.routes.test.js`
- Modify: `sync-server/src/app.js`

**Step 1: Write the failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

test('tree=True responses return chat_messages from stored history', async () => {
  // Arrange app with fake repository row containing a user turn and an assistant turn.
  // Fetch /api/organizations/org-1/chat_conversations/conv-1?tree=True.
  // Assert response.chat_messages.length === 2 and response.current_leaf_message_uuid matches the assistant uuid.
});

test('memory route returns ordered rows from the memories table', async () => {
  // Arrange fake memories repo.
  // Fetch /api/organizations/org-1/memory.
  // Assert response shape is Claude-compatible and ordered oldest-first.
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/sertdev/Projects/claude-intercepter/sync-server && node --test test/conversations.routes.test.js test/memory.routes.test.js`
Expected: FAIL because the routes and serializers do not exist yet.

**Step 3: Write minimal implementation**

```js
// sync-server/src/services/claude-shapes.js
function buildTreeResponse(row) {
  const chatMessages = row.history.map((entry, index) => ({
    uuid: entry.uuid,
    sender: entry.role === 'assistant' ? 'assistant' : 'human',
    created_at: entry.created_at,
    updated_at: entry.updated_at || entry.created_at,
    content: entry.content,
    parent_message_uuid: index === 0 ? '00000000-0000-4000-8000-000000000000' : row.history[index - 1].uuid,
    attachments: [],
    files: [],
    files_v2: [],
    sync_sources: [],
    truncated: false,
    stop_reason: entry.role === 'assistant' ? 'stop_sequence' : undefined,
  }));

  return {
    uuid: row.id,
    name: row.title,
    chat_messages: chatMessages,
    current_leaf_message_uuid: chatMessages.at(-1)?.uuid || null,
    settings: row.settings,
  };
}
```

Implement:
- `POST /api/organizations/:orgId/chat_conversations`
- `PUT /api/organizations/:orgId/chat_conversations/:convId`
- `GET /api/organizations/:orgId/chat_conversations/:convId?tree=True`
- `GET /api/organizations/:orgId/memory`
- `GET /api/organizations/:orgId/subscription_details`

`GET /api/organizations/:orgId/list_styles` stays in the upstream proxy branch, not these local routes.

**Step 4: Run tests to verify they pass**

Run: `cd /home/sertdev/Projects/claude-intercepter/sync-server && node --test test/conversations.routes.test.js test/memory.routes.test.js`
Expected: PASS with all route-serialization assertions green.

**Step 5: Commit**

```bash
cd /home/sertdev/Projects/claude-intercepter
git add sync-server/src/app.js sync-server/src/routes/conversations.js sync-server/src/routes/memory.js sync-server/src/services/claude-shapes.js sync-server/test/conversations.routes.test.js sync-server/test/memory.routes.test.js
git commit -m "feat: serve conversations and memory from postgres"
```

### Task 5: Port Claude system-prompt construction, tool definitions, and SSE shaping

**Files:**
- Create: `sync-server/src/services/system-prompt.js`
- Create: `sync-server/src/services/tool-definitions.js`
- Create: `sync-server/src/services/sse.js`
- Create: `sync-server/test/system-prompt.test.js`
- Create: `sync-server/test/sse.test.js`

**Step 1: Write the failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSystemPrompt } = require('../src/services/system-prompt');
const { formatSseEvent, generateMessageLimitEvent, augmentClaudeEvent } = require('../src/services/sse');

test('system prompt includes memories and past-chat guidance when not temporary', () => {
  const prompt = buildSystemPrompt({
    body: { is_temporary: false, personalized_styles: [] },
    memories: '[2026-03-23] - prefers terse replies',
  });

  assert.match(prompt, /prefers terse replies/);
  assert.match(prompt, /conversation_search/);
});

test('message_limit event emits claude-compatible windows payload', () => {
  const payload = JSON.parse(generateMessageLimitEvent());
  assert.equal(payload.type, 'message_limit');
  assert.equal(payload.message_limit.type, 'within_limit');
  assert.ok(payload.message_limit.windows['5h']);
});

test('formatSseEvent uses CRLF framing', () => {
  assert.equal(formatSseEvent('message_stop', '{"type":"message_stop"}'), 'event: message_stop\\r\\ndata: {"type":"message_stop"}\\r\\n\\r\\n');
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/sertdev/Projects/claude-intercepter/sync-server && node --test test/system-prompt.test.js test/sse.test.js`
Expected: FAIL with missing modules/functions.

**Step 3: Write minimal implementation**

```js
// sync-server/src/services/sse.js
function formatSseEvent(eventType, data) {
  return `event: ${eventType}\r\ndata: ${data}\r\n\r\n`;
}

function generateMessageLimitEvent() {
  const now = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    type: 'message_limit',
    message_limit: {
      type: 'within_limit',
      resetsAt: null,
      remaining: null,
      perModelLimit: null,
      representativeClaim: 'five_hour',
      overageDisabledReason: 'overage_not_provisioned',
      overageInUse: false,
      windows: {
        '5h': { status: 'within_limit', resets_at: now + 18000, utilization: 0.01 },
        '7d': { status: 'within_limit', resets_at: now + 604800, utilization: 0.001 },
      },
    },
  });
}
```

Port these functions from `background.js` into server-safe modules:
- `buildSystemPrompt()`
- `formatSSE()` renamed to `formatSseEvent()`
- `augmentEvent()` renamed to `augmentClaudeEvent()`
- `generateMessageLimitEvent()`
- `generateToolResultSSE()`
- `generateCreateFileUpdateSSE()`

Define the final tool list in `tool-definitions.js`:
- `web_search`
- `memory_user_edits`
- `conversation_search`
- `recent_chats`
- `create_file`
- `present_files`
- `show_widget`

Drop `ask_user_input_v0`.

**Step 4: Run tests to verify they pass**

Run: `cd /home/sertdev/Projects/claude-intercepter/sync-server && node --test test/system-prompt.test.js test/sse.test.js`
Expected: PASS with SSE framing and prompt-shape assertions green.

**Step 5: Commit**

```bash
cd /home/sertdev/Projects/claude-intercepter
git add sync-server/src/services/system-prompt.js sync-server/src/services/tool-definitions.js sync-server/src/services/sse.js sync-server/test/system-prompt.test.js sync-server/test/sse.test.js
git commit -m "feat: port claude prompt and sse shaping helpers"
```

### Task 6: Implement the server-side tool runner and artifact routes

**Files:**
- Create: `sync-server/src/services/tool-runner.js`
- Create: `sync-server/src/routes/artifacts.js`
- Create: `sync-server/test/tool-runner.test.js`
- Create: `sync-server/test/artifacts.routes.test.js`
- Modify: `sync-server/src/repositories/conversations.js`
- Modify: `sync-server/src/app.js`

**Step 1: Write the failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { executeToolCall } = require('../src/services/tool-runner');

test('create_file stores artifact payloads by path', async () => {
  const updates = [];
  const result = await executeToolCall({
    toolCall: {
      id: 'tool-1',
      name: 'create_file',
      input: { path: '/mnt/user-data/outputs/demo.js', file_text: 'console.log("hi");' },
    },
    repositories: {
      conversations: {
        upsertArtifact: async (_ctx, path, artifact) => updates.push([path, artifact]),
      },
    },
  });

  assert.match(result.resultText, /File created successfully/);
  assert.equal(updates[0][0], '/mnt/user-data/outputs/demo.js');
});
```

Add a route test that requests:
- `GET /wiggle/download-file?path=/mnt/user-data/outputs/demo.js`
- `GET /artifacts/wiggle_artifact/anything/tools`

Assert the file download is served from stored artifacts and the artifact tools route returns `{ "tools": [] }`.

**Step 2: Run tests to verify they fail**

Run: `cd /home/sertdev/Projects/claude-intercepter/sync-server && node --test test/tool-runner.test.js test/artifacts.routes.test.js`
Expected: FAIL because the tool runner and artifact routes do not exist yet.

**Step 3: Write minimal implementation**

```js
// sync-server/src/services/tool-runner.js
async function executeToolCall({ toolCall, repositories, services, context }) {
  switch (toolCall.name) {
    case 'web_search':
      return { resultText: await services.search.web(toolCall.input.query || '') };
    case 'memory_user_edits':
      return { resultText: await services.memories.executeEdit(context, toolCall.input) };
    case 'conversation_search':
      return { resultText: await repositories.conversations.searchAsClaudeChats(context, toolCall.input.query || '') };
    case 'recent_chats':
      return { resultText: await repositories.conversations.listRecentAsClaudeChats(context, toolCall.input) };
    case 'create_file':
      await repositories.conversations.upsertArtifact(context, toolCall.input.path, toolCall.input);
      return { resultText: `File created successfully: ${toolCall.input.path}` };
    case 'present_files':
      return { resultText: `Files presented: ${(toolCall.input.filepaths || []).join(', ')}` };
    case 'show_widget':
      return { resultText: 'Widget rendered successfully' };
    default:
      throw new Error(`Unsupported tool: ${toolCall.name}`);
  }
}
```

Use `https://searxng-ns-0ffzk4u2.usw-1.sealos.app` for `web_search`. Keep input validation strict:
- search query non-empty
- memory text max 200 chars
- recent chat count clamped to 1-20
- file path must start with `/mnt/user-data/outputs/`
- widget code must be non-empty and bounded

Persist artifact metadata in `conversations.artifacts` so `create_file` survives refreshes and retry flows.

**Step 4: Run tests to verify they pass**

Run: `cd /home/sertdev/Projects/claude-intercepter/sync-server && node --test test/tool-runner.test.js test/artifacts.routes.test.js`
Expected: PASS with tool execution and artifact download tests green.

**Step 5: Commit**

```bash
cd /home/sertdev/Projects/claude-intercepter
git add sync-server/src/app.js sync-server/src/repositories/conversations.js sync-server/src/routes/artifacts.js sync-server/src/services/tool-runner.js sync-server/test/tool-runner.test.js sync-server/test/artifacts.routes.test.js
git commit -m "feat: execute tools and serve persisted artifacts"
```

### Task 7: Build the completion and retry streaming pipeline

**Files:**
- Create: `sync-server/src/services/completion-runner.js`
- Create: `sync-server/src/routes/completion.js`
- Create: `sync-server/test/completion-runner.test.js`
- Create: `sync-server/test/retry-completion.test.js`
- Modify: `sync-server/src/app.js`

**Step 1: Write the failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

test('completion commits the user turn before streaming and assistant on success', async () => {
  const calls = [];
  // Arrange fake conversation repo methods that push into `calls`.
  // Stream a one-turn LiteLLM response through the runner.
  // Assert `appendUserTurn` happens before the first `res.write`.
  // Assert `appendAssistantTurn` happens after `message_stop`.
});

test('retry removes the last assistant turn before rerunning generation', async () => {
  // Arrange repo with one prior assistant turn.
  // Call retry route.
  // Assert `removeLastAssistantTurn` is called once before the new user turn / stream.
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/sertdev/Projects/claude-intercepter/sync-server && node --test test/completion-runner.test.js test/retry-completion.test.js`
Expected: FAIL because the completion runner and routes do not exist yet.

**Step 3: Write minimal implementation**

```js
// sync-server/src/services/completion-runner.js
async function runCompletion({ req, res, repositories, services, context, isRetry }) {
  if (isRetry) {
    await repositories.conversations.removeLastAssistantTurn(context);
  }

  const userTurn = services.history.buildIncomingUserTurn(req.body);
  await repositories.conversations.appendUserTurn(context, userTurn);

  services.sse.open(res);
  let assistantTurn = null;

  try {
    assistantTurn = await services.litellm.streamConversation({
      req,
      res,
      context,
      repositories,
      services,
    });

    await repositories.conversations.appendAssistantTurn(context, assistantTurn);
    res.end();
  } catch (error) {
    services.sse.writeError(res, error);
    res.end();
  }
}
```

Inside `services.litellm.streamConversation()`:
- build message history from PostgreSQL, not from browser state
- port `streamLiteLLMRequest()` from `background.js`
- stream via `res.write()` instead of browser ports
- inject `message_limit` before `message_stop`
- support up to 8 tool loops
- accumulate assistant text, tool-use blocks, thinking blocks, and final artifacts

Route ownership in `completion.js`:
- `POST /api/organizations/:orgId/chat_conversations/:convId/completion`
- `POST /api/organizations/:orgId/chat_conversations/:convId/retry_completion`

**Step 4: Run tests to verify they pass**

Run: `cd /home/sertdev/Projects/claude-intercepter/sync-server && node --test test/completion-runner.test.js test/retry-completion.test.js`
Expected: PASS with ordering assertions around user-turn commit, message-stop completion, and retry semantics green.

**Step 5: Commit**

```bash
cd /home/sertdev/Projects/claude-intercepter
git add sync-server/src/app.js sync-server/src/routes/completion.js sync-server/src/services/completion-runner.js sync-server/test/completion-runner.test.js sync-server/test/retry-completion.test.js
git commit -m "feat: stream liteLLM completions through the proxy"
```

### Task 8: Replace Firefox extension interception with a thin proxy rewriter

**Files:**
- Create: `test/inject-proxy-rewrite.test.js`
- Modify: `inject.js`
- Modify: `content.js`
- Modify: `manifest.json`
- Modify: `popup/popup.js`
- Modify: `popup/popup.html`
- Delete: `background.js`
- Delete: `test/ask-user-input.test.js`
- Delete: `test/conversation-sync.test.js`

**Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { rewriteClaudeUrl, mergeCompletionBodyWithSettings } = require('../inject.js');

test('api and artifact routes are rewritten to the proxy origin', () => {
  assert.equal(
    rewriteClaudeUrl('/api/account'),
    'https://proxy-ns-0ffzk4u2.usw-1.sealos.app/api/account'
  );
  assert.equal(
    rewriteClaudeUrl('/wiggle/download-file?path=%2Fmnt%2Fuser-data%2Foutputs%2Fdemo.js'),
    'https://proxy-ns-0ffzk4u2.usw-1.sealos.app/wiggle/download-file?path=%2Fmnt%2Fuser-data%2Foutputs%2Fdemo.js'
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
```

**Step 2: Run test to verify it fails**

Run: `cd /home/sertdev/Projects/claude-intercepter && node --test test/inject-proxy-rewrite.test.js`
Expected: FAIL because the helper exports do not exist yet.

**Step 3: Write minimal implementation**

```js
// inject.js
const PROXY_ORIGIN = 'https://proxy-ns-0ffzk4u2.usw-1.sealos.app';

function rewriteClaudeUrl(inputUrl) {
  const url = typeof inputUrl === 'string' ? inputUrl : String(inputUrl);
  if (url.startsWith('/api/')) return `${PROXY_ORIGIN}${url}`;
  if (url.startsWith('/wiggle/download-file')) return `${PROXY_ORIGIN}${url}`;
  if (/^\/artifacts\/wiggle_artifact\/[^/]+\/tools/.test(url)) return `${PROXY_ORIGIN}${url}`;
  return url;
}

function mergeCompletionBodyWithSettings(body, settings) {
  return {
    ...body,
    model: (settings.model || body.model || '').trim(),
    _thinkingEnabled: Boolean(settings.enableThinking),
    _thinkingBudget: Math.min(Number(settings.thinkingBudget) || 10000, 126000),
  };
}
```

Then keep the runtime script small:
- clear IndexedDB `react-query-cache`
- clear GrowthBook/Statsig keys
- override `fetch` and `XMLHttpRequest`
- rewrite only owned URLs
- add `X-Forward-Cookie`, `X-LiteLLM-Endpoint`, and `X-LiteLLM-Key`
- for completion bodies only, overlay stored model and thinking settings before forwarding

Update `manifest.json` to remove `background`, `webRequest`, and `webRequestBlocking`. Keep only `storage`, `*://claude.ai/*`, and `https://proxy-ns-0ffzk4u2.usw-1.sealos.app/*`.

Remove the popup `enabled` toggle. Keep only endpoint, model, API key, enable-thinking, and thinking-budget controls with trimmed input validation in `popup/popup.js`.

**Step 4: Run tests to verify they pass**

Run: `cd /home/sertdev/Projects/claude-intercepter && node --test test/inject-proxy-rewrite.test.js`
Expected: PASS with rewrite and body-overlay assertions green.

**Step 5: Commit**

```bash
cd /home/sertdev/Projects/claude-intercepter
git add inject.js content.js manifest.json popup/popup.js popup/popup.html test/inject-proxy-rewrite.test.js background.js test/ask-user-input.test.js test/conversation-sync.test.js
git commit -m "refactor: thin out firefox proxy injection"
```

### Task 9: Mirror the same proxy rewrite in the Chrome extension

**Files:**
- Modify: `chrome/inject.js`
- Modify: `chrome/content.js`
- Modify: `chrome/manifest.json`
- Modify: `chrome/popup/popup.js`
- Modify: `chrome/popup/popup.html`
- Delete: `chrome/background.js`

**Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const firefoxHelpers = require('../inject.js');
const chromeHelpers = require('../chrome/inject.js');

test('firefox and chrome injectors share identical rewrite behavior', () => {
  assert.equal(
    chromeHelpers.rewriteClaudeUrl('/api/account'),
    firefoxHelpers.rewriteClaudeUrl('/api/account')
  );
});
```

Append this case to `test/inject-proxy-rewrite.test.js` so both builds are covered by one root suite.

**Step 2: Run test to verify it fails**

Run: `cd /home/sertdev/Projects/claude-intercepter && node --test test/inject-proxy-rewrite.test.js`
Expected: FAIL because the Chrome injector still exports the legacy interception logic.

**Step 3: Write minimal implementation**

Make `chrome/inject.js` behavior match `inject.js`:
- same proxy origin
- same rewrite rules
- same header injection
- same completion-body overlay
- same cache clearing

Update `chrome/manifest.json` to drop the background service worker and excess host permissions. Update the Chrome popup to remove the obsolete sync server fields and keep the same validated settings as Firefox.

**Step 4: Run test to verify it passes**

Run: `cd /home/sertdev/Projects/claude-intercepter && node --test test/inject-proxy-rewrite.test.js`
Expected: PASS with parity assertions green for both extension builds.

**Step 5: Commit**

```bash
cd /home/sertdev/Projects/claude-intercepter
git add chrome/inject.js chrome/content.js chrome/manifest.json chrome/popup/popup.js chrome/popup/popup.html chrome/background.js test/inject-proxy-rewrite.test.js
git commit -m "refactor: thin out chrome proxy injection"
```

### Task 10: Add Sealos deployment manifests and Docker packaging

**Files:**
- Create: `sync-server/.dockerignore`
- Create: `deploy/sealos/proxy-deployment.yaml`
- Create: `deploy/sealos/proxy-service.yaml`
- Create: `deploy/sealos/proxy-ingress.yaml`
- Modify: `sync-server/Dockerfile`

**Step 1: Write the failing smoke check**

```yaml
# deploy/sealos/proxy-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: claude-proxy
  namespace: ns-0ffzk4u2
spec:
  tls:
    - hosts:
        - proxy-ns-0ffzk4u2.usw-1.sealos.app
      secretName: wildcard-cert
  rules:
    - host: proxy-ns-0ffzk4u2.usw-1.sealos.app
```

**Step 2: Run client-side validation to verify it fails before the files exist**

Run: `kubectl --kubeconfig /home/sertdev/Projects/claude-intercepter/kubeconfig.yaml -n ns-0ffzk4u2 apply --dry-run=client -f /home/sertdev/Projects/claude-intercepter/deploy/sealos`
Expected: FAIL with `the path ... does not exist`.

**Step 3: Write minimal implementation**

Deployment requirements:
- image name placeholder like `registry.example.com/claude-proxy:latest`
- container port `3985`
- env vars:
  - `PORT=3985`
  - `DATABASE_URL=postgresql://postgres:sxkpf2sh@chat-server-postgresql.ns-0ffzk4u2.svc.cluster.local:5432/`
  - `CLAUDE_UPSTREAM_BASE_URL=https://claude.ai`
  - `SEARXNG_URL=https://searxng-ns-0ffzk4u2.usw-1.sealos.app`
  - `SESSION_CACHE_TTL_MS=300000`
  - `REQUEST_TIMEOUT_MS=120000`
- service name `claude-proxy`
- ingress host `proxy-ns-0ffzk4u2.usw-1.sealos.app`
- TLS secret `wildcard-cert`

Update `sync-server/Dockerfile` to copy `src/`, `test/`, and package metadata, and add `sync-server/.dockerignore` to exclude `node_modules`, logs, and local test output.

**Step 4: Run validation to verify it passes**

Run: `kubectl --kubeconfig /home/sertdev/Projects/claude-intercepter/kubeconfig.yaml -n ns-0ffzk4u2 apply --dry-run=client -f /home/sertdev/Projects/claude-intercepter/deploy/sealos`
Expected: PASS with `deployment.apps/claude-proxy created (dry run)` and matching service/ingress dry-run output.

**Step 5: Commit**

```bash
cd /home/sertdev/Projects/claude-intercepter
git add sync-server/.dockerignore sync-server/Dockerfile deploy/sealos/proxy-deployment.yaml deploy/sealos/proxy-service.yaml deploy/sealos/proxy-ingress.yaml
git commit -m "ops: add sealos deployment for claude proxy"
```

### Task 11: Run full verification and browser smoke tests

**Files:**
- Modify: `sync-server/test/account-bootstrap.proxy.test.js`
- Modify: `sync-server/test/completion-runner.test.js`
- Modify: `test/inject-proxy-rewrite.test.js`

**Step 1: Add the last failing coverage before sign-off**

Add explicit assertions for:
- `message_limit` emitted before `message_stop`
- `message_start` / `content_block_*` / `message_delta` / `message_stop` CRLF framing
- `retry_completion` removes only the final assistant turn
- `tree=True` reflects the freshly stored assistant turn after a streamed completion
- artifact download still works after a page reload because it is served from PostgreSQL, not localStorage

**Step 2: Run the focused suites**

Run: `cd /home/sertdev/Projects/claude-intercepter/sync-server && npm test`
Expected: PASS with all proxy route, repository, tool, and streaming suites green.

Run: `cd /home/sertdev/Projects/claude-intercepter && node --test test/inject-proxy-rewrite.test.js`
Expected: PASS with both browser-build rewrite suites green.

**Step 3: Run manual smoke checks**

Run the extension against the local or deployed proxy and verify:
- new chat creates a Postgres-backed conversation
- refresh after streamed answer reloads the same assistant turn
- retry removes the previous assistant turn and streams a new one
- `memory_user_edits` add/replace/remove flows update the Claude memory view
- `create_file` followed by `present_files` downloads the persisted artifact
- no frontend spinner stall and no `message_store_sync_blocked` errors in the console

**Step 4: Capture the deploy commands**

Run: `kubectl --kubeconfig /home/sertdev/Projects/claude-intercepter/kubeconfig.yaml -n ns-0ffzk4u2 apply -f /home/sertdev/Projects/claude-intercepter/deploy/sealos`
Expected: resources configured in namespace `ns-0ffzk4u2`.

Run: `kubectl --kubeconfig /home/sertdev/Projects/claude-intercepter/kubeconfig.yaml -n ns-0ffzk4u2 rollout status deployment/claude-proxy`
Expected: `deployment "claude-proxy" successfully rolled out`.

**Step 5: Commit**

```bash
cd /home/sertdev/Projects/claude-intercepter
git add sync-server/test/account-bootstrap.proxy.test.js sync-server/test/completion-runner.test.js test/inject-proxy-rewrite.test.js
git commit -m "test: harden claude proxy verification coverage"
```

Plan complete and saved to `docs/plans/2026-03-23-claude-proxy-migration.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
