# Claude.ai SSE/Streaming Completion Protocol

Reverse-engineered from `index-DcrCrePJ.js` (Vite bundle, ~7.2 MB).
All identifiers below are minified names from the bundle.

---

## 1. SSE Parser Implementation

### NOT native EventSource -- uses fetch + ReadableStream

Claude.ai uses a custom `fetchEventSource` implementation (function `PA`), NOT the
browser's native `EventSource` API. This is the library pattern from
`@microsoft/fetch-event-source`, bundled and minified.

### Application-type header (`md` function)

```js
// md(applicationType) returns the platform header:
const md = (applicationType) => {
  let platform = "UNKNOWN";
  if (typeof window !== "undefined" && isDesktopApp(window.navigator.userAgent))
    platform = "DESKTOP_APP";
  else if (applicationType === "claude-dot")
    platform = "WEB_CLAUDE_AI";
  else if (applicationType === "console")
    platform = "WEB_CONSOLE";
  else if (applicationType === "custom-agents")
    platform = "WEB_CUSTOM_AGENTS";
  return { "anthropic-client-platform": platform };
};
```

### Fetch call details

```js
// Endpoint construction:
function(endpoint_enum, orgUuid, conversationUuid) {
  let s;
  switch (endpoint_enum) {
    case 1: s = "completion"; break;
    case 2: s = "retry_completion"; break;
  }
  return `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}/${s}`;
}

// HTTP method:
const eT = "POST";

// Headers:
{
  "Content-Type": "application/json",
  "accept": "text/event-stream",
  ...applicationTypeHeaders,      // from md(applicationType)
  ...deviceId && { "anthropic-device-id": deviceId }  // from localStorage
}

// Fetch options passed to PA (fetchEventSource):
PA(url, {
  method: "POST",
  credentials: "include",         // sends cookies
  headers: j,                     // headers above
  body: JSON.stringify(requestBody),
  openWhenHidden: true,           // don't abort when tab hidden
  signal: abortController.signal, // AbortController for cancellation
  onopen: ...,
  onmessage: ...,
  onclose: ...,
  onerror: ...
});
```

### Byte-level SSE line parser (function `RA`)

This is the raw byte parser that processes `Uint8Array` chunks from
`response.body.getReader()`:

```js
function RA(onLine) {
  let buf, pos, colonIdx, isCR = false;
  return function(chunk) {
    if (buf === undefined) {
      buf = chunk; pos = 0; colonIdx = -1;
    } else {
      // concatenate: buf = buf + chunk
      const merged = new Uint8Array(buf.length + chunk.length);
      merged.set(buf);
      merged.set(chunk, buf.length);
      buf = merged;
    }
    const len = buf.length;
    let lineStart = 0;
    for (; pos < len;) {
      if (isCR) {
        if (buf[pos] === 10) lineStart = ++pos;  // skip LF after CR
        isCR = false;
      }
      let lineEnd = -1;
      for (; pos < len && lineEnd === -1; ++pos) {
        switch (buf[pos]) {
          case 58:  // colon ':'
            if (colonIdx === -1) colonIdx = pos - lineStart;
            break;
          case 13:  // CR
            isCR = true;
            // fallthrough
          case 10:  // LF
            lineEnd = pos;
        }
      }
      if (lineEnd === -1) break;
      onLine(buf.subarray(lineStart, lineEnd), colonIdx);
      lineStart = pos;
      colonIdx = -1;
    }
    if (lineStart === len) buf = undefined;
    else if (lineStart !== 0) { buf = buf.subarray(lineStart); pos -= lineStart; }
  };
}
```

### SSE field parser (inside PA)

The line callback parses SSE fields:

```js
// Called per line by RA. colonIdx = position of first ':' in line.
function(lineBytes, colonIdx) {
  if (lineBytes.length === 0) {
    // Empty line = event boundary: dispatch accumulated event
    onmessage(eventObj);
    eventObj = { data: "", event: "", id: "", retry: undefined };
  } else if (colonIdx > 0) {
    const field = decoder.decode(lineBytes.subarray(0, colonIdx));
    const valueStart = colonIdx + (lineBytes[colonIdx + 1] === 32 ? 2 : 1); // skip ': ' or ':'
    const value = decoder.decode(lineBytes.subarray(valueStart));
    switch (field) {
      case "data":
        eventObj.data = eventObj.data ? eventObj.data + "\n" + value : value;
        break;
      case "event":
        eventObj.event = value;
        break;
      case "id":
        onId?.(eventObj.id = value);  // updates last-event-id header
        break;
      case "retry":
        const ms = parseInt(value, 10);
        if (!isNaN(ms)) onRetry?.(eventObj.retry = ms);
        break;
    }
  }
}
```

### Stream consumption loop

```js
async function readStream(body, lineProcessor) {
  const reader = body.getReader();
  let result;
  for (; !(result = await reader.read()).done;)
    lineProcessor(result.value);   // feeds Uint8Array chunks to RA
}
```

### Reconnection on visibility change

When document becomes hidden, the fetch is aborted. When document becomes
visible again, a new fetch is issued. The `last-event-id` header is maintained
for reconnection via the SSE `id` field.

---

## 2. Every SSE Event Type the Parser Handles

The `onmessage` handler switches on `e.event` (the SSE `event:` field):

```js
switch (e.event) {
  case "ping":        // no-op, falls through to default
  default:            // no-op, return
    return;

  case "error":                 // → throw API error
  case "completion":            // → legacy text completion event
  case "content_block_start":   // → new content block
  case "content_block_delta":   // → incremental content update
  case "content_block_stop":    // → finalize content block
  case "message_limit":         // → rate limit info
  case "compaction_status":     // → context compaction notification
  case "conversation_ready":    // → conversation created/ready
  case "message_delta":         // → message metadata update (stop_reason, usage)
  case "message_start":         // → new assistant message
  case "message_stop":          // → message complete
  case "tool_approval":         // → no-op (break; -- handled elsewhere via block data)
  case "mcp_auth_required":     // → MCP OAuth flow trigger
  case "cache_performance":     // → cache hit/miss stats
}
```

### Detailed handling per event type:

#### `ping` / default
No-op. Returns immediately.

#### `error`
```js
throw Co({
  status: 0,
  response: JSON.parse(e.data),
  fallbackMessage: "Streaming error: 22",
  headers: undefined,
  endpoint: url,
  method: "POST"
});
```

#### `completion` (legacy mode)
Converts legacy format to messages format internally:
```js
const t = JSON.parse(e.data);
// t = { completion: "text...", stop_reason: "...", messageLimit: {...} }
const syntheticEvent = {
  type: "content_block_delta",
  index: 0,
  delta: { type: "text_delta", text: t.completion }
};
M = t.stop_reason;         // capture stop reason
S = t.messageLimit ?? null; // capture rate limit
smoother.onMessage(syntheticEvent);
```

#### `content_block_start`
```js
const t = JSON.parse(e.data);
// t = { type: "content_block_start", index: N, content_block: {...} }
T = t.index;                       // track current block index
if (t.content_block.type === "tool_use") {
  A = t.content_block.name;        // track tool name for buffering
  I = t.content_block.approval_key; // track approval key
}
smoother.onMessage(t);
```

#### `content_block_delta`
```js
const t = JSON.parse(e.data);
// Index validation -- exceptions for cross-block deltas:
if (t.index !== T
    && t.delta.type !== "thinking_summary_delta"
    && t.delta.type !== "tool_use_block_update_delta") {
  throw new Error("Content block index did not match the expected index");
}
// Buffer tool_use input JSON for known tools or tools with approval_key:
if (t.delta?.type === "input_json_delta") {
  if (builtinTools.includes(A)
      || userTools.some(tool => tool.name === A || A.endsWith(`:${tool.name}`))
      || I) {
    E += t.delta.partial_json;   // accumulate buffered input
  }
}
smoother.onMessage(t);
```

#### `content_block_stop`
```js
const t = JSON.parse(e.data);
if (t.index !== T) throw new Error("Content block index did not match...");
t.buffered_input = E;   // attach accumulated JSON to stop event
smoother.onMessage(t);
if (A) {                 // if was a tool_use block
  E = "";               // reset buffer
  A = "";               // reset tool name
  I = undefined;        // reset approval key
}
```

#### `message_limit`
```js
const t = JSON.parse(e.data);
S = t.message_limit;    // stored for return value
// NOT passed to smoother -- just captured
```

#### `compaction_status`
```js
const t = JSON.parse(e.data);
onCompactionStatus?.(t.status, t.message);
// Telemetry: Mx("chat.sse_compaction_status", ...)
```

#### `conversation_ready`
```js
onConversationReady?.();
```

#### `message_start`
```js
const t = JSON.parse(e.data);
// t = { type: "message_start", message: { uuid, parent_uuid, model, id, trace_id, request_id, usage } }
onMessageStart?.({
  assistantMessageUuid: t.message.uuid,
  humanMessageUuid: t.message.parent_uuid ?? null
});
// Telemetry with trace_id and request_id
smoother.onMessage(t);
```

#### `message_delta`
```js
const t = JSON.parse(e.data);
// t = { type: "message_delta", delta: { stop_reason: "end_turn"|... }, usage: {...} }
if (t.delta.stop_reason) M = t.delta.stop_reason;
smoother.onMessage(t);
```

#### `message_stop`
```js
const t = JSON.parse(e.data);
if (!M) M = "message_stop";  // fallback stop reason
// Telemetry: Mx("chat.sse_message_stop", {stop.reason: M})
smoother.onMessage(t);
```

#### `tool_approval`
```js
break;  // literal no-op in SSE handler; approval state is on the tool_use block
```

#### `mcp_auth_required`
```js
const t = JSON.parse(e.data);
// t = { tool_use_id, server_id, error_code, conversation_uuid }
const blocks = smoother.getBlocks();
for (let i = blocks.length - 1; i >= 0; i--) {
  if (blocks[i].type === "tool_use" && blocks[i].id === t.tool_use_id) {
    blocks[i] = {
      ...blocks[i],
      mcp_auth_required: {
        server_id: t.server_id,
        tool_use_id: t.tool_use_id,
        error_code: t.error_code,
        conversation_uuid: conversationUuid
      }
    };
    break;
  }
}
smoother.on_completion?.(blocks);  // force UI update
```

#### `cache_performance`
```js
const t = JSON.parse(e.data);
onCachePerformance?.(t.cache_performance);
```

---

## 3. Content Block Type Handlers (Smoother Block Operations)

The smoother (`UA` class) delegates block logic to `blockOperations` (created by `qA()`):

### `createBlockFromStartEvent(event)`

```js
createBlockFromStartEvent: event => {
  if (event.content_block.type === "thinking") {
    event.content_block.start_timestamp = new Date().toISOString();
  }
  return event.content_block;
  // Returns the raw content_block as the initial block state
}
```

Initial block shapes by type:
- **text**: `{ type: "text", text: "" }`
- **thinking**: `{ type: "thinking", thinking: "", start_timestamp: "..." }`
- **tool_use**: `{ type: "tool_use", id: "...", name: "...", input: {} }`
- **tool_result**: `{ type: "tool_result", tool_use_id: "...", content: [] }`

### `applyDeltaEvent(deltaEvent, currentBlock)`

#### Flag deltas (any block type)
```js
if (delta.type === "flag_delta") {
  // Adds flag to block's flags set, preserves helpline field
  return {
    ...block,
    flags: [...new Set([...(block.flags ?? []), delta.flag])],
    ...(delta.helpline && { helpline: delta.helpline })
  };
}
```

#### Text block deltas
```js
case "text":
  switch (delta.type) {
    case "text_delta":
      return { ...block, text: block.text + delta.text };

    case "citation_start_delta":
      // Store citation in a Map by UUID, recording start_index = current text length
      citationMap.set(delta.citation.uuid, {
        ...delta.citation,
        start_index: block.text.length
      });
      return block;

    case "citation_end_delta":
      // Finalize citation with end_index = current text length
      const citation = citationMap.get(delta.citation_uuid);
      return {
        ...block,
        citations: [...(block.citations ?? []), { ...citation, end_index: block.text.length }]
      };
  }
```

#### Thinking block deltas
```js
case "thinking":
  switch (delta.type) {
    case "thinking_delta":
      return { ...block, thinking: block.thinking + delta.thinking };

    case "thinking_summary_delta":
      return { ...block, summaries: [...(block.summaries || []), delta.summary] };

    case "thinking_cut_off_delta":
      return { ...block, cut_off: delta.cut_off };
  }
```

Note: There is NO `signature_delta` handling in this bundle version. Thinking blocks
use `thinking_delta` for content and `thinking_summary_delta` / `thinking_cut_off_delta`
for metadata.

#### Tool result block deltas
```js
case "tool_result":
  if (delta.type === "input_json_delta") {
    let content;
    try {
      const parsed = JSON.parse(delta.partial_json);
      content = Array.isArray(parsed)
        && parsed.length > 0
        && parsed.every(e => typeof e === "object" && e !== null && "type" in e)
          ? parsed
          : [{ type: "text", text: delta.partial_json }];
    } catch {
      content = [{ type: "text", text: delta.partial_json }];
    }
    return { ...block, content };
  }
  return block;
```

#### Tool use block deltas
```js
case "tool_use":
  switch (delta.type) {
    case "input_json_delta":
      return {
        ...block,
        partial_json: (block.partial_json ?? "") + delta.partial_json
      };

    case "tool_use_block_update_delta":
      return {
        ...block,
        ...(delta.message !== undefined && { message: delta.message }),
        ...(delta.display_content !== undefined && { display_content: delta.display_content })
      };
  }
```

### `stopBlockEvent(event, block)`

```js
stopBlockEvent: (event, block) => {
  if (block.type === "thinking")
    return { ...block, stop_timestamp: event.stop_timestamp };
  if (block.type === "tool_use")
    return { ...block, buffered_input: event.buffered_input || "{}" };
  return block;
}
```

### `blockSize(block)` -- for smoother progress tracking

```js
blockSize: block => {
  if (block.type === "text")     return block.text.length;
  if (block.type === "thinking") return block.thinking.length;
  if (block.type === "tool_use") return block.partial_json?.length || 0;
  return 0;  // tool_result, others
}
```

### `sliceBlock(block, length)` -- for smoothed rendering

```js
sliceBlock: (block, length) => {
  if (block.type === "tool_result") return block;  // never sliced
  if (block.type === "text")     return { ...block, text: block.text.slice(0, length) };
  if (block.type === "tool_use") return { ...block, partial_json: block.partial_json?.slice(0, length) };
  if (block.type === "thinking") return { ...block, thinking: block.thinking.slice(0, length) };
  return block;
}
```

### `getBlockDeadlineOffset()`
```js
getBlockDeadlineOffset: () => {
  if (isThinkingBlock) return 3;  // 3-second deadline offset for thinking blocks
  // undefined for other blocks (defaults to 0.3s in smoother)
}
```

---

## 4. Message Accumulator / Smoother State Machine

### Smoother class `UA`

The smoother sits between the SSE stream and the UI. It accumulates raw events
and delivers smoothed output at ~60fps.

```js
class UA {
  alpha = 0.99;        // velocity smoothing factor
  gamma = 1e-5;        // physics parameter
  v = 100;             // current velocity (chars/sec)
  x = 0;               // current rendered position (chars)
  t = 0;               // current time
  arrivals = [[-9999, 0]];  // (time, totalChars) pairs
  start = 0;           // timestamp of first event
  totalCompletionLength = 0;
  model_done = false;
  force_smoother_done = false;
  dont_smooth = false;  // true → bypass smoothing, deliver raw blocks
  blocksList = [];      // accumulated blocks
  blockIndexOffset = 0; // offset for multi-message-start scenarios
  serverIndexBase = null;

  get smootherDone() {
    return this.force_smoother_done
      || (this.model_done
          && this.x >= this.totalCompletionLength
          && !this.blocksMutatedSinceLastDelivery);
  }
}
```

### onMessage dispatch in smoother

```js
onMessage(event) {
  switch (event.type) {
    case "message_start":
      // Handle multi-turn: if blocks already exist, offset subsequent indices
      if (this.blocksList.length > 0) {
        this.blockIndexOffset = this.blocksList.length;
        this.serverIndexBase = null;
      }
      break;

    case "content_block_start":
      const block = this.blockOperations.createBlockFromStartEvent(event);
      if (block !== null) {
        if (this.blockIndexOffset > 0 && this.serverIndexBase === null)
          this.serverIndexBase = event.index;
        this.addBlock(event.index, block);
      }
      break;

    case "content_block_delta":
      const adjIdx = this.getAdjustedIndex(event.index);
      const existing = this.blocksList[adjIdx];
      if (!existing) break;
      this.updateBlock(adjIdx, this.blockOperations.applyDeltaEvent(event, existing));
      break;

    case "content_block_stop":
      const stopIdx = this.getAdjustedIndex(event.index);
      const stopBlock = this.blocksList[stopIdx];
      if (!stopBlock) break;
      this.updateBlock(stopIdx, this.blockOperations.stopBlockEvent(event, stopBlock));
      this.blocksMutatedSinceLastDelivery = true;
      break;

    case "message_stop":
      this.model_done = true;
      break;
  }
  // Update total length and arrival tracking
  this.totalCompletionLength = this.blocksList.reduce(
    (acc, b) => acc + this.blockOperations.blockSize(b), 0
  );
  this.arrivals.push([(Date.now() - this.start) / 1000, this.totalCompletionLength]);
}
```

### Smoothing animation loop (`task` method)

Runs in a loop at ~60fps (16.67ms intervals) while streaming:
- Uses a physics model to smoothly advance `x` toward `totalCompletionLength`
- When document is hidden: delivers raw blocks at 200ms intervals
- When tab visible: uses `FA(blockOperations, blocksList, x)` to produce sliced blocks
- Calls `on_completion(slicedBlocks)` each frame
- The smoother uses a bisection root-finding algorithm on a physics equation to
  determine the next `x` position

### Stream activity state machine (UI level)

The React layer tracks streaming mode for UI updates:

```js
// State transitions based on SSE events:
if (event is message_start)        → mode = "requesting"
if (event is content_block_start && type === "thinking") → mode = "thinking"
if (event is text_delta)           → mode = "responding"
if (event is content_block_start && type === "tool_use") → mode = "tool-use"
if (event is message_stop)         → mode = "requesting"  // (tool loop or done)
```

### React state shape on message_start

```js
// On message_start, the state is initialized:
const assistantMessage = {
  type: "assistant",
  message: {
    id: event.message.id,
    type: "message",
    role: "assistant",
    model: event.message.model,
    content: [{ type: "text", text: "" }],  // initial empty text block
    stop_reason: null,
    stop_sequence: null,
    usage: {
      input_tokens: event.message.usage?.input_tokens ?? 0,
      output_tokens: event.message.usage?.output_tokens ?? 0,
      cache_creation_input_tokens: event.message.usage?.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: event.message.usage?.cache_read_input_tokens ?? 0
    }
  },
  session_id: session_id,
  uuid: uuid
};
```

---

## 5. Completion Request Lifecycle

### Request body builder (function `fM`)

```js
function fM(params) {
  const body = {
    prompt: params.prompt,
    parent_message_uuid: params.parent_message_uuid ?? undefined,
    timezone: params.timezone,
    personalized_styles: params.personalized_style
      ? [params.personalized_style]
      : undefined,
    locale: validLocales.includes(params.locale) ? params.locale : "en-US",
  };

  // Optional: iframe / localStorage system prompt
  const customPrompt = localStorage.getItem("iframeSystemPrompt")
    || localStorage.getItem(sM);  // sM = local storage key for custom system prompt
  if (customPrompt) body.custom_system_prompt = customPrompt;

  if (params.model) body.model = params.model;
  if (params.modelOverride) body.model = params.modelOverride;
  if (typeof params.temperature === "string")
    body.temperature = parseInt(params.temperature);
  if (params.maxTokensToSample)
    body.max_tokens_to_sample = parseInt(params.maxTokensToSample);
  if (params.paprika_mode) body.paprika_mode = params.paprika_mode;
  if (params.tools.length) body.tools = params.tools;
  if (params.tool_states?.length) body.tool_states = params.tool_states;

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

### Final request body composition (in `mT`)

The body sent over the wire is:

```js
const N = {
  ...completion,        // output of fM (prompt, model, timezone, etc.)
  ...additionalParams,  // from the caller (attachments, files, etc.)
  text: undefined,                    // explicitly cleared
  rendering_mode: "messages",         // ALWAYS "messages" for streaming
  organization_uuid: undefined,       // cleared (in URL path instead)
  conversation_uuid: undefined,       // cleared (in URL path instead)
  create_conversation_params: createConversationParams  // for new conversations
};
```

### `turn_message_uuids`

Generated CLIENT-SIDE. The human_message_uuid and assistant_message_uuid are
UUIDs created by the frontend before sending. They are used for idempotency
and message tree construction.

```js
turn_message_uuids: {
  human_message_uuid: "client-generated-uuid",
  assistant_message_uuid: "client-generated-uuid"
}
```

### `create_conversation_params` (for new conversations)

```js
{
  name: "",
  model: "claude-sonnet-4-20250514",
  project_uuid: "...",
  include_conversation_preferences: true,
  paprika_mode: "...",
  compass_mode: "...",
  create_mode: "...",
  is_temporary: false,
  enabled_imagine: boolean,
  orbit_action_uuid: "..."
}
```

### `rendering_mode` values

- `"messages"` -- standard Messages API format (used for streaming and fetching)
- `"raw"` -- used for PUT/update operations on conversation settings

### `paprika_mode` and `compass_mode`

These are mode identifiers (likely A/B experiment groups) stored in:
```js
const Yc = ["paprika_mode", "compass_mode"];
```
The server model config provides available `paprika_modes` and `thinking_modes`.

### Endpoint URLs

- New completion: `POST /api/organizations/{orgUuid}/chat_conversations/{convUuid}/completion`
- Retry completion: `POST /api/organizations/{orgUuid}/chat_conversations/{convUuid}/retry_completion`

### On retry (expanded mode)

When retrying after the first attempt, `create_conversation_params` and
`turn_message_uuids` are stripped from the body:

```js
const retryBody = {
  ...N,
  create_conversation_params: undefined,
  turn_message_uuids: undefined
};
```

---

## 6. Error Handling in SSE Stream

### Error class `vo`

```js
class vo extends Error {
  constructor(message, type, statusCode, extra, errorCode, endpoint, method) {
    super(message);
    this.type = type;             // "overloaded_error", "rate_limit_error", etc.
    this.statusCode = statusCode; // HTTP status
    this.extra = extra;           // { headers, details, ... }
    this.errorCode = errorCode;   // e.g. "model_not_available"
    this.endpoint = endpoint;
    this.method = method;
  }
}
```

### Error factory `Co`

```js
function Co({ status, response, fallbackMessage, headers, endpoint, method }) {
  if (response?.error) {
    const { message, type, details, ...extra } = response.error;
    extra.headers = headers;
    extra.details = details;
    let errorCode = null;
    if (details?.error_code) errorCode = details.error_code;
    let msg = message || response.error_description;
    return new vo(msg, type, status, extra, errorCode, endpoint, method);
  }
  return new vo(fallbackMessage, "api_error", status, response || {}, null, endpoint, method);
}
```

### `onopen` handler (HTTP-level errors)

```js
async onopen(response) {
  if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream")) {
    const text = await response.text();
    let parsed = {};
    try { parsed = JSON.parse(text); } catch {}
    throw Co({
      status: response.status,
      response: parsed,
      fallbackMessage: "Failed to fetch",
      headers: response.headers,
      endpoint: url,
      method: "POST"
    });
  }
}
```

### `onerror` handler

```js
onerror(error) {
  throw error;  // after logging
  // Also: smoother.model_done = true; smoother.force_smoother_done = true;
}
```

### `onclose` handler

```js
onclose() {
  smoother.model_done = true;  // stream ended normally
}
```

### Error classification function `iT`

```js
function iT(error) {
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    if (msg.includes("failed to fetch")
        || msg.includes("networkerror")
        || msg.includes("load failed")
        || msg.includes("connection refused"))
      return "network";
    return null;
  }
  if (error instanceof vo) {
    // 4xx errors (except 409) are NOT retried:
    if (error.statusCode === 409 || error.statusCode === 429
        || (error.statusCode >= 400 && error.statusCode < 500))
      return null;
    if (error.type === "overloaded_error") return "server.overloaded";
    if (error.statusCode >= 500) return "server.generic";
    return null;
  }
  return null;
}
```

### Retryable check `lT`

```js
function lT(error) {
  return iT(error) !== null       // network or server error
    || (error instanceof vo && error.statusCode === 409);  // 409 = conflict, retryable
}
```

### Specific error handling in UI:

- **`rate_limit_error`** → Parse JSON from message body for limit details
  - `"concurrents"` representativeClaim → "Too many chats going"
  - `"thinking_messages_rate_limit_exceeded"` → Weekly thinking limit
  - `"opus_messages_rate_limit_exceeded"` → throws (triggers upsell)
- **`not_found_error`** →
  - Message contains "model:" → "Model not available"
  - `errorCode === "model_not_available"` → show error message
- **`billing_error`** → Billing error UI
- **`overloaded_error`** → Overloaded error UI
- **`invalid_request_error`** → Invalid request error UI
- **`incomplete_stream`** → Special constant `yT = "incomplete_stream"` when stream ends without `message_stop`

### Error classification for analytics:

```js
const classification =
  error === incompleteStreamError ? "incomplete_stream" :
  isApiError ? (
    error.type === "rate_limit_error" ? "rate_limit" :
    error.type === "overloaded_error" ? "overloaded" :
    error.type === "not_found_error" ? "not_found" :
    error.type === "billing_error" ? "billing" :
    error.type === "invalid_request_error" ? "invalid_request" :
    error.statusCode >= 500 ? "5xx" :
    "other"
  ) : "network";
```

---

## 7. Retry Logic

### Retry modes

Set by feature flags. Selected as:
```js
retryMode = shouldUseCaching || completionRetryDisabled ? "off"
  : completionRetryEmergency ? "emergency"
  : "expanded";
```

### Retry schedules by mode

#### `"off"`
No retries. Errors propagate immediately.

#### `"legacy"`
Only retries `overloaded_error`:
```js
{
  "server.overloaded": {
    maxAttempts: 10,
    backoff: { initialDelayMs: 5000, backoffAmount: 1.5, jitterFraction: 0.1 }
  }
}
```

#### `"expanded"` (default)
```js
{
  "network": {
    maxAttempts: 30,
    backoff: { initialDelayMs: 500, backoffAmount: 2, jitterFraction: 0.1, capAtAttempt: 4 }
  },
  "server.generic": {
    maxAttempts: 2,
    backoff: { initialDelayMs: 8000, backoffAmount: 1.5, jitterFraction: 0.15 }
  },
  "server.overloaded": {
    maxAttempts: 5,
    backoff: { initialDelayMs: 8000, backoffAmount: 1.5, jitterFraction: 0.15 }
  }
}
```

#### `"emergency"`
```js
{
  "server.overloaded": {
    maxAttempts: 3,
    backoff: { initialDelayMs: 45000, backoffAmount: 2, jitterFraction: 0.2, capAtAttempt: 2 }
  }
}
```

### Retry escalation

After 3 network failures, if `server.generic` schedule exists, network errors
are escalated to `server.generic` (longer delays, fewer attempts).

### Backoff inheritance

Consecutive failures are persisted to `localStorage` and `sessionStorage` under
key `"ant_completion_backoff_v1"`:
```js
{
  v: 1,
  consecutiveFailures: min(count, 15),
  lastFailureAt: Date.now()
}
```
Expires after 300 seconds (`GA = 3e5`). On success, both storage entries are cleared.

### Runaway guard

Hard limit of 50 total iterations across all error classes.

---

## 8. Stream Termination

### Normal completion

When `message_stop` is received:
1. `smoother.model_done = true` (set by `onMessage`)
2. `stop_reason` captured from `message_delta` event (or defaults to `"message_stop"`)
3. Smoother animation continues until `x >= totalCompletionLength`
4. Function returns `{ stopReason: M, messageLimitResult: S }`

### Incomplete stream (no `message_stop`)

When `onclose` fires without a prior `message_stop`:
- `smoother.model_done = true`
- If retries are enabled and error is retryable, retry logic kicks in
- If NOT retryable, throws `vT = new Error("incomplete_stream")`
- UI shows: "Something didn't load. Try again by chatting to Claude."

### Known `stop_reason` values

From UI handling:
- `"end_turn"` -- normal completion
- `"max_tokens"` -- length limit hit → "Claude reached its max length" + Continue button
- `"tool_use_limit"` -- tool use limit → "Claude reached its tool-use limit" + Continue button
- `"error"` -- error occurred → "Something didn't load" + retry option
- `"stop_sequence"` -- stop sequence hit
- `"prompt_injection_risk"` -- safety refusal
- `"refusal"` -- content policy refusal
- `"cyber_refusal"` -- cyber safety refusal

---

## 9. Tool Approval Flow

### Built-in tools (input buffering list)

```js
const pT = [
  "close_file", "create_file", "delete_file", "file_search",
  "open_file", "repl", "str_replace", "update_file"
];
```
These tools, plus any user-defined MCP tools, have their `input_json_delta`
accumulated in `E` (buffered input string) and attached to the `content_block_stop` event.

### Approval flow

Tool approval is NOT handled in the SSE event switch. The `tool_approval` event
is a literal no-op (`break;`). Instead, approval state is tracked on the block itself:

- `content_block_start` captures `approval_key` from `content_block.approval_key`
- `content_block_stop` attaches `buffered_input` (accumulated JSON)
- UI renders approval UI when `approval_options` and `approval_key` are present on a `tool_use` block

### Approval decision

```js
// When user decides:
if (decision === "always") {
  // Mark tool as always-approved
  toggleMcpToolAlwaysApproved(tool.alwaysApprovedKey, true);
}
if (decision === "deny") {
  // For remote MCP: POST /api/organizations/{org}/chat_conversations/{conv}/tool_approval
  //   body: { tool_use_id, is_approved: false, approval_key }
  // For local: override result with error content
}
// For approve:
//   POST tool_approval with { tool_use_id, is_approved: true, approval_key, approval_option }
```

### MCP auth required flow

When `mcp_auth_required` SSE event arrives, it patches the tool_use block in
the smoother's block list with `mcp_auth_required` metadata, triggering the
OAuth flow UI for the MCP server.

### Elicitation tool (`mcp__elicit__present_options`)

```js
const Eje = "mcp__elicit__present_options";
```
Special handling: events for this tool are captured into a separate store
(`Oje`) for the elicitation UI overlay.

### `AskUserQuestion` tool

Identified by name `"AskUserQuestion"`. Blocks the stream and shows a
question banner in the UI. Listed in `REQUIRES_INPUT` set alongside
`ExitPlanMode` and `mcp__secrets__request_secret`.

---

## 10. Transport: SSE vs gRPC

### Transport selection

```js
var tT = { SSE: "sse", GRPC: "grpc" };
// Default: transport = "sse"
```

The `mT` function accepts `transport: "sse" | "grpc"`. gRPC is used for mobile
apps (via `@anthropic-ai/connect-grpc`).

### SSE transport (web default)

Uses `PA` (fetchEventSource) as documented above.

### gRPC transport (mobile)

Uses protobuf-encoded streaming. The gRPC handler:
1. Calls `p.appendMessage(...)` or `p.retryMessage(...)` with protobuf messages
2. Iterates `for await (const event of grpcStream)`
3. Each event has `payload.case`:
   - `"completionEventJson"` -- JSON string of same event types as SSE
   - `"completionEventError"` -- error with `errorJson` and `statusCode`
4. JSON is parsed and dispatched to the same smoother

The gRPC event types are IDENTICAL to SSE event types -- they're just wrapped
in a protobuf envelope.

---

## 11. Message Store Updates on Stream Events

### React state updates (from the streaming hook)

Each event triggers a `startTransition` state update:

#### `message_start`
```js
// Reset accumulators
thinkingTextRef = "";
currentTextRef = "";
charCount = 0;
streamPhase = "thinking";
lastToolName = undefined;
streamStartTime = Date.now();
currentModel = event.message.model;

// Create assistant message state
setState({
  type: "assistant",
  message: {
    id: event.message.id,
    type: "message",
    role: "assistant",
    model: event.message.model,
    content: [{ type: "text", text: "" }],
    stop_reason: null,
    stop_sequence: null,
    usage: normalizeUsage(event.message.usage)
  },
  session_id: session_id,
  uuid: uuid
});
connectionStatus = "connected";
isStreaming = true;
```

#### `message_delta` (with usage)
```js
setState(prev => ({
  ...prev,
  message: {
    ...prev.message,
    usage: {
      input_tokens: event.usage.input_tokens,
      output_tokens: event.usage.output_tokens,
      cache_creation_input_tokens: event.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: event.usage.cache_read_input_tokens ?? 0
    }
  }
}));
```

#### `content_block_start` (thinking)
```js
setState(prev => ({
  ...prev,
  message: {
    ...prev.message,
    content: [...prev.message.content, { type: "thinking", thinking: "" }]
  }
}));
```

#### `thinking_delta`
Updates the last thinking block's text from a ref accumulator.

#### `content_block_start` (tool_use)
```js
streamPhase = "tool_use";
lastToolName = event.content_block.name;
streamStartTime = Date.now();
setState(prev => ({
  ...prev,
  message: {
    ...prev.message,
    content: [...prev.message.content, {
      type: "tool_use",
      id: event.content_block.id,
      name: event.content_block.name,
      input: {}
    }]
  }
}));
```

#### `text_delta`
```js
charCount += delta.text.length;
streamPhase = prev => (prev !== "writing" && (streamStartTime = Date.now()), "writing");
// Updates the text block from a ref accumulator (currentTextRef)
```

#### `input_json_delta` (tool_use)
```js
charCount += delta.partial_json?.length ?? 0;
// Extracts file_path from partial JSON for preview:
const filePath = partialJson.match(/"(?:file_path|path)"\s*:\s*"([^"]+)"/)?.[1];
```

---

## 12. Rate Limit / Message Limit UI

### `message_limit` SSE event data shape

The `message_limit` field returned has these variants:

```typescript
// Within limit:
{ type: "within_limit", overageInUse?: boolean }

// Approaching limit:
{
  type: "approaching_limit",
  remaining: number,
  conversationUuid: string,
  representativeClaim?: string,
  overageDisabledReason?: string,
  perModelLimit?: boolean,
  windows?: {
    "5h"?:      { status: "approaching_limit"|"exceeded_limit", resets_at: number, surpassed_threshold?: string },
    "7d"?:      { status: "approaching_limit"|"exceeded_limit", resets_at: number, surpassed_threshold?: string },
    "7d_opus"?: { status: "approaching_limit"|"exceeded_limit", resets_at: number, surpassed_threshold?: string },
    "7d_cowork"?:{ status: "approaching_limit"|"exceeded_limit", resets_at: number, surpassed_threshold?: string },
    overage?:   { status: "approaching_limit"|"exceeded_limit", resets_at: number, surpassed_threshold?: string }
  }
}

// Exceeded limit:
{
  type: "exceeded_limit",
  conversationUuid: string,
  representativeClaim?: string,  // e.g. "concurrents", "overage"
  overageDisabledReason?: string,
  perModelLimit?: boolean,
  windows?: { ... same as above ... }
}
```

### Window names

```
"5h"         -- 5-hour rolling window
"7d"         -- 7-day rolling window
"7d_opus"    -- 7-day Opus-specific window
"7d_cowork"  -- 7-day Cowork-specific window
"overage"    -- overage/extra-usage window
```

### Window priority for display

The UI selects which window to display:
1. If any standard window AND overage are both "exceeded_limit" → show "overage"
2. Among exceeded windows, pick the one with the latest `resets_at`
3. For "approaching_limit", check `5h` then `7d` then `overage`

### Rate limit bar display

```js
if (windowName === "5h") {
  // "You've used {surpassedThresholdFormatted} of your session limit"
  // Shows progress bar with surpassed threshold
}
if (windowName.startsWith("7d")) {
  // "{surpassedThresholdFormatted} of your weekly limit"
}
```

### Reset time display

```js
const resetTime = DateTime.fromSeconds(resets_at);
if (resetTime.diffNow("hours").hours > 24) {
  // "Limits will reset on {day} at {time}"
} else {
  // "Limits will reset at {time}"
}
```

### Overage states

- `overageDisabledReason` values: `"overage_not_provisioned"`, `"org_level_disabled"`,
  `"out_of_credits"`, `"org_level_disabled_until"`, `"org_service_zero_credit_limit"`
- `overageInUse: true` means extra usage is active and consuming credits
- When overage is blocking: show "Extra usage is required" or admin/upgrade prompts

### Limit stored to React Query cache

```js
// On receiving message_limit event:
queryClient.setQueryData(bootstrapQueryKey, prev => ({
  ...prev,
  messageLimits: {
    ...prev.messageLimits,
    [orgUuid]: messageLimitData
  }
}));
```

### Limit reset on conversation change

When navigating to a conversation where a prior "exceeded_limit" was set for a
different conversation, the limit is reset to `{ type: "within_limit" }`.

---

## 13. Legacy "completion" Format (Backward Compatibility)

The SSE parser handles TWO wire formats:

### Messages format (current)
Events: `message_start`, `content_block_start`, `content_block_delta`,
`content_block_stop`, `message_delta`, `message_stop`

### Legacy "completion" format
```js
function cT(event) {
  return event.completion_type === "unparsed";
}
```
When legacy events are detected (have `completion_type: "unparsed"` or
`completion` field), they are converted to messages format:
```js
smoother.onMessage({
  type: "content_block_delta",
  index: 0,
  delta: { type: "text_delta", text: event.completion || "" }
});
```

---

## 14. All Delta Types (Complete List)

From the `applyDeltaEvent` handler:

### On `text` blocks:
- `text_delta` — `{ type: "text_delta", text: "..." }`
- `citation_start_delta` — `{ type: "citation_start_delta", citation: { uuid, ... } }`
- `citation_end_delta` — `{ type: "citation_end_delta", citation_uuid: "..." }`
- `flag_delta` — `{ type: "flag_delta", flag: "...", helpline?: "..." }`

### On `thinking` blocks:
- `thinking_delta` — `{ type: "thinking_delta", thinking: "..." }`
- `thinking_summary_delta` — `{ type: "thinking_summary_delta", summary: "..." }`
- `thinking_cut_off_delta` — `{ type: "thinking_cut_off_delta", cut_off: ... }`
- `flag_delta` — same as text

### On `tool_use` blocks:
- `input_json_delta` — `{ type: "input_json_delta", partial_json: "..." }`
- `tool_use_block_update_delta` — `{ type: "tool_use_block_update_delta", message?: "...", display_content?: "..." }`
- `flag_delta` — same as text

### On `tool_result` blocks:
- `input_json_delta` — `{ type: "input_json_delta", partial_json: "..." }` (parsed as content array)

### Cross-block exceptions:
`thinking_summary_delta` and `tool_use_block_update_delta` are allowed to arrive
with an index that does NOT match the current block index `T` (they target a
different block).

---

## 15. Content Block Stop Event Fields

```js
// content_block_stop event data:
{
  type: "content_block_stop",
  index: number,
  // For thinking blocks:
  stop_timestamp?: string,        // ISO timestamp
  // For tool_use blocks (added client-side):
  buffered_input?: string         // accumulated input_json_delta (set by client)
}
```

---

## 16. Smoother Physics Constants

```js
{
  alpha: 0.99,               // velocity EMA smoothing
  gamma: 1e-5,               // force parameter in physics model
  v: 100,                    // initial velocity (chars/sec)
  framePeriod: 1000/60,      // ~16.67ms (60fps target)
  hiddenPollMs: 200,         // poll interval when tab hidden
  deadlineOffset: 0.3,       // seconds behind arrival for text blocks
  thinkingDeadlineOffset: 3, // seconds behind arrival for thinking blocks
}
```

When `dont_smooth = true` (disabled), blocks are delivered raw via
`structuredClone(blocksList)` on every event.

---

## 17. Second SSE Parser (MCP StreamableHTTP Transport)

There is a SEPARATE SSE parser for MCP (Model Context Protocol) connections.
This uses `TransformStream` + `TextDecoderStream`:

### Text-based SSE parser (function `o1t`)

```js
function o1t({ onEvent, onError, onRetry, onComment }) {
  let lastEventId, buffer = "", isFirstChunk = true, eventData = "", eventType = "";

  function processLine(line) {
    if (line === "") {
      // Empty line = dispatch event
      if (eventData.length > 0) {
        onEvent({
          id: lastEventId,
          event: eventType || undefined,
          data: eventData.endsWith("\n") ? eventData.slice(0, -1) : eventData
        });
      }
      lastEventId = undefined;
      eventData = "";
      eventType = "";
      return;
    }
    if (line.startsWith(":")) {
      // Comment line
      onComment?.(line.slice(line.startsWith(": ") ? 2 : 1));
      return;
    }
    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1) {
      const field = line.slice(0, colonIdx);
      const skip = line[colonIdx + 1] === " " ? 2 : 1;
      const value = line.slice(colonIdx + skip);
      switch (field) {
        case "event": eventType = value; break;
        case "data":  eventData = `${eventData}${value}\n`; break;
        case "id":    lastEventId = value.includes("\0") ? undefined : value; break;
        case "retry":
          /^\d+$/.test(value)
            ? onRetry(parseInt(value, 10))
            : onError(new Error(`Invalid retry value: "${value}"`));
          break;
        default:
          onError(new Error(`Unknown field "${field}"`));
      }
    }
  }

  return {
    feed(text) {
      const input = isFirstChunk ? text.replace(/^\xEF\xBB\xBF/, "") : text;
      const [lines, remainder] = splitLines(`${buffer}${input}`);
      for (const line of lines) processLine(line);
      buffer = remainder;
      isFirstChunk = false;
    },
    reset({ consume } = {}) {
      if (buffer && consume) processLine(buffer);
      lastEventId = undefined;
      eventData = "";
      eventType = "";
      buffer = "";
    }
  };
}
```

### MCP TransformStream wrapper (`l1t`)

```js
class l1t extends TransformStream {
  constructor({ onError, onRetry, onComment } = {}) {
    let parser;
    super({
      start(controller) {
        parser = o1t({
          onEvent: event => controller.enqueue(event),
          onError(err) {
            if (onError === "terminate") controller.error(err);
            else if (typeof onError === "function") onError(err);
          },
          onRetry: onRetry,
          onComment: onComment
        });
      },
      transform(chunk) { parser.feed(chunk); }
    });
  }
}
```

### MCP SSE stream consumption

```js
// response.body is piped through TextDecoderStream then l1t:
const reader = response.body
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new l1t({ onRetry: ms => { this._serverRetryMs = ms; } }))
  .getReader();

for (;;) {
  const { value: event, done } = await reader.read();
  if (done) break;
  if (event.id) {
    resumptionToken = event.id;
    onResumptionToken?.(event.id);
  }
  if (event.data && (!event.event || event.event === "message")) {
    const parsed = JSON.parse(event.data);
    this.onmessage?.(parsed);
  }
}
```

### MCP reconnection options

```js
const c1t = {
  initialReconnectionDelay: 1000,    // 1 second
  maxReconnectionDelay: 30000,       // 30 seconds
  reconnectionDelayGrowFactor: 1.5,
  maxRetries: 2
};
```

---

## 18. gRPC Wire Format Details

For mobile transport, events are protobuf-encoded using Connect-gRPC:

### Request protobuf messages

**AppendMessage** (`pE`):
```
{
  organizationUuid: string,
  chatConversationUuid: string,
  prompt: string,
  model: string,
  timezone: string,
  attachments: [{
    fileName: string,
    fileSize: number,
    fileType: string,
    extractedContent: string
  }],
  files: [...],
  tools: [...],
  renderingMode: MESSAGES  // enum
}
```

**RetryMessage** (`mE`):
```
{
  organizationUuid: string,
  chatConversationUuid: string,
  parentMessageUuid: string,
  model: string,
  timezone: string,
  customSystemPrompt: string,
  locale: string,
  paprikaMode: string,
  tools: [...],
  maxTokensToSample: number,
  renderingMode: MESSAGES
}
```

### Response stream frames

gRPC-Web framing over HTTP/2 or HTTP/1.1:
```
Each frame: [flags: 1 byte] [length: 4 bytes big-endian] [data: length bytes]
  flags & 1 = compressed (not supported, throws error)
  flags & 2 = trailer frame
```

### Response payload cases

```
payload.case = "completionEventJson"  → JSON.parse(payload.value)
payload.case = "completionEventError" → { errorJson: string, statusCode: number }
```

The JSON inside `completionEventJson` is IDENTICAL to SSE event data objects.

---

## 19. Stream Reconnection (Active Stream Recovery)

When a page reloads or reconnects to an active stream:

```js
// Creates placeholder assistant message:
const placeholder = {
  uuid: `${cj}-${generateId()}`,  // cj = prefix constant
  sender: "assistant",
  content: [{ type: "text", text: "" }],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  parent_message_uuid: pendingUserMessage.uuid,
  attachments: [],
  files: [],
  files_v2: [],
  sync_sources: [],
  index: 1
};

// Creates a new smoother for reconnection
const smoother = qA();
smoother.dont_smooth = isSmothingDisabled;
smoother.on_completion = (blocks) => onIncrementalCompletion(convUuid, blocks);

// Events from the reconnected stream are fed into the smoother:
if (event.type === "message_start") {
  assistantMessageUuid = event.message?.uuid;
}
smoother.onMessage(event);
if (event.type === "message_stop") {
  smoother.model_done = true;
}
```
