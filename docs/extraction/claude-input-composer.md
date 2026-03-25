# Claude.ai Frontend Bundle — Input Composer & UI Analysis

**Source:** `index-DcrCrePJ.js` (7.2 MB minified)
**Date:** 2026-03-22

---

## 1. Input Composer / Textarea

### Technology

The input is **TipTap** (a headless wrapper around **ProseMirror**). It is NOT a plain `<textarea>` or bare `contentEditable`. Key evidence:

- State stored as `tipTapEditorState` (a TipTap JSON document, type `"doc"`).
- TipTap extensions: `tiptapDrop`, `tiptapPaste`, `editable`, `clearDocument`, `tabindex`, `clipboardTextSerializer`.
- ProseMirror CSS injected:
  ```css
  .ProseMirror {
    position: relative;
    word-wrap: break-word;
    white-space: pre-wrap;        /* also break-spaces */
    font-variant-ligatures: none;
  }
  ```
- `EditorView`, `EditorState`, `nXe.create({doc: ...})` are used internally.
- The `TipTap StarterKit` extension (`n3e.create({name:"starterKit"})`) is loaded.

### SSR / Hydration

There is an SSR fallback: `promptInputSsrEnabled`, `promptInputSsrTextareaRef`, with test-IDs:
- `data-testid="prompt-input-ssr-interactive"`
- `data-testid="chat-input-ssr"`

An actual `<textarea>` is rendered on the server and gets replaced by TipTap on hydration.

### Auto-Resize Behavior

The CSS for the textarea ghost element:
```
whitespace-pre-wrap
resize-none
row-start-1 / row-end-2 / col-start-1 / col-end-2
```
This is the standard CSS Grid "ghost div" auto-resize pattern (a hidden grid sibling mirrors content to grow the textarea).

### Max Input Length

No hard character limit is enforced on the client. However:
- `maxTokensPerFile: 100000`
- `maxTokensPerMessage: 200000`
- Analytics events: `chat.conversation.too_long_prompt:loaded`, `chat.conversation.too_long_prompt:accepted`, `chat.conversation.too_long_prompt:dismissed`.
- A "too long prompt" warning modal exists; the user can accept or dismiss.
- Token limit errors: `chat.conversation.token_limit_exceeded` event on HTTP 413.

### Multiline Handling (Enter vs Shift+Enter)

ProseMirror handles `Enter` naturally as a paragraph break. The send logic is in the parent component, NOT inside ProseMirror. The send callback (`Je`) is triggered by the submit button or a keyboard shortcut, not by the Enter key alone within ProseMirror.

(Enter creates a newline by default in ProseMirror; the outer component captures certain keybindings.)

### Paste Handling

- TipTap extensions: `tiptapPaste` plugin, `clipboardTextSerializer`.
- ProseMirror native `handlePaste` is invoked, with `transformPastedHTML` and `transformPasted` hooks.
- Pasted files: `onPasteFiles` callback handles file blobs from clipboard.
- Pasted text gets a special attachment kind `$J.PastedText` (`"pasted_text"`).
- Pasted text files match `/^paste(-\d+)?\.txt$/` or `/^Pasted-.*\.txt$/`.
- Display text: `"Pasted content"`.
- Desktop app integration: `cO?.savePastedFile` for desktop-specific paste path.

### Placeholder Text

The placeholder is dynamic and context-dependent:
- Generic form placeholder: `"placeholder:text-text-500"` styling class.
- Various specific placeholders exist for specific contexts (e.g., `"Paste GitHub URL"`, `"Search files"`, `"Select a repository"`, `"Search branches"`).
- The main chat input placeholder comes from the `placeholders` prop via `gbt` component (`PromptInputWithState`).

### Draft Persistence

- Draft storage key: `"chat-draft"` (in-memory / zustand store with `setChatDraft`).
- Draft validation: `PO(e)` checks if draft has content (non-empty tipTapEditorState content, or attachments, files, or syncSourceUuids).

### TipTap Custom Node Types

The editor supports these inline node types:
- `mention` — `@` mentions, parsed from `<span data-type="at-mention">`.
- `skillChip` — Slash skill references, rendered as `/{skillId}`.
- `commandChip` — Legacy command chip (auto-converted to `skillChip`).
- `connectorToolChip` — MCP connector tool references, rendered as `{connectorName}: {toolDisplayName}`.

### Serialization

`GO` serializes TipTap JSON to plain text:
- `text` nodes -> raw text
- `mention` -> `@{renderedText}`
- `skillChip` -> `/{skillId}`
- `commandChip` -> `/{commandId}`
- `connectorToolChip` -> `{toolDisplayName}` (prefixed with connector name if present)

---

## 2. Send Button States

### Store Shape

```js
{
  isSending: false,
  setIsSending: (t) => ...,
  stopSampling: () => {},
  isStreaming: false,
  isReconnecting: false,
}
```

- `isStreaming` = `!!responseActive || isReconnecting`

### Send Guard Logic

The main send callback (`Je`):
```js
const prompt = store.getState().getPrompt();
if (!ref.current || (prompt.trim() === "" && attachments.length === 0 && files.length === 0 && syncSources.length === 0))
  return; // don't send
```
A message can be sent if it has **either**:
- Non-empty prompt text (after trim), OR
- At least one attachment, file, or sync source.

### Additional Send Blockers

- `isPromptUnsafe` — flag `__ant_unsafe` in tipTapEditorState blocks send.
- `hasBlockingWarning` — external blocking warning state.
- `isSending` — prevents double-send during active request.
- `isStreaming` — the stop button replaces send while streaming.
- Rate limits (opus, sonnet, thinking, general) each show specific error UI:
  - `opus_messages_rate_limit_exceeded`
  - `thinking_messages_rate_limit_exceeded`
  - `exceeded_limit` with `representativeClaim: "concurrents"` (concurrent limit)
  - `rate_limit_error` type
  - `overloaded_error` type
- Token limit: HTTP 413 -> `chat.conversation.token_limit_exceeded`.
- `isProcessingImages` — wait for image encoding to finish.
- `isLoadingMentionData` — wait for mention resolution.

### Stop Button

- `stopSampling` callback replaces send during generation.
- External action dispatch: `case "stopSampling": F()`.

---

## 3. Slash Commands

### Slash Command Menu

- Analytics: `claudeai.slash_command_menu.opened`, `claudeai.slash_command_menu.item_selected`, `claudeai.slash_command_menu.auto_resolved`.
- ProseMirror plugin key: `"slash-command-suggestion"`.
- Feature flag: `claudeai_simplified_slash_menu_enabled`.
- Feature flag: `claudeai_slash_connectors` (enables connector tools in slash menu).
- `slashCommandsEnabled` prop controls visibility.
- `handleSlashCommandClick` inserts `/` and focuses editor.
- `insertSlashCommand()` chains `.focus().insertContent("/")`.

### Slash Command Sources

1. **System-prompt-defined commands**: `slash_commands` array in system prompt messages → `{name: ...}`.
2. **Cowork slash commands**: fetched via `queryKey: ["coworkSlashCommands"]`.
3. **CCD local slash commands**: fetched via `queryKey: ["ccd_local_slash_commands"]`.
4. **Connector tool chips**: MCP tools available as `/connectorName: toolName`.
5. **Skill chips**: skills available as `/{skillId}`.

### Slash Command Invocation

- Tracking: `claudeai.cowork.slash_command.invoked` (version 4).
- Unresolved fallback: `{errorContext: {tags: {source: "slash_command_unresolved"}}}`.

---

## 4. Mentions (@)

### Mention System

- Analytics: `claudeai.mentions.dropdown.opened`, `claudeai.mentions.option.selected`.
- ProseMirror plugin key: `"mention"`.
- Extension: `n3e.create({name: "mentionExtension"})`, node: `E5e.create({name: "mention"})`.
- HTML parse rule: `<span data-type="at-mention">`.
- Display: `MentionChip` component, `MentionDropdown` component.

### Mention Providers

- Default providers from `mentionProviders` prop.
- Desktop provider: `mention_provider_desktop` feature flag — calls `uO.fetchMentionOptions(query)` and `uO.handleMentionSelect`.
- Provider shape: `{id: "desktop", fetchOptions: async (query) => ...}`.

### Mention Resolution

- On mention select, a `mention` node is created with `{id: ..., ...attrs}`.
- Serialized as `@{renderedText}` in plain text.
- Loading state: `isLoadingMentionData` delays send.

---

## 5. Model Selector Dropdown

### State

```js
{
  isModelSelectorOpen: false,
  setIsModelSelectorOpen: (val) => ...,
  selectedModel: ...,
}
```

### Sticky Model Selector

Multiple named selectors exist (likely for different contexts):
- `"sticky-model-selector"` (main chat)
- `"baku-sticky-model-selector"` (Baku context)
- `"ccr-sticky-model-selector"` (CCR context)
- `"cowork-sticky-model-selector"` (Cowork/agent context)

Feature flags: `sticky_model_selector`, `model_selector_enabled`.

### Model Config Schema

```js
{
  model_id: string,
  minimum_tier: "free" | "pro" | "max"
}
```

### Model Capabilities Schema

```js
{
  mm_pdf: boolean?,    // PDF input support
  mm_images: boolean?, // Image input support
  web_search: boolean?,
  gsuite_tools: boolean?,
  compass: boolean?,   // Plan/agent mode
}
```

### Known Model IDs

- `"claude-sonnet-4-5-20250929"`
- `"claude-haiku-4-5-20251001"`
- `"claude-3-5-haiku-latest"` (default fallback)
- `"claude-opus-*"` / `"claude-3-opus-*"` (Opus family)

### Tier-Based Restrictions

- Enterprise Lite: `startsWith("claude-opus") || startsWith("claude-3-opus")` → blocked/restricted.
- Free tier: only models with `minimum_tier: "free"`.
- Pro/Max: unlock higher-tier models.

### Fallback Behavior

```js
aue = {
  fallbackModelName: "claude-sonnet-4-5",
  displayName: "Sonnet 4.5"
}
```
- `onRetryWithFallback`: retries with fallback model when current model unavailable.
- Warning: "Opus uses your limit faster. Try another model for longer conversations."
- Warning: "Claude Opus 4.6 works best with the latest desktop app. Update now."

### Rate Limit Windows

- `5h` — 5-hour window
- `7d` — 7-day general window
- `7d_opus` — 7-day Opus-specific window
- `7d_sonnet` — 7-day Sonnet-specific window
- `7d_cowork` — 7-day Cowork/agent window
- `overage` — extra usage / overage window

### Thinking Modes

- `paprika_mode` — codename for thinking mode setting.
- Values: `"extended"` (enabled) or absent/disabled.
- Sent in CreateConversation/AppendMessage as `paprika_mode`.
- Thinking mode UI: `thinking_mode_extended_title`, `thinking_mode_extended_description`, `thinking_mode_extended_selection_title`.
- Config: `thinking_modes` array with `{id, mode, selection_title}`.
- Keyboard shortcut: Cmd+Shift+E (Mac) / Ctrl+Shift+E (non-Mac).

### Data-TestID

`data-testid="model-selector-dropdown"`.

---

## 6. Tool Toggle Menu

### Conversation Settings (Tool Toggles)

Settings are per-conversation and persisted via `pendingConversationSettings` (for new conversations) or `conversationSettings` (for existing ones).

#### Core Toggle Settings

| Setting Key | Codename | Description |
|---|---|---|
| `enabled_web_search` | — | Web search tool |
| `enabled_mcp_tools` | — | MCP connector tools (object: `{toolName: bool}`) |
| `enabled_imagine` | — | Image generation (/imagine) |
| `enabled_artifacts_attachments` | — | Artifacts (code execution & file creation) |
| `enabled_saffron` | saffron | Artifacts/creative tool (saffron is the internal name) |
| `enabled_saffron_search` | — | Saffron search sub-feature |
| `enabled_wiggle_egress` | wiggle | Computer use / web browsing |
| `enabled_bananagrams` | bananagrams | GSuite tools integration |
| `enabled_sourdough` | sourdough | Gmail MCP integration |
| `enabled_foccacia` | foccacia | Google Calendar MCP integration |
| `paprika_mode` | paprika | Extended thinking |

#### Sticky Settings

`Lre = ["enabled_web_search", "enabled_bananagrams", "enabled_sourdough", "enabled_foccacia"]`

These settings "stick" across conversations when `claude_ai_sticky_project_settings` flag is active.

#### Settings Source Hierarchy

```js
// For existing conversations:
conversationSettings?.[key]
// For pending settings in new conversations:
pendingConversationSettings?.[key]
// Fallback to project/org settings:
settings?.[key]
```

#### Toggle Functions

- `toggleConversationSetting(key)` — toggle single setting.
- `batchToggleConversationSettings(update)` — batch toggle.
- `batchToggleConversationSettingsAndMCPTools({conversationSettingsUpdate, mcpToolsUpdate})` — combined.
- `toggleSearchTool("enabled_web_search")` — web search specific.
- `toggleMcpToolEnabled(toolName)` — individual MCP tool.
- `toggleMcpToolAlwaysApproved(toolName)` — auto-approve MCP tool.

#### Feature Gate Status Values

- `"available"` — can be used
- `"blocked_by_platform"` — platform doesn't support it
- `"blocked_by_org_admin"` — org admin disabled it
- `"blocked_by_entitlement"` — plan doesn't include it

#### Global Feature Flags (DT Object)

```js
DT = {
  chat: RT,
  web_search: RT,
  geolocation: RT,
  saffron: RT,
  wiggle: RT,
  skills: RT,
  thumbs: RT,
  claude_code: RT,
  claude_code_fast_mode: RT,
  claude_code_web: RT,
  claude_code_desktop: RT,
  claude_code_review: RT,
  cowork: RT,
  work_across_apps: RT,
  claude_code_remote_control: RT,
  interactive_content: RT,
  api_workbench_thumbs: RT,
  developer_partner_program: RT,
  inline_visualizations: RT,
  mcp_artifacts: RT,
}
```

(RT appears to be a runtime toggle flag type.)

---

## 7. File Attachment UI

### Attachment Limits

- **Max file size:** `OJ = 31457280` bytes (30 MB). Configurable via `cai_file_upload_config` LaunchDarkly flag (default 15360 KB = 15 MB for "wiggle" path).
- **Max attachments per message:** 20.
- **Max attachments per conversation:** 500.
- **Max image limit per chat:** Tracked via `exceeded_max_image_limit_per_chat` error code.
- **Display size:** `Math.floor(maxFileSize / 1048576)` MB shown in UI.

### Accepted File Types

The `VJ({imagesEnabled, outOfContextFilesEnabled, wiggleEnabled})` function builds the accept list dynamically.

#### Text/Code files (CJ array — always accepted):

```
txt, py, ipynb, js, jsx, html, css, java, cs, php, c, cc, cpp, cxx, cts, h, hh, hpp, rs, R, Rmd,
swift, go, rb, kt, kts, ts, tsx, m, mm, mts, scala, dart, lua, pl, pm, t, sh, bash, zsh, csv, log,
ini, cfg, config, json, proto, prisma, yaml, yml, toml, sql, bat, md, coffee, tex, latex, gd,
gdshader, tres, tscn, typst, rst, adoc, asciidoc, textile, creole, wiki, env, gitignore,
dockerignore, editorconfig, prettierrc, eslintrc, gradle, sbt, cabal, podspec, gemspec, makefile,
dockerfile, xml, rss, atom, graphql, gql, hbs, handlebars, mustache, twig, jinja, jinja2, j2,
vue, svelte, glsl, hlsl, frag, vert, shader, elm, clj, cljs, erl, ex, exs, hs, nim, zig, fs, fsx,
ml, mli, v, vsh, vv, pas, pp, inc, fish, csh, tcsh, ps1, psm1, psd1, tsv, tab, jsonl, ndjson,
lock, ignore, gitattributes, gitmodules, htaccess, htpasswd, robots, sitemap
```

#### Unsupported / Binary-only files (SJ array — rejected):

```
bmp, ico, tiff, tif, psd, raw, cr2, nef, orf, sr2, mobi, jp2, jpx, jpm, mj2, svg, svgz, ai, eps,
ps, indd, heic, mp4, mov, avi, mkv, wmv, flv, webm, mpeg, mpg, m4v, 3gp, ogv, ogg, rm, rmvb,
asf, amv, mpe, m1v, m2v, svi, 3g2, roq, nsv, f4v, f4p, f4a, f4b, qt, hdmov, divx, div, m2ts,
mts, vob, mp3, wav, wma, aac, flac, alac, aiff, opus, m4a, amr, awb, ra, mid, midi, mka, ttf,
otf, woff, woff2, eot, sfnt, ttc, suit, doc, pptx, ppt, zip, rar, tar, gz, 7z, pkg, deb, rpm,
dmg, exe, msi, app, dng, xcf, blend, max, obj, fbx, 3ds, dwg, dxf, skp, kmz
```

#### Image files — accepted when `imagesEnabled` (model supports images):

Image types like `.gif`, `.jpg`, `.jpeg`, `.png`, `.webp` are conditionally accepted based on `modelConfig.image_in`.

#### PDF — accepted when model supports it:

Conditional on `modelConfig.pdf_in`.

### Attachment Handlers

- `TextAttachmentHandler` — handles text files.
- Image attachment — processed with encoding; `encodingPending` flag.
- PDF attachment — conditional on model PDF support.
- File upload kind: `$J.PastedText` for pasted content, `$J.Excerpt` for excerpts.

### Keyboard Shortcut

- **Upload file:** Cmd+U (Mac) / Ctrl+U (non-Mac).

### Drag & Drop

- `onFolderDropped` callback for directory drops.
- `onDrop` callback for general file drops.
- `isDragging` state tracks active drag.
- Uses `@dnd-kit` library (`X8 = d.createContext(null)`, `draggable`, `droppable` patterns).

### Duplicate Detection

`detectSameAttachment` — warns: "The same attachment was already added earlier. Claude sees the full conversation when replying."

### Attachment Preview

Attachments display with:
- File name
- File size
- File type icon (by extension)
- "Pasted content" label for pasted items
- "Excerpt Text" for excerpts
- "Progress item" for progress items
- Remove button (filter out from attachments array)

### Google Drive / Gmail / Calendar Syncs

- `isUploadingDriveSync` — state for Google Drive sync uploads.
- `isUploadingGithubSync` — state for GitHub sync uploads.
- `syncSourceUuids` — external sync sources.

---

## 8. Keyboard Shortcuts (Command Palette)

### All Commands (`ZP` Object)

| ID | Description | Shortcut (Mac) | Shortcut (non-Mac) | Group |
|---|---|---|---|---|
| `command_palette` | Command menu | Cmd+K | Ctrl+K | other |
| `search_palette` | Search conversations and projects | Cmd+Shift+K | Ctrl+Shift+K | other |
| `quick_chat` | Quick chat | Cmd+Ctrl+K | Ctrl+Alt+K | other |
| `new_conversation` | New conversation | Cmd+Shift+O | Ctrl+Shift+O | navigation |
| `settings` | General (settings) | Cmd+Shift+, | Ctrl+Shift+, | settings |
| `incognito` | Incognito chat | Cmd+Shift+I | Ctrl+Shift+I | chat |
| `file_upload` | Upload file | Cmd+U | Ctrl+U | chat |
| `extended_thinking` | Toggle extended thinking | Cmd+Shift+E | Ctrl+Shift+E | chat |
| `toggle_dictation` | Toggle dictation | Cmd+D | Ctrl+D | chat |
| `toggle_sidebar` | Toggle sidebar | Cmd+. | Ctrl+. | general |
| `shortcuts_modal` | All keyboard shortcuts | Cmd+/ | Ctrl+/ | general |
| `toggle_plan_mode` | Toggle plan mode | Cmd+Shift+P | Ctrl+Shift+P | other |
| `create_from_issue` | Import issue | Cmd+Shift+I | Ctrl+Shift+I | other |

### Navigation Entries (no shortcuts, in command palette)

- `chats` — All chats (`/chats`)
- `projects` — Projects (`/projects`)
- `ask_your_org` — Ask your org
- `artifacts` — Artifacts (`/artifacts`)
- `claude_code` — Code (`/code`)
- `capabilities` — Capabilities (`/settings/capabilities`)
- `connectors` — Connectors (`/settings/connectors`)

### Hidden From Command Palette

- `search_palette`, `quick_chat`, `extended_thinking`, `toggle_dictation`, `toggle_plan_mode`, `create_from_issue`.

### Groups

- `navigation` — page navigation
- `settings` — settings pages
- `chat` — chat actions
- `general` — general UI controls
- `other` — miscellaneous

### Analytics

- `claudeai.command_palette.opened` — when command palette opens.
- `claudeai.command_palette.item_selected` — when item selected.

---

## 9. Starter / Onboarding Prompts

### Categories (Onboarding First-Chat Tabs)

1. **Everyday**
2. **Code**
3. **Work**
4. **Think**
5. **Write**
6. **Play**

### Chip Labels (Clickable Prompt Cards)

**Everyday:**
- "Code a tool or app"
- "Brainstorm an idea"
- "Organize my inbox"
- "Plan a trip"
- "Cook something tasty"
- "Research an important decision"

**Code:**
- "Code a tool or app"
- "Prototype a user interface"
- "Write an automation script"
- "Draft a technical spec"

**Work:**
- "Organize your inbox or calendar"
- "Help improve your productivity"
- "Create a presentation"
- "Draft a product requirements doc"

**Think:**
- "Work through a problem"
- "Brainstorm an idea"
- "Dig into a historical event"
- "Visualize a tricky concept"

**Write:**
- "Hone your writing skills"
- "Get feedback on a draft"
- "Draft a speech"
- "Structure longform content"

**Play:**
- "Make a game"
- "Teach me something useless"
- "Turn your day into a short story"
- "Wildcard"

### Expanded Prompts (Sent to Claude)

Each chip has an `expandedPrompt` that is the actual message sent. Examples:
- "I want to build a simple tool or app. Walk me through the process from idea to working prototype — what questions should I answer first?"
- "Help me brainstorm. I have the start of an idea and I'd like to explore it from a few different angles."
- "My inbox is overwhelming. Help me think through a practical system for triaging."
- "Help me plan a trip. Ask me about where..."
- "Help me cook something tasty. Ask about what ingredients I have on hand."
- "I'm facing a decision and want to think it through carefully. Help me lay out the options."
- "Help me build a tool or app from scratch. Ask what it needs to do and who it's for."
- "Help me prototype a user interface. I'll describe what I'm going for — you sketch the layout."
- "Help me automate something tedious. I'll describe the repetitive task — you write a script that handles it."
- "Help me draft a technical spec. Ask about the problem."

### Analytics

- `claudeai.onboarding_first_chat.category_changed` — when user switches tabs.
- `claudeai.projects.project_starter.clicked` — project starter.
- `claudeai.projects.chat_starter.clicked` — chat starter.

### Starter Project

- `/api/organizations/{orgId}/starter_project` endpoint.
- `is_starter_project` flag on conversations.
- `projectStarter` URL param.

### MCP Plugin Suggested Prompts

Plugins/connectors can provide `suggested_prompts`:
```js
FZ = z.object({
  suggested_prompts: z.array(z.object({
    label: z.string().optional(), // Human-readable display text. Falls back to prompt if omitted.
    // ...prompt text
  }))
})
```
- Analytics: `claudeai.fusion.suggested_prompt.clicked`.
- Rendered by `SuggestedPromptsSection`.

### Integration-Specific Suggested Prompts

Many suggested prompts are generated for Google Drive, Gmail, and Calendar integrations:
- "Summarize my top projects this quarter"
- "Analyze my writing style based on my docs"
- "Look at how my calendar has shifted this month compared to last"
- "Analyze my email communication style"
- etc.

---

## 10. Feedback System (Thumbs Up/Down)

### Feedback Types Enum (`Qc`)

```js
Qc = {
  UPVOTE:           "upvote",
  FLAG:             "flag",
  FLAG_BUG:         "flag/bug",
  FLAG_HARMFUL:     "flag/harmful",
  FLAG_REFUSAL:     "flag/refusal",
  FLAG_FILE:        "flag/file",
  FLAG_INSTRUCTIONS:"flag/instructions",
  FLAG_FACTS:       "flag/facts",
  FLAG_INCOMPLETE:  "flag/incomplete",
  FLAG_THOUGHTS:    "flag/thoughts",
  FLAG_WEB_OVER:    "flag/web-over",
  FLAG_WEB_SOURCES: "flag/web-sources",
  FLAG_WEB_URL:     "flag/web-url",
  FLAG_WEB_UNDER:   "flag/web-under",
  FLAG_MEMORY:      "flag/memory",
  FLAG_OTHER:       "flag/other",
  FLAG_CONTENT:     "flag/content",
  FLAG_CONSTITUTION:"flag/constitution",
  SC_FALSE_POSITIVE:"sc/false_positive",
}
```

### Feedback API

**Endpoint:**
```
/api/organizations/{orgId}/chat_conversations/{conversationId}/chat_messages/{messageId}/chat_feedback
```

**Method:** `POST` (new) or `PUT` (update existing).

### Feedback UI

- Thumbs up button: "Give positive feedback" → type `"upvote"`.
- Thumbs down button: "Give negative feedback" → type `"flag"`.
- Active state CSS: upvote = `"bg-bg-200 !text-accent-100"`, flag = `"bg-bg-200 !text-danger-100"`.
- Feature gate: `claude_ai_completion_feedback_enabled` (per-org setting, default `true`).
- `chatFeedbackEnabled` prop controls visibility.

### Follow-Up Feedback

After thumbs down, a follow-up form appears with sub-categories:
- Bug, Harmful, Refusal, File, Instructions, Facts, Incomplete, Thoughts
- Web-specific: Web Over-reliance, Web Sources, Web URL, Web Under-use
- Memory, Other, Content, Constitution
- `SC_FALSE_POSITIVE` — safety classifier false positive

Placeholder text for follow-up: "What was unsatisfying about this response?"

### Analytics

- `claudeai.conversation.feedback.sent` — feedback submitted.
- `claudeai.experiment.feedback_submitted`, `claudeai.experiment.feedback_buttons_rendered`.
- `claude_cowork.message.feedback` — cowork-specific, with `thumbs: "positive" | "negative"`.
- `claudeai.tool.feedback_submitted` — tool-specific feedback.
- `claudeai.ask_user_input.feedback_submitted` — ask-user-input feedback.

### Privacy Policy Links

- General: `https://privacy.anthropic.com/en/articles/9957937-how-does-anthropic-use-submitted-feedback`
- Alternative: `https://privacy.anthropic.com/en/articles/10023565-how-does-anthropic-use-submitted-feedback`

---

## 11. Image Generation UI (/imagine)

### Trigger

- Source path: `/imagine` (dedicated page).
- Conversation setting: `enabled_imagine`.
- Image generation is an MCP tool-based feature. `enabled_imagine` maps to enabled MCP tools: `enabled_imagine: aJ(Fe.enabled_mcp_tools)`.
- Navigation links: `onClick: () => window.location.href = "/imagine"`.

### Image Display

- `imageUrls` schema: `z.array(z.object({ prompt: z.string().optional(), imageUrl: z.string() })).optional()`.
- `onImageBlocksReceived` callback processes incoming image blocks.
- `imageBlocks` state array stores received images.
- `removeImageBlock` callback to remove individual images.
- `ImageBlockItem` component renders each image.

### Image Upload (for editing)

```js
// Upload endpoint returns JSON
const response = await fetch(uploadUrl, { body: formData });
// Error: `Failed to upload image: ${status} ${statusText}`
```

---

## 12. Prompt Improvement UI

### Endpoint

```
POST /api/organizations/{orgId}/prompt/improve/stream
```

### Stream Protocol

Server-Sent Events with:
- `delta.text` events — streaming improved text.
- `message_stop` event — contains `improved_prompt` (final result).
- `error` event — contains `error.message`.

### UI Flow

1. User clicks improve button.
2. `improvePrompt` callback fires (via `St` switch-case: `case "improvePrompt": nt()`).
3. Streaming response populates the improved text.
4. On error: "Failed to improve prompt."
5. AbortController for cancellation.

### Feature Gate

- `prompt_improver_config_enabled` (via `Ux` = usePersistentState check).

---

## 13. Voice / Dictation

### Voice Mode

- Feature: `VOICE_MODE`.
- Voice selector: `voice: "buttery"` (default voice).
- Store: `{voice, isVoiceStreaming, lastVoiceModel, setVoice, setIsVoiceStreaming, setLastVoiceModel}`.
- Audio encoding: WebCodecs Opus or MediaRecorder with `audio/webm;codecs=opus`.
- Speech-to-text endpoint: `/api/ws/speech_to_text/voice_stream?encoding={opus|linear16}`.
- Keyboard shortcut: Cmd+D (Mac) / Ctrl+D (non-Mac) to toggle dictation.
- Device persistence: `"voice-mode:selected-mic-device-id"`, `"voice-mode:selected-speaker-device-id"`.

### Analytics

- `claudeai.voice.session_started`, `session_connected`, `session_ended`, `session_error`.
- `claudeai.voice.mic_muted`, `mic_unmuted`, `mic_device_changed`, `speaker_device_changed`.
- `claudeai.voice.user_turn_completed`, `assistant_turn_completed`, `assistant_interrupted`.

---

## 14. Personalized Style Selector

### Store

```js
{
  personalizedStyle: undefined,
  setPersonalizedStyle: (val) => ...
}
```

### Persistence

- LocalStorage key: `claude_personalized_style`.
- 12-hour expiry check: `Date.now() - new Date(timestamp).getTime() > 432e5` (43200000 ms = 12 hours).
- `personalizedStyleOptions` — array of available styles.
- Analytics: `styles.selector.clicked`.

### Send Payload

- `personalized_styles: [personalizedStyle]` — array sent in message (or empty).
- `has_personalized_style: boolean` — analytics flag.

---

## 15. Profile Preferences Toggle

### Store

```js
{
  includeProfilePreferences: true,  // default ON
  setIncludeProfilePreferences: (val) => ...
}
```

- Sent as `include_profile_preferences` in the message payload.

---

## 16. Integrations / Sync Sources

### Integration Types Enum (`JH`)

```js
JH = {
  GITHUB:        "github",
  GDRIVE:        "gdrive",
  OUTLINE:       "outlin",
  SALESFORCE:    "sfdc",
  GMAIL:         "gmail",
  GCAL:          "gcal",
  SLACK:         "slack",
  ASANA:         "asana",
  CANVAS:        "canvas",
  FIDDLEHEAD:    "fiddlehead",
  CUTTLEFISH:    "cuttlefish",
  MCP_RESOURCES: "mcpres",
}
```

### MCP Server URLs

```
Google Calendar:
  https://gcal.mcp.claude.com/mcp
  https://mcp-server-gcal-586545259222.us-central1.run.app/mcp

Gmail:
  https://gmail.mcp.claude.com/mcp
  https://mcp-server-gmail-110131437935.us-central1.run.app/mcp

Google Drive:
  https://api.anthropic.com/mcp/gdrive/mcp
```

### Codename to Setting Mapping

```js
XQ = {
  [JH.GCAL]:  "enabled_foccacia",  // Google Calendar
  [JH.GMAIL]: "enabled_sourdough", // Gmail
}
// bananagrams = GSuite tools (Google Drive)
```

---

## 17. Incognito Mode

- URL: `/new?incognito=true`
- Field: `is_temporary: true` on conversation.
- Keyboard shortcut: Cmd+Shift+I (Mac) / Ctrl+Shift+I (non-Mac).
- Analytics: `claudeai.incognito_mode.toggled`.
- Incognito conversations are not persisted in history.

---

## 18. Plan Mode (Compass)

- Toggle shortcut: Cmd+Shift+P (Mac) / Ctrl+Shift+P (non-Mac).
- Conversation field: `compass_mode`.
- Enum: `Jc = { CLAUDE_AI: "CLAUDE_AI" }`.
- Related analytics: `claudeai.cowork.*` events.
- `currentCompassTask` state for active plan task.
- `setCurrentCompassTask` callback.

---

## 19. Message Submit Payload (AppendMessage)

Based on the protobuf definition found in the bundle, the full AppendMessage request includes:

```
organization_uuid, chat_conversation_uuid, prompt, workspace_id,
use_all_available_tools, tools[], model, max_tokens_to_sample,
temperature, top_k, top_p, timezone, custom_system_prompt,
parent_message_uuid, input_mode, rendering_mode,
is_mobile_app_intent, is_voice_input, locale, attachments[],
files[], sync_sources[], personalized_styles[],
enable_process_group_markers, device_location, turn_message_uuids
```

---

## 20. Analytics Events (Complete Catalogue — Input-Related)

```
snippets_command_used, file_upload_too_large, sse_interrupted, snippets_suggestion_selected,
claudeai.slash_command_menu.opened, claudeai.slash_command_menu.item_selected,
claudeai.slash_command_menu.auto_resolved, claudeai.cowork.slash_command.invoked,
claudeai.mentions.dropdown.opened, claudeai.mentions.option.selected,
claudeai.command_palette.opened, claudeai.command_palette.item_selected,
claudeai.conversation.feedback.sent, claudeai.mcp.tool.toggled,
claudeai.fusion.suggested_prompt.clicked, claudeai.onboarding_first_chat.category_changed,
claudeai.incognito_mode.toggled, claudeai.thinking_cell.clicked,
claudeai.settings.capabilities.opened, claudeai.voice.session_started,
claudeai.limit_action.manage_usage.shown, claudeai.limit_action.manage_usage.clicked,
chat.conversation.token_limit_exceeded, chat.conversation.token_limit_will_exceed,
chat.conversation.too_long_prompt:loaded/accepted/dismissed,
styles.selector.clicked, spotlight.shown, spotlight.dismissed, spotlight.action_clicked,
metaprompter.modal.loaded, metaprompter.generate.started/finished,
claudeai.code.composer.default_model_missing_from_config,
claudeai.cowork.model_switched, claudeai.code.model_switched,
```
