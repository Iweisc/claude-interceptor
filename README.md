# Claude Interceptor

Route [claude.ai](https://claude.ai)'s web UI through your own LiteLLM proxy. Use any model (Opus, Sonnet, GPT-4, Gemini, local models) on claude.ai's interface without a paid subscription.

## What it does

- Intercepts completion requests from claude.ai and routes them through your LiteLLM instance
- Spoofs Pro plan so the UI unlocks all models, extended thinking, and features
- Adds working **web search** via SearXNG
- Adds **memories** that persist across conversations
- Adds **past chat search** and **recent chats** retrieval
- Supports **artifacts** (create_file, present_files, show_widget)
- Supports **extended thinking** (paprika_mode detection from UI toggle)
- Supports **styles** (personalized_styles passed through to system prompt)
- Supports **incognito mode** (disables memory/past chats when enabled)
- Syncs conversation history per-user via PostgreSQL
- Works on **Firefox** (MV2) and **Chrome** (MV3)

## Architecture

> **Note:** This project is being refactored to a server-side proxy architecture. The current version uses browser-side interception.

```
claude.ai frontend
  -> inject.js (overrides fetch, intercepts /completion requests)
  -> content.js (bridges page context <-> extension)
  -> background.js (translates to Anthropic Messages API, calls LiteLLM, streams SSE back)
  -> sync server (PostgreSQL — conversations, memories, skills per user)
  -> SearXNG (web search)
```

## Setup

### Prerequisites

- A running [LiteLLM](https://github.com/BerriAI/litellm) instance with at least one model configured
- Firefox 140+ or Chrome 120+

### Install (Firefox)

1. Clone this repo
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on" and select `manifest.json`
4. Click the extension icon in the toolbar to open settings
5. Enter your LiteLLM endpoint (e.g. `https://your-litellm.example.com`) and API key
6. Save and refresh claude.ai

### Install (Chrome)

1. Copy the `chrome/` directory
2. Open `chrome://extensions`, enable Developer Mode
3. Click "Load unpacked" and select the `chrome/` directory
4. Configure via the extension popup

### Sync Server (optional for self-hosting)

The sync server stores conversations, memories, and chat history per user. A central instance is hardcoded for the default build.

To self-host:

```bash
cd sync-server
cp .env.example .env  # edit with your PostgreSQL connection string
npm install
node index.js
```

Then update `SYNC_URL` and `SYNC_KEY` constants in `background.js`.

## Extension Settings

| Setting | Description |
|---------|-------------|
| **LiteLLM Endpoint** | URL of your LiteLLM instance (e.g. `https://litellm.example.com`) |
| **Model** | Default model ID (e.g. `claude-opus-4-6`, `gpt-4o`). The UI model selector overrides this. |
| **API Key** | Your LiteLLM API key |
| **Extended Thinking** | Enable thinking mode (fallback if the UI toggle isn't detected) |
| **Thinking Budget** | Max thinking tokens (up to 126,000) |

## How it works

### Plan Spoofing

The extension modifies the bootstrap API response to make claude.ai think the account has a Pro subscription:
- Adds `claude_pro` to org capabilities
- Sets `billing_type: 'stripe'` and Pro rate limit tier
- Overrides GrowthBook/Statsig feature flags for model access
- Clears React Query IDB cache so the app fetches fresh (modified) data

### Completion Interception

When you send a message on claude.ai:
1. `inject.js` intercepts the fetch to `/api/organizations/.../completion`
2. The request body (prompt, model, files, settings) is relayed to `background.js`
3. `background.js` builds a system prompt (with styles, memories, tool instructions), translates to Anthropic Messages API format, and streams from LiteLLM
4. SSE events are augmented to match claude.ai's expected format (UUIDs, timestamps, message_limit events)
5. Tools are executed in a loop: web search, memory edits, conversation search, recent chats, artifacts

### Tools

| Tool | Backend |
|------|---------|
| `web_search` | SearXNG instance (self-hosted) |
| `memory_user_edits` | PostgreSQL via sync server |
| `conversation_search` | PostgreSQL full-text search |
| `recent_chats` | PostgreSQL time-based query |
| `create_file` | Stored in browser, served on download |
| `present_files` | Renders artifact panel in UI |
| `show_widget` | Renders inline SVG/HTML widgets |

## Project Structure

```
├── manifest.json          # Firefox MV2 manifest
├── background.js          # Main translation engine (LiteLLM calls, SSE streaming, tools)
├── inject.js              # Page-context fetch override, completion interception
├── content.js             # Bridge between inject.js and background.js
├── popup/
│   ├── popup.html         # Extension settings UI
│   └── popup.js           # Settings load/save
├── icons/
│   └── icon48.png
├── chrome/                # Chrome MV3 version (same features, chrome.* APIs)
│   ├── manifest.json
│   ├── background.js
│   ├── inject.js
│   ├── content.js
│   └── popup/
└── sync-server/
    ├── index.js           # Express + PostgreSQL sync server
    ├── package.json
    ├── Dockerfile
    └── .env
```

## Limitations

- Voice mode requires Chrome (Firefox lacks Web Speech API for recognition)
- Conversation history may not persist across page refreshes in some cases
- The extension lies to claude.ai's frontend, which occasionally causes state sync issues
- Retry uses a different code path (XHR) that may not always be intercepted

## License

MIT
