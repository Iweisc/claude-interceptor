# Claude.ai MCP (Model Context Protocol) Connectors -- Full Protocol Documentation

**Source:** `index-DcrCrePJ.js` (7.2MB frontend bundle)
**Date:** 2026-03-22

---

## Table of Contents

1. [MCP Bootstrap Protocol](#1-mcp-bootstrap-protocol)
2. [MCP Remote Server Management (CRUD)](#2-mcp-remote-server-management)
3. [MCP Tool Execution in Completions](#3-mcp-tool-execution-in-completions)
4. [Built-in Connectors (First-party Integrations)](#4-built-in-connectors)
5. [MCP Session Management & Transports](#5-mcp-session-management--transports)
6. [DXT Extensions](#6-dxt-extensions)
7. [MCP Auth / OAuth Flows](#7-mcp-auth--oauth-flows)
8. [MCP Directory / Registry](#8-mcp-directory--registry)
9. [MCP Apps (UI Extensions)](#9-mcp-apps-ui-extensions)
10. [Tool Approval System](#10-tool-approval-system)
11. [Consent & Attestation System](#11-consent--attestation-system)

---

## 1. MCP Bootstrap Protocol

### Endpoint

```
GET /api/organizations/{orgUuid}/mcp/v2/bootstrap
```

Uses `EventSource` (SSE) with `{withCredentials: true}`.

### Feature Flags

- `claudeai_mcp_bootstrap` -- master toggle for the bootstrap system
- `claudeai_mcp_bootstrap_wait` -- configurable wait time (default 0) before bootstrap initiates
- `mcp_bootstrap_first_pass_enabled` -- enables the `first_pass_complete` event
- `claudeai_mcp_bootstrap_eager` -- eager bootstrap loading
- `mcp_tb_sessions` -- enables "toolbox sessions" mode (alters bootstrap behavior)

When `mcp_tb_sessions` is truthy, the traditional `remote_servers` GET query is skipped entirely; the bootstrap SSE stream is the sole source of server/tool data.

### SSE Event Sequence

The bootstrap stream emits these named events **in order**:

#### 1. `server_list` (first event)

Fires once. Payload: `{ servers: Array<{ uuid, name, url }> }`.

- Records TTFB (time to first byte) from `performance.now()`.
- Records `serverCount = servers.length`.
- For each server, if not already known, creates a stub remote server record:
  ```js
  {
    uuid, name, url,
    custom_oauth_client_id: null,
    custom_oauth_client_secret: undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_authenticated: false
  }
  ```
- Sets `remoteIsLoading = false` and marks "hasBootstrapped = true".

#### 2. `server_base` (per-server)

One event per server. Payload:
```js
{
  uuid: string,
  name: string,
  url: string,
  custom_oauth_client_id: string | null,
  connected: boolean,
  usedAuthentication: boolean,
  authStatus: "not_required" | "authenticated" | "auth_required" | "token_invalid" | "refresh_failed",
  authErrorType?: string,
  authErrorSubtype?: string
}
```

Counters tracked:
- `connected` / `disconnected` counts
- `authStatus` histogram: `not_required`, `authenticated`, `auth_required`, `token_invalid`, `refresh_failed`
- `authErrors` array of `"${authErrorType}:${authErrorSubtype}"`

If connected: updates server record with full details including `custom_oauth_client_id`, marks authenticated.
If disconnected: calls `disconnectRemoteServer(uuid, authStatus, authErrorType, authErrorSubtype)`.

#### 3. `tools` (per-server)

Payload: `{ server_uuid: string, tools: Array<ToolDefinition> }`.

Tools are parsed via `lJ()` into:
```js
{
  name: string,
  description?: string,
  annotations?: {
    title?: string,
    readOnlyHint?: boolean,
    destructiveHint?: boolean,
    idempotentHint?: boolean,
    openWorldHint?: boolean
  },
  inputSchema: { type: "object", properties?, required? },
  displayName: string,
  enabledKey: string,       // "{serverUuid}:{toolName}"
  alwaysApprovedKey: string,
  _meta?: object
}
```

Tools are split into `modelVisible` and `appOnly` categories based on `_meta.ui.visibility`:
- If `visibility` includes `"model"` or is absent: modelVisible (sent to backend).
- If `visibility` is `["app"]` only: appOnly (client-side only, for MCP Apps rendering).

If any tool has `_meta.ui.resourceUri` starting with `"ui://"`, the server is flagged as having MCP Apps (`RY(uuid, true)`).

#### 4. `resources` (per-server)

Payload: `{ server_uuid: string, resources: Array<ResourceDefinition> }`.

Resource shape:
```js
{
  uri: string,
  name: string,
  description?: string,
  title?: string,
  mimeType?: string,
  annotations?: { audience?, priority? },
  _meta?: object,
  displayName: string
}
```

#### 5. `prompts` (per-server)

Payload: `{ server_uuid: string, prompts: Array<PromptDefinition> }`.

Prompt shape:
```js
{
  name: string,
  description?: string,
  title?: string,
  arguments?: Array<{ name, description?, required? }>,
  _meta?: object,
  displayName: string
}
```

#### 6. `first_pass_complete`

No payload. Signals that the first pass through all servers is done.
Cancels the throttled state-flush debounce and flushes immediately.
If called for a single-server reconnect, marks `zY(true)` (stream completed for first pass).

#### 7. `completed`

No payload. Final event. Closes the EventSource.
Sets `remoteIsLoading = false`, marks all bootstrap flags complete.
Tracks analytics:
```js
{
  event_key: "claudeai.mcp.bootstrap_stream.completed",
  duration_ms, ttfb_ms, outcome: "completed" | "error",
  server_count, connected_count, disconnected_count,
  auth_not_required_count, auth_authenticated_count,
  auth_auth_required_count, auth_token_invalid_count,
  auth_refresh_failed_count, auth_error_detail: string  // comma-joined
}
```

### Throttling

All `server_base`, `tools`, `resources`, `prompts` events are buffered into a `c[]` array and flushed via lodash `throttle(d, 300, {leading: true, trailing: true})` to batch state updates.

### Error Handling

`m.onerror`: cancels throttle, flushes buffer, closes EventSource, sets `remoteIsLoading = false`, tracks `mcp_bootstrap_stream_error`.

---

## 2. MCP Remote Server Management

### Data Model (Zod Schema `N5`)

```js
{
  uuid: string (UUID),
  name: string,
  url: string,
  created_at: string (datetime),
  updated_at: string (datetime),
  custom_oauth_client_id?: string | null,
  custom_oauth_client_secret?: string | null,
  is_authenticated: boolean (default: false)
}
```

### Create Server

```
POST /api/organizations/{orgUuid}/mcp/remote_servers
```

Body schema:
```js
{
  name: string,
  url: string,
  custom_oauth_client_id?: string | null,
  custom_oauth_client_secret?: string | null,
  attestations?: Array<{ type: "safe_for_phi", content_hash: string }>
}
```

On success:
- Adds server to local state.
- If source is `"directory"`, records directory UUID mapping.
- Triggers a single-server bootstrap: `mJ(orgUuid, sanitizeFlag, serverUuid)`.
- Tracks: `claudeai.mcp.create_server` with `source` and `url`.

Sources: `"directory"`, `"custom"`, etc.

### Delete Server

```
DELETE /api/organizations/{orgUuid}/mcp/remote_servers/{serverUuid}
```

Removes from local state and invalidates query cache.

### Get Server Detail

```
GET /api/organizations/{orgUuid}/mcp/remote_servers/{serverUuid}
```

Query key: `["mcp-remote-server-detail", orgUuid, serverUuid]`.
Response parsed through `N5` schema.

### List Servers

```
GET /api/organizations/{orgUuid}/mcp/remote_servers
```

Query key: `[Ig, orgUuid]` where `Ig` is a constant key.
Disabled when `mcp_tb_sessions` is enabled (bootstrap replaces this).

### Clear Server Cache

```
POST /api/organizations/{orgUuid}/mcp/remote_servers/{serverUuid}/clear_cache
```

Feature flag: `mcp_clear_cache`.

### Attach Resource

```
POST /api/organizations/{orgUuid}/mcp/attach_resource
```

Body: `{ resource, server_uuid, result? }`.
Only available when `mcp_tb_sessions` is enabled.

### Attach Prompt

```
POST /api/organizations/{orgUuid}/mcp/attach_prompt
```

Body: `{ prompt, arguments, server_uuid, result? }`.
Only available when `mcp_tb_sessions` is enabled.

---

## 3. MCP Tool Execution in Completions

### Completion Endpoints

```
POST /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/completion
POST /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/retry_completion
```

Also supports gRPC:
```
appendMessage(...)   // endpoint=1
retryMessage(...)    // endpoint=2
```

### Request Body Construction

The function `rJ(backendExecution, enabledMcpTools, approvalConfig)` builds the tool array:

For each **remote** server's tools (filtered by `enabled_mcp_tools` setting):
```js
{
  name: string,
  description: string,
  input_schema: object,
  integration_name: string,          // server name
  mcp_server_uuid: string,           // server UUID
  mcp_server_url: string,            // server URL
  needs_approval?: boolean,          // from approval config
  backend_execution: boolean,        // from mcp_tb_sessions flag
  read_only_hint?: boolean,          // from tool annotations
  is_mcp_app: boolean                // true if _meta.ui.resourceUri exists as "ui://..."
}
```

For each **local** server's tools:
```js
{
  name: string,
  description: string,
  input_schema: object,
  integration_name: string,          // local server name
  is_mcp_app: boolean
}
```

### How `is_mcp_app` is Determined

```js
function iJ(e) {
  return void 0 !== Zq({ _meta: e._meta })
}
function Zq(e) {
  let t = e._meta?.ui?.resourceUri;
  if (void 0 === t) t = e._meta?.["ui/resourceUri"];
  if (typeof t === "string" && t.startsWith("ui://")) return t;
  if (void 0 !== t) throw Error(`Invalid UI resource URI: ${JSON.stringify(t)}`);
}
```

A tool is an MCP App if its `_meta.ui.resourceUri` (or `_meta["ui/resourceUri"]`) starts with `"ui://"`.

### Full Completion Request Body (`N` object)

```js
{
  prompt: string,
  parent_message_uuid: string,
  timezone: string,
  personalized_style: string,
  locale: string,
  model: string,
  modelOverride?: string,
  temperature?: number,
  maxTokensToSample?: number,
  paprika_mode?: "extended" | null,       // thinking mode
  tools: Array<ToolDefinition>,           // includes MCP tools
  tool_states?: Array,                    // tool state overrides
  turnMessageUuids?: object,
  rendering_mode: "messages",
  create_conversation_params?: object
}
```

### Conversation Settings Affecting Tools

Account/conversation settings:
```js
{
  enabled_web_search: boolean,
  enabled_bananagrams: boolean,       // Google Drive search
  enabled_sourdough: boolean,         // Gmail search
  enabled_foccacia: boolean,          // Google Calendar search
  enabled_mcp_tools: {                // per-tool enable/disable map
    "{serverUuid}:{toolName}": boolean,
    ...
  },
  paprika_mode: "extended" | null,    // thinking mode
  compass_mode: "advanced" | null,    // research mode
  tool_search_mode: ...,
  enabled_imagine: boolean
}
```

### SSE Events During Completion Streaming

The completion SSE stream emits these events:

| Event | Description |
|-------|-------------|
| `ping` | Keepalive |
| `completion` | Legacy text completion |
| `content_block_start` | New content block; for `tool_use` type includes `name` and `approval_key` |
| `content_block_delta` | Incremental content; `input_json_delta` for tool input |
| `content_block_stop` | Block finished; includes `buffered_input` (accumulated JSON) |
| `message_start` | Message metadata: `uuid`, `parent_uuid`, `trace_id`, `request_id` |
| `message_delta` | `stop_reason` |
| `message_stop` | Stream complete |
| `message_limit` | Rate limit info |
| `compaction_status` | Conversation compaction progress |
| `conversation_ready` | Conversation is ready |
| `cache_performance` | Cache hit/miss metrics |
| **`tool_approval`** | **Tool requires user approval** (handled as no-op in SSE; UI reacts to `approval_options`/`approval_key` on tool_use blocks) |
| **`mcp_auth_required`** | **MCP server needs authentication** |

### `mcp_auth_required` SSE Event

Payload:
```js
{
  server_id: string,
  tool_use_id: string,
  error_code: string
}
```

Processing: walks backward through the content blocks to find the matching `tool_use` block by `tool_use_id`, then patches it:
```js
block.mcp_auth_required = {
  server_id: t.server_id,
  tool_use_id: t.tool_use_id,
  error_code: t.error_code,
  conversation_uuid: conversationUuid
}
```

This triggers an auth UI on the tool_use block.

### Tool Result Submission

```
POST /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/tool_result
```

Body:
```js
{
  type: "tool_result",
  tool_use_id: string,
  is_error?: boolean,
  content: Array<{ type: "text", text: string } | { type: "image", ... }>,
  structured_content?: object,
  meta?: object          // from MCP _meta
}
```

### Client-Side Tool Execution Flow

1. Tool block with `tool_use` type arrives in SSE stream.
2. If the tool has `mcp_auth_required`, show auth UI instead of executing.
3. If tool has `approval_options` + `approval_key`, show approval dialog.
4. Otherwise, for client-executed tools (`backend_execution = false`):
   - Look up the MCP client for the server via `tJ(serverUuid)`.
   - Call `client.callTool({ name, arguments }, CU, { timeout: 240000 })`.
   - Parse response content (text, image, resource, resource_link).
   - Submit result to `/tool_result` endpoint.
5. For backend-executed tools (`backend_execution = true`, i.e. `mcp_tb_sessions`): the backend handles tool calls directly.

---

## 4. Built-in Connectors

### Enum (`JH`)

```js
var JH = {
  GITHUB:    "github",
  GDRIVE:    "gdrive",
  OUTLINE:   "outlin",
  SALESFORCE: "sfdc",
  GMAIL:     "gmail",
  GCAL:      "gcal",
  SLACK:     "slack",
  ASANA:     "asana",
  CANVAS:    "canvas",
  FIDDLEHEAD: "fiddlehead",
  CUTTLEFISH: "cuttlefish",
  MCP_RESOURCES: "mcpres"
}
```

### Display Names (`QH`)

```js
{
  github: "GitHub",
  gdrive: "Google Drive",
  outlin: "Outline",
  sfdc: "Salesforce",
  gmail: "Gmail",
  gcal: "Google Calendar",
  slack: "Slack",
  asana: "Asana",
  canvas: "Canvas",
  fiddlehead: "Fiddlehead",
  cuttlefish: "Cuttlefish",
  mcpres: "MCP Resources"
}
```

### Codename Mapping (Setting Keys)

| Connector | Codename/Setting | Description |
|-----------|------------------|-------------|
| Google Drive | `enabled_bananagrams` | Drive search + knowledge base |
| Gmail | `enabled_sourdough` | Gmail search |
| Google Calendar | `enabled_foccacia` | Calendar search |
| Web Search | `enabled_web_search` | Anthropic web search |
| Thinking Mode | `paprika_mode` | "extended" thinking |
| Research Mode | `compass_mode` | "advanced" research |
| Google Drive indexing | `enabled_gdrive_indexing` | Indexing for RAG |
| Brioche | `enabled_brioche` | Feature flag for GSuite MCP migration |
| Turmeric | `enabled_turmeric` | Unknown feature |
| Wiggle | `enabled_monkeys_in_a_barrel` | Export/sharing feature |
| Image generation | `enabled_imagine` | Image generation |

### GSuite Hard-coded UUIDs (MCP Server IDs)

```js
const DX = "c1fc4002-5f49-5f9d-a4e5-93c4ef5d6a75"  // Google Drive
const PX = "91beb235-2b5a-506c-ad07-d930c1119fcb"  // Google Calendar
const zX = "83fd827c-458e-5143-b2ff-484904737d48"  // Gmail

const FX = {
  [DX]: { name: "Google Drive",    syncSourceType: JH.GDRIVE },
  [PX]: { name: "Google Calendar", syncSourceType: JH.GCAL },
  [zX]: { name: "Gmail",           syncSourceType: JH.GMAIL }
}
```

### Google Drive Auth Flow

```
GET  /api/organizations/{orgUuid}/sync/mcp/drive/auth       -- check auth status
POST /api/organizations/{orgUuid}/sync/mcp/drive/auth        -- initiate auth
     Body: { pre_auth_state: { origin }, redirect_uri }
     redirect_uri = /connect/mcp/drive/callback
DELETE /api/organizations/{orgUuid}/sync/mcp/drive/auth      -- disconnect
```

Additional Drive endpoints:
```
GET  /api/organizations/{orgUuid}/sync/mcp/drive/document/{docId}?include_content=false
GET  /api/organizations/{orgUuid}/sync/mcp/drive/recents
POST /api/organizations/{orgUuid}/sync/mcp/drive/ingest
POST /api/organizations/{orgUuid}/sync/ingestion/gdrive/clean_up
```

GSuite prompt configuration:
```js
{
  gdrive_prompt: string,
  gcal_prompt: string,
  gmail_prompt: string
}
```

Feature flag `gsuite_system_prompt` provides per-connector system prompt overrides.

Tool description overrides loaded from:
```js
{
  gdrive: { ... },  // from "google_drive_tools" config
  gcal: { ... },     // from "gcal_tools" config
  gmail: { ... }     // from "gmail_tools" config
}
```

### Outline Auth Flow

```
GET  /api/organizations/{orgUuid}/sync/mcp/outline/auth
POST /api/organizations/{orgUuid}/sync/mcp/outline/auth/start
GET  /api/organizations/{orgUuid}/sync/mcp/outline/document/{docId}
```

### GitHub Auth Flow

GitHub uses a separate OAuth flow:
```
Redirect: /connect/github/callback?code=...&state=...&installation_id=...
Desktop: claude://claude.ai/...?auth_start=github&origin=...
```

### Salesforce

Connector type `"sfdc"`, mapped to endpoint path `"salesforce"`.

### Sync Source Routing

The function `i1(e)` maps connector types to API paths:
- `"sfdc"` -> `"salesforce"`
- `"gdrive"` -> `"mcp/drive"`
- All others -> connector type as-is

Auth status query keys:
- `"gdrive"` -> `[pg, { accountUUID, orgUuid }]`
- Others -> `["sync_{type}_auth_status", { orgUuid }]`

---

## 5. MCP Session Management & Transports

### Streamable HTTP Transport (`u1t` class)

Feature flag: `mcp_shttp`.

#### Connection

```
URL: /v1/toolbox/shttp/mcp/{serverUuid}
```

Headers:
```
x-organization-uuid: {orgUuid}
x-mcp-client-session-id: {serverUuid}
x-mcp-client-name: ClaudeAI
credentials: include
```

#### Protocol Headers

```
mcp-session-id: {sessionId}       -- set on first response, sent on all subsequent requests
mcp-protocol-version: {version}   -- set after initialization
Content-Type: application/json
Accept: application/json, text/event-stream
```

#### Session Lifecycle

1. **Start**: `start()` creates an `AbortController`.
2. **SSE Stream**: GET request with `Accept: text/event-stream` for server-pushed events.
   - Supports `last-event-id` for resumption.
   - Auto-reconnects with exponential backoff (`initialReconnectionDelay * growFactor^attempt`, capped at `maxReconnectionDelay`).
   - `maxRetries` limits reconnection attempts.
3. **Send**: POST request with JSON body.
   - On 202: accepted, starts background SSE stream.
   - On 200 with `text/event-stream`: processes as SSE.
   - On 200 with `application/json`: parses as JSON-RPC response(s).
4. **Session ID**: Captured from `mcp-session-id` response header; sent on all subsequent requests.
5. **Terminate**: DELETE request to close session.

#### Auth Flow (Streamable HTTP)

On 401:
1. Calls `KQt(authProvider, { serverUrl, resourceMetadataUrl, scope, fetchFn })`.
2. If `AUTHORIZED`, retries the request.
3. Sets `_hasCompletedAuthFlow = true`.

On 403 with `insufficient_scope`:
1. Reads `WWW-Authenticate` header.
2. Updates scope from `resourceMetadataUrl`.
3. Re-authorizes and retries (once -- prevents infinite loop via `_lastUpscopingHeader`).

### WebSocket Transport (`g1t` class)

```
URL: /api/ws/organizations/{orgUuid}/mcp/servers/{serverUuid}/
Protocol: ["mcp"]
```

#### WebSocket Messages

- `mcp_unauthorized` error_code -> triggers `onAuthError` callback with `UnauthedError`.
- `connected` method with `params.used_auth` -> triggers `onConnect(usedAuth)`.
- All other messages parsed as JSON-RPC via `WF.parse()`.

### Reconnection Wrapper (`x1t` class)

When `reconnect_enabled` config is true, wraps the MCP client:
- Tracks `inflightRequestCount`.
- After each request completes, if `disconnect_timeout` is set, schedules a debounced disconnect.
- `disconnectIfNoOngoingRequests()` closes the client if idle.
- All MCP client methods (`callTool`, `listTools`, `listResources`, etc.) go through `useClient(fn)` which handles `beforeRequest`/`afterRequest`.

### Reconnect & Disconnect Config

```js
const m1t = {
  reconnect_enabled?: boolean,
  disconnect_enabled?: boolean,
  disconnect_timeout?: number    // milliseconds
}
```

Feature flag: `apps_mcp_ws_reconnect_config`.

---

## 6. DXT Extensions

### What is DXT?

DXT (Desktop Extension) is the extension format for Claude Desktop. Extensions are `.dxt` files containing MCP server definitions with manifest metadata.

### API Endpoints

```
GET /api/organizations/{orgUuid}/dxt/extensions
    Header: x-mcpb-manifest-version: 0.2
    Returns: { entries: Array<ExtensionEntry> }

GET /api/organizations/{orgUuid}/dxt/installable_extensions
    Header: x-mcpb-manifest-version: 0.2
    Returns: installable extensions from directory
```

### Extension Entry Shape (from directory)

```js
{
  id: string,                      // UUID
  name: string,
  display_name: string,
  description: string,
  long_description?: string,
  icon_url: string,
  version: string,
  author: { name, url },
  license?: string,
  documentation?: string,
  support?: string,
  manifest: {
    name: string,
    display_name?: string,
    description: string,
    long_description?: string,
    version: string,
    icon?: string,
    author?: { name, url },
    tools?: Array<{ name: string }>,
    prompts?: Array<{ name: string }>,
    server: {
      type: "node" | "python",
      mcp_config?: { command: string }
    },
    compatibility?: {
      platforms?: ["win32" | "darwin" | "linux"],
      claude_desktop?: string,    // semver range
      runtimes?: {
        node?: string,            // semver range
        python?: string           // semver range
      }
    }
  },
  manifest_version?: string,       // or dxt_version
  download_count?: number,
  lifetime_download_count?: number,
  popularity_score?: number,
  is_blocklisted?: boolean,
  is_internal?: boolean,
  is_allowlisted?: boolean,
  is_hidden?: boolean,
  on_disk_path?: string           // for local/sideloaded extensions
}
```

### Extension Installation (Desktop API)

Extensions are installed via the Claude Desktop bridge (`eP` / `CO`):

```js
eP.installDxtFromDirectory(uuid, null)           // install from directory
eP.installExtensionFromPreview(uuid, onDiskPath)  // install from local preview
eP.deleteExtension(uuid)                          // uninstall
eP.getInstalledExtensionsWithState()              // list installed
eP.onExtensionDownloadProgress(uuid, callback)    // progress tracking
eP.onExtensionsChanged(callback)                  // change listener
eP.onPreviewExtensionInstallation(callback)       // preview install handler
CO.installExtension()                             // web-based install
```

### Compatibility Checking

Checks are performed before installation:
1. **Platform**: `win32`, `darwin`, `linux`
2. **Claude Desktop version**: semver range check
3. **Manifest version**: float comparison against `supportedLatestMcpbManifestVersion`
4. **Node.js version**: for `"node"` type servers
5. **Python version**: for `"python"` type servers

### Blocklisted Extensions

Hard-coded blocklist (filtered from directory):
```
ant.dir.gh.hautpsachenet.clickup-mcp
ant.dir.gh.openbnb-org.mcp-server-airbnb
ant.dir.gh.tariqalagha.brave-browser-control
browser-control-firefox
ant.dir.gh.mbmccormick.things
ant.dir.gh.commercelayer.mcp-server-metrics
ant.dir.gh.karanb192.reddit-mcp-buddy
ant.dir.gh.herosizy.cucumberstudio-mcp
```

### Extension Admin Controls

- Organization setting: `is_desktop_extension_allowlist_enabled`
- Policy: `dxt_allowlist` -- when enabled, only allowlisted extensions can be installed
- Hidden extensions config: `dxt_hidden_extensions` with `{ ids: string[] }`

### Local State for DXT

The Zustand store tracks DXT extensions:
```js
{
  dxts: { [localId: string]: DxtInfo },
  // ... alongside localClients, localTools, localPrompts, localResources
}
```

DXT servers appear in the unified server list with:
- `type: "local"`
- `iconType: "external"`
- `iconSrc` from DXT manifest icon or URL
- `localId` from the DXT ID

---

## 7. MCP Auth / OAuth Flows

### Error Codes (Auth-related)

Full set of MCP auth error codes (`qHe`):
```js
[
  "mcp_auth_required",
  "mcp_unauthorized",
  "mcp_unauthorized_no_token",
  "mcp_unauthorized_after_token_refresh",
  "mcp_oauth_token_refresh_failed",
  "mcp_oauth_no_refresh_token",
  "mcp_invalid_oauth_token",
  "mcp_insufficient_scope"
]
```

Additional client-side error codes (`GHe`):
```js
[
  "secret_required",
  "unknown_client_id",
  "unknown_client",
  "invalid_credentials",
  "client_not_found",
  "refresh_token_reuse_detected",
  "missing_auth_header"
]
```

Special: `mcp_enterprise_domain_mismatch` -- corporate identity guard.

### OAuth Popup Flow (In-Chat Auth)

When `mcp_auth_required` appears on a tool_use block:

1. UI shows "Authentication required to use this tool" with a "Connect" button.
2. On click, constructs the auth URL:
   ```
   {origin}/api/organizations/{orgUuid}/mcp/remote_servers/{serverId}/auth?
     redirect_uri={origin}/connector/{serverId}/auth_done?_=1
     &conversation_uuid={conversationUuid}
     &tool_use_id={toolUseId}
     &popup=1
   ```
3. Opens popup window: `window.open(url, "mcp-auth", "width=600,height=700,popup=1")`.
4. Uses `BroadcastChannel("UQ")` to receive auth result:
   - `{ type: "BQ", serverId, step: "success" | "error", oauthError? }`
5. On success: closes popup, shows success toast, triggers `onAuthSuccess` callback.
6. On error: shows error message. Special handling for `mcp_enterprise_domain_mismatch`.

For Desktop apps:
```
claude://claude.ai/mcp-auth-callback/{serverId}
```

### Auth Callback Route

```
/connector/{serverId}/auth_done?_=1
```

Also:
```
/mcp-auth-callback/{serverId}?step=...&oauth_error=...
```

URL params cleaned after processing:
```
server, step, flow_id, oauth_error, oauth_error_description, oauth_error_uri
```

### Remote Server OAuth URL Helper

Function `VQ()` returns a function that generates the OAuth start URL for a given server:
```
/api/organizations/{orgUuid}/mcp/remote_servers/{serverId}/auth?redirect_uri=...
```

### Auto-Enable on Auth Success

`C1t()` function: after successful auth, automatically enables MCP tools from the newly authenticated server based on `enabled_mcp_tools` setting.

---

## 8. MCP Directory / Registry

### Registry URL

```
{i5()}/mcp-registry/v0/servers
```

Where `i5()` returns the base URL for the MCP registry service.

### Unified Directory

Feature flags:
- `conditional_mcp_directory_servers` -- server visibility configuration
- `mcp_gdrive` -- whether to filter out Google Drive from directory
- `cai_cos_mcp_registry_search` -- enables in-chat registry search

### Directory Server Types

Each directory entry is typed as one of:
- `"remote"` -- standard remote MCP server
- `"firstParty"` -- built-in connector (gdrive, gmail, etc.)
- `"local"` -- DXT extension

### Directory Server Shape

```js
{
  uuid: string,
  name: string,
  oneLiner: string,
  description: string,
  iconUrl: string,
  url: string,
  toolNames: string[],
  isConnected: boolean,
  // For remote:
  type: "remote",
  requiredFields?: Array,
  // For extensions:
  type: "local",
  manifest: object,
  version: string,
  author: { name, url },
  downloadCount?: number,
  lifetimeDownloadCount?: number,
  popularityScore?: number,
  isBlocklisted?: boolean,
  isInternal?: boolean,
  isAllowlisted?: boolean,
  isHidden?: boolean
}
```

### In-Chat Connector Search (Registry Search)

Two local tools registered for in-chat search:
- `search_mcp_registry` -- keyword search
- `suggest_connectors` -- model-suggested connectors

Execution path:
```js
// search_mcp_registry
async function search({ keywords }, enabledMcpTools, { isRavenOrg, canManageIntegrations }) {
  const results = await k5(keywords, enabledMcpTools, opts);
  return results.slice(0, 10).map(server => ({
    name, description, tools, url, iconUrl, directoryUuid, connected, enabledInChat
  }));
}
```

Feature flags:
- `suggested_connectors` -- enables connector suggestions
- `suggested_connectors_desktop_chat` -- enables for desktop
- `suggested_plugins` -- enables plugin suggestions

### SSE Events for Directory Search

During completion streaming, the backend can emit:
- `directory_servers_search` -- `{ requestId, keywords }`
- `directory_servers_lookup` -- `{ requestId, uuids }`

These trigger client-side directory lookups.

---

## 9. MCP Apps (UI Extensions)

### What are MCP Apps?

MCP Apps are tools whose `_meta.ui.resourceUri` starts with `"ui://"`. They render custom UI within Claude's chat interface via iframes.

### Detection

```js
function Zq(e) {
  let t = e._meta?.ui?.resourceUri;
  if (void 0 === t) t = e._meta?.["ui/resourceUri"];
  if (typeof t === "string" && t.startsWith("ui://")) return t;
}
```

### Tool Visibility

Tools have a `visibility` field in `_meta.ui`:
- `["model"]` or `["model", "app"]` -- visible to the model (sent to backend)
- `["app"]` -- app-only (not sent to model, used for client-side rendering)

```js
function $X(e) {
  const t = e._meta?.ui;
  if (!t) return true;  // no _meta = model-visible
  const n = GX.safeParse(t);
  return !n.success || !n.data.visibility || n.data.visibility.includes("model");
}
```

### MCP App Feature Flags

- `claudeai_mcp_apps_visualize` -- enables MCP Apps visualization (`vY = "visualize"`)
- `claudeai_mcp_apps_example_server` -- example MCP app server
- `claude_create_marble` -- Claude Create (artifact-like) features

### IframeParentTools

MCP Apps running in iframes can register tools via `setIframeParentTools(name, tools)`. These are treated as local tools.

### MCP App Communication

Uses `PostMessageTransport`:
- Window `message` events for bidirectional communication.
- Supports `ui/notifications/tool-input-partial` method for partial input updates.
- Host context includes `displayMode` (e.g., `"inline"`).

---

## 10. Tool Approval System

### Approval Config

Feature flag: `mcp_tool_approval_config`.

Schema:
```js
const G5 = Map<serverKey, Map<toolKey, ApprovalLevel>>
// where ApprovalLevel = "always" | "never" | "perChat" | "readOnly" | "server"
```

Feature flag: `mcp_tool_input_expand_config`.

Schema:
```js
const H5 = Map<serverKey, Map<toolKey, boolean>>
```

### Tool Approval Flow

1. During streaming, `content_block_start` for `tool_use` blocks includes:
   - `approval_key` -- unique key for this tool approval
   - `approval_options` -- available approval options

2. A tool requires user interaction if:
   ```js
   "tool_use" === type && (
     (approval_options && approval_key) ||
     mcp_auth_required ||
     "AskUserQuestion" === name
   )
   ```

3. Input JSON is accumulated during `content_block_delta` events for tools that:
   - Are in the `pT` (known tool) list, OR
   - Match a tool name ending with `:{toolName}`, OR
   - Have an `approval_key`

4. On `content_block_stop`, `buffered_input` contains the full tool input JSON.

### Organization-Level Approval Policy

```
GET /api/organizations/{orgUuid}/...
```

Disabled features check: `tool_approval_default_always_allow` -- when in `disabled_features`, prevents auto-allowing tools.

Feature flag: `disable_destructive_mcp_tools_by_default`.

### Per-Tool Permission Policy

For Claude Code Desktop (CCD) tools:
```js
{
  name: string,
  description: string,
  input_schema: object,
  integration_name: string,
  mcp_server_uuid: string,
  mcp_server_url: string,
  permission_policy: "always_allow" | "always_deny" | undefined,
  read_only_hint?: boolean,
  is_mcp_app: boolean
}
```

### Yukon Silver Tool Permissions

Feature flag: `yukon_silver_tool_perms`.

Additional permission levels: `["allow", "ask", "blocked"]`.

---

## 11. Consent & Attestation System

### Server Attestations

When creating remote servers, attestations can be attached:
```js
{
  type: "safe_for_phi",       // PHI safety attestation
  content_hash: string
}
```

### Health Data Consent

For servers handling health data:

```
PUT  /api/accounts/me/consents
     Body: { consent_type: "consumer_health", entity_type: "mcp_remote_server", entity_id }

POST /api/accounts/me/consents/check
     Body: { consent_type: "consumer_health", entity_type: "mcp_remote_server", entity_id }

POST /api/accounts/me/consents/revoke
     Body: { consent_type: "consumer_health", entity_type: "mcp_remote_server", entity_id }
```

Feature flag: `sensitive_mcps_per_call_consent` -- per-call consent for sensitive MCP tools.
Feature flag: `sensitive_mcp_tools` -- configuration for which tools/servers are sensitive.

### Directory Installation Modals

When adding from directory, the following consent modals may be shown (in sequence):
1. `HIPAA_ATTESTATION` -- if server requires PHI attestation
2. `HEALTH_DATA_CONSENT` -- if server URL matches health data pattern
3. `MS365_WARNING` -- if server is "Microsoft 365"
4. `URL_PICKER` -- if server has URL options to choose from
5. `ADDL_DETAILS` -- if server has required fields

---

## Appendix: Feature Flags Summary

| Flag | Purpose |
|------|---------|
| `claudeai_mcp_bootstrap` | Master toggle for MCP bootstrap |
| `claudeai_mcp_bootstrap_wait` | Bootstrap wait time (ms) |
| `claudeai_mcp_bootstrap_eager` | Eager bootstrap loading |
| `mcp_bootstrap_first_pass_enabled` | Enable first_pass_complete event |
| `mcp_tb_sessions` | Toolbox sessions (backend tool execution) |
| `mcp_shttp` | Streamable HTTP transport |
| `mcp_gdrive` | Google Drive as MCP server |
| `enabled_brioche` | GSuite MCP migration |
| `papi_mcp` | Private API MCP |
| `mcp_clear_cache` | Server cache clearing |
| `claude_ai_mcp_directory_web_only` | Directory web-only mode |
| `mcp_tool_approval_config` | Tool approval configuration |
| `mcp_tool_input_expand_config` | Tool input expansion config |
| `disable_destructive_mcp_tools_by_default` | Default-deny destructive tools |
| `yukon_silver_tool_perms` | Advanced tool permissions |
| `yukon_silver_extension_install` | Extension install from web |
| `claudeai_mcp_apps_visualize` | MCP Apps visualization |
| `claudeai_mcp_apps_example_server` | Example MCP app server |
| `sensitive_mcps_per_call_consent` | Per-call consent for sensitive MCPs |
| `sensitive_mcp_tools` | Sensitive tool configuration |
| `suggested_connectors` | Connector suggestions |
| `suggested_connectors_desktop_chat` | Desktop connector suggestions |
| `suggested_plugins` | Plugin suggestions |
| `cai_cos_mcp_registry_search` | In-chat registry search |
| `tmp_claudeai_mcp_auth_errors_ui` | Auth error UI |
| `tmp_claudeai_connector_suggestion_error_state` | Suggestion error state |
| `claude_ai_unicode_sanitize_mcp_data` | Unicode sanitization |
| `apps_mcp_ws_reconnect_config` | WebSocket reconnect config |
| `free-user-custom-connectors` | Free users can add custom connectors |
| `kingfisher_enabled` | Google Drive features |
| `cinnabon_enabled` | Additional connector features |
| `apps_use_bananagrams` | Use bananagrams (Drive search) |
| `bagel_enabled` | Directory nudge banner |
| `claude_ai_sticky_project_settings` | Sticky project settings |
| `chat_capability_controls` | Chat capability controls |
| `claude_create_marble` | Claude Create features |
| `pivot_hive_web` | Web hive features |

---

## Appendix: Key State Management

### Zustand Store (`MY`)

The MCP state store manages:

```js
{
  // Remote servers
  remoteServers: { [uuid]: ServerRecord },
  remoteConnectionStates: { [uuid]: ConnectionState },
  remoteTools: { [uuid]: Tool[] },
  remoteAppOnlyTools: { [uuid]: Tool[] },
  remotePrompts: { [uuid]: Prompt[] },
  remoteResources: { [uuid]: Resource[] },
  remoteDirectories: { [uuid]: DirectoryInfo },
  remoteClients: { [uuid]: Client },
  remoteIsLoading: boolean,
  remoteHasBootstrapped: boolean,
  remoteStreamCompleted: boolean,
  shouldRequestRemoteMcpStatus: boolean,

  // Local servers (Desktop / DXT)
  localClients: { [name]: { uuid, client, isBuiltIn } },
  localTools: { [name]: Tool[] },
  localAppOnlyTools: { [name]: Tool[] },
  localPrompts: { [name]: Prompt[] },
  localResources: { [name]: Resource[] },
  dxts: { [name]: DxtInfo },
  localIsLoading: boolean,

  // Actions
  setRemoteIsLoading(loading),
  setRemoteTools(uuid, modelVisible, appOnly),
  setRemoteResources(uuid, resources),
  setRemotePrompts(uuid, prompts),
  removeRemoteServer(uuid),
  disconnectRemoteServer(uuid, authStatus, authErrorType, authErrorSubtype),
  setLocalClient(name, client, uuid, isBuiltIn),
  removeLocalServer(name),
  setLocalIsLoading(loading),
  setIframeParentTools(name, tools)
}
```

### Key Helper Functions

- `AY(server)` -- upserts a remote server record
- `NY(uuid)` -- checks if server should be connected (not manually disconnected)
- `IY(uuid)` -- checks if server connection is valid
- `TY(uuid, usedAuth, authStatus, errType, errSubtype)` -- marks server as connected
- `LY(uuid)` -- marks server as disconnected
- `OY(key, client)` -- stores an MCP client reference
- `SY(uuid)` -- retrieves an MCP client
- `tJ(uuid)` -- gets the MCP client for tool execution
- `BY(uuid, url, directory)` -- records directory association
- `RY(uuid, hasMcpApps)` -- flags server as having MCP Apps
- `DY(flag)` -- marks bootstrap as complete
- `PY(flag)` -- marks first pass as complete
- `zY(flag)` -- marks stream as completed
- `FY()` -- triggers remote status request

### Unified Server List (`XY`)

`XY(filter?)` returns a merged list of remote + local servers with:
```js
{
  name, uuid, type: "remote" | "local",
  iconType, iconSrc,
  isConnected, isConnecting, usedAuthentication,
  toolsLoaded, tools, appOnlyTools, prompts, resources,
  directoryMetadata?,
  localId?,              // for DXT
  authStatus?, authErrorType?, authErrorSubtype?
}
```

Filter options: `{ type?, isConnected?, directoryUuid? }`.
