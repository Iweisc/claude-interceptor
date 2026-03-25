# Claude.ai Frontend Error Handling & Defensive Behavior Spec

Bundle: `index-DcrCrePJ.js` (~7.2MB minified)
Extracted: 2026-03-22

---

## 1. HTTP Error Handling Per Status Code

### Core Error Class: `vo`
```
class vo extends Error {
  constructor(message, type, statusCode, extra, errorCode, endpoint, method)
}
```
Created via `Co()` which parses API error responses:
- Extracts `message`, `type`, `details` from `response.error`
- Extracts `error_code` from `details.error_code`
- Falls back to `error_description` field if no message
- Falls back to `"api_error"` type with fallback message if response has no structured error

### Global Fetch Wrapper (`$h`)
Every API call passes through `$h` which does:
1. **Cloudflare challenge detection**: If `cf-mitigated: challenge` header present, redirects to `/api/challenge_redirect?to=<current_url>`
2. **Session invalidation**: If error is `permission_error` with `account_session_invalid` errorCode, redirects to `/logout?returnTo=/login?returnTo=<current_path>` (skipped for certain whitelisted paths in `Ao`)
3. **JSON parse failure**: Catches invalid JSON and reports via Sentry (`"Got invalid JSON from NextJS response"`)
4. **Additional permitted status code**: Queries can pass `additionalPermittedStatusCode` to suppress errors for a specific status (e.g., bootstrap allows 403)

### Per-Status-Code Behavior

#### 401 Unauthorized
- **Bootstrap**: Returns `undefined` silently (no error, no redirect). The app treats missing bootstrap data as "logged out."
- **GitHub integration**: Invalidates the GitHub connector query cache to force re-auth
- **gRPC mapping**: Maps to `HE.Unauthenticated`

#### 403 Forbidden
- **Bootstrap**: If org-scoped bootstrap returns 403 AND not yet retried, retries WITHOUT the org path. If retried or no org, returns `undefined` silently.
- **Global handler**: If 403 with `"Not authenticated"` message, invalidates the `current_account` query (forces re-bootstrap)
- **Query-level suppression**: Many queries suppress 403 toasts via `noToast: e => e instanceof vo && (404 === e.statusCode || 403 === e.statusCode)`:
  - Cowork trial query
  - Project details query
  - Project conversations query
  - Project accounts query
- **Account context**: If bootstrap returns 403, the app shows unauthenticated state (no account)
- **gRPC mapping**: Maps to `HE.PermissionDenied`

#### 404 Not Found
- **Bootstrap (org-scoped)**: Clears `LAST_ACTIVE_ORG` cookie, retries without org path. On second 404, logs warning and removes `current_account` queries.
- **Toast suppression**: Widely suppressed. Queries that suppress 404 toasts:
  - Subscription status
  - Paused subscription details
  - Conversation snapshots
  - Project details
  - Project conversations
  - Project accounts
  - Cowork trial
  - Git branch comparison (returns `null` on 404)
  - Overage spend limit (returns `{tier, limit: null}`)
- **Completion context**: `not_found_error` type triggers specialized UI (see Section 2)
- **gRPC mapping**: Maps to `HE.Unimplemented`

#### 409 Conflict
- **Completion**: Handled as "duplicate idempotency key". The app logs `"409 Conflict: message already created"`, tracks `claudeai.message.duplicate_key`, sets flags to skip further processing, and does NOT show an error to the user. The completion is treated as already succeeded.
- **Retry classifier**: 409 is classified as `null` (NOT retryable), but is treated as "expected" (no error log)

#### 413 Request Entity Too Large
- **Document upload**: `"Uploaded file is too large. Try uploading a smaller part of the document, or copy/pasting an excerpt from the file."` with `errorType: "file_too_large"`
- **Completion**: If `invalid_request_error` type with 413 status: Shows inline error suggesting starting a new chat or removing attachments. Also tracks `chat.conversation.token_limit_exceeded`.
- **Upload error UI**: `"{fileName}" is too large. Choose a smaller file."`

#### 429 Too Many Requests
- **Completion**: Classified as `null` by retry classifier (NOT auto-retried). Instead triggers the rate limit UI (see Section 4).
- **Document upload**: Creates custom error with `isRateLimit: true`, shown as `"Too many file upload attempts. Please wait and try again later."`
- **Document convert**: Same rate limit error for `/convert_document`
- **Login code verification**: Classified as `"rate_limit"` error type for analytics
- **Upload handler**: Detects `isRateLimit` flag and shows upload-specific rate limit message
- **gRPC mapping**: Maps to `HE.Unavailable`

#### 500 Internal Server Error
- **Retry classifier**: Classified as `"server.generic"` (retryable in expanded/emergency modes)
- **Bootstrap**: Retry is allowed: `retry: (e, t) => !(t instanceof vo && t.statusCode < 500) && e < 1` -- retries once for 500+ errors, never for 4xx
- **Stripe upcoming invoice**: Suppressed via `noToast: e => e instanceof vo && 500 === e.statusCode`
- **addApiError toast**: If status is 500, shows generic message: `"This isn't working right now. You can try again later."`

#### 502/503/504
- **Retry classifier**: Classified as `"server.generic"` (retryable)
- **gRPC mapping**: All map to `HE.Unavailable`

### Error Display Routing

The `addApiError` function decides what to show:
1. **`error_visibility: "user_facing"`**: Shows the actual error message from the API
2. **Status 500**: Shows generic `"This isn't working right now. You can try again later."`
3. **`account_needs_verification`**: Shows `"Your account needs to be verified."`
4. **Network errors (TypeError)**: Suppressed from toast, logged to Sentry with `isSuppressed: true`
5. **HTML error pages**: Detected by `"html>"` in first 50 chars, shows `"We are experiencing technical difficulties. Some functionality may be temporarily unavailable."`
6. **All other errors**: Reported to Sentry with `source: "api-error"` tag

### Global QueryClient Error Handler
- 403 with "Not authenticated": Invalidates `current_account` query
- `noToast` meta can be `true` (suppress all) or a function `(error) => boolean`
- `errorMessage` meta overrides the displayed message
- Non-Error types: Throws wrapped error with `cause`

---

## 2. Completion Error Recovery

### Error Classification Function (`iT`)

Classifies errors into retry categories:
- **`TypeError` with message containing**: `"failed to fetch"`, `"networkerror"`, `"load failed"`, `"connection refused"` -> `"network"`
- **`vo` with type `"overloaded_error"`** -> `"server.overloaded"`
- **`vo` with `statusCode >= 500`** -> `"server.generic"`
- **`vo` with 409, 429, or any 4xx** -> `null` (not retryable)
- **Everything else** -> `null`

### Retry State Machine (`dT` / `executeWithRetry`)

Four retry modes controlled by feature flags:

#### Mode: `"off"`
- No retry. Error thrown immediately.

#### Mode: `"legacy"`
- Only retries `server.overloaded`
- Schedule: 10 attempts, 5s initial delay, 1.5x backoff, 10% jitter

#### Mode: `"expanded"` (current default when idempotency enabled)
- Retries three error classes:
  - **`network`**: 30 max attempts, 500ms initial delay, 2x backoff, 10% jitter, capped at attempt 4 (~8s max delay)
  - **`server.generic`**: 2 max attempts, 8s initial delay, 1.5x backoff, 15% jitter
  - **`server.overloaded`**: 5 max attempts, 8s initial delay, 1.5x backoff, 15% jitter
- **Escalation**: After 3 network failures, escalates to `server.generic` schedule (tracks `chat.completion_retry_escalated`)

#### Mode: `"emergency"`
- Only retries `server.overloaded`
- Schedule: 3 attempts, 45s initial delay, 2x backoff, 20% jitter, capped at attempt 2

### Backoff Function (`xE` / `exponentialBackoffWithJitter`)
```
delay = initialDelayMs * pow(backoffAmount, min(maxAttempts, numPrevAttempts))
jitter = delay * jitterFraction * random(-1, 1)
finalDelay = max(0, delay + jitter)
```
- Supports `AbortSignal` cancellation
- Default: 1s initial, 1.5x backoff, 10% jitter, max 10 attempts

### Backoff Inheritance
- Consecutive failures stored in `localStorage` and `sessionStorage` under key `"ant_completion_backoff_v1"`
- Tracks `{v: 1, consecutiveFailures: N, lastFailureAt: timestamp}`
- Max inherited failures: 15, but capped at 4 for actual delay computation
- **Expiry**: If `lastFailureAt` is older than **300,000ms (5 minutes)**, inheritance is cleared
- On success: Both local and session storage cleared (`JA()`)
- On failure: Counter incremented (`YA()`)

### Runaway Guard
- Hard limit of **50 iterations** in the retry loop, throws if exceeded

### Completion Error UI Dispatch

Error type -> UI component mapping:

| Error Type | Condition | UI Component | Behavior |
|---|---|---|---|
| `incomplete_stream` (sentinel `yT`/`vT`) | Stream interrupted mid-way | `Pk` | "Claude's response was interrupted. This can be caused by network problems or exceeding the maximum conversation length." |
| Non-`vo` error | TypeError, network error | `zk` | "We couldn't connect to Claude. Please check your network connection and try again." |
| `rate_limit_error` | General rate limit | `Uk` | "You've hit your limit for Claude messages." + optional countdown |
| `rate_limit_error` | `concurrents` claim | `Bk` | "Looks like you have too many chats going. Please close a tab to continue." |
| `rate_limit_error` | `thinking_messages_rate_limit_exceeded` | `Fk` | "You've reached your weekly limit for thinking messages." |
| `rate_limit_error` | `opus_messages_rate_limit_exceeded` | **Re-thrown** | Caught by caller to trigger model switch modal |
| `not_found_error` | Message includes `"model:"` | `qk` | "Claude model version not found." |
| `not_found_error` | `chat_conversation_not_found` or `"unknown chat"` | `Gk` | "Conversation not found." |
| `not_found_error` | `model_not_available` errorCode | Raw message | Shows API message directly |
| `not_found_error` | Other | `Vk` | **"This model isn't available right now. You can switch to another model to continue using Claude."** |
| `billing_error` | Any | `$k` | "We had an unexpected billing error, please contact support." |
| `overloaded_error` | Any | `Hk` | "Due to unexpected capacity constraints, Claude is unable to respond to your message. Please try again soon." |
| `invalid_request_error` + 413 | Token limit | `Jk` | "Your message will exceed the length limit for this chat." + "start a new conversation" |
| `invalid_request_error` | `prompt is too long` regex | `Xk` | "This conversation is too long to continue. Start a new chat." |
| `invalid_request_error` | `read_only_mode` extra code | `Wk` | "Due to capacity constraints, chatting with Claude is currently not available." |
| `invalid_request_error` | `exceeded_max_uploads_per_message` | `Zk` | "Your message will exceed the maximum number of files allowed per message." |
| `invalid_request_error` | `exceeded_max_image_limit_per_chat` | `Kk` | "Your message will exceed the maximum image count for this chat." |
| Any other `vo` | Fallthrough | `addApiError` | Default API error toast |

### "This model isn't available right now" -- Exact Trigger Path
1. Error must be `instanceof vo`
2. Error `type` must be `"not_found_error"`
3. Error message must NOT contain `"model:"` (case-insensitive)
4. Error must NOT match `chat_conversation_not_found` or `"unknown chat"`
5. Error `errorCode` must NOT be `"model_not_available"` (that shows the raw message instead)
6. If all above are false, the `Vk` component renders: **"This model isn't available right now. You can switch to another model to continue using Claude."**
7. Additionally tracks `claudeai.unhandled_error_code` event

### Completion Status Polling (`/api/organizations/{org}/chat_conversations/{id}/completion_status`)
- Polled with `poll=false` query param
- Fields returned: `{is_pending, is_error, error_code, error_detail}`
- When `is_pending === true`: Polls every **1 second** via `refetchInterval`
- Feature-gated behind `claudeai_completion_status_sidebar`
- Can be load-shed via `apps_load_shed_controls.claudeai_completion_status_poll`
- On stream start, set to `{is_pending: true, is_error: false, error_code: null, error_detail: null}`

### Partial Completion Recovery
- The `incomplete_stream` sentinel (`vT = new Error("incomplete_stream")`) is thrown when the SSE stream ends without a `message_stop` event
- On incomplete stream: `setFailedStreamRetryData` stores `{prompt, attachments, files}` for the user to retry
- The `stopReason` field determines completion state: if no stop reason and not aborted, throws `vT`
- Content blocks received so far are preserved via the smoother

---

## 3. Network Error Handling

### Network Error Detection
`TypeError` messages checked (case-insensitive):
- `"failed to fetch"` (Chrome)
- `"networkerror"` (Firefox)
- `"load failed"` (Safari)
- `"connection refused"`

### During Streaming
- **SSE `onerror`**: Calls `lT(e)` to check retryability, sets `model_done = true` and `force_smoother_done = true`, then re-throws
- The retry wrapper `dT` catches and potentially retries (up to 30 attempts for network errors in expanded mode)
- **SSE `onclose`**: Sets `model_done = true` (clean close)

### Offline Detection
- `Uu()` function: Returns `window.navigator.onLine` (true if online)
- `qu()` function: Returns `!Uu()` (true if offline)
- Offline status is included in error telemetry: `offline_status: typeof navigator !== "undefined" ? !navigator.onLine : undefined`
- No dedicated offline UI banner found -- offline state is detected but handled via the standard network error path

### SSE Library Reconnection
The SSE fetch library (`PA`) has built-in reconnection:
- On network error in the SSE stream: Waits `f` ms (default 1000ms, server can override via `retry:` field), then retries the connection
- Calls `onerror` callback which can return a custom delay
- Aborted by the caller's signal

### Session/WebSocket Reconnection (MCP/Streamable HTTP)
Default reconnection options (`c1t`):
- `initialReconnectionDelay`: **1000ms**
- `maxReconnectionDelay`: **30000ms (30s)**
- `reconnectionDelayGrowFactor`: **1.5**
- `maxRetries`: **2**

Formula: `delay = min(initialDelay * pow(growFactor, attempt), maxDelay)`

---

## 4. Rate Limiting Behavior

### Rate Limit Windows
The app tracks multiple rate limit windows per organization:
- `"5h"` -- 5-hour rolling window
- `"7d"` -- 7-day rolling window
- `"7d_opus"` -- 7-day window for Opus model specifically
- `"7d_cowork"` -- 7-day window for Cowork sessions
- `"overage"` -- Overage billing window

### Rate Limit Status Values
- `"within_limit"` -- Normal operation
- `"approaching_limit"` -- Warning state (shows "approaching" UI)
- `"exceeded_limit"` -- Hard limit reached (blocks messages)

### Rate Limit Resolution Priority (`Wde`)
When multiple windows are exceeded:
1. If any standard window AND overage are both exceeded -> returns overage window
2. If multiple standard windows exceeded -> returns the one with the LATEST `resets_at` time
3. Single window exceeded -> returns that window
4. If `approaching_limit`: Priority order: `5h` > `7d` > `overage`

### Rate Limit UI Component (`Uk`)
- Shows `"You've hit your limit for Claude messages."`
- If `resetsAt` is provided and <= 24 hours away: Shows countdown `"Your limit resets {relative_time}."`
- If `resetsAt` > 24 hours: Shows exact date `"Your limit resets on {date}."`
- If `showUsageLink` is true: Shows link to usage page
- Free users (`Dk`/`Ok`): Shows upgrade prompt to Pro

### Special Rate Limit Cases
- **Concurrent chat limit**: `"Looks like you have too many chats going. Please close a tab to continue."`
- **Thinking messages weekly limit**: `"You've reached your weekly limit for thinking messages. Please try again next week."`
- **Opus rate limit**: Re-thrown to trigger model fallback modal (user prompted to switch models)
- **Upload rate limit**: `"Too many file upload attempts. Please wait and try again later."`
- **Resource upload rate limit**: `"You've reached your limit for {resourceType} uploads. Please try again later."`

### Rate Limit JSON Parsing
When rate limit error message contains JSON (`{`), the app attempts to parse it:
```
{type: "exceeded_limit", representativeClaim: "concurrents" | ..., resetsAt: number}
```
The parsed data drives which specific UI component to show and provides the countdown timer.

### Overloaded Server Handling
- Error type `"overloaded_error"` -> `Hk` component: `"Due to unexpected capacity constraints, Claude is unable to respond to your message. Please try again soon."`
- In retry modes: Classified as `"server.overloaded"`, retried with specific schedule (see Section 2)

---

## 5. Stale Data / Cache Invalidation

### React Query Default Options (`Wh`)
```
{staleTime: 300000, refetchOnWindowFocus: false, retry: false}
```
- Default staleTime: **5 minutes (300,000ms)**
- Window focus refetch: **disabled by default**
- Retry: **disabled by default** (individual queries can override)

### StaleTime Configurations (observed values)

| Duration | Milliseconds | Usage Count | Used For |
|---|---|---|---|
| 0 | 0 | 16 | Conversation tree, project conversations, conversation list (with custom staleness) |
| 5s | 5,000 | 1 | (Rare) |
| 10s | 10,000 | 2 | (Rare) |
| 30s | 30,000 | 20 | GitHub queries, git diff stats, remote marketplaces |
| 1min | 60,000 | 8 | Feature access (`my-access`), various UI queries |
| 2min | 120,000 | 1 | (Rare) |
| 5min | 300,000 | 31 | **Default**: model config, subscription, billing, promotions, retention eligibility |
| 10min | 600,000 | 4 | Bootstrap (org-scoped), memory |
| 15min | 900,000 | 1 | (Rare) |
| 30min | 1,800,000 | 4 | MCP server lists, plugin data |
| 1hr | 3,600,000 | 3 | (Rare) |
| Infinity | `1/0` | 13 | Bootstrap (non-org), promotions, command name cache, SSO redirect URLs |

### gcTime (Garbage Collection Time)
| Duration | Count | Notes |
|---|---|---|
| 0 | 1 | Immediate cleanup |
| 5min | 6 | Short-lived cache |
| 10min | 2 | Medium cache |
| 30min | 4 | Long-lived cache (MCP, plugins) |

### Bootstrap Refresh Behavior
- **Org-scoped bootstrap**: staleTime = **600,000ms (10 minutes)**
- **Non-org bootstrap**: staleTime = **Infinity** (never stale)
- Retry policy: `retry: (attemptCount, error) => !(error instanceof vo && error.statusCode < 500) && attemptCount < 1`
  - Retries ONCE for 500+ errors
  - Never retries for 4xx errors
- `retryOnMount: false` -- doesn't retry on component remount
- On org UUID mismatch (statsigOrgUuid changes): Forces refetch

### Cache Invalidation Triggers
- **Conversation operations** (rename, delete, move, star): Invalidates `chat_conversation_list`, `chat_conversation_tree`
- **Billing operations** (subscribe, update payment, acknowledge trial): Invalidates `subscription_details`, `subscription_status`, `upcoming_invoice`, `invoice_list`
- **Organization operations** (invite, remove member): Invalidates `org_invites`, `org_members`, `org_member_counts`
- **Project sync/edit**: Invalidates project data and conversation tree queries
- **Plugin install/uninstall**: Invalidates plugin list queries via `cancelQueries` + `setQueryData`
- **Session invalidation (403 "Not authenticated")**: Invalidates `current_account` query

### Conversation List Staleness
- Uses session storage timestamp `conversations_last_timestamp_{orgUuid}`
- If last fetch was within the staleTime window: Uses `consistency: "eventual"` header
- Otherwise: Uses `consistency: "strong"` header

### refetchInterval Patterns
- **Completion status polling**: 1s while `is_pending === true`
- **MCP marketplaces**: While syncing, polls every 5s
- **Sync sources**: Polls every 5s while status indicates in-progress sync
- **Stripe payment intent**: 2s while payment status is not `"paid"` or `"failed"`
- **Session bootstrap**: Configurable interval (default 60s for some endpoints, 15s/30s for others)

---

## 6. Optimistic Updates

### Generic Optimistic Update Helper (`ef`)
```javascript
function ef(endpoint, method, updateFn, {queryKey, ...options}) {
  return Hh(endpoint, method, {
    async onMutate(variables) {
      await queryClient.cancelQueries({queryKey});
      const previousValue = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, data => updateFn(variables, data));
      return {previousValue};
    },
    onError(error, variables, context) {
      if (context?.previousValue) {
        queryClient.setQueryData(queryKey, context.previousValue);
      }
    },
    ...options
  });
}
```

### Mutations Using Optimistic Updates
1. **Conversation rename** -- Updates `chat_conversation_list` immediately
2. **Conversation starring/unstarring** -- Updates list with star state
3. **Session archiving** -- Sets `session_status: "archived"` optimistically
4. **Plugin install/uninstall** -- Updates plugin list in cache
5. **Conversation tree append** -- Appends new message to tree optimistically during streaming
6. **Session updates** -- Various session state changes update cache optimistically

### Rollback Behavior
- All optimistic updates store `previousValue` in the mutation context
- On `onError`, if `previousValue` exists, cache is restored to the exact prior state
- `cancelQueries` is called before mutation to prevent stale refetch from overwriting optimistic data

### Additional Optimistic Patterns
- **Conversation tree during streaming**: Uses `setQueryData` to progressively update the conversation tree as tokens arrive, without waiting for API confirmation
- **Memory operations**: Optimistic inserts with `isOptimistic: true` flag and `baselineCount` tracking

---

## 7. Conflict Resolution

### 409 Conflict (Idempotency)
When a completion request returns 409:
- Logged: `"409 Conflict: message already created (duplicate idempotency key)"`
- Tracked: `claudeai.message.duplicate_key` event
- **No error shown to user**
- Flags set: `ae = true` (stream complete), `ne = true` (append success), `re = true` (already created)
- The completion is treated as if it succeeded normally

### Message Store Sync Blocking (`message_store_sync_blocked`)

Prevents data loss when server returns fewer messages than client expects.

**Logic (`oOt` / `useMessageStoreSync`)**:
1. Tracks `prev_tree_count` (previous server tree size) and compares with new `new_tree_count`
2. If `new_tree_count < prev_tree_count` (messages disappeared):
   - First detection: Logs `"message_store_sync_blocked"`, tracks `claudeai.chat.sync_message_loss` with `sync_action: "blocked"`, **blocks the sync** (returns without updating)
   - After **30 seconds** of continuous blocking: Accepts the loss. Logs `"message_store_sync_loss_accepted"`, tracks with `sync_action: "accepted"`, clears the block timer, applies the sync.
3. Tracked fields: `prev_tree_count`, `new_tree_count`, `tree_lost_count` (= prev - new), `current_path_count`, `new_path_count`, `current_last_uuid`, `new_last_uuid`

**Voice session protection**:
- If voice is active (`isVoiceStreaming`, `isActive`, `isKaraokeActive`): Sync is SKIPPED entirely
- After voice ends: If new data would shrink the tree, sync is still skipped (post-voice protection)
- Once new data is >= current data size, post-voice protection is cleared

### Tree Count Tracking
- `a.current` stores the last known tree count
- If tree count goes to 0, the ref resets (allows fresh data)
- Timer `i.current` tracks when blocking started (null = not blocked)

---

## 8. Graceful Degradation

### Default Fallback Values

| Field | Fallback | Context |
|---|---|---|
| Conversation name | `"Untitled Chat"` | Conversation display |
| Model config | `{image_in: true, pdf_in: false}` (`vQ`) | When model config query fails or is placeholder |
| Bootstrap models | `[]` (empty array `jQ`) | When no models in bootstrap |
| Content array | `[]` via `??` | Message content iteration |
| System prompts | Not crash-safe, requires data | Bootstrap response |
| Error message | Fallback message param to `Co()` | API error construction |
| Stop reason | `"message_stop"` | If `message_stop` event received without prior stop reason |
| Timer/countdown | No countdown shown | If `resetsAt` not provided in rate limit |
| User name | Empty string `""` | Various name fallbacks |

### Null/Undefined Tolerance
- Conversation content: `content ?? []` used throughout message iteration
- Optional chaining on: `.content?.length`, `.chat_messages?.length`, `.settings?.enabled_mcp_tools`
- Message UUID lookup: Returns undefined gracefully from Map, doesn't crash
- Model config: Falls back to `vQ` default when query data is placeholder
- Models list: Filters out `inactive` models, falls back to default model

### Partial Conversation Data Handling
- Empty `chat_messages`: Returns empty `messageByUuid` Map, valid tree structure
- Missing root message: Throws `"No root message found"` (hard requirement)
- Missing selected child UUID: Falls back to last message in children array
- Dangling human message: Optionally included via `returnDanglingHumanMessage` flag

### Feature Flag Degradation (Load Shedding)
`apps_load_shed_controls` can disable features server-side:
- `claudeai_token_counter`
- `claudeai_experience_framework`
- `claudeai_referral`
- `claudeai_title_generation`
- `claudeai_conversation_count`
- `claudeai_memory_themes`
- `claudeai_github_branch_status`
- `claudeai_drive_recents`
- `claudeai_ingestion_progress`
- `claudeai_completion_status_poll`
- `claudeai_mcp_bootstrap`
- `claudeai_skills_list`
- `claudeai_admin_analytics`
- `claudeai_compass_task_polling`
- Various console features

When any flag is `true`, the corresponding feature is disabled (queries not sent, UI not rendered).

### Document Upload Fallbacks
- PDF rasterization fails with `document_too_many_pages`: Falls back to text extraction (`fallbackToTextExtraction`)
- Wiggle upload fails: Falls back to standard content extraction handler
- Invalid upload response: Throws descriptive error, doesn't crash the app

---

## 9. Loading States

### Loading State Count
- `isLoading`: ~498 usages throughout the bundle
- `isPending`: ~149 usages
- `isFetching`: ~53 usages

### Spinner Variants (CSS classes)
- `animate-spin` -- Base spinner
- `animate-spin text-text-300` / `text-text-400` / `text-text-500` -- Muted spinners
- `animate-spin text-brand-100` -- Brand-colored spinner
- `animate-spin rounded-full border-2 border-border-300 border-t-text-200` -- Circular border spinner
- `animate-spin rounded-full border-2 border-current border-t-transparent` -- Current-color spinner

### Key Loading States

**Bootstrap loading**:
- Shows nothing (blank) while bootstrap is loading
- Once loaded: Either shows app (logged in) or redirect to login (logged out)

**Conversation tree loading**:
- `isLoading` flag controls whether message list renders
- When loading: Typically shows skeleton/placeholder
- `isPlaceholderData` from React Query used for model config while actual data loads

**Completion streaming**:
- Shows waiting text while Claude is "thinking"
- Shows compaction progress bar (0-95%) when compacting
- Shows `"Working"` status text during tool use
- Shows `"Reconnecting..."` when `connectionState === "disconnected"`
- Animated "thinking" dots during response wait

**Session/Cowork loading**:
- `isSessionRunning` tracks active session
- `initializationStatus` tracks session setup progress
- `connectionState`: `"connected"`, `"disconnected"`, `"connecting"`

### Blocking vs Non-Blocking Loading
- **Blocking**: Bootstrap loading (entire app waits), initial conversation messages
- **Non-blocking**: Sidebar conversation list, model config (falls back to default), billing queries, feature settings

---

## 10. Concurrent Request Handling

### AbortController Usage
- **Completion streaming**: New `AbortController` created per completion request. Stored in state via `T({controller: q})`.
- **Previous completion abort**: If a new message is sent while streaming, the previous controller is aborted
- **Prompt improvement**: Previous improvement request aborted when new one starts
- **Document uploads**: File upload requests carry abort signal

### Stop Response Endpoint
- `POST /api/organizations/{orgId}/chat_conversations/{conversationId}/stop_response`
- Called when user clicks stop button
- Mutation tracked via `isPending` state
- Also aborts the client-side `AbortController` for the SSE stream

### Request Deduplication
- React Query handles deduplication automatically via `queryKey`
- `cancelQueries` called before optimistic updates to prevent race conditions
- Bootstrap: `rx` variable ensures only one eager fetch is in flight: `rx || (rx = ax().catch(...))`
- Conversation tree: `forceExplicitCache: true` uses manual cache write to prevent duplicate fetches

### Concurrent Completion Prevention
- `if (I) return;` guard at the start of the send function -- `I` is the "isSending" flag
- Set to `true` before streaming begins, cleared after completion/error
- AbortController check: `if (q.signal.aborted) return` checked at multiple points during the flow

### Failed Stream Retry Data
- Stored in a module-level singleton (`ej.value`) and synced to React Query cache
- Contains `{prompt, attachments, files}` from the interrupted request
- Set when stream fails, cleared when retry begins
- Allows the user to retry with the exact same inputs

### Session Recovery (Cowork/SDK Sessions)

**Recovery triggers**:
1. **Visibility change**: When tab becomes visible and session is disconnected
2. **Auto-retry 15s**: If pending messages exist for 15 seconds without resolution
3. **Show retry button 30s**: After 30 seconds, shows manual retry button
4. **Disconnect while running**: 2-second delay, then auto-retry (up to 3 attempts)
5. **Stale working 60s**: If session reports "running" but no progress for 60 seconds

**Recovery process**:
1. Fetches latest session state from server
2. If new events found: Merges into local state (`merged_events`)
3. If no new events but session is running: Triggers soft retry
4. If fetch fails: Falls back to soft retry, increments failure counter

**Session recovery tracking**:
- `source`: What triggered recovery (visibility, auto_retry_15s, disconnect_while_running, stale_working_60s)
- `outcome`: What happened (merged_events, soft_retry, fallback_soft_retry, no_action)
- `has_new_events`, `session_status`, `pending_resolved`, `pending_lost`

### Compaction Status
- Three states: `"compacting"`, `"complete"`, `"failed"`
- During compaction: Shows progress bar with exponential approach to 95% (`100 * (1 - exp(-t/25))`)
- On failure: Shows `Yk` component: `"This conversation can't be compacted any further. Start a new chat to continue."`
- Compaction failure is tracked via `chat.sse_compaction_status` metric

### API Retry Status (SDK Sessions)
- System messages with subtype `"api_retry"` injected into the message stream
- Fields: `{attempt, max_retries, retry_delay_ms}`
- Used to show retry status in the UI: `"{progress}%"` and waiting indicator

---

## Appendix A: Error Telemetry Events

### Error Events
- `claudeai.cumulative_error_count`
- `claudeai.user_facing_error.shown`
- `claudeai.unhandled_error_code`
- `claudeai.message.completion_failed` (with `error_classification`, `error_status_code`, `error_type`)
- `claudeai.message.duplicate_key`
- `claudeai.session.error_occurred`
- `claudeai.session.disconnected_due_to_error`
- `claudeai.session.reconnection_failed`
- `claudeai.session.recovery_attempted`

### Retry Events
- `chat.completion_retry_initiated`
- `chat.completion_retry_recovered`
- `chat.completion_retry_exhausted`
- `chat.completion_retry_escalated`
- `chat.completion_retry_inherited`
- `chat.completion_retry_runaway_guard`
- `chat.completion_non_retryable_error`

### Completion Error Classifications (for analytics)
- `"rate_limit"` -- rate_limit_error type
- `"overloaded"` -- overloaded_error type
- `"not_found"` -- not_found_error type
- `"billing"` -- billing_error type
- `"invalid_request"` -- invalid_request_error type
- `"5xx"` -- vo with statusCode >= 500
- `"other"` -- any other vo error
- `"network"` -- non-vo error (TypeError, etc.)
- `"incomplete_stream"` -- stream ended without message_stop

---

## Appendix B: gRPC Status Code Mapping

| HTTP Status | gRPC Code |
|---|---|
| 400 | `Internal` |
| 401 | `Unauthenticated` |
| 403 | `PermissionDenied` |
| 404 | `Unimplemented` |
| 429 | `Unavailable` |
| 502 | `Unavailable` |
| 503 | `Unavailable` |
| 504 | `Unavailable` |
| Other | `Unknown` |

---

## Appendix C: Upload Error Handling

### UploadError Class (`XJ`)
```
class XJ extends Error {
  constructor(message, statusCode, fileName)
}
```

### Upload Error Display (`YJ`)
| Status Code | Message |
|---|---|
| 400 | `"Failed to upload "{fileName}". The file format may not be supported or the file may be corrupted."` |
| 413 | `""{fileName}" is too large. Choose a smaller file."` |
| 429 | `"Too many upload attempts. Wait a moment and try again."` |
| Default | `"Failed to upload "{fileName}". You can try again."` |

### Document Convert Errors
| Status | Error Code | Handling |
|---|---|---|
| 429 | -- | `isRateLimit = true`, `statusCode = 429` |
| 413 | -- | `errorType = "file_too_large"` |
| 400 | `document_password_protected` | Specific error: `"This file is password protected"` |
| 400 | `document_too_many_pages` | Falls back to text extraction |
| 400 | `invalid_file_type` | `"is not a supported file type"` |
| Other | -- | Generic `"The file could not be read"` |

### PDF Rasterization Fallback Chain
1. Try rasterization upload
2. If `document_too_many_pages` -> fall back to text extraction
3. If other error -> throw `XJ` with status code and filename

---

## Appendix D: Cookie Keys and Session State

| Cookie Key | Purpose |
|---|---|
| `lastActiveOrg` | Last active organization UUID |
| `CH-prefers-color-scheme` | Color mode preference |
| `anthropic-consent-preferences` | Consent preferences |
| `user-sidebar-pinned` | Sidebar pin state |
| `DEVICE_ID_KEY` | Device ID for anthropic-device-id header |

### Local/Session Storage Keys
- `ant_completion_backoff_v1` -- Consecutive failure tracking for backoff inheritance
- `conversations_last_timestamp_{orgUuid}` -- Last conversation list fetch time
- `PROMOTION` -- Active promotion data
