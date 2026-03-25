# Claude.ai Live Network Traffic Capture

**Date**: 2026-03-23 (14:06-14:10 UTC)
**Method**: Playwright browser automation, unauthenticated session
**Browser**: Chromium (headless)

---

## 1. PAGE LOAD SEQUENCE (https://claude.ai/)

The initial navigation to `https://claude.ai/` triggers a redirect chain:
1. `GET https://claude.ai/` -> 200 (serves SPA shell)
2. App JS bootstraps, attempts authenticated endpoints -> all 403
3. Redirect to `https://claude.ai/logout?returnTo=%2Flogin%3FreturnTo%3D%252Fnew`
4. `POST /api/auth/logout` -> clears cookies
5. Final redirect to `https://claude.ai/login?returnTo=%2Fnew`

---

## 2. STATIC ASSETS (All 200 OK)

### JS Bundles (from assets-proxy.anthropic.com)
```
GET https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/index-DcrCrePJ.js      (main app)
GET https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/vendor-Vyn28asx.js     (vendor/react-query)
GET https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/tree-sitter-CxtuNIRw.js
GET https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/cfad58de7-DEi8FCEk.js  (error handler)
GET https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/cf0bcab69-DC96zbsx.js
GET https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/cce790aee-Bn5Xu6xF.js
GET https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c1fe5bf92-LpRGP1Cf.js
GET https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c7a51f85b-BsrpGreO.js
... (30+ more code-split chunks)
```

### CSS
```
GET https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c6a992d55-MdCYKnmO.css  (main)
GET https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/cfcbb3627-CE4NsOix.css
GET https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c6a9356e8-C5vT29Ee.css
GET https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/ce70e73dc-CpTxwkEo.css
```

### Fonts
```
GET https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/cc27851ad-CFxw3nG7.woff2
GET https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c66fc489e-C-BHYa_K.woff2
```

### Images
```
GET https://claude.ai/images/icon-512x512.png
GET https://claude.ai/images/icons/messages-app.svg
GET https://claude.ai/images/icons/notes-app.svg
GET https://claude.ai/images/icons/chrome-app.svg
```

---

## 3. API ENDPOINTS - SUCCESSFUL (200 OK)

### 3.1 GET /api/bootstrap (UNAUTHENTICATED)

**URL**: `https://claude.ai/api/bootstrap?statsig_hashing_algorithm=djb2&growthbook_format=sdk&include_system_prompts=false`
**Status**: 200
**Response Headers**:
```
content-type: application/json
cache-control: no-store, no-cache, must-revalidate
pragma: no-cache
request-id: req_011CZL9BYad8GCSHm5PBY4xv
strict-transport-security: max-age=31536000; includeSubDomains; preload
x-envoy-upstream-service-time: 15
cf-cache-status: DYNAMIC
server: cloudflare
```
**Response Body (5158 bytes, structured)**:
```json
{
  "account": null,
  "statsig": {"user": {}, "values": {}, "values_hash": ""},
  "growthbook": {
    "features": {
      // 57 feature flags, all with numeric DJB2-hashed keys
      // Examples:
      "3070110303": {"defaultValue": true, "rules": [{"id": "...", "force": true}]},
      "3572434512": {"defaultValue": "control"},
      "2804326784": {"defaultValue": false},
      "1644553577": {"defaultValue": {"variant": "control"}, "rules": [...]},
      "3934738808": {"defaultValue": {"integrity": "sha384-..."}},
      "3982885328": {"defaultValue": {"features": [], "keep_reading_from_statsig": [
        "___these_configs_are_bens__",
        "claude_code_sonnet_1m_access_not_as_default",
        "claude_code_sonnet_1m_access"
      ]}}
    }
  },
  "intercom_account_hash": null,
  "locale": null,
  "system_prompts": null
}
```

### 3.2 GET /api/bootstrap WITH system_prompts=true

**URL**: `https://claude.ai/api/bootstrap?statsig_hashing_algorithm=djb2&growthbook_format=sdk&include_system_prompts=true`
**Status**: 200
**Response size**: 48,633 bytes
**Key difference**: `system_prompts` field is populated:
```json
{
  "system_prompts": {
    "cowork_system_prompt": {
      "value": {
        "prompt": "<application_details>\nClaude is powering Cowork mode..."
      }
    }
  }
}
```
The cowork system prompt is **43,454 characters** long and describes Claude's behavior in Cowork mode.
Only `cowork_system_prompt` key present (no chat system prompt for unauthenticated users).

### 3.3 GET /api/bootstrap/{orgId}/app_start (AUTHENTICATED ONLY)

**URL**: `https://claude.ai/api/bootstrap/1244148e-cbc0-4834-8ee8-d8c800cdeb64/app_start?statsig_hashing_algorithm=djb2&growthbook_format=sdk&include_system_prompts=false`
**Status**: 403
**Response**:
```json
{
  "type": "error",
  "error": {
    "type": "permission_error",
    "message": "Invalid authorization",
    "details": {
      "error_visibility": "user_facing",
      "error_code": "account_session_invalid"
    }
  },
  "request_id": "req_011CZL9DS9UcAWAs1J4B6Wxi"
}
```
**NOTE**: When authenticated, this endpoint returns the FULL bootstrap with:
- `account` (user details, memberships, organizations)
- `statsig` (populated values)
- `growthbook` (user-specific features with org attributes like isPro, isMax, orgType)
- `org_statsig` / `org_growthbook` (org-level feature flags)
- `models` (available models array)
- `system_prompts` (if include_system_prompts=true)

### 3.4 POST /api/event_logging/batch

**Status**: 200 (works even unauthenticated)
**Request Body**: `{"events": []}`
**Response**:
```json
{"accepted_count": 0, "rejected_count": 0}
```

### 3.5 POST /api/auth/logout

**Status**: 200
**Response Headers** (CRITICAL - reveals cookie structure):
```
set-cookie: sessionKey=""; Domain=.claude.ai; expires=Mon, 23 Mar 2026 14:08:45 GMT; HttpOnly; Max-Age=0; Path=/; SameSite=lax; Secure
set-cookie: routingHint=""; Domain=.claude.ai; expires=Mon, 23 Mar 2026 14:08:45 GMT; HttpOnly; Max-Age=0; Path=/; SameSite=lax; Secure
set-cookie: ant_cinnamon_telescope=""; Domain=.claude.ai; expires=Mon, 23 Mar 2026 14:08:45 GMT; Max-Age=0; Path=/; SameSite=lax; Secure
clear-site-data: "storage"
```
**Response Body**:
```json
{"success": true}
```
**COOKIE NAMES CONFIRMED**:
- `sessionKey` - HttpOnly, Secure, SameSite=lax (the main auth cookie)
- `routingHint` - HttpOnly, Secure, SameSite=lax (server routing)
- `ant_cinnamon_telescope` - NOT HttpOnly, SameSite=lax (analytics/tracking)

### 3.6 GET /manifest.json

**Status**: 200
```json
{
  "background_color": "hsl(49 26.8% 92%)",
  "display": "standalone",
  "scope": "/",
  "start_url": "/",
  "name": "Claude",
  "short_name": "Claude",
  "icons": [{"src": "/images/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"}],
  "prefer_related_applications": true,
  "related_applications": [
    {"platform": "play", "url": "https://play.google.com/store/apps/details?id=com.anthropic.claude", "id": "com.anthropic.claude"}
  ]
}
```

### 3.7 GET /i18n/en-US.json

**Status**: 200
**Size**: Large (thousands of translation keys)
**Format**: Key-value pairs where keys are hashed/obfuscated:
```json
{
  "+09/bm5myh": "Our goal is to explore safe ways for AI to browse the web...",
  "+0AXIvgEHO": "Your organization admin has disabled connectors in artifacts...",
  "+0X5KLGaKQ": "Scanning...",
  "+0zv6gS/c6": "Image",
  ...
}
```

### 3.8 GET /i18n/statsig/en-US.json

**Status**: 200
**Content**: Statsig-gated UI strings (model descriptions, feature names):
```json
{
  "29OLd9bgWw": "Opus consumes usage limits faster than other models",
  "2EcGZn58SU": "Auto thinking",
  "2qTZeZCPue": "Analysis tool",
  "4EGZ/Kv9qH": "Most efficient for everyday tasks",
  "4N8a6wReLf": "Best for math and coding challenges",
  "6eNkKSj+Er": "Web search",
  "LCyVJcnXTZ": "Most capable for ambitious work",
  "LLkBR5Rpsh": "Our most intelligent model yet",
  "NKydG2KArY": "Extended",
  "QkNDqvZCYS": "Shorter responses & more messages",
  "aWuhH8qI9/": "Think longer for complex tasks",
  "eAZhflTduv": "Match thinking to complexity",
  "eO5C3Mq8nt": "Concise",
  "h4X9VkqTuo": "Normal",
  "mkLHEA8zIR": "Explanatory",
  "n6XZvuhMVT": "Fastest for quick answers",
  ...
}
```

### 3.9 GET /web-api/gated-messages

**URL**: `https://claude.ai/web-api/gated-messages?locale=en-US`
**Status**: 200
```json
{"messages": {}, "gates": [], "locale": "en-US"}
```

### 3.10 GET https://api.anthropic.com/mcp-registry/v0/servers

**URL**: `https://api.anthropic.com/mcp-registry/v0/servers?version=latest&limit=100&visibility=commercial%2Cgsuite`
**Status**: 200 (publicly accessible!)
**Response**: Array of MCP server definitions including:
```json
{
  "servers": [
    {
      "server": {
        "name": "com.claude.mcp.gmail/gmail",
        "version": "1.0.0",
        "title": "Gmail",
        "remotes": [{"type": "streamable-http", "url": "https://gmail.mcp.claude.com/mcp"}]
      },
      "_meta": {
        "com.anthropic.api/mcp-registry": {
          "uuid": "a02abd88-db7c-41ce-aa85-2d2804c64897",
          "type": "remote",
          "toolNames": ["create_draft", "get_profile", "list_drafts", "read_message", "read_thread", "search_messages"],
          "iconUrl": "https://t0.gstatic.com/faviconV2?...",
          "worksWith": ["claude", "claude-api", "claude-code"],
          "visibility": ["gsuite", "commercial"]
        }
      }
    },
    {
      "server": {
        "name": "com.claude.mcp.gcal/google-calendar",
        "version": "1.0.0",
        "title": "Google Calendar"
      }
    }
    // ... more servers
  ]
}
```

---

## 4. API ENDPOINTS - AUTHENTICATED ONLY (All 403)

All return the same error shape:
```json
{
  "type": "error",
  "error": {
    "type": "permission_error",
    "message": "Invalid authorization",
    "details": {
      "error_visibility": "user_facing",
      "error_code": "account_session_invalid"
    }
  },
  "request_id": "req_..."
}
```

### 4.1 Account & Profile
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/account_profile` | 403 |
| PATCH | `/api/account/settings` | 403 |

### 4.2 Organization-scoped (all under `/api/organizations/{orgId}/`)
| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/chat_conversations_v2?limit=30&starred=false&consistency=eventual` | 403 | Main conversation list |
| GET | `/chat_conversations_v2?limit=30&starred=true&consistency=eventual` | 403 | Starred conversations |
| POST | `/chat_conversations` | 403 | Create conversation |
| POST | `/chat_conversations/{id}/completion` | 403 | Send message / get completion |
| GET | `/subscription_details` | 403 | Plan info |
| GET | `/model_configs/claude-sonnet-4-6` | 403 | Model config |
| GET | `/projects?include_harmony_projects=true&limit=30&starred=true` | 403 | Starred projects |
| GET | `/projects?include_harmony_projects=true&limit=30&order_by=latest_chat` | 403 | Recent projects |
| GET | `/projects?include_harmony_projects=true&limit=200&creator_filter=is_creator` | 403 | My projects |
| GET | `/projects?include_harmony_projects=true&limit=200&creator_filter=is_not_creator` | 403 | Others' projects |
| GET | `/list_styles` | 403 | Response styles |
| GET | `/skills/list-skills` | 403 | Available skills |
| GET | `/cowork_settings` | 403 | Cowork config |
| GET | `/sync/settings` | 403 | Sync settings |
| GET | `/sync/mcp/drive/auth` | 403 | Google Drive MCP auth |
| GET | `/sync/gmail/auth` | 403 | Gmail auth status |
| GET | `/sync/gcal/auth` | 403 | Google Calendar auth |
| GET | `/sync/ingestion/gdrive/progress` | 403 | Drive ingestion progress |
| GET | `/experiences/claude_web?locale=en-US` | 403 | Experience config |
| GET | `/trial_status` | 403 | Trial info |
| GET | `/overage_spend_limit` | 403 | Spend limits |
| GET | `/notification/preferences` | 403 | Notification prefs |
| GET | `/referral/eligibility?campaign=claude_code_guest_pass&source=cowork` | 403 | Referral eligibility |
| GET | `/prepaid/credits` | 403 | Prepaid credit balance |
| GET | `/marketplaces/list-default-marketplaces` | 403 | MCP marketplaces |

### 4.3 DXT Extensions (401 instead of 403!)
| Method | Endpoint | Status | Error Type |
|--------|----------|--------|------------|
| GET | `/dxt/extensions` | **401** | `authentication_error` |
| GET | `/dxt/installable_extensions` | **401** | `authentication_error` |

**DXT 401 response**:
```json
{
  "type": "error",
  "error": {
    "type": "authentication_error",
    "message": "Authentication required",
    "details": {"error_visibility": "user_facing"}
  }
}
```
Note: DXT endpoints use 401 (authentication_error) while all others use 403 (permission_error). This suggests DXT is a separate service with different auth middleware.

### 4.4 Discoverable Organizations
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/organizations/discoverable` | 403 |

---

## 5. THIRD-PARTY SERVICES

### 5.1 Analytics / Tracking
```
GET  https://s-cdn.anthropic.com/s.js                         -> 200  (Segment analytics)
GET  https://a-cdn.anthropic.com/v1/projects/LKJN8LsLERHEOXkw487o7qCTFOrGPimI/settings -> 200
GET  https://a-cdn.anthropic.com/analytics.js/v1/.../analytics.min.js -> 200
POST https://a-api.anthropic.com/v1/i                         -> 200  (identify)
POST https://a-api.anthropic.com/v1/t                         -> 200  (track)
POST https://a-api.anthropic.com/v1/p                         -> 200  (page)
```

### 5.2 Google / Facebook Tracking
```
GET  https://www.googletagmanager.com/gtag/js?id=AW-16632748715
GET  https://www.googletagmanager.com/gtag/js?id=DC-15684265
POST https://www.google.com/ccm/collect?...
GET  https://connect.facebook.net/en_US/fbevents.js
```

### 5.3 Intercom
```
GET  https://widget.intercom.io/widget/lupk8zyo              -> 200
GET  https://js.intercomcdn.com/frame-modern.c6941a28.js      -> 200
POST https://api-iam.intercom.io/messenger/web/launcher_settings -> FAILED (net::ERR_NETWORK_CHANGED)
```
App ID: `lupk8zyo`

### 5.4 Cloudflare Turnstile/Challenge
```
GET  https://claude.ai/cdn-cgi/challenge-platform/scripts/jsd/main.js
POST https://claude.ai/cdn-cgi/challenge-platform/h/g/jsd/oneshot/ea2d291c0fdc/...
GET  https://a.claude.ai/isolated-segment.html?v=dbd8ed0f31   -> 200  (challenge iframe)
```

### 5.5 Datadog RUM
Console log: `[O11Y] [DatadogRUM] Initialized {service: claude-ai}`

### 5.6 Google Sign-In (GSI)
```
GET  https://accounts.google.com/gsi/client
```
Uses FedCM API for login flow.

---

## 6. RESPONSE HEADERS OF NOTE

All claude.ai API responses include:
```
strict-transport-security: max-age=31536000; includeSubDomains; preload
x-robots-tag: none
server: cloudflare
cf-cache-status: DYNAMIC
request-id: req_...  (Anthropic request ID format)
x-envoy-upstream-service-time: <ms>  (reveals Envoy proxy)
```

Error responses also include:
```
x-should-retry: false
```

Permissions-Policy headers include non-standard features:
```
bluetooth (unrecognized by Chrome)
web-share (unrecognized by Chrome)
```

---

## 7. ORG ID DISCOVERY

The org ID `1244148e-cbc0-4834-8ee8-d8c800cdeb64` appears in URLs even when unauthenticated.
This is likely a cached/stale org UUID from a previous session stored in the SPA's client-side state.
The app eagerly fires all org-scoped requests using whatever orgId it has cached.

---

## 8. PROXY SERVER (proxy-ns-0ffzk4u2.usw-1.sealos.app)

### 8.1 Health Check
**URL**: `GET https://proxy-ns-0ffzk4u2.usw-1.sealos.app/health`
**Status**: 200
**Response Headers**:
```
ratelimit-policy: 120;w=60
ratelimit-limit: 120
ratelimit-remaining: 119
ratelimit-reset: 60
access-control-allow-methods: GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD
access-control-allow-headers: Content-Type, Authorization, X-Forward-Cookie, X-LiteLLM-Endpoint, X-LiteLLM-Key
access-control-max-age: 86400
content-type: application/json; charset=utf-8
server: istio-envoy
```
**Response Body**:
```json
{"ok": true}
```

### 8.2 /api/* passthrough -> Cloudflare blocked
All `/api/*` routes on the proxy attempt to forward to `https://claude.ai` but get blocked by Cloudflare challenge:
```
GET https://proxy-ns-0ffzk4u2.usw-1.sealos.app/api/bootstrap?... -> 403 (Cloudflare challenge HTML)
GET https://proxy-ns-0ffzk4u2.usw-1.sealos.app/api/organizations -> 403 (Cloudflare challenge HTML)
```
The 403 body is Cloudflare's "Just a moment..." challenge page HTML, NOT the claude.ai API error.

### 8.3 Non-existent routes
```
GET  /                      -> 404 "Cannot GET /"
POST /v1/chat/completions   -> 404 "Cannot POST /v1/chat/completions"
GET  /v1/models             -> 404 "Cannot GET /v1/models"
```

### 8.4 Proxy Route Summary (from code analysis)
The proxy defines these routes:
```
GET  /health                                        -> {"ok": true}
GET  /api/account                                   -> Patched upstream JSON (adds capabilities)
GET  /api/bootstrap/:id/app_start                   -> Patched upstream JSON (adds Max features)
POST /api/organizations/:orgId/chat_conversations    -> Local DB (creates conversation)
PUT  /api/organizations/:orgId/chat_conversations/:id -> Local DB (updates conversation)
POST /api/organizations/:orgId/chat_conversations/:id/title -> Local DB
GET  /api/organizations/:orgId/chat_conversations/:id -> Local DB (with ?tree=True support)
POST /api/organizations/:orgId/chat_conversations/:id/completion -> LiteLLM proxy
POST /api/organizations/:orgId/chat_conversations/:id/retry_completion -> LiteLLM proxy
GET  /api/organizations/:orgId/memory               -> Local DB
GET  /api/organizations/:orgId/subscription_details  -> Static {"plan_type": "claude_max"}
GET  /wiggle/download-file                          -> Local DB (artifact content)
GET  /artifacts/wiggle_artifact/:id/tools            -> Static {"tools": []}
GET  /api/organizations/:orgId/artifacts/:id/versions -> Local DB
GET  /api/*                                         -> Passthrough to claude.ai (catch-all)
```

---

## 9. BOOTSTRAP PATCHING (Proxy vs Claude.ai)

The proxy modifies the bootstrap response:

### Organization Patches:
```js
billing_type: 'stripe'
rate_limit_tier: 'default_claude_max_20x'
free_credits_status: null
api_disabled_reason: null
capabilities: [...existing, 'claude_pro', 'claude_max']
```

### Model Patches:
- All models get `inactive: false`
- Ensures these models exist: claude-sonnet-4-5-20250929, claude-opus-4-6, claude-haiku-4-5-20251001
- All models get `minimum_tier: 'free'`

### GrowthBook/Statsig Patches:
```js
growthbook.attributes.isPro = true
growthbook.attributes.isMax = true
org_growthbook.user.orgType = 'claude_max'
org_growthbook.user.isPro = true
org_growthbook.user.isMax = true
org_statsig.user.orgType = 'claude_max'
org_statsig.user.isPro = true
org_statsig.user.isMax = true
```

---

## 10. ENDPOINT COMPARISON: Claude.ai vs Proxy

| Endpoint | Claude.ai (unauth) | Proxy |
|----------|-------------------|-------|
| GET /health | N/A | 200 `{"ok":true}` |
| GET /api/bootstrap (unauth) | 200 (growthbook features) | Cloudflare 403 (can't pass challenge) |
| GET /api/bootstrap/:id/app_start | 403 (needs auth) | Cloudflare 403 (even with auth, CF blocks) |
| GET /api/account_profile | 403 | Cloudflare 403 |
| GET /api/organizations/:id/subscription_details | 403 | 200 `{"plan_type":"claude_max"}` (static mock) |
| POST /api/organizations/:id/chat_conversations | 403 | 200 (local DB) |
| GET /api/organizations/:id/chat_conversations/:id | 403 | 200 (local DB) |
| POST .../completion | 403 | Routes to LiteLLM |

**KEY FINDING**: The proxy is blocked by Cloudflare's challenge when making server-to-server requests to claude.ai. This means the passthrough and bootstrap-patching routes fail in production. Only locally-handled routes (conversations, memory, artifacts, subscription_details) actually work.

---

## 11. REQUEST FLOW ON PAGE LOAD (ORDERED)

1. `GET /` -> HTML shell (200)
2. Static assets load (JS bundles, CSS, fonts)
3. `GET /cdn-cgi/challenge-platform/scripts/jsd/main.js` -> Cloudflare challenge
4. `GET /manifest.json` -> PWA manifest (200)
5. `GET /i18n/en-US.json` -> Translations (200)
6. `GET /i18n/statsig/en-US.json` -> Feature-gated translations (200)
7. `GET /web-api/gated-messages?locale=en-US` -> Empty gates (200)
8. `GET /api/bootstrap/{orgId}/app_start?...` -> 403 (needs auth)
9. **PARALLEL BURST** - all these fire simultaneously:
   - `GET /api/organizations/{orgId}/chat_conversations_v2?limit=30&starred=false`
   - `GET /api/organizations/{orgId}/chat_conversations_v2?limit=30&starred=true`
   - `GET /api/organizations/{orgId}/projects?...&starred=true`
   - `GET /api/organizations/{orgId}/projects?...&order_by=latest_chat`
   - `GET /api/organizations/{orgId}/projects?...&creator_filter=is_creator`
   - `GET /api/organizations/{orgId}/projects?...&creator_filter=is_not_creator`
   - `GET /api/organizations/{orgId}/subscription_details`
   - `GET /api/organizations/{orgId}/model_configs/claude-sonnet-4-6`
   - `GET /api/organizations/{orgId}/cowork_settings`
   - `GET /api/organizations/{orgId}/sync/settings`
   - `GET /api/organizations/{orgId}/sync/mcp/drive/auth`
   - `GET /api/organizations/{orgId}/sync/gmail/auth`
   - `GET /api/organizations/{orgId}/sync/gcal/auth`
   - `GET /api/organizations/{orgId}/sync/ingestion/gdrive/progress`
   - `GET /api/organizations/{orgId}/experiences/claude_web?locale=en-US`
   - `GET /api/organizations/{orgId}/trial_status`
   - `GET /api/organizations/{orgId}/overage_spend_limit`
   - `GET /api/organizations/{orgId}/notification/preferences`
   - `GET /api/organizations/{orgId}/dxt/extensions`
   - `GET /api/organizations/{orgId}/dxt/installable_extensions`
   - `GET /api/organizations/{orgId}/prepaid/credits`
   - `GET /api/organizations/{orgId}/list_styles`
   - `GET /api/organizations/{orgId}/skills/list-skills`
   - `GET /api/organizations/{orgId}/referral/eligibility?campaign=claude_code_guest_pass&source=cowork`
   - `GET /api/organizations/{orgId}/marketplaces/list-default-marketplaces`
   - `GET /api/account_profile`
   - `PATCH /api/account/settings`
   - `GET /api/organizations/discoverable`
10. `GET https://api.anthropic.com/mcp-registry/v0/servers?...` -> MCP registry (200)
11. Fallback: `GET /api/bootstrap?...` (without orgId) -> 200 (limited bootstrap)
12. `POST /api/event_logging/batch` -> 200
13. `POST /api/auth/logout` -> 200 (clears cookies)
14. Analytics/tracking beacons fire

---

## 12. REACT QUERY CACHE KEYS (from console errors)

```
["chat_conversation_list", {"orgUuid": "{orgId}"}, {"limit": 30, "starred": false}]
["chat_conversation_list", {"orgUuid": "{orgId}"}, {"limit": 30, "starred": true}]
```
React Query client is used for all API data fetching.
Error: "Eager bootstrap returned no data (logged out)" - shows the app tries an eager bootstrap fetch.

---

## 13. NEWLY DISCOVERED ENDPOINTS (NOT IN PROXY)

These endpoints are called by the live claude.ai app but NOT handled by the proxy server:

1. `GET /api/organizations/{orgId}/model_configs/{model}` - Model-specific configuration
2. `GET /api/organizations/{orgId}/cowork_settings` - Cowork mode settings
3. `GET /api/organizations/{orgId}/sync/settings` - Sync configuration
4. `GET /api/organizations/{orgId}/sync/mcp/drive/auth` - Google Drive MCP auth
5. `GET /api/organizations/{orgId}/sync/gmail/auth` - Gmail integration auth
6. `GET /api/organizations/{orgId}/sync/gcal/auth` - Calendar integration auth
7. `GET /api/organizations/{orgId}/sync/ingestion/gdrive/progress` - Drive ingestion
8. `GET /api/organizations/{orgId}/experiences/claude_web?locale=en-US` - Experience config
9. `GET /api/organizations/{orgId}/trial_status` - Trial info
10. `GET /api/organizations/{orgId}/overage_spend_limit` - Spend limits
11. `GET /api/organizations/{orgId}/notification/preferences` - Notifications
12. `GET /api/organizations/{orgId}/dxt/extensions` - Installed DXT extensions
13. `GET /api/organizations/{orgId}/dxt/installable_extensions` - Available DXT extensions
14. `GET /api/organizations/{orgId}/prepaid/credits` - Prepaid credit balance
15. `GET /api/organizations/{orgId}/list_styles` - Response style options
16. `GET /api/organizations/{orgId}/skills/list-skills` - Available skills
17. `GET /api/organizations/{orgId}/referral/eligibility` - Referral program
18. `GET /api/organizations/{orgId}/marketplaces/list-default-marketplaces` - MCP marketplaces
19. `GET /api/organizations/{orgId}/projects?...` - Projects (multiple variants)
20. `GET /api/organizations/discoverable` - Discoverable orgs
21. `GET /api/account_profile` - User profile
22. `PATCH /api/account/settings` - Update settings
23. `POST /api/event_logging/batch` - Event logging
24. `POST /api/auth/logout` - Logout
25. `GET /api/bootstrap` (no orgId) - Unauthenticated bootstrap

Note: The proxy DOES handle these via its catch-all `/api/*` passthrough, but Cloudflare blocks server-to-server requests, so they fail in practice.

---

## 14. AUTHENTICATION MECHANISM

**Cookie-based authentication**:
- Primary auth: `sessionKey` cookie (HttpOnly, Secure, SameSite=lax, Domain=.claude.ai)
- Routing: `routingHint` cookie (same flags)
- Tracking: `ant_cinnamon_telescope` cookie (NOT HttpOnly - accessible to JS)

**The proxy uses `X-Forward-Cookie` header** to carry the cookie value from the extension to the server. The extension extracts `document.cookie` (which can only see `ant_cinnamon_telescope`) and the HttpOnly cookies are forwarded via a different mechanism.

**Auth flow on logout**:
1. `POST /api/auth/logout`
2. Response sets all three cookies to empty with Max-Age=0
3. Response includes `Clear-Site-Data: "storage"` header

---

## 15. DATADOG / OBSERVABILITY

Console reveals: `[O11Y] [DatadogRUM] Initialized {service: claude-ai}`
This means Datadog Real User Monitoring is active, tracking frontend performance.

---

## 16. CLOUDFLARE CONFIGURATION

- Challenge platform version: `ea2d291c0fdc`
- Uses "oneshot" challenges (not interactive)
- `a.claude.ai` subdomain used for isolated challenge segments
- CF-Ray IDs confirm routing through Cloudflare CDN (DAC PoP = Dhaka)

---

## SUMMARY OF KEY FINDINGS

1. **Bootstrap has two forms**: Unauthenticated (`/api/bootstrap`) returns limited growthbook features. Authenticated (`/api/bootstrap/{orgId}/app_start`) returns everything including account, models, org config.

2. **System prompts are served from bootstrap** when `include_system_prompts=true` - even without auth! Currently returns `cowork_system_prompt` (43KB).

3. **Cookie names confirmed**: `sessionKey`, `routingHint`, `ant_cinnamon_telescope`.

4. **30+ API endpoints** are called on page load in a parallel burst.

5. **The proxy is Cloudflare-blocked** - server-to-server requests to claude.ai get challenge pages instead of JSON responses. Only locally-handled routes work.

6. **DXT endpoints use different auth** (401 authentication_error vs 403 permission_error).

7. **MCP registry is public** at `api.anthropic.com/mcp-registry/v0/servers`.

8. **New model reference**: `claude-sonnet-4-6` appears in model_configs endpoint.

9. **React Query** is used as the data layer, with structured cache keys.

10. **57 GrowthBook feature flags** are served to unauthenticated users (DJB2-hashed keys).
