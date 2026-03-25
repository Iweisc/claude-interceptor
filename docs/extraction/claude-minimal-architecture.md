# Minimal Architecture Analysis: Routing claude.ai Through LiteLLM

**Date:** 2026-03-22
**Context:** Cloudflare blocks server-to-server requests from the proxy to claude.ai. The current full-proxy approach is fundamentally broken for any route that needs to passthrough to claude.ai.

---

## Background: What the Current System Does

The existing system has three layers:

1. **Browser extension** (inject.js, ~414 LOC): Monkey-patches `fetch` and `XMLHttpRequest` in the page context. Rewrites URL destinations from `claude.ai` to the proxy server for "proxy-owned" routes (conversations, memory, completions, artifacts). Patches `/api/account` and `/api/bootstrap` responses in-browser to spoof Max plan capabilities.

2. **Sync server** (Express + PostgreSQL, ~2,100 LOC across 17 files): Implements a parallel conversation store. Manages conversations, history, memories, and artifacts in PostgreSQL. Converts completion requests into Anthropic Messages API format and streams them through LiteLLM. Handles tool execution (web search via SearXNG, memory management, conversation search, artifact creation). SSE response translation from LiteLLM wire format to claude.ai wire format.

3. **Plan spoofing** (spread across all layers): Patches capabilities arrays, billing_type, rate_limit_tier, GrowthBook/Statsig flags, and clears IDB React Query cache to prevent stale data from overriding patches.

---

## The Core Problem

Cloudflare's bot detection blocks all server-to-server requests from the proxy to claude.ai. This means:

- The `/api/*` catch-all passthrough route returns Cloudflare challenge HTML instead of JSON
- Bootstrap patching on the server side fails (the server cannot fetch the upstream bootstrap)
- User identity resolution via `/api/account` fails from the server
- Any route not handled locally by the proxy returns garbage

The extension's in-browser patching of `/api/account` and `/api/bootstrap` works because those requests originate from the real browser session with real cookies and Cloudflare clearance. The server-side patching of those same endpoints is dead code in production.

---

## Architecture Comparison

### Approach 1: Extension-Only with Response Replacement

**Concept:** Let ALL requests go to real claude.ai normally. Only intercept the completion response stream. The real request hits claude.ai's server (creating the conversation, storing the user message). Then replace the SSE response body with a stream from LiteLLM.

**How it works:**
1. User types message, claude.ai frontend builds completion request
2. Extension's patched `fetch` intercepts the completion POST
3. Extension sends the real request to claude.ai (user message is recorded server-side)
4. claude.ai begins streaming its own response (possibly Haiku on free tier, or the user's actual plan model)
5. Extension DISCARDS the real response stream
6. Extension simultaneously sends the message to LiteLLM (directly from the browser)
7. Extension creates a synthetic SSE ReadableStream and returns it as the fetch Response
8. LiteLLM response is translated to claude.ai SSE format and fed through the synthetic stream
9. claude.ai frontend renders it normally

**On page refresh:**
- claude.ai's server has the user messages AND claude.ai's own native response
- The user sees claude.ai's native response, NOT the LiteLLM response
- This is a degraded experience but not broken -- conversation history is navigable

**What works:**
- ALL non-completion features work perfectly (conversations list, projects, memory, settings, MCP tools, file uploads, Google integrations, DXT extensions -- everything)
- Login/auth works normally
- Plan features that are gated server-side work according to the user's actual plan
- No CORS issues (LiteLLM call is from a content script or background script, not page context)
- No server to maintain, deploy, or pay for
- No PostgreSQL
- No Cloudflare issues at all
- Title generation works (claude.ai generates title from its own response, which exists)
- Retry works (claude.ai has the conversation tree)
- Branching works (native tree structure maintained)

**What breaks:**
- On refresh, the user sees claude.ai's response, not LiteLLM's -- jarring inconsistency
- The conversation tree on claude.ai's server has TWO assistant responses for each turn conceptually (the native one that was discarded, and... no, actually only the native one is stored server-side)
- If the user's plan does not allow completion at all (e.g., no account), this fails at step 4
- Double API cost (one call to claude.ai, one to LiteLLM) -- though on free tier this costs nothing on the claude.ai side
- Tool use from LiteLLM's response will not match claude.ai's tool definitions
- The user message on claude.ai's server references tools/settings the proxy might configure differently

**Complexity:** Low-medium
**Lines of code estimate:** ~300-400 LOC (inject.js modifications + background.js LiteLLM relay)
**Server infrastructure:** None
**Database:** None

---

### Approach 2: Extension-Only with Response Interception (Block Native, Substitute)

**Concept:** Intercept the completion request entirely. Do NOT send it to claude.ai. Send ONLY to LiteLLM. Build the SSE response synthetically.

**How it works:**
1. User types message, claude.ai frontend builds completion request
2. Extension's patched `fetch` intercepts the completion POST
3. Extension BLOCKS the request from reaching claude.ai
4. Extension extracts the prompt, parent_message_uuid, model, attachments, etc.
5. Extension sends to LiteLLM from background script (avoids CORS)
6. Extension constructs a synthetic SSE stream with claude.ai event format:
   - `message_start` with proper UUIDs
   - `content_block_start` / `content_block_delta` / `content_block_stop`
   - `message_delta` with stop_reason
   - `message_stop`
   - `message_limit` (fake, always within_limit)
7. Returns synthetic Response to the patched fetch caller

**On page refresh:**
- claude.ai's server has NO record of the conversation (completion was never sent)
- If inline conversation creation was used, the conversation does not exist on the server
- The page shows an error or empty conversation
- UNLESS we also intercept the conversation creation POST and the GET for tree data

**This cascades into needing to intercept MANY more endpoints:**
- POST `/chat_conversations` (or inline creation via completion) -- must create locally
- GET `/chat_conversations/:id?tree=True` -- must return stored tree
- POST `/chat_conversations/:id/title` -- must handle locally
- PUT `/chat_conversations/:id` -- settings updates
- GET `/chat_conversations_v2` -- conversation list must include our conversations

**This is effectively reimplementing the sync-server but in the browser extension.**

**What works:**
- No server infrastructure needed
- No Cloudflare issues
- User sees consistent responses (always LiteLLM)
- Single API call (no double-billing)

**What breaks:**
- Conversation list: extension must store and serve conversation metadata
- Page refresh: must intercept GET requests and serve stored conversation trees
- Storage limits: browser extension storage is limited (chrome.storage.local ~5MB, Firefox similar though unlimited with `unlimitedStorage` permission)
- Branching: must implement the full parent_message_uuid tree structure
- Title generation: must either fake it or call claude.ai's title endpoint (but that needs the conversation to exist on claude.ai's server)
- ALL claude.ai features that touch conversations break (sharing, search, project assignment)
- Memory tool, conversation search, recent chats -- all need local implementation
- Artifacts -- need local storage and serving
- Effectively the same complexity as the current proxy but with worse storage

**Complexity:** High (arguably higher than the proxy approach, because browser extension storage and API surface is more constrained)
**Lines of code estimate:** ~1,500-2,000 LOC in extension alone (conversation store, tree builder, SSE generator, title handling, list serving)
**Server infrastructure:** None
**Database:** IndexedDB or extension storage (limited)

---

### Approach 3: Minimal Proxy (Completion Endpoint Only)

**Concept:** The proxy server handles ONLY the completion/retry_completion endpoints. Everything else goes directly to claude.ai. The extension patches bootstrap/account responses in-browser (as it already does).

**How it works:**
1. Extension patches `/api/account` and `/api/bootstrap` responses in-browser (already working)
2. ALL other requests go to real claude.ai (conversations, memory, projects, settings, etc.)
3. For completion requests ONLY, the extension redirects to the minimal proxy
4. The proxy receives the completion body, extracts the prompt and conversation context
5. The proxy calls LiteLLM and streams the SSE response back in claude.ai format
6. The proxy does NOT need PostgreSQL -- it does not store conversations

**The critical question: does claude.ai's server need the assistant response?**

Yes. When the user refreshes, claude.ai fetches `GET /chat_conversations/:id?tree=True`. If the completion request was redirected away from claude.ai, the server has the user's message but no assistant response. The conversation tree will show the user message as a "dangling human message."

**Mitigation options:**
a. Accept the dangling message on refresh. The user can keep chatting (the next completion will include the previous user message as context). Ugly but functional.
b. After LiteLLM completion finishes, POST the assistant response to claude.ai's server. **Problem:** there is no known endpoint to retroactively add an assistant message to a conversation. The completion endpoint is the only way, and it would trigger ANOTHER completion.
c. Store the assistant response in extension storage and inject it into the GET tree response. This adds ~200 LOC to the extension but solves the refresh problem cleanly.

**Option (c) in detail:**
- After LiteLLM streams the response, extension stores `{conversationId, messages: [{uuid, content, parent_uuid}]}` in extension storage
- When the frontend fetches `GET /chat_conversations/:id?tree=True`, the extension intercepts the response
- Extension merges its stored assistant messages into the `chat_messages` array
- Frontend renders the merged tree
- This is a targeted, small interception (~100-200 LOC) vs. the full conversation store approach

**But wait -- inline conversation creation.**
With the default `claudeai_inline_conversation_creation` flag ON, the first message includes `create_conversation_params` in the completion body. If the completion request is redirected to the proxy, the conversation is never created on claude.ai's server. The subsequent `GET /chat_conversations/:id?tree=True` returns 404.

**Solution:** The proxy (or extension) sends the `create_conversation_params` as a separate POST to create the conversation on claude.ai BEFORE or AFTER the LiteLLM call. But this requires the proxy to talk to claude.ai -- which is blocked by Cloudflare.

**Alternative:** The extension sends the creation POST directly from the browser (in page context, with cookies). The extension can extract `create_conversation_params` from the completion body, fire a separate `POST /chat_conversations` to claude.ai, then redirect the completion to the proxy.

**What works:**
- Most features work (everything except completion is native)
- Plan spoofing works (in-browser patching)
- No database for conversations
- Simpler server (~200 LOC: one endpoint, SSE translation, LiteLLM call)
- Conversation list, projects, settings all work natively
- With option (c), refresh works

**What breaks:**
- Tools defined by the proxy (create_file, show_widget, web_search, memory) -- these require server-side execution. Without server-side tool execution, the model can only use claude.ai's built-in tools.
- If using LiteLLM with a non-Anthropic model (e.g., OpenAI), the tool format may differ
- Title generation: if the completion was redirected, claude.ai's title endpoint gets called but the server has no assistant response to generate from. **Solution:** extension intercepts title generation and generates one locally or sends the LiteLLM response text.
- Inline creation needs careful handling (extension must split the request)

**Complexity:** Medium
**Lines of code estimate:**
- Proxy server: ~200-300 LOC (single file, no DB, no tool execution)
- Extension changes: ~200-300 LOC (inline creation handling, tree merging, title interception)
- Total: ~400-600 LOC
**Server infrastructure:** One small Node.js server (no database)
**Database:** None (extension storage for response cache only)

---

### Approach 4: Current Full Proxy (What Exists Today)

**What it does:**
- Full parallel conversation store in PostgreSQL
- All conversation CRUD operations handled by the proxy
- All completion routing through LiteLLM
- Server-side tool execution (web search, memory, artifacts, conversation search)
- SSE format translation
- Bootstrap/account patching (on both server and browser sides)
- Extension rewrites 10+ URL patterns to point at the proxy

**What works (in theory):**
- Complete standalone experience
- Conversation persistence in proxy DB
- Custom tools (web search, memory, artifacts)
- Full SSE translation

**What is broken:**
- Cloudflare blocks ALL server-to-server requests to claude.ai
- The `/api/*` catch-all passthrough returns Cloudflare challenge HTML
- Bootstrap patching on the server side fails
- User identity resolution from the server fails (has to fall back to extension-provided email)
- ANY claude.ai feature not explicitly reimplemented in the proxy fails silently or with errors
- The proxy must be updated every time claude.ai changes their API
- 30+ API endpoints called on page load are unhandled -- some fail silently, some cause console errors, some break features

**What is lost vs. native claude.ai:**
- Conversation sharing
- Project assignment/management
- Google Drive/Gmail/Calendar integrations
- DXT extensions
- Cowork mode
- MCP tool marketplace
- Notification preferences
- Native web search (replaced with SearXNG)
- Native artifact rendering
- Real rate limit information
- Desktop app integration

**Complexity:** Very high
**Lines of code:** ~4,031 LOC (measured) across 17 server files + 3 extension files per browser
**Server infrastructure:** Node.js server + PostgreSQL database + SearXNG instance
**Database:** PostgreSQL with 2 tables, 4 indexes

---

## Comparison Matrix

| Criterion | Approach 1 (Replace) | Approach 2 (Block) | Approach 3 (Min Proxy) | Approach 4 (Full Proxy) |
|---|---|---|---|---|
| **Total LOC** | ~300-400 | ~1,500-2,000 | ~400-600 | ~4,031 |
| **Server needed** | No | No | Minimal (1 file) | Full (17 files) |
| **Database** | No | IndexedDB | No | PostgreSQL |
| **Conversation list** | Native | Broken/custom | Native | Custom (DB) |
| **Page refresh** | Shows native response | Broken without full store | Works with tree merge | Works (from DB) |
| **Login/auth** | Native | Native | Native | Native |
| **All claude.ai features** | Yes | No | Mostly yes | No |
| **Consistent responses** | No (diverges on refresh) | Yes | Yes (with tree merge) | Yes |
| **Custom tools** | No | Possible | No (or limited) | Yes |
| **Cloudflare issues** | None | None | None (proxy only talks to LiteLLM) | Fatal (proxy blocked) |
| **Double API cost** | Yes | No | No | No |
| **Branching/retry** | Native | Must reimplement | Needs care | Custom |
| **Maintenance burden** | Very low | High | Low | Very high |

---

## Recommendation

**Approach 3 (Minimal Proxy) is the best balance**, but only if we solve two key problems cleanly:

### Problem 1: Inline Conversation Creation

When `claudeai_inline_conversation_creation` is ON (the current default), the first completion request includes `create_conversation_params`. If we redirect this to the proxy, the conversation never gets created on claude.ai.

**Solution:** The extension splits the first completion request:
1. Extract `create_conversation_params` from the body
2. Send a POST to claude.ai `/api/organizations/:orgId/chat_conversations` with the creation params (this stays in-browser, no Cloudflare issue)
3. Strip `create_conversation_params` from the body and redirect the completion to the proxy
4. The proxy calls LiteLLM and streams the response

### Problem 2: Missing Assistant Messages on Refresh

The proxy returns the LiteLLM response, but claude.ai's server never sees it.

**Solution:** The extension stores the assistant response and merges it into tree GET responses:
1. As the LiteLLM SSE stream arrives, extension captures the assistant message content
2. On `message_stop`, store `{conversationId, assistantMessage}` in extension storage
3. When `GET /chat_conversations/:id?tree=True` returns, extension intercepts the response
4. If the stored assistant message's parent UUID matches a dangling human message, merge it in
5. This gives the frontend a complete tree with all messages

### Problem 3: Title Generation

After completion, the frontend calls `POST /chat_conversations/:id/title` with `{message_content: "..."}`. Since the assistant response only exists in extension storage, we must intercept this.

**Solution:** The extension intercepts the title POST, constructs the body from the stored LiteLLM response, and lets it pass through to claude.ai's server. Or, the extension generates a title locally (first 30 chars of the prompt, matching the fallback behavior).

---

## Proposed Minimal Architecture

```
+------------------+        +------------------+
|   claude.ai      |        |    LiteLLM       |
|   (all features) |        |    (completions)  |
+--------+---------+        +--------+---------+
         ^                           ^
         |                           |
         | (native requests)         | (completion only)
         |                           |
+--------+---------------------------+---------+
|              Browser Extension               |
|                                              |
|  1. Patch /api/account (add capabilities)    |
|  2. Patch /api/bootstrap (add capabilities)  |
|  3. Clear IDB cache (prevent stale data)     |
|  4. Intercept completion POST:               |
|     a. Split inline creation params          |
|     b. Send creation to claude.ai            |
|     c. Send completion to proxy              |
|  5. Cache assistant responses                |
|  6. Merge responses into tree GET            |
|  7. Handle title generation                  |
+----------------------------------------------+
                      |
                      | (completion only, via background script)
                      v
         +------------------------+
         |  Minimal Proxy Server  |
         |  (~200 LOC, 1 file)    |
         |                        |
         |  POST /completion      |
         |  -> LiteLLM -> SSE     |
         |  (no DB, no state)     |
         +------------------------+
```

**What we keep from the current codebase:**
- inject.js: Plan spoofing patches (patchAccountPayloadForBrowser, patchBootstrapPayloadForBrowser), IDB cache clearing, fetch/XHR monkey-patching
- content.js: Script injection mechanism
- background.js: Cookie forwarding

**What we rewrite:**
- inject.js URL rewriting: Only redirect completion URLs (not conversations, memory, artifacts, etc.)
- New: SSE response caching logic in extension
- New: Tree response merging in extension
- Proxy server: Strip down to a single completion endpoint with SSE translation

**What we delete:**
- Entire sync-server (except completion-runner SSE translation logic, which moves to the minimal proxy)
- All conversation/memory/artifact repository code
- All tool definition and tool execution code
- All route handlers except completion

**Estimated effort:**
- Extension modifications: 1-2 days
- Minimal proxy: half a day
- Testing: 1-2 days
- Total: 3-5 days

---

## Alternative: Approach 1 Could Be Even Simpler (If Refresh Divergence Is Acceptable)

If the team accepts that page refresh shows the native claude.ai response (not the LiteLLM one):

- **Zero server infrastructure**
- **~300 LOC total changes**
- **1-2 days to implement**
- Works with any LiteLLM endpoint accessible from the browser

The implementation would be:
1. Keep all current plan spoofing (capabilities, IDB cache clear)
2. In the fetch interceptor, detect completion URLs
3. Let the original request fire (to claude.ai)
4. Simultaneously, send the same prompt to LiteLLM from the background script
5. Return a synthetic Response whose ReadableStream emits LiteLLM SSE events translated to claude.ai format
6. Discard claude.ai's actual response

The only caveat: the user must have a valid claude.ai account (free or paid) for the native request to succeed. If they have no account, step 4 fails. But this is already a requirement for the extension to work at all (it needs to load claude.ai's frontend).

---

## Key Technical Details for Implementation

### SSE Format Translation (LiteLLM -> claude.ai)

LiteLLM using Anthropic Messages API format produces events that are nearly identical to what claude.ai emits. The main differences:

1. `message_start`: claude.ai adds `parent_uuid`, `uuid`, `trace_id`, `request_id` fields on the message object. These must be synthesized.
2. `content_block_start`: claude.ai adds `start_timestamp`, `stop_timestamp`, `flags`, `citations` (for text blocks), and tool-specific fields (`message`, `integration_name`, etc. for tool_use blocks).
3. `content_block_stop`: claude.ai adds `stop_timestamp`.
4. `message_delta`: claude.ai strips `usage`.
5. After `message_stop`: claude.ai emits a `message_limit` event with rate limit window info.
6. Thinking blocks: LiteLLM emits `signature_delta` which claude.ai does NOT handle (the current bundle version has no signature_delta handler). The extension must either strip these or convert to `thinking_delta`.

The current `augmentClaudeEvent` function in `/sync-server/src/services/sse.js` already handles items 1-5 correctly. This is ~85 LOC that can be reused.

### Inline Creation Splitting

The completion body when `create_conversation_params` is present:
```json
{
  "prompt": "...",
  "parent_message_uuid": "00000000-0000-4000-8000-000000000000",
  "create_conversation_params": {
    "name": "",
    "model": "claude-sonnet-4-5-20250929",
    "project_uuid": null,
    "is_temporary": false,
    ...
  },
  ...other fields...
}
```

The extension should:
1. Detect `create_conversation_params` in the body
2. Extract it and POST to claude.ai's `POST /api/organizations/:orgId/chat_conversations`
3. Remove `create_conversation_params` from the completion body
4. Forward the modified body to the proxy (or LiteLLM directly)

### Tree Response Merging

When `GET /chat_conversations/:id?tree=True` returns, the response `chat_messages` array will have user messages but possibly missing the corresponding assistant messages (if they were only generated by LiteLLM). The extension should:

1. After each completion, store: `{conversationId, message: {uuid, parent_message_uuid, sender: "assistant", content: [...], created_at, updated_at, stop_reason}}`
2. On tree GET response interception, find any stored messages whose `parent_message_uuid` matches a message in the tree but whose own UUID is NOT in the tree
3. Insert them at the correct position in `chat_messages` and update `current_leaf_message_uuid`
4. Clean up stored messages when the conversation is deleted or after some TTL

Storage requirement is small: typically just the most recent assistant message per conversation. Extension storage is adequate.
