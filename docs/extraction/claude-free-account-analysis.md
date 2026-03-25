# Claude.ai Free Account Analysis: What Works Natively vs What Needs Proxying

**Date:** 2026-03-22
**Purpose:** Determine the absolute minimum interception surface for the claude-intercepter extension.

---

## 1. What Works on Free Accounts Natively (No Proxy Needed)

### 1.1 Fully Functional on Free Tier

These features work against real claude.ai servers with a free account. The extension should **pass these through unchanged**:

| Feature | Endpoints | Evidence |
|---------|-----------|----------|
| **Authentication** | `/api/auth/*` | Tier-agnostic |
| **Account info** | `/api/account`, `/api/account_profile`, `/api/account/settings` | All tiers |
| **Bootstrap** | `/api/bootstrap`, `/api/bootstrap/{id}/app_start` | All tiers (model list differs) |
| **Conversation CRUD** | `chat_conversations` (create, list, get, update, delete) | Free users can chat |
| **Conversation listing** | `chat_conversations_v2` | Sidebar works for all |
| **Conversation search** | `/conversation/search` | Works for all |
| **Haiku model** | `claude-3-5-haiku-latest`, `claude-haiku-4-5-20251001` | Default free model |
| **Completions (Haiku)** | `completion`, `retry_completion` | Works with Haiku on free |
| **Basic artifacts** | Wiggle file creation in chat | `wiggle_enabled` / `wiggle_graduated` flags - available to all |
| **File uploads** | `/api/organizations/{orgId}/upload` | Works for free (lower limits) |
| **File contents** | `/api/organizations/{orgId}/files/{fileId}/contents` | Works for all |
| **Styles** | `/api/organizations/{orgId}/list_styles`, create, edit, delete | Available to all tiers |
| **Skills (basic)** | `/api/organizations/{orgId}/skills/list-skills` | `claudeai_skills` flag - available to all |
| **Projects (limited)** | Create, list, basic CRUD | Free users get limited projects (`max_free_projects` GrowthBook config) |
| **Incognito mode** | `?incognito` / `is_temporary: true` | Available to all (grove) |
| **Theme/appearance** | localStorage `userThemeMode` | Client-side only |
| **Settings pages** | `/settings/general`, `/settings/capabilities`, etc. | All tiers |
| **Banners** | `/api/banners` | All tiers |
| **Event logging** | `/api/event_logging/batch` | All tiers |
| **i18n** | `/i18n/*.json` | All tiers |
| **Stop response** | `stop_response` | Works for own completions |
| **Completion status** | `completion_status` | Works for own completions |
| **Title generation** | `POST .../title` | Works for all |
| **Message flagging** | `POST .../flags` | Works for all |
| **Conversation sharing** | `POST .../share` | Works for all |
| **Starred conversations** | `PUT ...` with `is_starred` | Works for all |
| **Bulk delete/move** | `delete_many`, `move_many` | Works for all |

### 1.2 Memory - AVAILABLE ON FREE

Memory (codename "saffron") is controlled by GrowthBook feature flags, NOT by plan capabilities:
- `claudeai_saffron_enabled` - master toggle (feature flag, not plan-gated)
- `claudeai_saffron_default_enabled` - default for new users
- Account setting: `enabled_saffron` (boolean toggle)

**Key insight:** Memory is a feature-flag-gated feature, not a plan-gated feature. Free users can have memory enabled. The memory endpoints (`/memory`, `/memory/controls`, `/memory/synthesize`, `/memory/reset`, `/memory/themes`) work for free accounts when the feature flag is on.

### 1.3 Web Search - AVAILABLE ON FREE

Web search is controlled by:
- Model capability: `capabilities.web_search` on the model config object
- Conversation setting: `enabled_web_search`
- Feature availability: `web_search` is listed as `"Available"` in the `DT` feature map

**Key insight:** Web search is available on free accounts. It's a per-model capability, and Haiku has web search. Free users can toggle it on/off per conversation.

### 1.4 Skills - AVAILABLE ON FREE

Skills are controlled by `claudeai_skills` feature flag, not plan-gated. The skill endpoints (list, create, edit, delete, enable, disable) work for free accounts.

---

## 2. What's Pro/Max-Only (Needs Unlocking)

### 2.1 Plan-Gated by Capabilities Array

The **primary gating mechanism** is `organization.capabilities`:
- `"claude_pro"` in capabilities -> Pro features
- `"claude_max"` in capabilities -> Max features
- Neither -> Free

The helper `jy()` ("can use paid features") checks: Pro/Max/Raven = true, Free = false.

### 2.2 Specifically Pro/Max-Gated Features

| Feature | How It's Gated | What Breaks on Free |
|---------|---------------|---------------------|
| **Opus/Sonnet model access** | `claude_ai_bootstrap_models_config` - models marked `inactive: true` for free | Model selector won't show Opus/Sonnet |
| **Extended thinking** | `paprika_mode` / `thinking_modes` on model config; requires Sonnet 4.5+ | No thinking toggle without model access |
| **Deep research (Compass)** | `compass_mode`; requires model capability `compass: true` | No research mode |
| **Higher rate limits** | `rate_limit_tier`: free=`default_claude_ai`, pro=`default_claude_ai`, max=`default_claude_max_5x/20x` | Tighter limits on free |
| **Opus upsell** | Shows upsell when `_y() === "claude_pro"` and model starts with `"claude-opus"` | UI nag |
| **Overages** | `bad_moon_rising` flag + paid plan check | No overages option |
| **Cowork / Agent mode** | Max tier feature | No cowork on free |
| **Claude Code (desktop/web)** | Max tier / `claude_code_waffles` for raven orgs | No code features |

### 2.3 What the Extension Already Spoofs

The current `inject.js` already handles plan spoofing correctly:

1. **Capabilities array**: Adds `"claude_pro"` and `"claude_max"` to `organization.capabilities`
2. **Models config**: Ensures Sonnet 4.5, Opus 4.6, Haiku 4.5 are all `inactive: false`
3. **GrowthBook attributes**: Sets `isPro: true`, `isMax: true`, `orgType: "claude_max"`
4. **Statsig attributes**: Same as GrowthBook
5. **Rate limit tier**: Sets to `default_claude_max_20x`
6. **Billing type**: Sets to `"stripe"`
7. **IDB cache**: content.js clears `react-query-cache` from IndexedDB to prevent stale cache

**This spoofing is sufficient to unlock the model selector UI.** The frontend will show Opus, Sonnet, and all thinking modes.

---

## 3. The Critical Insight: Hybrid Architecture

### 3.1 What Actually Needs to Be Proxied

The current proxy intercepts **far too much**. Here's what genuinely needs interception:

| Must Intercept | Why |
|----------------|-----|
| `POST .../completion` | Route to LiteLLM instead of claude.ai (free account would use Haiku, we want Opus/Sonnet) |
| `POST .../retry_completion` | Same as above |
| `GET /api/account` | Patch capabilities (already done client-side, but belt-and-suspenders) |
| `GET /api/bootstrap/{id}/app_start` | Patch capabilities + models (already done client-side) |

**That's it for the minimum viable interception.**

### 3.2 What Does NOT Need to Be Proxied

Everything else can go to real claude.ai:

- Conversation CRUD (create, list, get, update, delete, search)
- Memory (all endpoints)
- Projects
- Styles
- Skills
- File uploads
- Artifacts
- Settings
- Title generation
- All UI/sidebar functionality

### 3.3 The Conversation Storage Question

**Q: If we intercept completion but let conversation CRUD go to claude.ai, what happens?**

Here's the flow:

1. User opens claude.ai -> sees real sidebar with real conversations (from claude.ai server)
2. User sends a message -> frontend POSTs to `.../completion`
3. Extension intercepts, routes to LiteLLM
4. LiteLLM responds with Opus/Sonnet response
5. **BUT**: claude.ai's server never received the completion request, so:
   - The server has the conversation record (created via `POST chat_conversations`)
   - The server has the human message (sent as part of the completion request body)
   - The server does NOT have the assistant response

**What breaks on page refresh?**
- The human messages ARE stored on claude.ai's server (they're part of the completion request)
- Actually, **NO** - the human message is part of the completion POST body, and if that POST never reaches claude.ai, the server has nothing.

Let me reconsider. The flow is:

1. Frontend creates conversation via `POST /api/organizations/{orgId}/chat_conversations` -> goes to real claude.ai -> conversation exists on server
2. Frontend sends `POST .../completion` with the user's message -> if intercepted, **claude.ai never sees this message at all**
3. On page refresh, `GET .../chat_conversations/{id}?tree=True` returns from claude.ai -> **empty conversation** (no messages)

**This means: the conversation shell exists on claude.ai but has zero messages.**

### 3.4 Can We Make the Hybrid Work?

**Option A: Pure client-side interception (extension-only, no proxy server)**

1. Let ALL requests go to claude.ai normally
2. Only intercept the SSE response from `.../completion` and `.../retry_completion`
3. When the frontend sends a completion request, let it go to claude.ai (which uses Haiku for free users)
4. Intercept the SSE response stream, discard claude.ai's Haiku response, inject LiteLLM's response instead
5. Conversation exists on claude.ai with user messages AND claude.ai's Haiku response
6. User sees the LiteLLM response (injected)
7. On page refresh, user sees claude.ai's Haiku response (from server)

**Problem**: User sees different responses before and after refresh. The conversation tree on the server has Haiku responses, not the Opus responses the user saw.

**Option B: Intercept completion, don't forward to claude.ai at all**

1. Let conversation creation go to claude.ai
2. Intercept completion, route entirely to LiteLLM
3. Conversation on claude.ai has no messages (shell only)
4. On refresh, conversation appears empty
5. Sidebar shows conversation title (if we let title generation through) but chat is empty

**Problem**: All history is lost on refresh.

**Option C: Dual-write (best of both worlds)**

1. Let conversation creation go to claude.ai -> conversation exists on server
2. Intercept completion -> route to LiteLLM -> get response
3. After getting LiteLLM response, **also** forward the original completion to claude.ai in the background (fire-and-forget)
4. Store the LiteLLM response in local storage (IndexedDB or extension storage)
5. On refresh, intercept the `GET .../chat_conversations/{id}?tree=True` response and inject our stored messages

**Problem**: Complex, race conditions, and claude.ai's server will have Haiku responses in the tree while we want to show Opus responses.

**Option D: Keep the proxy server, but only for completions**

1. All non-completion requests go to claude.ai directly
2. Completion/retry_completion go to proxy server
3. Proxy server:
   - Forwards the user message to claude.ai (so it's stored server-side)
   - Simultaneously routes to LiteLLM for the actual response
   - Returns LiteLLM's response to the user
   - Stores the LiteLLM assistant response and associates it with the conversation
4. Intercept `GET .../chat_conversations/{id}?tree=True` to inject proxy-stored assistant messages

**Problem**: Still need a proxy server, and still need to intercept conversation GET to inject messages.

**Option E: Proxy server owns conversations entirely (current approach)**

This is what the current sync-server does. It's the most consistent but requires proxying many endpoints.

---

## 4. The Absolute Minimum Proxy Surface

Given the constraints, here's the **minimum viable proxy**:

### Tier 1: Absolute Minimum (extension-only, no server)

**If we accept that conversation history is lost on refresh:**

| Intercept | Direction | Purpose |
|-----------|-----------|---------|
| `GET /api/account` | Patch response | Add Pro/Max capabilities |
| `GET /api/bootstrap/{id}/app_start` | Patch response | Add capabilities, models, GrowthBook |
| `POST .../completion` | Redirect to LiteLLM | Get Opus/Sonnet response |
| `POST .../retry_completion` | Redirect to LiteLLM | Get Opus/Sonnet retry |

**Everything else goes to claude.ai unchanged.**

- Conversations work (create, list, delete, search) - all on claude.ai
- Memory works - on claude.ai
- Projects, styles, skills - all on claude.ai
- Artifacts created by LiteLLM responses are lost on refresh (no server storage)
- User messages are NOT stored on claude.ai (completion request never reaches it)
- On refresh: conversation appears in sidebar but is empty

### Tier 2: Minimum with persistence (thin proxy server)

Add a thin proxy server that ONLY handles:

| Endpoint | Purpose |
|----------|---------|
| `POST .../completion` | Route to LiteLLM, store messages in DB |
| `POST .../retry_completion` | Same |
| `GET .../chat_conversations/{id}` | Merge claude.ai's conversation shell with proxy-stored messages |
| `GET .../chat_conversations/{id}/current_leaf_message_uuid` | Return proxy's leaf UUID |
| `POST .../stop_response` | Cancel running LiteLLM request |

**Everything else goes to claude.ai.**

- Conversations listed from claude.ai (sidebar works naturally)
- Conversation creation on claude.ai (shell exists)
- Conversation GET intercepted to inject proxy messages
- Memory on claude.ai (works natively)
- All other features on claude.ai

### Tier 3: Full ownership (current sync-server approach)

The current approach where the proxy owns conversations, memory, artifacts, etc.

---

## 5. Recommendation: Tier 2 (Minimum with Persistence)

### What the proxy server needs to handle:

1. **`POST .../completion`** - The big one
   - Accept the completion request
   - Forward user message to LiteLLM with system prompt
   - Stream SSE response back to client
   - Store human message + assistant response in DB
   - Associate with claude.ai conversation UUID

2. **`POST .../retry_completion`** - Same as completion but removes last assistant turn

3. **`GET .../chat_conversations/{id}?tree=True`** - Message injection
   - Fetch from claude.ai (get conversation shell)
   - Merge in proxy-stored messages
   - Return combined response

4. **`POST .../stop_response`** - Completion control
   - Cancel running LiteLLM request
   - Return appropriate response

### What the extension handles (client-side only):

1. **Patch `/api/account`** - Add capabilities (already done)
2. **Patch `/api/bootstrap/{id}/app_start`** - Add capabilities, models (already done)
3. **Clear IDB cache** - Prevent stale cached bootstrap (already done)
4. **Route completion/retry to proxy** - Already done via `PROXY_OWNED_ORG_ROUTE_RE`
5. **Route conversation GET to proxy** - Need to add for message injection

### What goes to claude.ai unchanged:

- Everything else: conversation list, create, delete, search, memory, projects, styles, skills, files, settings, etc.

---

## 6. Key Answers to Your Questions

### Does conversation CRUD need to be proxied?

**No.** Conversation CRUD (create, list, delete, move, search, star) can all go to claude.ai. Free accounts can do all of this natively. The proxy only needs to intercept the conversation GET (to inject stored messages) and completions.

### If we intercept completion SSE and inject our response, but the conversation on claude.ai's server only has user messages (no assistant responses from us), what breaks?

Actually, **claude.ai won't even have user messages**. The human message is part of the completion POST body. If that POST is intercepted and never reaches claude.ai, the server has an empty conversation shell. On refresh:
- Conversation appears in sidebar (shell exists with name/title)
- Opening it shows no messages

### Is the hybrid (user messages on claude.ai, assistant messages lost on refresh) acceptable?

It depends on whether you care about history persistence. If you accept "conversations are ephemeral and reset on refresh," the extension can work with **zero server infrastructure** - just redirect completions to a LiteLLM endpoint directly from the browser.

### Could we store messages in extension storage / IndexedDB?

Yes. Instead of a proxy server, the extension could:
1. Intercept completion requests -> call LiteLLM directly from inject.js
2. Store messages in IndexedDB under the conversation UUID
3. Intercept `GET .../chat_conversations/{id}?tree=True` -> merge IDB messages into response

This eliminates the need for a proxy server entirely but adds complexity to the extension.

---

## 7. Minimum Viable Interception Summary

```
CLIENT-SIDE ONLY (inject.js):
  Patch:  GET /api/account                              -> add capabilities
  Patch:  GET /api/bootstrap/{id}/app_start              -> add capabilities, models
  Block:  IDB react-query-cache                          -> prevent stale cache

PROXY SERVER (or direct LiteLLM call):
  Own:    POST .../completion                            -> route to LiteLLM
  Own:    POST .../retry_completion                      -> route to LiteLLM
  Merge:  GET  .../chat_conversations/{id}?tree=True     -> inject stored messages

PASS-THROUGH TO CLAUDE.AI (everything else):
  conversation create, list, delete, move, search, star
  memory (all endpoints)
  projects (all endpoints)
  styles (all endpoints)
  skills (all endpoints)
  files, uploads
  settings
  auth
  banners, events, i18n
  title generation
  sharing, snapshots
  MCP connectors
  everything else
```

### What the current proxy server does that it DOESN'T NEED TO DO:

| Currently Proxied | Actually Needed? | Why Not |
|-------------------|-----------------|---------|
| `POST chat_conversations` (create) | NO | Free accounts can create conversations |
| `PUT chat_conversations/{id}` (update) | NO | Free accounts can update settings |
| `GET chat_conversations/{id}` (get) | YES (for merge) | Need to inject stored messages |
| `POST .../title` | NO | Free accounts can generate titles |
| `GET /memory` | NO | Memory works on free accounts |
| `GET /subscription_details` | MAYBE | Could return fake or let real one through with patched capabilities |
| `GET /wiggle/download-file` | MAYBE | Only if artifacts are stored locally |
| `GET /artifacts/.../versions` | MAYBE | Only if artifacts are stored locally |
| `GET /artifacts/.../tools` | NO | Pass through |

---

## 8. What About Artifacts?

Artifacts are the tricky part. When LiteLLM's response creates an artifact (via `create_file` tool), the artifact content exists only in the SSE stream. Claude.ai's server never sees it.

**Options:**
1. **Store artifacts in proxy DB** (current approach) - requires proxy server
2. **Store artifacts in IndexedDB** (extension-only) - works but lost on browser data clear
3. **Don't persist artifacts** - they render from the SSE stream during the session, lost on refresh
4. **Forward to claude.ai** - not possible, there's no API to upload arbitrary artifacts

For a minimum viable product, option 3 (ephemeral artifacts) is acceptable initially.

---

## 9. Final Architecture Recommendation

### Phase 1: Extension-only (no proxy server)

- Client-side plan spoofing (already done)
- Redirect completion/retry_completion directly to LiteLLM from inject.js
- Accept that history is ephemeral (reset on page refresh)
- Zero server infrastructure needed

### Phase 2: Add thin persistence layer

- Small proxy that only handles: completion, retry_completion, conversation GET (merge)
- Everything else still goes to claude.ai
- Messages persist across refreshes

### Phase 3: Full feature parity (current approach)

- Own all conversation data, artifacts, memory in proxy
- Most complete but most complex
