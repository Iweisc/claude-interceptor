# Claude.ai Frontend API Response Structures

**Source**: `index-DcrCrePJ.js` (7.2MB main bundle)
**Extracted**: 2026-03-22

---

## 1. Bootstrap / Account Response

### Endpoint
```
GET /api/bootstrap?statsig_hashing_algorithm=djb2&growthbook_format=sdk&include_system_prompts=false
GET /api/bootstrap/{orgUuid}/app_start?statsig_hashing_algorithm=djb2&growthbook_format=sdk&include_system_prompts=false
```

### Response Shape (raw from server)
```json
{
  "account": {
    "uuid": "string",
    "email_address": "string",
    "full_name": "string",
    "first_name": "string (optional)",
    "last_name": "string (optional)",
    "display_name": "string (optional)",
    "created_at": "ISO8601",
    "memberships": [
      {
        "organization": {
          "uuid": "string",
          "name": "string",
          "billing_type": "string",
          "capabilities": ["string"],
          "settings": {},
          "raven_type": "team | enterprise | null"
        },
        "role": "string"
      }
    ]
  },
  "org_statsig": { /* Statsig SDK payload */ },
  "org_growthbook": { /* GrowthBook SDK payload */ },
  "intercom_account_hash": "string",
  "locale": "string",
  "system_prompts": { /* system prompt data, only on desktop clients */ }
}
```

### Frontend-Transformed Shape (after parsing)
```json
{
  "account": { /* same as above */ },
  "statsig": { /* org_statsig */ },
  "growthbook": { /* org_growthbook */ },
  "statsigOrgUuid": "string (the orgUuid used in the request)",
  "intercom_account_hash": "string",
  "locale": "string",
  "system_prompts": {},
  "messageLimits": {
    "<orgUuid>": { /* MessageLimit object, see section 14 */ }
  }
}
```

### Organization Capabilities
The `capabilities` array on organization objects controls feature access:
- `"chat"` - basic chat access (consumer orgs)
- `"api"` - API access (console orgs)
- `"raven"` - Team/Enterprise access
- `"compliance_api"` - compliance API access
- `"analytics_api"` - analytics API access
- `"claude_pro"` - Pro subscription capability
- `"claude_max"` - Max subscription capability

### Billing Types
```
"stripe_subscription"
"stripe_subscription_contracted"
"stripe_subscription_enterprise_self_serve"
"usage_based"
"aws_marketplace"
"apple_subscription"
"google_play_subscription"
```

### Organization Types / Tier Enum
```typescript
enum TierType {
  FREE = "claude_free",
  PRO = "claude_pro",
  ENTERPRISE = "claude_enterprise",
  MAX = "claude_max"
}
```

### Rate Limit Tier Mapping
```json
{
  "claude_free":       { "internal_tier_org_type": "claude_free",       "internal_tier_rate_limit_tier": "default_claude_ai",       "internal_tier_seat_tier": null },
  "claude_pro":        { "internal_tier_org_type": "claude_pro",        "internal_tier_rate_limit_tier": "default_claude_ai",       "internal_tier_seat_tier": null },
  "claude_max (5x)":   { "internal_tier_org_type": "claude_max",        "internal_tier_rate_limit_tier": "default_claude_max_5x",   "internal_tier_seat_tier": null },
  "claude_max (20x)":  { "internal_tier_org_type": "claude_max",        "internal_tier_rate_limit_tier": "default_claude_max_20x",  "internal_tier_seat_tier": null },
  "claude_enterprise": { "internal_tier_org_type": "claude_enterprise",  "internal_tier_rate_limit_tier": "default_raven",           "internal_tier_seat_tier": "enterprise_standard | enterprise_tier_1" }
}
```

### Seat Tiers
```
"unassigned"
"enterprise_standard"
"enterprise_lite"
"enterprise_tier_1"
"team_standard"
```

---

## 2. Model Config

### Endpoint
```
GET /api/organizations/{orgUuid}/model_config
```

### Response Shape (Zod schema from bundle)
```json
[
  {
    "model": "string (e.g. 'claude-sonnet-4-5-20250514')",
    "name": "string (display name, e.g. 'Claude Sonnet 4.5')",
    "name_i18n_key": "string (optional)",
    "description": "string (optional)",
    "description_i18n_key": "string (optional)",
    "notice_text": "string (optional)",
    "notice_text_i18n_key": "string (optional)",
    "inactive": "boolean (optional)",
    "overflow": "boolean (optional)",
    "knowledgeCutoff": "string (optional, e.g. 'April 2025')",
    "slow_kb_warning_threshold": "number (optional)",
    "paprika_modes": ["string (optional, thinking mode IDs)"],
    "thinking_modes": [
      {
        "id": "string",
        "title": "string",
        "description": "string",
        "mode": "string | null (optional)",
        "selection_title": "string (optional)",
        "is_default": "boolean (optional)"
      }
    ],
    "capabilities": {
      "mm_pdf": "boolean (optional)",
      "mm_images": "boolean (optional)",
      "web_search": "boolean (optional)",
      "gsuite_tools": "boolean (optional)",
      "compass": "boolean (optional)"
    }
  }
]
```

### Default Model Fallback
When no model is set, the frontend defaults to: `"claude-3-5-haiku-latest"`

---

## 3. Conversation Object

### Endpoint (single conversation)
```
GET /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}?tree=True&rendering_mode=messages&render_all_tools=true
```

### Full Conversation Response Shape
```json
{
  "uuid": "string",
  "name": "string",
  "summary": "string (optional)",
  "model": "string (model ID)",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "is_starred": "boolean",
  "is_temporary": "boolean",
  "current_leaf_message_uuid": "string",
  "settings": {
    "enabled_web_search": "boolean (optional)",
    "enabled_mcp_tools": "boolean (optional)",
    "enabled_imagine": "boolean (optional)",
    "enabled_artifacts": "boolean (optional)",
    "paprika_mode": "string (optional, thinking mode)",
    "compass_mode": "string (optional)"
  },
  "project_uuid": "string | null",
  "session_id": "string (optional)",
  "platform": "string (optional)",
  "chat_messages": [
    { /* Message object, see section 4 */ }
  ]
}
```

### Conversation List Item (subset used in sidebar)
```json
{
  "uuid": "string",
  "name": "string",
  "summary": "string",
  "model": "string",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "is_starred": "boolean",
  "is_temporary": "boolean",
  "current_leaf_message_uuid": "string",
  "settings": { /* same as above */ },
  "project_uuid": "string | null",
  "session_id": "string (optional)",
  "platform": "string (optional)"
}
```

### Conversation Settings Keys
The frontend reads these specific settings keys:
- `enabled_web_search` - web search toggle
- `enabled_mcp_tools` - MCP tools toggle
- `enabled_imagine` - image generation toggle
- `enabled_artifacts` - artifacts toggle
- `paprika_mode` - extended thinking mode identifier
- `compass_mode` - deep research mode identifier

---

## 4. Message Object

### Full Message Shape
```json
{
  "uuid": "string",
  "sender": "human | assistant",
  "content": [ /* ContentBlock[] - see section 5 */ ],
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "parent_message_uuid": "string | undefined (root messages have no parent; root sentinel = '00000000-0000-4000-8000-000000000000')",
  "attachments": [],
  "files": [],
  "files_v2": [],
  "sync_sources": [],
  "index": "number",
  "stop_reason": "string (optional, assistant messages only)",
  "model": "string (optional, assistant messages only)",
  "chat_feedback": "object (optional)",
  "input_mode": "string (optional, 'voice' for voice messages)",
  "metadata": {
    "compass_mode": "string (optional)"
  },
  "nOptions": "number (optional, branch count for alternative responses)",
  "pending": "boolean (optional)",
  "truncated": "boolean (optional)"
}
```

### Root Message UUID Sentinel
```
"00000000-0000-4000-8000-000000000000"
```
This is the `parent_message_uuid` for root-level human messages. The frontend uses this constant (`uj` in bundle).

### Stop Reasons
```
"end_turn"         - normal completion
"max_tokens"       - length limit hit
"stop_sequence"    - stop sequence matched
"tool_use"         - tool call returned
"error"            - error during generation
"refusal"          - content policy refusal
"cyber_refusal"    - cybersecurity policy refusal
"prompt_injection_risk" - injection detection
"user_canceled"    - user clicked stop
"max_tool_use"     - tool use limit hit
"max_conversation_length" - conversation too long
"message_stop"     - fallback when no explicit stop_reason
```

---

## 5. Content Block Types

### Text Block
```json
{
  "type": "text",
  "text": "string",
  "citations": [
    {
      "uuid": "string",
      "start_index": "number",
      "end_index": "number"
    }
  ],
  "flags": ["string (optional)"],
  "helpline": "string (optional)"
}
```

### Thinking Block
```json
{
  "type": "thinking",
  "thinking": "string (the thinking text)",
  "summaries": ["string (optional, array of summary strings)"],
  "cut_off": "boolean (optional, whether thinking was cut off)",
  "start_timestamp": "ISO8601 (added by frontend on content_block_start)",
  "stop_timestamp": "ISO8601 (added by frontend on content_block_stop)"
}
```

Note: `signature` is NOT stored in the frontend block model. The frontend receives `signature_delta` events during streaming but does not persist signatures in the content block state.

### Tool Use Block
```json
{
  "type": "tool_use",
  "id": "string (unique tool call ID, e.g. 'toolu_...')",
  "name": "string (tool name)",
  "input": { /* parsed JSON object */ },
  "partial_json": "string (optional, accumulated during streaming)",
  "buffered_input": "string (optional, full JSON string, set on content_block_stop)",
  "message": "string (optional, set via tool_use_block_update_delta)",
  "display_content": "any (optional, set via tool_use_block_update_delta)",
  "approval_key": "string (optional, for MCP tool approval)",
  "icon_name": "string (optional)"
}
```

### Tool Result Block
```json
{
  "type": "tool_result",
  "tool_use_id": "string",
  "name": "string",
  "content": "any (usually array of content blocks or parsed JSON)",
  "is_error": "boolean",
  "structured_content": "object (optional)",
  "display_content": "object (optional)"
}
```

### Other Block Types (voice/special)
```json
{ "type": "bell", "text": "string", "title": "string" }
{ "type": "voice_note", "text": "string", "title": "string" }
{ "type": "flag", "flag": "string" }
```

---

## 6. SSE Event Shapes (Completion Streaming)

### SSE Transport
```
POST /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/completion
POST /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/retry_completion
Content-Type: application/json
Accept: text/event-stream
```

### SSE Event Types
The frontend listens for these `event:` types in the SSE stream:

#### `event: message_start`
```json
{
  "type": "message_start",
  "message": {
    "uuid": "string (assistant message UUID)",
    "parent_uuid": "string | null (human message UUID)",
    "model": "string",
    "trace_id": "string (optional)",
    "request_id": "string (optional)",
    "content": [],
    "stop_reason": null,
    "stop_sequence": null,
    "usage": {
      "input_tokens": "number",
      "output_tokens": "number"
    }
  }
}
```

#### `event: content_block_start`
```json
{
  "type": "content_block_start",
  "index": "number (block index)",
  "content_block": {
    "type": "text | thinking | tool_use | tool_result",
    // For text:
    "text": "",
    // For thinking:
    "thinking": "",
    // For tool_use:
    "id": "string",
    "name": "string",
    "input": {},
    "approval_key": "string (optional, for MCP tools)"
  }
}
```

#### `event: content_block_delta`
```json
{
  "type": "content_block_delta",
  "index": "number",
  "delta": { /* one of the delta types below */ }
}
```

**Delta types:**

Text delta:
```json
{ "type": "text_delta", "text": "string" }
```

Thinking delta:
```json
{ "type": "thinking_delta", "thinking": "string" }
```

Thinking summary delta:
```json
{ "type": "thinking_summary_delta", "summary": "string" }
```

Thinking cut-off delta:
```json
{ "type": "thinking_cut_off_delta", "cut_off": "boolean" }
```

Signature delta (received but not stored):
```json
{ "type": "signature_delta", "signature": "string" }
```

Input JSON delta (for tool_use and tool_result blocks):
```json
{ "type": "input_json_delta", "partial_json": "string" }
```

Tool use block update delta (progressive UI updates):
```json
{
  "type": "tool_use_block_update_delta",
  "message": "string (optional)",
  "display_content": "any (optional)"
}
```

Citation start delta:
```json
{
  "type": "citation_start_delta",
  "citation": {
    "uuid": "string",
    "start_index": "number (set by frontend to current text length)"
  }
}
```

Citation end delta:
```json
{
  "type": "citation_end_delta",
  "citation_uuid": "string"
}
```

Flag delta:
```json
{
  "type": "flag_delta",
  "flag": "string",
  "helpline": "string (optional)"
}
```

#### `event: content_block_stop`
```json
{
  "type": "content_block_stop",
  "index": "number",
  "stop_timestamp": "ISO8601 (optional, for thinking blocks)",
  "buffered_input": "string (optional, full JSON for tool_use blocks)"
}
```

#### `event: message_delta`
```json
{
  "type": "message_delta",
  "delta": {
    "stop_reason": "string"
  },
  "usage": {
    "input_tokens": "number",
    "output_tokens": "number",
    "cache_creation_input_tokens": "number (optional)",
    "cache_read_input_tokens": "number (optional)"
  }
}
```

#### `event: message_stop`
```json
{
  "type": "message_stop"
}
```

#### `event: message_limit`
```json
{
  "message_limit": { /* MessageLimit object - see section 14 */ }
}
```

#### `event: error`
```json
{
  "error": {
    "message": "string",
    "type": "string",
    "details": {}
  }
}
```

#### `event: completion` (legacy format)
```json
{
  "completion": "string (text chunk)",
  "stop_reason": "string | null",
  "messageLimit": { /* optional */ }
}
```
The frontend converts this legacy format into content_block_delta internally:
```json
{ "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "<completion text>" } }
```

#### `event: tool_approval`
Received but the frontend handles this as a separate flow (not passed to smoother).

#### `event: compaction_status`
```json
{
  "status": "string",
  "message": "string"
}
```

#### `event: conversation_ready`
Empty payload. Signals the conversation ID is ready for navigation.

#### `event: mcp_auth_required`
```json
{
  "server_uuid": "string",
  "auth_url": "string"
}
```

#### `event: cache_performance`
```json
{
  "cache_performance": { /* cache hit/miss stats */ }
}
```

---

## 7. Conversation List (V2)

### Endpoint
```
GET /api/organizations/{orgUuid}/chat_conversations_v2?limit=N&offset=N&starred=true|false&search_query=...&consistency=eventual|strong
```

### Response Shape
```json
{
  "data": [
    {
      "uuid": "string",
      "name": "string",
      "summary": "string",
      "model": "string",
      "created_at": "ISO8601",
      "updated_at": "ISO8601",
      "is_starred": "boolean",
      "is_temporary": "boolean",
      "current_leaf_message_uuid": "string",
      "settings": { /* ConversationSettings */ },
      "project_uuid": "string | null",
      "session_id": "string (optional)",
      "platform": "string (optional)"
    }
  ],
  "has_more": "boolean"
}
```

### Default Fetch Limit
The frontend fetches with limit `_j` (appears to be a small default, likely 50).

---

## 8. Title Generation

### Endpoint
```
POST /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/title
```

### Response Shape
```json
{
  "title": "string"
}
```

The frontend updates the conversation name with the returned title:
```javascript
onSuccess({ title }) { updateConversation(conversationUuid, { name: title ?? "" }) }
```

---

## 9. Memory API

### Memory Schema (Zod from bundle)
```json
{
  "memory": "string (markdown text of synthesized memory)",
  "controls": ["string"] | null,
  "updated_at": "ISO8601 | null"
}
```

### Endpoints

**Get Memory:**
```
GET /api/organizations/{orgUuid}/memory
GET /api/organizations/{orgUuid}/memory?project_uuid={projectUuid}
```
Response: The Memory schema above.

**Update Memory Controls:**
```
PUT /api/organizations/{orgUuid}/memory/controls
```
Request body:
```json
{
  "controls": ["string (array of control strings / user-edited memory items)"]
}
```
Optimistic response shape: `{ memory: "<existing>", controls: <new controls>, updated_at: "<existing>" }`

**Re-synthesize Memory:**
```
POST /api/organizations/{orgUuid}/memory/synthesize
```
Request body:
```json
{
  "project_uuid": "string (optional)"
}
```

**Reset Memory:**
```
POST /api/organizations/{orgUuid}/memory/reset
```
No request body.

### Memory Themes
```
GET /api/organizations/{orgUuid}/memory/themes
```
Response: array of theme objects (used for conversation starters based on memory).

Feature gates: `claudeai_saffron_enabled`, `claudeai_saffron_themes_enabled`

---

## 10. Subscription Details

### Endpoints
```
GET /api/organizations/{orgUuid}/subscription_details
GET /api/organizations/{orgUuid}/subscription_status
GET /api/organizations/{orgUuid}/paused_subscription_details
GET /api/organizations/{orgUuid}/trial_status
```

### Subscription Details Response Fields (used by frontend)
```json
{
  "plan_type": "string (e.g. 'claude_pro', 'claude_max_monthly', 'claude_max_annual')",
  "billing_interval": "monthly | yearly",
  "status": "string (e.g. 'active', 'past_due', 'canceled', 'paused')",
  "has_schedule": "boolean",
  "scheduled_downgrade": {
    "base_price_in_minor_units": "number",
    "billing_interval": "monthly | yearly",
    "currency": "string",
    "date": "string",
    "plan_type": "string"
  },
  "seat_tier_quantities": { "<tier>": "number" },
  "minimum_seats": "number",
  "members_limit": "number",
  "team_promo_ends_at": "string (optional, ISO8601)",
  "auto_reload_settings": {
    "enabled": "boolean"
  },
  "is_pure_usage_based": "boolean (optional)"
}
```

### Subscription Status Response Fields
```json
{
  "status": "string (e.g. 'active', 'past_due', 'trialing')"
}
```

---

## 11. Styles

### Endpoint
```
GET /api/organizations/{orgUuid}/list_styles
```

### Response Shape
```json
{
  "defaultStyles": [
    {
      "key": "string",
      "name": "string",
      "description": "string",
      "prompt": "string",
      "is_default": "boolean (optional)"
    }
  ],
  "customStyles": [
    {
      "key": "string (may fallback to uuid)",
      "uuid": "string",
      "name": "string",
      "description": "string",
      "prompt": "string"
    }
  ]
}
```

The frontend merges default and custom styles, using `key` or falling back to `uuid` for custom styles.

### Usage in Completion Request
```json
{
  "personalized_styles": ["<style_key>"]
}
```

---

## 12. Skills

### Endpoint
```
GET /api/organizations/{orgUuid}/skills
```

### Query Key
`"skills"` (Gg in bundle)

Feature gate: `claudeai_skills`

### Skill Object Shape (from UI code)
```json
{
  "commandId": "string",
  "commandDisplayName": "string",
  "commandDescription": "string",
  "commandArgumentHint": "string",
  "is_enabled": "boolean",
  "is_user_created": "boolean"
}
```

---

## 13. Projects

### Endpoints
```
GET /api/organizations/{orgUuid}/projects              (project_list)
GET /api/organizations/{orgUuid}/projects_v2            (project_list_v2)
GET /api/organizations/{orgUuid}/projects/{uuid}        (project)
GET /api/organizations/{orgUuid}/projects/{uuid}/docs   (project_doc_list)
GET /api/organizations/{orgUuid}/projects/{uuid}/files  (project_files_list)
GET /api/organizations/{orgUuid}/projects/{uuid}/syncs  (project_sync_list)
GET /api/organizations/{orgUuid}/projects_count         (projects_count)
```

### Project Object Shape (from frontend code)
```json
{
  "uuid": "string",
  "name": "string",
  "description": "string (optional)",
  "instructions": "string (optional, project-level instructions)",
  "creator": {
    "uuid": "string"
  },
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "is_private": "boolean",
  "is_public": "boolean (optional)"
}
```

### Projects V2 Response
```json
{
  "data": [ /* Project[] */ ],
  "pagination": {
    "total": "number"
  }
}
```

### Projects Count Response
```json
{
  "count": "number"
}
```

---

## 14. Message Limit / Rate Limit

### Message Limit Object
The message limit can be one of three types:

#### Within Limit
```json
{
  "type": "within_limit"
}
```

#### Approaching Limit
```json
{
  "type": "approaching_limit",
  "remaining": "number",
  "resetsAt": "number (unix timestamp seconds)",
  "conversationUuid": "string (optional)",
  "representativeClaim": "string (optional, e.g. 'overage')",
  "overageDisabledReason": "string (optional, e.g. 'out_of_credits')",
  "windows": { /* WindowMap */ }
}
```

#### Exceeded Limit
```json
{
  "type": "exceeded_limit",
  "remaining": 0,
  "resetsAt": "number (unix timestamp seconds)",
  "conversationUuid": "string (optional)",
  "representativeClaim": "string (optional)",
  "overageDisabledReason": "string (optional)",
  "windows": { /* WindowMap */ }
}
```

### Windows Map
```json
{
  "5h": { "status": "string", "resets_at": "number (unix seconds)", "surpassed_threshold": "number (optional, 0-1)" },
  "7d": { "status": "string", "resets_at": "number", "surpassed_threshold": "number (optional)" },
  "7d_opus": { "status": "string", "resets_at": "number", "surpassed_threshold": "number (optional)" },
  "7d_sonnet": { "status": "string", "resets_at": "number", "surpassed_threshold": "number (optional)" },
  "7d_cowork": { "status": "string", "resets_at": "number", "surpassed_threshold": "number (optional)" },
  "overage": { "status": "string", "resets_at": "number", "surpassed_threshold": "number (optional)" }
}
```

Window status values: `"approaching_limit"`, `"exceeded_limit"`, `"within_limit"`

### Where Message Limits Appear
1. In the bootstrap response under `messageLimits[orgUuid]`
2. In the SSE stream as `event: message_limit` with `{ message_limit: { ... } }`
3. Stored in React Query cache, keyed by org UUID

### Frontend Priority for Which Window to Display
The frontend picks the most relevant window to show in this priority order:
1. Named model windows (e.g., `7d_opus`, `7d_cowork`)
2. `7d` weekly window
3. `5h` hourly window
4. `overage` window

---

## 15. Error Response Shapes

### Standard API Error (parsed by `Co` function)
```json
{
  "error": {
    "message": "string",
    "type": "string (e.g. 'invalid_request_error', 'api_error', 'permission_error', 'overloaded_error', 'rate_limit_error')",
    "details": {
      "error_code": "string (optional, e.g. 'account_session_invalid', 'read_only_mode', 'seat_minimum_reached')"
    }
  }
}
```

### Error Class (frontend `vo`)
```typescript
class ApiError extends Error {
  type: string;        // error type
  statusCode: number;  // HTTP status
  extra: object;       // additional details including headers
  errorCode: string;   // error_code from details
  endpoint: string;    // request endpoint
  method: string;      // HTTP method
}
```

### Specific Error Codes the Frontend Handles
- `"account_session_invalid"` - redirects to login
- `"read_only_mode"` - shows read-only banner
- `"opus_messages_rate_limit_exceeded"` - rethrows (handled by rate limit UI)
- `"subscription_past_due"` - shows payment past due banner
- `"seat_minimum_reached"` - shows minimum seat error

### Error Types
- `"invalid_request_error"` - 400-level
- `"permission_error"` - 403
- `"api_error"` - generic server error
- `"overloaded_error"` - 529
- `"rate_limit_error"` - 429

### Web Search Error Types (Zod validated)
```
"INVALID_URL", "URL_NOT_FOUND", "RATE_LIMIT_EXCEEDED", "SERVER_ERROR",
"CLIENT_ERROR", "ROBOTS_DISALLOWED", "UNKNOWN_ERROR", "URL_TOO_LONG",
"SITE_BLOCKED", "EGRESS_BLOCKED", "PERMISSIONS_ERROR"
```

---

## 16. Feature Flags

### Statsig Gates (via `Bx()`)
Key gates that control major features:
```
claudeai_saffron_enabled           - Memory feature
claudeai_saffron_themes_enabled    - Memory themes / conversation starters
claudeai_saffron_search_enabled    - Memory search
claudeai_saffron_ghost_enabled     - Ghost memory
claudeai_skills                    - Skills / slash commands
claudeai_completion_status_sidebar - Completion status polling
claude_ai_mcp_directory_web_only   - MCP directory
claudeai_mcp_bootstrap_eager       - Eager MCP bootstrap
model_selector_enabled             - Model selector UI
wiggle_enabled                     - Artifacts / wiggle panel
wiggle_graduated                   - Graduated wiggle features
claudeai_default_wiggle_egress_enabled - Artifact egress (network access)
claude_ai_image_search             - Image search tool
claude_ai_learning_mode            - Learning mode
velvet_compass                     - Deep research / compass mode
rusty_compass                      - Research mode variant
claude_ai_prefetch                 - Prefetch optimization
sticky_model_selector              - Remember model selection
plain_text_input                   - Plain text input mode
chat_autocomplete                  - Chat autocomplete
chat_suggestion_chips_enabled      - Suggestion chips
past_due_subscription_enforcement  - Past due enforcement
read_only_mode                     - Read only mode
claudeai_interactive_content_admin_setting - Interactive content
yukon_silver                       - Desktop app features
yukon_silver_cuttlefish            - Desktop cuttlefish features
yukon_silver_octopus               - Desktop octopus features
yukon_gold_debug_menu_enabled      - Debug menu
anthropic_internal_only_expose_chat_debug - Internal debug
prism_enabled                      - Prism features
claude_code_waffles                - Claude Code features
aws_marketplace_overage            - AWS marketplace overage
overage_billing_mobile_support     - Mobile overage
move_conversation_to_projects      - Move conversation to project
spider_enabled_2                   - Spider features
bagel_enabled                      - Bagel features
cinnabon_enabled                   - Cinnabon features
```

### GrowthBook Dynamic Configs (via `qx()` / `Ux()`)
```
claude_ai_available_models         - Model list config
claude_ai_beta_tools               - Beta tools config
claude_ai_projects_limits          - Project limits
claude_ai_experience               - Experience framework
holdup                             - Model fallbacks config
raven_admin                        - Admin settings
mcp_tool_approval_config           - MCP tool approval
apps_load_shed_controls            - Load shedding controls
claudeai_api_client                - API client settings (caching, consistency)
unified_limits_overage_provisioning - Overage rules
```

### Load Shed Controls (from `apps_load_shed_controls`)
```json
{
  "claudeai_token_counter": false,
  "claudeai_experience_framework": false,
  "claudeai_referral": false,
  "claudeai_title_generation": false,
  "claudeai_conversation_count": false,
  "claudeai_memory_themes": false,
  "console_billing_widgets": false,
  "claudeai_github_branch_status": false,
  "claudeai_drive_recents": false,
  "claudeai_ingestion_progress": false,
  "claudeai_completion_status_poll": false,
  "claudeai_mcp_bootstrap": false,
  "claudeai_skills_list": false,
  "console_usage_dashboards": false,
  "console_claude_code_analytics": false,
  "console_logs": false,
  "claudeai_admin_analytics": false,
  "claudeai_compass_task_polling": false
}
```

---

## 17. Artifacts / Wiggle / Files

### Tool Names for Artifacts
- `"create_file"` - create a new file/artifact
- `"present_files"` - present files to user
- `"download-file"` - download a file
- `"show_widget"` - render interactive widget
- `"image_search"` - search for images

### Artifact Visibility Endpoint
```
GET /api/organizations/{orgUuid}/artifacts/{artifactUuid}/visibility
```

### Wiggle File Download
Files are downloaded via organization-scoped endpoints. The download function takes:
```json
{
  "filepaths": ["string"],
  "orgUuid": "string",
  "conversationUuid": "string (for non-shared)",
  "snapshotUuid": "string (for shared)",
  "isShared": "boolean",
  "source": "string (e.g. 'wiggle_file_card_download_all')"
}
```

---

## 18. Voice Mode Protocol

### WebSocket URL
```
wss://{baseUrl}/api/ws/voice/organizations/{orgUuid}/chat_conversations/{conversationUuid}?{params}
```

### URL Parameters
```
input_encoding=opus
input_sample_rate=16000
input_channels=1
output_format=pcm_16000
language=en
timezone={Intl timezone}
voice=buttery
server_interrupt_enabled=true
client_platform=web_claude_ai
```

### Default Voice Config
```json
{
  "voice": "buttery",
  "inputEncoding": "opus",
  "inputSampleRate": 16000,
  "inputChannels": 1,
  "outputFormat": "pcm_16000",
  "language": "en",
  "serverInterruptEnabled": true
}
```

### WebSocket Message Protocol

**Client -> Server:**
- Binary frames: Opus-encoded audio data

**Server -> Client:**
- Binary frames (ArrayBuffer/Blob): PCM audio data
- Text frames: JSON events with the same SSE event structure:
  - `message_start` - new assistant message
  - `content_block_start` - new block (text, tool_use, tool_result)
  - `content_block_delta` - incremental updates (text_delta, input_json_delta)
  - `content_block_stop` - block complete
  - `message_stop` - message complete

The voice handler processes the same event types as SSE but receives them wrapped:
```json
{
  "event": {
    "type": "message_start | content_block_start | content_block_delta | content_block_stop",
    "data": { /* same shape as SSE events */ }
  }
}
```

### Keep-Alive
WebSocket keep-alive pings are sent periodically.

### Reconnection
Built-in reconnection with configurable retry count. States: `disconnected`, `connecting`, `connected`, `reconnecting`, `error`.

---

## 19. Conversation Search

### Endpoint
```
GET /api/organizations/{orgUuid}/chat_conversations_v2?search_query={query}&limit={N}&offset={N}
```

Uses the same V2 endpoint with the `search_query` parameter. Response shape is the same as section 7.

---

## 20. Completion Request Body

### Full Request Shape
```json
{
  "prompt": "string",
  "parent_message_uuid": "string (optional)",
  "timezone": "string (IANA timezone, optional)",
  "personalized_styles": ["string (style key, optional)"],
  "locale": "string (optional, defaults to 'en-US')",
  "model": "string (optional, model override)",
  "temperature": "number (optional)",
  "max_tokens_to_sample": "number (optional)",
  "paprika_mode": "string (optional, thinking mode)",
  "compass_mode": "string (optional, research mode)",
  "tools": [{ /* tool definitions */ }],
  "tool_states": [{ /* tool state overrides */ }],
  "custom_system_prompt": "string (optional, localStorage override)",
  "turn_message_uuids": {
    "human_message_uuid": "string (optional)",
    "assistant_message_uuid": "string (optional)"
  },
  "rendering_mode": "messages",
  "attachments": [
    {
      "file_name": "string",
      "file_size": "number",
      "file_type": "string",
      "extracted_content": "string"
    }
  ],
  "files": [ /* file references */ ],
  "sync_sources": [ /* sync source references */ ]
}
```

### Conversation Creation Parameters (inline)
```json
{
  "name": "string",
  "model": "string",
  "project_uuid": "string (optional)",
  "include_conversation_preferences": "boolean (optional)",
  "paprika_mode": "string (optional)",
  "compass_mode": "string (optional)",
  "create_mode": "string (optional)",
  "is_temporary": "boolean (optional)",
  "enabled_imagine": "boolean (optional)",
  "orbit_action_uuid": "string (optional)"
}
```

---

## 21. Deep Research / Compass Mode

### Task Status Enum
```typescript
enum TaskStatus {
  Starting = "starting",
  Planning = "planning",
  InitiatingAgents = "initiating_agents",
  Searching = "searching",
  CreatingArtifact = "creating_artifact",
  Completed = "completed",
  Cancelled = "cancelled",
  TimedOut = "timed_out",
  Failed = "failed"
}
```

### Pending Statuses (task still running)
```
["starting", "planning", "initiating_agents", "searching", "creating_artifact"]
```

### Task Status Endpoint
```
GET /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/task/{taskId}/status
```

Response:
```json
{
  "status": "string (one of TaskStatus values)"
}
```

### Stop Task Endpoint
```
POST /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/task/{taskId}/stop
```

### Task Polling
Polling interval: 1 second when task is pending. Feature gate: `claudeai_compass_task_polling` (in load shed controls).

---

## 22. MCP / Connectors

### MCP Remote Servers
Query key: `"mcp-remote-servers"` (Ig in bundle)

### MCP Bootstrap
Feature gates: `claudeai_mcp_bootstrap_eager`, `claudeai_mcp_bootstrap` (load shed)

### Tool Approval Endpoint
```
POST /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/tool_approval
```

Request body:
```json
{
  "tool_use_id": "string",
  "is_approved": "boolean",
  "approval_key": "string (optional)",
  "approval_option": "string (optional, 'once' | 'always')"
}
```

### Tool Result Endpoint
```
POST /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/tool_result
```

---

## 23. Completion Status Polling

### Endpoint
```
GET /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/completion_status?poll=false
```

### Response
```json
{
  "is_pending": "boolean"
}
```

Polling: refetches every 1 second when `is_pending` is true.

---

## 24. Platform Enum
```typescript
enum ClientPlatform {
  UNKNOWN = "unknown",
  ANDROID = "android",
  IOS = "ios",
  DESKTOP_APP = "desktop_app",
  WEB_CLAUDE_AI = "web_claude_ai",
  WEB_CONSOLE = "web_console",
  WEB_CUSTOM_AGENTS = "web_custom_agents"
}
```

### Request Header
```
anthropic-client-platform: web_claude_ai | desktop_app | ...
anthropic-device-id: <from localStorage>
```

---

## 25. Supported Locales
The frontend validates locale against a supported list. If the locale is not in the list, it defaults to `"en-US"`.

---

## 26. Chat Feedback Types
```typescript
enum FeedbackType {
  UPVOTE = "upvote",
  CHAT_ENDED = "chat_ended",
  FLAG = "flag",
  FLAG_BUG = "flag/bug",
  FLAG_HARMFUL = "flag/harmful",
  FLAG_REFUSAL = "flag/refusal",
  FLAG_FILE = "flag/file",
  FLAG_INSTRUCTIONS = "flag/instructions",
  FLAG_FACTS = "flag/facts",
  FLAG_INCOMPLETE = "flag/incomplete",
  FLAG_THOUGHTS = "flag/thoughts",
  FLAG_WEB_OVER = "flag/web-over",
  FLAG_WEB_SOURCES = "flag/web-sources",
  FLAG_WEB_URL = "flag/web-url",
  FLAG_WEB_UNDER = "flag/web-under",
  FLAG_MEMORY = "flag/memory",
  FLAG_OTHER = "flag/other",
  FLAG_CONTENT = "flag/content",
  FLAG_CONSTITUTION = "flag/constitution",
  SC_FALSE_POSITIVE = "sc/false_positive"
}
```

### Feedback Endpoint
```
POST /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/chat_messages/{messageUuid}/chat_feedback
PUT  /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/chat_messages/{messageUuid}/chat_feedback
```

---

## 27. Application Types
```typescript
enum ApplicationType {
  CLAUDE_AI = "CLAUDE_AI",
  CLAUDE_IN_SLACK = "CLAUDE_IN_SLACK",
  CLAUDE_BROWSER_EXTENSION = "CLAUDE_BROWSER_EXTENSION",
  CLINT = "CLINT",
  ORBIT_THREAD = "ORBIT_THREAD"
}
```

---

## 28. OAuth Scopes (from UI)
```
user:profile
user:inference
user:chat:read
user:chat
user:file_upload
user:sessions:claude_code
user:mcp_servers
user:office
user:voice
org:profile
org:inference
org:create_api_key
org:service_key_inference
```

---

## 29. File Type Support

### Image types: `jpg, jpeg, png, gif, webp`
### PDF types: `pdf`
### Document types: `doc, pptx, zip`
### Spreadsheet types: `csv, xls, xlsx, xlsb, xlm, xlsm, xlt, xltm, xltx, ods, zip`
### Code/text types (extensive list):
```
txt, py, ipynb, js, jsx, html, css, java, cs, php, c, cc, cpp, cxx, cts, h, hh, hpp, rs, R, Rmd, swift, go, rb, kt, kts, ts, tsx, m, mm, mts, scala, dart, lua, pl, pm, t, sh, bash, zsh, csv, log, ini, cfg, config, json, proto, prisma, yaml, yml, toml, sql, bat, md, coffee, tex, latex, gd, gdshader, tres, tscn, typst, rst, adoc, asciidoc, textile, creole, wiki, env, gitignore, dockerignore, editorconfig, prettierrc, eslintrc, gradle, sbt, cabal, podspec, gemspec, makefile, dockerfile, xml, rss, atom, graphql, gql, hbs, handlebars, mustache, twig, jinja, jinja2, j2, vue, svelte, glsl, hlsl, frag, vert, shader, elm, clj, cljs, erl, ex, exs, hs, nim, zig, fs, fsx, ml, mli, v, vsh, vv, pas, pp, inc, fish, csh, tcsh, ps1, psm1, psd1, tsv, tab, jsonl, ndjson, lock, ignore, gitattributes, gitmodules, htaccess, htpasswd, robots, sitemap
```

---

## 30. Conversation Tree Endpoints

### Update Conversation
```
PUT /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}?rendering_mode=raw
```

### Star/Unstar
```
PUT /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}?rendering_mode=raw
Body: { "is_starred": true/false }
```

### Delete Conversation
```
DELETE /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}
```

### Bulk Delete
```
POST /api/organizations/{orgUuid}/chat_conversations/delete_many
```

### Bulk Move
```
POST /api/organizations/{orgUuid}/chat_conversations/move_many
```

### Create Conversation
```
POST /api/organizations/{orgUuid}/chat_conversations
```

### Model Fallback
```
PUT /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/model_fallback
```
Response: `{ "model": "string" }`

### Update Settings
```
PUT /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}?rendering_mode=raw
Body: { "settings": { ... } }
```

---

## 31. Share / Snapshot

### Create Share
```
POST /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/share
```

### Get Snapshot (shared conversation)
```
GET /api/organizations/{orgUuid}/chat_snapshots/{snapshotUuid}?rendering_mode=messages&render_all_tools=true
GET /api/chat_snapshots/{snapshotUuid}?rendering_mode=messages&render_all_tools=true
```

Response: Same shape as conversation with `chat_messages`.

---

## 32. Prompt Improvement

### SSE Stream
The prompt improver uses the same SSE event format. The frontend listens for:
- `content_block_delta` with `text_delta` - accumulates improved text
- `message_stop` - extracts `improved_prompt` from the stop event or uses accumulated text

---

## 33. MCP Protocol Version
```
MCP_PROTOCOL_VERSION = "2025-11-25"
SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"]
JSONRPC_VERSION = "2.0"
```

---

## 34. Query Cache Key Constants
These are the React Query cache key prefixes used for each data type:
```
"bootstrap"                   - bootstrap data
"invoice_list"                - invoices
"upcoming_invoice"            - upcoming invoice
"model_config"                - model config
"org_invites"                 - org invitations
"org_members"                 - org members
"org_members_v2"              - org members v2
"org_member_counts"           - member counts
"org_profile"                 - org profile
"org"                         - organization
"subscription_details"        - subscription
"subscription_status"         - subscription status
"trial_status"                - trial status
"paused_subscription_details" - paused subscription
"project"                     - single project
"starter_project"             - starter project
"projects_count"              - projects count
"project_list"                - project list v1
"project_list_v2"             - project list v2
"artifacts_list"              - artifacts
"project_list_conversations"  - project conversations
"project_doc"                 - project doc
"project_doc_list"            - project docs
"project_sync_list"           - project syncs
"project_sync_auth"           - sync auth
"project_files_list"          - project files
"project_knowledge_stats"     - knowledge stats
"project_account_settings"    - project account settings
"chat_snapshot_list_all"      - snapshots
"activity_feed"               - activity feed
"custom_styles_list"          - styles
"mcp-remote-servers"          - MCP servers
"memory_synthesis"            - memory
"overage_spend_limit"         - overage limits
"skills"                      - skills
"org_skills"                  - org skills
"plugins"                     - plugins
"remote_marketplaces"         - remote marketplaces
"account_standing"            - account standing
"browser_extension_settings"  - browser extension
```

---

## 35. Internal Conversation UUID Prefixes
```
Human message UUID prefix:    "dj_" (dj- in code as dj)
Assistant message UUID prefix: "cj_" (cj- in code as cj)
```
Format: `{prefix}-{random UUID v4}`

---

## 36. Supported Onboarding Categories
```json
["coding_development", "learning_studying", "writing_content_creation", "business_strategy", "design_creativity", "life_stuff", "claudes_choice"]
```

Career-focused variant:
```json
["coding_development", "learning_studying", "writing_content_creation", "business_strategy", "design_creativity", "career_chat", "claudes_choice"]
```

Work functions:
```json
["Product Management", "Engineering", "Human Resources", "Finance", "Marketing", "Sales", "Operations", "Data Science", "Design", "Legal", "Other"]
```
