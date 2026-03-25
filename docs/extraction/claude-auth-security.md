# Claude.ai Frontend Security & Authentication Deep-Dive

**Bundle analyzed:** `index-DcrCrePJ.js` (7.2 MB, minified Vite bundle)
**Date:** 2026-03-22

---

## 1. Authentication Flow

### 1.1 Login Methods

The app supports three login flows, all converging through `/api/auth/` endpoints:

#### Magic Link (email)
```
POST /api/auth/send_magic_link
  body: { email_address, source: "claude" }
  -> returns { sso_url? }  (if enterprise SSO required, redirects)

POST /api/auth/verify_magic_link
  body: { credentials: { method: "magic_link" | "code", email_address, ... }, source: "claude" }
  -> returns { success: bool, sso_url?, sso_required?, created?: bool, account? }
```

The "code" method is a 6-digit email OTP. The "magic_link" method sends a clickable link.
Event tracking keys confirm both paths:
- `login.email.sending_magic_link`
- `login.email.verifying_code` / `login.email.verifying_magic_link`
- `login.email.code_verification_error`
- `login.email.magic_link_success` / `login.email.finished`

#### Nonce Exchange (for desktop app / browser extension / OAuth)
```
POST /api/auth/exchange_nonce_for_code
  body: { source: "claude" }
```
Used by desktop app and browser extension auth flows (PKCE-based).

PKCE code challenge generation:
```js
code_challenge: await (async function(e) {
  const t = await (await globalThis.crypto).subtle.digest("SHA-256", (new TextEncoder).encode(e));
  // ... base64url encode
})
```

#### Google OAuth
```
POST /api/auth/verify_google
  body: { oauth_client_id, source: "claude" }
  -> returns { success, sso_url?, sso_required?, created?, account? }

POST /api/auth/verify_google_mobile   // Google One Tap flow
  body: { oauth_client_id, source: "claude" }
```

Google OAuth Client ID: `1062961139910-l2m55cb9h51u5cuc9c56eb3fevouidh9.apps.googleusercontent.com`

OAuth client slug mapping (oZ):
```js
{
  "6a09bcbe-a58a-40ea-b2f9-8bbbd303ba38": "sheet_agent",
  "966eba67-8b8c-4eae-bbb3-08361d1b9292": "sheet_agent",
  "54511e87-7abf-4923-9d84-d6f24532e871": "claude-browser-use",
  "dae2cad8-15c5-43d2-9046-fcaecc135fa4": "claude-browser-use"
}
```

#### Enterprise SSO
```
GET  /api/enterprise_auth/idp_redirect_url?organization_id={orgId}
GET  /api/enterprise_auth/sso_callback?code={code}&state={state}&source={source}
GET  /api/auth/login_methods?email={email}&source={source}
```

If `login_methods` returns an `sso_url`, the user is redirected to their SSO IdP.
The SSO state is stored in cookie `Io.SSO_STATE = "ssoState"`.

The SSO callback page is `/sso-callback`. Routes excluded from auth checks:
```js
const Ao = ["/login", "/logout", "/magic-link", "/sso-callback", "/connect"]
```

#### Invite Acceptance
```
POST /api/auth/accept_invite
  body: { email_address, source: "claude" }
  -> returns { success, sso_url? }
```

### 1.2 Logout

```
POST /api/auth/logout          // single session
POST /api/auth/logout/all-sessions  // all sessions
```

### 1.3 Session Invalidation Redirect

On API error, if the response has `type: "permission_error"` and `errorCode: "account_session_invalid"`:
```js
if ("permission_error" === t.type && "account_session_invalid" === t.errorCode) {
  const e = window.location.pathname;
  // Skip if already on auth pages
  if (Ao.some(t => e.startsWith(t))) return;
  const t = `${e}${window.location.search}`;
  n = `/login?returnTo=${encodeURIComponent(t)}`;
  window.location.href = `/logout?returnTo=${encodeURIComponent(n)}`;
}
```
This chains: current page -> logout -> login with returnTo.

### 1.4 Login Success Handler (cZ)
```js
function cZ(e, t, n, s, a, r) {
  e.created && t({
    event_key: "login.account.created",
    surface: a,         // "claude" or application type
    authMethod: n,      // "email" or "google"
    flow: s,            // "magic_link", "code", "button", "onetap"
    oauth_client_slug: lZ(r)
  }, e.account)
}
```

---

## 2. Cookie Usage

### 2.1 Cookie Utility Layer (kd)

The app uses a custom cookie abstraction `kd` (not raw `document.cookie`):

```js
const kd = {
  get: (name) => {
    // splits document.cookie on ";", finds matching name, returns decodeURIComponent(value)
  },
  set: (name, value, opts = {}) => {
    const parts = [
      `${name}=${encodeURIComponent(value)}`,
      `max-age=${opts.maxAgeSeconds ?? 31536000}`,  // default: 1 year
      "samesite=lax",
      "secure",
      "path=/"
    ];
    const domain = vd(window.location.hostname);
    if (domain) parts.push(`domain=${domain}`);
    document.cookie = parts.join("; ");
  },
  delete: (name) => {
    // sets expires to epoch ("Thu, 01 Jan 1970 00:00:01 GMT")
    // deletes on current domain AND all parent domain variants
    const parts = [`${name}=[removed]`, `expires=${wd}`, "samesite=lax", "secure", "path=/"];
    // also iterates _d() subdomain variants to clear
  }
};
```

**Default cookie attributes for ALL app-set cookies:**
- `SameSite=Lax`
- `Secure`
- `Path=/`
- `Max-Age=31536000` (1 year, unless overridden)

### 2.2 Domain Resolution (vd)

```js
function vd(hostname) {
  if (hostname.endsWith(".anthropic.com")) return ".anthropic.com";
  if (hostname === "claude.ai" || hostname.endsWith(".claude.ai")) return ".claude.ai";
  if (hostname === "claude.com" || hostname.endsWith(".claude.com")) return ".claude.com";
  if (hostname.endsWith(".fedstart.com")) return "." + hostname;
  return undefined;
}
```

Cookies are scoped to the appropriate root domain.

### 2.3 Complete Cookie Name Registry (Io enum)

**Auth/Session cookies:**
| Constant | Cookie Name | Purpose |
|----------|-------------|---------|
| `SESSION_KEY` | `sessionKey` | Primary session authentication |
| `PENDING_LOGIN` | `pendingLogin` | In-progress login state |
| `SSO_STATE` | `ssoState` | Enterprise SSO CSRF state |
| `LAST_ACTIVE_ORG` | `lastActiveOrg` | Last selected organization UUID |
| `RETURN_TO` | `return-to` | Post-login redirect target |
| `JOIN_TOKEN` | `join-token` | Org invite join token |
| `LEGAL_ACCEPTANCES` | `legal-acceptances` | Legal doc acceptance state |
| `AWS_SIGNUP_TOKEN` | `aws_signup_token` | AWS marketplace signup |
| `LTI_SESSION` | `lti_session` | LTI (Learning Tools Interoperability) session |
| `LTI_CANVAS_DOMAIN` | `lti_canvas_domain` | LTI Canvas domain |

**Analytics/Tracking cookies:**
| Constant | Cookie Name | Purpose |
|----------|-------------|---------|
| `SEGMENT_ANONYMOUS_ID` | `ajs_anonymous_id` | Segment anonymous ID |
| `ANALYTICS_SESSION_ID` | `analytics_session_id` | Analytics session tracking |
| `SEGMENT_CROSS_DOMAIN_ANONYMOUS_ID` | `_cross_domain_anonymous_id` | Cross-domain tracking |
| `DEVICE_ID_KEY` | `anthropic-device-id` | Persistent device fingerprint |
| `ACTIVITY_SESSION_ID` | `activitySessionId` | Activity session tracking |
| `CONSENT_PREFERENCES` | `anthropic-consent-preferences` | Cookie consent JSON |

**Marketing attribution cookies:**
| Constant | Cookie Name | Purpose |
|----------|-------------|---------|
| `FBCLID` | `_fbc` | Facebook click ID |
| `FBP` | `_fbp` | Facebook browser pixel (set with 2-year max-age: 63072000) |
| `GOOGLE_GCL_AW` | `_gcl_aw` | Google Ads click |
| `TTCLID` | `_ttclid` | TikTok click ID |
| `RDT_CID` | `_rdt_cid` | Reddit click ID |
| `PROMOTION` | `promo` | Promo code |

**UI preference cookies:**
| Constant | Cookie Name | Purpose |
|----------|-------------|---------|
| `COLOR_MODE` | `CH-prefers-color-scheme` | Dark/light mode |
| `SIDEBAR_PINNED` | `user-sidebar-pinned` | Sidebar pin state |
| `RECENTS_COLLAPSED` | `user-recents-collapsed` | Recent chats collapse |
| `LOCALE` | `locale` | User locale preference |
| `APP_SHELL_CTX` | `app-shell-ctx` | Desktop app shell context |
| `COUNTRY_OVERRIDE` | `country-override` | Country override for testing |
| *(many more UI state cookies)* | | |

### 2.4 Segment/Analytics Cookies (js-cookie v3.0.1)

Segment analytics uses its own cookie layer:
```js
cookie: { key: "ajs_user_id", oldKey: "ajs_user" }     // user identity
cookie: { key: "ajs_group_id" }                          // group identity
"ajs_anonymous_id"                                        // anonymous tracking
```

### 2.5 Consent-Gated Cookie Cleanup

When consent is revoked, the app actively deletes tracking cookies by category:

```js
const kb = {
  analytics: [
    "ajs_anonymous_id", "ajs_user_id", "ajs_group_id", "analytics_session_id",
    "_ga", "_gid", "_gat", /^_gat_gtag_UA_.*$/, /^_ga_.*$/, /^_dc_gtm_.*$/,
    "__utma", "__utmb", "__utmc", "__utmt", "__utmz", "__utmv",
    "_gaexp", "_gaexp_rc", "_opt_expid", "AMP_TOKEN", "FPID", "FPLC",
    "TESTCOOKIESENABLED", "li_giant", "ln_or", "oribi_cookie_test", "oribili_user_guid"
  ],
  marketing: [
    "_fbc", "_fbp", "__gads", "__gpi", "__gpi_optout", "__gsas",
    "_gcl_aw", "_gcl_dc", "_gcl_au", "_gcl_gb", "_gcl_gf", "_gcl_ha", "_gcl_gs", "_gcl_ag",
    /^_gac_.*$/, /^_gac_gb_.*$/,
    "GCL_AW_P", "GED_PLAYLIST_ACTIVITY", "ACLK_DATA", "FLC",
    "_opt_awcid", "_opt_awmid", "_opt_awgid", "_opt_awkid", "_opt_utmc",
    "FPAU", "FPGCLDC", "FPGCLAW", "FPGCLGB", "FPGSID", "FCCDCF", "FCNEC",
    "li_fat_id", "ar_debug", "_ttclid", "_rdt_uuid", "_rdt_cid"
  ]
};
```

---

## 3. CORS Behavior

### 3.1 Fetch Credential Mode

**ALL API calls use `credentials: "include"`:**

```js
// The central fetch wrapper ($h -> Gh):
return a.has("Content-Type") || s.body instanceof FormData || a.set("Content-Type", "application/json"),
  Vh(a, e, t),   // append common headers
  await fetch(n, { ...s, headers: a, credentials: "include" })
```

Every API call found in the bundle confirms this:
- Bootstrap: `credentials: "include"`
- Chat streaming: `credentials: "include"`
- File upload: `credentials: "include"`
- Event logging: `credentials: "include"`
- Analytics: `credentials: "include"`
- CCR sessions: `credentials: "include"`

**One exception** - External URL fetches (e.g., loading a user-provided prompt URL):
```js
credentials: "omit"  // for fetching external prompt URLs
```

### 3.2 CORS Implications

Since `credentials: "include"` is used, the server MUST respond with:
- `Access-Control-Allow-Origin: https://claude.ai` (NOT `*`)
- `Access-Control-Allow-Credentials: true`
- Appropriate `Access-Control-Allow-Headers` for custom headers

### 3.3 EventSource (SSE) for Streaming

For SSE connections (chat streaming), the app uses `@microsoft/fetch-event-source` or equivalent:
```js
const j = {
  "Content-Type": "application/json",
  accept: "text/event-stream",
  ...md(e),                          // anthropic-client-platform header
  ...k && {"anthropic-device-id": k}  // device ID if available
};
// ... with credentials: "include"
```

For gRPC streaming (mobile path):
```js
interceptors: [t => async n => (
  n.header.set("X-Organization-Id", e),
  await t(n)
)]
```

---

## 4. CSP (Content Security Policy)

### 4.1 Frontend CSP Handling

The bundle references CSP in the context of **MCP app sandboxing**, not the main page:

```js
Iq = z({
  connectDomains: re(se()).optional()
    .describe("Origins for network requests (fetch/XHR/WebSocket). Maps to CSP connect-src directive")
  // ... also media-src directive
})
```

MCP app sandbox iframes get CSP restrictions via the `sandbox` attribute and host-controlled CSP.

### 4.2 Nonce Handling

Nonces appear in two contexts:

**a) TipTap editor styles:**
```js
const s = document.createElement("style");
if (nonce) s.setAttribute("nonce", nonce);
// this.options.injectNonce
```

**b) Iframe parent-child communication (MCP apps / embed):**
```js
// URL parameter nonce for iframe message validation
this.expectedNonce = new URLSearchParams(window.location.search).get("nonce");

// On receiving PARENT_CAPABILITIES message:
if (this.expectedNonce && message.nonce !== this.expectedNonce) {
  Td.error(Ad.BOOTSTRAP, "Nonce validation failed - message nonce does not match URL nonce");
  return;
}
```

This is a **cross-origin message nonce**, not a CSP script nonce. It prevents rogue parent frames from injecting capabilities into embedded Claude views.

### 4.3 Iframe Sandboxing

Published artifacts / user content renderer uses strict sandboxing:
```js
sandbox="allow-scripts allow-same-origin"
referrerPolicy="no-referrer"
```

Sandbox proxy URL: `https://sandbox.claudemcpcontent.com/mcp_apps`

---

## 5. Request Headers the Frontend Sends

### 5.1 Common Headers (appended to EVERY API request via Vh)

```js
function Vh(headers, applicationType, cookies) {
  headers.append("anthropic-client-sha", globalThis.process?.env?.RELEASE_SHA ?? "unknown");
  headers.append("anthropic-client-version", globalThis.process?.env?.CLAUDE_AI_VERSION ?? "unknown");
  headers.append("anthropic-anonymous-id", qh.anonymousId);
  headers.append("anthropic-device-id", cookies.get(Io.DEVICE_ID_KEY) ?? "unknown");
  const sessionId = cookies.get(Io.ACTIVITY_SESSION_ID);
  if (sessionId) headers.append("x-activity-session-id", sessionId);
}
```

### 5.2 Platform Header (md function)

```js
md = (applicationType) => {
  let platform = cd.UNKNOWN; // "unknown"
  if (typeof window !== "undefined" && isDesktop(window.navigator.userAgent))
    platform = cd.DESKTOP_APP;      // "desktop_app"
  else if ("claude-dot" === applicationType)
    platform = cd.WEB_CLAUDE_AI;    // "web_claude_ai"
  else if ("console" === applicationType)
    platform = cd.WEB_CONSOLE;      // "web_console"
  else if ("custom-agents" === applicationType)
    platform = cd.WEB_CUSTOM_AGENTS; // "web_custom_agents"
  return { "anthropic-client-platform": platform };
};
```

### 5.3 Organization Header

```js
// On most API calls:
...Ky ? { "x-organization-uuid": Ky } : {}

// Ky is set from bootstrap response:
if (e.organization_uuid) Ky = e.organization_uuid;
```

### 5.4 Service Name Header (analytics)

```js
headers: {
  "Content-Type": "application/json",
  "x-service-name": "claude_ai_web",
  ...Ky ? { "x-organization-uuid": Ky } : {}
}
```

### 5.5 Chat Completion (streaming) Headers

```js
const headers = {
  "Content-Type": "application/json",
  accept: "text/event-stream",
  ...md(applicationType),              // "anthropic-client-platform"
  ...deviceId && { "anthropic-device-id": deviceId }
};
```

### 5.6 CCR / Sessions API Headers

```js
{
  "Content-Type": "application/json",
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "ccr-byoc-2025-07-29",
  "anthropic-client-feature": "ccr",
  ...orgUuid ? { "x-organization-uuid": orgUuid } : {}
}
```

Also seen: `"anthropic-beta": "ccr-triggers-2026-01-30"`

### 5.7 Artifact Headers

```js
"anthropic-artifact-entity-type": entityType,
"anthropic-artifact-id": artifact.uuid,
"anthropic-file-path": filePath
```

### 5.8 MCP Manifest Header

```js
headers: { "x-mcpb-manifest-version": "0.2" }
```

### 5.9 MCP Server ID Header

```js
headers: { "X-MCP-Server-ID": server.uuid }
```

### 5.10 Workspace Header

```js
...workspaceId ? { "x-workspace-id": workspaceId } : {}
```

### 5.11 gRPC Connect Header

```js
interceptors: [t => async n => (
  n.header.set("X-Organization-Id", orgUuid),
  await t(n)
)]
```

### 5.12 Complete Custom Header Summary

| Header | Value | Sent On |
|--------|-------|---------|
| `anthropic-client-sha` | Build SHA or "unknown" | All API requests |
| `anthropic-client-version` | App version or "unknown" | All API requests |
| `anthropic-anonymous-id` | Segment anonymous ID | All API requests |
| `anthropic-device-id` | Device UUID from cookie | All API requests + streaming |
| `anthropic-client-platform` | `web_claude_ai` / `desktop_app` / etc. | All API requests |
| `x-activity-session-id` | Activity session UUID | All API requests (if set) |
| `x-organization-uuid` | Org UUID | Most API requests |
| `x-service-name` | `"claude_ai_web"` | Event logging |
| `anthropic-version` | `"2023-06-01"` | CCR/Sessions API |
| `anthropic-beta` | `"ccr-byoc-2025-07-29"` | CCR/Sessions API |
| `anthropic-client-feature` | `"ccr"` or `"baku"` | CCR/Sessions API |
| `anthropic-artifact-entity-type` | Entity type string | Artifact operations |
| `anthropic-artifact-id` | Artifact UUID | Artifact operations |
| `anthropic-file-path` | File path string | File operations |
| `x-mcpb-manifest-version` | `"0.2"` | MCP bridge |
| `X-MCP-Server-ID` | Server UUID | MCP server calls |
| `x-workspace-id` | Workspace UUID | Workspace-scoped calls |
| `X-Organization-Id` | Org UUID | gRPC Connect calls |
| `Content-Type` | `application/json` | Most requests |
| `accept` | `text/event-stream` | SSE streaming |

---

## 6. Response Headers the Frontend Checks

### 6.1 Headers Read from Responses

```js
headers.get("cf-mitigated")       // Cloudflare challenge detection
headers.get("content-type")       // Response type checking (JSON vs SSE vs binary)
headers.get("Content-Disposition") // File download filename
headers.get("mcp-session-id")     // MCP session tracking
headers.get("WWW-Authenticate")   // OAuth challenge (MCP remote auth)
```

### 6.2 Blocked Response Headers (for MCP proxy)

Headers stripped from proxied responses to prevent leakage:
```js
Jyt = new Set(["set-cookie", "x-api-key", "x-auth-token", "authorization"])
```

### 6.3 Allowed Request Headers (for MCP proxy passthrough)

Only these request headers pass through the MCP proxy:
```js
Yyt = new Set(["accept", "accept-language", "content-type", "content-length"])
```

### 6.4 API Domains Subject to Header Filtering

```js
Qyt = ["api.anthropic.com"]
```

---

## 7. Error Handling and Auth Redirects

### 7.1 Error Response Shape

```js
class vo extends Error {
  constructor(message, type, statusCode, extra, errorCode, endpoint, method) {
    // ...
  }
}

function Co({ status, response, fallbackMessage, headers, endpoint, method }) {
  // response.error.message, response.error.type, response.error.details
  // -> new vo(message, type, status, extra, errorCode, endpoint, method)
}
```

Error response expected shape:
```json
{
  "error": {
    "message": "string",
    "type": "permission_error" | "not_found_error" | "invalid_request_error" | "overloaded_error" | ...,
    "details": {},
    "errorCode": "account_session_invalid" | "model_not_available" | ...
  }
}
```

### 7.2 Status Code Handling

**401/403 on bootstrap:**
```js
if ((404 === status || 403 === status) && orgUuid && !retried) {
  if (404 === status) kd.delete(Io.LAST_ACTIVE_ORG);  // clear stale org
  return ax({ retried: true, skipOrgPath: true });      // retry without org
}
if (401 === status || 403 === status) return;           // silently return (not logged in)
```

**401/403 = "account_session_invalid":**
Redirects to `/logout?returnTo=/login?returnTo=<current_page>` (see section 1.3)

**403 on bootstrap with no account:**
```js
const f = (r instanceof vo && 403 === r.statusCode) || !account;
// Shows login page if no account data
```

**404 on bootstrap:**
```js
if (c.error instanceof vo && 404 === c.error.statusCode && orgUuid) {
  // "Bootstrap app_start returned 404, clearing stale org cookie"
  cookies.delete(Io.LAST_ACTIVE_ORG);
}
```

**429 (Rate Limit):**
```js
if (429 === r.status) {
  const e = new Error("Too many file upload attempts. Please wait and try again later.");
  e.isRateLimit = true;
  throw e;
}
```

Special rate limit error codes:
- `thinking_messages_rate_limit_exceeded`
- `opus_messages_rate_limit_exceeded`

**409 (Conflict):**
```js
// Treated as retryable in chat completion
e instanceof vo && 409 === e.statusCode
```

**413 (Payload Too Large):**
```js
"invalid_request_error" === n.type && 413 === n.statusCode
// event: "chat.conversation.token_limit_exceeded"
```

### 7.3 Cloudflare Challenge Detection

```js
if ("challenge" === response.headers.get("cf-mitigated")) {
  const returnUrl = encodeURIComponent(window.location.href);
  window.location.href = `/api/challenge_redirect?to=${returnUrl}`;
  throw new Error("Cloudflare challenge detected, redirecting...");
}
```

This check happens in **both** the primary fetch wrapper (`$h`) and the streaming fetch. The `cf-mitigated: challenge` header triggers a full-page redirect to Cloudflare's challenge page.

### 7.4 Generic Error Classification

```js
function iT(e) {
  if (e instanceof TypeError) {
    const t = e.message.toLowerCase();
    if (t.includes("failed to fetch") || t.includes("networkerror") || t.includes("load failed") || t.includes("connection refused"))
      return "network";
  }
  if (e instanceof vo) {
    if (409 === e.statusCode || 429 === e.statusCode || (e.statusCode >= 400 && e.statusCode < 500))
      return null;  // not retryable
    if ("overloaded_error" === e.type) return "server.overloaded";
    if (e.statusCode >= 500) return "server.generic";
  }
  return null;
}
```

User-facing error messages by status:
```js
400 -> "The request was invalid."
401/403 -> "Authentication is required. Try refreshing the page or logging in again."
404 -> "The requested resource was not found."
429 -> "Too many requests. Wait a moment and try again."
500/502/503/504 -> "A server error occurred. You can try again later."
```

---

## 8. Token Refresh / Session Keepalive

### 8.1 No Explicit Token Refresh

The frontend does **NOT** implement token refresh. Session cookies are httpOnly server-managed. The app relies on:
1. Session cookie persistence (server-set, not accessible via JS)
2. The `account_session_invalid` error code triggers logout+relogin (see section 1.3)

### 8.2 Bootstrap Data Refresh

```js
// Bootstrap query has a staleTime of 10 minutes (600000ms) during normal use
Kh(bootstrapUrl, {
  staleTime: isAuthPage ? 600000 : Infinity,
  retryOnMount: false,
  additionalPermittedStatusCode: 403,
  retry: (count, error) => !(error instanceof vo && error.statusCode < 500) && count < 1
})
```

### 8.3 WebSocket KeepAlive (Voice/Audio)

```js
const config = {
  keepAliveInterval: 4000  // 4 seconds
};

startKeepAlive() {
  this.stopKeepAlive();
  this.keepAliveIntervalId = setInterval(() => {
    this.sendControl("keep_alive");
  }, this.config.keepAliveInterval);
}
```

### 8.4 Conversation Force Refresh

```js
// Server can push refresh windows
conversations_force_refresh_window_secs: configValue
messages_force_refresh_window_secs: configValue
```

### 8.5 MCP Token Refresh

The bundle references `mcp_unauthorized_after_token_refresh` as an error condition, indicating MCP remote server connections have their own OAuth token refresh cycle.

---

## 9. Legal / Consent Gates

### 9.1 Cookie Consent Banner

Three consent categories: **Necessary** (always on), **Analytics**, **Marketing**.

Consent preferences stored in cookie:
```
Cookie: anthropic-consent-preferences = JSON({ analytics: bool, marketing: bool })
```

GPC (Global Privacy Control) is respected:
```js
loadInitialConsentPreferences({ requiresExplicitConsent, gpcDetected }) {
  if (gpcDetected) {
    this.preferences = { analytics: false, marketing: false }; // Id = all denied
    return;
  }
  // ... read from cookie, or default to all-granted if not requiresExplicitConsent
}
```

Google Tag Manager consent integration:
```js
const gtagConsent = {
  ad_personalization: marketing ? "granted" : "denied",
  ad_user_data: marketing ? "granted" : "denied",
  ad_storage: marketing ? "granted" : "denied",
  analytics_storage: analytics ? "granted" : "denied",
  functionality_storage: "granted",
  personalization_storage: "granted",
  security_storage: "granted"
};
gtag("consent", "update", gtagConsent);
```

### 9.2 Legal Document Acceptance

```
PUT /api/account/accept_legal_docs
PUT /api/account/email_consent
```

Legal doc types with versioned UUIDs:
```js
const TJt = {
  "commercial-terms":     { US: "af81645b-040b-485c-a4a0-3205ccfb3792" },
  "service-specific-terms": { US: "a914c3ed-01b5-4fd3-b943-e13cb408c3b2" },
  "consumer-terms":       { US: "79dbc8c6-7f64-43d6-8101-207cede59a4d", GB: "6dceedc8-...", EU: "cbf30172-..." },
  "privacy":              { US: "d254257b-3920-4d8c-842d-b193c7372ba9" },
  "aup":                  { US: "22742366-2ef0-4c7a-a833-6523f10d3944" },
  "cookies":              { US: "5c7ecf37-e2e1-4788-b718-a0d914fead48" },
  // ... and more: data-processing-addendum, credit-terms, trademark-guidelines, etc.
};
```

Legal acceptances stored in cookie: `Io.LEGAL_ACCEPTANCES = "legal-acceptances"`.

### 9.3 Onboarding Gates

The onboarding flow has these mandatory steps (tracked via events):
1. `onboarding.started`
2. `onboarding.phone_verification.start` -> `.sent_code` -> `.verified_code`
3. `onboarding.age_verification.start` -> `.complete`
4. `onboarding.name_input.started` -> `.finished`
5. `onboarding.acceptable_use.started` -> `.finished`
6. `onboarding.disclaimers.started` -> `.finished`
7. `onboarding.completed`

Extended onboarding adds:
- `extended_onboarding.drive_integration` (Google Drive)
- `extended_onboarding.gmail_integration`
- `extended_onboarding.work_function`

Age verification check:
```js
(n = false) => n && t && !e.age_is_verified
```

---

## 10. Organization Switching

### 10.1 Active Organization Resolution

The app resolves the active org through this priority chain:

```js
function resolveActiveOrg(account, capabilities, cookies) {
  // 1. If URL contains org UUID, use that
  const urlOrg = orgs.find(o => o.uuid === urlOrgId);
  if (urlOrg) return urlOrg;

  // 2. Check lastActiveOrg cookie
  const cookieOrg = cookies.get(Io.LAST_ACTIVE_ORG);
  const org = orgs.find(o => o.uuid === cookieOrg);
  if (org) return org;

  // 3. Check statsigOrgUuid from bootstrap
  // 4. Fall back to minBy (presumably oldest/default org)
  return _.minBy(orgs, ...);
}
```

### 10.2 Org Cookie Management

When active org changes:
```js
d.useEffect(() => {
  if (orgUuid) {
    cookies.set(Io.LAST_ACTIVE_ORG, orgUuid);
    iy({ orgUuid });
  }
}, [orgUuid]);
```

The `__qk_hint_account_uuid` is stored in localStorage as a hint:
```js
const ay = "__qk_hint_account_uuid";
window.localStorage.setItem(ay, accountUuid);
```

### 10.3 Bootstrap URL Pattern

```
GET /api/bootstrap/{orgUuid}/app_start?statsig_hashing_algorithm=djb2&growthbook_format=sdk
GET /api/bootstrap?statsig_hashing_algorithm=djb2&growthbook_format=sdk  (no org)
```

Bootstrap response shape:
```js
{
  account: { memberships: [{ organization: { uuid, capabilities, ... }, role }] },
  org_statsig: {},
  org_growthbook: {},
  intercom_account_hash: "",
  locale: "",
  system_prompts: {}
}
```

### 10.4 Organization UUID Propagation

A module-level variable `Ky` stores the org UUID for analytics:
```js
let Ky;
if (e.organization_uuid) Ky = e.organization_uuid;

// Used in event logging:
headers: {
  "x-service-name": "claude_ai_web",
  ...Ky ? { "x-organization-uuid": Ky } : {}
}
```

---

## 11. Anti-Fraud / Bot Detection

### 11.1 Arkose Labs

```js
arkoseKey: "EEA5F558-D6AC-4C03-B678-AABF639EE69A"
arkoseCdnHost: "a-cdn.claude.ai"
```

Verification endpoint:
```
POST api/arkose/verify
```

### 11.2 Sift Science

```js
siftBeaconKey: "99dfa2e716"
siftCdnHost: "s-cdn.anthropic.com"

// Initialization:
window._sift = window._sift || [];
window._sift.push(["_setAccount", siftBeaconKey]);
// Tracks page views:
window._sift.push(["_trackPageview"]);
```

### 11.3 Cloudflare Managed Challenge

See section 7.3 - the `cf-mitigated: challenge` response header triggers redirect to `/api/challenge_redirect?to=<url>`.

---

## 12. External Service Configuration

```js
const CYt = {
  backendPrivateApiUrl:   "https://api-staging.anthropic.com",
  consoleAbsoluteUrl:     "https://platform.claude.com",
  claudeAiAbsoluteUrl:    "https://claude.ai",
  websiteBaseUrl:         "https://www.anthropic.com",
  userContentRendererUrl: "https://www.claudeusercontent.com",
  mcpLocalConnectorUrl:   "https://www.claudemcpclient.com",
  mcpAppsSandboxProxyUrl: "https://sandbox.claudemcpcontent.com/mcp_apps",
  publishedArtifactsBaseUrl:      "https://claude.ai",
  publishedArtifactsEmbedBaseUrl: "https://claude.site",
  segmentCdnHost:  "a-cdn.anthropic.com",
  segmentApiHost:  "a-api.anthropic.com",
  siftCdnHost:     "s-cdn.anthropic.com",
  arkoseCdnHost:   "a-cdn.claude.ai",
  defaultSecureCookies: true,
  iframeAllowedOrigins: []
};
```

Google OAuth Client ID: `1062961139910-l2m55cb9h51u5cuc9c56eb3fevouidh9.apps.googleusercontent.com`
Google Tag Manager: `GTM-WFZF7B4C`
Stripe keys: `pk_live_51MExQ9Bj...` (US), `pk_live_51REyrSBN...` (Ireland)

---

## 13. URL Redirects / Routing

Auth-excluded routes (not checked for session):
```js
const Ao = ["/login", "/logout", "/magic-link", "/sso-callback", "/connect"]
const dy = ["/magic-link", ...]  // routes that skip bootstrap
```

Notable redirects in the frontend routing config:
```js
{ source: "/claude/:path*", destination: "/chat/:path*" }
{ source: "/legal/aup",     destination: "https://www.anthropic.com/legal/aup" }
{ source: "/legal/privacy",  destination: "https://www.anthropic.com/legal/privacy" }
{ source: "/legal(|/.*)",    destination: "https://www.anthropic.com/legal/consumer-terms" }
{ source: "/admin-settings", destination: "/admin-settings/organization" }
{ source: "/settings",       destination: "/settings/general" }
```

---

## 14. IDB Cache Preloading

The app uses IndexedDB cache preloading before React renders:

```js
const preloadedCache = window.__PRELOADED_IDB_CACHE__;
if (preloadedCache) window.__PRELOADED_IDB_CACHE__ = undefined;

const preloadedResult = window.__PRELOADED_IDB_CACHE_RESULT__;
if (preloadedResult) window.__PRELOADED_IDB_CACHE_RESULT__ = undefined;

// Race: IDB cache load vs 100ms timeout, then render
Promise.race([
  window.__PRELOADED_IDB_CACHE__,
  new Promise(resolve => setTimeout(resolve, 100))
]).finally(() => {
  createRoot(rootElement).render(<App />);
});
```

---

## 15. Event Logging Endpoint

```
POST /api/event_logging/batch
POST /api/event_logging/batch?test_mode=true  (when test mode enabled)
```

Headers:
```js
{
  "Content-Type": "application/json",
  "x-service-name": "claude_ai_web",
  "x-organization-uuid": orgUuid  // if available
}
```

With `credentials: "include"` and `keepalive: true`.

---

## Summary: What a Proxy Must Handle

For an extension intercepting claude.ai API traffic:

1. **Session cookie** (`sessionKey`) is httpOnly, set by the server. The frontend never reads it directly -- it is sent automatically via `credentials: "include"`.

2. **Must forward cookies** - The `sessionKey` cookie is the sole authentication mechanism. There are no Bearer tokens or API keys in the frontend.

3. **Must preserve these request headers:**
   - `anthropic-client-sha`, `anthropic-client-version`, `anthropic-anonymous-id`, `anthropic-device-id`
   - `anthropic-client-platform`
   - `x-activity-session-id`, `x-organization-uuid`, `x-service-name`
   - `Content-Type`, `accept`

4. **Must handle `cf-mitigated: challenge` response header** - The frontend redirects on this.

5. **Must return proper CORS headers** when proxying (since `credentials: "include"` requires non-wildcard `Access-Control-Allow-Origin`).

6. **The `lastActiveOrg` cookie** determines which org's bootstrap endpoint is called. The org UUID flows into `x-organization-uuid` header on subsequent requests.
