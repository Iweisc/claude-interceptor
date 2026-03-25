# Claude.ai Frontend Feature Gating Reference

**Source:** `index-DcrCrePJ.js` (7.2MB bundle)
**Extracted:** 2026-03-22

---

## 1. GrowthBook Feature Flags (Bx / Waffle Flags)

The frontend uses GrowthBook for feature flagging. Flags are accessed via `Bx("flag_name")` which resolves to a GrowthBook feature's `.on` boolean. The underlying function `Ax(name)` hashes the flag name and looks up the GrowthBook feature. Config values are read via `qx("flag_name", "key", default, parser)` for structured data, `Ux("flag_name", default, schema)` for objects, and `Vx("flag_name", "key")` for simple values.

### Complete List of Bx() Feature Flags (175 flags)

#### Core Chat & UI
| Flag | What It Controls |
|------|-----------------|
| `chat_autocomplete` | Autocomplete in chat input (uses `/dust/chat_autocomplete` endpoint) |
| `chat_capability_controls` | UI controls for toggling capabilities in chat |
| `chat_suggestion_chips_enabled` | Suggestion chips shown below chat input |
| `claudeai_inline_conversation_creation` | Creating conversations inline (vs. redirect) |
| `claudeai_restore_prompt_on_abort` | Restoring the user's prompt text when streaming is aborted |
| `claudeai_use_cached_stream` | Use cached stream data for message rendering |
| `claudeai_collapse_timeline_groups` | Collapse timeline groups in conversation view |
| `claudeai_completion_status_sidebar` | Show completion status polling in sidebar |
| `claude_ai_prefetch` | Prefetch conversation data for faster loads |
| `claude_ai_msg_idempotency` | Message idempotency for deduplication |
| `claude_ai_sticky_project_settings` | Persist project settings across conversations |
| `claude_ai_segment_enabled` | Enable Segment analytics |
| `log_segment_events` | Log Segment analytics events |
| `claudeai_unsafe_prompt_inline` | Show unsafe prompt warning inline |
| `plain_text_input` | Force plain text input (no rich text) |
| `command_palette` | Enable command palette (Cmd+K) |
| `sticky_model_selector` | Keep model selector sticky in UI |
| `model_selector_enabled` | Show model selector dropdown |
| `completion_retry_disabled` | Disable automatic completion retries |
| `completion_retry_emergency` | Emergency completion retry behavior |
| `read_only_mode` | Put the entire app in read-only mode |

#### Memory / Saffron
| Flag | What It Controls |
|------|-----------------|
| `claudeai_saffron_enabled` | Master toggle for Memory feature (codename: "saffron") |
| `claudeai_saffron_default_enabled` | Whether memory is enabled by default for new users |
| `claudeai_saffron_admin_toggle_enabled` | Show admin toggle for memory (only if saffron not globally on) |
| `claudeai_saffron_search_enabled` | Enable conversation search via memory |
| `claudeai_saffron_search_default_enabled` | Memory-based search enabled by default |
| `claudeai_saffron_ghost_enabled` | Ghost/shadow memory feature |
| `claudeai_saffron_port_enabled` | Memory port/import feature |
| `claudeai_saffron_themes_enabled` | Memory themes display |

#### Artifacts / Wiggle
| Flag | What It Controls |
|------|-----------------|
| `wiggle_enabled` | Enable artifact file attachments in chat |
| `wiggle_graduated` | Artifacts feature graduated (always-on, skip preview checks) |
| `default_wiggle_on` | Default artifacts to on for new users |
| `claudeai_default_wiggle_egress_enabled` | Enable artifact download/export by default |
| `claudeai_default_wiggle_egress_enabled_without_spotlight` | Same but skip spotlight intro |
| `claudeai_wiggle_egress_settings` | Show wiggle egress settings in UI |
| `claudeai_monkeys_in_a_barrel_spotlight` | Show spotlight/intro for code execution feature |

#### Web Search & Connectors
| Flag | What It Controls |
|------|-----------------|
| `claude_ai_image_search` | Enable image search in web results |
| `claudeai_image_search_feedback` | Show feedback UI for image search |
| `kingfisher_enabled` | Google Drive file browsing/attachment (codename: "kingfisher") |
| `kingfisher_prefetch` | Prefetch Google Drive recent docs |
| `cinnabon_enabled` | Free-tier connector access (non-Gmail/GCal connectors for free users) |
| `suggested_connectors` | Show suggested connectors in chat |
| `suggested_connectors_desktop_chat` | Suggested connectors in desktop chat |
| `claudeai_slash_connectors` | Connectors via slash command menu |
| `spider_enabled_2` | Additional connector integrations (Outline, Salesforce, Asana) |
| `enabled_brioche` | Enable Brioche (Google GSuite native integration) |
| `enabled_brioche_banner` | Show banner for Brioche feature |

#### MCP (Model Context Protocol)
| Flag | What It Controls |
|------|-----------------|
| `mcp_gdrive` | MCP-based Google Drive integration |
| `mcp_bootstrap_first_pass_enabled` | MCP bootstrap first pass |
| `mcp_clear_cache` | Clear MCP server cache |
| `mcp_shttp` | MCP over Streamable HTTP transport |
| `mcp_tb_sessions` | MCP tool-based sessions |
| `claudeai_mcp_bootstrap_eager` | Eager MCP bootstrap loading |
| `claudeai_mcp_apps_visualize` | Visualize MCP app interactions |
| `claude_ai_mcp_directory_web_only` | MCP directory only for web (not desktop) |
| `cai_cos_mcp_registry_search` | MCP registry search |
| `disable_destructive_mcp_tools_by_default` | Disable destructive MCP tools by default |
| `sensitive_mcps_per_call_consent` | Per-call consent for sensitive MCP operations |
| `papi_mcp` | PAPI MCP integration |
| `mention_provider_mcp_resources` | MCP resources in @-mention provider |
| `tmp_claudeai_mcp_auth_errors_ui` | MCP auth error UI (temporary flag) |
| `tmp_claudeai_connector_suggestion_error_state` | Connector suggestion error state (temporary) |
| `bagel_enabled` | MCP directory browsing feature (codename: "bagel") |
| `chrome_ext_mcp_integration` | Chrome extension MCP integration |

#### Skills / Fusions
| Flag | What It Controls |
|------|-----------------|
| `claudeai_skills` | Enable Skills feature |
| `claudeai_simplified_slash_menu_enabled` | Simplified slash command menu |
| `claudeai_fsi_skill_chips` | Skill chips in FSI (first-send input) |
| `suggested_plugins` | Show suggested plugins/skills |

#### Yukon Silver / Agent Mode (Desktop)
| Flag | What It Controls |
|------|-----------------|
| `yukon_silver` | Master toggle for Yukon Silver (computer use / agent mode on desktop) |
| `yukon_silver_clocks` | Yukon Silver time-based features |
| `yukon_silver_cuttlefish` | Cuttlefish connector in Yukon Silver |
| `yukon_silver_extension_install` | Extension install flow in Yukon Silver |
| `yukon_silver_fishing` | Yukon Silver fishing feature (task discovery) |
| `yukon_silver_folders` | Folder management in Yukon Silver |
| `yukon_silver_octopus` | Multi-tool orchestration in Yukon Silver |
| `yukon_silver_thinking` | Show thinking in Yukon Silver mode |

#### Yukon Gold (Custom Modes / Personas)
| Flag | What It Controls |
|------|-----------------|
| `yukon_gold_debug_menu_enabled` | Debug menu for Yukon Gold |
| `claude_ai_learning_mode` | Learning mode experience (project templates) |

#### Claude Code (Web & Desktop)
| Flag | What It Controls |
|------|-----------------|
| `claude_code_waffles` | Claude Code access for Raven (team/enterprise) orgs |
| `claudeai_cc_epitaxy` | Claude Code Epitaxy feature (code editing experience) |
| `claudeai_cc_new_chat` | New chat experience in Claude Code |
| `claudeai_ccd_new_sidebar` | New sidebar for Claude Code Desktop |
| `claudeai_ccd_plugins_enabled` | Plugins in Claude Code Desktop |
| `ccd_terminal_enabled` | Terminal in Claude Code Desktop |
| `ccr_plan_mode_enabled` | Plan mode in Claude Code Review |
| `ccr_plan_edit_mode` | Plan edit mode in CCR |
| `ccr_disable_plan_inline_comments` | Disable inline plan comments in CCR |
| `ccr_autofix_ui` | Autofix UI in Code Review |
| `ccr_beam_me_up` | "Teleport to cloud" from Code Review |
| `ccr_cobalt_lantern` | Cobalt Lantern feature in CCR |
| `ccr_dynamic_island` | Dynamic island UI in CCR sessions |
| `ccr_velvet_broom` | Auto-archive sessions on PR close |
| `ccr_stuck_session_banner` | Stuck session warning banner |
| `ccr_session_export` | Export Code Review sessions |
| `cowork_launch_code_session` | Launch code session from cowork |

#### Cowork / Desktop Agent
| Flag | What It Controls |
|------|-----------------|
| `chilling_sloth` | Desktop agent / cowork master feature (codename) |
| `chilling_sloth_clocks` | Time-based cowork features |
| `cowork_default_landing_enabled` | Cowork as default landing page |
| `cowork_amber_horizon` | Cowork version requirement check |
| `cowork_auto_permission_mode` | Auto-permission mode for cowork tools |
| `cowork_bypass_permissions_mode` | Bypass permissions mode for cowork |
| `cowork_drive_export` | Export to Google Drive from cowork |
| `cowork_error_retry_button` | Retry button on cowork errors |
| `cowork_feedback_button` | Feedback button in cowork |
| `cowork_ideas_tab` | Ideas tab in cowork sidebar |
| `cowork_otlp` | OpenTelemetry logging for cowork |
| `cowork_redownload_spotlight` | Spotlight for re-downloading cowork |
| `cowork_referrals` | Referral system for cowork |
| `cowork_rewind_button` | Rewind button in cowork |
| `cowork_safety_banners` | Safety banners in cowork |
| `cowork_snapshot_sync` | Snapshot sync in cowork |
| `cowork_tester_overrides_admin` | Admin overrides for cowork testers |
| `cowork_upsell_banner` | Upsell banner in cowork |

#### Voice Mode
| Flag | What It Controls |
|------|-----------------|
| `claude_ai_voice_mode` | Enable voice mode |
| `desktop_dictation_voice` | Desktop dictation/voice input |

#### Billing & Subscriptions
| Flag | What It Controls |
|------|-----------------|
| `bad_moon_rising` | Enable overages (usage-based billing beyond plan limits); requires paid plan |
| `bad_moon_rising_skip_status` | Skip status check for overages |
| `aws_marketplace_overage` | AWS Marketplace overage billing |
| `overage_billing_mobile_support` | Overage billing on mobile |
| `overages_upsell_disabled` | Disable overages upsell |
| `past_due_subscription_enforcement` | Enforce past-due subscription restrictions |
| `gift_subscriptions_enabled` | Enable gift subscriptions |
| `end_user_invites` | End user invitation system |
| `is_desktop_upsell_enabled` | Desktop app upsell |
| `code_desktop_app_install_banner` | Code desktop app install banner |
| `code_slack_app_install_banner` | Slack app install banner |
| `show_claude_desktop_download_link` | Show desktop download link |
| `trials_and_tribulations_of_high_school_football` | Feature availability checks (used for feature_settings queries) |

#### Enterprise & Admin
| Flag | What It Controls |
|------|-----------------|
| `admin_settings_toronto` | Admin settings page (Toronto release) |
| `c4e-analytics` | Enterprise analytics |
| `c4e_analytics_api_self_serve_access` | Self-serve analytics API access |
| `c4w_contracted_shebang` | Contracted enterprise features |
| `internal_tier_selector` | Internal tier selector (for Anthropic employees) |
| `internal_test_account_tools_enabled` | Internal test account tools |
| `crooked_sundial` | Org creation/management feature |
| `my_access_general_rollout` | "My Access" page general rollout |
| `ghe_support_enabled` | GitHub Enterprise support |
| `claudeai_interactive_content_admin_setting` | Admin toggle for interactive content |
| `isolated_segment_subdomain` | Isolated Segment subdomain |

#### Analysis & Tools
| Flag | What It Controls |
|------|-----------------|
| `claudeai_analysis_tool_allowed` | Enable analysis tool (code execution) |
| `claudeai_tools_page` | Tools management page |
| `rely_on_analysis_flag` | Rely on analysis flag for tool gating |
| `claudeai_crabby_claws_enabled` | "Crabby Claws" feature |
| `enable_pixie` | Pixie tool |
| `prism_enabled` | Prism tool (in-chat code execution rendering) |
| `enable_deep_search` | Deep search (extended research) |

#### Compass / Extended Search
| Flag | What It Controls |
|------|-----------------|
| `velvet_compass` | Compass mode scheduled tasks UI |
| `rusty_compass` | Compass integration with Baku (Claude Ship) |
| `use_incoherent_traffic_light_noises` | Compass mode toggle/availability |

#### Miscellaneous
| Flag | What It Controls |
|------|-----------------|
| `ak_enabled` | Arkose Labs bot detection |
| `crystal_ember_lantern` | GitHub auth nudge/spotlight |
| `luggage_citrus` | Code repos selection on desktop |
| `claude_ai_ember` | Ember feature |
| `claude_create_marble` | Claude Create Marble (artifact studio) |
| `claude_create_pebble_stone` | Claude Create Pebble Stone |
| `claude_grove_enabled` | Incognito chat mode (codename: "grove") |
| `nebula_drift_enabled` | MCP resources and prompts in project context |
| `tibro_enabled` | Orbit / scheduled tasks feature |
| `haystack_enabled` | Haystack (team knowledge base / "Ask your org") |
| `velvet_horizon` | Feature in CCR (code review) |
| `claude_ai_velvet_accordion` | UI accordion component in Claude AI |
| `ef_enabled` | Enterprise features endpoint |
| `apps_use_bananagrams` | Google Drive in apps/projects |
| `apps_use_turmeric` | Turmeric in apps |
| `artifact_tailwind_styles` | Tailwind CSS in artifacts |
| `career_focused` | Career-focused experience |
| `cc_carrier_pigeon` | Claude Code carrier pigeon (notification system) |
| `move_conversation_to_projects` | Move conversations to projects |
| `ooc_attachments_enabled` | Out-of-context attachments |
| `project_image` | Project image/avatar |
| `rag_prototype` | RAG prototype for Google Drive indexing |
| `claude_ai_pubsec_get_help` | Public sector help |
| `add_menu_simplification` | Simplified add/plus menu |
| `a11y_web_1213007053388940` | Accessibility improvements |
| `legal_acceptances_on_social_login` | Legal acceptance on social login |
| `free-user-custom-connectors` | Custom MCP connectors for free users |
| `github_disabled` | Disable GitHub integration |
| `mention_provider_desktop` | Desktop @-mention provider |
| `3540182858` | Numeric GrowthBook ID (unknown feature) |
| `swiss_cheese_is_the_enemy_of_the_mango` | Dittos feature (code agent sessions) |
| `janus_claude-ai` | Janus feature for Claude AI |
| `claude_ai_ms_v2` | Message streaming v2 |
| `claude_ai_unicode_sanitize_mcp_data` | Unicode sanitization for MCP data |
| `claudeai_skip_foreground_notifications` | Skip foreground notifications |
| `tengu_bridge_repl_v2_api` | Tengu Bridge REPL v2 API |
| `ucr_route_handler_pdf_conversion` | PDF conversion route handler |
| `claudeai_cowork_backend_marketplaces_main` | Cowork backend marketplaces |
| `claudeai_cowork_file_explorer_main` | File explorer in cowork |
| `claudeai_majordomo_enabled` | Majordomo feature (always returns false currently) |
| `crochet_eligible_for_ant_only_build` | Anthropic-only build eligibility |
| `console_nutmeg` | Console environments beta API |

### Additional GrowthBook Flags (via Ax)
| Flag | What It Controls |
|------|-----------------|
| `concise_mode_enabled` | Concise response mode during high demand |
| `concise_peak_2026q1` | Peak traffic concise mode (weekdays 6-10 AM) |

### GrowthBook Config Values (via qx)
| Config Key | Sub-key | What It Controls |
|-----------|---------|-----------------|
| `baku_model` | `allowed_models`, `model` | Allowed models for Baku (Claude Ship) |
| `claudeai_api_client` | `conversations_desktop_fetch_eventual_consistency` | API client consistency settings |
| `claudeai_api_client` | `conversations_explicit_strong_consistency` | Strong consistency for conversations |
| `claudeai_api_client` | `messages_explicit_strong_consistency` | Strong consistency for messages |
| `claudeai_api_client` | `messages_force_refresh_window_secs` | Force refresh window |
| `claudeai_api_client` | `skip_invalidate_create_conversation` | Skip invalidation on create |
| `claudeai_api_client` | `skip_invalidate_delete_conversation` | Skip invalidation on delete |
| `claude_ai_available_models` | `models` | Override available models list |
| `claude_ai_beta_tools` | `beta_tools` | Beta tools configuration |
| `claudeai_default_wiggle_egress_hosts_template` | `template` | Allowed hosts for artifact egress |
| `claude_ai_experience` | `project_templates` | Project templates for learning mode |
| `claude_ai_haystack_setup` | `path`, `description`, `maxNameLength`, `shortnameEnabled` | Haystack setup config |
| `claudeai_heli_status` | `enabled` | Heli status monitoring |
| `claudeai_interactive_content_admin_setting_config` | `link` | Interactive content admin link |
| `claude_ai_onboarding_chat` | `variant` | Onboarding chat variant |
| `claude_ai_projects_limits` | `max_free_projects` | Max projects for free tier |
| `claudeai_saffron_frontend` | `resynthesize_enabled`, `import_resynthesize_enabled`, `max_control_chars`, `max_num_controls` | Memory frontend config |
| `claudeai_saffron_port_config` | `prompt` | Memory port/import prompt |
| `claude_ai_tabbed_out_notifications` | `features` | Tab-out notification features |
| `claude_ai_targeted_promotion` | `promotionId` | Targeted promotion ID |
| `claude_code_spotlight_code_viewed_signal` | `languages` | Code spotlight language triggers |
| `claude_style_previews` | `previewExamples` | Style preview examples |
| `conditional_mcp_directory_servers` | `visibility` | MCP directory server visibility |
| `console_default_model` | `model`, `nuxId`, `overrideSticky` | Console default model config |
| `default_fusion_source_config_main` | `displayName`, `repo`, `displayNameCCD`, `repoCCD` | Default fusion source config |
| `fp_menu` | `features` | Feature preview menu items |
| `gallery_artifacts_config` | `original_to_localized_artifact_ids` | Gallery artifact localization |
| `holdup` | `modelFallbacks`, `cyberModelFallbacks` | Model fallback chains |
| `image_search_help_center` | `url` | Image search help center URL |
| `meb_enabled` | `meb_capability_enabled` | MEB capability |
| `org-uuid-meb-enabled-billing` | `meb_enabled_always` | MEB billing override |
| `project_knowledge_limit` | `limit` | Project knowledge upload limit |
| `raven_admin` | `default_max_org_members` | Default max org members for Raven |
| `use_confused_carousel_sounds` | `polling` | Polling configuration |
| `yukon_gold_bad` | `hostnames` | Blocked hostnames for Yukon Gold |
| `yukon_silver_cuttlefish_ditto_prompt` | `prompt` | Cuttlefish ditto prompt |
| `yukon_silver_cuttlefish_minimum_desktop_version` | `minimum_version` | Min desktop version for Cuttlefish |
| `yukon_silver_minimum_nest_version` | `minimum_nest_version` | Min ClaudeNest version for Yukon Silver |
| `yukon_silver_octopus_prompt` | `prompt` | Octopus multi-tool prompt |
| `tengu_ccr_bridge_environment_polling_interval_ms` | `value` | CCR bridge polling interval |
| `cowork_effort_level` | (via Ux) | Default: "medium" |

### GrowthBook A/B Test Values (via Vx)
| Config Key | Sub-key | What It Controls |
|-----------|---------|-----------------|
| `c4excel_chat_banner_upsell` | `value` | Excel/PPT chat upsell banner |
| `claude_ai_sidebar_invite_button` | `enabled` | Sidebar invite button |
| `claude_code_in_chat_nudge` | `show_nudge` | Claude Code in-chat nudge |
| `cli_landing_free_user_sidebar` | `enabled` | CLI landing sidebar for free users |
| `code_sidebar_full_label` | `enabled` | Full label in code sidebar |
| `code_sidebar_text` | `variant` | Code sidebar text variant |
| `default_credit_purchase_amount` | `amount` | Default credit purchase amount |
| `team_sharing_upsell` | `enabled` | Team sharing upsell |
| `wiggle_pro_default_on` | `default_enabled` | Artifacts default-on for Pro users |

---

## 2. Statsig (Not Present)

No Statsig SDK calls (`useGate`, `checkGate`, `getExperiment`) were found in this bundle. Feature gating is handled entirely through GrowthBook and backend capabilities.

The `statsigOrgUuid` field exists on the account object for analytics attribution, but no client-side gate checks are performed.

---

## 3. Plan-Based Gating

### Organization Capabilities Array

The `organization.capabilities` array is the primary plan-gating mechanism. Each capability is a string added to the array.

**Capability check function:** `gy(capability)` checks `activeOrganization.capabilities.includes(capability)`

#### Capability Strings
| Capability | Meaning |
|-----------|---------|
| `"chat"` | Can use chat (all chat orgs) |
| `"api"` | Can use API (API orgs) |
| `"api_individual"` | Individual API user |
| `"claude_pro"` | Pro subscription active |
| `"claude_max"` | Max subscription active |
| `"raven"` | Team/Enterprise org (codename "Raven") |
| `"externally_managed"` | Org is externally managed (SSO/SCIM) |
| `"compliance_api"` | Compliance API access |
| `"analytics_api"` | Analytics API access |

**Derived plan type function (`_y()`):**
```
raven in capabilities -> "raven" (team/enterprise)
claude_pro in capabilities -> "claude_pro"
claude_max in capabilities -> "claude_max"
none of the above -> "free"
```

**Helper functions:**
| Function | Checks |
|----------|--------|
| `xy()` | Is Pro: `gy("claude_pro")` |
| `by()` | Is Raven (Team/Enterprise): `gy("raven")` |
| `yy()` | Is Max: `gy("claude_max")` |
| `vy()` | Is paid: Max OR Pro OR (Raven with code waffles or premium seat) |
| `Cy()` | Bad Moon Rising (overages) enabled AND paid |
| `My()` | Is free: `"free" === _y()` |
| `jy()` | Can use paid features: Pro/Max/Raven=true, Free=false |

### Organization Type Determination (`Ex()`)
```
capabilities includes "api" AND "chat" -> "unknown"
capabilities includes "api" only:
  - includes "api_individual" -> "api_individual"
  - else -> "api_team"
capabilities includes "chat":
  - includes "raven":
    - raven_type === "enterprise" -> "claude_enterprise"
    - raven_type === (anything else) -> "claude_team"
  - includes "claude_max" -> "claude_max"
  - includes "claude_pro" -> "claude_pro"
  - else -> "claude_free"
```

---

## 4. Model Access Tiers

### Model Config Shape (from bootstrap)
```
{
  model: string,              // e.g., "claude-sonnet-4-5-20250929"
  name: string,               // display name
  name_i18n_key?: string,
  description?: string,
  description_i18n_key?: string,
  notice_text?: string,
  notice_text_i18n_key?: string,
  inactive?: boolean,         // model is disabled
  overflow?: boolean,         // model is in overflow menu (not primary)
  knowledgeCutoff?: string,
  slow_kb_warning_threshold?: number,
  paprika_modes?: PaprikaMode[],    // available thinking modes
  thinking_modes?: ThinkingMode[],
  capabilities: {
    mm_pdf?: boolean,         // PDF multimodal input
    mm_images?: boolean,      // Image multimodal input
    web_search?: boolean,     // Web search capability
    gsuite_tools?: boolean,   // GSuite tools capability
    compass?: boolean         // Extended search / compass mode
  }
}
```

**Default model config fallback:**
```
vQ = { image_in: true, pdf_in: false }
```

### Known Model Identifiers
| Model ID | Notes |
|----------|-------|
| `claude-sonnet-4-5-20250929` | Claude Sonnet 4.5 (primary) |
| `claude-sonnet-4-5` | Claude Sonnet 4.5 (alias) |
| `claude-opus-4-6` | Claude Opus 4.6 |
| `claude-opus` | Claude Opus (prefix/alias) |
| `claude-haiku-4-5-20251001` | Claude Haiku 4.5 |
| `claude-3-5-haiku-latest` | Claude 3.5 Haiku |
| `claude-3-opus` | Claude 3 Opus |
| `claude-3-` | Claude 3 family prefix |

### Model Gating by Plan
- **Enterprise Lite** (`enterprise_lite` seat tier): Cannot access Opus models (`model.startsWith("claude-opus") || model.startsWith("claude-3-opus")`)
- **Pro users on Opus**: Show upsell indicator when `_y() === "claude_pro"` and model starts with `"claude-opus"`
- **Models config**: Served from `organization.claude_ai_bootstrap_models_config`, filtered by `inactive` and `overflow` flags

### Model Capability Check
```
SQ() returns a function (model, capability) => {
  const config = allModelOptions.find(m => m.model === model);
  return !config?.capabilities || config.capabilities[capability] !== false;
}
```

---

## 5. Rate Limit Tiers

### Rate Limit Tier Values
| Tier String | Plan | Description |
|------------|------|-------------|
| `default_claude_ai` | Free / Pro | Default rate limit for Free and Pro users |
| `default_claude_max_5x` | Max 5x | Max plan with 5x usage |
| `default_claude_max_20x` | Max 20x | Max plan with 20x usage |
| `default_raven` | Enterprise | Default enterprise rate limit |
| `auto_prepaid_tier_0` | Prepaid | Auto-assigned prepaid tier 0 |
| `auto_prepaid_tier_1` | Prepaid | Auto-assigned prepaid tier 1 |
| `manual_tier_N` | Manual | Manually assigned tier (regex: `(auto_prepaid|manual)_tier_(\d)`) |

### Rate Limit Tier Functions
| Function | Returns |
|----------|---------|
| `ky()` | `activeOrganization.rate_limit_tier \|\| "default_claude_ai"` |
| `wy()` | Variant: `"max_5x"` if 5x tier, `"max_20x"` if 20x tier, else `undefined` |

### Rate Limit States
| State | Meaning |
|-------|---------|
| `within_limit` | User is within rate limits |
| `approaching_limit` | User is approaching rate limits |
| `exceeded_limit` | User has exceeded rate limits |
| `opus_messages_rate_limit_exceeded` | Opus-specific rate limit exceeded |
| `thinking_messages_rate_limit_exceeded` | Thinking-specific rate limit exceeded |

### Internal Tier Override (Anthropic Employees)
```
{
  internal_tier_org_type: "claude_free" | "claude_pro" | "claude_max" | "claude_enterprise" | null,
  internal_tier_rate_limit_tier: "default_claude_ai" | "default_claude_max_5x" | "default_claude_max_20x" | "default_raven" | null,
  internal_tier_seat_tier: null | { standard: string, premium: string },
  internal_tier_override_expires_at: ISO date | null
}
```

**Tier Selector Options:**
```
[
  { tier: FREE, label: "Free", variant: null },
  { tier: PRO, label: "Pro", variant: null },
  { tier: MAX, label: "Max 5x", variant: "5x" },
  { tier: MAX, label: "Max 20x", variant: "20x" }
]
```

---

## 6. Seat Tiers

### Seat Tier Enum Values
| Tier | Plan | Premium? |
|------|------|----------|
| `unassigned` | Default / no seat assigned | No |
| `enterprise_standard` | Enterprise Standard | No |
| `enterprise_tier_1` | Enterprise Tier 1 | Yes (Hb) |
| `enterprise_lite` | Enterprise Lite | No |
| `enterprise_usage_based` | Enterprise Usage-Based | Yes (Hb) |
| `enterprise_usage_based_chat` | Enterprise Usage-Based Chat | No |
| `enterprise_nonprofit` | Enterprise Nonprofit | Yes (Hb) |
| `enterprise_hipaa_chat` | Enterprise HIPAA Chat | No |
| `enterprise_hipaa_chat_and_code` | Enterprise HIPAA Chat+Code | Yes (Hb) |
| `enterprise_higher_ed` | Enterprise Higher Ed | Yes (Hb) |
| `enterprise_bendep_premium` | Enterprise BenDep Premium | Yes (Hb) |
| `enterprise_bendep_global_access` | Enterprise BenDep Global Access | Yes (Hb) |
| `enterprise_analytics` | Enterprise Analytics | No |
| `team_standard` | Team Standard | No (special check) |
| `team_tier_1` | Team Tier 1 | Yes (Hb) |
| `team_bendep_nonprofit_premium` | Team BenDep Nonprofit Premium | Yes (Hb) |

### Premium Seat Tier Check (`Kb`)
```
Kb(seat_tier) => Hb.includes(seat_tier) || "team_standard" === seat_tier
```
Where `Hb` = `["enterprise_tier_1", "enterprise_usage_based", "team_tier_1", "enterprise_hipaa_chat_and_code", "enterprise_bendep_global_access", "enterprise_nonprofit", "enterprise_bendep_premium", "enterprise_higher_ed", "team_bendep_nonprofit_premium"]`

---

## 7. Billing Types
| Type | Description |
|------|-------------|
| `stripe_subscription` | Standard Stripe subscription |
| `stripe_subscription_contracted` | Contracted Stripe subscription |
| `stripe_subscription_enterprise_self_serve` | Enterprise self-serve Stripe |
| `google_play_subscription` | Google Play Store subscription |
| `apple_subscription` | Apple App Store subscription |
| `aws_marketplace` | AWS Marketplace |
| `usage_based` | Usage-based billing |
| `prepaid` | Prepaid credits |
| `manual` | Manual billing |

---

## 8. Feature Settings (Org-Level Admin Controls)

### feature_settings Endpoint
Fetched from `/api/organizations/{uuid}/feature_settings` for Raven (team/enterprise) orgs.

Contains:
- `disabled_features`: Array of feature strings that admins have disabled
- `forced_settings`: Array of forced setting overrides

### Disableable Features (via `disabled_features`)
| Feature String | What It Disables |
|---------------|-----------------|
| `chat` | Chat functionality entirely |
| `web_search` | Web search tool |
| `wiggle` | Artifacts / file creation |
| `saffron` | Memory feature |
| `skills` | Custom skills |
| `haystack` | Team knowledge base |
| `inline_visualizations` | Inline visualizations in chat |
| `interactive_content` | Interactive content in artifacts |
| `mcp_artifacts` | MCP artifact creation |
| `work_across_apps` | Cross-app integrations |
| `claude_code_web` | Claude Code on web |
| `claude_code_desktop` | Claude Code on desktop |
| `claude_code_desktop_bypass_permissions` | Desktop permission bypass |
| `claude_code_desktop_auto_permissions` | Desktop auto-permissions |
| `tool_approval_default_always_allow` | Default always-allow for tool approval |

---

## 9. Feature Availability Map (Platform)

The `DT` object defines default feature availability per platform:

| Feature | Default State | Description |
|---------|--------------|-------------|
| `chat` | Available | Chat conversations |
| `web_search` | Available | Web search tool |
| `geolocation` | Available | Geolocation service |
| `saffron` | Available | Memory |
| `wiggle` | Available | Artifacts |
| `skills` | Available | Custom skills |
| `mcp_artifacts` | Available | MCP-created artifacts |
| `haystack` | Blocked by platform | Team knowledge (requires backend) |
| `thumbs` | Available | Feedback thumbs up/down |
| `claude_code` | Available | Claude Code |
| `claude_code_fast_mode` | Available | Code fast mode |
| `claude_code_web` | Available | Code on web |
| `claude_code_desktop` | Available | Code on desktop |
| `claude_code_review` | Available | Code review |
| `cowork` | Available | Desktop agent / cowork |
| `work_across_apps` | Available | Cross-app integration |
| `claude_code_remote_control` | Available | Remote code control |
| `interactive_content` | Available | Interactive artifacts |
| `api_workbench_thumbs` | Available | API workbench feedback |
| `developer_partner_program` | Available | Developer partner program |
| `inline_visualizations` | Available | Inline visualizations |
| `dittos` | Blocked by platform | Dittos (code agent sessions) |
| `claude_code_desktop_bypass_permissions` | Blocked by platform | Desktop permission bypass |
| `claude_code_desktop_auto_permissions` | Blocked by platform | Desktop auto permissions |
| `dxt_allowlist` | Blocked by platform | DXT allowlist |
| `claude_code_security` | Blocked by platform | Code security scanning |
| `tool_approval_default_always_allow` | Blocked by platform | Default always-allow tools |

**Platform check function:** `PT(feature)` returns availability status for given feature.

**Feature status values:**
- `"available"` - feature is available
- `"blocked_by_platform"` - feature blocked by platform constraints
- `"blocked_by_org_admin"` - feature disabled by org admin
- `"blocked_by_entitlement"` - feature blocked by plan entitlement
- `"disabled_by_user"` - user has disabled the feature
- `"disabled_by_enterprise"` - enterprise has disabled the feature
- `"not_enabled"` - feature not enabled

---

## 10. Conversation-Level Settings

Settings sent per-conversation to the API:

| Setting | Type | What It Controls |
|---------|------|-----------------|
| `paprika_mode` | string/null | Extended thinking mode |
| `compass_mode` | string/null | Extended search / deep research mode |
| `rendering_mode` | enum | `UNSPECIFIED(0)`, `RAW(1)`, `PLAIN_MARKDOWN(2)`, `MESSAGES(3)` |
| `is_temporary` | boolean | Incognito/temporary conversation |
| `enabled_web_search` | boolean | Web search enabled for this conversation |
| `enabled_bananagrams` | boolean | Google Drive search enabled |
| `enabled_sourdough` | boolean | Gmail search enabled |
| `enabled_foccacia` | boolean | Google Calendar/Drive search enabled |
| `enabled_mcp_tools` | boolean/object | MCP tools enabled |
| `enabled_monkeys_in_a_barrel` | boolean | Code execution/artifacts enabled |
| `enabled_imagine` | boolean/function | Image generation enabled (`aJ(enabled_mcp_tools)`) |
| `voice_mode_active` | boolean | Voice mode active |
| `create_mode` | string | Conversation creation mode |

**Sticky settings (persisted across conversations):**
```
["paprika_mode", "compass_mode"] // (Yc constant)

Plus tool toggles: "enabled_web_search", "enabled_bananagrams", "enabled_sourdough",
  "enabled_foccacia", "enabled_mcp_tools", "paprika_mode", "tool_search_mode"
  + "compass_mode" if compass available
```

---

## 11. Account-Level Settings

Settings stored on the user's account (`account.settings`):

| Setting | What It Controls |
|---------|-----------------|
| `enabled_saffron` | Memory enabled (account-level) |
| `enabled_saffron_search` | Memory-based conversation search |
| `enabled_wiggle_egress` | Artifact download/export |
| `enabled_mcp_tools` | MCP tools default |
| `enabled_monkeys_in_a_barrel` | Code execution default |
| `enabled_bananagrams` | Google Drive search default |
| `enabled_gdrive_indexing` | Google Drive indexing |
| `enabled_artifacts_attachments` | Analysis tool (file attachments) |
| `preview_feature_uses_artifacts` | User has opted into artifacts |
| `orbit_enabled` | Scheduled tasks (Orbit) enabled |
| `orbit_timezone` | Timezone for scheduled tasks |
| `grove_enabled` | Incognito mode enabled |
| `grove_notice_viewed_at` | When grove notice was viewed |
| `voice_preference` | Voice mode preference |
| `has_finished_claudeai_onboarding` | Completed onboarding |
| `dismissed_claudeai_banners` | Array of dismissed banners |
| `cowork_onboarding_completed_at` | Cowork onboarding timestamp |
| `ccr_auto_archive_on_pr_close` | Auto-archive CCR sessions on PR close |
| `wiggle_egress_spotlight_viewed_at` | Artifact egress spotlight viewed timestamp |
| `internal_tier_org_type` | Internal tier override (employees) |
| `internal_tier_rate_limit_tier` | Internal rate limit override |
| `internal_tier_seat_tier` | Internal seat tier override |
| `internal_tier_override_expires_at` | Override expiration |

---

## 12. Internal Codenames Mapping

| Codename | User-Facing Feature | Context |
|----------|-------------------|---------|
| **paprika** | Extended thinking | `paprika_mode` in conversations, `paprika_modes` in model config |
| **compass** | Extended search / deep research | `compass_mode` in conversations |
| **bananagrams** | Google Drive search | `enabled_bananagrams` = Google Drive connector |
| **sourdough** | Gmail search | `enabled_sourdough` = Gmail connector |
| **foccacia** | Google Calendar + Drive | `enabled_foccacia` = Calendar/Drive connectors |
| **monkeys_in_a_barrel** | Code execution & file creation | `enabled_monkeys_in_a_barrel` -> maps to `"wiggle"` |
| **wiggle** | Artifacts (file outputs) | Artifact cards, downloads, exports |
| **saffron** | Memory | Personal memory, conversation search |
| **kingfisher** | Google Drive file browsing | File attachment from Drive |
| **brioche** | GSuite native integration | Google GSuite native (vs MCP) |
| **chicago** | Desktop app permissions | TCC panel, approval dialogs for screen recording, accessibility, etc. |
| **yukon_silver** | Desktop computer use / agent | Computer use, folder management, tools |
| **yukon_gold** | Custom modes / personas | Mode selection, skill selection, activation checklist |
| **grove** | Incognito mode | Temporary conversations without memory |
| **haystack** | Team knowledge base | "Ask your org" - org docs/tools/data |
| **raven** | Team/Enterprise plan | `raven_type`: "enterprise" or team |
| **chilling_sloth** | Desktop agent / cowork | Main cowork feature gate |
| **bagel** | MCP directory | MCP directory browsing/search |
| **tibro** | Orbit / scheduled tasks | Recurring automated tasks |
| **baku** | Claude Ship | Deploy artifacts as websites |
| **epitaxy** | Claude Code editor experience | Split panel, tool approval, code editing |
| **television** | Claude Code Review (web) | PR review, session management |
| **recordplayer** | Claude Code environments | Environment selection, REPL |
| **prism** | In-chat code execution rendering | Code execution output display |
| **cardamom** | Starter prompts | Category-based prompt suggestions |
| **nutmeg** | Console environments API | Environments beta API features |
| **dust** | Chat autocomplete / org shortname | Backend autocomplete endpoint |
| **holdup** | Model fallbacks | Fallback chains for models and cyber models |
| **turmeric** | LaTeX rendering / analysis | `enabled_turmeric` |
| **fiddlehead** | Connector type (redacted strings) | Sync source connector |
| **cuttlefish** | Connector type (redacted strings) | Sync source connector |
| **cinnabon** | Free-tier connector access | Enables connectors for free users |
| **majordomo** | Tool execution management | Currently always returns false |

### Feature Setting to Tool Name Mapping
```javascript
{
  preview_feature_uses_artifacts: "artifacts",
  preview_feature_uses_latex: "latex",
  preview_feature_uses_citations: "generic",
  enabled_artifacts_attachments: "analyse",
  enabled_turmeric: "turmeric",
  enabled_gdrive: "google-drive",
  enabled_web_search: "web-search",
  enabled_bananagrams: "bananagrams",
  enabled_foccacia: "foccacia",
  enabled_sourdough: "sourdough",
  enabled_monkeys_in_a_barrel: "wiggle"
}
```

---

## 13. Connector Types (JH Enum)
| Enum Value | String | Display Name |
|-----------|--------|-------------|
| `GITHUB` | `"github"` | GitHub |
| `GDRIVE` | `"gdrive"` | Google Drive |
| `OUTLINE` | `"outlin"` | Outline |
| `SALESFORCE` | `"sfdc"` | Salesforce |
| `GMAIL` | `"gmail"` | Gmail |
| `GCAL` | `"gcal"` | Google Calendar |
| `SLACK` | `"slack"` | Slack |
| `ASANA` | `"asana"` | Asana |
| `CANVAS` | `"canvas"` | Canvas |
| `FIDDLEHEAD` | `"fiddlehead"` | Fiddlehead |
| `CUTTLEFISH` | `"cuttlefish"` | Cuttlefish |
| `MCP_RESOURCES` | `"mcpres"` | MCP Resources |

**Connector-to-Setting Mapping:**
```
GCAL -> "enabled_foccacia"
GMAIL -> "enabled_sourdough"
GDRIVE -> "kingfisher_enabled" (waffle) / "enabled_bananagrams" (setting)
```

---

## 14. Permission Checks

### Organization Permissions (Xb Enum)
| Permission | String Value |
|-----------|-------------|
| `MembersView` | `"members:view"` |
| `MembersManage` | `"members:manage"` |
| `ApiView` | `"api:view"` |
| `ApiManage` | `"api:manage"` |
| `IntegrationsManage` | `"integrations:manage"` |
| `BillingView` | `"billing:view"` |
| `BillingManage` | `"billing:manage"` |
| `CostView` | `"cost:view"` |
| `OrganizationManage` | `"organization:manage"` |
| `InvoicesView` | `"invoices:view"` |
| `UsageView` | `"usage:view"` |
| `AnalyticsView` | `"analytics:view"` |
| `ExportData` | `"export:data"` |
| `ExportMembers` | `"export:members"` |
| `OwnersManage` | `"owners:manage"` |
| `WorkspacesView` | `"workspaces:view"` |
| `WorkspacesManage` | `"workspaces:manage"` |
| `EnterpriseAuthManage` | `"enterprise_auth:manage"` |
| `LimitsView` | `"limits:view"` |
| `MembershipAdminsManage` | `"membership_admins:manage"` |
| `ExportAuditLogs` | `"export:audit_logs"` |
| `SecurityKeysManage` | `"security_keys:manage"` |
| `ComplianceManage` | `"compliance:manage"` |
| `ScopedApiKeysManage` | `"scoped_api_keys:manage"` |
| `Scim1PManage` | `"scim1p:manage"` |
| `WorkbenchView` | `"workbench:view"` |

### Project Permissions (Yb Enum)
| Permission | String Value |
|-----------|-------------|
| `ConversationView` | `"chat_project:chat:view"` |
| `ConversationCreate` | `"chat_project:chat:create"` |
| `MembersManage` | `"chat_project:members:manage"` |
| `OwnerManage` | `"chat_project:owner:manage"` |
| `KnowledgeEdit` | `"chat_project:knowledge:edit"` |
| `Delete` | `"chat_project:delete"` |
| `View` | `"chat_project:view"` |
| `KnowledgeView` | `"chat_project:knowledge:view"` |
| `SettingsEdit` | `"chat_project:settings:edit"` |

---

## 15. Client Types (Jc Enum)
| Value | Meaning |
|-------|---------|
| `CLAUDE_AI` | Web app (claude.ai) |
| `CLAUDE_IN_SLACK` | Slack integration |
| `CLAUDE_BROWSER_EXTENSION` | Browser extension |
| `CLINT` | CLI / terminal client |
| `ORBIT_THREAD` | Orbit scheduled task thread |

---

## 16. Load-Shed Controls

Accessed via `gT()` -> `Ux("apps_load_shed_controls", ...)`:

| Control | Effect |
|---------|--------|
| `claudeai_title_generation` | Disable auto title generation |
| `claudeai_memory_themes` | Disable memory themes |
| `claudeai_referral` | Disable referral system |
| `claudeai_completion_status_poll` | Disable completion status polling |

---

## 17. Redacted Strings (Safety Filters)

Accessed via `Fx("apps_redacted_strings_*")`:

| Config Key | Category |
|-----------|----------|
| `apps_redacted_strings_cheesecake` | Content filter |
| `apps_redacted_strings_cilantro` | Content filter |
| `apps_redacted_strings_cuttlefish` | Content filter |
| `apps_redacted_strings_fennel` | Content filter |
| `apps_redacted_strings_fiddlehead` | Content filter |
| `apps_redacted_strings_glass` | Content filter |
| `apps_redacted_strings_jalapeno` | Content filter |
| `apps_redacted_strings_konmari` | Content filter |
| `apps_redacted_strings_marigold` | Content filter |
| `apps_redacted_strings_paprika` | Content filter |
| `apps_redacted_strings_parsley` | Content filter |
| `apps_redacted_strings_penguin` | Content filter |
| `apps_redacted_strings_seashells` | Content filter |
| `apps_redacted_strings_sherlock` | Content filter |
| `apps_redacted_strings_terracotta` | Content filter |
| `apps_redacted_strings_trellis` | Content filter |

---

## 18. Overages Model Rule Gating

Overages (pay-per-use beyond plan limits) use a rule system:

```
{
  rule_definitions: {
    [seat_tier]: {
      allowed_rate_tiers?: string | string[],
      allowed_seat_tiers?: "all" | string[]
    }
  },
  org_overrides: { ... }
}
```

Logic:
1. If `allowed_seat_tiers` exists and contains "claude_max" or "claude_pro" -> allowed
2. If `allowed_seat_tiers === "all"` -> allowed
3. If `rule_definitions[seat_tier]` exists:
   - Check `allowed_rate_tiers` against `rate_limit_tier`
   - Check `allowed_seat_tiers` against seat tier

---

## 19. Raven (Team/Enterprise) Configuration

The `raven_configuration` object on orgs provides:
| Field | Description |
|-------|-------------|
| `haystack_enabled` | Whether Haystack (team knowledge) is enabled |
| `haystack_project_name` | Custom name for Haystack project |

---

## 20. Concise Mode / Peak Traffic

Two GrowthBook flags control concise mode during high traffic:
- `concise_mode_enabled` (via `Ax()`) - General concise mode
- `concise_peak_2026q1` (via `Ax()`) - Peak traffic concise mode, automatically triggers on **weekdays (Mon-Fri) between 6:00 AM and 10:00 AM** local time

When active, Claude keeps replies shorter with a tooltip: "During high demand, Claude keeps replies shorter."

---

## 21. E2E Test Detection

Internal test accounts are detected via regex patterns:
```
/^claude-[0-9]{16}(?:-[^-]+)?-e2e@sillylittleguy\.org$/
/^console-[0-9]{16}(?:-[^-]+)?-e2e@sillylittleguy\.org$/
```

These accounts bypass certain marketing/popover features.
