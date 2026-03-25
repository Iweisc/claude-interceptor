# Claude.ai WebSocket Protocol Documentation

Extracted from bundle: `index-DcrCrePJ.js` (7,195,194 bytes)
Date: 2026-03-22

---

## Table of Contents

1. [WebSocket Connection Inventory](#1-websocket-connection-inventory)
2. [Voice WebSocket Protocol](#2-voice-websocket-protocol)
3. [Dictation (Speech-to-Text) WebSocket Protocol](#3-dictation-speech-to-text-websocket-protocol)
4. [MCP WebSocket Protocol](#4-mcp-websocket-protocol)
5. [MCP Bootstrap (SSE, not WebSocket)](#5-mcp-bootstrap-sse-not-websocket)
6. [Cowork / Collaborative Protocol](#6-cowork--collaborative-protocol)
7. [Deep Research / Compass Protocol](#7-deep-research--compass-protocol)
8. [Audio Processing Pipeline](#8-audio-processing-pipeline)
9. [Notification / Real-time Updates](#9-notification--real-time-updates)

---

## 1. WebSocket Connection Inventory

The bundle contains exactly **three** `new WebSocket()` call sites:

| # | Class | URL Pattern | Protocol |
|---|-------|-------------|----------|
| 1 | `Xze` (VoiceWebSocket) | `/api/ws/voice/organizations/{orgUuid}/chat_conversations/{convUuid}?...` | Voice mode (full-duplex audio + JSON control) |
| 2 | `V5e` (DictationWebSocket) | `/api/ws/speech_to_text/voice_stream?...` | Dictation-only STT (audio in, transcript JSON out) |
| 3 | `g1t` (WebSocketClientTransport) | `/api/ws/organizations/{orgUuid}/mcp/servers/{serverUuid}/` | MCP tool server (JSON-RPC 2.0 over WS) |

There are **zero** other WebSocket connections. No notification WebSocket, no collaborative editing WebSocket, no deep research WebSocket.

---

## 2. Voice WebSocket Protocol

### 2.1 URL Construction (function `Kze`)

```js
// Default voice config ($ze):
const $ze = {
    voice: "buttery",
    inputEncoding: "opus",
    inputSampleRate: 16000,      // 16e3
    inputChannels: 1,
    outputEncoding: "opus",
    outputFormat: "pcm_16000",
    language: "en",
    serverInterruptEnabled: true
};

// URL builder:
function Kze(e) {
    const t = e.voiceConfig ?? {
        voice: "buttery",
        inputEncoding: "opus",
        inputSampleRate: 16e3,
        inputChannels: 1,
        outputFormat: "pcm_16000",
        language: "en",
        serverInterruptEnabled: true
    };
    const n = new URLSearchParams({
        input_encoding: t.inputEncoding,
        input_sample_rate: String(t.inputSampleRate),
        input_channels: String(t.inputChannels),
        output_format: t.outputFormat,
        language: t.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        voice: t.voice,
        server_interrupt_enabled: String(t.serverInterruptEnabled),
        client_platform: "web_claude_ai"
    });
    const s = `/api/ws/voice/organizations/${e.organizationUuid}/chat_conversations/${e.conversationUuid}`;
    return `${e.baseUrl}${s}?${n.toString()}`;
}
```

Full URL example:
```
wss://claude.ai/api/ws/voice/organizations/{orgUuid}/chat_conversations/{convUuid}?input_encoding=opus&input_sample_rate=16000&input_channels=1&output_format=pcm_16000&language=en&timezone=America/New_York&voice=buttery&server_interrupt_enabled=true&client_platform=web_claude_ai
```

For localhost development: `ws://localhost:4001/api/ws/voice/...`

### 2.2 Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `input_encoding` | string | `"opus"` | Audio encoding sent by client. Values: `"opus"`, `"linear16"` |
| `input_sample_rate` | string | `"16000"` | Sample rate of input audio |
| `input_channels` | string | `"1"` | Number of audio channels |
| `output_format` | string | `"pcm_16000"` | Server output audio format |
| `language` | string | `"en"` | Language code |
| `timezone` | string | (auto) | IANA timezone from `Intl.DateTimeFormat()` |
| `voice` | string | `"buttery"` | Voice selection |
| `server_interrupt_enabled` | string | `"true"` | Whether server-side interruption is enabled |
| `client_platform` | string | `"web_claude_ai"` | Client identifier |

### 2.3 Available Voices

```js
// Voice ID array:
["buttery", "airy", "mellow", "glassy", "rounded"]

// Voice selector options:
[
    { id: "airy",    label: "Airy" },
    { id: "buttery", label: "Buttery" },
    { id: "mellow",  label: "Mellow" },
    { id: "glassy",  label: "Glassy" },
    { id: "rounded", label: "Rounded" }
]

// Validation set (Ybt):
new Set(["buttery", "airy", "mellow", "glassy", "rounded"])
```

Default voice: `"buttery"`. Persisted to `localStorage` key `"claude-selected-voice"`.

### 2.4 Connection Configuration (constants `Zze`)

```js
const Zze = {
    keepAliveInterval: 4000,       // 4 seconds
    maxReconnectAttempts: 5,
    initialReconnectDelay: 250     // ms, exponential backoff up to 4000ms
};
```

### 2.5 WebSocket Setup (class `Xze`)

```js
this.ws = new WebSocket(e);
this.ws.binaryType = "arraybuffer";   // binary frames arrive as ArrayBuffer
```

### 2.6 Connection State Machine

States of `Xze`:
```
"disconnected" -> "connecting" -> "connected" -> "disconnected"
                                  "connected" -> "error"
                  "reconnecting" -> "connected"
```

States of the voice session manager (`Jze`):
```
"idle" -> "connecting" -> "listening" -> "speaking" -> "listening"
                          "listening" -> "processing" -> "speaking"
                          any -> "error"
```

Full lifecycle:
1. `idle` -- user clicks voice button
2. `connecting` -- WebSocket connecting, mic acquiring
3. `listening` (with `isMuted: false`) -- mic active, waiting for user speech
4. User speaks: `transcript_interim` events update interim transcript
5. `processing` -- user stopped speaking, assistant is thinking (debounced 1000ms after `user_input_end`)
6. `speaking` -- assistant audio playing back, karaoke text highlighting active
7. `listening` -- playback ends, cycle repeats

### 2.7 Client-to-Server Messages

#### Binary Frames (Audio)
Client sends raw audio frames as binary WebSocket messages:
- **Opus backend (default):** Raw Opus packets (no container), extracted from WebM via EBML demuxer or from WebCodecs AudioEncoder
- **PCM backend:** Raw PCM Int16 samples in a Blob with MIME `application/octet-stream`

```js
sendAudio(e) {
    this.ws?.readyState === WebSocket.OPEN &&
        (e instanceof Blob
            ? e.arrayBuffer().then(e => { this.ws?.send(e) })
            : this.ws.send(e));
}
```

#### JSON Control Messages

All control messages are `{ type: "<string>" }`:

```js
sendControl(e) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const t = { type: e };
    this.ws.send(JSON.stringify(t));
}
```

| Message Type | When Sent | Purpose |
|---|---|---|
| `"keep_alive"` | Every 4000ms (keepAliveInterval) | Keeps connection alive |
| `"interrupt"` | User taps while assistant is speaking | Interrupt assistant playback |
| `"manual_input_end"` | User explicitly signals done speaking | End of user turn |
| `"playback_complete"` | Client finished playing all audio | Signal server that playback is done |

### 2.8 Server-to-Client Messages

#### Binary Frames (Audio)
Server sends **PCM 16-bit signed integer, 16kHz, mono** audio as `ArrayBuffer`.

```js
handleMessage(e) {
    if (e.data instanceof ArrayBuffer)
        this.onAudioData?.(e.data);
    else if (e.data instanceof Blob)
        e.data.arrayBuffer().then(e => { this.onAudioData?.(e) });
    else if ("string" === typeof e.data) {
        let t;
        try { t = JSON.parse(e.data) } catch { return }
        this.handleServerEvent(t);
    }
}
```

#### JSON Server Events

| Event Type | Fields | Description |
|---|---|---|
| `session_server_initialized` | `session_id` | Session ready, stores session ID. Transitions to `"listening"`. |
| `transcription_start` | (none) | User started speaking. If assistant was speaking, interrupts playback. Resets to `"listening"`. |
| `transcript_interim` | `text` | Interim user transcript (partial). Updates UI in real-time. |
| `user_input_end` | (none) | User stopped speaking. Starts 1000ms debounce to transition to `"processing"`. |
| `playback_start` | (none) | Assistant audio playback should begin. Transitions to `"speaking"`. Starts karaoke tick. |
| `playback_end` | (none) | Server signals end of audio. If audio is still playing, defers until buffer drains. |
| `message_sse` | `event` (nested) | Wraps standard SSE message events (`message_start`, `content_block_delta`, etc.) |
| `message_complete` | `data: { sender, message_uuid, content[] }` | Message finalized. `"human"` sender = user transcript committed. `"assistant"` = assistant message complete. |
| `tts_word` | `text`, `pts_ms` | Word-level karaoke timing. `pts_ms` = presentation timestamp in ms for word highlighting. |
| `error` | `error: { type, message }` OR `data: { error_code, display_message }` | Error event. Error types: `"session_expired"`, `"rate_limited"`, `"unknown"`. Stops recording, shows error. |
| `pong` | (none) | Response to `keep_alive`. Silently ignored (no logging). |

#### Nested `message_sse` Sub-Events

The `message_sse` event wraps standard streaming events:

```js
// event.event.type values:
"message_start"       // Contains message UUID, model info
"content_block_start" // New content block beginning
"content_block_delta" // Incremental text: event.event.data.delta.text
"content_block_stop"  // Block finished
"message_delta"       // Message-level updates
"message_stop"        // Message complete
```

### 2.9 Close Codes

Custom close codes handled by `getCloseReason`:

| Code | Meaning |
|------|---------|
| 1000 | Normal closure |
| 1001 | Going away |
| 1002 | Protocol error |
| 1003 | Unsupported data |
| 1005 | No status received |
| 1006 | Abnormal closure (connection lost or server unreachable) |
| 1007 | Invalid frame payload data |
| 1008 | Policy violation |
| 1009 | Message too big |
| 1010 | Mandatory extension missing |
| 1011 | Internal server error |
| 1015 | TLS handshake failure |
| **4001** | **Unauthorized (authentication required)** |
| **4003** | **Forbidden (insufficient permissions)** |
| **4004** | **Not found (invalid conversation or organization)** |

### 2.10 Reconnection Protocol

- Exponential backoff: `initialReconnectDelay * 2^attempt`, capped at 4000ms
- Max 5 reconnect attempts (`maxReconnectAttempts`)
- State changes to `"reconnecting"` during reconnect attempts
- On reconnect success: resets `reconnectAttempts` to 0, restarts keepAlive
- On `error` event from server: `shouldReconnect` set to `false` (no reconnect)

### 2.11 Interruption Protocol

When user speaks while assistant is playing:

1. Server sends `transcription_start`
2. Client calls `this.player?.stop()` -- stops all scheduled audio buffers
3. Client calls `this.freezeKaraokeOnInterrupt()` -- freezes karaoke highlighting
4. Client calls `this.truncateToSpokenContent()` -- trims assistant message to what was actually spoken
5. State transitions back to `"listening"`

When user explicitly interrupts (taps button):
1. Client sends `{ type: "interrupt" }` JSON control message
2. Server stops generating audio

### 2.12 Karaoke (Word-Level Highlighting)

- Server sends `tts_word` events with `{ text, pts_ms }`
- `pts_ms` = presentation timestamp in milliseconds, relative to audio stream start
- Client tracks `karaokeWordTimings[]` array of `{ text, ptsMs }`
- `karaokeFirstPtsMs` = first word's PTS
- `karaokePlaybackStartedAt` = `Date.now()` when playback starts
- Tick interval updates `karaokeSpokenCount` based on elapsed playback time vs PTS
- On interruption, karaoke freezes at current spoken word position

---

## 3. Dictation (Speech-to-Text) WebSocket Protocol

### 3.1 URL Construction (class `V5e`)

```js
const r = "undefined" == typeof window ? "" :
    "localhost" === window.location.hostname || "127.0.0.1" === window.location.hostname
        ? "ws://localhost:4001" : "";
const i = r.startsWith("ws") ? "" : "wss:";
const o = `${r || `${i}//${window.location.host}`}/api/ws/speech_to_text/voice_stream?${
    new URLSearchParams({
        encoding: t ? "linear16" : "opus",
        sample_rate: "16000",
        channels: "1",
        endpointing_ms: "300",
        utterance_end_ms: "1000",
        language: e,
        ...void 0 !== t ? { use_conversation_engine: String(t) } : {},
        ...n ? { stt_provider: n } : {}
    }).toString()
}`;
```

Full URL example:
```
wss://claude.ai/api/ws/speech_to_text/voice_stream?encoding=opus&sample_rate=16000&channels=1&endpointing_ms=300&utterance_end_ms=1000&language=en
```

With conversation engine:
```
wss://claude.ai/api/ws/speech_to_text/voice_stream?encoding=linear16&sample_rate=16000&channels=1&endpointing_ms=300&utterance_end_ms=1000&language=en&use_conversation_engine=true&stt_provider=deepgram-nova3
```

### 3.2 Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `encoding` | string | `"opus"` | Audio encoding. `"opus"` or `"linear16"` (when `use_conversation_engine` is true) |
| `sample_rate` | string | `"16000"` | Audio sample rate |
| `channels` | string | `"1"` | Number of channels |
| `endpointing_ms` | string | `"300"` | Silence duration to detect end of utterance (ms) |
| `utterance_end_ms` | string | `"1000"` | Maximum pause before utterance is considered complete |
| `language` | string | `"en"` | Language code |
| `use_conversation_engine` | string | (optional) | Feature flag: `"true"` or `"false"` |
| `stt_provider` | string | (optional) | STT provider, e.g., `"deepgram-nova3"` |

### 3.3 Binary Type

```js
this.ws.binaryType = "arraybuffer";
```

### 3.4 Client-to-Server Messages

| Type | Format | Description |
|------|--------|-------------|
| Audio data | Binary (ArrayBuffer) | Raw audio frames (Opus or Linear16 PCM) |
| `{ type: "KeepAlive" }` | JSON | Sent every 4000ms |
| `{ type: "CloseStream" }` | JSON | Graceful close request |

### 3.5 Server-to-Client Messages

All JSON with `{ type, data }` structure:

| Type | `data` field | Description |
|------|-------------|-------------|
| `"TranscriptInterim"` | `string` | Interim (partial) transcript text |
| `"TranscriptText"` | `string` | Final transcript text for an utterance |
| `"TranscriptEndpoint"` | (none) | End of utterance marker |

### 3.6 Graceful Close Protocol

```js
closeGracefully() {
    // 1. Send CloseStream JSON
    e.send(JSON.stringify({ type: "CloseStream" }));
    // 2. Wait up to 2000ms for server to close
    // 3. If timeout, force close
}
```

### 3.7 Session Management

- Max session duration: `G5e = 120000` ms (2 minutes)
- Silence auto-stop: configurable via `desktop_dictation_voice_config.silence_auto_stop_ms`, default 15000ms, capped at 120000ms
- Feature flag `desktop_dictation_voice_config.use_conversation_engine` controls whether to use Deepgram Nova 3

---

## 4. MCP WebSocket Protocol

### 4.1 Transport Selection

MCP servers connect via one of **two** transports, controlled by the `mcp_tb_sessions` feature flag:

```js
const hJ = () => Bx("mcp_tb_sessions");  // Feature flag check

// If feature flag is ON (o = true): Streamable HTTP transport (u1t)
// If feature flag is OFF (o = false): WebSocket transport (g1t)
```

### 4.2 WebSocket Transport (class `g1t`)

URL pattern:
```
wss://claude.ai/api/ws/organizations/{orgUuid}/mcp/servers/{serverUuid}/
```

**WebSocket sub-protocol:** `["mcp"]`

```js
class g1t {
    constructor(e) { this._url = e }

    start() {
        return new Promise((e, t) => {
            this._socket = new WebSocket(this._url, ["mcp"]);
            this._socket.onerror = ...;
            this._socket.onopen = () => { e() };
            this._socket.onclose = ...;
            this._socket.onmessage = e => {
                let t = JSON.parse(e.data);

                // Check for auth error
                if ("mcp_unauthorized" === t.error_code)
                    return this.onAuthError?.(new f1t(t.error || "Authentication required"));

                // Parse as JSON-RPC
                let s = WF.parse(t);

                // Special "connected" notification from server
                if ("connected" === s.method && s.params)
                    this.onConnect?.(s.params.used_auth);
                else
                    this.onmessage?.(s);
            };
        });
    }

    send(e) {
        this._socket?.send(JSON.stringify(e));
    }
}
```

### 4.3 MCP WebSocket Message Protocol

All messages are **JSON-RPC 2.0**.

#### Server-to-Client Special Messages

| Message | Format | Description |
|---------|--------|-------------|
| Auth error | `{ error_code: "mcp_unauthorized", error: "..." }` | Authentication required, triggers OAuth flow |
| Connected | `{ method: "connected", params: { used_auth: boolean } }` | Server confirms connection, reports if auth was used |
| Standard JSON-RPC | `{ jsonrpc: "2.0", id: ..., result: ... }` | Normal MCP responses |

#### Client-to-Server Messages

Standard MCP JSON-RPC 2.0 requests:
- `initialize` -- Handshake
- `ping` -- Keepalive
- `tools/list` -- List available tools
- `tools/call` -- Execute a tool
- `resources/list` -- List resources
- `resources/read` -- Read a resource
- `resources/templates/list` -- List resource templates
- `prompts/list` -- List prompts
- `prompts/get` -- Get a prompt

#### MCP Client Identity

```js
function nAe() {
    return new jH({
        name: "claude-ai",
        version: "0.1.0"
    }, {
        capabilities: {
            extensions: {
                "io.modelcontextprotocol/ui": {
                    mimeTypes: ["text/html;profile=mcp-app"]
                }
            }
        }
    });
}
```

### 4.4 Streamable HTTP Transport (class `u1t`)

URL pattern:
```
https://claude.ai/v1/toolbox/shttp/mcp/{serverUuid}
```

Request headers:
```
x-organization-uuid: {orgUuid}
x-mcp-client-session-id: {serverUuid}
x-mcp-client-name: ClaudeAI
credentials: include
```

This transport uses:
- `GET` requests with `Accept: text/event-stream` for SSE streaming
- SSE reconnection with exponential backoff
- `mcp-session-id` header for session tracking
- `last-event-id` header for SSE resumption
- Standard `mcp-protocol-version` header
- OAuth 2.0 authentication support via `Authorization: Bearer {token}`

### 4.5 MCP Auth Error Codes

```js
const qHe = new Set([
    "mcp_unauthorized",
    "mcp_unauthorized_no_token",
    "mcp_unauthorized_after_token_refresh",
    "mcp_oauth_token_refresh_failed",
    "mcp_oauth_no_refresh_token",
    "mcp_invalid_oauth_token",
    "mcp_insufficient_scope"
]);
```

### 4.6 Connection Lifecycle Management (class `x1t`)

When `reconnect_enabled` is true, MCP connections use a wrapper that:
- Tracks inflight request count
- Auto-disconnects after configurable timeout when no requests pending
- Reconnects on demand when a new request arrives

```js
class x1t {
    constructor(getClient, cachedClient, disconnectTimeout = null) { ... }

    disconnectIfNoOngoingRequests() {
        if (this.cachedClient && 0 === this.inflightRequestCount) {
            this.cachedClient.close();
            this.cachedClient = undefined;
        }
    }

    afterRequest() {
        this.inflightRequestCount--;
        if (this.disconnectTimeout !== null) {
            this.debouncedDisconnectTimeout = setTimeout(() => {
                this.disconnectIfNoOngoingRequests();
            }, this.disconnectTimeout);
        }
    }
}
```

### 4.7 `requiresWebSocket` Upgrade

Certain MCP tools have `_meta` annotations indicating they need WebSocket. When detected during bootstrap, `setRequiresWebSocket(serverUuid, true)` is called, which triggers a reconnection to upgrade from SSE to WebSocket transport:

```js
a.some(e => {
    try { return !!Zq({ _meta: e._meta }) } catch { return false }
}) && RY(e.uuid, true)   // RY = setRequiresWebSocket
```

---

## 5. MCP Bootstrap (SSE, not WebSocket)

The MCP bootstrap is **NOT** a WebSocket. It uses **Server-Sent Events (EventSource)**.

### 5.1 URL

```
GET /api/organizations/{orgUuid}/mcp/v2/bootstrap
```

### 5.2 Connection

```js
const m = new EventSource(r, { withCredentials: true });
```

### 5.3 SSE Event Types

| Event Name | Payload | Description |
|------------|---------|-------------|
| `server_list` | `{ servers: [{ uuid, name, url }] }` | Initial list of all MCP servers |
| `server_base` | `{ uuid, name, url, connected, usedAuthentication, authStatus, authErrorType, authErrorSubtype, custom_oauth_client_id }` | Per-server connection status |
| `tools` | `{ server_uuid, tools: [...] }` | Tools for a server |
| `resources` | `{ server_uuid, resources: [...] }` | Resources for a server |
| `prompts` | `{ server_uuid, prompts: [...] }` | Prompts for a server |
| `first_pass_complete` | (none) | All servers have reported initial status |
| `completed` | (none) | Bootstrap stream finished, EventSource is closed |

### 5.4 Bootstrap Flow

1. Client opens `EventSource` to `/api/organizations/{orgUuid}/mcp/v2/bootstrap`
2. Server streams `server_list` event with all server UUIDs/names
3. For each server, `server_base` event with connection status
4. For connected servers, `tools`, `resources`, `prompts` events follow
5. `first_pass_complete` event signals all servers reported
6. `completed` event -- client closes EventSource
7. On error: cancel throttle, flush pending events, close EventSource

Events are throttled at 300ms (`p.throttle(d, 300, { leading: true, trailing: true })`).

### 5.5 Bootstrap Telemetry

Tracks: `ttfbMs`, `serverCount`, `connected`, `disconnected`, `authStatus` counts, `authErrors`.

---

## 6. Cowork / Collaborative Protocol

### 6.1 Not a WebSocket

Cowork does **not** use its own WebSocket connection. Instead, it uses a **local MCP transport** (`aAe`) that communicates via Electron IPC (`JR.mcpCallTool`, `JR.mcpReadResource`, `JR.mcpListResources`).

### 6.2 Cowork MCP Transport (class `aAe`)

This is a fake/local MCP transport for desktop Cowork sessions:

```js
class aAe {
    constructor(sessionId, serverUuid) { ... }

    // Handles MCP methods locally via IPC:
    send(e) {
        switch (t.method) {
            case "initialize":     // Returns protocol version, capabilities
            case "ping":           // Returns {}
            case "tools/list":     // Returns tools from local state
            case "tools/call":     // Delegates to JR.mcpCallTool (Electron IPC)
            case "resources/read": // Delegates to JR.mcpReadResource
            case "resources/list": // Delegates to JR.mcpListResources
            case "resources/templates/list": // Returns []
            case "prompts/list":   // Returns []
            default:               // Returns MethodNotFound error
        }
    }
}
```

Server info returned: `{ name: serverUuid, version: "1.0.0" }`.
Capabilities: `{ tools: {}, resources: {} }`.

### 6.3 Cowork Sidebar State

Cowork has sidebar collapse states stored in localStorage:
- `user-cowork-scheduled-collapsed`
- `user-cowork-starred-collapsed`
- `user-cowork-space-starred-collapsed`

The `/cowork` URL redirects to `https://claude.com/product/cowork` (marketing page).

---

## 7. Deep Research / Compass Protocol

### 7.1 NOT a WebSocket -- Uses REST Polling

Deep research (Compass) status is fetched via **REST polling**, not WebSocket.

### 7.2 Status Endpoint

```
GET /api/organizations/{orgUuid}/chat_conversations/{convUuid}/task/{taskId}/status
```

For shared conversations:
```
GET /api/organizations/{orgUuid}/chat_snapshots/{convUuid}/task/{taskId}/status
```

### 7.3 Polling Configuration

Polling intervals are configured via a feature flag `use_confused_carousel_sounds.polling`:

```js
// Default polling config:
const zbt = [{ intervalSeconds: 30 }];

// Schema allows array of: { intervalSeconds, durationSeconds? }
// If durationSeconds is set, that interval is used for the first N seconds
```

Polling logic:
```js
// refetchInterval driven by React Query:
refetchInterval: !!r && 1000 * u,  // where u = current intervalSeconds
enabled: Boolean(a && t && e && n && !g.claudeai_compass_task_polling)
```

The interval dynamically adjusts based on elapsed time since `started_at`:

```js
// Interval selection: iterate through configured intervals
// For each: if elapsed < durationSeconds, use that intervalSeconds
// Fallback: 30 seconds
```

Feature flag `claudeai_compass_task_polling` can disable polling entirely (load shedding).

### 7.4 Compass Status Enum

```js
var dd = (e => (
    e.Starting = "starting",
    e.Planning = "planning",
    e.InitiatingAgents = "initiating_agents",
    e.Searching = "searching",
    e.CreatingArtifact = "creating_artifact",
    e.Completed = "completed",
    e.Cancelled = "cancelled",
    e.TimedOut = "timed_out",
    e.Failed = "failed",
    e
))(dd || {});
```

Active (pending) statuses:
```js
const ud = [
    "starting",
    "planning",
    "initiating_agents",
    "searching",
    "creating_artifact",
    "completed"
];
```

Terminal (non-pending) check: `pd(status)` returns true for statuses NOT in the active list.

### 7.5 Status Transitions

```
starting -> planning -> initiating_agents -> searching -> creating_artifact -> completed
                                                                            -> cancelled
                                                                            -> timed_out
                                                                            -> failed
```

### 7.6 Compass Status Response Fields

The status response includes at minimum:
- `status` -- one of the enum values
- `started_at` -- ISO timestamp
- `total_sources` -- number of sources found
- `agents[]` -- array of sub-agents, each with:
  - `name`
  - `description`
  - `started_at`
  - `completed_at`
  - `annotated_snippets[]` -- with `thinking_blocks`, `tool_calls` (including `web_search`, `web_fetch`)

### 7.7 Completion Status Polling (general, not Compass-specific)

A separate completion status endpoint exists for detecting stalled messages:

```
GET /api/organizations/{orgUuid}/chat_conversations/{convUuid}/completion_status?poll=false
GET /api/organizations/{orgUuid}/chat_conversations/{convUuid}/completion_status?poll=true
```

- `poll=false`: Quick check, React Query refetches every 1000ms while `is_pending`
- `poll=true`: Long-poll mode, used during pending message recovery
- Exponential backoff for retries: `2000 * 2^(attempt-1)`, capped at 10000ms, with 10% jitter
- Response: `{ is_pending, is_error, error_code, error_detail }`
- Feature flag `claudeai_completion_status_poll` can disable (load shedding)
- Feature flag `claudeai_completion_status_sidebar` gates the sidebar UI

---

## 8. Audio Processing Pipeline

### 8.1 Audio Capture Pipeline (class `Uze`)

#### Configuration Defaults (`Fze`)

```js
const Fze = {
    sampleRate: 16000,          // Target output sample rate
    channels: 1,                // Mono
    timeslice: 100,             // MediaRecorder timeslice (ms)
    audioBitsPerSecond: 24000,  // 24kbps Opus
    usePcm: false,
    preferredBackend: "webcodecs"
};

const Bze = 48000;  // AudioContext sample rate (always 48kHz internally)
```

#### Backend Selection Priority

```
1. If usePcm: return "pcm"
2. If preferred = "webcodecs" AND WebCodecs Opus supported: return "webcodecs"
   else if MediaRecorder supported: return "mediarecorder"
3. If preferred = "mediarecorder" AND MediaRecorder supported: return "mediarecorder"
   else if WebCodecs Opus supported: return "webcodecs"
4. Throw: "No Opus-capable audio backend available"
```

Support checks:
```js
// WebCodecs: requires AudioEncoder + MediaStreamTrackProcessor
static isWebCodecsSupported() {
    const e = "undefined" !== typeof AudioEncoder;
    const t = "undefined" !== typeof MediaStreamTrackProcessor;
    return e && t;
}

// WebCodecs Opus:
static async isWebCodecsOpusSupported() {
    return (await AudioEncoder.isConfigSupported({
        codec: "opus",
        sampleRate: 48000,
        numberOfChannels: 1
    })).supported;
}

// MediaRecorder: requires MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
```

### 8.2 getUserMedia Constraints

```js
const constraints = {
    sampleRate: { ideal: 48000 },       // Bze = 48000
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    deviceId: { exact: deviceId }        // Falls back on OverconstrainedError
};
```

### 8.3 Web Audio Analysis Chain

```
MediaStream -> AudioContext(48kHz) -> MediaStreamSource -> AnalyserNode(fft=2048, smoothing=0.3)
```

- `AnalyserNode` FFT size: 2048
- Smoothing time constant: 0.3
- Frequency data: `Uint8Array(frequencyBinCount)`
- Level analysis: every 100ms interval
- Speech detection: average energy in 85Hz-3500Hz band > 0.075

### 8.4 WebCodecs Backend

```js
// AudioEncoder configuration:
const config = {
    codec: "opus",
    sampleRate: 16000,             // config.sampleRate
    numberOfChannels: 1,           // config.channels
    bitrate: 24000,                // config.audioBitsPerSecond
    opus: {
        application: "voip",
        signal: "voice",
        format: "opus",            // Raw Opus (no container)
        frameDuration: 20000       // 20ms frames
    }
};
this.audioEncoder.configure(config);
```

Pipeline:
```
MediaStreamTrackProcessor -> TrackReader -> resampleAudioData(48kHz -> 16kHz) -> AudioEncoder.encode() -> onAudioChunk(raw Opus packet)
```

Resampling: Linear interpolation from `AudioData.sampleRate` to `config.sampleRate`:
```js
resampleAudioData(e) {
    const t = e.sampleRate;        // source (typically 48000)
    const n = this.config.sampleRate; // target (16000)
    const s = t / n;               // ratio = 3
    // Linear interpolation downsampling
    for (let c = 0; c < r; c++) {
        const e = c * s;
        const t = Math.floor(e);
        const n = Math.min(t + 1, a - 1);
        const r = e - t;
        o[c] = i[t] * (1 - r) + i[n] * r;
    }
    return new AudioData({ format: "f32-planar", sampleRate: n, ... });
}
```

### 8.5 MediaRecorder Backend

```js
// MediaRecorder config:
const options = {
    mimeType: "audio/webm;codecs=opus",
    audioBitsPerSecond: 24000      // config.audioBitsPerSecond
};
this.mediaRecorder = new MediaRecorder(stream, options);
this.mediaRecorder.start(100);     // timeslice = 100ms
```

**Mono downmix chain** (before MediaRecorder):
```
Source -> GainNode(channelCount=1, mode="explicit", interpretation="speakers") -> MediaStreamDestination
```

**WebM EBML Demuxer (class `Pze`):**

Strips Opus frames from WebM container in real-time:

```js
class Pze {
    constructor() {
        this.buffer = new Uint8Array(0);
    }
    demux(e) {
        // Accumulates incoming WebM bytes
        // Parses EBML element IDs (Oze) and sizes (Dze)
        // Recurses into containers: Set([408125543, 524531317])
        //   408125543 = 0x1A45DFA3 (Segment)
        //   524531317 = 0x1F43B675 (Cluster)
        // Extracts SimpleBlock (163 = 0xA3) data
        // Strips EBML header, lacing, track number via zze()
        // Returns raw Opus packet ArrayBuffers
    }
}
```

**Opus frame extraction from SimpleBlock (`zze`):**
```js
function zze(e) {
    if (e.length < 4) return null;
    // Parse track number VINT (1-4 bytes)
    const t = 128 & e[0] ? 1 : 64 & e[0] ? 2 : 32 & e[0] ? 3 : 16 & e[0] ? 4 : 1;
    const s = t + 3;   // skip track# + 2 bytes timecode + 1 byte flags
    if (s >= e.length) return null;
    // Check lacing bits (must be 0 = no lacing):
    if (0 !== (e[t + 2] >> 1 & 3)) return null;
    // Return raw Opus data after header:
    return e.slice(s).buffer;
}
```

### 8.6 PCM Backend

For dictation with `use_conversation_engine`:

```js
// ScriptProcessorNode(bufferSize=4096, channels, channels)
// Source -> ScriptProcessorNode -> AudioContext.destination

onaudioprocess = (e) => {
    const inputBuffer = e.inputBuffer;
    const channelData = inputBuffer.getChannelData(0);

    // Downsample from AudioContext rate (48kHz) to 16kHz:
    const ratio = audioContext.sampleRate / 16000;  // = 3
    // Linear interpolation

    // Convert Float32 [-1,1] to Int16:
    for (let i = 0; i < r.length; i++) {
        const t = Math.max(-1, Math.min(1, r[i]));
        int16[i] = t < 0 ? 32768 * t : 32767 * t;
    }

    // Send as Blob:
    new Blob([int16.buffer], { type: "application/octet-stream" });
};
```

### 8.7 Audio Playback Pipeline (class `Nze`)

#### Configuration Defaults (`Sze`)

```js
const Sze = {
    sampleRate: 16000,
    channels: 1,
    bufferAhead: 0.1    // 100ms buffer ahead
};
```

#### Playback Chain

```
PCM Int16 ArrayBuffer -> pcmInt16ToFloat32() -> AudioBuffer(16kHz, mono) -> BufferSource -> GainNode -> AnalyserNode(fft=2048) -> AudioContext.destination
```

**PCM to Float32 conversion:**
```js
pcmInt16ToFloat32(e) {
    const t = new Int16Array(e);
    const n = new Float32Array(t.length);
    for (let s = 0; s < t.length; s++)
        n[s] = t[s] / 32768;
    return n;
}
```

#### Chunk Coalescing

Small PCM chunks are coalesced before scheduling:
```js
// Coalescing threshold: 3200 bytes (= 1600 samples = 100ms at 16kHz)
this.coalescingBytes >= 3200 && this.scheduleCoalescedChunks()
```

#### Scheduling

```js
scheduleChunk(e) {
    const buffer = audioContext.createBuffer(1, float32.length, 16000);
    buffer.getChannelData(0).set(float32);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);
    // Schedule at next available time (gapless):
    const startTime = Math.max(this.nextScheduleTime, currentTime + 0.1);
    source.start(startTime);
    this.nextScheduleTime = startTime + buffer.duration;
}
```

#### Speaker Device Selection

```js
async setSpeakerDevice(e) {
    const t = this.audioContext;
    if ("function" == typeof t.setSinkId)
        await t.setSinkId(e ?? "");
}
```

#### Interruption (stop)

```js
stop() {
    this.isInterrupted = true;
    for (const e of this.scheduledBuffers) {
        e.source.onended = null;
        e.source.stop();
        e.source.disconnect();
    }
    this.scheduledBuffers = [];
    this.pendingChunks = [];
    this.coalescingBuffer = [];
    this.coalescingBytes = 0;
    this.nextScheduleTime = this.audioContext.currentTime;
    this.setState("idle");
    this.isInterrupted = false;
}
```

### 8.8 Microphone Device Management (class `Wze`)

Features:
- `acquireMicStream()` -- gets mic with constraints
- `releaseMicStream()` -- stops tracks
- `subscribeToDeviceChanges()` -- handles device hot-swap
- Device IDs stored in localStorage:
  - `voice-mode:selected-mic-device-id`
  - `voice-mode:selected-speaker-device-id`

---

## 9. Notification / Real-time Updates

### 9.1 No Dedicated Notification WebSocket

There is **no** WebSocket for push notifications or real-time updates. All real-time behavior uses:

1. **React Query polling** (`refetchInterval`) for:
   - Completion status (1000ms while pending)
   - Compass task status (configurable, default 30s)
2. **SSE (EventSource)** for:
   - MCP bootstrap stream
3. **Standard HTTP streaming** for:
   - Chat message streaming (SSE via fetch, not EventSource)

### 9.2 Reconnection Triggers

- Voice WebSocket: Reconnects on abnormal close (up to 5 attempts, exponential backoff 250ms-4s)
- Dictation WebSocket: No automatic reconnection (session is recreated)
- MCP WebSocket: Connection is recreated on demand; `x1t` wrapper handles lazy reconnection
- MCP Streamable HTTP: Built-in SSE reconnection with exponential backoff (`c1t` defaults)
- MCP Bootstrap SSE: No reconnection on error (reports error and closes)

---

## Summary Table: All Real-Time Connections

| Connection | Transport | URL | Purpose |
|------------|-----------|-----|---------|
| Voice Mode | WebSocket | `/api/ws/voice/organizations/{org}/chat_conversations/{conv}?...` | Full-duplex voice (audio + JSON control) |
| Dictation | WebSocket | `/api/ws/speech_to_text/voice_stream?...` | Speech-to-text only |
| MCP (legacy) | WebSocket | `/api/ws/organizations/{org}/mcp/servers/{server}/` | MCP tool server (JSON-RPC 2.0) |
| MCP (new) | Streamable HTTP/SSE | `/v1/toolbox/shttp/mcp/{server}` | MCP tool server (Streamable HTTP) |
| MCP Bootstrap | SSE (EventSource) | `/api/organizations/{org}/mcp/v2/bootstrap` | Server list + tools discovery |
| Cowork | Local IPC | (Electron IPC, no network) | Desktop cowork MCP tools |
| Compass | REST polling | `/api/organizations/{org}/chat_conversations/{conv}/task/{id}/status` | Deep research status |
| Completion | REST polling | `/api/organizations/{org}/chat_conversations/{conv}/completion_status?poll=...` | Message completion check |
