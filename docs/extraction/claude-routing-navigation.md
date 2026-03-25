# Claude.ai Frontend Routing & Navigation Analysis

**Source:** `index-DcrCrePJ.js` (7.2 MB, Vite-bundled)
**Router:** TanStack Router (`ro()` = route creator, `getParentRoute`, `addChildren`)
**Date analyzed:** 2026-03-22

---

## 1. Complete URL Route Tree

### 1.1 Route Hierarchy Key

| Parent Variable | Path Prefix | Description |
|-----------------|-------------|-------------|
| `V0t` | `/` | Root layout (top-level, no auth wrapper) |
| `G0t` | `/` | Authenticated layout (requires org) |
| `e3t` | `/` | Auth group layout (login/logout/join) |
| `X0t` | `/chat` | Chat layout |
| `J0t` | `/settings` | Settings layout |
| `E2t` | `/admin-settings` | Admin settings layout |
| `t2t` | `/customize` | Customize layout |
| `T2t` | `/analytics` | Analytics layout |
| `v2t` | `/claude-code-desktop` | Claude Code Desktop layout |
| `d2t` | `/` (projects group) | Projects group layout |
| `g2t` | `/artifacts` | Artifacts nav layout |
| `S3t` | `/create` | Org creation layout |
| `E3t` | `/create/enterprise` | Enterprise creation layout |
| `W3t` | `/upgrade` | Upgrade layout |
| `n5t` | `/downgrade` | Downgrade layout |
| `c3t` | `/code` | Claude Code (web) layout |
| `d3t` | `/code` (with sidebar) | Code with sidebar layout |
| `m3t` | `/code` (without sidebar) | Code without sidebar layout |
| `l5t` | `/share` | Share layout |
| `i2t` | `/cowork/agent` | Cowork agent layout |
| `H2t` | `/experiments/symphony` | Symphony experiments layout |
| `s2t` | `/scheduled-task` | Scheduled task layout |
| `$0t` | (session detail) | Session detail parent |
| `b3t` | `/code/scheduled` | Code scheduled layout |

### 1.2 Auth Group Routes (No Auth Required)

Parent: `e3t` (AuthGroupLayoutRoute)

| Path | Component | Description |
|------|-----------|-------------|
| `/login` | `LoginRoute` | Login page |
| `/login/app-google-auth` | `LoginAppGoogleAuthRoute` | Google auth for native app |
| `/login/popup-google-auth` | `LoginPopupGoogleAuthRoute` | Google auth popup flow |
| `/logout` | `LogoutRoute` | Logout |
| `/logout/all-sessions` | `LogoutAllSessionsRoute` | Logout all sessions |
| `/join/$token` | `JoinRoute` | Join via invite token |
| `/join/org/$token` | `JoinOrgRoute` | Join org via token |
| `/referral/$code` | `ReferralRoute` | Referral code redemption |

### 1.3 Pre-Auth / System Routes

Parent: `V0t` (root layout, no auth guard)

| Path | Component | Description |
|------|-----------|-------------|
| `/` | (root component) | Checks auth, redirects to `/login` or authenticated layout |
| `/$shortlink` | (shortlink resolver) | Probes API for shortlink, renders 404 on miss |
| `/no-organization` | (inline) | "Account not associated with org" error page |
| `/logged-in` | `LoggedInRoute` | Post-login landing |
| `/share` | `ShareLayoutRoute` | Share layout |
| `/share/$snapshot_uuid` | `ShareSnapshotRoute` | View shared conversation snapshot |
| `/gift` | `GiftRoute` | Gift subscription |
| `/gift/redeem` | `GiftRedeemRoute` | Redeem gift code |
| `/create` | `CreateLayoutRoute` | Org creation flow |
| `/create/name` | `CreateNameRoute` | Name the org |
| `/create/invites` | `CreateInvitesRoute` | Invite members |
| `/create/billing` | `CreateBillingRoute` | Billing setup |
| `/create/billing/pending/$organization_id` | `CreateBillingPendingRoute` | Pending billing |
| `/create/enterprise` | `CreateEnterpriseLayoutRoute` | Enterprise creation |
| `/create/enterprise/` | `CreateEnterpriseIndexRoute` | Enterprise index |
| `/create/enterprise/explanation` | `CreateEnterpriseExplanationRoute` | Enterprise explanation |
| `/create/enterprise/qualification` | `CreateEnterpriseQualificationRoute` | Enterprise qualification |
| `/create/enterprise/review` | `CreateEnterpriseReviewRoute` | Enterprise review |
| `/create/enterprise/seats` | `CreateEnterpriseSeatsRoute` | Enterprise seats |
| `/create/enterprise/setup-type` | `CreateEnterpriseSetupTypeRoute` | Enterprise setup type |
| `/create/enterprise/pending/$organization_id` | `CreateEnterprisePendingRoute` | Enterprise pending |
| `/upgrade` | `UpgradeLayoutRoute` | Upgrade flow |
| `/upgrade/` | `UpgradeIndexRoute` | Upgrade index |
| `/upgrade/pro` | `UpgradeProRoute` | Upgrade to Pro |
| `/upgrade/pro/annual` | `UpgradeProAnnualRoute` | Pro annual |
| `/upgrade/pro/from-existing` | `UpgradeProFromExistingRoute` | Pro from existing |
| `/upgrade/max` | `UpgradeMaxRoute` | Upgrade to Max |
| `/upgrade/max/from-existing` | `UpgradeMaxFromExistingRoute` | Max from existing |
| `/upgrade/team/annual` | `UpgradeTeamAnnualRoute` | Team annual |
| `/upgrade/trial` | `UpgradeTrialRoute` | Trial signup |
| `/downgrade` | `DowngradeLayoutRoute` | Downgrade flow |
| `/downgrade/pro` | `DowngradeProRoute` | Downgrade from Pro |
| `/downgrade/max` | `DowngradeMaxRoute` | Downgrade from Max |
| `/team-promo` | `TeamPromoLayoutRoute` | Team promo |
| `/team-promo/$offerCode` | `TeamPromoRoute` | Specific team promo offer |
| `/interviewer` | `InterviewerRoute` | Interviewer layout |
| `/interviewer/$interviewType` | `InterviewerDetailRoute` | Specific interview type |
| `/invites` | `InvitesRoute` | Invite management |
| `/cli_landing` | `CliLandingLayoutRoute` | CLI landing |
| `/cli_landing/` | `CliLandingRoute` | CLI landing index |
| `/claude-ship` | `ClaudeShipLayoutRoute` | Claude Ship layout |
| `/claude-ship/` | `ClaudeShipPageRoute` | Claude Ship index |
| `/claude-ship/$id` | `ClaudeShipIdRedirectRoute` | Claude Ship by ID |
| `/excel-ppt-cowork` | (inline) | Excel/PPT cowork |
| `/excel-ppt-setup` | (lazy loaded) | Excel/PPT setup |

### 1.4 Standalone / System Routes (No Parent Nesting)

| Path | Component | Description |
|------|-----------|-------------|
| `/org-discovery` | `OrgDiscoveryRoute` | Org discovery |
| `/restricted` | `RestrictedRoute` | Restricted access |
| `/unauthorized` | `UnauthorizedRoute` | Unauthorized |
| `/age-verification` | `AgeVerificationRoute` | Age verification |
| `/us-govt-system-warning` | `UsGovtSystemWarningRoute` | US govt warning |
| `/enterprise-tos` | `EnterpriseTosRoute` | Enterprise ToS |
| `/maintenance` | `MaintenanceRoute` | Maintenance mode |
| `/reported` | `ReportedRoute` | Account reported |
| `/sso-callback` | `SsoCallbackRoute` | SSO callback |
| `/sso-callback/desktop-app` | `SsoCallbackDesktopAppRoute` | SSO for desktop app |
| `/sso-callback/ios` | `SsoCallbackIosRoute` | SSO for iOS |
| `/onboarding/enterprise` | `OnboardingEnterpriseRoute` | Enterprise onboarding |
| `/onboarding/role` | `OnboardingRoleRoute` | Role selection onboarding |
| `/oauth/authorize` | `OAuthAuthorizeRoute` | OAuth authorization |
| `/oauth/code/success` | `OAuthCodeSuccessRoute` | OAuth code success |
| `/download` | `DownloadRoute` | Download page |
| `/downloads` | `DownloadsRoute` | Downloads page |
| `/desktop/tutorial` | `DesktopTutorialRoute` | Desktop tutorial |
| `/chrome` | `ChromeRoute` | Chrome extension |
| `/chrome/installed` | `ChromeInstalledRoute` | Chrome extension installed |
| `/claude-code-install` | `ClaudeCodeInstallRedirectRoute` | Code install redirect |
| `/claude-code/install` | `ClaudeCodeInstallRoute` | Code install |
| `/lti/error` | `LtiErrorRoute` | LTI error |
| `/lti/first-party` | `LtiFirstPartyRoute` | LTI first-party |
| `/lti/storage-access` | `LtiStorageAccessRoute` | LTI storage access |
| `/directory` | (inline, TKt) | Connector directory |
| `/directory/$uuid` | (redirect) | Redirects to `/new?directory-open=true&directory-uuid=$uuid` |
| `/remix` | (inline, RKt) | Remix artifact |
| `/connector/$serverId/auth_done` | (inline, OKt) | Connector auth callback |
| `/connect/github/callback` | (inline) | GitHub connect callback |
| `/org/$organization_id` | (redirect) | Redirects to `/` |
| `/settings/billing/$organization_id` | (redirect) | Redirects to `/settings/billing` |
| `/onboarding` | `OnboardingRoute` | Onboarding |
| `/aws_marketplace` | `AwsMarketplaceRoute` | AWS Marketplace |
| `/magic-link` | `MagicLinkRoute` | Magic link login |
| `/support/enterprise` | `SupportEnterpriseRoute` | Enterprise support |
| `/drive-auth` | `DriveAuthRoute` | Google Drive auth |
| `/github-success` | `GithubSuccessRoute` | GitHub connection success |
| `/build-info` | `BuildInfoRoute` | Build info page |
| `/voice-prototype` | `VoicePrototypeRoute` | Voice prototype |
| `/mcp/playground` | `McpPlaygroundRoute` | MCP playground |
| `/mobile/test-clientside-tool-webview` | `MobileWebviewTestRoute` | Mobile webview test |
| `/enterprise/order/$accessToken` | `EnterpriseOrderRoute` | Enterprise order |
| `/mobile/web-view-sandbox-runtime/$organization_uuid` | `MobileWebviewSandboxRoute` | Mobile sandbox |
| `/browser-session/$organizationUuid/$conversationUuid` | `BrowserSessionRoute` | Browser session |
| `/artifacts/$artifact_version_uuid` | `ArtifactVersionRoute` | Artifact version view |
| `/desktop/$` | `DesktopDeepLinkRoute` | Desktop deep link catch-all |

### 1.5 Authenticated Routes (Require Org)

Parent: `G0t` (authenticated layout)

#### Chat Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/chat` | (chat layout, `X0t`) | Chat wrapper with sidebar |
| `/chat/` | (redirect to `/`) | Redirects to home |
| `/chat/$uuid` | (conversation component, `Y0t`) | Specific conversation |
| `/chat/new` | (new chat within chat layout) | New chat alias |
| `/chats` | (chats list, `D2t`) | Conversation list |
| `/new` | (new chat page) | New conversation |

#### Project Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/projects` | `ProjectsListRoute` | Projects list |
| `/projects/create` | `ProjectsCreateRoute` | Create project |
| `/projects/no-permission` | `ProjectsNoPermissionRoute` | No permission |
| `/project/$uuid` | `ProjectDetailRoute` | Project detail |
| `/project/$uuid/setup` | `ProjectSetupRoute` | Project setup |

#### Artifact Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/artifacts` | `ArtifactsNavLayoutRoute` | Artifacts layout |
| `/artifacts/` | `ArtifactsIndexRoute` | Artifacts index |
| `/artifacts/my` | `ArtifactsMyRoute` | My artifacts |
| `/artifacts/inspiration/$id` | `ArtifactsInspirationRoute` | Artifact inspiration |

#### Claude Code Desktop Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/claude-code-desktop` | (desktop layout, `v2t`) | CCD layout |
| `/claude-code-desktop/` | (index) | CCD home |
| `/claude-code-desktop/onboarding` | (onboarding) | CCD onboarding |
| `/claude-code-desktop/$uri` | (session) | CCD session by URI |
| `/claude-code-desktop/scheduled` | (scheduled list) | CCD scheduled tasks |
| `/claude-code-desktop/scheduled/$id` | (scheduled detail) | CCD scheduled task detail |
| `/claude-code-desktop/scheduled/remote/$triggerId` | (remote trigger) | CCD remote trigger |
| `/claude-code-desktop/dispatch` | (dispatch) | CCD dispatch |

#### Settings Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/settings` | `SettingsLayoutRoute` (lazy) | Settings layout |
| `/settings/general` | (lazy) | General settings |
| `/settings/account` | (lazy) | Account settings |
| `/settings/billing` | (lazy) | Billing settings |
| `/settings/browser-extension` | (lazy) | Browser extension settings |
| `/settings/capabilities` | (lazy) | Capabilities / features |
| `/settings/claude-code` | (lazy) | Claude Code settings |
| `/settings/connectors` | (lazy) | Connectors settings |
| `/settings/connectors/$connectorId` | (lazy) | Specific connector |
| `/settings/cowork` | (lazy) | Cowork settings |
| `/settings/data-privacy-controls` | (lazy) | Data privacy |
| `/settings/desktop` | (lazy) | Desktop settings |
| `/settings/desktop/developer` | (lazy) | Desktop developer |
| `/settings/desktop/extensions` | (lazy) | Desktop extensions |
| `/settings/desktop/extensions/advanced` | (lazy) | Extensions advanced |
| `/settings/desktop/extensions/manage-directory` | (lazy) | Manage extension directory |
| `/settings/desktop/extensions/$extensionId` | (lazy) | Specific extension |
| `/settings/join-proposal` | (lazy) | Join proposal |
| `/settings/mcp/auth_done` | (lazy) | MCP auth done |
| `/settings/mcp/auth_error` | (lazy) | MCP auth error |
| `/settings/mcp/auth_mismatch` | (lazy) | MCP auth mismatch |
| `/settings/members` | (lazy) | Members management |
| `/settings/plugins/submissions` | (lazy) | Plugin submissions |
| `/settings/plugins/submit` | (lazy) | Submit plugin |
| `/settings/sys-prompt` | (lazy) | System prompt |
| `/settings/usage` | (lazy) | Usage |

#### Admin Settings Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/admin-settings` | `AdminSettingsLayoutRoute` (lazy) | Admin settings layout |
| `/admin-settings/billing` | (lazy) | Org billing |
| `/admin-settings/browser-extension` | (lazy) | Browser extension admin |
| `/admin-settings/capabilities` | (lazy) | Capabilities admin |
| `/admin-settings/capabilities/organization-skills` | (lazy) | Org skills |
| `/admin-settings/claude-code` | (lazy) | Claude Code admin |
| `/admin-settings/connectors` | (lazy) | Connectors admin |
| `/admin-settings/connectors/tunnels` | (lazy) | Connector tunnels |
| `/admin-settings/cowork` | (lazy) | Cowork admin |
| `/admin-settings/data-privacy-controls` | (lazy) | Data privacy admin |
| `/admin-settings/groups` | (lazy) | Groups admin |
| `/admin-settings/identity` | (lazy) | Identity/SSO admin |
| `/admin-settings/members` | (lazy) | Members admin |
| `/admin-settings/organization` | (lazy) | Organization admin |
| `/admin-settings/plugins` | (lazy) | Plugins admin |
| `/admin-settings/roles` | (lazy) | Roles admin |
| `/admin-settings/skills` | (lazy) | Skills admin |
| `/admin-settings/usage` | (lazy) | Usage admin |

#### Customize Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/customize` | `CustomizeLayoutRoute` (lazy) | Customize layout |
| `/customize/` | (lazy) | Customize index |
| `/customize/connectors` | (lazy) | Customize connectors |
| `/customize/skills` | (lazy) | Customize skills |
| `/customize/plugins/new` | (lazy) | New plugin |
| `/customize/plugins/$pluginId` | (lazy) | Plugin detail |
| `/customize/plugins/$pluginId/agents` | (lazy) | Plugin agents |
| `/customize/plugins/$pluginId/connectors` | (lazy) | Plugin connectors |
| `/customize/plugins/$pluginId/hooks` | (lazy) | Plugin hooks |
| `/customize/plugins/$pluginId/skills` | (lazy) | Plugin skills |

#### Analytics Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/analytics` | `AnalyticsLayoutRoute` (lazy) | Analytics layout |
| `/analytics/` | (lazy) | Analytics index |
| `/analytics/activity` | (lazy) | Activity analytics |
| `/analytics/api-keys` | (lazy) | API keys |
| `/analytics/chat` | (lazy) | Chat analytics |
| `/analytics/chat/$uuid` | (lazy) | Chat detail |
| `/analytics/claude-code` | (lazy) | Claude Code analytics |
| `/analytics/code-review` | (lazy) | Code review analytics |
| `/analytics/usage` | (lazy) | Usage analytics |

#### Claude Code (Web) Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/code` | `CodeLayoutRoute` | Code layout |
| `/code/` | `CodeIndexRoute` | Code index |
| `/code/$uri` | `CodeSessionRoute` | Code session |
| `/code/disabled` | `CodeDisabledRoute` | Code disabled |
| `/code/enroll` | `CodeEnrollRoute` | Code enrollment |
| `/code/family` | `CodeFamilyRoute` | Code family |
| `/code/security` | `CodeSecurityRoute` | Code security |
| `/code/share/$shareId` | `CodeShareSessionLayoutRoute` | Code share layout |
| `/code/share/$shareId/` | `CodeShareSessionRoute` | Code share session |
| `/code/onboarding` | `CodeOnboardingRoute` | Code onboarding |
| `/code/memory` | `CodeMemoryIndexRoute` | Code memory |
| `/code/memory/$` | `CodeMemoryRepoRoute` | Code memory by repo |
| `/code/scheduled` | `CodeScheduledLayoutRoute` | Code scheduled layout |
| `/code/scheduled/` | `CodeScheduledIndexRoute` | Code scheduled index |
| `/code/scheduled/new` | `CodeScheduledNewRoute` | New scheduled task |
| `/code/scheduled/$triggerId` | `CodeScheduledDetailRoute` | Scheduled task detail |

#### Cowork Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/cowork/agent` | (cowork agent layout, `i2t`) | Cowork agent layout |
| `/cowork/agent/` | (cowork agent index) | Cowork agent index |
| `/cowork/agent/session/$sessionId` | (session detail) | Cowork session |

#### Experiments Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/experiments/code` | `ExperimentsCodeRedirectRoute` | Redirect to `/code` |
| `/experiments/code/$uri` | `ExperimentsCodeUriRedirectRoute` | Redirect to `/code/$uri` |
| `/experiments/code/shared/$shared_uri` | `ExperimentsCodeSharedRedirectRoute` | Redirect to code share |
| `/experiments/symphony` | `ExperimentsSymphonyLayoutRoute` | Symphony layout |
| `/experiments/symphony/` | `ExperimentsSymphonyRoute` | Symphony index |
| `/experiments/symphony/$workflowId` | `ExperimentsSymphonyWorkflowRoute` | Symphony workflow |

#### Other Authenticated Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/recents` | `RecentsRoute` | Recent conversations |
| `/knowledge` | `KnowledgeRoute` | Knowledge base |
| `/meeting-assistant` | `MeetingAssistantRoute` | Meeting assistant |
| `/session` | `SessionIndexRedirectRoute` | Session redirect |
| `/session/$session_id` | `SessionDetailRoute` | Session detail |
| `/space/$spaceId` | `SpaceRoute` | Space view |
| `/ask-your-org` | `AskYourOrgRoute` | Ask your org |
| `/ask-your-org/setup` | `AskYourOrgSetupRoute` | Ask your org setup |
| `/operon` | `OperonRoute` (lazy) | Operon |
| `/local_sessions` | (inline) | Local sessions |
| `/submit_quick_entry` | (inline) | Quick entry submission |
| `/task/$uuid` | (inline) | Task detail |
| `/task/new` | (inline) | New task |
| `/task/examples` | (inline) | Task examples |
| `/scheduled-task` | (scheduled task layout) | Scheduled task layout |
| `/scheduled-task/` | (scheduled task index) | Scheduled task index |
| `/scheduled-task/$id` | (scheduled task detail) | Scheduled task detail |

### 1.6 Not Found Handler

```
notFoundComponent: () => <U0t kind="route_not_matched" />
```

The root route has a `beforeLoad` guard that runs redirect rules (section 7) before rendering. If no route matches and no redirect applies, the `notFoundComponent` renders a 404 page.

For shortlinks (`/$shortlink`), a miss from the API probe renders a shortlink-specific 404 that logs `page.not_found` with `kind: "shortlink_miss"`.

---

## 2. Navigation Triggers

### 2.1 Programmatic Navigation (`push` / `replace`)

These are the observed `push()` and `replace()` calls in the bundle:

**push() calls (add to history stack):**
| Target | Trigger |
|--------|---------|
| `/new` | New chat button, post-completion, various CTAs |
| `/new?incognito` | Incognito mode toggle |
| `/projects` | Projects navigation |
| `/projects/create` | Create project button |
| `/customize` | Customize navigation |
| `/downloads` | Downloads page |
| `/upgrade` | Upgrade CTA |
| `/upgrade?feature=cowork&hide_free=true&returnTo=/task/new` | Cowork upgrade gate |
| `/upgrade?initialPlanType=team` | Team plan upgrade |
| `/upgrade?returnTo=/task/new&freeReturnTo=/task/new` | Task creation upgrade gate |
| `/settings/cowork?edit=true` | Edit cowork settings |
| `/settings/desktop/developer` | Desktop developer settings |
| `/admin-settings/capabilities` | Admin capabilities |
| `/onboarding/role` | Role selection |
| `/reported` | Account reported redirect |
| `/task/new` | New task |
| `/claude-code-desktop/onboarding?magic=env-setup` | CCD onboarding |

**replace() calls (replace current history entry):**
| Target | Trigger |
|--------|---------|
| `/new` | Various fallback redirects |
| `/new?error=teams_no_remix` | Teams remix error |
| `/settings` | Settings default |
| `/claude-code-desktop` | CCD redirect |
| `/task/new` | Task redirect |

### 2.2 Full Page Navigation (`window.location.href`)

These bypass the SPA router and trigger full page loads:

| Target | Trigger |
|--------|---------|
| `/code` | After code onboarding reset |
| `/new` | "Start a new chat" fallback link |
| `/imagine` | Image generation redirect |
| `/onboarding` | After account reset |
| `/logout?returnTo=...` | Session expiry |
| `/project/$uuid` | Project deep link |
| `/api/challenge_redirect?to=...` | Cloudflare challenge detected |
| `mailto:?subject=...&body=...` | Email share |
| `sms:?&body=...` | Text message share |
| External OAuth URLs | Connector auth flows |

### 2.3 Link-Based Navigation

The app uses a `W_` component (wrapped link) with properties:
- `prefetch` - supports route prefetching
- `webBehavior: "navigate"` - default SPA navigation
- `target` - for external links

---

## 3. Data Loading Per Route

### 3.1 Global / Bootstrap Data

On every page load (before any route renders):

| API Call | Description |
|----------|-------------|
| `GET /api/bootstrap?statsig_hashing_algorithm=djb2&growthbook_format=sdk` | Account info, org info, feature flags, experiments |
| `GET /api/bootstrap/${orgId}/app_start?...` | Org-specific bootstrap (when org available) |
| `GET /api/bootstrap/${orgId}/system_prompts` | System prompts (mobile UA only) |
| `GET /api/banners` | Active banners |
| `GET /api/account/settings` | Account settings |

### 3.2 Conversation List (Sidebar)

Loaded on all authenticated routes with sidebar:

| API Call | Description | Stale Time |
|----------|-------------|------------|
| `GET /api/organizations/${orgId}/chat_conversations_v2?limit=...&offset=...` | Conversation list | 300s (5min) |
| `GET /api/organizations/${orgId}/chat_conversations_v2?...&starred=true` | Starred conversations | 300s |

Supports search via:
| `GET /api/organizations/${orgId}/conversation/search?query=...` | Search conversations (min 3 chars) | 60s |

### 3.3 Chat / Conversation Route (`/chat/$uuid`)

| API Call | Description |
|----------|-------------|
| `GET /api/organizations/${orgId}/chat_conversations/${uuid}?tree=True&rendering_mode=messages&render_all_tools=true` | Full conversation tree |
| `GET /api/organizations/${orgId}/chat_conversations/${uuid}/completion_status?poll=true` | Completion status polling |
| `GET /api/organizations/${orgId}/chat_conversations/${uuid}/current_leaf_message_uuid` | Current leaf message |
| `GET /api/organizations/${orgId}/chat_conversations/${uuid}/latest` | Latest message |
| `GET /api/organizations/${orgId}/chat_conversations/${uuid}?rendering_mode=raw` | Raw conversation data for settings |

### 3.4 Project Routes (`/project/$uuid`)

| API Call | Description | Stale Time |
|----------|-------------|------------|
| `GET /api/organizations/${orgId}/projects/${uuid}` | Project detail | 0 |
| `GET /api/organizations/${orgId}/projects/${uuid}/settings` | Project settings | (conditional) |
| `GET /api/organizations/${orgId}/projects/${uuid}/docs` | Project documents | - |
| `GET /api/organizations/${orgId}/projects/${uuid}/conversations_v2?...` | Project conversations | 0 |
| `GET /api/organizations/${orgId}/projects/${uuid}/syncs?calculate_size=...` | Project syncs | 5s refetch if syncing |
| `GET /api/organizations/${orgId}/projects/${uuid}/kb/stats` | Knowledge base stats | - |
| `GET /api/organizations/${orgId}/projects/${uuid}/accounts` | Project members | - |
| `GET /api/organizations/${orgId}/projects/${uuid}/permissions` | Project permissions | - |
| `GET /api/organizations/${orgId}/projects/count` | Total project count | 300s |

### 3.5 Code Session Routes (`/code/$uri`, `/claude-code-desktop/$uri`)

| API Call | Description |
|----------|-------------|
| `GET /v1/sessions/${sessionId}` | Session metadata |
| `GET /v1/sessions/${sessionId}/events?limit=1000` | Session events (infinite query) |

Prefetch behavior: Both session metadata and events are prefetched via `prefetchQuery` and `prefetchInfiniteQuery`.

### 3.6 Settings Route

Settings and admin-settings are fully lazy-loaded from separate chunks:
- `/settings/*` -> `cf4f70727-DNP1H9Ns.js`
- `/admin-settings/*` -> `cf400e6a4-exfGoSEj.js`
- `/customize/*` -> `c63a78ed4-L0Sw2ACn.js`
- `/analytics/*` -> `ca768caa9-DlItBZsW.js`

Key data loaded on settings pages:
| API Call | Route |
|----------|-------|
| `GET /api/organizations/${orgId}/subscription` | `/settings/billing` |
| `GET /api/organizations/${orgId}/subscription_details` | `/settings/billing` |
| `GET /api/organizations/${orgId}/members?...` | `/settings/members` |
| `GET /api/organizations/${orgId}/roles` | `/admin-settings/roles` |
| `GET /api/organizations/${orgId}/feature_settings` | `/admin-settings/capabilities` |
| `GET /api/organizations/${orgId}/memory` | Memory-related pages |
| `GET /api/organizations/${orgId}/usage` | Usage pages |

### 3.7 Stale Time Configuration

| Duration | Usage |
|----------|-------|
| 300s (5 min) | Conversation list, project count |
| 60s (1 min) | Conversation search, experience data |
| 30s | General queries |
| 5s | Active sync progress polling |
| 0s | Project detail, project conversations (always refetch) |

### 3.8 Prefetching

- **Session prefetch:** Code sessions (`/v1/sessions/${id}`) and their events are prefetched when navigating to session detail routes.
- **Link prefetch:** The `W_` link component supports a `prefetch` prop for hover-based prefetching.
- **Route prefetch:** `prefetch(cXt)` is called on certain navigation triggers (appears to prefetch route chunks).
- **Chunk preload:** Vite `modulepreload` links are observed in `<link rel="modulepreload">` for route chunks. Failed preloads trigger `window.location.reload()` (with session storage tracking to prevent infinite reload loops).

---

## 4. Deep Link Support

### 4.1 Bookmarkable URLs

| URL Pattern | State Restored | Notes |
|-------------|---------------|-------|
| `/chat/$uuid` | Full conversation with message tree | Fetches `?tree=True&rendering_mode=messages` |
| `/project/$uuid` | Project with docs, conversations, settings | Multiple parallel fetches |
| `/project/$uuid/setup` | Project setup wizard | |
| `/code/$uri` | Code session with events | URI-based, not UUID |
| `/claude-code-desktop/$uri` | CCD session | |
| `/share/$snapshot_uuid` | Shared conversation snapshot | Public, no auth required |
| `/artifacts/$artifact_version_uuid` | Specific artifact version | |
| `/task/$uuid` | Scheduled task detail | |
| `/scheduled-task/$id` | Scheduled task detail | |
| `/code/share/$shareId` | Shared code session | |
| `/code/share/$shareId/` | Shared code session index | |
| `/code/scheduled/$triggerId` | Code scheduled trigger | |
| `/cowork/agent/session/$sessionId` | Cowork session | |
| `/session/$session_id` | Session detail | |
| `/space/$spaceId` | Space view | |
| `/directory/$uuid` | Redirects to `/new?directory-open=true&directory-uuid=$uuid` | |
| `/enterprise/order/$accessToken` | Enterprise order | Token-based auth |
| `/browser-session/$organizationUuid/$conversationUuid` | Browser session | Org-scoped |

### 4.2 Share / Publish URLs

**Conversation sharing:**
- API: `POST /api/organizations/${orgId}/chat_conversations/${uuid}/share`
- Creates a snapshot accessible at `/share/$snapshot_uuid`
- Snapshots load via: `GET /api/organizations/${orgId}/chat_snapshots/${uuid}?rendering_mode=messages&render_all_tools=true`

**Published artifacts:**
- Base URL: `https://claude.ai/public/artifacts/${published_artifact_uuid}`
- Embed URL: `https://claude.site/public/artifacts/${published_artifact_uuid}/embed`
- Config: `publishedArtifactsBaseUrl: "https://claude.ai"`, `publishedArtifactsEmbedBaseUrl: "https://claude.site"`
- API: `POST /api/organizations/${orgId}/publish_artifact`
- Visibility control: `PUT /api/organizations/${orgId}/artifact-versions/${uuid}/visibility`

**Code session sharing:**
- Route: `/code/share/$shareId`
- Also: `/share/$shareId` (top-level share layout)

### 4.3 Shortlinks

- Pattern: `/$shortlink` (catch-all at root level)
- Resolution: API probe `shortlink_probe` query
- On miss: Renders 404 with `kind: "shortlink_miss"` logging
- Purpose: Short URLs for sharing conversations or artifacts

---

## 5. URL Query Parameters

### 5.1 `/new` (New Chat)

| Parameter | Values | Description |
|-----------|--------|-------------|
| `incognito` | (presence) or `true` | Start incognito conversation |
| `mode` | `chat` | Force chat mode |
| `directory-open` | `true` | Open connector directory panel |
| `directory-uuid` | UUID | Pre-select a specific directory entry |
| `error` | `teams_no_remix` | Display error about teams remix restriction |
| `projectStarter` | (string) | Pre-select a project starter template |
| `q` | (string, via hash) | Pre-fill chat prompt (hash fragment `#q=...`) |
| `attachment` | (string, via hash) | Pre-attach file (hash fragment) |

### 5.2 `/upgrade`

| Parameter | Values | Description |
|-----------|--------|-------------|
| `feature` | `cowork` | Feature that triggered upgrade |
| `hide_free` | `true` | Hide free tier option |
| `hide_pro` | `true` | Hide pro tier option |
| `returnTo` | URL path | Redirect after upgrade |
| `freeReturnTo` | URL path | Redirect if user stays on free |
| `initialPlanType` | `team` | Pre-select plan type |

### 5.3 `/settings/cowork`

| Parameter | Values | Description |
|-----------|--------|-------------|
| `edit` | `true` | Open in edit mode |

### 5.4 `/admin-settings/connectors`

| Parameter | Values | Description |
|-----------|--------|-------------|
| `modal` | `add-custom-connector` | Open add connector modal |

### 5.5 `/customize/connectors`

| Parameter | Values | Description |
|-----------|--------|-------------|
| `directory` | `true` | Show directory view |
| `search` | `google` | Pre-fill search |

### 5.6 `/claude-code-desktop`

| Parameter | Values | Description |
|-----------|--------|-------------|
| `q` | (string) | Pre-fill prompt |
| `folder` | (string) | Pre-select folder |

### 5.7 `/claude-code-desktop/onboarding`

| Parameter | Values | Description |
|-----------|--------|-------------|
| `magic` | `env-setup` | Trigger environment setup flow |

### 5.8 `/code/onboarding`

| Parameter | Values | Description |
|-----------|--------|-------------|
| `magic` | `env-setup` | Trigger environment setup |

### 5.9 `/logout`

| Parameter | Values | Description |
|-----------|--------|-------------|
| `returnTo` | URL | Redirect after logout |

### 5.10 `/login`

| Parameter | Values | Description |
|-----------|--------|-------------|
| `login_hint` | email | Pre-fill login email |
| `login_method` | (string) | Pre-select login method |

### 5.11 `/projects/create`

| Parameter | Values | Description |
|-----------|--------|-------------|
| `projectStarter` | (string) | Pre-select project template |

### 5.12 `/settings/capabilities`

| Parameter | Values | Description |
|-----------|--------|-------------|
| (hash) `#code-execution` | - | Scroll to code execution section |
| (hash) `#skills` | - | Scroll to skills section |

### 5.13 `/analytics` sub-routes

| Parameter | Values | Description |
|-----------|--------|-------------|
| `tab` | `overview` | Analytics tab selection |

### 5.14 `/code`

| Parameter | Values | Description |
|-----------|--------|-------------|
| `open_in_browser` | `1` | Force browser open (vs desktop app) |

### 5.15 MCP Auth Callback

| Path | `/mcp-auth-callback/${encodedServerName}` |
|------|------|
| `step` | Auth flow step (defaults to `error`) |
| `oauth_error` | Error code |
| `oauth_error_description` | Error description |
| `oauth_error_uri` | Error URI |
| `server` | Server identifier |
| `flow_id` | Auth flow ID |

### 5.16 Connector Auth

| Path | `/connector/$serverId/auth_done` |
|------|------|
| `_` | `1` (marker) |

### 5.17 Spotlight / NUX

| Parameter | Values | Description |
|-----------|--------|-------------|
| `spotlight_nux` | (presence) | Trigger new user experience spotlight; cleaned from URL after processing |

---

## 6. Back/Forward Browser Navigation

### 6.1 History State Management

- **TanStack Router** manages history via `pushState`/`replaceState`. Browser back/forward fires `popstate` events handled by the router.
- The `popstate` handler triggers route re-evaluation and component re-rendering.
- `window.history.replaceState(null, "", ...)` is used to clean query params after processing (e.g., `directory-open`, `directory-uuid`, `spotlight_nux`, `openDiff`, `oauth_error*`, `server`, `step`, `flow_id`, `magic`).

### 6.2 Unsaved State Warnings

- A `beforeunload` event listener is registered to fire `claudeai.cumulative_error_count` telemetry on page unload.
- A separate `beforeunload` handler guards against losing unsaved state (controlled by a state variable `k`):
  ```
  window.addEventListener("beforeunload", e) ... [k]
  ```
  This prevents accidental tab close during active streaming or form editing.

### 6.3 Preload Error Recovery

- On `vite:preloadError` event, the app increments a session storage counter and calls `window.location.reload()`.
- This handles stale chunk references after deployments (chunk hash mismatch).

---

## 7. Redirect Chains

### 7.1 Permanent Redirects (301)

| Source | Destination |
|--------|-------------|
| `/admin-settings` | `/admin-settings/organization` |
| `/anthropic_app_icon.png` | `/images/anthropic_app_icon.png` |
| `/claude-create` | `/claude-ship` |
| `/claude-create/:path*` | `/claude-ship/:path*` |
| `/icons/icon-512x512.png` | `/images/icon-512x512.png` |
| `/opengraph-image@2x.png` | `/images/opengraph-image@2x.png` |
| `/settings/admin` | `/admin-settings/data-privacy-controls` |
| `/settings/appearance` | `/settings/general` |
| `/settings/data-management` | `/admin-settings/data-privacy-controls` |
| `/settings/identity` | `/admin-settings/identity` |
| `/settings/integrations` | `/settings/connectors` |
| `/settings/profile` | `/settings/general` |
| `/settings/team` | `/settings/members` |

### 7.2 Temporary Redirects (302)

| Source | Destination |
|--------|-------------|
| `/business` | `https://claude.com/product?utm_source=podcast&utm_medium=host&utm_campaign=business` |
| `/chrome` | `https://www.claude.com/chrome` |
| `/claude/:path*` | `/chat/:path*` |
| `/code/notifications` | `/settings/general` |
| `/connectors` | `/directory` |
| `/cowork` | `https://claude.com/product/cowork` |
| `/create` | `/create/name` |
| `/imagine` | `/new` |
| `/magic-link/android` | `/magic-link` |
| `/server` | `/new` |
| `/settings` | `/settings/general` |
| `/settings/features` | `/settings/capabilities` |
| `/settings/organization` | `/settings/members` |
| `/settings/preferences` | `/settings/general` |
| `/settings/privacy` | `/settings/data-privacy-controls` |

### 7.3 Legal Redirects (External)

| Source | Destination |
|--------|-------------|
| `/legal/aup` | `https://www.anthropic.com/legal/aup` |
| `/legal/privacy` | `https://www.anthropic.com/legal/privacy` |
| `/legal(|/.*)` | `https://www.anthropic.com/legal/consumer-terms` |

### 7.4 Route-Level Redirects

| Route | Behavior |
|-------|----------|
| `/chat/` (index) | Redirects to `/` |
| `/artifacts/` (index) | Redirects to `/` (when no artifacts) |
| `/directory/$uuid` | Redirects to `/new?directory-open=true&directory-uuid=$uuid` |
| `/org/$organization_id` | Redirects to `/` |
| `/settings/billing/$organization_id` | Redirects to `/settings/billing` |
| `/claude-code-install` | Redirect route to install flow |
| `/experiments/code` | Redirects to `/code` |
| `/experiments/code/$uri` | Redirects to `/code/$uri` |
| `/experiments/code/shared/$shared_uri` | Redirects to `/code/share/...` |
| `/session` | `SessionIndexRedirectRoute` (redirects somewhere) |

### 7.5 Auth Redirect Flow

1. Unauthenticated user visits any authenticated route.
2. Root route component checks `isLoggedOut` from `my()` (account context).
3. Saves current URL to `oauth_return_to` (via `return_to` mechanism).
4. Redirects to `/login`.
5. After login, reads `oauth_return_to` and redirects back.

### 7.6 Cloudflare Challenge Redirect

When the API returns a Cloudflare challenge response:
```
window.location.href = `/api/challenge_redirect?to=${currentPath}`
```
This performs a full-page redirect to the challenge page, which then redirects back after verification.

### 7.7 beforeLoad Redirect Matching

The root route's `beforeLoad` function runs `q0t(pathname)` which:
1. Takes the full redirect rules array (`fx`)
2. Compiles each `source` pattern into a path matcher
3. Tests the current pathname against each matcher
4. If matched, throws a TanStack Router redirect with `{ href, replace: true }`
5. External destinations (different origin) use `href` directly; internal use path-only

---

## 8. Page Title Updates

### 8.1 Title Helper Function

```javascript
function xk(e) {
  d.useEffect(() => {
    const t = document.title;
    return e && (document.title = `${e} - Claude`),
    () => { document.title = t }
  }, [e])
}
```

This is a React hook that:
- Sets `document.title` to `"${pageName} - Claude"` when a page-specific title is provided
- Restores the previous title on unmount (cleanup)

### 8.2 Default Title

The default/fallback title constant is:
```javascript
xBt = "Claude Code"  // (for Code routes)
```

For chat routes, the pattern is: `"${conversationTitle} - Claude"` (seen in the conversation component).

### 8.3 Title Patterns by Route

| Route | Title Pattern |
|-------|---------------|
| `/new` | `"Claude"` (default) |
| `/chat/$uuid` | `"${conversation.name} - Claude"` |
| `/code/*` | `"${sessionTitle} - Claude Code"` or `"Claude Code"` |
| Active streaming | `"Working on it..."` |
| Background tab attention | Cycles through characters (animated title) |

### 8.4 Title Cycling (Tab Attention)

There is a title-cycling mechanism for background tabs that rotates through an array of title strings at intervals to attract attention. It restores the original title when the user focuses the tab:
```javascript
document.title = e[t]
t = (t + 1) % e.length
```

This is cleaned up by `clearInterval` and title restoration on focus.

---

## Appendix A: Complete API Endpoints Referenced

### A.1 Non-Org-Scoped Endpoints

```
GET    /api/account/settings
GET    /api/account_profile
GET    /api/account/deletion-allowed
GET    /api/account/raven_eligible
GET    /api/account?statsig_hashing_algorithm=djb2
POST   /api/account/accept_legal_docs
POST   /api/account/email_consent
POST   /api/account/grove_notice_viewed
GET    /api/accounts/me/consents
GET    /api/accounts/me/consents/check
POST   /api/accounts/me/consents/revoke
GET    /api/accounts/me/organizations/get_or_create_chat_organization
GET    /api/auth/accept_invite
POST   /api/auth/exchange_nonce_for_code
POST   /api/auth/logout
POST   /api/auth/logout/all-sessions
POST   /api/auth/send_magic_link
POST   /api/auth/verify_google
POST   /api/auth/verify_google_mobile
POST   /api/auth/verify_magic_link
GET    /api/banners
POST   /api/event_logging/batch
POST   /api/event_logging/batch?test_mode=true
GET    /api/organizations/discoverable
GET    /api/referral
GET    /api/referral/guest/redeemed
GET    /api/bootstrap?statsig_hashing_algorithm=djb2&growthbook_format=sdk
GET    /api/bootstrap/${orgId}/app_start?...
GET    /api/bootstrap/${orgId}/system_prompts
GET    /api/internal-test/account/reset
GET    /api/internal-test/account/role
GET    /api/internal-test/account/subscription
```

### A.2 Org-Scoped Endpoints (Selected Key Ones)

```
GET    /api/organizations/${orgId}/chat_conversations_v2?...
GET    /api/organizations/${orgId}/chat_conversations/${uuid}?tree=True&rendering_mode=messages&render_all_tools=true
GET    /api/organizations/${orgId}/chat_conversations/${uuid}?rendering_mode=raw
GET    /api/organizations/${orgId}/chat_conversations/${uuid}/completion_status?poll=true
GET    /api/organizations/${orgId}/chat_conversations/${uuid}/current_leaf_message_uuid
GET    /api/organizations/${orgId}/chat_conversations/${uuid}/latest
POST   /api/organizations/${orgId}/chat_conversations/${uuid}/share
PUT    /api/organizations/${orgId}/chat_conversations/${uuid}/title
POST   /api/organizations/${orgId}/chat_conversations/${uuid}/stop_response
POST   /api/organizations/${orgId}/chat_conversations/${uuid}/tool_approval
POST   /api/organizations/${orgId}/chat_conversations/${uuid}/tool_result
DELETE /api/organizations/${orgId}/chat_conversations/delete_many
POST   /api/organizations/${orgId}/chat_conversations/move_many
GET    /api/organizations/${orgId}/conversation/search?...
GET    /api/organizations/${orgId}/projects
GET    /api/organizations/${orgId}/projects/${uuid}
GET    /api/organizations/${orgId}/projects/${uuid}/settings
GET    /api/organizations/${orgId}/projects/${uuid}/docs
GET    /api/organizations/${orgId}/projects/${uuid}/conversations_v2?...
GET    /api/organizations/${orgId}/projects/${uuid}/syncs
GET    /api/organizations/${orgId}/projects/${uuid}/kb/stats
GET    /api/organizations/${orgId}/projects/${uuid}/permissions
GET    /api/organizations/${orgId}/projects/count
POST   /api/organizations/${orgId}/publish_artifact
GET    /api/organizations/${orgId}/published_artifacts/${uuid}
GET    /api/organizations/${orgId}/chat_snapshots/${uuid}?rendering_mode=messages&render_all_tools=true
GET    /api/organizations/${orgId}/memory
POST   /api/organizations/${orgId}/memory/reset
POST   /api/organizations/${orgId}/memory/synthesize
GET    /api/organizations/${orgId}/memory/themes
GET    /api/organizations/${orgId}/subscription
GET    /api/organizations/${orgId}/subscription_details
GET    /api/organizations/${orgId}/subscription_status
GET    /api/organizations/${orgId}/usage
GET    /api/organizations/${orgId}/members?...
GET    /api/organizations/${orgId}/roles
GET    /api/organizations/${orgId}/feature_settings
GET    /api/organizations/${orgId}/mcp/remote_servers
GET    /api/organizations/${orgId}/mcp/v2/bootstrap
POST   /api/organizations/${orgId}/proxy/v1/messages
GET    /api/organizations/${orgId}/cowork_settings
GET    /api/organizations/${orgId}/browser_extension_settings
```

### Appendix B: Lazy-Loaded Chunks

All route groups load via Vite dynamic imports:

| Chunk | Routes |
|-------|--------|
| `cf4f70727-DNP1H9Ns.js` | Settings (`/settings/*`) |
| `cf400e6a4-exfGoSEj.js` | Admin Settings (`/admin-settings/*`) |
| `c63a78ed4-L0Sw2ACn.js` | Customize (`/customize/*`) |
| `ca768caa9-DlItBZsW.js` | Analytics (`/analytics/*`) |
| `c06dd33ac-BWhUeWm7.js` | Operon |
| `c71860c77-BH4LDa1f.js` | Excel/PPT setup |
| Various `c6a992d55-*.js` | Shared vendor chunks |
| `vendor-Vyn28asx.js` | Main vendor bundle |
| `tree-sitter-CxtuNIRw.js` | Tree-sitter (code parsing) |

### Appendix C: Route Guard Summary

| Guard | Scope | Behavior |
|-------|-------|----------|
| `beforeLoad` redirect matcher | Root route | Matches redirect rules before any component renders |
| `isLoggedOut` check | `G0t` authenticated layout | Redirects to `/login` with return-to |
| `notFoundComponent` | Root route | Renders 404 for unmatched routes |
| Org required | `G0t` children | Redirects to `/no-organization` if no org |
| Shortlink probe | `/$shortlink` | API check before rendering, 404 on miss |
| Feature flags | Various | Feature-gated routes check flags from bootstrap data |
