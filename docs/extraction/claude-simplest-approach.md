# Minimum Viable Architecture: Claude Proxy

## The Constraint

Server-to-server requests from the proxy to real claude.ai get Cloudflare-blocked.
This means the proxy **cannot** be a transparent pass-through for unknown routes.
The catch-all handler at line 195 of `app.js` (`app.use('/api', ...)`) will fail for
any route the proxy doesn't explicitly own -- upstream fetches from a server IP
trigger Cloudflare bot detection.

This constraint drives the entire architecture: the extension must be SELECTIVE
about which URLs get rewritten to the proxy.

---

## Current State Inventory

### sync-server (2,889 lines across 12 source files)
- **app.js**: Express app, CORS, rate limiting, bootstrap/account proxy (Cloudflare-blocked), catch-all passthrough (Cloudflare-blocked)
- **routes/completion.js**: completion + retry_completion
- **routes/conversations.js**: create, update, get, title
- **routes/memory.js**: list memories, subscription_details stub
- **routes/artifacts.js**: download-file, artifact tools, artifact versions
- **services/completion-runner.js**: LiteLLM streaming, tool loop (up to 8 iterations), history assembly
- **services/claude-upstream.js**: plan spoofing (server-side duplicate of inject.js logic), upstream fetch helpers
- **services/claude-shapes.js**: Response shape builders for conversations/messages/memory
- **services/sse.js**: SSE event formatting, augmentation for claude.ai wire format
- **services/system-prompt.js**: System prompt builder with memory, styles, project instructions
- **services/tool-definitions.js**: create_file, present_files, show_widget, web_search, memory, conversation_search, recent_chats
- **services/tool-runner.js**: Tool execution (web search via SearXNG, memory CRUD, artifact storage)
- **services/session-identity.js**: Cookie -> email resolution cache
- **repositories/conversations.js**: PostgreSQL CRUD for conversations (history, artifacts, search)
- **repositories/memories.js**: PostgreSQL CRUD for memories
- **db.js**: PostgreSQL pool + schema init (conversations + memories tables)
- **config.js**: Environment variable parsing

### inject.js (414 lines, duplicated for chrome)
- URL rewriting: selective proxy vs direct routing
- Plan spoofing: bootstrap + account response patching (client-side)
- Completion body merging: model + thinking settings from popup
- Proxy header injection: cookie forwarding, LiteLLM credentials, user email
- XHR + fetch override

### PostgreSQL Schema
- `conversations` table: id, user_id, org_id, title, history (JSONB), settings (JSONB), artifacts (JSONB)
- `memories` table: id, user_id, text, created_at

---

## Architecture Analysis: Three Approaches

### Approach A: Current Architecture (stateful proxy, everything server-side)

**What the proxy owns:**
- bootstrap + account patching (server-side) -- BROKEN by Cloudflare
- completion + retry_completion -> LiteLLM
- conversation CRUD (create, get, update, title)
- memory (list, via tool)
- subscription_details stub
- artifacts (download, versions, tools)
- catch-all passthrough for unknown /api/ routes -- BROKEN by Cloudflare

**Complexity:** ~2,900 lines server, ~580 lines extension, PostgreSQL required

**What works:** Everything that doesn't need upstream Cloudflare access.

**What's broken:**
- `GET /api/account` from proxy -> Cloudflare blocked
- `GET /api/bootstrap/:id/app_start` from proxy -> Cloudflare blocked
- Catch-all passthrough (`app.use('/api', ...)`) -> Cloudflare blocked for any route the React app adds that we don't explicitly handle
- The proxy claims to handle account/bootstrap but the server can't actually fetch them

**Verdict:** Dead architecture. The proxy cannot be a transparent reverse proxy for claude.ai.

---

### Approach B: Hybrid (thin proxy + smart extension)

**Key insight:** The extension already does client-side plan spoofing for bootstrap/account.
The proxy only needs to handle routes where it provides different behavior (LiteLLM
completion, conversation storage, memory storage). Everything else goes directly to
claude.ai from the browser (no Cloudflare issues since it's a real browser).

**What the proxy owns (minimum set):**

| Route | Why proxy must own it |
|-------|----------------------|
| `POST .../completion` | Core purpose: route to LiteLLM |
| `POST .../retry_completion` | Retry needs access to conversation history to remove last turn |
| `POST .../chat_conversations` | Completion creates messages in a conversation; proxy must know about it |
| `GET .../chat_conversations/:id?tree=True` | Page reload needs to reconstruct the message tree from proxy storage |
| `PUT .../chat_conversations/:id` | Settings updates (model, thinking mode) that affect completions |
| `POST .../chat_conversations/:id/title` | Title generation after first message |
| `GET .../memory` | Memory tool reads this; proxy stores memories |
| `GET .../subscription_details` | Must return claude_max stub (real claude.ai would return free tier) |
| `GET /wiggle/download-file` | Artifacts are stored in proxy DB, not on real claude.ai |
| `GET /artifacts/.../tools` | Empty tools array for artifact rendering |
| `GET .../artifacts/:id/versions` | Artifact file listing from proxy DB |

**What goes directly to claude.ai (no proxy involvement):**

| Route | Why it can stay on claude.ai |
|-------|------------------------------|
| `/api/bootstrap/:id/app_start` | Extension patches response client-side (proven) |
| `/api/account` | Extension patches response client-side (proven) |
| `/api/auth/*` | Auth is between browser and claude.ai |
| `/api/organizations/:id/chat_conversations_v2` | Sidebar listing -- see discussion below |
| `/api/organizations/:id/list_styles` | Native feature |
| `/api/organizations/:id/cowork_settings` | Native feature |
| `/api/organizations/:id/projects/*` | Native feature |
| `/api/organizations/:id/skills/*` | Native feature |
| `/api/organizations/:id/connectors/*` | Native feature (MCP) |
| `/api/organizations/:id/files/*` | File uploads go to real claude.ai |
| `/api/event_logging/*` | Telemetry |
| `/api/account_profile` | Profile settings |
| Everything not matched by proxy regex | Falls through to direct claude.ai |

**The sidebar conversation listing problem:**

`chat_conversations_v2` is the sidebar endpoint. Options:
1. **Let it go to real claude.ai** -- sidebar shows native conversations only, not proxy ones. User clicks a proxy conversation link directly or from history -> proxy serves it. Sidebar is incomplete but functional.
2. **Proxy owns it** -- must return a list of proxy conversations. But then native conversations disappear from sidebar.
3. **Extension merges both** -- fetch from both claude.ai and proxy, merge results in inject.js. More complex extension code but complete sidebar.

Recommendation: **Option 1 for MVP**. Proxy conversations are accessed via URL navigation.
The sidebar shows native conversations. This is the simplest path and avoids a whole
set of listing/pagination/cursor logic on the proxy.

**Complexity:**
- Server: ~1,800 lines (remove claude-upstream.js plan spoofing, remove catch-all, remove server-side bootstrap/account handlers)
- Extension: ~580 lines (already works this way -- inject.js already has selective routing)
- PostgreSQL: still required (for conversation history, memories, artifacts)

**What works perfectly:**
- Plan spoofing (client-side, already proven)
- Completions via LiteLLM
- Tool execution (web search, memory, artifacts)
- Page reload with conversation tree reconstruction
- Retry (needs history from DB)
- All native claude.ai features (projects, styles, MCP, etc.)

**What breaks or degrades:**
- Sidebar doesn't show proxy conversations (minor -- user navigates via URL)
- If conversation listing is needed, extension must merge two sources

**Changes needed from current codebase:**
1. Remove from `app.js`: `handlePatchedJsonProxy`, the `/api/account` route, the `/api/bootstrap/:id/app_start` route, the catch-all `app.use('/api', ...)`, the `claude-upstream.js` imports for plan patching
2. Remove `services/claude-upstream.js` entirely (or reduce to just `buildUpstreamHeaders` for image fetching)
3. Keep `attachResolvedUser` but change it: instead of fetching `/api/account` upstream (Cloudflare-blocked), rely ONLY on `X-User-Email` header from the extension. Fail if not present.
4. inject.js: already selective. No changes needed -- `PROXY_OWNED_ORG_ROUTE_RE` already matches exactly the right routes, `shouldBypassProxy` already lets bootstrap/account through to real claude.ai.

---

### Approach C: Stateless Proxy (no PostgreSQL)

**The radical question:** Can the proxy be stateless, with conversations stored only
in the client (localStorage / IndexedDB)?

**How it would work:**
- Extension tracks all SSE messages in localStorage, keyed by conversation UUID
- On each completion request, the extension reconstructs the full messages array from
  its local store and sends it in the request body
- Proxy receives the full messages array, calls LiteLLM, streams back. No DB needed.
- On retry, the extension removes the last assistant turn locally and re-sends.

**What this eliminates:**
- PostgreSQL entirely
- conversations.js repository
- All conversation CRUD routes (create, get, update)
- `attachResolvedUser` middleware (no DB = no user scoping needed)
- Session identity cache

**What this keeps:**
- completion route (receives full messages, calls LiteLLM)
- memory routes + memory repository (still needs persistent storage -- but could use a file or SQLite)
- artifact storage (could use localStorage, but size limits are a concern)
- SSE formatting, tool execution

**Complexity:**
- Server: ~800-1,000 lines (completion-runner, sse, tool-definitions, tool-runner, system-prompt, minimal express app)
- Extension: ~800 lines (current 580 + ~220 for message tracking, local conversation storage, body reconstruction)
- Database: SQLite or flat file for memories only, or even just localStorage

**Critical analysis of feasibility:**

1. **Completion request body**: Currently the client sends `{ prompt, parent_message_uuid, files, timezone, model, ... }`. It does NOT send the full conversation history. The proxy reads history from PostgreSQL. To go stateless, the extension would need to intercept the completion request, look up the conversation's message history from its local store, and inject it into the request body. This is ~50 lines of extension code.

2. **Page reload / conversation tree**: When you navigate to `/chat/conv-id`, the React app fetches `GET .../chat_conversations/conv-id?tree=True` to render the message history. If conversations are only in localStorage, the proxy can't serve this. Two options:
   - (a) Extension intercepts this GET and serves from localStorage. Possible but hacky -- you'd need to construct a fake Response with the right shape.
   - (b) The proxy still stores conversations (back to Approach B).

   **This is the killer problem.** If you open a proxy conversation in a new tab, or reload the page, or navigate away and back, the React app needs the conversation tree from the server. localStorage is per-origin (claude.ai), so it persists across tabs -- that part works. But intercepting a GET request and returning a synthetic Response from localStorage is fragile.

3. **Retry**: The client sends `POST .../retry_completion` with minimal body. The proxy currently reads history from DB, removes last assistant turn, re-runs. Without a DB, the extension would need to reconstruct and send the history in the retry body too.

4. **Tool execution state**: When the model calls tools (web_search, memory, create_file), the proxy executes them server-side and continues the loop. The tool results are part of the conversation history. If history is only in the client, the proxy would need to return tool results to the client mid-stream for storage, then the client sends them back on the next loop iteration. But the tool loop happens server-side within a single HTTP request -- the proxy makes up to 8 LiteLLM calls. The client never sees intermediate tool calls until the stream ends. **This means the proxy must maintain conversation history at least for the duration of a single request**, which it already does in-memory in `completion-runner.js`. The question is just persistence.

5. **Memory**: Needs a persistent store. Even in the stateless approach, memories need a DB (or at minimum, localStorage with sync).

6. **Artifact downloads**: `create_file` stores artifacts in PostgreSQL. Without a DB, artifacts would need to be stored client-side. But `/wiggle/download-file` is a GET from the React app's artifact renderer -- it can't be served from localStorage without another fetch intercept hack.

**Verdict on stateless approach:**

The page-reload problem (point 2) and artifact download problem (point 6) make a
fully stateless proxy impractical without significant extension complexity. You'd
essentially be reimplementing a server in the browser extension.

However, there's a **hybrid stateless** variant worth considering:

### Approach C2: Proxy with In-Memory/Ephemeral Storage

- Use an in-memory store (Map) instead of PostgreSQL for conversations
- Conversations persist for the lifetime of the server process
- On server restart, conversations are lost (acceptable for MVP)
- Memories could use SQLite (embedded, no external dependency)

**Complexity:**
- Server: ~1,600 lines (same as Approach B but replace pg repositories with in-memory Maps)
- Extension: ~580 lines (unchanged)
- Database: SQLite for memories only (or even a JSON file)
- No PostgreSQL dependency

**What works:** Everything from Approach B, minus persistence across server restarts.

**What breaks:** Conversations lost on server restart. Acceptable if the user understands
this is ephemeral. Could add optional SQLite persistence later.

---

## Recommendation: Approach B with Simplifications

### The Minimum Viable Architecture

```
  Browser (claude.ai)                   Proxy Server
  ==================                    ============

  inject.js:                            Routes:
  - fetch override                      - POST completion -> LiteLLM
  - selective URL rewriting             - POST retry_completion -> LiteLLM
  - client-side plan spoofing           - POST chat_conversations (create)
    (bootstrap + account patching)      - GET  chat_conversations/:id (tree)
  - proxy header injection              - PUT  chat_conversations/:id (update)
  - completion body merging             - POST chat_conversations/:id/title
                                        - GET  memory
                                        - GET  subscription_details (stub)
                                        - GET  /wiggle/download-file
                                        - GET  /artifacts/.../tools (stub)
                                        - GET  .../artifacts/:id/versions

  Everything else -> claude.ai          PostgreSQL:
  (auth, sidebar, styles, MCP,          - conversations table
   projects, files, billing, etc.)      - memories table
```

### What to Remove from Current Codebase

1. **`app.js` lines 97-130**: `handlePatchedJsonProxy` function -- no longer needed, plan spoofing is purely client-side.

2. **`app.js` lines 132-138**: `/api/account` and `/api/bootstrap` routes -- these fetch from real claude.ai (Cloudflare-blocked). Remove entirely. The extension already patches these client-side.

3. **`app.js` lines 195-227**: Catch-all `app.use('/api', ...)` passthrough -- this is the most dangerous part. Any unhandled route would try to fetch from claude.ai and get Cloudflare-blocked. Replace with a simple 404 handler so unrecognized routes fail fast instead of hanging.

4. **`services/claude-upstream.js`**: Most of this file is server-side plan spoofing (`patchAccountPayload`, `patchBootstrapPayload`, `patchOrganization`, etc.) -- duplicating what inject.js already does. Keep only `buildUpstreamHeaders` (used by `completion-runner.js` for image preview fetching) and `fetchUpstreamJson` (if image fetching still needs it). Or refactor image fetching to use the cookie header directly.

5. **`app.js` lines 140-180**: `attachResolvedUser` middleware -- currently falls back to fetching `/api/account` from upstream if `X-User-Email` header is missing. This upstream fetch is Cloudflare-blocked. Simplify: require `X-User-Email` header, fail with 401 if missing. The extension always sends this header (set from the account response it already patches).

6. **`services/session-identity.js`**: Only needed to cache email from upstream account fetches. If we require `X-User-Email` from the extension, this entire service is unnecessary.

### What to Keep

Everything else stays. The completion runner, SSE formatting, tool execution, system prompt building, conversation/memory repositories -- these are the core value of the proxy and work correctly today.

### Net Result

| Metric | Before | After |
|--------|--------|-------|
| Server-side lines | ~2,889 | ~2,200 |
| Files removed | 0 | 1 (session-identity.js) |
| Files simplified | 0 | 2 (app.js, claude-upstream.js) |
| Extension changes | 0 | 0 (already correct) |
| External dependencies | PostgreSQL | PostgreSQL |
| Cloudflare-blocked routes | 3+ | 0 |
| Proxy endpoints | ~12 + catch-all | ~12 (explicit only) |

### Upgrade Path

Once the MVP works:
1. **Sidebar integration**: Add `GET .../chat_conversations_v2` route that returns proxy conversations, or have the extension merge proxy + native lists.
2. **Drop PostgreSQL**: Replace with SQLite for simpler deployment (single binary + db file).
3. **Drop PostgreSQL entirely**: Move to Approach C2 (in-memory conversations + SQLite memories) for zero external dependencies.

---

## Detailed Diff: What Changes in Each File

### `sync-server/src/app.js`

Remove:
- `patchAccountPayload`, `patchBootstrapPayload` imports from claude-upstream
- `createSessionIdentityCache` import
- `sessionIdentityCache` creation
- `handlePatchedJsonProxy` function
- `GET /api/account` route
- `GET /api/bootstrap/:id/app_start` route
- In `attachResolvedUser`: remove the upstream fallback that fetches `/api/account` and the sessionIdentityCache lookup. Just use `X-User-Email` header or fail.
- The catch-all `app.use('/api', ...)` passthrough

Add:
- `app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));` as a safe catch-all

### `sync-server/src/services/claude-upstream.js`

Reduce to only what's needed for `completion-runner.js` image fetching:
- Keep: `buildUpstreamHeaders`
- Keep: `fetchUpstreamJson` (used indirectly for image preview)
- Remove: `patchAccountPayload`, `patchBootstrapPayload`, `patchOrganization`, `patchMemberships`, `patchModels`, `patchFeatureCollection`, `withMaxCapabilities`, `patchBootstrapModelsConfig`, `extractAccountEmail`, `buildPassthroughHeaders`, `proxyUpstreamRequest`

Or inline the image-fetching headers directly in `completion-runner.js` and delete the file.

### `sync-server/src/services/session-identity.js`

Delete entirely.

### Extension files (inject.js, content.js, background.js)

No changes needed. The current selective routing already matches this architecture:
- `shouldBypassProxy` lets bootstrap/account/auth through to real claude.ai
- `shouldProxyRoute` matches only the proxy-owned routes
- Non-matching routes fall through unchanged (direct to claude.ai)
- Plan spoofing is already client-side via `patchBootstrapPayloadForBrowser` and `patchAccountPayloadForBrowser`

---

## Risk Assessment

### Things that could break with this approach

1. **New claude.ai API routes**: If Anthropic adds new API calls that the React app makes, they'll go directly to claude.ai (correct behavior). No proxy involvement needed unless the route interacts with proxy conversations.

2. **Conversation creation race condition**: The React app creates a conversation (POST to proxy), then immediately fetches sidebar list (GET to claude.ai). The proxy conversation won't appear in the sidebar. Not a functional issue, just cosmetic.

3. **Image fetching in completions**: `completion-runner.js` fetches image previews from `claude.ai/api/:orgId/files/:fileUuid/preview` using the forwarded cookie. This is a server-to-server request that could be Cloudflare-blocked. However, this is fetching static assets (images), not API endpoints -- it may work, or it may need the extension to pre-fetch images and include base64 in the completion body.

4. **SearXNG dependency**: Web search requires a SearXNG instance. This is already the case and is independent of the architecture choice.

### Mitigation for image fetching (risk #3)

If Cloudflare blocks image preview fetches from the proxy, two options:
- **Option A**: Extension pre-fetches images, converts to base64, sends in request body. ~30 lines of extension code.
- **Option B**: Skip image support initially. Text-only conversations work perfectly.

---

## Summary

The simplest viable architecture is **Approach B**: the proxy owns only completion,
conversation CRUD, memory, and artifacts. Everything else goes directly to claude.ai.
Plan spoofing stays client-side in the extension (already implemented and proven).
The catch-all passthrough is replaced with a 404 handler.

This requires removing ~600 lines of dead/broken code from the server (upstream
plan spoofing, passthrough proxy, session identity cache) and adding zero lines to
the extension. The result is a proxy that handles exactly the routes it needs to,
with no Cloudflare-blocked server-to-server requests in the critical path.
