# Claude.ai Feature Extraction & Proxy Gap Analysis

**Generated:** 2026-03-22
**Source data:**
- Frontend bundle: `index-DcrCrePJ.js` (7.2 MB)
- Leaked system prompt: `/tmp/claude-gist1.md` (1721 lines)
- Proxy source: `/home/sertdev/Projects/claude-intercepter/sync-server/src/`
- Design doc: `docs/plans/2026-03-23-claude-proxy-migration-design.md`

---

## 1. COMPLETE API ENDPOINT INVENTORY

### 1.1 Authentication & Account

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/send_magic_link` | POST | Send magic link login email |
| `/api/auth/verify_magic_link` | POST | Verify magic link token |
| `/api/auth/verify_google` | POST | Google OAuth login |
| `/api/auth/verify_google_mobile` | POST | Google OAuth (mobile) |
| `/api/auth/exchange_nonce_for_code` | POST | Nonce-to-code exchange |
| `/api/auth/accept_invite` | POST | Accept org invite |
| `/api/auth/logout` | POST | Logout current session |
| `/api/auth/logout/all-sessions` | POST | Logout all sessions |
| `/api/auth/login_methods` | GET | Available login methods |
| `/api/account` | GET | Account info (email, memberships, orgs) |
| `/api/account_profile` | GET | Account profile |
| `/api/account/accept_legal_docs` | POST | Accept legal docs |
| `/api/account/deletion-allowed` | GET | Check if deletion allowed |
| `/api/account/email_consent` | POST | Email consent |
| `/api/account/grove_notice_viewed` | POST | Grove notice viewed flag |
| `/api/account/raven_eligible` | GET | Raven eligibility check |
| `/api/account/settings` | GET/PUT | Account settings |
| `/api/accounts/me/consents` | GET | User consents |
| `/api/accounts/me/consents/check` | GET | Check consent status |
| `/api/accounts/me/consents/revoke` | POST | Revoke consent |
| `/api/accounts/me/organizations/get_or_create_chat_organization` | POST | Get/create chat org |

### 1.2 Bootstrap

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bootstrap` | GET | Base bootstrap |
| `/api/bootstrap/{id}/app_start` | GET | Full bootstrap (org, models, growthbook, statsig, features) |
| `/api/bootstrap/{id}/system_prompts` | GET | Fetch system prompts |

### 1.3 Chat Conversations (Core)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/chat_conversations` | POST | Create conversation |
| `/api/organizations/{orgId}/chat_conversations_v2` | GET | List conversations (paginated) |
| `/api/organizations/{orgId}/chat_conversations/{convId}` | GET | Get conversation (tree=True for full messages) |
| `/api/organizations/{orgId}/chat_conversations/{convId}` | PUT | Update conversation settings |
| `/api/organizations/{orgId}/chat_conversations/{convId}/title` | POST | Update title |
| `/api/organizations/{orgId}/chat_conversations/{convId}/completion` | POST | Send message / get completion (SSE stream) |
| `/api/organizations/{orgId}/chat_conversations/{convId}/retry_completion` | POST | Retry last completion (SSE stream) |
| `/api/organizations/{orgId}/chat_conversations/{convId}/completion_status` | GET | Poll completion status (poll=true/false) |
| `/api/organizations/{orgId}/chat_conversations/{convId}/stop_response` | POST | Stop current response |
| `/api/organizations/{orgId}/chat_conversations/{convId}/model_fallback` | POST | Model fallback |
| `/api/organizations/{orgId}/chat_conversations/{convId}/current_leaf_message_uuid` | GET | Get current leaf message |
| `/api/organizations/{orgId}/chat_conversations/{convId}/latest` | GET | Get latest state |
| `/api/organizations/{orgId}/chat_conversations/{convId}/share` | POST | Share conversation |
| `/api/organizations/{orgId}/chat_conversations/{convId}/tool_result` | POST | Submit tool result |
| `/api/organizations/{orgId}/chat_conversations/{convId}/tool_approval` | POST | Approve tool execution |
| `/api/organizations/{orgId}/chat_conversations/{convId}/chat_messages/{msgId}/flags` | POST | Flag message |
| `/api/organizations/{orgId}/chat_conversations/{convId}/{branchId}` | GET | Get conversation branch |
| `/api/organizations/{orgId}/chat_conversations/{convId}/task/{taskId}/status` | GET | Compass/research task status |
| `/api/organizations/{orgId}/chat_conversations/{convId}/task/{taskId}/stop` | POST | Stop compass/research task |
| `/api/organizations/{orgId}/chat_conversations/delete_many` | POST | Bulk delete conversations |
| `/api/organizations/{orgId}/chat_conversations/move_many` | POST | Bulk move conversations |

### 1.4 Conversation Search & History

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/conversation/search` | GET | Search conversation history (keyword) |
| `/api/organizations/{orgId}/conversation/backfill` | POST | Backfill conversation data |

### 1.5 Memory System

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/memory` | GET | Get formatted memory (includes project_uuid param) |
| `/api/organizations/{orgId}/memory/controls` | GET | Get memory controls/edits |
| `/api/organizations/{orgId}/memory/reset` | POST | Reset all memory |
| `/api/organizations/{orgId}/memory/synthesize` | POST | Trigger memory synthesis |
| `/api/organizations/{orgId}/memory/themes` | GET | Get memory themes |

### 1.6 Artifacts & Files

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/artifacts/{type}/{artifactId}/versions` | GET | Get artifact versions |
| `/api/organizations/{orgId}/artifacts/{type}/{artifactId}/tools` | GET | Get artifact tools |
| `/api/organizations/{orgId}/artifacts/{type}/{artifactId}/storage/{key}` | GET/PUT/DELETE | Persistent artifact storage |
| `/api/organizations/{orgId}/artifacts/{type}/{artifactId}/manage/storage/info` | GET | Storage info |
| `/api/organizations/{orgId}/artifacts/{type}/{artifactId}/manage/storage/reset` | POST | Reset storage |
| `/api/organizations/{orgId}/artifact-versions/{id}` | GET | Get artifact version |
| `/api/organizations/{orgId}/artifact-versions/{id}/visibility` | PUT | Set artifact visibility |
| `/api/organizations/{orgId}/artifacts/{id}/byindex` | GET | Get artifact by index |
| `/api/organizations/{orgId}/published_artifacts` | GET | List published artifacts |
| `/api/organizations/{orgId}/published_artifacts/{id}` | GET/DELETE | Manage published artifact |
| `/api/organizations/{orgId}/published_artifacts/{id}/embed_whitelist` | PUT | Embed whitelist |
| `/api/organizations/{orgId}/publish_artifact` | POST | Publish an artifact |
| `/api/organizations/{orgId}/shared_artifact/{shareId}/files/{fileUuid}/contents` | GET | Shared artifact file contents |
| `/api/organizations/{orgId}/share/{id}` | GET | Get share |
| `/api/organizations/{orgId}/shares` | GET | List shares |

### 1.7 File Upload & Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/files/{fileId}/contents` | GET | Get file contents |
| `/api/organizations/{orgId}/files/{fileId}/content_preview` | GET | Get file preview |
| `/api/organizations/{orgId}/upload` | POST | Upload file |
| `/api/organizations/{orgId}/convert_document` | POST | Convert document format |

### 1.8 Wiggle (Conversation Filesystem)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/conversations/{convId}/wiggle/list-files` | GET | List conversation files |
| `/api/organizations/{orgId}/conversations/{convId}/wiggle/upload-file` | POST | Upload file to conversation |
| `/api/organizations/{orgId}/conversations/{convId}/wiggle/download-file` | GET | Download conversation file |
| `/api/organizations/{orgId}/conversations/{convId}/wiggle/download-files` | GET | Download multiple files |
| `/api/organizations/{orgId}/conversations/{convId}/wiggle/delete-file` | POST | Delete conversation file |
| `/api/organizations/{orgId}/conversations/{convId}/wiggle/convert-file-to-artifact` | POST | Convert file to artifact |
| `/api/organizations/{orgId}/conversations/{convId}/wiggle/export-to-google-drive` | POST | Export to Google Drive |
| `/wiggle/download-file` | GET | Direct artifact download |

### 1.9 Projects

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/projects` | GET/POST | List/create projects |
| `/api/organizations/{orgId}/projects_v2` | GET | List projects v2 (paginated) |
| `/api/organizations/{orgId}/projects/count` | GET | Project count |
| `/api/organizations/{orgId}/projects/request_haystack` | POST | Request haystack |
| `/api/organizations/{orgId}/projects/{projId}` | GET/PUT/DELETE | CRUD project |
| `/api/organizations/{orgId}/projects/{projId}/accounts` | GET | List project accounts |
| `/api/organizations/{orgId}/projects/{projId}/accounts_bulk` | POST | Bulk add accounts |
| `/api/organizations/{orgId}/projects/{projId}/accounts/{acctId}` | DELETE | Remove account from project |
| `/api/organizations/{orgId}/projects/{projId}/conversations_v2` | GET | List project conversations |
| `/api/organizations/{orgId}/projects/{projId}/docs` | GET/POST | List/add project docs |
| `/api/organizations/{orgId}/projects/{projId}/docs/{docId}` | GET/PUT/DELETE | CRUD project doc |
| `/api/organizations/{orgId}/projects/{projId}/docs/delete_many` | POST | Bulk delete docs |
| `/api/organizations/{orgId}/projects/{projId}/files` | GET/POST | List/add project files |
| `/api/organizations/{orgId}/projects/{projId}/files/delete_many` | POST | Bulk delete files |
| `/api/organizations/{orgId}/projects/{projId}/kb/stats` | GET | Knowledge base stats |
| `/api/organizations/{orgId}/projects/{projId}/permissions` | GET/PUT | Project permissions |
| `/api/organizations/{orgId}/projects/{projId}/report` | POST | Generate project report |
| `/api/organizations/{orgId}/projects/{projId}/settings` | GET/PUT | Project settings |
| `/api/organizations/{orgId}/projects/{projId}/syncs` | GET/POST | List/create syncs |
| `/api/organizations/{orgId}/projects/{projId}/syncs/{syncId}` | DELETE | Delete sync |
| `/api/organizations/{orgId}/projects/{projId}/syncs/delete_many` | POST | Bulk delete syncs |
| `/api/organizations/{orgId}/projects/{projId}/upload` | POST | Upload to project |
| `/api/organizations/{orgId}/projects/{projId}/sync` | POST | Trigger sync |
| `/api/organizations/{orgId}/starter_project` | GET | Starter project info |

### 1.10 Styles

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/list_styles` | GET | List available styles |
| `/api/organizations/{orgId}/styles/create` | POST | Create custom style |
| `/api/organizations/{orgId}/styles/preview` | POST | Preview style |
| `/api/organizations/{orgId}/styles/{styleId}/edit` | PUT | Edit style |
| `/api/organizations/{orgId}/styles/{styleId}/delete` | DELETE | Delete style |

### 1.11 Skills

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/skills/list-skills` | GET | List all skills |
| `/api/organizations/{orgId}/skills/list-org-skills` | GET | List org skills |
| `/api/organizations/{orgId}/skills/{skillId}` | GET | Get skill details |
| `/api/organizations/{orgId}/skills/create-simple-skill` | POST | Create skill |
| `/api/organizations/{orgId}/skills/edit-simple-skill` | PUT | Edit skill |
| `/api/organizations/{orgId}/skills/delete-skill` | DELETE | Delete skill |
| `/api/organizations/{orgId}/skills/delete-org-skill` | DELETE | Delete org skill |
| `/api/organizations/{orgId}/skills/enable-skill` | POST | Enable skill |
| `/api/organizations/{orgId}/skills/disable-skill` | POST | Disable skill |
| `/api/organizations/{orgId}/skills/rename-skill` | PUT | Rename skill |
| `/api/organizations/{orgId}/skills/duplicate-skill` | POST | Duplicate skill |
| `/api/organizations/{orgId}/skills/download` | GET | Download skill |
| `/api/organizations/{orgId}/skills/download-dot-skill-file` | GET | Download .skill file |

### 1.12 MCP (Model Context Protocol) Connectors

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/mcp/remote_servers` | GET/POST | List/create remote MCP servers |
| `/api/organizations/{orgId}/mcp/remote_servers/{serverId}` | GET/PUT/DELETE | CRUD MCP server |
| `/api/organizations/{orgId}/mcp/remote_servers/{serverId}/clear_cache` | POST | Clear MCP cache |
| `/api/organizations/{orgId}/mcp/v2/bootstrap` | GET | MCP v2 bootstrap |
| `/api/organizations/{orgId}/mcp/start-auth/{serverId}` | GET | Start MCP auth flow |
| `/api/organizations/{orgId}/mcp/logout/{serverId}` | POST | Logout MCP server |
| `/api/organizations/{orgId}/mcp/resources` | GET | List MCP resources |
| `/api/organizations/{orgId}/mcp/attach_prompt` | POST | Attach MCP prompt |
| `/api/organizations/{orgId}/mcp/attach_resource` | POST | Attach MCP resource |
| `/api/organizations/{orgId}/mcp/start` | POST | Start MCP connection |

### 1.13 Sync (GitHub, Google Drive, Outline)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/sync/settings` | GET/PUT | Sync settings |
| `/api/organizations/{orgId}/sync/settings/config` | GET | Sync config |
| `/api/organizations/{orgId}/sync/chat` | GET/POST | Sync chat |
| `/api/organizations/{orgId}/sync/chat/{id}` | GET/DELETE | Manage chat sync |
| `/api/organizations/{orgId}/sync/github/auth` | GET/POST | GitHub auth status/start |
| `/api/organizations/{orgId}/sync/github/auth/start` | POST | Start GitHub OAuth |
| `/api/organizations/{orgId}/sync/github/auth/finish` | POST | Finish GitHub OAuth |
| `/api/organizations/{orgId}/sync/github/repos` | GET | List GitHub repos |
| `/api/organizations/{orgId}/sync/github/repo` | GET | Get GitHub repo |
| `/api/organizations/{orgId}/sync/github/repo/{owner}/{repo}/search` | GET | Search GitHub repo |
| `/api/organizations/{orgId}/sync/github/repo/{owner}/{repo}/tree/{ref}` | GET | Get repo tree |
| `/api/organizations/{orgId}/sync/mcp/drive/auth` | GET/POST | Drive auth status |
| `/api/organizations/{orgId}/sync/mcp/drive/auth/start` | POST | Start Drive auth |
| `/api/organizations/{orgId}/sync/mcp/drive/document/{docId}` | GET | Get Drive doc |
| `/api/organizations/{orgId}/sync/mcp/drive/ingest` | POST | Ingest from Drive |
| `/api/organizations/{orgId}/sync/mcp/drive/recents` | GET | Recent Drive files |
| `/api/organizations/{orgId}/sync/mcp/outline/auth` | GET/POST | Outline auth |
| `/api/organizations/{orgId}/sync/mcp/outline/auth/start` | POST | Start Outline auth |
| `/api/organizations/{orgId}/sync/mcp/outline/document/{docId}` | GET | Get Outline doc |
| `/api/organizations/{orgId}/sync/ingestion/{id}/progress` | GET | Ingestion progress |
| `/api/organizations/{orgId}/sync/ingestion/gdrive/clean_up` | POST | Clean up Drive ingestion |

### 1.14 Subscription & Billing

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/subscription_details` | GET | Subscription details |
| `/api/organizations/{orgId}/subscription_status` | GET | Subscription status |
| `/api/organizations/{orgId}/subscription` | GET | Subscription info |
| `/api/organizations/{orgId}/subscription/cw` | POST | Subscription (Claude work) |
| `/api/organizations/{orgId}/subscription/verify-payment` | POST | Verify payment |
| `/api/organizations/{orgId}/subscription/preview_seat_purchase` | POST | Preview seat purchase |
| `/api/organizations/{orgId}/subscription/purchase_seats` | POST | Purchase seats |
| `/api/organizations/{orgId}/subscription/cancel_scheduled_seat_tier_changes` | POST | Cancel tier changes |
| `/api/organizations/{orgId}/subscription/scheduled_seat_tier_changes` | GET | Scheduled changes |
| `/api/organizations/{orgId}/end_subscription` | POST | End subscription |
| `/api/organizations/{orgId}/pause_subscription` | POST | Pause subscription |
| `/api/organizations/{orgId}/unpause_subscription` | POST | Unpause |
| `/api/organizations/{orgId}/resume_subscription` | POST | Resume |
| `/api/organizations/{orgId}/downgrade_individual_claude_subscription` | POST | Downgrade |
| `/api/organizations/{orgId}/cancel_subscription_downgrade` | POST | Cancel downgrade |
| `/api/organizations/{orgId}/upgrade_to_max` | POST | Upgrade to Max |
| `/api/organizations/{orgId}/pro/switch_billing_interval` | POST | Switch billing interval |
| `/api/organizations/{orgId}/pro/upgrade_to_yearly` | POST | Upgrade to yearly |
| `/api/organizations/{orgId}/team/upgrade_to_annual` | POST | Team upgrade to annual |
| `/api/organizations/{orgId}/payment_method` | GET | Payment method |
| `/api/organizations/{orgId}/payment_method/update_latest` | POST | Update payment |
| `/api/organizations/{orgId}/trial_status` | GET | Trial status |
| `/api/organizations/{orgId}/paused_subscription_details` | GET | Paused details |
| `/api/organizations/{orgId}/is_overage_billing_enabled` | GET | Overage billing check |
| `/api/organizations/{orgId}/is_pure_usage_based` | GET | Usage-based check |
| `/api/organizations/{orgId}/overage_spend_limit` | GET/PUT | Overage spend limit |
| `/api/organizations/{orgId}/overage_spend_limits` | GET | Overage limits |
| `/api/organizations/{orgId}/setup_overage_billing` | POST | Setup overage billing |
| `/api/organizations/{orgId}/mobile_overage_setup_intent` | POST | Mobile overage intent |
| `/api/organizations/{orgId}/reset_rate_limits` | POST | Reset rate limits |
| `/api/organizations/{orgId}/retention_coupon_eligibility` | GET | Retention coupon check |
| `/api/organizations/{orgId}/redeem_retention_coupon` | POST | Redeem coupon |
| `/api/organizations/{orgId}/referral/eligibility` | GET | Referral eligibility |
| `/api/organizations/{orgId}/referral/redemptions` | GET | Referral redemptions |
| `/api/organizations/{orgId}/cancellation_survey` | POST | Cancellation survey |
| `/api/organizations/{orgId}/contracted_quantity` | GET | Contracted quantity |
| `/api/organizations/{orgId}/purchasable_seat_allocations` | GET | Seat allocations |
| `/api/organizations/{orgId}/seat_tier_options` | GET | Seat tier options |
| `/api/organizations/{orgId}/renew_subscription/cw` | POST | Renew (Claude work) |
| `/api/organizations/{orgId}/acknowledge_trial_end` | POST | Acknowledge trial end |
| `/api/organizations/{orgId}/simulate_usage` | POST | Simulate usage |
| `/api/billing/{id}` | GET/POST | Billing operations |
| `/api/billing/promotion/{id}` | GET/POST | Promotion operations |
| `/api/organizations/{orgId}/prepaid/credits` | GET | Prepaid credits |
| `/api/organizations/{orgId}/prepaid/commits/{id}` | GET | Prepaid commits |
| `/api/organizations/{orgId}/contracts/prepaid/credits` | GET | Contract prepaid credits |
| `/api/organizations/{orgId}/contracts/auto_reload_settings` | GET/PUT | Auto-reload settings |

### 1.15 Organization Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}` | GET/PUT | Get/update org |
| `/api/organizations/{orgId}/address` | GET/PUT | Org address |
| `/api/organizations/{orgId}/members/{memberId}` | GET/PUT/DELETE | Manage member |
| `/api/organizations/{orgId}/members/assignable_seat_tiers` | GET | Seat tiers |
| `/api/organizations/{orgId}/members_limit` | GET | Members limit |
| `/api/organizations/{orgId}/member_invites` | GET/POST | Member invites |
| `/api/organizations/{orgId}/invites` | GET/POST | Invites |
| `/api/organizations/{orgId}/invites/bulk` | POST | Bulk invites |
| `/api/organizations/{orgId}/invites/{inviteId}` | DELETE | Delete invite |
| `/api/organizations/{orgId}/invite_requests` | GET | Invite requests |
| `/api/organizations/{orgId}/invite_requests/bulk` | POST | Bulk requests |
| `/api/organizations/{orgId}/roles` | GET | List roles |
| `/api/organizations/{orgId}/roles-configuration` | GET | Roles config |
| `/api/organizations/{orgId}/roles/{roleId}` | GET/PUT/DELETE | CRUD role |
| `/api/organizations/{orgId}/my-access` | GET | My access |
| `/api/organizations/{orgId}/allowed_domains` | GET/PUT | Allowed domains |
| `/api/organizations/{orgId}/feature_settings` | GET/PUT | Feature settings |
| `/api/organizations/{orgId}/browser_extension_settings` | GET/PUT | Extension settings |
| `/api/organizations/{orgId}/compliance_api_settings` | GET/PUT | Compliance settings |
| `/api/organizations/{orgId}/public_projects_enabled` | GET/PUT | Public projects toggle |
| `/api/organizations/{orgId}/notification/channels` | GET | Notification channels |
| `/api/organizations/{orgId}/notification/preferences` | GET/PUT | Notification preferences |
| `/api/organizations/{orgId}/icon` | PUT | Org icon |
| `/api/organizations/{orgId}/join` | POST | Join org |
| `/api/organizations/discoverable` | GET | Discoverable orgs |
| `/api/organizations/discoverability/check-domains` | GET | Check domain discoverability |

### 1.16 Admin

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/admin_activation/tasks` | GET | Admin tasks |
| `/api/organizations/{orgId}/admin_activation/tasks/{taskKey}/events` | POST | Task events |
| `/api/organizations/{orgId}/admin_requests` | GET | Admin requests |
| `/api/organizations/{orgId}/admin_requests/me` | GET | My admin requests |
| `/api/organizations/{orgId}/admin_requests/join_org` | POST | Join org request |
| `/api/organizations/{orgId}/admin_requests/join_org/{reqId}/approve` | POST | Approve join |
| `/api/organizations/{orgId}/admin_requests/limit_increase` | POST | Limit increase request |
| `/api/organizations/{orgId}/admin_requests/seat_upgrade` | POST | Seat upgrade request |
| `/api/organizations/{orgId}/admin_requests/{reqId}/dismiss` | POST | Dismiss request |
| `/api/organizations/{orgId}/admin_requests/dismiss_all` | POST | Dismiss all |
| `/api/organizations/{orgId}/admin/ghe-configurations` | GET/POST | GHE configs |
| `/api/organizations/{orgId}/admin/ghe-configurations/manifest-prepare` | POST | GHE manifest |
| `/api/organizations/{orgId}/admin/ghe-configurations/{configId}` | GET/PUT/DELETE | CRUD GHE config |
| `/api/organizations/{orgId}/admin/ghe-configurations/{configId}/test` | POST | Test GHE config |

### 1.17 Cowork (Claude Work / Agent Mode)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/cowork_settings` | GET/PUT | Cowork settings |
| `/api/organizations/{orgId}/cowork/trial` | POST | Start cowork trial |
| `/api/organizations/{orgId}/cowork/trial/dev` | POST | Dev trial |
| `/api/organizations/{orgId}/cowork/messages/{msgId}/safety_flags` | GET | Safety flags |

### 1.18 Dust (Claude Code / Desktop)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/dust/chat_autocomplete` | POST | Autocomplete |
| `/api/organizations/{orgId}/dust/command_display_names` | GET | Command names |
| `/api/organizations/{orgId}/dust/command_elicitation` | POST | Command elicitation |
| `/api/organizations/{orgId}/dust/generate_session_title` | POST | Generate title |
| `/api/organizations/{orgId}/dust/generate_title_and_branch` | POST | Title + branch |
| `/api/organizations/{orgId}/dust/mcp_messages` | POST | MCP messages |
| `/api/organizations/{orgId}/dust/org_shortname` | GET | Org shortname |

### 1.19 GitHub Integration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/github/organizations/{orgId}/github/{owner}/{repo}/branches` | GET | List branches |
| `/api/github/organizations/{orgId}/github_create_pr` | POST | Create PR |
| `/api/github/organizations/{orgId}/github_merge_branch` | POST | Merge branch |
| `/api/github/organizations/{orgId}/generate_pr_content` | POST | Generate PR content |
| `/api/organizations/{orgId}/code/repos` | GET | List code repos |
| `/api/organizations/{orgId}/code/repos/resync` | POST | Resync repos |
| `/api/organizations/{orgId}/code/shares/scan_secrets` | POST | Scan for secrets |

### 1.20 Snapshots

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat_snapshots/{id}` | GET | Get snapshot |
| `/api/organizations/{orgId}/chat_snapshots/{snapshotId}` | GET | Get org snapshot |
| `/api/organizations/{orgId}/chat_snapshots/{snapshotId}/task/{taskId}/status` | GET | Snapshot task status |
| `/api/organizations/{orgId}/snapshots/{snapshotId}/wiggle/download-file` | GET | Snapshot file download |
| `/api/organizations/{orgId}/snapshots/{snapshotId}/wiggle/download-files` | GET | Snapshot files download |

### 1.21 Proxy (Anthropic API in Artifacts)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/proxy/v1/messages` | POST | Proxy API calls from artifacts |

### 1.22 Prompt Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/prompt/improve/stream` | POST | Improve prompt (streaming) |

### 1.23 Experiences & Analytics

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/experiences/{expId}` | GET | Get experience |
| `/api/organizations/{orgId}/experiences/track` | POST | Track experience |
| `/api/organizations/{orgId}/flags/{flagId}/dismiss` | POST | Dismiss flag |
| `/api/organizations/{orgId}/image_gallery/click` | POST | Track gallery click |
| `/api/organizations/{orgId}/spotlight/action` | POST | Spotlight action |
| `/api/event_logging/batch` | POST | Batch event logging |
| `/api/banners` | GET | Get banners |
| `/api/banners/{bannerId}/dismiss` | POST | Dismiss banner |
| `/api/banners/{bannerId}/views/increment` | POST | Increment view count |

### 1.24 OAuth & Extensions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/oauth/organizations/{orgId}/oauth_tokens` | GET | List OAuth tokens |
| `/api/oauth/organizations/{orgId}/oauth_tokens/{tokenId}/revoke` | POST | Revoke token |
| `/api/oauth/organizations/{orgId}/environments/{envId}/tokens` | GET | Env tokens |
| `/api/oauth/organizations/{orgId}/environments/{envId}/tokens/{tokenId}/revoke` | POST | Revoke env token |
| `/api/organizations/{orgId}/dxt/extensions` | GET | List extensions |
| `/api/organizations/{orgId}/dxt/installable_extensions` | GET | Installable extensions |

### 1.25 Marketplaces & Plugins

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/marketplaces/list-account-marketplaces` | GET | Account marketplaces |
| `/api/organizations/{orgId}/marketplaces/list-default-marketplaces` | GET | Default marketplaces |
| `/api/organizations/{orgId}/marketplaces/list-org-marketplaces` | GET | Org marketplaces |
| `/api/organizations/{orgId}/marketplaces/ghe-hostnames` | GET | GHE hostnames |
| `/api/organizations/{orgId}/marketplaces/{mktId}/plugins/list-plugins` | GET | List plugins |
| `/api/organizations/{orgId}/marketplaces/{mktId}/plugins/account-list-plugins` | GET | Account plugins |
| `/api/organizations/{orgId}/marketplaces/{mktId}/plugins/admin-list` | GET | Admin plugins |
| `/api/organizations/{orgId}/marketplaces/{mktId}/plugins/account` | POST | Account plugin ops |
| `/api/organizations/{orgId}/marketplaces/{mktId}/plugins/admin` | POST | Admin plugin ops |
| `/api/organizations/{orgId}/marketplaces/{mktId}/plugins/{pluginId}` | GET | Get plugin |
| `/api/organizations/{orgId}/marketplaces/{mktId}/plugins/{pluginId}/installation-preference` | PUT | Set install pref |
| `/api/organizations/{orgId}/marketplaces/{mktId}/plugin_upload` | POST | Upload plugin |
| `/api/organizations/{orgId}/plugins/list-plugins` | GET | List plugins (flat) |
| `/api/organizations/{orgId}/plugins/upload-plugin` | POST | Upload plugin (flat) |

### 1.26 LTI (Learning Tools Interoperability)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/lti/platforms` | GET/POST | LTI platforms |
| `/api/organizations/{orgId}/lti/platforms/{platformId}` | GET/PUT/DELETE | CRUD platform |

### 1.27 Model Config

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/organizations/{orgId}/model_configs/{configId}` | GET/PUT | Model configuration |

### 1.28 Miscellaneous

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/referral` | GET | Referral info |
| `/api/referral/guest/redeemed` | GET | Guest referral redeemed |
| `/api/challenge_redirect` | GET | Challenge redirect |
| `/api/internal/accounts/{acctId}/public_profile` | GET | Internal public profile |
| `/api/desktop/darwin/universal/dmg/latest/redirect` | GET | macOS download |
| `/api/desktop/win32/x64/setup/latest/redirect` | GET | Windows x64 download |
| `/api/desktop/win32/arm64/setup/latest/redirect` | GET | Windows ARM64 download |
| `/api/enterprise_auth/idp_redirect_url` | GET | Enterprise SSO redirect |
| `/api/enterprise_auth/sso_callback` | POST | SSO callback |
| `/api/organizations/{orgId}/fiddlehead/disconnect_and_delete_all` | POST | Disconnect fiddlehead |
| `/web-api/gated-messages` | GET | Gated messages (locale param) |
| `/i18n/{locale}.json` | GET | Localization |
| `/i18n/{locale}.overrides.json` | GET | Locale overrides |
| `/i18n/statsig/{locale}.json` | GET | Statsig locale |

### 1.29 WebSocket / SSE / EventSource

| Pattern | Usage |
|---------|-------|
| `text/event-stream` | SSE for completion streaming |
| `EventSource` | Used by some polling endpoints |
| `ws://localhost:4001` | Dev-only WebSocket (not production) |
| `WebSocket` | Referenced but not used for production chat |

---

## 2. FEATURES FROM SYSTEM PROMPT

### 2.1 Tools Available to Claude

**Core tools (always available):**
1. `create_file` - Create artifact files at `/mnt/user-data/outputs/`
2. `present_files` - Present files to user for viewing/download
3. `show_widget` - Render SVG/HTML inline (mentioned in proxy but NOT in leaked prompt's tool list directly -- the proxy implements this)
4. `web_search` - Web search via search engine
5. `web_fetch` - Fetch full web page content
6. `image_search` - Search for images on the web
7. `bash_tool` - Execute bash commands in Linux container
8. `str_replace` - Edit existing files
9. `file_create` - Create new files (alias of create_file in computer-use context)
10. `view` - Read files and directories

**Memory tools (not available in incognito/temporary):**
11. `memory_user_edits` - CRUD for memory (view/add/remove/replace)
12. `conversation_search` - Keyword search past conversations
13. `recent_chats` - Time-based recent chat retrieval

**MCP connector tools (user-connected, dynamic):**
14. `Slack:slack_send_message` - Send Slack messages
15. `Slack:slack_read_channel` - Read Slack channels
16. `Slack:slack_search_public` - Search public Slack
17. `Slack:slack_search_public_and_private` - Search all Slack
18. `Slack:slack_search_channels` - Search Slack channels
19. `Slack:slack_search_users` - Search Slack users
20. `Slack:slack_read_thread` - Read Slack threads
21. `Slack:slack_read_user_profile` - Read user profile
22. `Slack:slack_send_message_draft` - Create message draft
23. `Slack:slack_schedule_message` - Schedule message
24. `Slack:slack_create_canvas` - Create canvas
25. `Slack:slack_read_canvas` - Read canvas
26. `google_drive_search` - Search Google Drive
27. `google_drive_fetch` - Fetch Google Drive document
28. `search_gmail_messages` - Search Gmail
29. `read_gmail_message` - Read Gmail message
30. `read_gmail_thread` - Read Gmail thread
31. `read_gmail_profile` - Read Gmail profile
32. `message_compose_v1` - Compose email
33. `list_gcal_calendars` - List Google calendars
34. `list_gcal_events` - List calendar events
35. `fetch_gcal_event` - Fetch specific event
36. `find_free_time` - Find free time slots
37. `places_search` - Search places
38. `places_map_display_v0` - Display map
39. `weather_fetch` - Fetch weather
40. `recipe_display_v0` - Display recipes
41. `fetch_sports_data` - Fetch sports data
42. `ask_user_input_v0` - Ask user for input
43. `end_conversation` - End conversation

### 2.2 Memory System
- Memories derived from past conversations, updated periodically in background
- `<userMemories>` tag injected into system prompt
- Disabled in incognito mode
- Memory controls: `memory_user_edits` tool (view/add/remove/replace)
- Max 30 edits, 200 chars each
- Memory themes endpoint
- Memory synthesis endpoint
- Memory reset endpoint
- Project-scoped memory (`project_uuid` param)

### 2.3 Past Chats
- `conversation_search`: keyword-based search of past conversations
- `recent_chats`: time-based retrieval (1-20 chats per call, with before/after/sort_order)
- Scoped to project or non-project conversations
- Returns `<chat uri='{uri}' url='{url}' updated_at='{updated_at}'>` tags

### 2.4 Web Search
- Uses `web_search` tool
- `web_fetch` for full page retrieval
- `image_search` for image results (3-4 images per call)
- Citation system: `<cite index="DOC_INDEX-SENTENCE_INDEX">` tags
- Copyright compliance: 15-word quote limit, 1 quote per source max
- User location awareness (timezone, city)

### 2.5 Skills System
- Skills stored at `/mnt/skills/public/`, `/mnt/skills/user/`, `/mnt/skills/example/`
- Available skills: docx, pdf, pptx, xlsx, product-self-knowledge, frontend-design
- Each skill has a `SKILL.md` file
- Claude reads SKILL.md before performing relevant tasks
- Org-level skill management (create, edit, delete, enable, disable, rename, duplicate)

### 2.6 Project System
- Projects contain conversations, docs, files, syncs, knowledge bases
- Project-scoped instructions injected as `<project_instructions>`
- Project links injected as `<link url="" title="" />`
- Project permissions, accounts, settings
- Starter project support
- Haystack requests

### 2.7 Styles System
- `<userStyle>` tag injected into system prompt
- `<userExamples>` for content examples
- `<userPreferences>` for behavioral/contextual preferences
- Create, edit, delete, preview styles
- `list_styles` endpoint
- Styles can be toggled mid-conversation

### 2.8 Incognito Mode (Temporary Conversations)
- `is_temporary: true` flag on conversations
- Memory system disabled
- Past chats tools disabled
- Memory tools disabled
- 29 references to incognito in bundle

### 2.9 Compass Mode / Deep Research
- `compass_mode` / `research_mode: "advanced"` flags
- 28 references to `compass_mode` in bundle
- Task-based polling: `task/{taskId}/status`, `task/{taskId}/stop`
- Long-running research tasks with status polling

### 2.10 Cowork (Agent Mode / Claude Work)
- 402 references in bundle (major feature)
- Has own settings, trial, drive export
- Safety flags system
- Present files and launch code sessions
- Snapshot sync, onboarding flow
- Extended thinking toggle
- Model selection
- Image upload
- Guest pass upsell

### 2.11 Voice Mode
- 205 references in bundle
- `voice_mode`, `voice_mode_active`, `voice_config`, `voice_id`
- Voice notes, voice streaming
- Voice preference settings

### 2.12 Computer Use
- Linux Ubuntu 24 container
- bash_tool, str_replace, file_create, view tools
- Upload path: `/mnt/user-data/uploads`
- Output path: `/mnt/user-data/outputs`
- Working dir: `/home/claude`
- Skills at `/mnt/skills/`
- Network access configurable

### 2.13 Anthropic API in Artifacts
- Artifacts can call `/api/organizations/{orgId}/proxy/v1/messages`
- Uses Claude Sonnet 4 model
- Supports MCP servers in API calls
- Supports web search tool in API calls
- No API key needed (handled by proxy)

### 2.14 Persistent Storage for Artifacts
- `window.storage.get/set/delete/list` API
- Personal (shared=false) and shared (shared=true) scopes
- `/api/organizations/{orgId}/artifacts/{type}/{artifactId}/storage/{key}` endpoints
- Keys under 200 chars, values under 5MB

### 2.15 File Handling
- File upload to conversations and projects
- Document conversion
- File preview
- Export to Google Drive
- Convert file to artifact

### 2.16 Sharing & Publishing
- Share conversations
- Chat snapshots
- Publish artifacts (with embed whitelist)
- Shared artifact file access

---

## 3. PROXY IMPLEMENTATION STATUS

### 3.1 What the Proxy ALREADY Handles

**Fully owned (intercepted, served from PostgreSQL/LiteLLM):**
| Route | Status | Notes |
|-------|--------|-------|
| `POST /api/organizations/:orgId/chat_conversations` | OWNED | Creates in PostgreSQL |
| `PUT /api/organizations/:orgId/chat_conversations/:convId` | OWNED | Updates settings/title in PostgreSQL |
| `GET /api/organizations/:orgId/chat_conversations/:convId` | OWNED | Serves from PostgreSQL (tree=True for messages) |
| `POST /api/organizations/:orgId/chat_conversations/:convId/title` | OWNED | Updates title in PostgreSQL |
| `POST /api/organizations/:orgId/chat_conversations/:convId/completion` | OWNED | Routes to LiteLLM, streams SSE, stores in PostgreSQL |
| `POST /api/organizations/:orgId/chat_conversations/:convId/retry_completion` | OWNED | Removes last assistant turn, re-runs via LiteLLM |
| `GET /api/organizations/:orgId/memory` | OWNED | Serves from PostgreSQL |
| `GET /api/organizations/:orgId/subscription_details` | OWNED | Returns fake claude_max subscription |
| `GET /wiggle/download-file` | OWNED | Serves artifacts from PostgreSQL |
| `GET /artifacts/wiggle_artifact/:artifactId/tools` | OWNED | Returns empty tools array |
| `GET /api/organizations/:orgId/artifacts/:artifactId/versions` | OWNED | Serves artifact versions from PostgreSQL |

**Patched pass-through (fetched from claude.ai, response modified):**
| Route | Status | Notes |
|-------|--------|-------|
| `GET /api/account` | PATCHED | Patches capabilities, billing_type, rate_limit_tier |
| `GET /api/bootstrap/:id/app_start` | PATCHED | Patches org capabilities, growthbook/statsig (isPro/isMax), models (minimum_tier=free) |

**Catch-all pass-through (forwarded to claude.ai unmodified):**
| Route | Status | Notes |
|-------|--------|-------|
| All other `/api/*` routes | PASS-THROUGH | Forwarded with cookie header to claude.ai |

### 3.2 Tools Implemented by Proxy

| Tool | Status | Notes |
|------|--------|-------|
| `create_file` | IMPLEMENTED | Stores in PostgreSQL artifacts table |
| `present_files` | IMPLEMENTED | Returns local_resource blocks |
| `show_widget` | IMPLEMENTED | Returns "Widget rendered successfully" |
| `web_search` | IMPLEMENTED | Routes to SearXNG instance |
| `memory_user_edits` | IMPLEMENTED | Full CRUD against PostgreSQL memories |
| `conversation_search` | IMPLEMENTED | Searches PostgreSQL history |
| `recent_chats` | IMPLEMENTED | Time-based query against PostgreSQL |

### 3.3 System Prompt Construction
- Date injection
- Tone/formatting instructions
- Code/artifact instructions
- Search instructions
- Knowledge cutoff
- Safety guidelines
- Style support (`<userStyle>`)
- Memory injection (`<userMemories>`)
- Past chats tool instructions
- Project instructions and links

---

## 4. GAP ANALYSIS

### 4.1 Endpoints the Proxy Does NOT Handle (Passed Through to claude.ai)

These are passed through to real claude.ai. For free accounts, many will work but some will fail.

#### LIKELY TO WORK FOR FREE ACCOUNTS (pass-through OK):
| Endpoint Category | Examples | Why It Works |
|-------------------|----------|--------------|
| Auth | `/api/auth/*` | Authentication is account-tier-agnostic |
| Account | `/api/account`, `/api/account_profile`, `/api/account/settings` | Account info works for all tiers |
| Styles | `/api/organizations/{orgId}/list_styles` | Styles are available to all users |
| Banners | `/api/banners` | UI banners work for all tiers |
| Event logging | `/api/event_logging/batch` | Analytics/telemetry works for all |
| i18n | `/i18n/*.json` | Localization works for all |
| Conversation search | `/api/organizations/{orgId}/conversation/search` | Should work for free (but proxy also implements this locally) |

#### LIKELY TO 403/FAIL FOR FREE ACCOUNTS:
| Endpoint Category | Examples | Why It Fails |
|-------------------|----------|--------------|
| Projects (full) | `POST /api/organizations/{orgId}/projects`, project docs, files, syncs | Projects are a Pro+ feature |
| MCP connectors | `/api/organizations/{orgId}/mcp/remote_servers`, `/mcp/start`, `/mcp/v2/bootstrap` | MCP connectors require Pro+ |
| GitHub integration | `/api/github/organizations/{orgId}/*`, `/api/organizations/{orgId}/sync/github/*` | GitHub sync is Pro+ |
| Google Drive sync | `/api/organizations/{orgId}/sync/mcp/drive/*` | Drive sync is Pro+ |
| Outline sync | `/api/organizations/{orgId}/sync/mcp/outline/*` | Outline sync is Pro+ |
| Skills management | Most `/api/organizations/{orgId}/skills/*` | Skill management is Pro+ |
| Published artifacts | `/api/organizations/{orgId}/published_artifacts`, `/publish_artifact` | Publishing is Pro+ |
| Artifact storage | `/api/organizations/{orgId}/artifacts/{type}/{id}/storage/*` | Persistent storage is Pro+ |
| Proxy API (in artifacts) | `/api/organizations/{orgId}/proxy/v1/messages` | Artifact API calls are Pro+ |
| Code repos | `/api/organizations/{orgId}/code/repos` | Code features are Pro+ |
| Cowork (agent) | `/api/organizations/{orgId}/cowork_settings`, `/cowork/trial` | Cowork is Max tier |
| Dust (desktop) | `/api/organizations/{orgId}/dust/*` | Claude Code features are Max tier |
| Compass/research tasks | `task/{taskId}/status`, `task/{taskId}/stop` | Research mode is Pro+ |
| Memory synthesis | `/api/organizations/{orgId}/memory/synthesize` | May require Pro+ |
| Memory themes | `/api/organizations/{orgId}/memory/themes` | May require Pro+ |
| Model configs | `/api/organizations/{orgId}/model_configs/{id}` | Model config management is Pro+ |
| File upload | `/api/organizations/{orgId}/upload`, project file uploads | Upload limits differ by tier |
| Conversation file ops | `/api/organizations/{orgId}/conversations/{convId}/wiggle/upload-file` | May have tier restrictions |
| Tool result submission | `/api/organizations/{orgId}/chat_conversations/{convId}/tool_result` | Completion-adjacent, but proxy doesn't own it |
| Tool approval | `/api/organizations/{orgId}/chat_conversations/{convId}/tool_approval` | MCP tool approval, Pro+ |
| Stop response | `/api/organizations/{orgId}/chat_conversations/{convId}/stop_response` | Would try to stop a response on claude.ai that doesn't exist there |
| Completion status | `/api/organizations/{orgId}/chat_conversations/{convId}/completion_status` | Would poll claude.ai for a completion that ran on LiteLLM |

#### WILL DEFINITELY BREAK (functional mismatch):
| Endpoint | Problem |
|----------|---------|
| `GET /api/organizations/{orgId}/chat_conversations_v2` | Lists conversations from claude.ai, not from PostgreSQL. User sees different conversation list. |
| `POST /api/organizations/{orgId}/chat_conversations/delete_many` | Deletes on claude.ai but not in PostgreSQL. Orphaned local data. |
| `POST /api/organizations/{orgId}/chat_conversations/move_many` | Moves on claude.ai but not in PostgreSQL. |
| `GET /api/organizations/{orgId}/chat_conversations/{convId}/completion_status` | Polls claude.ai for completion status of a completion that was run via LiteLLM. Always returns stale/wrong data. |
| `POST /api/organizations/{orgId}/chat_conversations/{convId}/stop_response` | Sends stop to claude.ai, but the completion is running on LiteLLM. No effect. |
| `GET /api/organizations/{orgId}/chat_conversations/{convId}/current_leaf_message_uuid` | Returns claude.ai's leaf UUID, not proxy's. |
| `GET /api/organizations/{orgId}/chat_conversations/{convId}/latest` | Returns claude.ai's latest, not proxy's. |
| `POST /api/organizations/{orgId}/chat_conversations/{convId}/share` | Tries to share on claude.ai, but the conversation doesn't exist there. |
| `POST /api/organizations/{orgId}/conversation/backfill` | Backfills on claude.ai, not in PostgreSQL. |
| `GET /api/organizations/{orgId}/memory/controls` | Returns claude.ai's memory controls, not PostgreSQL's. |
| `POST /api/organizations/{orgId}/memory/reset` | Resets claude.ai memory, not PostgreSQL memory. |
| `POST /api/organizations/{orgId}/chat_conversations/{convId}/tool_result` | Submits tool result to claude.ai, but completion is running on LiteLLM. |

### 4.2 Features the Proxy Does NOT Handle At All

| Feature | What's Missing |
|---------|----------------|
| **Conversation listing** | No `chat_conversations_v2` endpoint. Users can't see their proxy conversations in the sidebar. |
| **Conversation deletion** | No `delete_many` or single-conversation DELETE. |
| **Conversation moving** | No `move_many` between projects. |
| **Stop response** | No way to stop a running LiteLLM completion. |
| **Completion status polling** | No `completion_status` endpoint for the proxy. |
| **Tool approval (MCP)** | No `tool_approval` endpoint. |
| **Tool result submission** | No `tool_result` endpoint (proxy auto-handles tools internally). |
| **Conversation branching** | No support for `/{branchId}` sub-routes or `current_leaf_message_uuid`. |
| **Model fallback** | No `model_fallback` endpoint. |
| **Message flagging** | No `chat_messages/{msgId}/flags` endpoint. |
| **Conversation sharing** | No `share` endpoint. |
| **Snapshots** | No snapshot creation or retrieval. |
| **Projects** | Entirely passed through to claude.ai (will 403 for free accounts). |
| **MCP connectors** | Entirely passed through (will 403 for free accounts). |
| **Skills management** | Entirely passed through (will 403 for free accounts). |
| **Persistent artifact storage** | No `storage/{key}` endpoints. |
| **Artifact publishing** | No publish/unpublish endpoints. |
| **Artifact proxy API** | No `/proxy/v1/messages` endpoint. |
| **File uploads** | No upload endpoints owned by proxy. |
| **Document conversion** | No `convert_document` endpoint. |
| **Voice mode** | No voice infrastructure at all. |
| **Compass / deep research** | No task polling/stopping infrastructure. |
| **Cowork / agent mode** | No cowork endpoints. |
| **Google Drive export** | No export endpoints. |
| **Memory controls** | No `memory/controls` endpoint (proxy has memory but not the controls sub-endpoint). |
| **Memory reset** | No `memory/reset` endpoint for proxy memory. |
| **Memory synthesis** | No `memory/synthesize` endpoint. |
| **Memory themes** | No `memory/themes` endpoint. |
| **Image search** | Tool definition not included in proxy tool list (only web_search). |
| **web_fetch** | Tool definition not included in proxy tool list. |
| **Prompt improvement** | No `prompt/improve/stream` endpoint. |

### 4.3 SSE/Streaming Event Differences

The proxy correctly implements:
- `message_start` (with uuid, parent_uuid, trace_id, request_id patching)
- `content_block_start` / `content_block_delta` / `content_block_stop` (with index offset)
- `message_delta` / `message_stop`
- `message_limit` injection (fakes within_limit status)
- Tool use block augmentation (message, integration_name, icon_name, display_content)
- Tool result SSE generation
- `tool_use_block_update_delta` for create_file live preview
- Thinking block pass-through (thinking_delta, signature_delta)

Missing SSE features:
- No `citations` in text blocks (web search citations use `<cite>` tags, not SSE citation blocks)
- No `flags` field population in content blocks
- No support for `research_analysis` event type (compass mode)
- No `tool_approval` events (MCP interactive approval flow)

### 4.4 System Prompt Gaps

The proxy's system prompt covers:
- Date, tone, formatting, code/artifacts, search, knowledge cutoff, safety
- Styles (`<userStyle>`)
- Memory (`<userMemories>`)
- Past chats tool instructions
- Project instructions and links

Missing from proxy's system prompt:
- `<userPreferences>` tag injection (behavioral/contextual preferences)
- `<userExamples>` tag injection (style content examples)
- Computer use instructions (bash_tool, str_replace, view, file system layout)
- Skill system instructions (available_skills, SKILL.md reading)
- Anthropic API in artifacts instructions
- Persistent storage API instructions
- Citation instructions (`<cite>` system)
- Image search usage instructions
- Drive search / Gmail instructions
- MCP connector tool instructions
- Location/timezone awareness
- Copyright compliance rules

### 4.5 Tool Definition Gaps

**Proxy implements these tools:**
- create_file, present_files, show_widget, web_search
- memory_user_edits, conversation_search, recent_chats

**Claude.ai also has (proxy doesn't):**
- web_fetch (fetch full page content)
- image_search (image results with dimensions)
- bash_tool (execute bash in container)
- str_replace (edit files in container)
- view (read files/directories in container)
- file_create (create files in container)
- end_conversation
- ask_user_input_v0
- places_search, places_map_display_v0
- weather_fetch
- recipe_display_v0
- fetch_sports_data
- All MCP connector tools (Slack, Gmail, Google Drive, Calendar, etc.)
- All dynamic tools from user-connected MCP servers

---

## 5. PRIORITY RECOMMENDATIONS

### Critical (breaks core UX):
1. **Conversation listing** (`chat_conversations_v2`) - Users can't see conversations in sidebar
2. **Conversation deletion** (`delete_many`) - Users can't delete conversations
3. **Stop response** - Users can't stop runaway completions
4. **Memory controls** (`memory/controls`) - Users can't manage memory from UI
5. **Memory reset** (`memory/reset`) - Users can't reset proxy memory

### High (features that 403 for free accounts):
6. **Projects** - Either implement locally or return appropriate stubs
7. **MCP connectors** - Return empty server lists
8. **Skills** - Return default skill lists
9. **Artifact storage** - Implement locally for persistence
10. **Image search tool** - Add to tool definitions

### Medium (polish):
11. **web_fetch tool** - Add for full page retrieval
12. **Completion status** - Return appropriate status for proxy completions
13. **Citation support** - Pass through `<cite>` tags properly
14. **User preferences** - Include `<userPreferences>` in system prompt
15. **File upload** - Route uploads to proxy storage

### Low (specialized features):
16. Voice mode, Compass/research, Cowork/agent, GitHub integration
17. Prompt improvement, Document conversion
18. Published artifacts, Snapshots, Sharing
