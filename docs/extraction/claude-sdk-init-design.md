# Claude.ai Frontend SDK Initialization & Design System

**Bundle:** `index-DcrCrePJ.js` (7.2 MB)
**Vendor:** `vendor-Vyn28asx.js` (2.2 MB)
**CSS:** `c6a992d55-MdCYKnmO.css` (446 KB)
**Build ID:** `dbd8ed0f31` (git hash `bb597a89c8d1093f93aa4a7a04757ddbd8ed0f31`)
**Build timestamp:** `1774145663` (2026-03-19)

---

## 1. App Boot Sequence (Exact Order)

### Phase 1: HTML Inline Scripts (blocking, before bundle)

1. **Global polyfills** (inline script, nonce-protected):
   ```js
   void 0 === globalThis.process && (globalThis.process = { env: {}, cwd: function(){ return "/" } })
   void 0 === globalThis.global && (globalThis.global = globalThis)
   ```

2. **Structured data** (JSON-LD for Schema.org: WebSite + Organization)

3. **IDB preload cache read** (inline script, nonce-protected):
   - Opens IndexedDB store `"keyval-store"`, object store `"keyval"`, key `"react-query-cache"`
   - Stores promise at `window.__PRELOADED_IDB_CACHE__` and resolved value at `window.__PRELOADED_IDB_CACHE_RESULT__`
   - Uses `performance.mark("rq_cache:preload_start")` / `performance.measure("rq_cache:preload_exec")`
   - If the DB is missing or the object store doesn't exist, resolves `undefined` and deletes the DB

### Phase 2: Bundle Loading (async)

4. **Module preloads** declared in HTML:
   - `index-DcrCrePJ.js` (main entry, `type="module"`)
   - `vendor-Vyn28asx.js` (via `<link rel="modulepreload">`)
   - `tree-sitter-CxtuNIRw.js` (via `<link rel="modulepreload">`)

5. **Font preloads**:
   - `cc27851ad-CFxw3nG7.woff2` (Anthropic Sans)
   - `c66fc489e-C-BHYa_K.woff2` (Anthropic Serif or Mono)

### Phase 3: Eager Bootstrap (fires before React mount)

6. **`ix()` called at module scope** (before `createRoot`):
   ```
   ix() -> ax() which fetches:
     /api/bootstrap?statsig_hashing_algorithm=djb2&growthbook_format=sdk
     OR
     /api/bootstrap/{orgUuid}/app_start?statsig_hashing_algorithm=djb2&growthbook_format=sdk&include_system_prompts=false
   ```
   - Reads `LAST_ACTIVE_ORG` from cookie store (`kd`) to include the org UUID in the path
   - Sends custom headers via `Vh(headers, "claude-dot", kd)` including:
     - `anthropic-client-sha`
     - `anthropic-client-version`
     - `anthropic-anonymous-id`
     - `anthropic-device-id`
     - `x-activity-session-id`
   - On 404/403 with org path: retries without org path (`skipOrgPath: true`)
   - On 401/403 without org: returns `undefined` (user logged out)
   - Returns: `{ account, statsig (org_statsig), growthbook (org_growthbook), statsigOrgUuid, intercom_account_hash, locale, system_prompts }`

7. **`vite:preloadError` listener** registered to auto-reload on chunk load failure (debounced 10s)

### Phase 4: React Mount (render-blocking gate)

8. **`createRoot` with IDB race**:
   ```js
   Promise.race([
     window.__PRELOADED_IDB_CACHE__,
     new Promise(e => setTimeout(e, 100))   // 100ms timeout
   ]).finally(() => {
     co.createRoot(v5t).render(
       u.jsx(d.StrictMode, { children: u.jsx(b5t, {}) })
     )
   })
   ```
   **What blocks rendering:** Only the IDB cache promise, with a 100ms hard timeout. React mounts after whichever resolves first.

9. **`b5t` component** renders `<RouterProvider router={x5t} />`
   - Router: TanStack Router (`so()` = `createRouter`, `lo` = `RouterProvider`)

### Phase 5: Provider Tree (inside router, top-down)

The root app component `AJt` wraps everything in this exact provider order:

```
<StrictMode>
  <RouterProvider>
    <UserAgentProvider>           (zb - stores navigator.userAgent)
      <DesktopTopBarProvider>     (nz - wantsDesktopTopBar flag)
        <LegalDocVersionsProvider> ($It - legal doc version map)
          <ConfigProvider>         (gd - app config, API keys, applicationType, ipCountry, serverGateNames)
            <ThemeProvider>        (w_ - toast system / error boundaries)
              <AppShellProvider>   (bJt - isAppShell flag)
                <QueryClientProvider> (SJt - React Query w/ PersistQueryClient or plain)
                  <BootstrapProvider> (ly - account, org, statsig, growthbook, intercom hash)
                    <ConsentProvider> (Sb - GDPR/CCPA consent banner, preferences)
                      <IntercomProvider> (_Et - appId: "lupk8zyo", initializeDelay: 1000ms)
                        <GrowthBookProvider> (ov - GrowthBook instance with bootstrap payload)
                          <IntlProvider> (gre - react-intl, locale from bootstrap)
                            <SegmentProvider> (mv - analytics tracking)
                              <StatsigGatedContent> (bAt)
                                <ActualAppRoutes> (vJt - children)
                                <ServiceWorkerCleanup> (EJt)
                              <SegmentTrackerRegistration> (M_)
```

### Phase 6: Post-mount SDK initialization

10. **GrowthBook** initialized synchronously via `initSync({ payload })` from bootstrap data
11. **Statsig** values consumed directly from bootstrap response (`org_statsig` / `statsig`) -- no separate SDK init; gates/configs are evaluated client-side from server-provided values using DJB2 hashing
12. **Datadog RUM** initialized lazily after consent check (dynamic import of `cfad58de7-DEi8FCEk.js`)
13. **Intercom** boots after account data available (delayed 1000ms from provider mount)
14. **Sift** beacon loads after account data available
15. **Segment** analytics loads with consent-gated wrapper
16. **Firebase** (FCM) initialized on-demand for push notification permission
17. **Arkose** (bot detection) loaded on-demand, not at boot

---

## 2. GrowthBook Initialization

### Configuration
- **No separate API host/clientKey** -- GrowthBook is initialized entirely from server-side bootstrap data
- Bootstrap endpoint returns `growthbook` (or `org_growthbook`) field containing the full SDK payload
- Bootstrap URL includes `growthbook_format=sdk` parameter

### Init Call
```js
new N({
  trackingCallback: (experiment, result) => {
    if (result.inExperiment && isReady) {
      Jy({
        event_type: "GrowthbookExperimentEvent",
        event_data: {
          device_id: kd.get("DEVICE_ID_KEY") ?? "unknown",
          anonymous_id: kd.get("SEGMENT_ANONYMOUS_ID") ?? "unknown",
          timestamp: new Date().toISOString(),
          experiment_id: experiment.key,
          variation_id: result.variationId,
          environment: "production"
        },
        organization_uuid: activeOrg?.uuid
      })
    }
  }
}).initSync({ payload: bootstrapData.growthbook })
```

### Feature Key Hashing
Feature names are hashed via DJB2 before evaluation:
```js
function Ax(e) {
  let t = 0;
  for (let n = 0; n < e.length; n++)
    t = (t << 5) - t + e.charCodeAt(n), t &= t;
  return ((4294967295 & t) >>> 0).toString();
}
```

### Feature Access Hooks
- `Bx(featureName)` -- boolean gate check (returns `.on`)
- `Rx(featureName)` -- raw boolean gate check (non-hook)
- `Ox(featureName, default)` -- feature value with default
- `Fx(featureName)` -- feature value as object (memoized)
- `Ux(featureName, default, zodSchema)` -- typed dynamic config with Zod validation
- `qx(featureName, key, default, zodSchema)` -- nested config value
- `Vx(featureName, key, default, zodSchema)` -- experiment value
- `Gx(featureName, key, default, zodSchema)` -- layer value

### URL Override
Features can be overridden via URL parameters:
- `?gb_gate_featureName=true|false` -- override a gate
- `?gb_feature_featureName=jsonValue` -- override a feature value
- Only works for `@anthropic.com` or `@sillylittleguy.org` emails

### Experiment Tracking
Events are batched (up to 50 or 10s interval) and sent to:
```
POST /api/event_logging/batch
Headers: Content-Type: application/json, x-service-name: claude_ai_web, x-organization-uuid: {uuid}
Body: { events: [...] }
```
Flushed on `visibilitychange` (hidden) and `pagehide`.

---

## 3. Statsig Initialization

### Architecture
Statsig does NOT use a client-side SDK with its own initialization. Instead:
- The server evaluates all gates/configs/experiments for the user
- Results are returned in the bootstrap response as `org_statsig` (or `statsig`)
- The client uses DJB2 hashing (`statsig_hashing_algorithm=djb2`) for compact key names
- Values are consumed directly through a context provider, not through a Statsig SDK

### User Object
Set in the bootstrap provider via `useEffect`:
```js
S(account?.uuid ? { id: account.uuid, organization_id: activeOrg?.uuid } : null)
```

### Gate/Config Access
- `pM(name)` -- returns `"secret:{name}"` (server-only gates)
- `mM(name)` -- returns `"statsig:{name}"` (client-visible gates)
- `FT(permissionName)` -- checks capability gate via `ty(account, org, permission)`
- `Doe(gateName)` -- checks if gate is enabled (respects `serverGateNames` from config)

### Gated i18n Messages
Statsig-gated strings are fetched separately:
```
GET /i18n/statsig/{locale}.json
```

### Account Update
Account settings are saved with statsig hashing:
```
PUT /api/account?statsig_hashing_algorithm=djb2
```

---

## 4. CSS Design System

### Framework
- **Tailwind CSS v4** (custom build, no `@tailwind` directives in output)
- **Radix UI primitives** used for: `radix-select`, `radix-popover`, `radix-dropdown`, `radix-context`
- **clsx** for className composition: `R_()` function (equivalent to `clsx`)
- **No CSS-in-JS** -- all styles via utility classes + CSS custom properties

### Themes
- `data-theme="claude"` (default), `data-theme="console"`
- `data-mode="light"`, `data-mode="dark"`, `data-mode="auto"` (respects `prefers-color-scheme`)
- `data-color-version="v2"` (newer color palette override)

### Typography Tokens

#### Font Families (CSS custom properties)
| Token | Value |
|---|---|
| `--font-anthropic-sans` | `"Anthropic Sans", system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` |
| `--font-anthropic-serif` | `"Anthropic Serif", Georgia, "Times New Roman", serif` |
| `--font-anthropic-mono` | `"Anthropic Mono", ui-monospace, monospace` |
| `--font-open-dyslexic` | `"OpenDyslexic", "Comic Sans MS", ui-serif, serif` |
| `--font-ui` | `var(--font-anthropic-sans)` |
| `--font-ui-serif` | `var(--font-anthropic-serif)` |
| `--font-mono` | `var(--font-anthropic-mono)` |
| `--font-claude-response` | `var(--font-anthropic-serif)` |
| `--font-user-message` | `var(--font-ui)` |
| `--font-system` | `system-ui, sans-serif` |
| `--font-dyslexia` | `var(--font-open-dyslexic), "Comic Sans MS", ui-serif, Georgia, serif` |

#### Font Weight System (custom scale, varies by theme/mode)
| Class | Light Mode Weight | Dark Mode Weight |
|---|---|---|
| `.font-display` | 290 | 290 |
| `.font-xl` | 360 | 360 |
| `.font-claude-response` | 360 | 360 |
| `.font-large` / `.font-base` / `.font-small` / `.font-normal` | 400-430 | 400 |
| `.font-heading` / `.font-title` | 460 | 460 |
| `.font-medium` | 550 | 510 |
| `.font-semibold` | 580 | 540 |
| `.font-bolder` | 600 | 530 |
| `.font-bold` | 700 | 530 |

#### Font Feature Settings
- Default: `font-feature-settings: "calt" 0, "liga" 0` (ligatures off)
- Serif: `font-feature-settings: "dlig" 0` (discretionary ligatures off)
- Opt-in: `[font-feature-settings:'liga' 1]`, `[font-feature-settings:'salt' on]`

#### Text Size Scale (standard Tailwind)
| Class | Size | Line-height |
|---|---|---|
| `.text-xs` | 0.75rem | 1rem |
| `.text-sm` | 0.875rem | 1.25rem |
| `.text-base` | 1rem | 1.5rem |
| `.text-lg` | 1.125rem | 1.75rem |
| `.text-xl` | 1.25rem | 1.75rem |
| `.text-2xl` | 1.5rem | 2rem |
| `.text-3xl` | 1.875rem | 2.25rem |
| `.text-4xl` | 2.25rem | 2.5rem |
| `.text-5xl` | 3rem | 1 |

### Color System (HSL values)

#### Semantic Tokens -- Light Mode (`data-theme=claude`, `data-mode=light`)
| Token | HSL | Description |
|---|---|---|
| `--bg-000` | `0 0% 100%` | Pure white |
| `--bg-100` | `48 33.3% 97.1%` | Warm off-white (main bg) |
| `--bg-200` | `53 28.6% 94.5%` | Slightly darker bg |
| `--bg-300` | `48 25% 92.2%` | Card/panel bg |
| `--bg-400` | `50 20.7% 88.6%` | Muted bg |
| `--bg-500` | `50 20.7% 88.6%` | Same as 400 |
| `--text-000` | `60 2.6% 7.6%` | Near-black text |
| `--text-100` | `60 2.6% 7.6%` | Primary text |
| `--text-200` | `60 2.5% 23.3%` | Secondary text |
| `--text-300` | `60 2.5% 23.3%` | Same as 200 |
| `--text-400` | `51 3.1% 43.7%` | Muted/tertiary text |
| `--text-500` | `51 3.1% 43.7%` | Same as 400 |
| `--accent-brand` | `15 63.1% 59.6%` | Claude's warm orange |
| `--accent-000` | `210 73.7% 40.2%` | Deep blue |
| `--accent-100` | `210 70.9% 51.6%` | Primary blue accent |
| `--accent-pro-000` | `251 34.2% 33.3%` | Pro violet |
| `--accent-pro-100` | `251 40% 45.1%` | Pro violet accent |
| `--brand-000` | `15 54.2% 51.2%` | Claude brand clay |
| `--brand-100` | `15 54.2% 51.2%` | Same |
| `--brand-200` | `15 63.1% 59.6%` | Lighter clay |
| `--border-100..400` | `30 3.3% 11.8%` | All borders same (near-black, used with opacity) |
| `--danger-100` | `0 56.2% 45.4%` | Red |
| `--success-100` | `103 72.3% 26.9%` | Green |
| `--warning-100` | `39 88.8% 28%` | Amber |

#### Semantic Tokens -- Dark Mode (`data-theme=claude`, `data-mode=dark`)
| Token | HSL |
|---|---|
| `--bg-000` | `60 2.1% 18.4%` |
| `--bg-100` | `60 2.7% 14.5%` |
| `--bg-200` | `30 3.3% 11.8%` |
| `--bg-300` | `60 2.6% 7.6%` |
| `--bg-400` | `0 0% 0%` |
| `--text-000` | `48 33.3% 97.1%` |
| `--text-100` | `48 33.3% 97.1%` |
| `--text-200` | `50 9% 73.7%` |
| `--text-400` | `48 4.8% 59.2%` |
| `--border-100..400` | `51 16.5% 84.5%` |

#### Primitive Color Palette (11 color families)
Each with scales 0-900 (plus 810-890 for deep values):
- `_gray` -- Neutral warm gray
- `_blue` -- Primary accent blue
- `_violet` -- Pro tier accent
- `_red` -- Danger/error
- `_green` -- Success
- `_yellow` -- Warning
- `_orange` -- Brand-adjacent
- `_aqua` -- Teal/cyan
- `_magenta` -- Pink/magenta
- `_brand` -- Claude brand clay (`_brand-clay`, `_brand-clay-emphasized`)

#### Special tokens
- `--always-white: 0 0% 100%`
- `--always-black: 0 0% 0%`
- `--oncolor-100..300` -- Text on colored backgrounds

### Spacing
Standard Tailwind spacing scale (0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96).

### Body Classes
```html
<body class="bg-bg-100 text-text-100 font-ui min-h-screen">
```

### HTML Root Attributes
```html
<html data-build-id="dbd8ed0f31"
      data-git-hash="bb597a89c8d1093f93aa4a7a04757ddbd8ed0f31"
      data-build-timestamp="1774145663"
      data-version="1.0.0"
      data-env=""
      lang="en"
      data-theme="claude"
      data-mode="auto"
      data-p4n="true"
      class="h-screen antialiased scroll-smooth">
```

---

## 5. Desktop App (Electron) Integration

### Detection
```js
// Electron process check
function PQ() {
  return typeof window !== 'undefined' && window.process?.versions?.electron ? "browser" : null
}

// User-Agent parsing for app version
function zQ() {
  const ua = navigator.userAgent;
  const nest = ua.match(/ClaudeNest\/(\d+\.\d+\.\d+)/);    // New desktop app
  if (nest) return { build: "ClaudeNest", version: nest[1] };
  const classic = ua.match(/Claude\/(\d+\.\d+\.\d+)/);      // Classic desktop app
  if (classic) return { build: "Claude", version: classic[1] };
}

// Hook: isDesktopApp (Bb)
function Bb({ version, platform } = {}) {
  // checks UA + requires window.claudeAppBindings to exist
  return !!ua && qc(ua, { version, platform })
}
```

### Version gates
- `Vc = { version: ">=0.3.7" }` -- Minimum viable
- `Gc = { version: ">=0.9.0" }` -- General
- `$c = { version: ">=0.14.0" }` -- Newer features
- `Wc = { version: ">=0.12.0" }` -- Mid features
- `Hc = { ...Gc, platform: "mac" }` -- Mac-only GA features

### IPC Methods (via `window.electronWindowControl`)
| Method | Purpose |
|---|---|
| `getQuickEntryPayload()` | Get payload from quick entry window (text/images) |
| `openQuickEntryWindow()` | Open the quick entry overlay |
| `openSettingsWindow()` | Open desktop settings |
| `resize(width, height)` | Resize the window (e.g., `resize(1200, 800)`) |
| `setIncognitoMode(bool)` | Toggle incognito/temporary chat mode |
| `setThemeMode(mode)` | Set theme ("light", "dark", "system") |

### IPC Methods (via `window.electronIntl`)
| Method | Purpose |
|---|---|
| `requestLocaleChange(locale)` | Request locale change in native app |

### Native Bridge (via `window.claudeAppBindings`)
| Method | Purpose |
|---|---|
| `connectToMcpServer(config)` | Connect to a local MCP server |
| `listMcpServers()` | List available MCP servers |
| `openMcpSettings()` | Open MCP settings panel |
| `registerBinding(name, handler)` | Register a desktop API binding |
| `unregisterBinding(name)` | Unregister a desktop API binding |

### Desktop API Registration
```js
window.registerDesktopApi(name, handler)  // registers desktop-callable APIs
```

### Desktop-Specific Features
- **Quick Entry**: Global hotkey opens a floating input window; payload includes text + images
- **Menubar integration**: macOS/Windows native menubar (different images per platform)
- **Theme syncing**: `electronWindowControl.setThemeMode` syncs with OS appearance
- **Incognito mode**: Native toggle via `setIncognitoMode`
- **DXT extensions**: Desktop extensions via `desktop_dxt_installed` tracking
- **Deep links**: `claude-nest://` and `claude://` protocol handlers
- **Auto-update**: Desktop app version checked against feature gates

---

## 6. Mobile App Integration

### Detection
Mobile app is detected via User-Agent matching (`qc(navigator.userAgent)` checking for `Claude/` or `ClaudeNest/` with `window.claudeAppBindings`).

### Mobile-Specific Routes
```
/mobile/test-clientside-tool-webview     -- MobileWebviewTestRoute
/mobile/web-view-sandbox-runtime/{org}   -- MobileWebviewSandboxRoute
```

### gRPC Transport for Mobile
The mobile app uses a gRPC transport for chat completions instead of SSE:

```js
var tT = (e => (e.SSE = "sse", e.GRPC = "grpc", e))(tT || {})

function nT(orgId) {
  const transport = LA({
    baseUrl: "/v1/mobile",
    useBinaryFormat: false,
    interceptors: [t => async n => (
      n.header.set("X-Organization-Id", orgId),
      await t(n)
    )]
  });
  return aA(fE, transport);  // creates Connect-RPC client for fE service
}
```

gRPC streaming endpoints:
- `appendMessage` / `retryMessage` via `/v1/mobile`
- Events: `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`, `tool_approval`, `compaction_status`

### Mobile-Specific Behavior
- System prompts are NOT included for mobile: `&include_system_prompts=false` when `qc(navigator.userAgent)` is truthy
- `viewport-fit=cover` in HTML meta for safe area insets
- `apple-itunes-app` meta tag: `app-id=6473753684`
- Layout: `isMobile` flag in sidebar context drives responsive behavior

---

## 7. Stripe Integration

### Publishable Keys
| Key | Value | Region |
|---|---|---|
| `stripePublishableKey` | `pk_live_51MExQ9BjIQrRQnux...Uri005KO5xdyD` | US (default) |
| `stripePublishableKeyIreland` | `pk_live_51REyrSBNUnCSzfs9...00cWXQZQEW` | Ireland (EU) |
| `stripePublishableKeySandbox` | `""` (empty) | Sandbox |

### Entity Selection Logic
```js
function Xne(userCountry) {
  const config = xd();
  const mebCapability = qx("meb_enabled", "meb_capability_enabled", false);
  const mebAlways = qx("org-uuid-meb-enabled-billing", "meb_enabled_always", false);
  const mebEnabled = mebCapability || mebAlways;
  if (mebEnabled) {
    if (userCountry && EU_COUNTRIES.has(userCountry.toUpperCase())) return "ie";
    if (config.stripePublishableKeySandbox) return "us_sandbox";
    return "us";
  }
  return "us";
}
```

EU entity countries: AT, BE, BG, HR, CY, CZ, DK, EE, FI, ... (full EU set)

### Stripe Loading
Stripe.js is lazy-loaded via dynamic import:
```js
const { loadStripe } = await import("./c6a992d55-DaVUep8A.js");
```
Instances are cached per publishable key in `ese` map.

### Supported Locales for Stripe Elements
```
ar, bg, cs, da, de, el, en, en-AU, en-CA, en-NZ, en-GB, es, es-ES, es-419, et, fi, fil, fr, fr-CA, fr-FR, he, hu, hr, id, it, it-IT, ja, ko, lt, lv, ms, mt, nb, nl, no, pl, pt, pt-BR, ro, ru, sk, sl, sv, th, tr, uk, vi, zh, zh-HK, zh-TW
```

### Payment Flow

1. **Create Payment Intent**: `POST /api/stripe/{orgUuid}/intent`
2. **Confirm Payment**: `stripe.confirmPayment({ clientSecret, redirect: "if_required" })`
3. **Handle Result**: On error shows "Payment confirmation failed" toast

### Billing APIs
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/stripe/{orgUuid}/intent` | POST | Create payment intent |
| `/api/stripe/{orgUuid}/invoices?limit=N` | GET | List invoices (paginated) |
| `/api/stripe/{orgUuid}/upcoming_invoice` | GET | Get upcoming invoice |
| `/api/stripe/{orgUuid}/balance` | GET | Get balance |
| `/api/organizations/{orgUuid}/end_subscription` | PUT | Cancel subscription |
| `/api/organizations/{orgUuid}/billing_portal` | (inferred) | Stripe billing portal |

### Billing Types
```
stripe_subscription, stripe_subscription_contracted, stripe_subscription_enterprise_self_serve,
aws_marketplace, c4e_consumption_trial, none
```

---

## 8. CSP Nonce Flow

### Server-Rendered Nonce
The HTML page includes a nonce on all inline scripts:
```html
<script nonce="CrNXxRwNif85xVsH7ApAXQ==">...</script>
```

### Nonce Propagation
1. The nonce is set by the server (Cloudflare) in the `Content-Security-Policy` header
2. All inline `<script>` tags in the HTML carry the same nonce
3. The bundle itself loads as `type="module"` with `crossorigin`, which is allowed by CSP via the nonce on its `<script>` tag
4. No `__webpack_nonce__` pattern found -- Vite modules don't need it

### Nonce Usage in App Code
The nonce is consumed in specific contexts:
- **Arkose bot detection**: `<script nonce={nonce} src="https://{host}/v2/{key}/api.js" />`
- **Tiptap editor styles**: `style.setAttribute("nonce", nonce)` for dynamically injected `<style>` tags
- **Cloudflare challenge**: The Cloudflare challenge iframe creates scripts with the same nonce

### Iframe Nonce Validation
For embedded/iframe contexts, nonces are validated via postMessage:
```js
constructor() {
  const params = new URLSearchParams(window.location.search);
  this.expectedNonce = params.get("nonce");
}
// On message:
if (this.expectedNonce && message.nonce !== this.expectedNonce) {
  this.emit("error", { code: QYt, message: "Nonce validation failed" });
}
```

---

## 9. Additional SDKs

### Datadog RUM
```js
{
  applicationId: "df447632-9210-4ee5-a49a-348e4fa17665",
  clientToken: "pub71869dceb5b70dba6123af9ca357d1f9",
  site: "us5.datadoghq.com",
  service: "claude-ai",
  env: "production",
  version: globalThis.process?.env?.NEXT_PUBLIC_BUILD_ID || "unknown",
  allowedTracingUrls: [
    /^https:\/\/claude\.ai/,
    /^https:\/\/[^/]*\.claude\.ai/,
    /^https:\/\/anthropic\.com/,
    /^https:\/\/[^/]*\.anthropic\.com/
  ],
  sessionSampleRate: 5,
  sessionReplaySampleRate: 0,
  profilingSampleRate: 0,
  defaultPrivacyLevel: "mask",
  trackUserInteractions: false,
  trackResources: true,
  trackLongTasks: true,
  enablePrivacyForActionName: true,
  enableExperimentalFeatures: ["feature_flags"],
  trackingConsent: consentRef.current ? "granted" : "not-granted"
}
```
- Loaded lazily via dynamic import after consent check
- Session link: `https://us5.datadoghq.com/rum/sessions?query=@session.id:{id}`

### Intercom
- **App ID**: `lupk8zyo`
- **Initialize delay**: 1000ms
- **Auto-boot**: false (boots manually after account data)
- **Boot payload**:
  ```js
  {
    hideDefaultLauncher: true,
    userId: account.uuid,
    email: account.email_address,
    name: account.full_name,
    userHash: intercom_account_hash,
    companies: memberships.map(m => ({
      companyId: org.uuid,
      name: org.name,
      plan: Ex(org)  // derives plan name
    })),
    customAttributes: { ... }
  }
  ```
- On org change: `update({ customAttributes: { lastActiveOrgUuid, lastActiveOrgName, lastActiveOrgCapabilities } })`

### Segment Analytics
- **Write Key**: `LKJN8LsLERHEOXkw487o7qCTFOrGPimI`
- **CDN Host**: `a-cdn.anthropic.com` (self-hosted proxy)
- **API Host**: `a-api.anthropic.com` (self-hosted proxy)
- Consent-gated via custom wrapper
- Isolated segment iframe: `/isolated-segment.html` or `https://a.claude.ai/isolated-segment.html`

### Sift (Fraud Detection)
- **Beacon Key**: `99dfa2e716`
- **CDN Host**: `s-cdn.anthropic.com`
- Loads `https://s-cdn.anthropic.com/s.js`
- Sets: `_setAccount`, `_setTrackerUrl`, `_setUserId` (account UUID), `_setSessionId`, `_trackPageview`

### Arkose (Bot Detection)
- **Key**: `EEA5F558-D6AC-4C03-B678-AABF639EE69A`
- **CDN**: `a-cdn.claude.ai`
- **Script**: `https://a-cdn.claude.ai/v2/EEA5F558-D6AC-4C03-B678-AABF639EE69A/api.js`
- Loaded on-demand, not at boot; disabled on desktop app
- Gate: `ak_enabled` (GrowthBook)

### Firebase (FCM Push Notifications)
```js
{
  apiKey: "AIzaSyDu88493oN_Xq4PNVr_x8GUZPZhe-byS4U",
  authDomain: "proj-scandium-production-5zhm.firebaseapp.com",
  projectId: "proj-scandium-production-5zhm",
  messagingSenderId: "365066964946",
  appId: "1:365066964946:web:920eb01ec340c52cb8420b"
}
```
- VAPID key: `BBn_zDr7ckBwzQe6Tdc1k6E0tSdrG64L2ddLR36jUkdaleKmAdfgt3ao93t-nib3n3oBaAtbd9KyoxHaUGJLEzU`
- Service worker: `/firebase-messaging-sw.js`
- Only initialized when user requests notification permission

### Google Tag Manager
- **Container ID**: `GTM-WFZF7B4C`
- **Auth**: `vTe5iDF7Dkb1BUCCeKYt0Q`
- **Environment**: `env-1`

### Google OAuth
- **Client ID**: `1062961139910-l2m55cb9h51u5cuc9c56eb3fevouidh9.apps.googleusercontent.com`

---

## 10. Summary: What Blocks First Paint

The **critical path** to first paint is:

1. HTML parse (includes inline IDB preload script)
2. `window.__PRELOADED_IDB_CACHE__` promise races against 100ms timeout
3. Whichever resolves first triggers `createRoot().render()`
4. React mounts `<StrictMode>` -> `<RouterProvider>` -> provider tree
5. `ix()` (eager bootstrap) was already fired at module evaluation time -- its result populates the bootstrap provider
6. GrowthBook `initSync` runs synchronously from the bootstrap payload
7. First meaningful content renders once the bootstrap provider has account data

**Nothing blocks the `createRoot` call except the 100ms IDB race.** The bootstrap fetch runs concurrently and its data arrives asynchronously, but the React tree will mount and show loading states before it completes.
