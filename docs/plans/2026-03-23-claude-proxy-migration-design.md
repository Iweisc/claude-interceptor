# Claude Proxy Migration Design

**Status:** Approved on 2026-03-23

## Goal
Replace the browser-background interception stack with a Sealos-hosted proxy that fully owns Claude-facing completion, conversation, memory, and plan-spoofing behavior while remaining wire-compatible with the claude.ai frontend.

## Approved Decisions
- Deploy a single Express service at `proxy-ns-0ffzk4u2.usw-1.sealos.app` in namespace `ns-0ffzk4u2`, terminated by the existing `wildcard-cert` TLS secret.
- Treat the proxied `/api/account` email address as the canonical `user_id` for PostgreSQL rows. Cache that email per forwarded session cookie so subsequent requests do not refetch account data unless the cache misses or expires.
- Keep PostgreSQL as the source of truth for conversations, memories, and persisted artifact payloads. The browser is no longer allowed to maintain authoritative conversation state.
- Proxy `/api/bootstrap/:id/app_start` and `/api/account` to Claude, then patch the JSON response so the frontend sees Pro-like capabilities and model access.
- Serve `GET/POST/PUT /api/organizations/:orgId/chat_conversations*` and `GET /api/organizations/:orgId/memory` from PostgreSQL.
- Return `{ "subscription": null, "is_active": false }` for `GET /api/organizations/:orgId/subscription_details`.
- Pass through `GET /api/organizations/:orgId/list_styles`, `skills/*`, `projects/*`, and every other unowned route directly to Claude.
- Never forward completion or retry-completion to Claude. Build the message history from PostgreSQL, call LiteLLM in Anthropic `/v1/messages` format, stream Claude-shaped SSE back to the frontend, and store the resulting exchange in PostgreSQL.
- Commit the user turn before the first SSE byte is written. Commit the assistant turn only after a clean terminal `message_stop`.
- Treat "byte-for-byte identical" as wire-compatible framing, field shapes, event order, and lifecycle semantics. UUIDs, timestamps, and trace IDs will be generated locally, but they must occupy the same structural positions Claude expects.

## Route Ownership

### Proxy-owned API routes
- `GET /api/bootstrap/:id/app_start`
- `GET /api/account`
- `POST /api/organizations/:orgId/chat_conversations`
- `PUT /api/organizations/:orgId/chat_conversations/:convId`
- `GET /api/organizations/:orgId/chat_conversations/:convId?tree=True`
- `POST /api/organizations/:orgId/chat_conversations/:convId/completion`
- `POST /api/organizations/:orgId/chat_conversations/:convId/retry_completion`
- `GET /api/organizations/:orgId/memory`
- `GET /api/organizations/:orgId/subscription_details`

### Pass-through API routes
- `GET /api/organizations/:orgId/list_styles`
- `skills/*`
- `projects/*`
- Every other `/api/*` route not listed above

### Auxiliary non-API routes the proxy also needs to own
- `GET /wiggle/download-file?path=...`
- `GET /artifacts/wiggle_artifact/:artifactId/tools`

Claude's file artifact UI uses these routes after `create_file` and `present_files`. If they are left on `claude.ai`, file downloads diverge from the server-stored conversation state.

## Completion Lifecycle
1. Parse and validate the incoming completion body.
2. Resolve the user email from the session-email cache or by proxying `/api/account`.
3. Load the conversation row for `(user_id, org_id, conv_id)`.
4. Commit the incoming user turn to PostgreSQL before starting the stream.
5. Build the Anthropic-format message array from stored history, including previous tool-use and tool-result turns.
6. Build the system prompt from request context, stored memories, and project metadata still present in the request body.
7. Call LiteLLM at the `X-LiteLLM-Endpoint` target with the `X-LiteLLM-Key` header and Claude-compatible tool definitions.
8. Stream SSE back with `\r\n` framing and Claude-compatible event order:
   - `message_start`
   - repeated `content_block_start` / `content_block_delta` / `content_block_stop`
   - `message_delta`
   - injected `message_limit`
   - `message_stop`
9. If LiteLLM emits tool calls, execute them synchronously, emit tool-result blocks, append tool-result turns, and continue for up to 8 loops.
10. On success, persist the final assistant turn and updated artifacts, then end the stream.
11. On failure or disconnect, stop streaming cleanly and leave only the already-committed user turn.

## Data Model

### Conversations
Keep the current `conversations` table and extend it so each row can fully reproduce Claude's tree view and artifact downloads:
- `id TEXT`
- `user_id TEXT`
- `org_id TEXT`
- `title TEXT`
- `history JSONB`
- `settings JSONB`
- `artifacts JSONB`
- `updated_at TIMESTAMPTZ`

`history` stores normalized Claude-like turns, not browser-local tracker objects. `artifacts` stores `create_file` payloads keyed by path so file downloads survive refreshes and retries.

### Memories
Keep the current `memories(user_id, text, created_at)` model. Expose both memory list responses for Claude-facing routes and tool-friendly CRUD operations for `memory_user_edits`.

### Session identity cache
Use an in-memory TTL cache keyed by a stable digest of `X-Forward-Cookie`. The cached value is the email extracted from `/api/account`. Cache misses refetch from Claude.

## Extension Shape
- Remove both `background.js` files entirely.
- Reduce `content.js` to script injection plus minimal CSS.
- Reduce `inject.js` to:
  - clear the React Query IndexedDB cache
  - clear GrowthBook/Statsig-related localStorage keys
  - rewrite owned requests to the proxy
  - attach `X-Forward-Cookie`, `X-LiteLLM-Endpoint`, and `X-LiteLLM-Key`
  - overlay stored popup model/thinking settings onto completion request JSON before forwarding
- Keep popup settings for endpoint, model, API key, and thinking budget only.

## Verification Targets
- No `message_store_sync_blocked` errors after refresh or retry.
- No stuck spinner after `message_stop`.
- `tree=True` reads always match the just-streamed assistant turn.
- `retry_completion` removes only the last stored assistant turn and produces a fresh streamed answer.
- `create_file` / `present_files` downloads still work after a page refresh because the proxy, not the browser, owns the artifact payload.
