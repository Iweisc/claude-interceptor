# Claude.ai Frontend Rendering Pipeline

**Source:** `index-DcrCrePJ.js` (7.2 MB, minified)
**Analysis date:** 2026-03-22

---

## 1. Markdown Rendering Pipeline

### Libraries
- **react-markdown** (`mxe` internally) -- the primary markdown renderer, imported as `ReactMarkdown`
- **remark** (remark-based unified pipeline) -- parser
- **remark-math** -- LaTeX math support (lazy-loaded)
- **remark-rehype** (`Rge`) -- transforms mdast to hast
- **rehype-katex** -- renders KaTeX (lazy-loaded)
- **hast-util-to-jsx-runtime** (`Jme` = `https://github.com/syntax-tree/hast-util-to-jsx-runtime`) -- final JSX conversion
- **@khanacademy/simple-markdown** v0.11.4 -- used separately for internal parsing (e.g., artifact content, editing messages)
- **@khanacademy/perseus-core** v1.4.2 -- math rendering support library

### Pipeline Architecture

```
Raw text
  |
  v
Pre-processing (bullet normalization, code fence normalization, antThinking stripping, citation injection)
  |
  v
remark (micromark parser -> mdast)
  |
  +-- remarkPlugins: [in-house LaTeX plugin, remarkMath (if math detected), custom citation plugin, link detection, code detection]
  |
  v
remark-rehype (mdast -> hast)
  |
  +-- rehypePlugins: [rehypeKatex (if math detected)]
  |
  v
hast-util-to-jsx-runtime (hast -> React JSX)
  |
  +-- Custom component overrides for: pre, code, a, img, table, antCitation tag
  |
  v
React DOM
```

### Two Rendering Modes

1. **`StandardMarkDown` (`Nwe`)** -- Used for completed (non-streaming) content. Renders the entire text as a single `react-markdown` instance with class `standard-markdown`.

2. **`ProgressiveStandardMarkDown` (`iPe`)** -- Used during streaming. Splits the text into "completed chunks" and a "streaming chunk":
   - Uses the `aPe` class (a state machine tracking code blocks, lists, tables, blockquotes) to find paragraph boundaries safe to split at.
   - Completed chunks are rendered as memoized `rPe` components (avoid re-rendering on new tokens).
   - The trailing streaming chunk is rendered as a live `Nwe` with `isStreaming=true`.
   - Class name: `progressive-markdown`.
   - Chunks are split at double-newline paragraph breaks outside of any structure (code block, list, table, blockquote).

### Pre-processing Steps

1. **Bullet normalization:** `(^|\n)(\s?)bullet(\s?)` replaced with `$1$2- ` (converts `bullet` to standard markdown list dash).
2. **antThinking stripping:** Regex `h7` removes `<antThinking>...</antThinking>` tags from displayed text.
3. **Citation injection:** `gpe()` function inserts inline `:antCitation[]{citations:uuid1,uuid2}` tags at positions specified by `citation.start_index` / `citation.end_index`.
4. **Code fence normalization:** Artifact code blocks within markdown are normalized; nested backtick fences are tracked by depth.
5. **Artifact tag extraction:** `<antArtifact>` tags are parsed and removed from the markdown stream, replaced with artifact component references.

### Normalization Modes
- `"code-in-markdown"` (default) -- Standard message rendering
- `"markdown-document"` -- Used for artifact markdown rendering and skill content

### URL Transform
The `urlTransform` function:
- For `<img src>`: passes through as-is
- For `<a href>`: allows `computer://` and `tel:` schemes; otherwise applies default sanitization via `hxe` (which permits `https?`, `ircs?`, `mailto`, `xmpp` protocols)

### CSS Layout
Both modes use a grid layout: `grid-cols-1 grid [&_>_*]:min-w-0 gap-3` (`Swe`).
Message text elements get `pl-2` left padding and `pr-8` right padding for `p`, `blockquote`, `h1-h6`, `ul`, `ol`.

---

## 2. Code Block Rendering

### Syntax Highlighting Library
- **highlight.js** (via `hljs`) -- the AST generator for server-side/initial highlighting
- **react-syntax-highlighter** -- the React wrapper component (`uwe` / `gwe` internally)
- **lowlight** (`Bgt`) -- highlight.js-based library used for Tiptap editor code blocks
- **Prism.js** language definitions are loaded for tokenization (`dwe` array of ~250+ language names)
- Custom dark/light themes: `qve` (dark) and `Vve` (light), selected based on `resolvedMode` from `Gve()`

### Theme Details
- **Dark theme (`qve`):** Base color `hsl(220, 15%, 93%)` on transparent background. Keyword: `hsl(200, 100%, 72%)`, string: `hsl(100, 65%, 70%)`, function: `hsl(40, 95%, 70%)`, comment: `hsl(220, 15%, 55%)`.
- **Light theme (`Vve`):** Base color `hsl(220, 20%, 10%)` on transparent background. Keyword: `hsl(200, 100%, 30%)`, string: `hsl(100, 80%, 28%)`, function: `hsl(30, 100%, 40%)`, comment: `hsl(220, 15%, 55%)`.

### Supported Languages (Prism)
250+ languages in `dwe` array, including all major languages: `abap`, `bash`, `c`, `cpp`, `csharp`, `css`, `dart`, `docker`, `elixir`, `erlang`, `go`, `graphql`, `groovy`, `haskell`, `java`, `javascript`, `json`, `julia`, `kotlin`, `latex`, `lua`, `makefile`, `markdown`, `matlab`, `mermaid`, `nginx`, `nim`, `nix`, `objectivec`, `ocaml`, `pascal`, `perl`, `php`, `powershell`, `prolog`, `protobuf`, `python`, `r`, `reason`, `ruby`, `rust`, `scala`, `scheme`, `scss`, `shell-session`, `sql`, `swift`, `typescript`, `verilog`, `vhdl`, `vim`, `wasm`, `yaml`, `zig`, and many more.

### Language Alias Map
```
ts -> typescript, tsx -> tsx, js -> javascript, jsx -> javascript
py -> python, rb -> ruby, sh -> bash, zsh -> bash, fish -> fish
bat -> batch, cmd -> batch, ps1 -> powershell
md -> markdown, mermaid -> mermaid, mmd -> mermaid
tex -> latex, yml -> yaml, json -> json
```

### Code Block Size Limit
Code blocks exceeding **204,800 bytes** (200 KB) trigger the `$ve` check. When exceeded:
- Syntax highlighting is disabled
- A banner displays: "Syntax highlighting has been disabled due to code size."
- Raw `<pre><code>` is rendered instead (`Lve` component)

### Code Block Header
When `flagShowCodeHeader` is true, the code block gets a header bar showing:
- Language label (detected from `language-xxx` class)
- Copy button (`jne` icon component, uses `Mne()` hook with `navigator.clipboard.writeText`)
- The copy button shows a checkmark for 2 seconds after copying

### Code Block Structure
```
<div> (wrapper)
  <div> (header: language + copy button)  [if flagShowCodeHeader]
  <div> (overflow-x-auto wrapper)
    <SyntaxHighlighter> (react-syntax-highlighter with highlight.js)
      or
    <Lve> (plain pre/code if exceeds size limit)
  </div>
</div>
```

### Tree-Sitter Highlighting (Diff Views)
In addition to highlight.js for code blocks, the diff viewer uses **tree-sitter** (WASM) for precise syntax highlighting of diffs. Tree-sitter grammars are loaded as `.wasm` files:

**Supported tree-sitter languages (`vGe`):**
`typescript`, `tsx`, `javascript`, `python`, `rust`, `go`, `java`, `cpp`, `c`, `ruby`, `php`, `bash`, `css`, `html`, `json`

Each language has a WASM grammar file (e.g., `/tree-sitter/typescript/tree-sitter-typescript.wasm`) and a highlights query file (`/tree-sitter/typescript/highlights.scm`).

The `c$e` singleton manages tree-sitter initialization, parser creation, and a highlight cache. It uses `web-tree-sitter.wasm` for the runtime. Highlighting is applied asynchronously to diff lines, with results mapped to theme styles from `Gve()`.

### Inline Code
`<code>` elements that do NOT have a `math` class get styled with: `bg-text-200/5 border border-0.5`.
Inline math code blocks (class includes `math`) render as `<span>` instead.

### ANSI Output
The `vke` component (`AnsiOutput`) handles ANSI escape code rendering, detected by `mke()` function checking for ANSI sequences in content. Used for terminal output display.

---

## 3. Citation Rendering

### Citation Format in Content
Citations are streamed via SSE deltas:
- `citation_start_delta` -- contains `citation.uuid`, records `start_index` at current text position
- `citation_end_delta` -- contains `citation_uuid`, records `end_index` at current text position
- After streaming, citations are an array on each `text` block: `{ uuid, start_index, end_index, url?, origin_tool_name?, metadata? }`

### Injection into Markdown
The `gpe()` function converts citations into inline custom tags:
```
:antCitation[]{citations:uuid1,uuid2}
```
These are placed at the `end_index` positions in the text.

### Custom Remark Plugin
A custom remark plugin (`ppe` tag handler) parses `:antCitation[]{citations:...}` tags and creates custom AST nodes with a `citationUuids` property. These are stripped from the visible text (the `mpe` regex removes them).

### Citation Display Component (`xve`)
- **Single citation:** Renders as a tooltip (`wk` component) with inline superscript-style tag
- **Two citations:** Each renders individually with a small spacer between them
- **Three or more citations:** First citation shown with `"+ N"` suffix, all shown in a dropdown tooltip
- Tooltip positioning: `side="top"`, content style: `"citation"`

### Citation Tooltip Content
- **`vve` (single citation card):** Shows the citation's domain/source with favicon, title, and URL
- **`yve` (multi-citation list):** Shows citations with URLs first, then citations without URLs, separated by a divider

### Citation Click Behavior
- Tracks `claudeai.conversation.citation_clicked` event with `messageUuid`, `citationSourceTool`, `webDomainName`
- Citations with URLs open in new tab
- Citations without URLs show in tooltip only

### Block Citations (`blockCitations`)
Passed as a prop through the markdown rendering hierarchy. Used by the `hve` context provider (`mve`) to share highlighted citation state across the component tree.

---

## 4. LaTeX / Math Rendering

### Libraries
- **remark-math** -- remark plugin for parsing math syntax
- **rehype-katex** -- rehype plugin for KaTeX rendering
- **Custom in-house LaTeX plugin** (`ype` / `inHouseLatexPlugin`) -- handles edge cases

### Lazy Loading
Math plugins are lazy-loaded only when needed:
```javascript
Ope = (needsMath = true) => {
  // Loads remark-math and rehype-katex via dynamic import
  // from "./c6a992d55-DL1O62I0.js" chunk
  // Returns { remarkMath, rehypeKatex, inHouseLatexPlugin }
}
```
The detection is: `text.includes("$") || text.includes("```math")`

### Inline vs Block Math

**In-house LaTeX Plugin (`ype`):**
- **Block math (display):** Detected by `$$...$$` on a single line (`_pe` function) or `$$` opening/closing on separate lines. Creates nodes with `className: ["math", "math-display"]`.
- **Inline math:** `$...$` detected with custom parser (`wpe` function). Creates nodes with `className: ["math", "math-inline"]`.
- Backslash-escaped dollars (`\$`) are not treated as math delimiters (`Ape` function checks for escaping).
- Space-adjacent dollars (`$ ...$` or `$... $`) have special handling via `Epe` function.

**remark-math Configuration:**
```javascript
[remarkMath, { singleDollarTextMath: false }]
```
Single `$` is NOT used for inline math by remark-math; the in-house plugin handles `$` parsing instead.

**rehype-katex Configuration:**
```javascript
[rehypeKatex, { errorColor: "inherit" }]
```
KaTeX errors render in the inherited text color rather than a bright error red.

### Math in Code Blocks
The `code` component override checks `className?.includes("math")` -- if true, renders as `<span>` instead of `<code>`, allowing KaTeX to style it.

### Math Block Paragraph Splitting
When math nodes are found among paragraph children, the in-house plugin splits them into separate paragraphs to ensure block-level math renders correctly outside of inline text.

---

## 5. Mermaid Diagram Rendering

### Detection
Mermaid diagrams are detected when a code block has language `mermaid`:
```javascript
if ("mermaid" === s) return <MermaidIframe content={a} />
```

### Content Type
Mermaid has its own MIME type: `application/vnd.ant.mermaid`

File extensions mapped: `mermaid`, `mmd`

### Rendering (`k$e` / `MermaidIframe`)
Mermaid diagrams are rendered in a **sandboxed iframe**:
```jsx
<iframe
  sandbox="allow-scripts allow-same-origin"
  src={sandboxUrl}
  title="Mermaid diagram"
  referrerPolicy="no-referrer"
  allow="fullscreen; clipboard-write"
  style={{ height: "600px", border: "none", backgroundColor: theme }}
/>
```

### Rendering Context
- The content is sent to the sandbox via `anthropic.claude.usercontent.sandbox.SandboxContent` message with `type: P6.Mermaid`
- Background color adapts to theme: dark mode `#1f1e1d`, light mode `#f5f4ef`
- A loading state shows: "Rendering diagram..." with a spinner
- Errors display: "Unable to render diagram."
- The iframe height is fixed at `600px`

---

## 6. Image Rendering in Messages

### Uploaded Images (`ImageBlockItem` / `I_e`)
- Displayed via `Owe` component
- Wrapped in attachment list (`E_e`) alongside files and sync sources
- Supports removal via `onRemoveImageBlock` callback

### AI-Generated Images (Image Search / `image_gallery`)
The `image_gallery` content block type carries an `images` array with `{ id, thumbnail_url }` entries.

### Image Gallery Grid (`ORe` / `ImageGalleryGrid`)
- Layout: up to 3 images in the first row, then additional rows
- Images are clickable -- opens an **image carousel** (`CRe`)
- Attribution/domain info shown on click
- Expired galleries show an appropriate state
- Loading state: skeleton placeholders in a grid (`grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3`)
- "No images found" fallback text

### Image Carousel (`CRe`)
- Full-screen overlay carousel with left/right navigation
- Tracks `image_gallery/click` telemetry on interaction
- `renderAttribution` callback for showing source domains

### Image Search Aggregation
Multiple consecutive `image_search` tool_use/tool_result pairs are aggregated into a single `aggregated_image_search` display block, combining all images into one gallery.

### Message-Level Image Blocks (`Vqe` / `MessageImageBlocks`)
User-uploaded images in messages display in a flex row with wrapping: `flex flex-wrap gap-[5px] max-w-[85%]`

### Image Zoom / Lightbox
Images in code/artifact context have `cursor-zoom-in` and open via `window.open(url, "_blank", "noopener,noreferrer")`.
The markdown `img` component (`Iwe`) has an onClick handler that opens the image URL in a new window.

---

## 7. Tool Use Rendering

### Render Modes
```javascript
FFe = { Standard: "Standard", TimelineGroup: "TimelineGroup" }
```

### Timeline Architecture
Tool blocks are organized into timeline groups. The timeline collapses related thinking + tool_use blocks:

- `Ske` function determines if a block should be in the timeline (returns `true` for `thinking`, `tool_use`, `tool_result`, `token_budget`)
- Excluded from timeline: `prism`, `end_conversation`, `launch_extended_search_task`, `image_search`, `artifacts`, `enterprise_analytics`, `suggest_plugin_install`

### Tool Cell Components

**Generic Tool Cell (`iBe`):**
- Shows tool name, input, and result
- Collapsible with expand/collapse toggle
- Contains approval UI for MCP tools

**Web Search (`vUe`):**
- Renders as `lBe` (web search timeline cell)
- Shows search results as rows (`QFe` / `SearchResultRow`) with favicon, title, domain, and snippet
- Results are clickable links

**Web Fetch (`wUe` / `CUe`):**
- Similar to web search cell
- Shows egress hint when blocked (`yUe`)

**File Operations (`_Ue` set):**
- `create_file`, `open_file`, `update_file`, `view`, `read`, `write`, `edit`, `str_replace`, `str_replace_editor`
- Shows file path, diff view if applicable

**Computer Use / Browser Tools:**
- Screenshot display with coordinates overlay
- Action labels: "Click", "Drag", "Zoom", "Hover", etc. (`hBe` function)
- Screenshot image with click coordinates marker (`yBe`)

**Memory/Search Tools (`recent_chats`, `conversation_search`, `project_knowledge_search`):**
- Show rich content with conversation titles and URLs
- Conversation links are clickable

### Tool Approval Flow
- `oPe` function manages tool permission requests
- Options: "once", "always", "deny"
- MCP auth flow: popup window or redirect for OAuth (`Pke`)
- Always-approved keys stored in local state

### Progress / Working State
- Tool use blocks show as "active" during streaming
- Collapsed tools indicator (`Mke` / `CollapsedToolsIndicator`) shows count of collapsed items
- Status display controlled by `tPe` (zustand store: `isStatusDisplayVisible`)

### Tool Result Block (`Hke`)
- Displays result content (text, images, errors)
- Error results rendered with error styling
- Image results displayed inline

---

## 8. Thinking Block Rendering

### Component (`dFe`)
Props: `index`, `text`, `cutOff`, `startTimestamp`, `stopTimestamp`, `isStreaming`, `mostRecentSummary`, `messageUuid`, render mode, group position.

### Duration Display
The `MFe` function computes thinking duration labels:
- `< 60s`: "Thought for {seconds}s"
- `< 60m`: "Thought for {minutes}m {seconds}s"
- `>= 60m`: "Thought for {hours}h {minutes}m"

During streaming: shows "Thinking..." initially, then a live timer using `cFe` component with `setInterval`.

### Collapse / Expand Behavior
- Managed by `Vke` hook with `isExpanded` / `setIsExpanded` state
- `snappyTransition` flag for faster animation when streaming
- Default state: collapsed (shows summary)
- Click toggles expanded state
- Tracks `claudeai.thinking_cell.clicked` event with `is_opening`, `is_streaming`, timestamp

### Summary vs Full Text
- **During streaming:** Shows `mostRecentSummary?.summary` or "Thinking..." fallback
- **After completion:** Shows `uFe()` summarization (first meaningful sentence of thinking text) or the `mostRecentSummary?.summary`
- **Expanded view:** Full thinking text rendered via `iPe` (progressive markdown) or `Nwe` (standard markdown)
- **Cut-off indicator:** If `cutOff === true`, shows `oFe` component: "The rest of the thought process is not available for this response" with a support link

### ISP Thinking UX (Feature Flag)
Controlled by `claudeai_isp_thinking_ux` feature flag with configurable `fallback_summary_debounce_ms`.

### "Working" Alternative Display
When `alternative_display_type === "working"`, thinking blocks render as inline markdown content (progressive or standard depending on streaming state) instead of the collapsible thinking cell.

### Thinking Summary Delta
During streaming, `thinking_summary_delta` events provide incremental summaries that are appended to the `summaries` array on the thinking block.

---

## 9. Text Smoother / Streaming Animation

### The `UA` Class (Text Smoother)
A physics-based text appearance controller that smooths the token-by-token arrival of streaming content.

### Physics Model Parameters
```javascript
alpha = 0.99       // velocity smoothing factor (exponential moving average)
gamma = 1e-5       // regularization parameter
v = 100            // initial velocity (characters per second)
x = 0              // current smoothed character position
t = 0              // current time
```

### Frame Rate
```javascript
BA = 1000 / 60     // ~16.67ms per frame (60fps target)
```
When the page is hidden (background tab): drops to 100ms intervals. If model is done while hidden, immediately shows all content.

### Algorithm (`_get_smoothed_completion`)
1. Tracks `arrivals` array: `[timestamp_seconds, total_chars_at_that_time]`
2. Uses binary search / root finding (`bisection method`) to compute optimal display position
3. The optimization function balances:
   - Forward velocity constraint: `gamma * (velocity_delta)`
   - Lower bound: characters that arrived > 0.9 seconds ago (safe to show)
   - Upper bound: all arrived characters + 100 if model is done
4. Velocity is smoothed: `v = alpha * v + (1 - alpha) * instantaneous_velocity`
5. Position `x` is monotonically non-decreasing (`Math.max(r, this.x)`)

### Block Slicing
The smoother uses `FA()` to slice content blocks at the smoothed position:
- `text` blocks: `text.slice(0, position)`
- `thinking` blocks: `thinking.slice(0, position)`
- `tool_use` blocks: `partial_json.slice(0, position)`
- `tool_result` blocks: passed through unsliced

### Rendering Loop (`task` method)
```javascript
async task(callback, abortSignal) {
  while (!done && !aborted) {
    if (document.hidden) {
      // Immediate flush if model done
      // Otherwise occasional updates at 200ms
    } else {
      const smoothed = this._get_smoothed_completion();
      if (!unchanged) callback(smoothed);
      await sleep(isVisible ? BA : 100);  // 16.67ms or 100ms
    }
  }
}
```

### Interaction with Markdown
The smoother delivers partial content blocks to the React component tree. The `ProgressiveStandardMarkDown` (`iPe`) receives the smoothed blocks and:
1. Splits completed paragraphs into memoized chunks (no re-render)
2. Re-renders only the trailing streaming chunk on each frame
3. This means markdown is NOT fully re-parsed on every frame -- only the last chunk is re-parsed

### `dont_smooth` Mode
When `dont_smooth = true`, the smoother bypasses physics and delivers raw blocks immediately via `on_completion` callback. Used for non-streaming contexts.

---

## 10. Message Actions / Toolbar

### Feedback Types (`Qc` enum)
```javascript
UPVOTE = "upvote"
CHAT_ENDED = "chat_ended"
FLAG = "flag"
FLAG_BUG = "flag/bug"
FLAG_HARMFUL = "flag/harmful"
FLAG_REFUSAL = "flag/refusal"
FLAG_FILE = "flag/file"
FLAG_INSTRUCTIONS = "flag/instructions"
FLAG_FACTS = "flag/facts"
FLAG_INCOMPLETE = "flag/incomplete"
FLAG_THOUGHTS = "flag/thoughts"
FLAG_WEB_OVER = "flag/web-over"
FLAG_WEB_SOURCES = "flag/web-sources"
FLAG_WEB_URL = "flag/web-url"
FLAG_WEB_UNDER = "flag/web-under"
FLAG_MEMORY = "flag/memory"
FLAG_OTHER = "flag/other"
FLAG_CONTENT = "flag/content"
FLAG_CONSTITUTION = "flag/constitution"
SC_FALSE_POSITIVE = "sc/false_positive"
```

### Action Buttons (on assistant messages)

1. **Copy** -- Uses `Mne()` hook. Copies both plain text and HTML to clipboard via `ClipboardItem` API. Converts markdown to HTML for rich paste (`rTe` function). Shows checkmark for 2 seconds.

2. **Thumbs Up** -- Submits `UPVOTE` feedback via `chat_feedback` API (POST or PUT depending on existing feedback).

3. **Thumbs Down / Flag** -- Opens a dropdown with flag reasons:
   - "Issue with thought process" (if thinking blocks present)
   - "Shouldn't have searched the web" / "Don't like the cited sources" / "Relevant URL not used" / "Should have searched the web" (if web search enabled)
   - "Issue with memory" (if memory available)
   - Standard flags: bug, harmful, refusal, file, instructions, facts, incomplete, content, other

4. **Retry** -- Calls `onRetry(parent_message_uuid)`. Tracks `claudeai.message.user_triggered_retry`. Can retry with fallback model (`due` component).

5. **Edit** (on human messages) -- Enters editing mode. Tracks `claudeai.message.edited`.

6. **Branch Navigation** -- When `nOptions > 1`, shows `< 1/N >` navigation arrows. Calls `changeDisplayedConversationPath` to switch between sibling responses.

### Feedback API
```
POST /api/organizations/{orgUuid}/chat_conversations/{convUuid}/chat_messages/{msgUuid}/chat_feedback
PUT  (same endpoint, if feedback already exists)
```

### Tracking Events
- `claudeai.conversation.feedback.sent` -- feedback submission
- `claudeai.message.user_triggered_retry` -- retry click (version 3)
- `claudeai.message.edited` -- edit action
- `claudeai.message.sent` -- message send

---

## 11. Link Handling

### In Markdown Messages
Links in markdown are rendered with:
```javascript
linkTarget = "_blank"  // default
```

All links in assistant messages open in a new tab (`target="_blank"`).

### URL Safety
The `hxe` function (default `urlTransform` from react-markdown) allows only:
- `https`, `http`, `ircs`, `mailto`, `xmpp` protocols
- `computer://` and `tel:` are explicitly allowed in the custom transform

### Desktop App Behavior (`W_` / `DesktopSafeLink`)
Two behaviors based on platform:
- `"new-tab"` web behavior: `target="_blank"`
- `"open-in-browser"` desktop behavior: uses `H_()` to construct external URL
- `"navigate"` desktop behavior: same-window navigation

### External Link Attributes
Static links in the UI use: `target="_blank" rel="noopener noreferrer"`
Some use just `rel="noreferrer"`.

### Link Click Tracking
The `onLinkClick` callback is passed through the markdown pipeline. The `onLinkDetected` callback sets a `hasLink` feature flag per message.

### URL Preview / Embed
No URL preview cards or embeds are generated in the message stream. Links are plain `<a>` tags.

### Image Links
Markdown images (`<img>`) have an `onClick` handler that opens the `src` URL in a new window: `window.open(src, "_blank", "noopener,noreferrer")`.

---

## 12. Tables and Structured Content

### Markdown Tables
Tables in markdown are rendered by `react-markdown`'s default table handling (standard GFM tables). The elements `table`, `thead`, `tbody`, `tr`, `th`, `td` are all allowed through DOMPurify sanitization.

### Table Tracking
The `aPe` streaming block splitter tracks table state:
```javascript
// Table detection in the streaming paragraph splitter:
if (line.includes("|") && !this.inCodeBlock) {
  this.inTable = true;
} else if (this.inTable && trimmedLine === "") {
  this.inTable = false;
}
```
This prevents paragraph splitting in the middle of a table during streaming.

### No Special Table Features
Tables do not have:
- Sorting
- Column resizing
- Horizontal scrolling wrappers (they can overflow the container)
- Sticky headers

Tables are plain HTML rendered from GFM pipe syntax.

### Allowed HTML Elements (DOMPurify)
The sanitizer allows these table-related tags: `table`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td`, `caption`.

### Diff View Tables
Separate from markdown tables, the diff viewer uses a sophisticated table-like display:
- Unified and split view modes (`viewMode: "unified" | "split"`)
- Line numbers, add/remove indicators
- Syntax highlighting on diff content
- Expand up/down for context
- Review comments and drafts per line
- Toggle between unified and split via button

---

## 13. Artifact System

### Artifact Content Types (`P6` enum)
```javascript
Text = "text/plain"
Markdown = "text/markdown"
Html = "text/html"
Code = "application/vnd.ant.code"
Svg = "image/svg+xml"
Mermaid = "application/vnd.ant.mermaid"
React = "application/vnd.ant.react"
```

### Artifact Detection and Parsing
Artifacts are extracted from `tool_use` blocks with `name === "artifacts"`:
```javascript
{ command: "create"|"update"|"rewrite",
  id, type, title, language, content,
  old_str, new_str, md_citations, source }
```

### Artifact Rendering Sandbox
Artifacts render in a sandboxed iframe communicating via `postMessage`:
```javascript
// Message types (uDe enum):
ReadyForContent, SetContent, GetFile,
SendConversationMessage, RunCode, ClaudeCompletion,
ReportError, GetScreenshot, BroadcastContentSize,
OpenExternal, DownloadFile, CopyHtmlContent,
TrackInteraction, ProxyFetch, ProxyFetchStream,
GetDOMSnapshot, DOMContentLoaded,
StorageGet, StorageSet, StorageDelete, StorageList
```

### Markdown Artifact Display
Markdown artifacts render in: `font-claude-response mx-auto w-full max-w-3xl leading-[1.65rem] px-6 pt-4 md:pt-6 md:px-11` with `Nwe` (StandardMarkDown) using `normalizationMode: "markdown-document"`.

---

## 14. Additional Content Types

### Voice Messages
- `voice_note` and `bell` content types are filtered out from visual rendering
- Voice mode uses WebSocket with Opus encoding at 16kHz

### Token Budget Blocks
`token_budget` blocks are handled in the timeline but not rendered visually to the user.

### Process Group Markers
`process_group_marker` blocks are used for timeline grouping logic but not rendered.

### Elicitation Widgets
MCP elicitation renders as interactive forms (`eke` / `CommandElicitationBanner`) with radio buttons for options and submit/decline/cancel actions.

### REPL Output
Code execution results show in a collapsible section:
- Markdown content for `.md` output files
- Syntax-highlighted code blocks for other content
- ANSI escape code rendering for terminal output

### File Cards (`present_files`)
Tool results of type `present_files` extract `local_resource` entries to display file cards with paths.

---

## 15. Content Block Streaming Protocol

### SSE Event Types
```
message_start        -> Initialize message, set model
content_block_start  -> Create new block (text, thinking, tool_use)
content_block_delta  -> Append to block (text_delta, thinking_delta,
                        citation_start_delta, citation_end_delta,
                        thinking_summary_delta, thinking_cut_off_delta,
                        input_json_delta, tool_use_block_update_delta)
content_block_stop   -> Finalize block (add stop_timestamp, buffered_input)
message_stop         -> Mark model as done
mcp_auth_required    -> Trigger MCP auth flow
```

### Block Index Handling
The smoother tracks `blockIndexOffset` and `serverIndexBase` to handle multiple message_start events in a single stream (e.g., when appending to existing content).

---

## 16. DOMPurify Sanitization

### Allowed Elements
The full set includes: `a`, `abbr`, `address`, `article`, `aside`, `audio`, `b`, `bdi`, `bdo`, `big`, `blockquote`, `body`, `br`, `button`, `canvas`, `caption`, `center`, `cite`, `code`, `col`, `colgroup`, `content`, `data`, `datalist`, `dd`, `del`, `details`, `dfn`, `dialog`, `div`, `dl`, `dt`, `em`, `fieldset`, `figcaption`, `figure`, `footer`, `form`, `h1`-`h6`, `header`, `hr`, `i`, `img`, `input`, `ins`, `kbd`, `label`, `legend`, `li`, `main`, `mark`, `meter`, `nav`, `ol`, `optgroup`, `option`, `output`, `p`, `picture`, `pre`, `progress`, `q`, `ruby`, `s`, `samp`, `section`, `select`, `small`, `source`, `span`, `strong`, `strike`, `style`, `sub`, `summary`, `sup`, `table`, `tbody`, `td`, `template`, `textarea`, `tfoot`, `th`, `thead`, `time`, `tr`, `track`, `u`, `ul`, `var`, `video`, `wbr`.

### MathML Support
MathML elements are allowed for KaTeX output: `math`, `menclose`, `merror`, `mfenced`, `mfrac`, `mi`, `mn`, `mo`, `mover`, `mroot`, `mrow`, `ms`, `mspace`, `msqrt`, `mstyle`, `msub`, `msup`, `msubsup`, `mtable`, `mtd`, `mtext`, `mtr`, `munder`, `munderover`.
