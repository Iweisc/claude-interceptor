# Claude Interceptor

Route [claude.ai](https://claude.ai)'s web UI through your own LiteLLM proxy. Use any model on claude.ai's interface without a paid subscription.

## What it does

- Intercepts completion requests from claude.ai and routes them through a server-side proxy to LiteLLM
- Spoofs Max plan so the UI unlocks all models, extended thinking, and features
- Inline **widget rendering** (SVG, HTML, interactive content) via the visualize MCP app
- Working **web search** via SearXNG, plus web_fetch, image_search, weather, places, sports
- **Memories** that persist across conversations
- **Past chat search** and **recent chats** retrieval
- **Artifacts** (create_file, present_files, str_replace, view)
- **Extended thinking** with configurable budget
- **Sidebar sync** — proxy conversations appear in the sidebar, persist across refreshes
- **Cross-browser sync** — conversations stored in PostgreSQL, accessible from any browser
- **Title generation** using Haiku 4.5
- **Chat deletion** from the proxy database
- Works on **Chrome** (MV3) and **Firefox** (MV2)

## Architecture

```
Browser (Chrome/Firefox)
├── early-inject.js     (MAIN world, document_start)
│   ├── IDB cache clear (react-query-cache)
│   ├── Plan spoofing (bootstrap, account responses)
│   └── Feature flags (inline_visualizations, mcp_artifacts, etc.)
│
├── inject.js           (MAIN world, async loaded)
│   ├── fetch override → URL rewrite to proxy
│   ├── XHR override → URL rewrite to proxy
│   ├── Sidebar: chat_conversations_v2 → proxy (only proxy convos)
│   └── Completion body: inject paprika_mode, _thinkingBudget
│
├── content.js          (ISOLATED world, document_start)
│   ├── Gets cookies + email from background.js
│   └── Injects inject.js with settings as data attributes
│
├── background.js       (Service worker)
│   ├── Cookie extraction from claude.ai
│   └── /api/account fetch for user email
│
└── popup               (Extension settings UI)
    ├── LiteLLM endpoint + API key
    ├── Model (fallback)
    ├── Extended thinking toggle + budget
    └── Saved to chrome.storage.local


Proxy Server (Express + PostgreSQL, deployed on Sealos K8s)
├── Completion routes
│   ├── POST /chat_conversations/:id/completion
│   ├── POST /chat_conversations/:id/retry_completion
│   └── Tool execution loop (up to 8 iterations)
│       ├── web_search, web_fetch, image_search → SearXNG
│       ├── weather_fetch, places_search, sports → SearXNG
│       ├── create_file, str_replace, view → PostgreSQL artifacts
│       ├── show_widget → PostgreSQL artifacts + visualize SSE
│       ├── memory_user_edits → PostgreSQL memories
│       └── conversation_search, recent_chats → PostgreSQL
│
├── Conversation routes
│   ├── POST /chat_conversations (create)
│   ├── GET  /chat_conversations/:id (single + tree)
│   ├── PUT  /chat_conversations/:id (settings)
│   ├── DELETE /chat_conversations/:id
│   ├── POST /chat_conversations/:id/title (Haiku 4.5 gen)
│   ├── POST /chat_conversations/:id/tool_result
│   └── GET  /chat_conversations_v2 (sidebar list, { data: [...] })
│
├── Artifact routes
│   ├── GET /wiggle/download-file
│   ├── GET /conversations/:id/wiggle/download-file
│   ├── GET /artifacts/wiggle_artifact/:id/tools
│   ├── GET /artifacts/wiggle_artifact/:id/manage/storage/info
│   └── GET /artifacts/:id/versions
│
├── SSE augmentation
│   ├── message_start → set UUIDs, blank model
│   ├── content_block_start (tool_use) → show_widget → visualize:show_widget
│   ├── message_stop → inject message_limit (fake unlimited)
│   └── Tool results → local_resource for files, visualize for widgets
│
├── Memory routes (GET/POST /memory)
└── Catch-all → proxy to upstream claude.ai


LiteLLM (Sealos)
├── /v1/messages (Anthropic Messages API format)
├── Routes to AWS Bedrock
│   ├── claude-opus-4-6
│   ├── claude-sonnet-4-6
│   └── claude-haiku-4-5-20251001
└── Handles streaming SSE translation


SearXNG (Sealos)
└── /search?q=...&format=json&categories=general|images
```

## Setup

### Prerequisites

- A running [LiteLLM](https://github.com/BerriAI/litellm) instance with Anthropic-format models configured
- A PostgreSQL database
- A [SearXNG](https://github.com/searxng/searxng) instance (for web search)
- Chrome 120+ or Firefox 140+

### Install (Chrome)

1. Clone this repo
2. Open `chrome://extensions`, enable Developer Mode
3. Click "Load unpacked" and select the `chrome/` directory
4. Click the extension icon → enter your LiteLLM endpoint, API key
5. Save and refresh claude.ai

### Install (Firefox)

1. Clone this repo
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on" and select `manifest.json`
4. Configure via the extension popup

### Sync Server

The proxy server stores conversations, memories, artifacts, and chat history per user in PostgreSQL.

```bash
cd sync-server
cp .env.example .env  # edit with your PostgreSQL connection string
npm install
node index.js
```

Update `PROXY_ORIGIN` in `inject.js` and `chrome/inject.js` to point to your server.

### Deploy (Sealos/Kubernetes)

```bash
cd sync-server
tar -czf /tmp/app.tgz --exclude=node_modules --exclude=test --exclude=Dockerfile .
# Create configmap from tarball and apply
kubectl apply -f deploy/sealos/proxy-code-configmap.yaml
kubectl apply -f deploy/sealos/proxy-deployment.yaml
```

## Extension Settings

| Setting | Description |
|---------|-------------|
| **LiteLLM Endpoint** | URL of your LiteLLM instance |
| **Model** | Fallback model ID. The Claude UI model selector overrides this. |
| **API Key** | Your LiteLLM API key |
| **Extended Thinking** | Enable extended thinking (injects `paprika_mode: "extended"`) |
| **Thinking Budget** | Max thinking tokens (up to 126,000) |

## How it works

### Plan Spoofing

The extension modifies bootstrap/account API responses client-side:
- Sets `subscription_type: 'claude_max'` and Max rate limit tier
- Adds `claude_pro`, `claude_max` to org capabilities
- Enables `inline_visualizations`, `mcp_artifacts`, `interactive_content` features
- Overrides GrowthBook/Statsig feature flags
- Filters bootstrap models to known set (Opus 4.6, Sonnet 4.6, Haiku 4.5)
- Clears React Query IDB cache so the app fetches fresh data

### Completion Flow

1. User sends message on claude.ai
2. `inject.js` intercepts fetch, rewrites URL to proxy
3. Proxy reads conversation history from PostgreSQL
4. Proxy builds system prompt (with memories, tool instructions, styles)
5. Proxy sends Anthropic Messages API request to LiteLLM (`/v1/messages`)
6. LiteLLM routes to AWS Bedrock
7. SSE stream is augmented (UUIDs, timestamps, tool metadata) and forwarded to frontend
8. If model calls tools → proxy executes them, appends results, loops back to LiteLLM
9. Conversation history saved to PostgreSQL

### Widget Rendering

`show_widget` renders inline HTML/SVG via the visualize MCP app system:
- SSE `content_block_start` is augmented with `is_mcp_app: true`, `integration_name: "visualize"`
- Frontend creates sandboxed iframe and renders `widget_code` from buffered tool input
- History stores tool as `show_widget` (for LiteLLM), tree response renames to `visualize:show_widget` (for frontend)

### Tools

| Tool | Backend | Description |
|------|---------|-------------|
| `web_search` | SearXNG | Web search (top 5 results) |
| `web_fetch` | Direct HTTP | Fetch and extract text from URL |
| `image_search` | SearXNG (images) | Image search |
| `weather_fetch` | SearXNG | Weather data → show_widget card |
| `places_search` | SearXNG | Place/business search |
| `fetch_sports_data` | SearXNG | Sports scores/standings |
| `create_file` | PostgreSQL | Create artifact files |
| `present_files` | SSE | Display files in artifact panel |
| `show_widget` | PostgreSQL + SSE | Render inline HTML/SVG widgets |
| `str_replace` | PostgreSQL | Edit artifact files |
| `view` | PostgreSQL | Read artifact file contents |
| `memory_user_edits` | PostgreSQL | Add/view/remove/replace memories |
| `conversation_search` | PostgreSQL | Keyword search past conversations |
| `recent_chats` | PostgreSQL | Time-based conversation retrieval |

## Project Structure

```
├── manifest.json              # Firefox MV2 manifest
├── inject.js                  # Firefox: fetch/XHR override, URL rewriting
├── content.js                 # Firefox: bridge extension ↔ page context
├── background.js              # Firefox: cookie/email extraction
├── chrome/
│   ├── manifest.json          # Chrome MV3 manifest
│   ├── early-inject.js        # MAIN world, document_start: IDB clear + plan spoofing
│   ├── inject.js              # MAIN world: fetch/XHR override, URL rewriting
│   ├── content.js             # ISOLATED world: inject script loader
│   └── background.js          # Service worker: cookie/email extraction
├── popup/
│   ├── popup.html             # Extension settings UI
│   └── popup.js               # Settings load/save
├── sync-server/
│   ├── index.js               # Entry point
│   ├── src/
│   │   ├── app.js             # Express app, CORS, auth middleware
│   │   ├── db.js              # PostgreSQL pool + schema init
│   │   ├── config.js          # Environment config
│   │   ├── repositories/
│   │   │   ├── conversations.js   # Conversation CRUD + artifacts
│   │   │   └── memories.js        # Memory CRUD
│   │   ├── routes/
│   │   │   ├── conversations.js   # Conversation + sidebar + title + delete
│   │   │   ├── completion.js      # Completion endpoint
│   │   │   ├── artifacts.js       # Artifact download + versions
│   │   │   └── memory.js          # Memory endpoint
│   │   └── services/
│   │       ├── completion-runner.js   # LiteLLM streaming + tool loop
│   │       ├── sse.js                 # SSE augmentation + generation
│   │       ├── tool-runner.js         # Tool execution (search, files, etc.)
│   │       ├── tool-definitions.js    # Tool schemas for LiteLLM
│   │       ├── system-prompt.js       # System prompt builder
│   │       ├── claude-shapes.js       # Response shape builders
│   │       ├── claude-upstream.js     # Upstream proxy helpers
│   │       └── session-identity.js    # User identity cache
│   └── test/                  # Node.js test suite
├── deploy/
│   └── sealos/
│       ├── proxy-code-configmap.yaml
│       └── proxy-deployment.yaml
├── docs/
│   └── extraction/            # Claude.ai frontend reverse-engineering docs
└── test/
    └── inject-proxy-rewrite.test.js
```

## Limitations

- Voice mode not yet implemented
- Firefox extension needs testing (Chrome is primary)
- Conversations can't survive hard refresh on their URL (SSR returns 404)
- Widget persistence after completion requires tree re-fetch
- No starred conversations support
- Title generation requires LiteLLM to have Haiku 4.5 configured

## License

MIT
