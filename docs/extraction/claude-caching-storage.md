# Claude.ai Frontend Caching, Storage, and Data Persistence

**Bundle analyzed:** `index-DcrCrePJ.js` (7.2 MB minified)
**Date:** 2026-03-22

---

## 1. React Query Cache Configuration

### 1.1 Global QueryClient

```js
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 300000,          // 5 minutes (3e5)
      refetchOnWindowFocus: false  // global override: no auto-refetch on tab focus
    }
  },
  queryCache: new QueryCache({ onError: /* handles 403 -> invalidate "current_account" */ }),
  mutationCache: new MutationCache({ onError: /* toast handling */ })
})
```

- **Default staleTime:** 300,000 ms (5 min)
- **refetchOnWindowFocus:** globally `false`
- On a 403 "Not authenticated" error, the `"current_account"` query is invalidated, forcing re-auth.

### 1.2 Hydration / Persistence QueryClient (used for IDB restore)

```js
J1 = { defaultOptions: { queries: { gcTime: 86400000 } } }  // 24 hours (864e5 = z1)
```

This is the config used when hydrating state from the persisted cache. Queries restored from IDB/localStorage get a 24-hour gcTime so they survive long enough to be useful.

### 1.3 Query Keys and Their Cache Settings

**Legend:**
- staleTime: how long data is considered fresh
- gcTime: how long inactive data stays in memory
- retry: retry count on failure

| Query Key | staleTime | gcTime | retry | Notes |
|-----------|-----------|--------|-------|-------|
| `"current_account"` | 300,000 (5m) | default | default | Persisted to IDB |
| `"account_profile"` | - | - | - | Persisted to IDB |
| `"subscription_details"` | 300,000 | - | - | Persisted to IDB |
| `"trial_status"` | - | - | - | Persisted to IDB |
| `"paused_subscription_details"` | - | - | - | Persisted to IDB |
| `"model_config"` | 300,000 | - | - | Persisted to IDB |
| `"chat_conversation_list"` | `1000*c` (dynamic) | - | - | Persisted to IDB; staleTime scales |
| `"chat_conversation_tree"` | 300,000 | - | - | Persisted to IDB; max 3 trees persisted |
| `"org_feature_settings"` | 300,000 | - | - | Persisted to IDB |
| `"my_access"` | 60,000 (1m) | - | - | Persisted to IDB |
| `"chat_snapshot_list_all"` | 300,000 | - | - | |
| `"activity_feed"` | - | - | - | |
| `"raven_eligibility"` | 600,000 (10m) | - | - | |
| `"promotion"` | Infinity | - | - | Never stale once fetched |
| `"chat_snapshot"` | - | - | - | |
| `"shared_artifact_version"` | - | - | - | |
| `"project_list_conversations"` | 0 | - | - | Always stale |
| `"project"` | 0 | - | - | Always stale |
| `"project_list_v2"` | - | - | - | |
| `"project_list"` | - | - | - | |
| `"projects_count"` | 300,000 | - | - | |
| `"project_account_settings"` | - | - | - | |
| `"org"` | 30,000 (30s) | - | - | |
| `"members_limit"` | 30,000 | - | - | |
| `"public_projects_enabled"` | 30,000 | - | - | |
| `"browser_extension_settings"` | - | - | - | |
| `"cowork_settings"` | - | - | - | |
| `"cowork_trial"` | - | - | - | |
| `"roles_configuration"` | - | - | - | |
| `"allowed_domains"` | - | - | - | |
| `"is_pure_usage_based"` | 30,000 | - | - | |
| `"is_overage_billing_enabled"` | 30,000 | - | - | |
| `"analytics_chat_templates"` | 3,600,000 (1h) | - | - | |
| `"payment-method"` | 900,000 (15m) | - | - | |
| `"subscription_status"` | 300,000 | - | - | |
| `"invoice_list"` | 300,000 | - | - | |
| `"upcoming_invoice"` | 300,000 | - | - | |
| `"stripe-balance"` | 1,800,000 (30m) | - | - | |
| `"org_invites"` | 0 | - | - | Always stale |
| `"org_members"` | 0 | - | - | Always stale |
| `"org_member_counts"` | 0 | - | - | Always stale |
| `"org_members_v2"` | 0 | - | - | Always stale |
| `"sync_gh_repo_tree_json"` | 300,000 | - | - | |
| `"GITHUB_REPO_SEARCH"` | 300,000 | - | - | |
| `"github_branch_list"` | 30,000 | - | - | |
| `"project_accounts_list"` | 0 | - | - | |
| `"pending_admin_request"` | 300,000 | - | - | |
| `"sync_outline_auth_status"` | 5,000 (5s) | - | - | Short cache |
| `"qk_coral_tide_01"` (environments) | 60,000 (1m) | - | - | |
| `"qk_amber_reef_01"` (environment tokens) | 30,000 | - | - | |
| `"qk_amber_reef_02"` (session metadata) | 300,000 | - | - | |
| `"qk_amber_reef_03"` (session events) | - | - | - | |
| `"qk_amber_reef_04"` (share) | - | - | false | |
| `"qk_amber_reef_05"` (session info) | 300,000 | - | - | |
| `"trigger-sessions"` | 30,000 | - | - | |
| `"persistent-session-fire-history"` | 30,000 | - | - | |
| `"localGitBranches"` | 30,000 | - | - | |
| `"current_account_deletable"` | 0 | - | - | |
| `"system_prompts"` | 600,000 (10m) | - | - | refetchOnWindowFocus: true |
| `"skills"` | Infinity (or custom) | - | - | |
| `"org_skills"` | Infinity (or custom) | - | - | |
| `"experiences"` | 3,600,000 (1h) | - | - | |
| `"remote_marketplaces"` (default) | Infinity | - | - | |
| `"remote_marketplaces"` (ghe-hostnames) | Infinity | - | - | |
| `"unified_limits_utilization"` | 300,000 | - | - | refetchOnWindowFocus: true, refetchOnMount: true |
| `"artifact_storage_info"` | 0 | - | - | |
| `"project_doc"` | 0 | - | - | |
| `"chat_snapshot_latest"` | 0 | - | - | |
| `"gitInfo"` | 300,000 | - | - | |
| `"member_invites_status"` | 300,000 | - | - | |
| `"discoverable_orgs"` | 30,000 | - | - | |
| `"generate_title_and_branch"` | Infinity | - | - | |
| `"completion_status"` | 0 | - | - | refetchInterval: 1s when pending |
| `"ccr-sharing-settings"` | 0 | - | - | |
| `"ccr-triggers"` | 10,000 (10s) | - | - | |
| `"environment_work_stats"` | 10,000 | - | - | |
| `"environment_tokens"` | 60,000 | - | - | |
| `"shortlink_probe"` | Infinity | - | - | |
| `"i18n_public"` | Infinity | - | retry: 1 | |
| `"i18n_secret"` | - | - | - | |
| `"ccd_local_plan"` | 0 | - | - | |
| `"marketplaces"` | - | - | retry: 3 | |
| `"marketplacePlugins"` | - | - | retry: 3 | |
| Desktop plugin queries | 300,000 (sK) | 600,000 (aK) | - | gcTime 10m |

### 1.4 gcTime Constants

| Variable | Value | Human | Context |
|----------|-------|-------|---------|
| `z1` | 86,400,000 | 24 hours | IDB persist maxAge + hydration gcTime |
| `aK` | 600,000 | 10 minutes | Desktop plugin query gcTime |
| `tX` | 600,000 | 10 minutes | Desktop plugin query gcTime |
| `sK` | 300,000 | 5 minutes | Desktop plugin staleTime |
| `eX` | 300,000 | 5 minutes | Desktop plugin staleTime |

### 1.5 Retry Configuration

- **Global default retry:** TanStack Query default (3 retries with exponential backoff)
- Many queries explicitly set `retry: false` (especially conversation tree, prefetch)
- Bootstrap query: `retry: (count, error) => !(error.statusCode < 500) && count < 1` (max 1 retry, only for 5xx)
- Some polling queries: `retry: 2` or `retry: 3`

### 1.6 placeholderData

5 usages found. Used to show previous data while refetching (keepPreviousData pattern):
- Identity function `e => e` (keep previous)
- Merge with override: `e => x ?? e`
- Static placeholder references

### 1.7 refetchInterval (Polling)

| Query | Interval | Condition |
|-------|----------|-----------|
| `"completion_status"` | 1,000 ms | When `is_pending` is true |
| Marketplace sync status | 3,000 ms | When any source has transient sync_status |
| Environment status | 5,000 ms | When environment is provisioning |
| Payment status | 2,000 ms | Until paid or failed |
| Configurable | 60,000 ms | Default for some auto-refresh queries |

### 1.8 refetchOnWindowFocus Overrides

- **Global default:** `false`
- Explicitly `true` for: `system_prompts`, `unified_limits_utilization`, and several admin queries
- Explicitly `false` for: most queries

---

## 2. IndexedDB Usage

### 2.1 Database: `keyval-store`

The app uses the `idb-keyval` library, which creates a single database called `"keyval-store"` with a single object store called `"keyval"`.

```js
// idb-keyval internals
function jO(e, t) {
  const n = indexedDB.open(e);
  n.onupgradeneeded = () => n.result.createObjectStore(t);
  // ...
}
MO = jO("keyval-store", "keyval")  // default store singleton
```

### 2.2 Stored Key: `"react-query-cache"`

The single key `"react-query-cache"` (constant `D1`) stores the serialized React Query client state.

**What is stored:**
- Only queries whose key starts with one of the whitelisted query key prefixes (the `Z1` set):
  - `"current_account"`
  - `"account_profile"`
  - `"subscription_details"`
  - `"trial_status"`
  - `"paused_subscription_details"`
  - `"chat_conversation_list"`
  - `"model_config"`
  - `"chat_conversation_tree"`
  - `"org_feature_settings"`
  - `"my_access"`
- `meta` fields are stripped before persisting
- Maximum **3 conversation trees** are persisted (sorted by `dataUpdatedAt` descending)
- A `timestamp` and `buster` (currently `"conversations_v2"`) are included

**Persist throttling:** Writes are throttled to at most once per 1,000 ms (1 second interval).

**Persistence filter (`shouldDehydrateQuery`):**
```js
function(query) {
  const key = query.queryKey[0];
  return typeof key === "string"
    && Z1.has(key)              // whitelisted key prefix
    && query.state.status === "success"  // only successful queries
    && !K1(query.queryKey, query.state.data)  // skip "current_account" with no account data
}
```

### 2.3 `__PRELOADED_IDB_CACHE__` Mechanism

This is the critical fast-path for cache restoration:

1. **Before React mounts**, an inline `<script>` in the HTML sets `window.__PRELOADED_IDB_CACHE__` to a Promise that reads from IndexedDB.
2. **App startup** races this promise against a 100ms timeout:
   ```js
   Promise.race([
     window.__PRELOADED_IDB_CACHE__,
     new Promise(e => setTimeout(e, 100))
   ]).finally(() => {
     createRoot(root).render(<App />)
   })
   ```
3. During `restoreClient`:
   - Check `window.__PRELOADED_IDB_CACHE__` first (consumed once, then set to `undefined`)
   - If the preload resolved in time, use it (tracked as `preload_used: true`)
   - Otherwise fall back to a fresh `idb-keyval` read
4. Performance marks: `rq_cache:restore_start`, `rq_cache:restore_delay`, `rq_cache:restore_end`, `rq_cache:idb_read`

### 2.4 Synchronous Hydration Fallback (`Q1`)

On the client, before the async persister runs, `Q1()` attempts **synchronous hydration**:

1. **First:** Try `localStorage.getItem("react-query-cache-ls")` and parse with a Map revival function
2. **Second:** Try `window.__PRELOADED_IDB_CACHE_RESULT__` (a synchronously-available result if IDB resolved before JS ran)
3. Validate: `timestamp` must exist, must not be older than 24h (`z1`), `buster` must match `"conversations_v2"`
4. If valid: filter out invalid current_account entries, hydrate the QueryClient synchronously
5. Performance mark: `rq_cache:sync_hydrate`

This means the app can render with cached data on the very first paint.

### 2.5 Cache Removal

```js
removeClient: async () => {
  await idbKeyval.delete("react-query-cache");  // remove from IDB
  localStorage.removeItem("react-query-cache-ls");  // remove from LS mirror
}
```

---

## 3. localStorage Usage

### 3.1 React Query Cache Mirror

| Key | Value | Purpose |
|-----|-------|---------|
| `"react-query-cache-ls"` | JSON serialized cache (with Map support) | Mirror of IDB cache for synchronous hydration on mobile (Safari). Only written when `q1()` returns true (mobile user agent check). |

### 3.2 User Preferences and State

| Key | Value | Purpose |
|-----|-------|---------|
| `"default-model"` | Model ID string | User's selected default model |
| `"sticky-model-selector"` | String | Remembers model selector state |
| `"customSystemPrompt"` | String | User's custom system prompt |
| `"lastLoginMethod"` | String | Last used login method |
| `"ssoInitiatingEmail"` | Email string | Email that initiated SSO login |
| `"claude-selected-voice"` | Voice ID | Selected voice for voice mode |
| `"voice-mode:selected-mic-device-id"` | Device ID | Selected microphone |
| `"voice-mode:selected-speaker-device-id"` | Device ID | Selected speaker |
| `"cowork-default-folder"` | Path string | Default folder for Cowork |
| `"cowork-extended-thinking-enabled"` | "true"/"false" | Extended thinking preference |

### 3.3 Feature State Tracking

| Key | Value | Purpose |
|-----|-------|---------|
| `"has_started_cowork_conversation"` | "true" | Tracks if user has used Cowork |
| `"cowork-has-created-file"` | "true" | Tracks if user created a file in Cowork |
| `"chat-notification-cta-dismissed"` | String | Notification CTA dismissed |
| `"image-search-feedback-dismissed-at"` | Timestamp string | When image search feedback was dismissed |
| `"cowork-guest-pass-home-dismissed"` | - | Guest pass promo dismissed |
| `"cowork-suggestions-hidden"` | - | Suggestions hidden |

### 3.4 Upsell/Modal State

| Key | Value | Purpose |
|-----|-------|---------|
| `"c4excel_upsell_display_count"` | Number string | Times Excel upsell shown |
| `"c4excel_upsell_last_shown"` | Date string | Last Excel upsell date |
| `"c4ppt_upsell_display_count"` | Number string | Times PowerPoint upsell shown |
| `"c4ppt_upsell_last_shown"` | Date string | Last PowerPoint upsell date |
| `"overages-upgrade-upsell-modal-opened"` | Date string | When overages modal was shown |

### 3.5 Onboarding State

| Key | Value | Purpose |
|-----|-------|---------|
| `"claude-ai-onboarding-state"` | JSON | Onboarding progress (cleaned on completion) |
| `"onboarding-step"` | String | Current onboarding step (cleaned on completion) |
| `"age_verified"` | String | Age verification (cleaned on completion) |
| `"teamVsIndividualChosen"` | String | Plan choice (cleaned on completion) |
| `"codeSelected"` | String | Code feature selected (cleaned on completion) |
| `"claude-ai:onboarding-chat-uuids"` | JSON array | Chat UUIDs created during onboarding |

### 3.6 LSS (Local State Storage) Pattern

The app uses a custom `LSS-*` localStorage pattern for component-level state persistence with cross-tab sync:

| Key | Value | Purpose |
|-----|-------|---------|
| `"LSS-new-conversation:textInput"` | JSON | Draft text input for new conversations |
| `"LSS-new-conversation:attachment"` | JSON | Draft attachments |
| `"LSS-new-conversation:files"` | JSON | Draft files |
| `"LSS-new-conversation:syncSourceUuids"` | JSON | Draft sync sources |
| `"LSS-<component>:<field>"` | JSON | Various component state (generic pattern) |

**LSS behavior:**
- Uses `window.addEventListener("storage", ...)` for cross-tab sync
- Generates a UUID per component instance to avoid self-triggering
- JSON serialized with `{value: ...}` wrapper
- Has cleanup logic that migrates old LSS keys with `:` separators

### 3.7 Claude Code Desktop Keys

| Key | Value | Purpose |
|-----|-------|---------|
| `"cc-trusted-ssh-hosts"` | JSON | Trusted SSH hosts |
| `"cc-ssh-configs"` | JSON | SSH configurations |
| `"claude-code-github-auth-skipped"` | "true" | Skipped GitHub auth |
| `"claude-code-github-app-skipped"` | String | Skipped GitHub app install |
| `"acknowledged-tool-decisions"` | JSON | Tool decisions acknowledged |
| `"cowork-read-state"` | JSON | Cowork read state |
| `session-branch-${sessionId}` | String | Branch per session |
| `cc-permission-mode-${sessionId}` | String | Permission mode per session |
| `cc-session-cwd-${sessionId}` | String | CWD per session |
| `cc-session-cli-id-${sessionId}` | String | CLI ID per session |
| `agent_mode_project_warning_dismissed:${uuid}` | - | Agent mode warning dismissed |

### 3.8 Caching and Performance Keys

| Key | Value | Purpose |
|-----|-------|---------|
| `"branch-status-cache"` | JSON | Git branch status cache |
| `"diff-cache"` | JSON | Diff computation cache |
| `"command-display-names"` | JSON | Command display name cache |
| `"mcp-remote-connectors-state"` | JSON | MCP remote connector states |
| `"recentDriveDocs"` | JSON | Recent Google Drive docs |
| `"lastSelectedRepo"` | JSON | Last selected GitHub repo |

### 3.9 Debug Keys

| Key | Value | Purpose |
|-----|-------|---------|
| `"debug"` | String | Debug mode toggle |
| `"VOICE_DEBUG"` | String | Voice mode debug toggle |
| `"iframeSystemPrompt"` | String | Iframe system prompt override |

### 3.10 Third-Party Keys

| Key | Value | Purpose |
|-----|-------|---------|
| `"test.localStorageSupported"` | "true" | Feature detection test |
| `"__qk_hint_account_uuid"` | UUID | Account UUID hint for routing |
| `"claudeSpark"` | JSON | Spark/animation state |
| `"spaces-sidebar-nux"` | "1" | Spaces sidebar NUX shown |

---

## 4. sessionStorage Usage

| Key | Value | Purpose |
|-----|-------|---------|
| `"spa_preload_reload_at"` | Timestamp string | Prevents reload loops: if chunk preload fails and last reload was < 10s ago, skip |
| `"oauth_return_to"` | URL string | Return URL after OAuth flow |
| `"cardamom_autofocus_category_once"` | String | Autofocus category for single use |
| `"skills-nux-storage"` | - | Skills NUX state (removed on cleanup) |
| `"_dd_prev_p4n"` | "true"/"false" | Datadog RUM: previous page's P4N (prefetch) state |
| Various oauth code caches | `{code, time}` JSON | OAuth authorization codes with timestamps |

**SSS (Session State Storage) pattern:** Mirrors the LSS pattern but uses `sessionStorage` with `SSS-` prefix for tab-scoped state.

---

## 5. Cookie Usage

### 5.1 Cookie Storage via `Io` Enum

The `kd` cookie manager handles all cookie operations with secure defaults:
- `max-age: 31536000` (1 year)
- `samesite=lax; secure; path=/`
- Domain scoping with subdomain cleanup

| Cookie Name | Purpose |
|-------------|---------|
| `lastActiveOrg` | Last active organization UUID (used to route bootstrap request) |
| `CH-prefers-color-scheme` | Color mode preference |
| `anthropic-consent-preferences` | Consent preferences |
| `user-sidebar-pinned` | Sidebar pinned state |
| `user-recents-collapsed` | Recents section collapsed |
| `user-local-projects-collapsed` | Local projects collapsed |
| `user-local-recents-collapsed` | Local recents collapsed |
| `user-cowork-scheduled-collapsed` | Cowork scheduled collapsed |
| `user-cowork-starred-collapsed` | Cowork starred collapsed |
| `user-cowork-space-starred-collapsed` | Cowork space starred collapsed |
| `user-ccd-scheduled-collapsed` | CCD scheduled collapsed |
| `spaces-collapsed` | Spaces collapsed |
| `user-sidebar-visible-on-load` | Sidebar visibility on load |
| `console-sidebar-expanded` | Console sidebar expanded |
| `code-sidebar-pinned` | Code sidebar pinned |
| `skip-harmony-info-modal` | Skip harmony info modal |
| `app-shell-ctx` | App shell context |
| `return-to` | Return-to URL after auth |
| `join-token` | Team join token |
| `legal-acceptances` | Legal document acceptances |
| `aws_signup_token` | AWS signup token |
| `sessionKey` | Session key |
| `pendingLogin` | Pending login state |
| `ssoState` | SSO state |
| `locale` | User locale |
| `ajs_anonymous_id` | Segment anonymous ID |
| `analytics_session_id` | Analytics session ID |
| `_cross_domain_anonymous_id` | Cross-domain anonymous ID |
| `anthropic-device-id` | Device ID |
| `activitySessionId` | Activity session ID |
| `promo` | Promotion code |
| `_fbc` | Facebook click ID |
| `_fbp` | Facebook pixel |
| `_gcl_aw` | Google Ads click |
| `_ttclid` | TikTok click ID |
| `_rdt_cid` | Reddit click ID |
| `lti_session` | LTI session |
| `lti_canvas_domain` | LTI Canvas domain |
| `country-override` | Country override |
| `docs-sdk-lang` | Docs SDK language |
| `docs-code-block-lang` | Docs code block language |
| `starling-prompt-branch` | Starling prompt branch |

---

## 6. Service Worker Behavior

### 6.1 No Application Service Worker

Claude.ai does **not** use a service worker for application caching. The app actively **unregisters** any service workers found on startup:

```js
const IJt = "serviceWorker" in navigator;

function EJt({updateType}) {
  useEffect(() => {
    if (IJt) {
      (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length !== 0) {
          console.warn(`Found ${registrations.length} service worker(s), which are no longer used. Unregistering.`);
          registrations.forEach(reg => reg.unregister());
        }
      })();
    }
  }, []);
  return null;
}
```

This runs as a component (`EJt`) rendered in the app tree. It logs the warning message and unregisters all found SWs.

### 6.2 Firebase Messaging Service Worker

The **only** service worker registered is for Firebase Cloud Messaging (push notifications):

```js
navigator.serviceWorker.register("/firebase-messaging-sw.js")
```

This is registered only when:
1. The Firebase messaging SDK reports `isSupported()`
2. No existing registration with `firebase-messaging-sw.js` is found

The Firebase SW handles:
- Push notification delivery
- Completion notification forwarding (via `postMessage` with type `"SHOW_COMPLETION_NOTIFICATION"`)
- Background message handling

---

## 7. GrowthBook Cache

### 7.1 Bootstrap-Delivered Feature Flags

GrowthBook feature flags are **not** fetched from a GrowthBook CDN. They are delivered as part of the `/api/bootstrap` response:

```
GET /api/bootstrap/{orgUuid}/app_start?statsig_hashing_algorithm=djb2&growthbook_format=sdk
```

The response contains `org_growthbook` which is extracted and stored in the bootstrap data context.

### 7.2 Cache Strategy

- **staleTime:** 600,000 ms (10 minutes) when there is an active org, `Infinity` when logged out
- **Storage:** Lives entirely in the React Query cache (the `"current_account"` and bootstrap queries)
- **Persisted:** Yes, via the IDB cache persistence layer (since `"current_account"` is in the whitelist set `Z1`)
- **Refresh:** Re-fetched when the active org changes, on explicit `refetch()`, or when the bootstrap staleTime expires
- **URL parameters override:** Feature flags can be overridden via URL query params with patterns like `?gate.<name>=true` or `?feature.<name>=value`

### 7.3 No Separate GrowthBook Storage

There is no `gb_*` localStorage key or separate GrowthBook cache. Everything flows through the bootstrap query.

---

## 8. Statsig Cache

### 8.1 Bootstrap-Delivered Gate Values

Like GrowthBook, Statsig gate values are delivered via the `/api/bootstrap` response:

```js
{
  account: {...},
  statsig: {...org_statsig values...},
  growthbook: {...org_growthbook values...},
  statsigOrgUuid: "...",
  ...
}
```

### 8.2 Gate Checking

Gates are checked via a custom wrapper (`Bx` function) rather than the Statsig SDK directly. The gate values from the bootstrap response are used to evaluate feature gates client-side.

### 8.3 Statsig i18n Messages

Statsig-gated translations are fetched separately:
```
GET /i18n/statsig/{locale}.json
```
These are cached with `staleTime: Infinity` in the `"i18n_public"` query.

### 8.4 Cache Location

- **In-memory:** React Query cache via the bootstrap data
- **Persisted:** Yes, as part of the `"current_account"` query in IDB
- **No separate Statsig SDK cache** in localStorage (no `ss_*` or `statsig-*` keys found)

---

## 9. Offline / Network State

### 9.1 React Query Online Manager

React Query's built-in `onlineManager` is used. It:
- Uses `navigator.onLine` for initial state
- Listens to `window.addEventListener("online/offline")` events
- Pauses queries when offline, resumes when online

### 9.2 Conversation Reconnection

For Claude Code Desktop sessions, explicit offline/online handling exists:

```js
useEffect(() => {
  if (!isConnected) return;
  const offlineHandler = () => {
    updateSessionFields(sessionId, { connectionState: "disconnected" });
  };
  const onlineHandler = () => {
    reconnect();  // Q() function
  };
  window.addEventListener("offline", offlineHandler);
  window.addEventListener("online", onlineHandler);
  if (!navigator.onLine) offlineHandler();
  return () => {
    window.removeEventListener("offline", offlineHandler);
    window.removeEventListener("online", onlineHandler);
  };
}, [isConnected, sessionId, reconnect]);
```

### 9.3 VM/Desktop Offline States

The Cowork/Desktop VM has its own state machine:
- `vmRunningStatus`: `"offline"`, `"booting"`, `"ready"`
- `vmDownloadStatus`: `"checking"`, `"downloading"`, `"ready"`, `"error"`, `"not_downloaded"`
- Shows dedicated offline UI: "Desktop appears offline" message
- Attempts VM restart on status change from offline

### 9.4 Registry Fetch Error Diagnostics

Network failures include diagnostic context:
```js
this.diagnostics = {
  url: requestUrl,
  onLine: navigator.onLine,
  readyState: document.readyState,
  visibilityState: document.visibilityState,
  timeSincePageLoad: Math.round(performance.now()),
  errorName, errorMessage, errorCause
}
```

### 9.5 Error Toast Offline Context

When showing error toasts, the offline status is captured:
```js
offline_status: typeof navigator !== "undefined" ? !navigator.onLine : undefined
```

---

## 10. Prefetching

### 10.1 Router-Level Prefetching

The TanStack Router is configured with:
```js
defaultPreload: "intent",
defaultPreloadStaleTime: 0
```

This means:
- Routes are prefetched on **intent** (hover/focus on links)
- Prefetched data is considered **immediately stale** (will refetch on navigation)

### 10.2 Conversation Prefetch on Hover

When hovering over a conversation in the sidebar, the app prefetches the conversation tree:

```js
// Gated behind "claude_ai_prefetch" feature flag
// Debounced by 200ms
const prefetchConversation = useCallback((uuid) => {
  // Skip if on slow connection
  if (navigator.connection) {
    if (["slow-2g", "2g", "3g"].includes(effectiveType)
        || downlink < 1.5
        || saveData) return;
  }

  // Skip if already fetching
  if (queryClient.isFetching({ queryKey: ["chat_conversation_tree", ...] })) return;

  // Abort previous prefetch
  abortController.current?.abort();

  // Use requestIdleCallback for scheduling
  const prefetch = () => {
    queryClient.prefetchQuery({
      queryKey: ["chat_conversation_tree", {orgUuid}, {uuid}],
      queryFn: async () => fetch(`/api/organizations/${orgUuid}/chat_conversations/${uuid}?tree=True&rendering_mode=messages&render_all_tools=true`),
      staleTime: 300000  // 5 min
    });
  };
  requestIdleCallback ? requestIdleCallback(prefetch) : prefetch();
}, [...]);
```

### 10.3 Session Prefetch (Claude Code Desktop)

Similar prefetch for Claude Code Desktop sessions, with the same network quality gate:

```js
// Deduplication: skips if the same session was prefetched < 30 seconds ago
const lastPrefetch = prefetchTimestamps.get(sessionId);
if (lastPrefetch && Date.now() - lastPrefetch < 30000) return;

// Prefetches both session metadata AND events
const [sessionResult, eventsResult] = await Promise.all([
  queryClient.prefetchQuery({
    queryKey: ["qk_amber_reef_02", {orgUuid, sessionId}],  // session metadata
    staleTime: 30000,
    retry: false
  }),
  queryClient.prefetchInfiniteQuery({
    queryKey: ["qk_amber_reef_03", {orgUuid, sessionId}],  // session events
    staleTime: 30000,
    retry: false
  })
]);
```

### 10.4 Mode Tab Prefetch

When switching between modes (chat, task, code, etc.), the app prefetches the other mode routes:

```js
const JJt = {
  chat: "/new",
  task: "/task/new",
  code: "/code/new",
  epitaxy: "...",
  operon: "..."
};

// On idle, prefetch routes for tabs other than current
useEffect(() => {
  const prefetchOther = () => {
    for (const mode of allModes) {
      if (mode.key !== currentMode) {
        router.prefetch(JJt[mode.key]);
      }
    }
  };
  requestIdleCallback ? requestIdleCallback(prefetchOther) : setTimeout(prefetchOther, 2000);
}, [isReady, isAppShell, router]);
```

### 10.5 Bootstrap Eager Prefetch

On app load, the bootstrap data is eagerly prefetched before the React tree mounts:

```js
// Singleton promise - only one fetch in flight
let rx = null;
function ix() {
  return rx || (rx = ax().catch(e => {
    console.warn("[bootstrap] Eager fetch failed:", e.message);
  }));
}

// Called at module level (before render)
ix();

// Also prefetched in component
e.prefetchQuery({
  queryKey: cf(lastActiveOrg),
  queryFn: async () => {
    const data = await ix();
    if (!data) throw new Error("Eager bootstrap returned no data (logged out)");
    return data;
  },
  staleTime: 600000,  // 10 min
  retry: false
});
```

### 10.6 SPA Chunk Preload Error Recovery

```js
window.addEventListener("vite:preloadError", (event) => {
  const lastReload = Number(sessionStorage.getItem("spa_preload_reload_at") ?? 0);
  if (Date.now() - lastReload < 10000) return;  // prevent reload loop (10s cooldown)
  console.warn("[spa] chunk preload failed, reloading", event.payload);
  event.preventDefault();
  sessionStorage.setItem("spa_preload_reload_at", String(Date.now()));
  window.location.reload();
});
```

### 10.7 Google Drive Docs Prefetch

When the Kingfisher flag (`"kingfisher_prefetch"`) is enabled or the Drive dropdown is open, recent Drive docs are prefetched.

---

## 11. Memory Management

### 11.1 No Explicit WeakRef/FinalizationRegistry Usage

The only `WeakRef` found is in a PHP syntax highlighting definition (unrelated). There is no application-level use of `WeakRef` or `FinalizationRegistry`.

### 11.2 Conversation Tree Pruning (Persist-Time)

During cache persistence, conversation trees are **pruned to 3**:

```js
function persistClient(cacheState) {
  const queries = cacheState.clientState.queries;
  const conversationTrees = queries.filter(q => q.queryKey[0] === "chat_conversation_tree");
  if (conversationTrees.length <= 3) return cacheState;

  const others = queries.filter(q => q.queryKey[0] !== "chat_conversation_tree");
  conversationTrees.sort((a, b) =>
    (b.state.dataUpdatedAt ?? 0) - (a.state.dataUpdatedAt ?? 0)
  );

  return {
    ...cacheState,
    clientState: {
      ...cacheState.clientState,
      queries: [...others, ...conversationTrees.slice(0, 3)]
    }
  };
}
```

### 11.3 gcTime-Based Cleanup

React Query's garbage collection handles memory cleanup:
- **Default gcTime:** 5 minutes (TanStack Query v5 default)
- **IDB hydration gcTime:** 24 hours
- **Desktop plugin gcTime:** 10 minutes (600,000 ms)
- Queries with `gcTime: 0` are garbage collected immediately when they have no observers

### 11.4 Meta Stripping

Before persisting, all `meta` fields are stripped from queries to reduce serialized size:

```js
function stripMeta(cacheState) {
  if (cacheState.clientState.queries.some(q => q.meta)) {
    return {
      ...cacheState,
      clientState: {
        ...cacheState.clientState,
        queries: cacheState.clientState.queries.map(q =>
          q.meta ? { ...q, meta: undefined } : q
        )
      }
    };
  }
  return cacheState;
}
```

### 11.5 AbortController Cleanup

Prefetch operations use `AbortController` to cancel in-flight requests:
- Conversation prefetch: previous prefetch is aborted when a new one starts
- Session prefetch: uses abort controller with cleanup on unmount

---

## 12. Zustand Persistent Stores

Several Zustand stores use the `persist` middleware with localStorage:

| Store Name | Storage | Purpose |
|------------|---------|---------|
| `"ccd-session-store"` | localStorage | Claude Code Desktop session state (selected folders, repos) |
| `"session-diff-stats-store"` | localStorage | Diff statistics per session |
| `"session-pr-store"` | localStorage | PR data per session |
| `"cache-performance-store"` | localStorage | Cache performance metrics |
| `"session-pending-messages"` | localStorage | Pending messages per session |
| `"claude-ai"` | localStorage | Global Claude AI state |
| `"skills-nux-storage"` | sessionStorage | Skills NUX state (session-scoped) |
| `"experience-storage"` | localStorage | Experience framework state |

---

## 13. Segment Analytics Persistence

### 13.1 Persisted Queue

Segment uses a persisted event queue in localStorage:

```
persisted-queue:v1:<writeKey>:items   // Pending events
persisted-queue:v1:<writeKey>:seen    // Seen event IDs
persisted-queue:v1:<writeKey>:lock    // Lock with 50ms TTL
```

**Behavior:**
- On `pagehide`, unflushed events are serialized to localStorage
- On next load, events are restored from localStorage and merged with current queue
- Uses a simple lock mechanism (50ms TTL, 3 retry attempts with 50ms backoff)
- Queue size limit: 10 events (or 1 in simpler mode)

### 13.2 User Identity Storage

Segment stores user identity across:
- localStorage (primary)
- Cookies (fallback)
- Memory (fallback)

With keys following the `ajs_*` pattern.

---

## 14. Cache Invalidation Strategy

### 14.1 Buster-Based Cache Invalidation

The persisted cache includes a `buster` string (currently `"conversations_v2"`). When the app deploys a new bundle with a different buster, all persisted caches are invalidated:

```js
if (cachedState.buster !== e0.buster) return false;  // reject stale cache
```

### 14.2 Time-Based Expiration

The maximum age for persisted cache is 24 hours (`z1 = 864e5`):

```js
if (Date.now() - cachedState.timestamp > z1) return false;
```

### 14.3 Mutation-Based Invalidation

React Query's standard `invalidateQueries` is used after mutations. The `kJt` function subscribes to both query cache and mutation cache changes to trigger re-persistence.

---

## 15. Performance Marks and Measures

The cache system emits detailed performance metrics:

| Mark/Measure | When |
|-------------|------|
| `rq_cache:restore_start` | Before attempting cache restore |
| `rq_cache:restore_delay` | Time from page load to restore start |
| `rq_cache:idb_read` | After IDB read completes (with `cache_hit`, `query_count`, `preload_used` detail) |
| `rq_cache:restore_end` | After restore completes |
| `rq_cache:full_restore` | Full restore duration from page load |
| `rq_cache:sync_hydrate` | When synchronous hydration succeeds |
| `page.new_chat_input_ready` | When chat input is interactive |

---

## 16. Summary of All Storage Layers

| Layer | Technology | Max Age | Size Limit | What's Stored |
|-------|-----------|---------|------------|---------------|
| React Query in-memory | RAM | gcTime (5m-24h) | None explicit | All query results |
| IDB persist | IndexedDB `keyval-store` | 24 hours | ~3 conv trees + 10 query types | Whitelisted query state |
| LS mirror | localStorage `react-query-cache-ls` | 24 hours | ~5MB LS limit | Same as IDB (mobile only) |
| Cookies | document.cookie | 1 year | ~4KB per cookie | UI prefs, org ID, session, analytics |
| localStorage keys | localStorage | Until removed | ~5MB total | ~50+ keys for prefs, state, caches |
| sessionStorage | sessionStorage | Tab lifetime | ~5MB total | ~6 keys for OAuth, preload, analytics |
| Zustand persist | localStorage | Until removed | Part of LS budget | ~8 stores for session/UI state |
| Segment queue | localStorage | Until flushed | 10 events max | Analytics events pending send |
| Preloaded IDB | window global | Single use | One promise | IDB cache read started before React |
