# Claude.ai Frontend Bundle Analysis: Sidebar, Settings, Org Management & Preferences

**Source:** `index-DcrCrePJ.js` (7.2 MB minified)
**Analysis date:** 2026-03-22

---

## 1. Sidebar / Conversation List

### 1.1 Sidebar Modes

The sidebar supports multiple modes determined by the current URL path:

```js
function sF(e) {
  return e
    ? e.startsWith("/claude-code-desktop") ? "code"
    : e.startsWith("/task") || e.startsWith("/scheduled-task") || e.startsWith("/local_sessions") || e.startsWith(`${Gz}/`) || e.startsWith("/cowork/agent") ? "task"
    : e.startsWith("/operon") ? "operon"
    : "/new" === e || "/recents" === e || e.startsWith("/chat/") || e.startsWith("/project/") ? "chat"
    : null
    : null;
}
```

Modes: `chat`, `task`, `code`, `operon` (workspaces). Stored in localStorage via `nF = "sidebar-selected-mode"`.

### 1.2 Sidebar State (localStorage keys)

All sidebar prefs are stored under the `Io` enum keys:

| Key Constant              | localStorage Key                          | Purpose                         |
|---------------------------|-------------------------------------------|---------------------------------|
| `SIDEBAR_PINNED`          | `user-sidebar-pinned`                     | Whether sidebar stays open      |
| `SIDEBAR_VISIBLE_ON_LOAD` | `user-sidebar-visible-on-load`            | Show on page load               |
| `RECENTS_COLLAPSED`       | `user-recents-collapsed`                  | Collapse recent conversations   |
| `LOCAL_PROJECTS_COLLAPSED`| `user-local-projects-collapsed`           | Collapse local projects         |
| `LOCAL_RECENTS_COLLAPSED` | `user-local-recents-collapsed`            | Collapse local recents          |
| `COWORK_SCHEDULED_COLLAPSED` | `user-cowork-scheduled-collapsed`      | Collapse scheduled tasks        |
| `COWORK_STARRED_COLLAPSED`| `user-cowork-starred-collapsed`           | Collapse starred cowork items   |
| `COWORK_SPACE_STARRED_COLLAPSED` | `user-cowork-space-starred-collapsed` | Collapse space starred items |
| `CCD_SCHEDULED_COLLAPSED` | `user-ccd-scheduled-collapsed`            | Claude Code Desktop scheduled   |
| `SPACES_COLLAPSED`        | `spaces-collapsed`                        | Collapse spaces                 |
| `CODE_SIDEBAR_PINNED`     | `code-sidebar-pinned`                     | Code sidebar pin state          |
| `CONSOLE_SIDEBAR_EXPANDED`| `console-sidebar-expanded`                | Console sidebar state           |

### 1.3 Conversation List API

**Primary endpoint (v2):**
```
GET /api/organizations/${orgUuid}/chat_conversations_v2?limit=N&offset=N&starred=BOOL&searchQuery=STR&consistency=eventual|strong
```

**Query key structure:**
```js
queryKey: [af, {orgUuid: o}, {limit: e, offset: t, starred: s, searchQuery: a}]
// af = "chat_conversation_list"
```

**Parameters:**
- `limit` — number of conversations per page (default: 30, as `_j = 30`)
- `offset` — pagination offset (offset-based pagination, NOT cursor-based)
- `starred` — boolean filter for starred conversations
- `searchQuery` — text filter
- `consistency` — `"eventual"` (default when within staleness window) or `"strong"` (forced on invalidation)

**Stale time config:**
```js
Mj = {
  conversations_stale_time_sec: 300,           // 5 minutes default stale time
  conversations_only_strong_consistency_for_invalidation: false,
  conversations_force_refresh_window_secs: 0,
  conversations_explicit_strong_consistency: true
}
```

The client uses `sessionStorage` to track `conversations_last_timestamp_${orgUuid}` and skips strong consistency reads within the `force_refresh_window_secs` window.

**Legacy v1 endpoint (still used in some codepaths):**
```
GET /api/organizations/${orgUuid}/chat_conversations?limit=N&offset=N
```

### 1.4 Conversation Search

**API-backed search (not client-side filter):**
```
GET /api/organizations/${orgUuid}/conversation/search?query=TERM&n=10
```

- Search is triggered when query length >= 3 characters
- Uses `staleTime: 60000` (1 minute)
- Debounced input; cached results preserved across re-renders
- The `searchQuery` param on `chat_conversations_v2` also does server-side filtering

**Conversation Search (Saffron) feature flag: `claudeai_saffron_search_enabled`**

Toggle via:
```js
PATCH /api/account/settings  { enabled_saffron_search: true/false }
```

When enabled, there's also a backfill endpoint:
```
POST /api/organizations/${orgUuid}/conversation/backfill
```

### 1.5 Date Grouping (Sidebar Headings)

Conversations in the sidebar are grouped into three buckets with these headings:

```js
// Cowork/task sidebar groups by index ranges:
headingKey: "today"     // index 0..a  (today's date)
headingKey: "yesterday" // index a..r  (yesterday)
headingKey: "older"     // index r..end
```

```html
"today"     → "Today"
"yesterday" → "Yesterday"
"older"     → "Older"
```

For relative time labels elsewhere (e.g., "last active" badges):
```js
function n0t(e) {
  const t = U.now();
  const n = t.diff(e, "minutes").minutes;
  const s = t.diff(e, "hours").hours;
  const a = t.diff(e, "days").days;
  // n < 5       → "Just now"
  // s < 1       → "Past hour"
  // same day    → "Today"
  // day - 1     → "Yesterday"
  // a < 7       → "Past week"
  // a < 30      → "Past month"
  // else        → formatted date
}
```

### 1.6 Starred Conversations

**Star/unstar mutation:**
```js
// PUT /api/organizations/${orgUuid}/chat_conversations/${uuid}
// Body: { is_starred: true/false }
```

**Starred filter query:**
```
GET /api/organizations/${orgUuid}/chat_conversations_v2?starred=true
```

**Analytics events:**
- `claudeai.conversation.starred`
- `claudeai.conversation.unstarred`
- `claudeai.projects.starred` / `claudeai.projects.unstarred`
- `claudeai.cowork.session.starred`

The sidebar separates starred items from non-starred:
```js
k = d.useMemo(() => m.filter(e => !!e.isStarred && !e.scheduledTaskId && "agent" !== e.sessionType), [...])
j = d.useMemo(() => m.filter(e => !e.scheduledTaskId && !e.isStarred && "agent" !== e.sessionType), [...])
```

Starred section collapsible via `Io.COWORK_STARRED_COLLAPSED`.

### 1.7 Project-Grouped Conversations

Projects list endpoint:
```
GET /api/organizations/${orgUuid}/projects_v2?limit=30&offset=0&starred=BOOL&creator_filter=STR&filter=STR&order_by=STR&searchQuery=STR&is_archived=BOOL
```

Project conversations:
```
GET /api/organizations/${orgUuid}/projects/${projectUuid}/...
```

Project count:
```
GET /api/organizations/${orgUuid}/projects/count
```

### 1.8 "New Chat" Button Behavior

The button renders with label "New chat" (`id: "ATDyLPIoxz"`).

Navigation targets by sidebar mode:
```js
{
  task: { href: Bz, label: "New task" },        // Bz = task creation route
  code: { href: "/claude-code-desktop", label: "New session" },
  chat: { href: "/new", label: "New chat" },
  epitaxy: { href: Xz, label: "New session" },
  operon: { href: Yz, label: "New workspace" }
}
```

If user hasn't finished onboarding (`has_finished_claudeai_onboarding === false`), they get redirected:
```js
const e = ET(`/chat/${I}`);
const t = new URLSearchParams;
t.append("returnTo", e);
const n = `/onboarding?${t.toString()}`;
f.push(n);
```

### 1.9 Bulk Conversation Operations

**Move many:**
```
POST /api/organizations/${orgUuid}/chat_conversations/move_many
```

**Delete many:**
```
POST /api/organizations/${orgUuid}/chat_conversations/delete_many
```

**Share:**
```
POST /api/organizations/${orgUuid}/chat_conversations/${uuid}/share
```

### 1.10 Sidebar Analytics Events

```
claudeai.sidebar.dispatch_clicked
claudeai.epitaxy.sidebar.toggled
claudeai.recordplayer.sidebar.toggled
claudeai.sidebar.state_set
claudeai.sidebar.chats_clicked
claudeai.sidebar.projects_clicked
claudeai.sidebar.nav_item_clicked
claude_code_web.sidebar.code_clicked
```

### 1.11 Sidebar Keyboard Shortcut

```js
toggle_sidebar: {
  bindings: [
    { key: "k", modifiers: ["cmd", "ctrl"], platform: "mac" },
    { key: "k", modifiers: ["ctrl", "alt"], platform: "non-mac" }
  ]
}
```

---

## 2. Settings Pages

### 2.1 URL Routing & Redirects

**Current settings pages:**

| Route                              | Purpose                        |
|------------------------------------|--------------------------------|
| `/settings/general`               | Profile + Appearance + Prefs   |
| `/settings/members`               | Organization member management |
| `/settings/billing`               | Subscription/billing           |
| `/settings/usage`                 | Usage stats                    |
| `/settings/capabilities`          | Preview features / skills      |
| `/settings/connectors`            | MCP integrations / connectors  |
| `/settings/claude-code`           | Claude Code settings           |
| `/settings/data-privacy-controls` | Data & privacy controls        |

**Admin-level settings (enterprise/raven orgs):**

| Route                                    | Purpose                     |
|------------------------------------------|-----------------------------|
| `/admin-settings/organization`           | Org info                    |
| `/admin-settings/usage`                  | Org usage stats             |
| `/admin-settings/data-privacy-controls`  | Org data/privacy controls   |
| `/admin-settings/identity`               | SSO/identity config         |
| `/admin-settings/capabilities`           | Org capability controls     |
| `/admin-settings/connectors`             | Org connector config        |
| `/admin-settings/claude-code`            | Org Claude Code config      |

**Legacy redirects:**
```js
{ source: "/settings/appearance",    destination: "/settings/general" }
{ source: "/settings/profile",       destination: "/settings/general" }
{ source: "/settings",               destination: "/settings/general" }
{ source: "/settings/organization",  destination: "/settings/members" }
{ source: "/settings/preferences",   destination: "/settings/general" }
{ source: "/settings/team",          destination: "/settings/members" }
{ source: "/settings/features",      destination: "/settings/capabilities" }
{ source: "/settings/privacy",       destination: "/settings/data-privacy-controls" }
{ source: "/settings/integrations",  destination: "/settings/connectors" }
{ source: "/settings/admin",         destination: "/admin-settings/data-privacy-controls" }
{ source: "/settings/data-management", destination: "/admin-settings/data-privacy-controls" }
{ source: "/settings/identity",      destination: "/admin-settings/identity" }
```

### 2.2 Settings API Endpoints

**Account-level:**
```
GET  /api/account?statsig_hashing_algorithm=djb2         — Full account data
PUT  /api/account?statsig_hashing_algorithm=djb2         — Update account (name, settings)
PATCH /api/account/settings                              — Partial settings update
GET  /api/account_profile                                — Profile data (avatar, etc.)
PUT  /api/account_profile                                — Update profile
GET  /api/account/deletion-allowed                       — Check if deletion is permitted
PUT  /api/account/accept_legal_docs                      — Accept terms
PUT  /api/account/email_consent                          — Email consent update
POST /api/account/grove_notice_viewed                    — Mark grove modal as seen
GET  /api/account/raven_eligible                         — Check Teams eligibility
```

**Bootstrap (app init):**
```
GET /api/bootstrap/${orgUuid}/app_start?statsig_hashing_algorithm=djb2&growthbook_format=sdk
```

Returns: account, memberships, invites, organizations, feature flags, Statsig/GrowthBook config.

### 2.3 Settings Analytics

```
claudeai.settings.preview_feature.toggled
claudeai.settings.preview_feature.opened
claudeai.settings.capabilities.opened
claudeai.settings.export_data.submitted
claudeai.settings.export_audit_logs.submitted
claudeai.settings.referral_section.shown
claudeai.settings.referral_section.link_copied
claudeai.settings.cowork_referral_section.shown
claudeai.settings.cowork_referral_section.link_copied
claudeai.invite_link.settings.toggled
claudeai.invite_link.settings.copied
claudeai.invite_link.settings.regenerated
claudeai.invite_link.settings.expired_seen
claudeai.member_invite.settings.toggled
```

---

## 3. User Preferences

### 3.1 Account Settings Object

Fields found on `account.settings`:

| Field                                  | Type      | Purpose                              |
|----------------------------------------|-----------|--------------------------------------|
| `has_finished_claudeai_onboarding`     | boolean   | Onboarding completion                |
| `grove_enabled`                        | boolean/null | Training data consent (null=not chosen) |
| `grove_notice_viewed_at`               | string    | Last grove modal view time           |
| `enabled_saffron`                      | boolean   | Memory feature enabled               |
| `enabled_saffron_search`               | boolean   | Chat search enabled                  |
| `enabled_artifacts_attachments`        | boolean   | Artifacts attachment support         |
| `enabled_bananagrams`                  | boolean   | (internal feature)                   |
| `enabled_mcp_tools`                    | boolean   | MCP tools                            |
| `enabled_wiggle_egress`                | boolean   | File egress from sandbox             |
| `enabled_gdrive_indexing`              | boolean   | Google Drive indexing                 |
| `enabled_monkeys_in_a_barrel`          | boolean   | (internal feature)                   |
| `voice_preference`                     | string    | Voice mode preference                |
| `orbit_enabled`                        | boolean   | Orbit feature                        |
| `orbit_timezone`                       | string    | Orbit timezone                       |
| `dismissed_claudeai_banners`           | array     | List of dismissed banner IDs         |
| `cowork_onboarding_completed_at`       | string    | Cowork onboarding timestamp          |
| `wiggle_egress_spotlight_viewed_at`    | string    | Timestamp                            |
| `ccr_auto_archive_on_pr_close`         | boolean   | Auto-archive on PR close             |
| `preview_feature_uses_artifacts`       | boolean   | Preview artifacts feature            |

**Update via:**
```
PATCH /api/account/settings  { key: value, ... }
```

Internal settings (prefixed `internal_`) are stripped before transmission:
```js
function tZ(e) {
  return Object.fromEntries(Object.entries(e).filter(([e]) => !e.startsWith("internal_")));
}
```

### 3.2 Profile Endpoint

```
GET  /api/account_profile     — Query key: "account_profile"
PUT  /api/account_profile     — Update profile
```

Used to display/edit display_name, full_name, avatar.

### 3.3 Personalized Response Styles

**Endpoint:**
```
GET /api/organizations/${orgUuid}/list_styles
```

Returns `defaultStyles` and `customStyles` arrays.

Stored in localStorage: `claude_personalized_style`

Sent in message body as:
```js
personalized_styles: e.personalized_style ? [e.personalized_style] : void 0
```

**Custom style creation:**
```
POST /api/organizations/${orgUuid}/styles/create
```

### 3.4 Incognito Mode

Query parameter: `?incognito`

When enabled:
- Conversations are not saved to history
- Not added to memory
- Not used for model training (if grove is enabled)
- Tracked via `incognito_mode: true` in analytics

Toggle event: `claudeai.incognito_mode.toggled`

### 3.5 Theme / Appearance

**Theme storage:** localStorage key `userThemeMode`, values: `"auto"`, `"light"`, `"dark"`

```js
const [l, c] = x_("userThemeMode", "auto");  // default "auto"
```

Theme application:
```js
const Pve = e => {
  if ("undefined" == typeof document) return;
  document.documentElement.dataset.theme = e;
  // Also sets <meta name="theme-color">
};
```

Theme provider context:
```js
{
  theme: s,        // resolved theme ("light" | "dark")
  setTheme: a,     // setter
}
```

System theme detection: `matchMedia("(prefers-color-scheme: dark)")`

Electron integration: `window.electronWindowControl?.setThemeMode?.("auto" === p ? "system" : p)`

**Note:** `/settings/appearance` now redirects to `/settings/general` (combined page).

---

## 4. Organization Management

### 4.1 Organization Info

**Endpoint:**
```
GET /api/organizations/${orgUuid}    — Query key: "org"
```

**Organization profile:**
```
GET  /api/organizations/${orgUuid}/profile    — Query key: "org_profile"
PUT  /api/organizations/${orgUuid}/profile    — Update org profile
```

**Organization capabilities** (from `activeOrganization` object):
- `"api"` — API access
- `"raven"` — Teams plan
- `"claude_pro"` — Pro plan
- `"claude_max"` — Max plan

**Plan type detection:**
```js
_y = () => {
  const e = by();     // raven capability
  const t = xy();     // claude_pro capability
  const n = yy();     // claude_max capability
  return e ? "raven" : t ? "claude_pro" : n ? "claude_max" : "free";
}
```

**Organization types (raven_type):**
- `"enterprise"` — Enterprise
- `"team"` — Team

**Billing types:**
- `"stripe_subscription"` — Standard Stripe
- `"stripe_subscription_enterprise_self_serve"` — Enterprise self-serve
- `"stripe_subscription_contracted"` — Enterprise contracted
- `"aws_marketplace"` — AWS Marketplace
- `"apple_subscription"` — Apple subscription
- `"google_play_subscription"` — Google Play subscription
- `"usage_based"` — Usage-based billing
- `"prepaid"` — Prepaid credits
- `"none"` — No billing

### 4.2 Roles & Permissions

**Roles (ascending privilege):**

| Role                 | Key Permissions                                      |
|----------------------|------------------------------------------------------|
| `managed`            | (none)                                               |
| `user`               | `members:view`, `workspaces:view`, `workbench:view`  |
| `claude_code_user`   | `members:view`, `workspaces:view`, `workbench:view`  |
| `membership_admin`   | `members:view`, `members:manage`, `analytics:view`   |
| `developer`          | `members:view`, `api:view`, `api:manage`, `usage:view`, `cost:view`, `workspaces:view`, `limits:view`, `security_keys:manage`, `workbench:view` |
| `billing`            | `members:view`, `billing:view`, `billing:manage`, `cost:view`, `usage:view`, `invoices:view`, `workspaces:view`, `limits:view`, `workbench:view` |
| `admin`              | `members:view/manage`, `api:view/manage`, `billing:view/manage`, `cost:view`, `usage:view`, `invoices:view`, `organization:manage`, `export:data`, `export:members`, `workspaces:view/manage`, `limits:view`, `security_keys:manage`, `analytics:view`, `workbench:view` |
| `owner`              | Everything admin has + `integrations:manage`, `owners:manage`, `enterprise_auth:manage`, `membership_admins:manage`, `export:audit_logs` |
| `primary_owner`      | Everything owner has + `compliance:manage`, `scoped_api_keys:manage` |

**Permission check:**
```js
Qb = (role, permission) => Jb[role].includes(permission);
```

### 4.3 Member Management API

**List members (v1):**
```
GET /api/organizations/${orgUuid}/members?roles[]=owner&roles[]=primary_owner
```

**List members (v2 with pagination):**
```
GET /api/organizations/${orgUuid}/members_v2?offset=N&limit=N&search=STR&roles[]=...&types[]=member&types[]=invite
```

**Member counts:**
```
GET /api/organizations/${orgUuid}/members/counts
```
Returns: `{ total, pending_invites_total, by_seat_tier: {...}, pending_invites_by_seat_tier: {...} }`

**Update member:**
```
PUT /api/organizations/${orgUuid}/members/${memberUuid}
```

**Remove member:**
```
DELETE /api/organizations/${orgUuid}/members/${memberUuid}
```

**Members limit:**
```
GET /api/organizations/${orgUuid}/members_limit
```
Returns: `{ minimum_seats, members_limit, seat_tier_quantities }`

Default minimum seats: `5`

### 4.4 Invite Flow

**Send invite (admin):**
```
POST /api/organizations/${orgUuid}/invites
```

**List invites:**
```
GET /api/organizations/${orgUuid}/invites
```

**Accept invite:**
```
POST /api/auth/accept_invite
```

**End-user invite requests (non-admin members inviting):**
```
POST /api/organizations/${orgUuid}/invite_requests
POST /api/organizations/${orgUuid}/invite_requests/bulk
```

**Member invite link toggle (admins):**
```
GET /api/organizations/${orgUuid}/member_invites
PUT /api/organizations/${orgUuid}/member_invites   { enabled: true/false }
```

**Discoverable orgs:**
```
GET /api/organizations/discoverable
GET /api/organizations/discoverability/check-domains?domains=STR&organization_uuid=UUID
```

**Get or create chat org:**
```
POST /api/accounts/me/organizations/get_or_create_chat_organization
```

Feature flag: `end_user_invites`

### 4.5 Seat Tiers

All valid seat tier values:
```js
$b = [
  "unassigned",
  "enterprise_standard",
  "enterprise_lite",
  "enterprise_nonprofit",
  "enterprise_bendep_global_access",
  "enterprise_bendep_premium",
  "enterprise_higher_ed",
  "team_standard",
  "team_tier_1",
  "team_bendep_nonprofit_premium",
  "enterprise_tier_1",
  "enterprise_usage_based",
  "enterprise_usage_based_chat",
  "enterprise_hipaa_chat",
  "enterprise_hipaa_chat_and_code"
]
```

Usage-based seat tiers (enables overages): `Zb = ["enterprise_usage_based", "enterprise_usage_based_chat", "enterprise_hipaa_chat", "enterprise_hipaa_chat_and_code"]`

**Assignable tiers endpoint:**
```
GET /api/organizations/${orgUuid}/members/assignable_seat_tiers
```
Returns: `{ assignable_seat_tiers: [...], default_new_member_tier: "...", org_has_usage_based_seats: bool }`

**Contracted quantity (enterprise):**
```
POST /api/organizations/${orgUuid}/contracted_quantity
```

---

## 5. Billing / Subscription UI

### 5.1 Subscription Endpoints

```
GET  /api/organizations/${orgUuid}/subscription_details   — Query key: "subscription_details"
GET  /api/organizations/${orgUuid}/paused_subscription_details — Paused sub info
GET  /api/organizations/${orgUuid}/subscription_status
GET  /api/organizations/${orgUuid}/trial_status
PUT  /api/organizations/${orgUuid}/end_subscription       — Cancel subscription
GET  /api/organizations/${orgUuid}/subscription/scheduled_seat_tier_changes
PUT  /api/organizations/${orgUuid}/subscription/cancel_scheduled_seat_tier_changes
POST /api/organizations/${orgUuid}/subscription/verify-payment
PUT  /api/organizations/${orgUuid}/pause_subscription
```

### 5.2 Stripe Integration

```
POST /api/stripe/${orgUuid}/intent   — Create payment intent
```

Stripe keys loaded per region:
- `stripePublishableKey` (default / US)
- `stripePublishableKeyIreland` (Ireland)
- `stripePublishableKeySandbox` (sandbox)

Uses `@stripe/stripe-js` loaded dynamically.

### 5.3 Billing Page

```
/settings/billing   — Payment method, subscription details
```

**Promotion system:**
```
GET /api/billing/promotion/${promotionId}
```
Stored in cookie `Io.PROMOTION = "promo"`

**Invoice list:**
```
GET /api/organizations/${orgUuid}/invoices (query key: "invoice_list")
GET /api/organizations/${orgUuid}/upcoming_invoice (query key: "upcoming_invoice")
```

### 5.4 Overage / Spend Limits

```
GET  /api/organizations/${orgUuid}/overage_spend_limit?seat_tier=...
POST /api/organizations/${orgUuid}/overage_spend_limit
```

### 5.5 Upgrade/Downgrade Flow

**Analytics events:**
```
billing.upgrade.select_plan.loaded
billing.upgrade.select_plan.completed
billing.upgrade.payment_info.loaded
billing.upgrade.payment_info.submitted
billing.upgrade.setup_billing.loaded
billing.upgrade.setup_billing.submitted
billing.upgrade.contact_sales.loaded
billing.upgrade.contact_sales.completed
billing.upgrade.ts_questionnaire.loaded
billing.upgrade.ts_questionnaire.submitted
billing.credit_card.submitted
pro_subscription.upgraded_to_annual
pro_subscription.upgraded_to_max
max_subscription.downgraded_to_max
max_subscription.downgraded_to_pro
max_subscription.extension_coupon_redeemed
claudeai.upgrade.pro_page_viewed
claudeai.upgrade.max_page_viewed
claudeai.upgrade.enterprise_contact_sales.click
```

**Max plan sub-tiers:** `max_5x` and `max_20x` (based on `rate_limit_tier`):
```js
wy = () => {
  const e = ky();
  return "default_claude_max_5x" === e ? "max_5x" : "default_claude_max_20x" === e ? "max_20x" : void 0;
}
```

### 5.6 Seat Upgrade Requests (Admin)

```
GET /api/organizations/${orgUuid}/admin/seat_upgrade_requests   (query key: "admin_seat_upgrade_requests")
GET /api/organizations/${orgUuid}/admin/limit_increase_requests  (query key: "admin_limit_increase_requests")
```

### 5.7 Purchasable Seat Allocations

```
GET /api/organizations/${orgUuid}/purchasable_seat_allocations
```

### 5.8 Retention Coupon

```
GET /api/organizations/${orgUuid}/retention_coupon_eligibility
```

### 5.9 Prepaid Credit Balance

```
GET /api/organizations/${orgUuid}/balance (query key: "stripe-balance")
```

---

## 6. Appearance / Theme

### 6.1 Theme Modes

Three modes: `"auto"`, `"light"`, `"dark"`

**Storage:** `localStorage key: "userThemeMode"`, default `"auto"`

**Resolved theme:**
```js
function Bve(mode) {
  // "auto" → checks window.matchMedia("(prefers-color-scheme: dark)")
  // "light" → "light"
  // "dark" → "dark"
}
```

**Application:** Sets `document.documentElement.dataset.theme = "light" | "dark"` and updates `<meta name="theme-color">`.

**Color mode cookie:** `Io.COLOR_MODE = "CH-prefers-color-scheme"` — used during SSR/initial load.

### 6.2 Design Token Classes

The bundle uses Tailwind CSS with custom tokens:
- `text-text-100` through `text-text-500` (text hierarchy)
- `bg-bg-000` through `bg-bg-300` (background hierarchy)
- `border-border-200`, `border-border-300`
- `text-accent-100` (accent color)
- `z-sidebar` (sidebar z-index layer)

---

## 7. Memory System

### 7.1 Memory Endpoints

```
GET  /api/organizations/${orgUuid}/memory                             — Global memory
GET  /api/organizations/${orgUuid}/memory?project_uuid=${projectUuid} — Project-scoped memory
POST /api/organizations/${orgUuid}/memory/synthesize                  — Re-synthesize memory
POST /api/organizations/${orgUuid}/memory/reset                      — Reset all memory
PUT  /api/organizations/${orgUuid}/memory/controls                   — Update memory controls
GET  /api/organizations/${orgUuid}/memory/themes                     — Memory themes
```

**Memory data shape (Zod schema `R2`):**
```js
{
  memory: string,
  controls: string[] | null,
  updated_at: string (datetime) | null
}
```

### 7.2 Memory Feature Flags

- `claudeai_saffron_enabled` — Master memory feature flag
- `claudeai_saffron_search_enabled` — Chat search
- `claudeai_saffron_admin_toggle_enabled` — Org admin can toggle
- `claudeai_saffron_ghost_enabled` — Ghost mode
- `claudeai_saffron_port_enabled` — Memory port feature
- `claudeai_memory_themes` — Memory themes

### 7.3 Memory Settings Toggle

**User-level:**
```
PATCH /api/account/settings  { enabled_saffron: true/false }
```
Event: `claudeai.memory.account_setting_toggled`

**Org-level (admin):**
Org policy can block: `status: "blocked_by_org_admin"` or `"blocked_by_platform"`

Disabling memory for the org permanently deletes all team memories:
```
"Disabling memory will permanently delete all memories for your team. This can't be undone."
```

### 7.4 Memory Analytics

```
claudeai.memory.account_setting_toggled
claudeai.memory.org_setting_toggled
claudeai.memory.memory_reset
claudeai.memory.import_submitted
claudeai.memory.import_resynthesize_completed
claudeai.memory.import_resynthesize_failed
claudeai.memory.import_see_in_action_clicked
claudeai.memory.import_prompt_copied
claudeai.memory_themes.themes_displayed
claudeai.memory_themes.theme_used
claudeai.memory_themes.fallback_triggered
```

---

## 8. Notification Preferences

### 8.1 Consent System

**Consent categories cookie:** `Io.CONSENT_PREFERENCES = "anthropic-consent-preferences"`

Consent categories: `analytics`, `marketing` (at minimum).

**Email consent:**
```
PUT /api/account/email_consent
```

**Consents management (MCP-related):**
```
PUT  /api/accounts/me/consents
POST /api/accounts/me/consents/check
POST /api/accounts/me/consents/revoke
```

### 8.2 Desktop Notifications

```js
fO = globalThis["claude.web"]?.DesktopNotifications
```

Analytics:
```
claudeai.notification.permission.request_started
claudeai.notification.permission.result
claudeai.notification.clicked
claudeai.television.notification_modal.viewed
```

---

## 9. Data Export / Deletion

### 9.1 Data Export

**Analytics event:** `claudeai.settings.export_data.submitted`
**Audit logs export:** `claudeai.settings.export_audit_logs.submitted`

**Permissions required:**
- `export:data` — available to admin, owner, primary_owner roles
- `export:members` — same roles
- `export:audit_logs` — owner and primary_owner only

### 9.2 Account Deletion

**Pre-check endpoint:**
```
GET /api/account/deletion-allowed
```
Query key: `["current_account_deletable", account.uuid]`, staleTime: 0 (always fresh)

Returns whether the current account is eligible for deletion.

### 9.3 Auth Endpoints

```
POST /api/auth/logout                   — Single session logout
POST /api/auth/logout/all-sessions      — All sessions logout
POST /api/auth/send_magic_link          — Magic link login
POST /api/auth/exchange_nonce_for_code  — Nonce exchange
GET  /api/auth/login_methods?email=...  — Available login methods
POST /api/auth/verify_google            — Google OAuth
GET  /api/enterprise_auth/idp_redirect_url?organization_id=... — SSO redirect
GET  /api/enterprise_auth/sso_callback  — SSO callback
```

---

## 10. Referral System

### 10.1 Referral Endpoints

```
GET  /api/referral                                                          — Current user referral info
GET  /api/referral/code/${code}                                             — Validate referral code
GET  /api/organizations/${orgUuid}/referral/eligibility?campaign=X&source=Y  — Check eligibility
GET  /api/organizations/${orgUuid}/referral/redemptions?campaign=X            — Redemption history
GET  /api/referral/guest/redeemed?campaign=X                                — Guest redemptions
```

### 10.2 Referral UI

Feature flag: `claudeai_referral`

**Analytics:**
```
claudeai.settings.referral_section.shown
claudeai.settings.referral_section.link_copied
claudeai.settings.cowork_referral_section.shown
claudeai.settings.cowork_referral_section.link_copied
```

**Cowork guest pass upsell:** Banner key `"cowork_guest_pass_upsell_banner"`, uses referral link display.

**Referral code in payment flow:**
```js
referralCode: n ?? e.referralCode,
referralSource: s ?? e.referralSource
// Sent to: /api/organizations/${uuid}/subscription/verify-payment
```

Invalid referral code error: `"This referral code is no longer valid"`

---

## 11. Onboarding / First-Run

### 11.1 Onboarding Gate

```js
vv = ({ account, isClaudeDot }) =>
  isClaudeDot
    ? false === account.settings.has_finished_claudeai_onboarding
    : !account.full_name || !account.display_name;
```

If onboarding is not finished, navigating to a new chat redirects to `/onboarding?returnTo=...`.

### 11.2 Onboarding Analytics Events

```
onboarding.started
onboarding.completed
onboarding.pubsec_system_use.started
onboarding.phone_verification.start
onboarding.phone_verification.sent_code
onboarding.phone_verification.invalid_code
onboarding.phone_verification.verified_code
onboarding.phone_verification.error_sending_code
onboarding.age_verification.start
onboarding.age_verification.complete
onboarding.name_input.started
onboarding.name_input.finished
onboarding.acceptable_use.started
onboarding.acceptable_use.finished
onboarding.disclaimers.started
onboarding.disclaimers.finished
```

### 11.3 Extended Onboarding Flow

```
extended_onboarding.started
extended_onboarding.disclaimer.completed
extended_onboarding.name_input.completed
extended_onboarding.work_function.completed
extended_onboarding.drive_integration.started / skipped / completed
extended_onboarding.gmail_integration.started / skipped / completed
extended_onboarding.gcal_integration.started / skipped / completed
extended_onboarding.topics.completed
extended_onboarding.example_prompts.completed
extended_onboarding.completed
extended_onboarding.hear_about.completed / source_selected / skipped
extended_onboarding.code_upgrade.completed
extended_onboarding.code_intro.completed
extended_onboarding.code_install.completed
extended_onboarding.mcp_single.connect_clicked / connected / skipped / completed
extended_onboarding.mcp_multi.connect_clicked / skipped / continue_clicked
```

### 11.4 Grove Notice (Training Data Consent Modal)

Shown when: `null === account.settings.grove_enabled && feature_flag("claude_grove_enabled") && !isRavenOrg && !hasRavenInvite && !onBillingPage`

**Grace period:** Can be dismissed with "Not now". Reminder frequency controlled by `claude_grove_config.notice_reminder_frequency`.

**Actions:**
- Accept → `PATCH /api/account/settings { grove_enabled: true }`
- "Not now" → `POST /api/account/grove_notice_viewed` (marks cooldown)

Event: `grove_policy_submitted`

### 11.5 B2B Onboarding

Query key: `"b2b_onboarding"`

Admin activation tasks:
```
GET /api/organizations/${orgUuid}/admin_activation/tasks
```

Events:
```
claudeai.admin_activation.panel.shown
claudeai.admin_activation.panel.dismissed
claudeai.admin_activation.panel.auto_dismissed
claudeai.admin_activation.panel.completed
```

---

## 12. Additional Noteworthy Features

### 12.1 Command Palette / Navigation

```js
chats: {
  description: "Conversations",
  group: "navigation",
  searchHints: ["conversations", "history", "messages"],
  icon: pC,
  href: "/chats"
}
projects: {
  description: "Projects",
  group: "navigation",
  icon: bw,
  href: "/projects"
}
```

Command palette shortcut:
```js
{ key: "k", modifiers: ["cmd", "ctrl"], platform: "mac" }
{ key: "k", modifiers: ["ctrl", "alt"], platform: "non-mac" }
```

### 12.2 Banners System

```
GET /api/banners
```
Dismissed banners tracked in `account.settings.dismissed_claudeai_banners`.

### 12.3 OAuth / Sync Integrations

```
GET  /api/oauth/organizations/${orgUuid}/oauth_tokens
GET  /api/organizations/${orgUuid}/sync/github/auth
GET  /api/organizations/${orgUuid}/sync/mcp/drive/auth
GET  /api/organizations/${orgUuid}/sync/mcp/outline/auth
GET  /api/organizations/${orgUuid}/sync/settings/config
```

### 12.4 MCP Remote Servers

```
POST   /api/organizations/${orgUuid}/mcp/remote_servers   — Create server
DELETE /api/organizations/${orgUuid}/mcp/remote_servers    — Delete server
POST   /api/organizations/${orgUuid}/mcp/v...              — MCP protocol
POST   /api/organizations/${orgUuid}/mcp/attach_resource   — Attach resource
POST   /api/organizations/${orgUuid}/mcp/remote_servers/${uuid}/clear_cache — Clear cache
```

### 12.5 Skills / Capabilities

```
GET    /api/organizations/${orgUuid}/skills/enable
POST   /api/organizations/${orgUuid}/skills/edit
```

### 12.6 Project Account Settings (per-project)

```
GET /api/organizations/${orgUuid}/projects/${projectUuid}/settings
PUT /api/organizations/${orgUuid}/projects/${projectUuid}/settings
```
Query key: `"project_account_settings"`

### 12.7 All Query Key Constants

```js
const tf  = "scoped_api_key_list"
const nf  = "account_profile"
const sf  = "banners"
const af  = "chat_conversation_list"
const rf  = "chat_conversation_tree"
const of  = "chat_failed_stream_retry"
const lf  = "current_account"
const df  = "invoice_list"
const uf  = "upcoming_invoice"
const pf  = "model_config"
const mf  = "org_invites"
const hf  = "org_members"
const ff  = "org_members_v2"
const gf  = "org_member_counts"
const xf  = "org_profile"
const bf  = "b2b_onboarding"
const yf  = "org"
const vf  = "allowed_domains"
const Cf  = "ip_allowlist"
const wf  = "subscription_details"
const _f  = "purchasable_seat_allocations"
const kf  = "scheduled_seat_tier_changes"
const jf  = "subscription_status"
const Mf  = "trial_status"
const Sf  = "paused_subscription_details"
const Nf  = "project"
const If  = "starter_project"
const Ef  = "projects_count"
const Af  = "project_list"
const Tf  = "project_list_v2"
const Lf  = "artifacts_list"
const Rf  = "project_list_conversations"
const Of  = "project_doc"
const Df  = "project_doc_list"
const Pf  = "project_sync_list"
const Ig  = "mcp-remote-servers"
const Og  = "generate_title_and_branch"
const Pg  = "account_standing"
const zg  = "memory_synthesis"
const Fg  = "overage_spend_limit"
const Bg  = "overage_spend_limits_list"
const Ug  = "overage_seat_tier_default"
const qg  = "prepaid_credit_balance"
const Vg  = "browser_extension_settings"
const Gg  = "skills"
const $g  = "org_skills"
const Hg  = "skill_accounts_list"
const Wg  = "plugins"
const Zg  = "remote_marketplaces"
const Kg  = "remote_marketplace_plugins"
const Xg  = "pending_admin_request"
const Yg  = "admin_seat_upgrade_requests"
const Jg  = "admin_limit_increase_requests"
const Sg  = "list_styles"  (inferred from context)
```

### 12.8 Full localStorage / Cookie Key Registry (Io enum)

```js
var Io = {
  LAST_ACTIVE_ORG:                  "lastActiveOrg",
  COLOR_MODE:                       "CH-prefers-color-scheme",
  CONSENT_PREFERENCES:              "anthropic-consent-preferences",
  SIDEBAR_PINNED:                   "user-sidebar-pinned",
  RECENTS_COLLAPSED:                "user-recents-collapsed",
  LOCAL_PROJECTS_COLLAPSED:         "user-local-projects-collapsed",
  LOCAL_RECENTS_COLLAPSED:          "user-local-recents-collapsed",
  COWORK_SCHEDULED_COLLAPSED:       "user-cowork-scheduled-collapsed",
  COWORK_STARRED_COLLAPSED:         "user-cowork-starred-collapsed",
  COWORK_SPACE_STARRED_COLLAPSED:   "user-cowork-space-starred-collapsed",
  CCD_SCHEDULED_COLLAPSED:          "user-ccd-scheduled-collapsed",
  SPACES_COLLAPSED:                 "spaces-collapsed",
  SIDEBAR_VISIBLE_ON_LOAD:          "user-sidebar-visible-on-load",
  CONSOLE_SIDEBAR_EXPANDED:         "console-sidebar-expanded",
  CODE_SIDEBAR_PINNED:              "code-sidebar-pinned",
  SKIP_HARMONY_INFO_MODAL:          "skip-harmony-info-modal",
  APP_SHELL_CTX:                    "app-shell-ctx",
  RETURN_TO:                        "return-to",
  JOIN_TOKEN:                       "join-token",
  LEGAL_ACCEPTANCES:                "legal-acceptances",
  AWS_SIGNUP_TOKEN:                 "aws_signup_token",
  SESSION_KEY:                      "sessionKey",
  PENDING_LOGIN:                    "pendingLogin",
  SSO_STATE:                        "ssoState",
  LOCALE:                           "locale",
  SEGMENT_ANONYMOUS_ID:             "ajs_anonymous_id",
  ANALYTICS_SESSION_ID:             "analytics_session_id",
  SEGMENT_CROSS_DOMAIN_ANONYMOUS_ID: "_cross_domain_anonymous_id",
  DEVICE_ID_KEY:                    "anthropic-device-id",
  ACTIVITY_SESSION_ID:              "activitySessionId",
  PROMOTION:                        "promo",
  FBCLID:                           "_fbc",
  FBP:                              "_fbp",
  GOOGLE_GCL_AW:                    "_gcl_aw",
  TTCLID:                           "_ttclid",
  RDT_CID:                          "_rdt_cid",
  LTI_SESSION:                      "lti_session",
  LTI_CANVAS_DOMAIN:                "lti_canvas_domain",
  COUNTRY_OVERRIDE:                 "country-override",
  DOCS_SDK_LANGUAGE:                "docs-sdk-lang",
  DOCS_CODE_BLOCK_LANGUAGE:         "docs-code-block-lang",
  STARLING_PROMPT_BRANCH:           "starling-prompt-branch"
}
```
