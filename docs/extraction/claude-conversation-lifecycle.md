# Claude.ai Conversation Lifecycle - Complete Reference

Extracted from frontend bundle `index-DcrCrePJ.js` (7.2MB, minified React/TypeScript).

---

## 1. New Conversation Creation - The EXACT Sequence

### Two Paths: Traditional vs Inline Creation

There is a feature flag `claudeai_inline_conversation_creation` that determines the creation path.

#### Path A: Traditional (flag OFF)
1. Client generates a UUID for the conversation: `const a = t || oj()` (where `oj()` = `crypto.randomUUID()`)
2. **POST** `/api/organizations/${orgUuid}/chat_conversations` with body:
   ```json
   {
     "uuid": "<pre-generated-uuid>",
     "name": "",
     "model": "<selected-model>"
   }
   ```
   Optional fields in the POST body:
   - `create_mode` - if set (e.g., for artifact studio)
   - `project_uuid` - if creating within a project
3. On success, the query cache is updated with the new conversation object.
4. Navigation occurs: `push("/chat/${uuid}")` (or `replace` depending on context).
5. The completion request fires AFTER the POST returns.

#### Path B: Inline Creation (flag ON) - Current Default
1. Client generates a UUID: `const I = conversationUuidOverride ?? generatedUuid`
2. Instead of POSTing to create the conversation, the client:
   - Stores conversation parameters in localStorage
   - Optimistically sets the conversation in the React Query cache via `Oj(queryClient, orgUuid, uuid, { name, model, project_uuid, is_temporary, settings })`
   - Navigates to `/chat/${uuid}`
3. The `create_conversation_params` are embedded in the **completion request body**.
4. The server creates the conversation AND starts the completion in a single request.
5. The server sends a `conversation_ready` SSE event when the conversation is created on the backend.

### Optimistic Conversation Object Shape (set in cache before server responds)
```javascript
{
  uuid: conversationUuid,
  name: "",          // always empty string initially
  summary: "",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  model: selectedModel,
  project_uuid: projectUuid || undefined,
  is_temporary: boolean,
  settings: {
    enabled_web_search,
    enabled_mcp_tools,
    enabled_imagine,
    paprika_mode,
    compass_mode
  },
  // Tree structure initialized:
  chat_messages: [],
  messageByUuid: new Map(),
  parentByChildUuid: new Map(),
  childrenByParentUuid: new Map(),
  selectedChildByUuid: new Map()
}
```

### URL Change Timing
- The URL changes from `/new` to `/chat/${uuid}` **immediately** when the user submits their message, BEFORE the completion response begins.
- For voice mode + temporary: a callback is invoked instead of navigation.
- For voice mode + non-temporary: navigation to `/chat/${uuid}?allow_dangling_...`

### Conversation Creation POST Body (traditional path)
```json
{
  "uuid": "client-generated-uuid-v4",
  "name": "",
  "model": "claude-sonnet-4-5-20250929",
  "project_uuid": "optional-project-uuid",
  "include_conversation_preferences": true,
  "paprika_mode": "extended" | null,
  "compass_mode": "advanced" | null,
  "create_mode": "optional-create-mode",
  "is_temporary": false,
  "enabled_imagine": true,
  "orbit_action_uuid": "optional"
}
```

### Expected Response from Conversation Creation
The server returns a conversation object. The client merges it into cache:
```javascript
queryClient.setQueryData(
  [queryKey, {orgUuid}, {uuid: response.uuid}, {returnDanglingHumanMessage: false}],
  existing => ({...existing || {}, ...response, ...preserveTreeStructure(existing)})
)
```
If not temporary, the conversation is also prepended to the conversations list cache.

---

## 2. Conversation Settings - Complete Shape

### All Known Setting Fields

**Thinking/Mode Settings (stored in Yc array as "sticky"):**
- `paprika_mode`: `"extended"` | `null` — Extended thinking mode
- `compass_mode`: `"advanced"` | `null` — Research mode (value `"advanced"` is the constant `Tre`)

**Tool/Search Settings:**
- `enabled_web_search`: `boolean` — Web search tool
- `enabled_bananagrams`: `boolean` — Google Drive integration
- `enabled_sourdough`: `boolean` — Gmail integration
- `enabled_foccacia`: `boolean` — Google Calendar integration
- `enabled_mcp_tools`: `object | boolean` — MCP tools; when object, keys are tool enabledKeys mapping to booleans
- `enabled_imagine`: `boolean` — Image generation; derived from `aJ(enabled_mcp_tools)` (true if any local MCP tools are active)
- `tool_search_mode`: `"auto"` | `"off"` — Tool search mode

**Feature Preview Settings (account-level, reflected in conversation):**
- `preview_feature_uses_artifacts`: `boolean` — Artifacts feature
- `preview_feature_uses_latex`: `boolean` — LaTeX rendering
- `preview_feature_uses_citations`: `boolean` — Citations
- `enabled_artifacts_attachments`: `boolean` — Analysis Tool (file analysis)
- `enabled_turmeric`: `boolean` — Unknown feature (codename)
- `enabled_gdrive`: `boolean` — Google Drive (separate from bananagrams?)
- `enabled_monkeys_in_a_barrel`: `boolean` — **Code execution and file creation** ("Claude can execute code and create and edit docs, spreadsheets, presentations, PDFs, and data reports.")

**Sticky Settings List** (persisted across conversations via `w1` function):
```javascript
["enabled_web_search", "enabled_bananagrams", "enabled_sourdough", "enabled_foccacia",
 "enabled_mcp_tools", "paprika_mode", "tool_search_mode"]
// + "compass_mode" if feature flag "claude_ai_sticky_project_settings" is on
```

### Settings at Creation vs Updated Later

**At creation** (in `create_conversation_params` or inline creation):
- `model`, `name`, `project_uuid`, `is_temporary`
- `paprika_mode`, `compass_mode`
- `enabled_web_search`, `enabled_mcp_tools`, `enabled_imagine`
- `create_mode`, `orbit_action_uuid`

**Updated mid-conversation** (via PUT endpoint):

**PUT** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}?rendering_mode=raw`

This endpoint is used for TWO different kinds of updates:

1. **Settings update** (via `Wj` hook): Updates `settings` sub-object
   ```json
   { "settings": { "paprika_mode": "extended", "compass_mode": null, ... } }
   ```
   Response is merged optimistically: `{...existing, settings: {...existing.settings, ...update.settings}}`

2. **Conversation metadata update** (via `Yj` hook): Updates top-level fields
   ```json
   { "name": "New Title", "model": "claude-sonnet-4-5-20250929", "is_starred": true }
   ```

**Also via PUT** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}` (without `rendering_mode=raw`):
- Used by `Gj` hook for name updates specifically.

### Settings Interactions / Side Effects
- Enabling `enabled_monkeys_in_a_barrel` (code execution) automatically:
  - Sets `preview_feature_uses_artifacts: true`
  - Sets `enabled_artifacts_attachments: false`
- Enabling `enabled_artifacts_attachments` automatically:
  - Sets `enabled_monkeys_in_a_barrel: false`
- When compass_mode is "advanced" and all search tools are disabled, compass_mode is auto-set to null.
- When model changes and the new model doesn't support the current paprika_mode, paprika_mode is set to null.
- When model changes and the new model doesn't support compass, compass_mode is set to null.

---

## 3. Completion Request Body - EVERY Field

### Request Builder Function (`fM`)

The `fM` function constructs the completion request body:

```javascript
function fM(params) {
  const body = {
    prompt: params.prompt,                           // REQUIRED: the user's text
    parent_message_uuid: params.parent_message_uuid,  // UUID of parent message, or undefined for first message
    timezone: params.timezone,                        // e.g., "America/New_York" from luxon
    personalized_styles: params.personalized_style    // Array wrapping single style, or undefined
      ? [params.personalized_style]
      : undefined,
    locale: supportedLocales.includes(params.locale)  // e.g., "en-US"
      ? params.locale
      : "en-US"                                       // Default locale
  };

  // Optional: custom system prompt (from iframe integration or localStorage)
  const systemPrompt = isInIframe
    ? localStorage.getItem("iframeSystemPrompt")
    : localStorage.getItem(systemPromptKey);
  if (systemPrompt) body.custom_system_prompt = systemPrompt;

  // Optional model fields
  if (params.model && typeof params.model === "string") body.model = params.model;
  if (params.modelOverride) body.model = params.modelOverride;  // Override takes precedence
  if (typeof params.temperature === "string") body.temperature = parseInt(params.temperature);
  if (params.maxTokensToSample && typeof params.maxTokensToSample === "string") {
    body.max_tokens_to_sample = parseInt(params.maxTokensToSample);
  }

  // Thinking mode
  if (params.paprika_mode) body.paprika_mode = params.paprika_mode;

  // Tools
  if (params.tools.length) body.tools = params.tools;
  if (params.tool_states?.length) body.tool_states = params.tool_states;

  // Idempotency UUIDs
  if (params.turnMessageUuids) {
    const { humanMessageUuid, assistantMessageUuid } = params.turnMessageUuids;
    body.turn_message_uuids = {
      ...(humanMessageUuid && { human_message_uuid: humanMessageUuid }),
      ...(assistantMessageUuid && { assistant_message_uuid: assistantMessageUuid })
    };
  }

  return body;
}
```

### Additional Fields Added by the Stream Function (before sending)

The stream function (`mT`) wraps the body:
```javascript
const requestBody = {
  ...completionBody,       // All fields from fM above
  ...additionalBody,       // text, attachments, files, sync_sources from the stream caller
  text: undefined,         // Explicitly removed (prompt field is used instead)
  rendering_mode: "messages",
  organization_uuid: undefined,      // Removed from body (in URL instead)
  conversation_uuid: undefined,      // Removed from body (in URL instead)
  create_conversation_params: inlineCreateParams  // Only on first message with inline creation
};
```

### The Full Body Sent in the SSE Request

When the actual fetch fires, the body fields sent to `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/completion` are:

```json
{
  "prompt": "User's message text",
  "parent_message_uuid": "uuid-of-parent-or-00000000-0000-4000-8000-000000000000",
  "timezone": "America/New_York",
  "personalized_styles": [{"key": "Default", "type": "default"}],
  "locale": "en-US",
  "model": "claude-sonnet-4-5-20250929",
  "paprika_mode": "extended",
  "tools": [...],
  "tool_states": [...],
  "turn_message_uuids": {
    "human_message_uuid": "uuid-v4",
    "assistant_message_uuid": "uuid-v4"
  },
  "rendering_mode": "messages",
  "attachments": [...],
  "files": ["file-uuid-1", "file-uuid-2"],
  "sync_sources": ["source-uuid-1"],
  "create_conversation_params": {
    "name": "",
    "model": "claude-sonnet-4-5-20250929",
    "project_uuid": null,
    "include_conversation_preferences": true,
    "paprika_mode": "extended",
    "compass_mode": null,
    "create_mode": null,
    "is_temporary": false,
    "enabled_imagine": true,
    "orbit_action_uuid": null
  }
}
```

### Supported Locales
```javascript
["en-US", "de-DE", "fr-FR", "ko-KR", "ja-JP", "es-419", "es-ES", "it-IT", "hi-IN", "pt-BR", "id-ID"]
```
Default: `"en-US"`

### `rendering_mode` Values
- `"messages"` — Used in completion requests and conversation fetches (renders tool blocks, thinking, etc.)
- `"raw"` — Used in PUT requests for settings/metadata updates

### `tool_states` Shape
The `tool_states` are built from MCP server connection states:
```javascript
// I2 function builds tool_states from enabled MCP tools
{
  "<mcp-server-uuid>": {
    "type": "http",
    "url": "https://mcp-server-url.example.com/sse",
    "headers": {
      "X-MCP-Server-ID": "<mcp-server-uuid>"
    }
  }
}
```

### Tools Array Shape
Each tool entry can be:
```javascript
// MCP remote tool
{
  name: "tool_name",
  description: "Tool description",
  input_schema: { type: "object", properties: {...} },
  integration_name: "server-name",
  mcp_server_uuid: "uuid",
  mcp_server_url: "https://...",
  needs_approval: true,
  backend_execution: false,
  read_only_hint: true,
  is_mcp_app: false
}

// Built-in tool types:
{ type: "artifacts_v0", name: "artifacts" }
{ type: "repl_v0", name: "repl" }
{ type: "project_knowledge_search", name: "project_knowledge_search" }
{ type: "<dream_circuit_wave>", name: "<echo_forest_path>" }  // Web search (obfuscated names from config)

// Widget tools:
{ type: "widget", name: "<widget-name>" }
```

### Root Message UUID Constant
```javascript
const ROOT_UUID = "00000000-0000-4000-8000-000000000000";
```
This is the `parent_message_uuid` for the first human message in a conversation.

### Optimistic Message UUID Prefixes
```javascript
const HUMAN_PREFIX = "new-human-message-uuid";
const ASSISTANT_PREFIX = "new-assistant-message-uuid";
```
Optimistic messages use `"new-human-message-uuid-<randomUUID>"` and `"new-assistant-message-uuid-<randomUUID>"` as temporary UUIDs before the server assigns real ones.

---

## 4. Completion Endpoints

### Primary Endpoint
**POST** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/completion`

- Method: POST
- Content-Type: `application/json`
- Accept: `text/event-stream`
- Headers include: `anthropic-device-id` (from local storage)
- Body: as documented above
- Uses Server-Sent Events (SSE) for streaming

### Retry Endpoint
**POST** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/retry_completion`

Used when retrying a failed or unsatisfactory response. The endpoint is selected by:
```javascript
function getEndpoint(endpoint, orgUuid, conversationUuid) {
  let path;
  switch (endpoint) {
    case 1: path = "completion"; break;
    case 2: path = "retry_completion"; break;
    default: throw new Error("Invalid endpoint");
  }
  return `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/${path}`;
}
```

### Completion Status Polling
**GET** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/completion_status?poll=false`

Response shape:
```json
{
  "is_pending": true,
  "is_error": false,
  "error_code": null,
  "error_detail": null
}
```
When `poll=true`, the server holds the connection until status changes. Used for pending message recovery with exponential backoff: `2000 * Math.pow(2, attempt-1)`, max 10000ms, with 10% jitter.

### gRPC Transport (Alternative)
When caching is enabled, the client uses a gRPC transport instead of SSE:
```javascript
const transport = enableCaching ? "grpc" : "sse";
```
The gRPC path calls `appendMessage` / `retryMessage` on a protobuf-defined service.

---

## 5. SSE Event Types and Stream Processing

### SSE Event Types Handled
```javascript
const messageEvents = [
  "message_start",
  "content_block_start",
  "content_block_delta",
  "content_block_stop",
  "message_delta",
  "message_stop"
];
// Plus special events:
// "tool_approval"
// "compaction_status"
// "conversation_ready"
// "cache_performance"
// "mcp_auth_required"
// "completion" (legacy format)
```

### `message_start` Event
```json
{
  "type": "message_start",
  "message": {
    "uuid": "server-assigned-uuid",
    "parent_uuid": "human-message-uuid",
    "model": "claude-sonnet-4-5-20250929",
    "id": "msg_...",
    "trace_id": "...",
    "request_id": "..."
  }
}
```
On receipt, the client extracts `assistantMessageUuid` and `humanMessageUuid` from `message.uuid` and `message.parent_uuid`.

### `conversation_ready` Event
Fired by the server when inline conversation creation completes. The client uses this to know the conversation exists on the backend.

### `message_delta` Event (with stop_reason)
```json
{
  "type": "message_delta",
  "delta": {
    "stop_reason": "end_turn" | "max_tokens" | "tool_use_limit" | "refusal" | "cyber_refusal" | "prompt_injection_risk" | "error" | "message_stop"
  }
}
```

### `completion` Event (Legacy Format)
```json
{
  "type": "completion",
  "completion": "text chunk",
  "stop_reason": "...",
  "messageLimit": { ... }
}
```

### Content Block Types
- `text` — Regular text content
- `thinking` — Extended thinking content (paprika_mode)
- `tool_use` — Tool invocation
- `tool_result` — Tool result

### Smoother (Output Buffering)
The client uses a "smoother" (`qA()`) that buffers SSE events and releases them gradually for a smooth typing animation. Can be disabled with `dont_smooth = true`.

---

## 6. Title Generation

### When It Fires
Title generation is triggered by a `useEffect` that watches:
```javascript
useEffect(() => {
  // Conditions (all must be true):
  // - isStreamComplete (l)
  // - hasConversation (i)
  // - isFirstMessage (s) — the conversation has messages
  // - NOT already titled (a) and NOT already has name (c)
  // - messageCount (u) !== 0 AND assistantContent (m) exists
  // - NOT already triggered (o)
  if (isStreamComplete && hasConversation && isFirstMessage &&
      (canGenerateTitle || !alreadyNamed || (messageCount !== 0 && assistantContent && !alreadyTriggered))) {
    setAlreadyTriggered(true);
    generateTitle({ message_content: assistantContent, recent_titles: [] });
  }
}, [dependencies]);
```

**Key timing**: Title generation fires AFTER the first assistant response completes (stream finishes), not after the first user message.

### Title Generation Endpoint
**POST** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/title`

Request body:
```json
{
  "message_content": "<first assistant response text>",
  "recent_titles": []
}
```

Response:
```json
{
  "title": "Generated conversation title"
}
```

### Fallback on Title Generation Failure
If title generation fails (`x` error is truthy) AND the stream is complete with content, the client falls back to using the first 30 characters of the prompt:
```javascript
if (titleError || titleFailed) {
  if (hasBeenAttempted) return;
  const truncated = promptText.slice(0, 30);
  const ellipsis = promptText.length > 30 ? "..." : "";
  hasBeenAttempted = true;
  updateConversationName({ name: `${truncated}${ellipsis}` });
}
```

### Title generation is silenced (`noToast: true`) — errors don't show UI notifications.

---

## 7. Model Selection in Completion

### Model Resolution Priority (highest to lowest)
```javascript
const selectedModel =
  sessionContext?.session_context?.model ??  // Session-specific model (e.g., from Cloud sessions)
  userSelectedModel ??                       // User explicitly chose a model
  conversation?.model ??                     // Model saved on the conversation
  stickyModelPreference ??                   // Persisted preference from localStorage
  undefined;                                 // Falls back to default
```

### Model Field in Completion Body
The model is set in `fM`:
1. If `params.model` is a string → `body.model = params.model`
2. If `params.modelOverride` exists → `body.model = params.modelOverride` (overrides the above)

### Model Fallback Endpoint
**PUT** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/model_fallback`

Called when the response has `stop_reason: "refusal"` or `"cyber_refusal"`. On success, the conversation's model is updated in the cache:
```javascript
onSuccess: response => {
  updateConversationInCache(conversationUuid, { model: response.model });
}
```

### Model Fallback Behavior
The frontend has a configuration (`holdup` feature flag):
```javascript
// modelFallbacks: mapping from model → fallback model for "refusal" stop_reason
// cyberModelFallbacks: mapping from model → fallback model for "cyber_refusal" stop_reason
```
The UI shows a "retry with different model" option using the fallback model.

### Model Capabilities Check
Models declare capabilities:
```javascript
{
  capabilities: {
    mm_pdf: boolean,     // PDF understanding
    mm_images: boolean,  // Image understanding
    web_search: boolean, // Web search support
    gsuite_tools: boolean, // Google suite tools
    compass: boolean     // Research mode support
  },
  paprika_modes: ["extended"],  // Supported thinking modes
  thinking_modes: [{ id, title, description, mode, selection_title, is_default }]
}
```

When switching models:
- If new model doesn't support current `paprika_mode`, it's reset to `null`
- If new model doesn't support compass, `compass_mode` is reset to `null`

---

## 8. Personalized Styles in Completion

### Style Fetch
**GET** `/api/organizations/${orgUuid}/list_styles`

Returns:
```json
{
  "defaultStyles": [
    { "key": "Default", "type": "default", "isDefault": true, ... },
    { "key": "Concise", "type": "default", ... },
    ...
  ],
  "customStyles": [
    { "uuid": "custom-uuid", "key": "custom-uuid", "type": "custom", ... }
  ]
}
```

### How Style Is Included in Completion
In the completion body, styles are sent as:
```json
{
  "personalized_styles": [
    { "key": "Default", "type": "default" }
  ]
}
```
Note: It's always an array wrapping a single style object, or `undefined` if no style is active.

### Style Persistence
The selected style is stored in localStorage under key `"claude_personalized_style"` with a timestamp. Styles older than 48 hours (`432e5` ms) are considered expired and fall back to default.

### Default Style Selection
```javascript
let defaultStyle = defaultStyles.find(s => s.isDefault === true) || defaultStyles[0];
if (conciseModeEnabled) {
  defaultStyle = defaultStyles.find(s => s.key === "Concise") || defaultStyle;
}
```

### Style Change Mid-Conversation
Changing style mid-conversation only affects the NEXT message sent. The style is passed through the `runStream` call chain. There is no separate API call to update conversation style; it's per-completion.

---

## 9. File Attachments in Completion

### Two Separate Concepts: `attachments` vs `files`

#### `attachments` (Inline Extracted Content)
For smaller files where content is extracted client-side:
```javascript
{
  file_name: "document.txt",
  file_type: "text/plain",
  file_size: 1234,
  extracted_content: "The actual text content...",
  origin: "UserUpload",  // GJ.UserUpload enum
  kind: "File",          // $J.File enum
  path: "/optional/path" // Only for wiggle/code execution paths
}
```

#### `files` (Server-Side / Out-of-Context Files)
For larger files uploaded to the server:
```javascript
{
  file_kind: "Blob",  // HJ.Blob enum
  file_uuid: "uuid-v4",
  file_name: "large-file.pdf",
  created_at: "2024-01-01T00:00:00.000Z"
}
```

In the completion request body:
- `attachments`: sent as the full array of attachment objects
- `files`: sent as an array of just `file_uuid` strings: `files.map(e => e.file_uuid)`
- `sync_sources`: sent as array of `uuid` strings: `syncSources.map(e => e.uuid)`

### File Size Limits
- Max upload size: 52,428,800 bytes (50MB)
- Max in-context bytes for extracted content: determined by `PJ()` function
- If `extracted_content` exceeds the in-context limit, the file is converted to an out-of-context `file` reference instead.

### `files_v2` vs `files`
Messages have both `files` and `files_v2` fields. The client prefers `files_v2` when available:
```javascript
function getFiles(message) {
  const { files_v2, files } = message;
  return files_v2 && files_v2.length > 0 ? files_v2 : files ?? [];
}
```

### sync_sources
References to external data sources (e.g., Google Drive documents, GitHub repos) that are synchronized into the conversation context.

---

## 10. Incognito / Temporary Conversations

### How Temporary Conversations Are Created
The `is_temporary: true` flag is set in the conversation creation params. The incognito mode is toggled via URL param `?incognito=true` or keyboard shortcut (Cmd+Shift+I / Ctrl+Shift+I).

### State Management
```javascript
const incognitoContext = {
  incognitoModeEnabled: boolean,      // Whether incognito is active
  setIncognitoModeEnabled: function,
  temporaryConversationUuid: string | null,
  setTemporaryConversationUuid: function
};
```

### What's Different for Temporary Conversations
1. **Not saved to conversation list**: When `skip_invalidate_create_conversation` is on, temporary conversations are excluded from the conversations list cache update.
2. **No title in header**: Shows "Incognito chat" instead of conversation name.
3. **Tracking includes `is_incognito: true`** in analytics events.
4. **Memory/history**: The `is_incognito` flag is sent in tracking but the actual memory exclusion is handled server-side.
5. **Desktop app integration**: `window.electronWindowControl?.setIncognitoMode?.(isIncognito)` is called.

### Conversation Object Shape Differences
The conversation object is identical except:
- `is_temporary: true`
- The conversation is NOT added to starred/list caches
- After stream completion, temporary conversations skip the optimistic conversation list update

---

## 11. Project-Scoped Conversations

### Creation
Project conversations include `project_uuid` in the creation params:
```json
{
  "uuid": "conv-uuid",
  "name": "",
  "model": "claude-sonnet-4-5-20250929",
  "project_uuid": "project-uuid"
}
```

### Project Knowledge in Tools
When a conversation has a `project_uuid` and project knowledge search is available:
```javascript
tools.push({ type: "project_knowledge_search", name: "project_knowledge_search" });
```

### Project Settings Stickiness
With `claude_ai_sticky_project_settings` flag, project-level default settings (like `compass_mode`) are remembered per-project.

### Project Conversations Endpoint
**GET** `/api/organizations/${orgUuid}/projects/${projectUuid}/conversations` — Lists conversations within a project.

### Moving Conversations Between Projects
**POST** `/api/organizations/${orgUuid}/chat_conversations/move_many`
```json
{
  "conversation_uuids": ["uuid1", "uuid2"],
  "project_uuid": "target-project-uuid"
}
```
To remove from project: `"project_uuid": null`

### Memory Endpoint (per-project)
**GET** `/api/organizations/${orgUuid}/memory?project_uuid=${projectUuid}`

### Memory Synthesis
**POST** `/api/organizations/${orgUuid}/memory/synthesize`
```json
{
  "controls": ["instruction1", "instruction2"],
  "project_uuid": "optional-project-uuid"
}
```

---

## 12. The Stop Response Flow

### Stop Endpoint
**POST** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/stop_response`

No request body. The mutation hook:
```javascript
const { mutate: stopResponse, isPending: isStopPending } = useStopResponse(conversationUuid);
```

### Task Stop (for Compass/Research tasks)
**POST** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/task/${taskId}/stop`

### What Happens on Stop
1. The `AbortController.abort()` is called on the stream's abort controller.
2. The SSE connection is terminated.
3. The smoother's current buffered content is flushed.
4. The `stop_response` POST is sent to tell the server to stop generating.

### State After Stop
- `isStreaming` becomes `false`
- The conversation retains whatever content was received up to the stop point.
- The stop_reason in the last message becomes relevant for UI display:
  - `"end_turn"` — Normal completion
  - `"max_tokens"` — Hit token limit (shows "Continue" button)
  - `"tool_use_limit"` — Hit tool use limit
  - `"refusal"` — Content policy refusal
  - `"cyber_refusal"` — Cybersecurity policy refusal
  - `"prompt_injection_risk"` — Prompt injection detected
  - `"error"` — Server error

### Escape Key Behavior
Pressing Escape during streaming triggers the stop confirmation flow:
```javascript
useEffect(() => {
  const handler = e => {
    if (e.key === "Escape" && !isPending) {
      setShowConfirmation(true);
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
});
```

---

## 13. Complete Request Lifecycle: User Types Message to Response Appears

### Step-by-Step Sequence

#### Phase 1: User Submits Message
1. User types in the TipTap editor and presses Enter/Send.
2. The `onSend` callback fires.
3. Chat input is disabled (`setEditable(false)`).
4. Files/attachments/sync_sources are collected from the chat resource state.

#### Phase 2: Analytics & Tracking
5. A `claudeai.message.sent` tracking event fires with:
   - `conversation_uuid`, `model`, `has_attachments`, `has_files`, `has_sync_sources`
   - `message_length`, `is_new_conversation`, `has_personalized_style`
   - `is_incognito`, `thinking_mode`, `research_mode`, `tool_count`, `enabled_web_search`

#### Phase 3: Conversation Creation (if new)
6. **If existing conversation**: Skip to Phase 4.
7. **If new conversation (inline path)**:
   - Generate conversation UUID via `crypto.randomUUID()`
   - Store creation params in localStorage
   - Set optimistic conversation in React Query cache
   - Navigate from `/new` to `/chat/${uuid}`
   - The `create_conversation_params` will be embedded in the completion body.
8. **If new conversation (traditional path)**:
   - POST to `/api/organizations/${orgUuid}/chat_conversations`
   - Wait for response
   - Navigate to `/chat/${uuid}`

#### Phase 4: Optimistic UI Update
9. Two optimistic messages are created:
   ```javascript
   const humanMsg = {
     uuid: "new-human-message-uuid-<random>",
     content: [{ type: "text", text: prompt, citations: [] }],
     sender: "human",
     attachments, files, files_v2: files, sync_sources,
     created_at: new Date().toISOString(),
     parent_message_uuid: parentUuid ?? ROOT_UUID,
     index: currentMaxIndex + 1
   };
   const assistantMsg = {
     uuid: "new-assistant-message-uuid-<random>",
     content: [],
     sender: "assistant",
     attachments: [], files: [], files_v2: [], sync_sources: [],
     parent_message_uuid: humanMsg.uuid,
     index: currentMaxIndex + 2,
     metadata: { compass_mode }  // if research mode active
   };
   ```
10. These are appended to the conversation tree in the cache.
11. The UI immediately shows the user's message and an empty assistant message (loading state).

#### Phase 5: Build Completion Body
12. `fM()` builds the request body with: prompt, parent_message_uuid, timezone, personalized_styles, locale, model, paprika_mode, tools, tool_states, turn_message_uuids.
13. Additional fields added: text (set to undefined), rendering_mode ("messages"), attachments, files (as UUIDs), sync_sources (as UUIDs), create_conversation_params (if inline new conversation).

#### Phase 6: Open SSE Stream
14. **POST** to `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/completion`
15. Headers: `Content-Type: application/json`, `accept: text/event-stream`, `anthropic-device-id: <id>`
16. The smoother is initialized: `smoother.task(onCompletion, abortSignal)`
17. `setCompletionStatus(true)` marks the conversation as pending.

#### Phase 7: Process SSE Events
18. **`conversation_ready`** — Server confirms conversation creation (inline path).
19. **`message_start`** — Contains server-assigned message UUID, model, trace_id. The optimistic assistant message UUID is replaced.
20. **`content_block_start`** — New content block begins (text, thinking, tool_use).
21. **`content_block_delta`** — Incremental content (text chunks, thinking chunks, tool input JSON).
22. **`content_block_stop`** — Block complete.
23. **`message_delta`** — Contains `stop_reason` when generation ends.
24. **`message_stop`** — Stream complete.
25. **`compaction_status`** — If conversation is being compacted (for long conversations).
26. **`tool_approval`** — MCP tool needs user approval.
27. **`cache_performance`** — Cache hit/miss information.

#### Phase 8: Smoother Releases Content
28. The smoother buffers events and releases them at a controlled rate for smooth UI updates.
29. Each released event updates the assistant message content in the React state.
30. The UI re-renders with each content update (text appearing character-by-character-ish).

#### Phase 9: Stream Completion
31. On `message_stop`, the smoother is signaled that the model is done.
32. `setCompletionStatus(false)` marks the conversation as no longer pending.
33. The conversation tree is refetched from the server for consistency.
34. The conversations list query is invalidated (to update sidebar).
35. Feature limits are refetched.

#### Phase 10: Post-Completion
36. **Title generation**: If this was the first message exchange, POST to `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/title` with `{ message_content, recent_titles: [] }`.
37. **Current leaf message UUID update**: PUT to `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/current_leaf_message_uuid` to update the conversation's pointer.
38. Chat input is re-enabled.
39. The prompt field is cleared.

### Error Handling During Stream
- **409 Conflict**: "Message already created (duplicate idempotency key)" — logged and ignored.
- **Abort/Cancel**: If `abortController.signal.aborted`, exit silently.
- **Network errors**: Shown via error toast.
- **Overloaded errors**: Show "Claude is overloaded" message.
- **Billing errors**: Show billing-specific error.
- **413 (Token limit exceeded)**: Tracked and shown.

### Retry Behavior
Retry modes:
- `"legacy"` — Default, strips `create_conversation_params` and `turn_message_uuids` on retry
- `"emergency"` — Feature-flagged emergency retry mode
- `"expanded"` — Idempotency-based retry with message UUIDs preserved

On retry, the body is re-serialized:
```javascript
const retryBody = isRetry
  ? { ...body, create_conversation_params: undefined, turn_message_uuids: undefined }
  : body;
```

---

## 14. Conversation Fetch Endpoint

**GET** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}?tree=True&rendering_mode=messages&render_all_tools=true`

Optional query params:
- `consistency=eventual` or `consistency=strong`
- `return_dangling_human_message=true` — Returns messages that were sent but have no assistant response yet

### Conversations List Endpoint
**GET** `/api/organizations/${orgUuid}/chat_conversations_v2?limit=30&offset=0&consistency=eventual`

Response:
```json
{
  "data": [
    {
      "uuid": "...",
      "name": "Conversation Title",
      "summary": "...",
      "model": "claude-sonnet-4-5-20250929",
      "created_at": "...",
      "updated_at": "...",
      "is_starred": false,
      "is_temporary": false,
      "current_leaf_message_uuid": "...",
      "settings": { ... },
      "project_uuid": null,
      "session_id": null,
      "platform": "web_claude_ai"
    }
  ],
  "has_more": true
}
```

---

## 15. Codename Decoder Ring

| Codename | Actual Feature |
|----------|---------------|
| `paprika_mode` | Extended thinking |
| `compass_mode` | Research mode |
| `enabled_bananagrams` | Google Drive integration |
| `enabled_sourdough` | Gmail integration |
| `enabled_foccacia` | Google Calendar integration |
| `enabled_monkeys_in_a_barrel` / "wiggle" | Code execution and file creation |
| `enabled_turmeric` | Unknown feature |
| `enabled_imagine` | Image generation (derived from MCP tools state) |
| `echo_forest_path` | Web search tool name (from server config, obfuscated) |
| `dream_circuit_wave` | Web search tool type (from server config, obfuscated) |
| `yukon_gold` | Unknown flag (tracked in analytics, appears related to a special mode) |
| `holdup` | Model fallback configuration |
| `hatch_token_limits` | Token limit configuration per model |

---

## 16. Voice Mode Specifics

### Voice WebSocket Endpoint
```
/api/ws/voice/organizations/${orgUuid}/chat_conversations/${conversationUuid}?
  timezone=<tz>&voice=<voice>&server_interrupt_enabled=<bool>&client_platform=web_claude_ai
```

### Voice Mode Differences
- Messages include `input_mode: "voice"` in the message object.
- The conversation tree is fetched and merged after voice interactions.
- A `lastVoiceModel` is tracked in the global store.
- Karaoke mode: defers tree fetch/merge while active.

---

## 17. Sharing & Snapshots

### Create Share
**POST** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/share`

### Get Snapshot
**GET** `/api/organizations/${orgUuid}/chat_snapshots/${snapshotUuid}?rendering_mode=messages&render_all_tools=true`

### Latest Snapshot
**GET** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/latest`

### Delete Share
**DELETE** `/api/organizations/${orgUuid}/share/${shareUuid}`

---

## 18. Tool Approval Flow

### Endpoint
**POST** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/tool_approval`

### Tool Result Submission
**POST** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/tool_result`

Body contains:
- Tool use ID reference
- Result content
- Is error flag

---

## 19. Feedback

### Endpoint
**POST/PUT** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/chat_messages/${messageUuid}/chat_feedback`

Uses POST for new feedback, PUT for updating existing feedback.

### Message Flags
**DELETE** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/chat_messages/${messageUuid}/flags`
Body: `{ flag_name: "flag_name" }`

---

## 20. Delete Operations

### Single Conversation
**DELETE** `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}`

### Bulk Delete
**POST** `/api/organizations/${orgUuid}/chat_conversations/delete_many`
