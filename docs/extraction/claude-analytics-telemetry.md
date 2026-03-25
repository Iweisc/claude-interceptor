# Claude.ai Frontend Analytics, Telemetry & Tracking -- Complete Audit

**Source:** `index-DcrCrePJ.js` (7.2 MB minified bundle)
**Date of analysis:** 2026-03-22

---

## Table of Contents

1. [Configuration Block (All Keys & Secrets)](#1-configuration-block)
2. [Segment Analytics (Primary Event Pipeline)](#2-segment-analytics)
3. [First-Party Event Logging (`/api/event_logging/batch`)](#3-first-party-event-logging)
4. [Datadog RUM (Real User Monitoring)](#4-datadog-rum)
5. [Google Tag Manager / Google Ads](#5-google-tag-manager--google-ads)
6. [Intercom (Customer Support Chat)](#6-intercom)
7. [Sift Science (Fraud Detection)](#7-sift-science)
8. [Arkose Labs (Bot Protection / CAPTCHA)](#8-arkose-labs)
9. [Firebase Cloud Messaging (Push Notifications)](#9-firebase-cloud-messaging)
10. [Performance Monitoring](#10-performance-monitoring)
11. [Error Tracking (via Datadog RUM)](#11-error-tracking)
12. [A/B Testing & Feature Flags (Statsig + GrowthBook)](#12-ab-testing--feature-flags)
13. [Consent & Cookie Management](#13-consent--cookie-management)
14. [Isolated Marketing Pixel (Iframe Segment)](#14-isolated-marketing-pixel)
15. [Complete Event Registry (1,009 Events)](#15-complete-event-registry)

---

## 1. Configuration Block

All analytics/tracking service credentials are stored in a single config object:

```js
{
  segmentKey:                     "LKJN8LsLERHEOXkw487o7qCTFOrGPimI",
  segmentCdnHost:                 "a-cdn.anthropic.com",         // proxied Segment CDN
  segmentApiHost:                 "a-api.anthropic.com",         // proxied Segment API
  siftBeaconKey:                  "99dfa2e716",
  siftCdnHost:                    "s-cdn.anthropic.com",         // proxied Sift CDN
  arkoseKey:                      "EEA5F558-D6AC-4C03-B678-AABF639EE69A",
  arkoseCdnHost:                  "a-cdn.claude.ai",             // proxied Arkose CDN
  googleTagManagerId:             "GTM-WFZF7B4C",
  googleTagManagerAuth:           "vTe5iDF7Dkb1BUCCeKYt0Q",
  googleTagManagerEnvironment:    "env-1",
  googleOauthClientId:            "1062961139910-l2m55cb9h51u5cuc9c56eb3fevouidh9.apps.googleusercontent.com",
  stripePublishableKey:           "pk_live_51MExQ9BjIQrRQnuxA9s9ahUkfIUHPoc3NFNidarWIUhEpwuc1bdjSJU9medEpVjoP4kTUrV2G8QWdxi9GjRJMUri005KO5xdyD",
  stripePublishableKeyIreland:    "pk_live_51REyrSBNUnCSzfs9yUvED4MEXaLQQ6pVzoRIf2DGv2SxJnmquGmGmPZaVRnvgZRX8h9gw9Mm1fq2LlRjlCTAV6hZ00cWXQZQEW",
  claudeBrowserExtensionId:       "fcoeoabgfenejglbffodgkkbkcdhcgfn",
  antOnlyClaudeBrowserExtensionId:"dngcpimnedloihjnnfngkgjoidhnaolf",
  excelAddInClientId:             "966eba67-8b8c-4eae-bbb3-08361d1b9292",
}
```

---

## 2. Segment Analytics (Primary Event Pipeline)

Segment is the **primary analytics pipeline**. All `.track()` events flow through it.

### SDK Details
- **Library:** Segment analytics.js `npm:next-1.69.0`
- **Write Key:** `LKJN8LsLERHEOXkw487o7qCTFOrGPimI`
- **CDN (proxied):** `https://a-cdn.anthropic.com` (replaces `cdn.segment.com`)
- **API (proxied):** `https://a-api.anthropic.com/v1` (replaces `api.segment.io/v1`)
- **Cookie domain:** Auto-set from `window.location.hostname`
- **Client persistence:** Disabled (`disableClientPersistence: true`)
- **Delivery strategy:** Per-event dispatch (not batched at the Segment level)

### Integrations Explicitly Disabled
```js
integrations: {
  "Facebook Pixel": false,
  "DoubleClick Floodlight": false
}
```

### Identify Traits (sent on login)
When a user logs in, Segment `identify()` is called with these traits:
```js
{
  userAgent:           window.navigator.userAgent,
  fbc:                 cookie("_fbc"),          // Facebook click ID
  gclid:              cookie("_gcl_aw"),        // Google Ads click ID
  ttclid:             cookie("_ttclid"),         // TikTok click ID
  rdt_cid:            cookie("_rdt_cid"),        // Reddit click ID
  country:             ipCountry,
  email:               account.email_address,
  is_personal_email:   "personal" | "work" | "unknown",
  account_created_at:  Date.parse(account.created_at),
  account_uuid:        account.uuid,
  organization_uuid:   org.uuid,
  billing_type:        org.billing_type,
  org_type:            e.g. "claude_max", "claude_pro", "api",
  subscription_plan:   e.g. "claude_max 5x", "claude_max 20x"
}
```

### Track Call Payload Shape
Every `.track()` call includes these base properties:
```js
{
  event_key:           "the.event.name",
  account_uuid:        "user-uuid",
  organization_uuid:   "org-uuid",
  billing_type:        "stripe_subscription" | etc.,
  surface:             "claude.ai" | "cowork" | "landing_page" | "session_activity_panel",
  incognito_mode:      true/false,  // only if enabled
  // + event-specific properties
}
```

### Key Cookies Used
**Analytics cookies:**
`ajs_anonymous_id`, `ajs_user_id`, `ajs_group_id`, `analytics_session_id`, `_ga`, `_gid`, `_gat`, `_gat_gtag_UA_*`, `_ga_*`, `_dc_gtm_*`, `__utma`-`__utmz`, `__utmv`, `_gaexp`, `_gaexp_rc`, `_opt_expid`, `AMP_TOKEN`, `FPID`, `FPLC`, `TESTCOOKIESENABLED`, `li_giant`, `ln_or`, `oribi_cookie_test`, `oribili_user_guid`

**Marketing cookies:**
`_fbc`, `_fbp`, `__gads`, `__gpi`, `__gpi_optout`, `__gsas`, `_gcl_aw`, `_gcl_dc`, `_gcl_au`, `_gcl_gb`, `_gcl_gf`, `_gcl_ha`, `_gcl_gs`, `_gcl_ag`, `_gac_*`, `_gac_gb_*`, `GCL_AW_P`, `GED_PLAYLIST_ACTIVITY`, `ACLK_DATA`, `FLC`, `_opt_awcid`, `_opt_awmid`, `_opt_awgid`, `_opt_awkid`, `_opt_utmc`, `FPAU`, `FPGCLDC`, `FPGCLAW`, `FPGCLGB`, `FPGSID`, `FCCDCF`, `FCNEC`, `li_fat_id`, `ar_debug`, `_ttclid`, `_rdt_uuid`, `_rdt_cid`

### Custom Anthropic Cookies/Storage Keys
- `anthropic-consent-preferences` -- cookie consent state
- `anthropic-device-id` -- persistent device identifier
- `ajs_anonymous_id` -- Segment anonymous ID
- `_cross_domain_anonymous_id` -- cross-domain anonymous ID
- `analytics_session_id` -- analytics session ID
- `activitySessionId` -- activity session ID
- `lastActiveOrg` -- last active org UUID

---

## 3. First-Party Event Logging (`/api/event_logging/batch`)

A **separate** first-party event logging system, used specifically for **GrowthBook experiment exposure tracking**.

### Endpoint
```
POST /api/event_logging/batch
POST /api/event_logging/batch?test_mode=true   (test mode, never enabled in prod)
```

### Headers
```
Content-Type: application/json
x-service-name: claude_ai_web
x-organization-uuid: <org-uuid>   (if available)
```

### Request Body Shape
```json
{
  "events": [
    {
      "event_type": "GrowthbookExperimentEvent",
      "event_data": {
        "device_id": "<anthropic-device-id>",
        "anonymous_id": "<ajs_anonymous_id>",
        "timestamp": "2026-03-22T...",
        "experiment_id": "feature_flag_key",
        "variation_id": 0
      },
      "organization_uuid": "<org-uuid>"
    }
  ]
}
```

### Batching Behavior
- **Batch size threshold:** 50 events (flushes immediately when reached)
- **Flush interval:** 10,000ms (10 seconds)
- **Deduplication:** Events are deduplicated by `experiment_id:variation_id` pair using an in-memory `Set`
- **Page lifecycle:** Flushes on `visibilitychange` (hidden) and `pagehide`
- **Keepalive:** `true` (ensures delivery even during page unload)

---

## 4. Datadog RUM (Real User Monitoring)

### Initialization Config
```js
{
  applicationId:              "df447632-9210-4ee5-a49a-348e4fa17665",
  clientToken:                "pub71869dceb5b70dba6123af9ca357d1f9",
  site:                       "us5.datadoghq.com",
  service:                    "claude-ai",
  env:                        "production",
  version:                    process.env.NEXT_PUBLIC_BUILD_ID || "unknown",
  sessionSampleRate:          5,           // only 5% of sessions are tracked
  sessionReplaySampleRate:    0,           // session replay is OFF
  profilingSampleRate:        0,           // profiling is OFF
  defaultPrivacyLevel:        "mask",      // all text is masked by default
  trackUserInteractions:      false,       // clicks/taps NOT tracked
  trackResources:             true,        // XHR/fetch/images tracked
  trackLongTasks:             true,        // long tasks (>50ms) tracked
  enablePrivacyForActionName: true,        // action names are privacy-safe
  enableExperimentalFeatures: ["feature_flags"],
  trackingConsent:            "granted" | "not-granted",   // respects cookie consent
  allowedTracingUrls: [
    /^https:\/\/claude\.ai/,
    /^https:\/\/[^/]*\.claude\.ai/,
    /^https:\/\/anthropic\.com/,
    /^https:\/\/[^/]*\.anthropic\.com/
  ]
}
```

### Excluded Activity URLs (not tracked as RUM resources)
```
^https://a-api.anthropic.com/        (Segment API proxy)
^https://a-cdn.anthropic.com/        (Segment CDN proxy)
^https://api.segment.io/             (Segment direct)
^https://cdn.segment.com/            (Segment CDN direct)
^https://s-cdn.anthropic.com/        (Sift CDN proxy)
^https://www.googletagmanager.com/   (GTM)
^https://[^/]*\.ingest(?:\.[a-z]{2})?\.sentry\.io/   (Sentry ingest)
```

### Filtered Errors (dropped in beforeSend)
These error messages are silently dropped:
- `"ResizeObserver loop completed with undelivered notifications."`
- `"ResizeObserver loop limit exceeded"`
- `"Invalid call to runtime.sendMessage(). Tab not found."`
- Errors with `source === "report"` (CSP/deprecation reports)
- Errors whose stack trace matches browser extension patterns: `chrome-extension:`, `moz-extension:`, `safari-web-extension:`, `ms-browser-extension:`

### Custom Context Added to All Events
```js
{
  is_p4n:                  boolean,    // is prefetch-for-navigation
  prefetch_enabled:        boolean,
  desktop_app_version:     string,     // if desktop app
  desktop_app_variant:     string,     // if desktop app
  referrer_is_p4n:         boolean     // on view events only
}
```

### URL Sanitization
All URLs in RUM events (view.url, view.referrer, resource.url, error.resource.url) are sanitized via `aJt()` to strip sensitive path segments (conversation UUIDs, etc.).

### User Identification
```js
datadogRum.setUser({ id: account.uuid })
```

### Custom RUM Actions (26 total)
These are sent via `datadogRum.addAction()` with optional `duration_ms` and `addTiming()`:

| Action Name | Description |
|---|---|
| `chat.completion_non_retryable_error` | Non-retryable completion error |
| `chat.completion_retry_escalated` | Retry escalated to next strategy |
| `chat.completion_retry_exhausted` | All retries exhausted |
| `chat.completion_retry_inherited` | Retry inherited from previous attempt |
| `chat.completion_retry_initiated` | Retry initiated |
| `chat.completion_retry_recovered` | Retry succeeded |
| `chat.completion_retry_runaway_guard` | Runaway retry guard triggered |
| `chat.sse_compaction_status` | SSE compaction status |
| `chat.sse_message_start` | SSE message_start event |
| `chat.sse_message_stop` | SSE message_stop event |
| `chat.time_to_first_token` | TTFT for chat completions (timed) |
| `code.plan_modal_shown` | Code plan modal displayed |
| `code.plan_modal_skipped` | Code plan modal skipped |
| `code.session.time_to_first_token` | TTFT for code sessions (timed) |
| `code.tool_decision_live_resolve` | Tool decision resolved live |
| `code.tool_decision_post` | Tool decision posted |
| `code.tool_decision_post_result` | Tool decision result posted |
| `code.trailing_requests_hydrated` | Trailing requests hydrated |
| `page.code_session_list_ready` | Code session list load time (timed) |
| `page.code_session_open_time` | Code session open time (timed) |
| `page.code_transcript_loaded` | Code transcript load time (timed) |
| `page.members_list_ready` | Members list load time (timed) |
| `page.new_chat_input_ready` | New chat input ready time (timed) |
| `page.not_found` | 404 page hit |
| `page.project_conversations_ready` | Project conversations load time (timed) |
| `page.rq_cache_restore` | React Query cache restore time (timed) |

---

## 5. Google Tag Manager / Google Ads

### GTM Configuration
```
Container ID:   GTM-WFZF7B4C
Auth:           vTe5iDF7Dkb1BUCCeKYt0Q
Environment:    env-1
```

### gtag Consent Mode (Google Consent Mode v2)
```js
gtag("consent", "update", {
  ad_personalization:       marketing ? "granted" : "denied",
  ad_user_data:             marketing ? "granted" : "denied",
  ad_storage:               marketing ? "granted" : "denied",
  analytics_storage:        analytics ? "granted" : "denied",
  functionality_storage:    "granted",     // always granted
  personalization_storage:  "granted",     // always granted
  security_storage:         "granted"      // always granted
})
```

### gtag Events
Only **one** gtag event is fired directly from the bundle:
```js
gtag("event", "msg_sent", { location: "chat_input" })
```
This fires every time the user sends a message via the chat input.

### Facebook Pixel Cookie Generation
When marketing consent is granted, a `_fbp` cookie is generated client-side if not already present:
```js
const fbp = `fb.1.${Date.now()}.${Math.floor(9e16 * Math.random()) + 1e16}`;
// stored with maxAge = 63072000 seconds (2 years)
```

---

## 6. Intercom (Customer Support Chat)

### Integration Details
- **App ID:** `lupk8zyo`
- **Widget URL:** `https://widget.intercom.io/widget/lupk8zyo`
- **Library:** `react-use-intercom` wrapper
- **Authentication:** HMAC via `intercom_account_hash` from `/api/bootstrap` response

### Boot Behavior
- Intercom boots after the bootstrap API returns an `intercom_account_hash`
- If `intercom_account_hash` is missing, Intercom does NOT load (logged as warning)
- Boot failures are tracked via: `claudeai.intercom.booted` and `claudeai.intercom.boot_failed`

### Launcher
- CSS class `intercom-launcher` is used for the launcher element
- Visibility controlled by app state (shows on support/help pages)

### User Data Sent to Intercom
The boot call includes `app_id` and the HMAC hash for identity verification. Specific user traits are set during boot via `intercomSettings`.

---

## 7. Sift Science (Fraud Detection)

### Configuration
```
Beacon Key:    99dfa2e716
Tracker URL:   s-cdn.anthropic.com    (proxied from Sift CDN)
Script:        https://s-cdn.anthropic.com/s.js
```

### Initialization
```js
window._sift = window._sift || [];
_sift.push(["_setAccount", siftBeaconKey]);
_sift.push(["_setTrackerUrl", siftCdnHost]);
_sift.push(["_setUserId", account.uuid]);
_sift.push(["_setSessionId", activitySessionId]);
_sift.push(["_trackPageview"]);
```

### Data Collected
- **User ID:** `account.uuid`
- **Session ID:** `activitySessionId` (from local storage)
- **Page views:** Automatically tracked on load
- **All behavioral signals:** Sift's JS beacon collects mouse movements, keystroke patterns, form interactions, device fingerprint, etc.

### Loading Condition
- Only loads after bootstrap is complete and user account is available
- Loads once per session (guarded by `useRef`)

---

## 8. Arkose Labs (Bot Protection / CAPTCHA)

### Configuration
```
Enforcement Key:  EEA5F558-D6AC-4C03-B678-AABF639EE69A
CDN Host:         a-cdn.claude.ai    (proxied Arkose CDN)
Script URL:       https://a-cdn.claude.ai/v2/EEA5F558-D6AC-4C03-B678-AABF639EE69A/api.js
```

### When Challenges Appear
Arkose is enabled when ALL of these conditions are met:
1. Feature flag `ak_enabled` is `true` (via Statsig)
2. User is NOT on the desktop (Electron) app
3. User is on the web app (non-desktop check)

### Token Flow
1. Arkose script loads and calls `window.setupEnforcement` callback
2. When a token is needed (`needsToken === true`), `enforcement.run()` is called
3. On completion, the token is stored in a session storage key: `ak-session-token`
4. Token is verified server-side via `POST /api/arkose/verify` with `{ session_token: token }`
5. After verification, the token is cleared from session storage

### Challenge Events
- `onCompleted` -- challenge solved, token received
- `onShown` / `onShow` -- challenge UI displayed
- `onHide` -- challenge UI hidden
- `onError` -- challenge error

---

## 9. Firebase Cloud Messaging (Push Notifications)

### Firebase Config
```js
{
  apiKey:            "AIzaSyDu88493oN_Xq4PNVr_x8GUZPZhe-byS4U",
  authDomain:        "proj-scandium-production-5zhm.firebaseapp.com",
  projectId:         "proj-scandium-production-5zhm",
  storageBucket:     "",
  messagingSenderId: "365066964946",
  appId:             "1:365066964946:web:920eb01ec340c52cb8420b",
  measurementId:     ""     // GA4 measurement is empty/unused
}
```

### VAPID Key
```
BBn_zDr7ckBwzQe6Tdc1k6E0tSdrG64L2ddLR36jUkdaleKmAdfgt3ao93t-nib3n3oBaAtbd9KyoxHaUGJLEzU
```

### Service Worker
```
/firebase-messaging-sw.js
```

### Token Registration
FCM tokens are registered via mutation to:
```
POST /api/... (channel_type: "FCM", registration_token: token, client_app_name: "claude-ai-web")
```

### Tracked Events
- `claudeai.notification.permission.request_started`
- `claudeai.notification.permission.result` (with `permission` property)
- `claudeai.notification.clicked`

---

## 10. Performance Monitoring

### Performance Marks & Measures
The following `performance.mark()` / `performance.measure()` calls are made:

| Measure | Description |
|---|---|
| `rq_cache:restore_start` | React Query IDB cache restore begins |
| `rq_cache:restore_end` | React Query IDB cache restore complete |
| `rq_cache:sync_hydrate` | Synchronous cache hydration timing |
| `new_chat_input_ready` | Time until new chat input is interactive |
| `cowork:resume:transcript-fetch-start:{id}` | Cowork transcript fetch start |
| `cowork:resume:transcript-received:{id}` | Cowork transcript received |
| `cowork:resume:transcript-fetch:{id}` | Cowork transcript fetch duration |
| `cowork:resume:transcript-applied:{id}` | Cowork transcript applied |
| `cowork:resume:transcript-apply:{id}` | Cowork transcript apply duration |

### PerformanceObserver
A `PerformanceObserver` is used to watch for the `rq_cache:restore_end` mark to detect when React Query cache restoration is complete.

### RUM Timing via Datadog
Performance metrics are reported to Datadog RUM via `addAction` + `addTiming`:
- `page.new_chat_input_ready` -- time to interactive for new chat
- `chat.time_to_first_token` -- TTFT for completions
- `page.rq_cache_restore` -- cache restore time with detail (idb_read_ms, preload_used, cache_hit, query_count)
- `page.code_session_list_ready`, `page.code_session_open_time`, `page.code_transcript_loaded`
- `page.members_list_ready`, `page.project_conversations_ready`
- `code.session.time_to_first_token`

### No web-vitals Library
There is NO `web-vitals` library (LCP, FCP, CLS, INP, TTFB). Datadog RUM tracks these automatically via its own observers when `trackResources: true` and `trackLongTasks: true`.

---

## 11. Error Tracking (via Datadog RUM)

There is **no Sentry SDK** in this bundle. All error tracking goes through Datadog RUM.

### Error Reporting Function
```js
// yv = wrapper around datadogRum.addError()
const yv = function(error, context) {
  const rum = getDatadogRumInstance();
  if (!rum) return;
  rum.addError(error instanceof Error ? error : new Error(String(error)), context);
};
```

### Error Context Tags Used
Errors are tagged with structured context:
- `{ tags: { component, action } }` -- generic component/action pairs
- `{ tags: { feature: "ccd", ccd_source: "..." } }` -- Claude Code specific
- `{ tags: { source: "render_error_boundary", component: componentName } }` -- React error boundaries
- `{ tags: { serverUuid, serverName } }` -- MCP server errors
- `{ tags: { action: "registerServiceWorker" } }` -- service worker errors
- `{ tags: { action: "getToken" } }` -- FCM token errors

### Toast-Based Error Display
User-facing errors use a toast system (`addError`, `addApiError`). These are display-only and do NOT automatically report to Datadog.

---

## 12. A/B Testing & Feature Flags (Statsig + GrowthBook)

### Statsig
- **SDK:** Client-side Statsig
- **Hashing:** DJB2 algorithm (`statsig_hashing_algorithm=djb2`)
- **Bootstrap:** Config is fetched server-side and included in `/api/bootstrap/{orgId}/app_start` response
- **193 feature gates** are checked client-side via `checkGate()` (listed in Appendix A)

### GrowthBook
- **SDK:** Client-side GrowthBook
- **Format:** SDK format (`growthbook_format=sdk`)
- **Bootstrap:** Config included in the bootstrap response alongside Statsig
- **Exposure logging:** Via the first-party `/api/event_logging/batch` endpoint (see Section 3)

### Tracking Callback (GrowthBook)
When a user is exposed to an experiment:
```js
trackingCallback: (experiment, result) => {
  if (result.inExperiment && bootstrapIsReady) {
    Jy({   // logs to /api/event_logging/batch
      event_type: "GrowthbookExperimentEvent",
      event_data: {
        device_id:      anthropicDeviceId,
        anonymous_id:   segmentAnonymousId,
        timestamp:      new Date().toISOString(),
        experiment_id:  experiment.key,
        variation_id:   result.variationId,
        environment:    "production"
      },
      organization_uuid: orgUuid
    });
  }
}
```

### URL-Based Overrides (Anthropic Internal Only)
Anthropic employees (emails ending in `@anthropic.com` or `@sillylittleguy.org`) can override feature flags via URL params:
- `?gb_gate_<name>=true|false` -- override a gate
- `?gb_feature_<name>=<json>` -- override a feature value

---

## 13. Consent & Cookie Management

### Consent Categories
Two categories with boolean values:
- `analytics` -- controls Segment, Google Analytics, Datadog
- `marketing` -- controls GTM ads, ad cookies, Facebook cookie

### Defaults
- **Accept all:** `{ analytics: true, marketing: true }`
- **Reject all:** `{ analytics: false, marketing: false }`

### GDPR Countries (Explicit Consent Required)
Consent banner is shown for users in these countries:
```
AT, BE, BG, CH, CY, CZ, DE, DK, EE, ES, FI, FR, GB, GR, HR, HU,
IE, IS, IT, LI, LT, LU, LV, MT, NL, NO, PL, PT, RO, SE, SI, SK
```

### GPC (Global Privacy Control)
If `navigator.globalPrivacyControl` is detected, consent defaults to rejected (`{analytics: false, marketing: false}`).

### Consent Propagation
When consent changes:
1. gtag consent mode is updated
2. Segment categories are updated (loads if analytics newly granted)
3. Cookie cleanup runs (deletes marketing/analytics cookies if denied)
4. Segment tracks `"Segment Consent Preference"` event
5. If marketing newly granted, `_fbp` cookie is generated

### Storage Key
Preferences stored in: `anthropic-consent-preferences`

---

## 14. Isolated Marketing Pixel (Iframe Segment)

A **separate, isolated Segment instance** runs in an iframe for marketing conversion tracking. This is loaded when:
- Marketing consent is granted (`preferences.marketing !== false`)
- User is not on the desktop app
- Feature flag `isolated_segment_subdomain` controls URL

### Iframe URL
```
https://a.claude.ai/isolated-segment.html?v={buildId}
  or
/isolated-segment.html?v={buildId}
```

### Communication
Parent window communicates with iframe via `postMessage`:
```js
{ target: "isolated-segment", type: "track", event: "...", properties: {...} }
{ target: "isolated-segment", type: "identify", userId: "...", traits: {...} }
{ target: "isolated-segment", type: "ping" }
```

### Events Routed to Isolated Pixel
Only these 5 high-value conversion events are sent to the marketing pixel:
```
onboarding.started
extended_onboarding.started
extended_onboarding.completed
chat.conversation.first_conversation_created
payment_state_success
```

---

## 15. Complete Event Registry (1,009 Events)

The Segment event registry contains **1,009** registered event keys with versioning.
Below is the complete list grouped by domain.

### Activity Panel (7)
- `activity_panel.feedback`
- `activity_panel.resource_closed`
- `activity_panel.resource_opened`
- `activity_panel.resources_appeared`
- `activity_panel.todos_appeared`
- `activity_panel.toggle_closed`
- `activity_panel.toggle_opened`

### Apps (4)
- `apps.cowork_upgrade_clicked`
- `apps.download_button_clicked`
- `apps.harmony_directory_synced`
- `apps.nudge_banner_clicked`
- `apps.nudge_banner_shown`

### Artifacts (12)
- `artifact.callout.dismissed`
- `artifact.callout.enable_clicked`
- `artifact.callout.learn_more_clicked`
- `artifact.interaction.click`
- `artifact.popover.artifacts_tab_clicked`
- `artifact.popover.dismiss_button_clicked`
- `artifact.popover.dismiss_x_clicked`
- `artifact.public.remix`
- `artifact.public.share`
- `artifact.publish.modal.publish_button_clicked`
- `artifact.publish_button_clicked`
- `artifact.share.modal.share_button_clicked`
- `artifact.share_button_clicked`
- `artifact.studio.copy_prompt`
- `artifact.studio.create_button_clicked`
- `artifact.studio.create_mode_selected`
- `artifact.studio.remix`
- `artifact.studio.view_full_chat`
- `artifactinlinefeedback.selection.clicked`

### Claude Code Celebration (12)
- `cc_celebration.cta_clicked`
- `cc_celebration.dismissed`
- `cc_celebration.game_engagement_summary`
- `cc_celebration.game_modification_applied`
- `cc_celebration.game_section_viewed`
- `cc_celebration.install_command_copied`
- `cc_celebration.resource_link_clicked`
- `cc_celebration.scroll_down_clicked`
- `cc_celebration.section_viewed`
- `cc_celebration.shown`
- `cc_celebration.social_proof_card_clicked`
- `cc_celebration.ticket_clicked`

### Chat Suggestions (3)
- `ccos.chatsuggestion.clicked`
- `ccos.chatsuggestions.feedback`
- `ccos.chatsuggestions.loaded`

### Chat Conversations (14)
- `chat.conversation.after_completion_invalidation`
- `chat.conversation.first_conversation_created`
- `chat.conversation.token_limit_exceeded`
- `chat.conversation.token_limit_will_exceed`
- `chat.conversation.too_long_prompt:accepted`
- `chat.conversation.too_long_prompt:dismissed`
- `chat.conversation.too_long_prompt:loaded`
- `chat.conversation.too_long_prompt_warning:accepted`
- `chat.conversation.too_long_prompt_warning:dismissed`
- `chat.conversation.too_long_prompt_warning:loaded`
- `chat.conversations.force_refresh`
- `chat.conversations.invalidate`
- `chat.messages.force_refresh`
- `chat.share.button.clicked`
- `chat.share.copy_link.clicked`
- `chat.share.modal.share_button.clicked`
- `chat.share.modal.unshare_button.clicked`
- `chat.share.open_link.clicked`

(The remaining ~950 events follow the same pattern across domains including: `claudeai.*`, `cowork.*`, `code.*`, `console.*`, `docs.*`, `evals.*`, `extended_onboarding.*`, `login.*`, `mcp.*`, `onboarding.*`, `payment_*`, `spotlight.*`, `styles.*`, `television.*`, `wiggle.*`, `workbench.*`, etc.)

The full list is too large to inline here but is recorded in `/tmp/all-events-registry.txt`.

---

## Appendix A: Feature Gates (193 Statsig Gates)

All feature gates checked client-side via `checkGate()`:

```
3540182858
a11y_web_1213007053388940
add_menu_simplification
admin_settings_toronto
ak_enabled
anthropic_internal_only_expose_chat_debug
apps_use_bananagrams
apps_use_turmeric
artifact_tailwind_styles
aws_marketplace_overage
bad_moon_rising
bad_moon_rising_skip_status
bagel_enabled
c4e-analytics
c4e_analytics_api_self_serve_access
c4w_contracted_shebang
cai_cos_mcp_registry_search
can_reset_rate_limits
career_focused
cc_carrier_pigeon
ccd_terminal_enabled
ccr_autofix_ui
ccr_beam_me_up
ccr_cobalt_lantern
ccr_disable_plan_inline_comments
ccr_dynamic_island
ccr_plan_edit_mode
ccr_plan_mode_enabled
ccr_session_export
ccr_stuck_session_banner
ccr_velvet_broom
chat_autocomplete
chat_capability_controls
chat_suggestion_chips_enabled
chilling_sloth
chilling_sloth_clocks
chrome_ext_mcp_integration
cinnabon_enabled
claudeai_analysis_tool_allowed
claudeai_ccd_new_sidebar
claudeai_ccd_plugins_enabled
claudeai_cc_epitaxy
claudeai_cc_new_chat
claudeai_collapse_timeline_groups
claudeai_completion_status_sidebar
claudeai_cowork_backend_marketplaces_main
claudeai_cowork_file_explorer_main
claudeai_crabby_claws_enabled
claudeai_default_wiggle_egress_enabled
claudeai_default_wiggle_egress_enabled_without_spotlight
claude_ai_ember
claudeai_fsi_skill_chips
claude_ai_image_search
claudeai_image_search_feedback
claudeai_inline_conversation_creation
claudeai_interactive_content_admin_setting
claude_ai_learning_mode
claudeai_majordomo_enabled
claudeai_mcp_apps_visualize
claudeai_mcp_bootstrap_eager
claude_ai_mcp_directory_web_only
claudeai_monkeys_in_a_barrel_spotlight
claude_ai_msg_idempotency
claude_ai_ms_v2
claude_ai_prefetch
claude_ai_project_bananagrams
claude_ai_pubsec_get_help
claudeai_restore_prompt_on_abort
claudeai_saffron_admin_toggle_enabled
claudeai_saffron_default_enabled
claudeai_saffron_enabled
claudeai_saffron_ghost_enabled
claudeai_saffron_port_enabled
claudeai_saffron_search_default_enabled
claudeai_saffron_search_enabled
claudeai_saffron_themes_enabled
claude_ai_segment_enabled
claudeai_simplified_slash_menu_enabled
claudeai_skills
claudeai_skip_foreground_notifications
claudeai_slash_connectors
claude_ai_sticky_project_settings
claudeai_tools_page
claude_ai_unicode_sanitize_mcp_data
claudeai_unsafe_prompt_inline
claudeai_use_cached_stream
claude_ai_velvet_accordion
claude_ai_voice_mode
claudeai_wiggle_egress_settings
claude_code_waffles
claude_create_marble
claude_create_pebble_stone
claude_grove_enabled
code_desktop_app_install_banner
code_slack_app_install_banner
completion_retry_disabled
completion_retry_emergency
console_nutmeg
cowork_amber_horizon
cowork_auto_permission_mode
cowork_bypass_permissions_mode
cowork_default_landing_enabled
cowork_drive_export
cowork_error_retry_button
cowork_feedback_button
cowork_ideas_tab
cowork_launch_code_session
cowork_otlp
cowork_redownload_spotlight
cowork_referrals
cowork_rewind_button
cowork_safety_banners
cowork_snapshot_sync
cowork_tester_overrides_admin
cowork_upsell_banner
crochet_eligible_for_ant_only_build
crooked_sundial
crystal_ember_lantern
default_wiggle_on
desktop_dictation_voice
disable_destructive_mcp_tools_by_default
ef_enabled
enabled_brioche
enabled_brioche_banner
enable_pixie
end_user_invites
fiddlehead
free-user-custom-connectors
ghe_support_enabled
gift_subscriptions_enabled
github_disabled
haystack_enabled
internal_test_account_tools_enabled
internal_tier_selector
is_desktop_upsell_enabled
isolated_segment_subdomain
janus_claude-ai
kingfisher_enabled
kingfisher_prefetch
legal_acceptances_on_social_login
log_segment_events
luggage_citrus
mcp_bootstrap_first_pass_enabled
mcp_clear_cache
mcp_gdrive
mcp_shttp
mcp_tb_sessions
mention_provider_desktop
mention_provider_mcp_resources
model_selector_enabled
move_conversation_to_projects
my_access_general_rollout
nebula_drift_enabled
ooc_attachments_enabled
overage_billing_mobile_support
overages_upsell_disabled
papi_mcp
past_due_subscription_enforcement
plain_text_input
prism_enabled
project_image
rag_prototype
read_only_mode
rely_on_analysis_flag
rusty_compass
sensitive_mcps_per_call_consent
show_claude_desktop_download_link
spider_enabled_2
sticky_model_selector
suggested_connectors
suggested_connectors_desktop_chat
suggested_plugins
swiss_cheese_is_the_enemy_of_the_mango
tengu_bridge_repl_v2_api
tibro_enabled
tmp_claudeai_connector_suggestion_error_state
tmp_claudeai_mcp_auth_errors_ui
trials_and_tribulations_of_high_school_football
ucr_route_handler_pdf_conversion
use_incoherent_traffic_light_noises
velvet_compass
velvet_horizon
wiggle_enabled
wiggle_graduated
yukon_gold_debug_menu_enabled
yukon_silver
yukon_silver_clocks
yukon_silver_cuttlefish
yukon_silver_extension_install
yukon_silver_fishing
yukon_silver_folders
yukon_silver_octopus
yukon_silver_thinking
```

---

## Appendix B: Dynamic `.track()` Event Keys (from Call Sites)

These event keys are used in direct `.track()` calls but may not appear in the static registry (runtime-constructed or used with additional properties):

```
claudeai.app_install_banner.clicked
claudeai.app_install_banner.dismissed
claudeai.app_install_banner.displayed
claudeai.c4excel_chat_banner_upsell.cta_clicked
claudeai.c4excel_chat_banner_upsell.dismissed
claudeai.c4excel_chat_banner_upsell.displayed
claudeai.c4ppt_chat_banner_upsell.cta_clicked
claudeai.c4ppt_chat_banner_upsell.dismissed
claudeai.c4ppt_chat_banner_upsell.displayed
claudeai.code.onboarding.env_setup.completed
claudeai.code.onboarding.env_setup.error
claudeai.code.onboarding.env_setup.option_selected
claudeai.config.reporting_endpoint_fallback
claudeai.conversation.citation_clicked
claudeai.conversation_search.account_setting_toggled
claudeai.cowork_guest_pass_upsell_banner.cta_clicked
claudeai.cowork_guest_pass_upsell_banner.dismissed
claudeai.cowork_guest_pass_upsell_banner.displayed
claudeai.cowork_upsell_banner.cta_clicked
claudeai.cowork_upsell_banner.dismissed
claudeai.cowork_upsell_banner.displayed
claudeai.desktop.keep_awake_toggled
claudeai.experiment.feedback_submitted
claudeai.in_chat_upsell.connect_gdrive.displayed
claudeai.in_chat_upsell.connect_gdrive.start
claudeai.incognito_mode.toggled
claudeai.memory.account_setting_toggled
claudeai.memory.edit_memory
claudeai.memory.edit_modal_opened
claudeai.memory.import_resynthesize_completed
claudeai.memory.import_resynthesize_failed
claudeai.memory.import_submitted
claudeai.memory.memory_reset
claudeai.memory.org_setting_toggled
claudeai.memory.skipped_spotlight_summary
claudeai.mentions.dropdown.opened
claudeai.mentions.option.selected
claudeai.message.completion_failed
claudeai.message.duplicate_key
claudeai.message.recovery_completed
claudeai.message.recovery_started
claudeai.onboarding_first_chat.category_changed
claudeai.onboarding_first_chat.chip_clicked
claudeai.onboarding_first_chat.shown
claudeai.overages.enabled
claudeai.overages_or_upgrades_upsell_modal.closed
claudeai.overages_or_upgrades_upsell_modal.overages_clicked
claudeai.overages_or_upgrades_upsell_modal.upgrade_clicked
claudeai.overages_or_upgrades_upsell_modal.viewed
claudeai.plus_menu.opened
claudeai.plus_menu.screenshot_clicked
claudeai.projects.project_starter.clicked
claudeai.sidebar.state_set
claudeai.skills.file_save_skill.clicked
claudeai.slash_command_menu.auto_resolved
claudeai.slash_command_menu.item_selected
claudeai.slash_command_menu.opened
claudeai.team_promo.ending_banner.clicked
claudeai.team_promo.ending_banner.dismissed
claudeai.team_promo.ending_banner.shown
claudeai.thinking_cell.clicked
claudeai.tool.feedback_submitted
claudeai.unhandled_error_code
cowork.file_explorer.entry_clicked
cowork.file_explorer.file_previewed
cowork.file_explorer.opened
cowork.file.gdrive_export.attempted
cowork.file.gdrive_export.failed
cowork.file.gdrive_export.success
cowork.file.open_action
cowork.launch_code_session
cowork.memory_editor.dismissed
cowork.memory_editor.loaded
cowork.memory_editor.opened
cowork.memory_editor.saved
cowork.memory_editor.save_failed
file_upload_too_large
grove_policy_dismissed
grove_policy_submitted
grove_policy_toggled
grove_policy_viewed
image_search.domain_clicked
image_search.image_clicked
image_search.malformed_images
share
spotlight.action_clicked
spotlight.dismissed
spotlight.shown
sse_interrupted
styles.custom.describe_clicked
styles.custom.describe_selected
styles.modal
styles.selected
wiggle_egress_spotlight.cta_clicked
wiggle_egress_spotlight.toggle_changed
wiggle_egress_spotlight.viewed
wiggle.file.add_to_project
wiggle.file.copy_to_clipboard
wiggle.file.created
wiggle.file.download_as_pdf
wiggle.file.gdrive_export.attempted
wiggle.file.gdrive_export.failed
wiggle.file.gdrive_export.success
wiggle.gdrive.connection.initiated
wiggle.gdrive.connection.modal_shown
wiggle.gdrive.connection.success
```

---

## Summary Table

| System | Purpose | Proxied? | Consent Required? | Sample Rate |
|--------|---------|----------|-------------------|-------------|
| **Segment** | Primary analytics pipeline | Yes (a-cdn/a-api.anthropic.com) | Analytics | 100% |
| **Datadog RUM** | Real user monitoring, errors, performance | No (us5.datadoghq.com) | Analytics | 5% of sessions |
| **GTM / Google Ads** | Marketing conversion tracking | No | Marketing | 100% (when consented) |
| **Intercom** | Customer support chat | No (widget.intercom.io) | Always (functional) | 100% |
| **Sift Science** | Fraud/abuse detection | Yes (s-cdn.anthropic.com) | Always (security) | 100% |
| **Arkose Labs** | Bot protection / CAPTCHA | Yes (a-cdn.claude.ai) | Always (security) | Feature-flagged |
| **Firebase FCM** | Push notifications | No (firebaseapp.com) | Permission-based | 100% of opted-in |
| **First-party logging** | A/B test exposure tracking | N/A (first-party) | Always | 100% |
| **Isolated Segment (iframe)** | Marketing pixel conversion | Yes (a.claude.ai) | Marketing | 5 events only |

### NOT Present
- **Sentry** -- No Sentry SDK. Error tracking is via Datadog RUM only. (Sentry ingest URLs appear only in the Datadog exclusion list.)
- **Facebook Pixel** -- Explicitly disabled in Segment integration config
- **DoubleClick Floodlight** -- Explicitly disabled in Segment integration config
- **Hotjar / FullStory / LogRocket / Mixpanel / Amplitude / Heap / PostHog** -- None present
- **Web Vitals library** -- Not included (Datadog RUM handles this internally)
