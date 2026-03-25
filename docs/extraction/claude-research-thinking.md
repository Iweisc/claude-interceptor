# Claude.ai Frontend Bundle Research: Deep Research, Extended Thinking, Analysis Tool

**Bundle:** `index-DcrCrePJ.js` (7.2 MB minified)
**Date:** 2026-03-22

---

## 1. Deep Research / Compass Mode

### 1.1 Internal Codename

"Compass" — the feature flag and internal name is `compass_mode`. The integration name is `"compass"`.

### 1.2 compass_mode Values

```js
Tre = "advanced"         // compass mode is ON (deep research enabled)
// null / undefined      // compass mode is OFF
```

The constant `Tre` is defined:
```js
Tre = "advanced"
```

And checked via:
```js
function Rre(e) { return e === Tre }  // returns true if compass_mode === "advanced"
```

### 1.3 How compass_mode Is Set

Compass mode is a **conversation setting** (stored in `conversationSettings`), toggled via the `toggleConversationSetting` function from a settings coordinator:

```js
toggleResearchMode: e => {
  if (!e) return void t("compass_mode", null);
  // If web search is not already enabled and can be auto-enabled:
  s ? (n({enabled_web_search: true, compass_mode: Tre}),
       d(u.formatMessage({defaultMessage: "Web search enabled automatically for Research", id: "ss4xBdPHtN"})))
    : t("compass_mode", Tre)
}
```

**Key behavior:** When research mode is toggled ON, web search (`enabled_web_search`) is automatically enabled if it was not already on. A toast notification says "Web search enabled automatically for Research".

### 1.4 Research Mode in Message Metadata

When a message is sent, `compass_mode` is stored in the message metadata:

```js
metadata: { compass_mode: c }
```

And when logged for analytics:
```js
research_mode: "advanced" === c?.compass_mode ? "advanced" : "disabled"
```

### 1.5 Compass Mode is Per-Conversation + Per-Message

- Stored in `conversationSettings` (persists for the conversation)
- Also attached to each message's metadata for retries/edits
- On model switch, if the new model doesn't support compass, it's cleared:
  ```js
  G(e.model) || Y("compass_mode", null)
  ```

### 1.6 Model Capability Check

The model schema includes:
```js
capabilities: {
  mm_pdf: boolean,
  mm_images: boolean,
  web_search: boolean,
  gsuite_tools: boolean,
  compass: boolean           // <-- model must have this to enable research
}
```

### 1.7 Task Status System

#### 1.7.1 Task Status Enum (`dd`)

```js
dd = (e => (
  e.Starting = "starting",
  e.Planning = "planning",
  e.InitiatingAgents = "initiating_agents",
  e.Searching = "searching",
  e.CreatingArtifact = "creating_artifact",
  e.Completed = "completed",
  e.Cancelled = "cancelled",
  e.TimedOut = "timed_out",
  e.Failed = "failed",
))(dd || {})
```

#### 1.7.2 "In Progress" vs "Completed" Check

```js
const ud = ["starting", "planning", "initiating_agents", "searching", "creating_artifact", "completed"];

// pd() returns true if the task is still "in progress" (not completed/failed/cancelled/timed_out)
pd = e => void 0 !== e && ["starting", "planning", "initiating_agents", "searching", "creating_artifact"].includes(e)
```

So:
- **In-progress statuses:** `starting`, `planning`, `initiating_agents`, `searching`, `creating_artifact`
- **Terminal statuses:** `completed`, `cancelled`, `timed_out`, `failed`

#### 1.7.3 Task ID Extraction

The task ID is extracted from the chat message content:
```js
const x7 = ft(e => {
  if ("string" == typeof e) try { return JSON.parse(e) } catch {}
  return e
}, n({ task_id: r() }))
```

#### 1.7.4 Task Status Polling

**Polling endpoint:**
```
GET /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/task/{taskId}/status
```

For shared snapshots:
```
GET /api/organizations/{orgUuid}/chat_snapshots/{conversationUuid}/task/{taskId}/status
```

**Polling hook (`Bbt`):**
```js
function Bbt({ organizationUuid: e, conversationUuid: t, taskId: n, isShared: s, enabled: a }) {
  const [r, i] = d.useState(true),   // polling enabled
        [, o] = d.useState(0),
        l = qx("use_confused_carousel_sounds", "polling", zbt, Pbt),
        c = l[0]?.intervalSeconds ?? 30,    // DEFAULT POLLING INTERVAL: 30 seconds
        [u, p] = d.useState(c),
        // ...
        g = gT(),                           // load shed controls
        x = s
          ? `/api/organizations/${e}/chat_snapshots/${t}/task/${n}/status`
          : `/api/organizations/${e}/chat_conversations/${t}/task/${n}/status`,
        { data: b, isLoading: y, error: v } = Kh(x, {
          refetchInterval: !!r && 1000 * u,   // poll at `u` seconds interval (default 30s)
          enabled: Boolean(a && t && e && n && !g.claudeai_compass_task_polling),
          meta: { noToast: true }
        }),
        C = void 0 !== b?.status && !pd(b?.status)  // completed = status exists AND not in-progress
}
```

**Key points:**
- Default polling interval: **30 seconds** (from `intervalSeconds ?? 30`)
- Interval is configurable via a remote config key `"use_confused_carousel_sounds"` > `"polling"`
- Load-shed flag `claudeai_compass_task_polling` can disable client-side polling entirely
- Polling stops when task reaches a terminal status

#### 1.7.5 Stop Research / Cancel Task

```js
Vet = ({ conversationId: e, taskId: t }) => {
  const [s, a] = d.useState(false),
        { mutate: r, isPending: i } = ((e, t) => {
          const { activeOrganization: n } = my(), s = n?.uuid;
          return Hh(
            `/api/organizations/${s}/chat_conversations/${e}/task/${t}/stop`,
            "POST",
            { enabled: Boolean(s && e && t) }
          );
        })(e, t ?? ""),
```

**Cancel endpoint:**
```
POST /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/task/{taskId}/stop
```

A confirmation modal appears: "Want to stop researching?" with options "Stop research" (danger) and "Keep researching" (secondary).

### 1.8 UI State Transitions

The send button area shows different states:

```js
if (p) return "researching"   // p = currentCompassTask exists
// ...
"researching" === k ? u.jsx(Vet, { conversationId: r?.id, taskId: p }, "stop_research")
```

**Send button states:**
1. `"sampling"` / `"stopping"` — Normal streaming
2. `"researching"` — Research task is active; shows "Stop research" button
3. `"empty"` — No content, shows send/dictation button

**Message shimmer/animation states:**
```js
bt = d.useMemo(() =>
  ut ? "thinking" :
  pt || xt || J && r ? "shimmer" :
  r ? "writing" :
  "static"
)
```

Where `xt` = `Boolean(e && !e.is_error && pd(gt?.status)) && !b7(pe)` (research is in progress).

### 1.9 Research Results UI

Research results are displayed in a **side panel** (`qvt` component) which shows:

1. **Main research panel** (`Vvt`) with:
   - `compassStatus` object containing agents, sources, status
   - Agent name from first agent: `Ubt = e => e?.agents?.[0]?.name`

2. **Source count display** (`zvt`):
   ```js
   function zvt({ compassStatus: e, onOpenSources: t }) {
     if (!e.total_sources) return null;
     // Shows total source count
   }
   ```

3. **Agent snippets** (`Bvt`):
   ```js
   function Bvt({ title, description, numSources, onClick, complete }) {
     // Shows per-agent snippets with source counts
     // "No sources yet" or "{totalSources, plural, one {# source} other {# sources}}"
   }
   ```

4. **Sources detail panel** (`Hvt`) — opened via handleOpenSources, shows per-agent detail

The side panel is opened when selecting a compass item:
```js
"compass" === f?.type ? u.jsx(qvt, { data: f.data, onClose: t })
```

### 1.10 Auto-disable Compass When All Tools Off

If the last tool is being toggled off and compass mode is on, compass mode is automatically disabled:
```js
function Dre({ remainingToolCount: e, compassMode: t }) {
  return 0 === e && Rre(t)  // if no tools left and compass is on
}
```

### 1.11 Required Integrations

The codebase lists many prompt suggestions that require `["compass"]` integration, showing that research mode has predefined prompt templates.

### 1.12 Compass Task Data in Store

```js
currentCompassTask: void 0,
setCurrentCompassTask: t => e({ currentCompassTask: t })
```

The compass task is stored in the chat input store context, set when research is initiated.

---

## 2. Extended Thinking / Paprika Mode

### 2.1 Internal Codename

"Paprika" — the internal setting name is `paprika_mode`.

### 2.2 paprika_mode Values

```js
"extended"    // Extended thinking is ON
null          // Thinking is OFF (instant mode)
```

The mode enum `ld` is used for both paprika_modes and thinking_modes on model configs.

### 2.3 Model Schema for Thinking

```js
{
  model: string,
  name: string,
  // ...
  paprika_modes: [ld],           // Array of supported thinking modes (e.g. ["extended"])
  thinking_modes: [{
    id: string,
    title: string,
    description: string,
    mode: ld | null,             // The paprika mode value (e.g. "extended" or null)
    selection_title: string,
    is_default: boolean
  }],
  capabilities: {
    mm_pdf: boolean,
    mm_images: boolean,
    web_search: boolean,
    gsuite_tools: boolean,
    compass: boolean
  }
}
```

### 2.4 How Thinking Mode Is Set

Paprika mode is a **conversation setting**, toggled via:

```js
const o = d.useCallback(e => {
  n ? n.onToggle() : r("paprika_mode", t === e ? null : e)
}, [t, r, n])
```

On model switch, if new model doesn't support current paprika mode, it's adjusted:
```js
const t = L.find(t => t.model === e.model)?.paprika_modes;
const n = t?.find(e => e === V) ?? null;
Y("paprika_mode", n)
```

### 2.5 Auto-Enable Extended Thinking

There is logic to auto-enable extended thinking in certain contexts (e.g., cowork):
```js
d.useEffect(() => {
  i && "extended" !== t && r("paprika_mode", "extended")
}, [i, t, r])
```

### 2.6 Keyboard Shortcut

Extended thinking has a keyboard shortcut binding:
```js
const { matchShortcut: t } = XP("extended_thinking");
d.useEffect(() => {
  if (!e) return;
  const n = n => {
    if (t(n)) return n.preventDefault()
    // toggles paprika_mode
  }
})
// And:
oe("paprika_mode", le ? null : "extended")  // Toggle on/off
```

### 2.7 Thinking Toggle in UI (Q9e)

```js
const Q9e = ({ currentModel: e, currentMode: t, coworkExtendedThinkingToggle: n }) => {
  const s = L(),
        { modes: a } = Y9e(e),
        { toggleConversationSetting: r } = j1({ source: "thinkingMenu" }),
        i = ZD();
  // Renders thinking mode options
}
```

It appears inside the model selector menu:
```js
(!N || v) && u.jsx(Q9e, {
  currentModel: A,
  currentMode: V,          // V = _1("paprika_mode")
  coworkExtendedThinkingToggle: v
})
```

### 2.8 Y9e — Thinking Mode Config Resolver

```js
Y9e = (e, t) => {
  const { allModelOptions: n } = MQ(), s = L()
  // Resolves available thinking modes for current model
  // Returns { modes, activeMode }
}
```

Returns the `activeMode` with its label, used to display in the model selector.

### 2.9 Thinking Block Content Structure

The thinking content block has this structure:
```js
{
  type: "thinking",
  thinking: string,           // The thinking text content
  start_timestamp: string,    // ISO timestamp when thinking started
  stop_timestamp: string,     // ISO timestamp when thinking stopped
  cut_off: boolean,           // Whether thinking was truncated
  summaries: [{               // Array of summaries
    summary: string           // Summary text
  }]
}
```

### 2.10 Streaming Delta Types

```js
case "thinking":
  switch (n.delta.type) {
    case "thinking_delta":
      return { ...s, thinking: s.thinking + n.delta.thinking }
    case "thinking_cut_off_delta":
      return { ...s, cut_off: n.delta.cut_off }
  }
```

Also: `"thinking_summary_delta"` — separate delta type for summaries.

### 2.11 Thinking Block Rendering (dFe)

```js
dFe = d.memo(({
  index: e,
  text: t,                    // thinking text
  cutOff: n = false,          // was thinking cut off?
  startTimestamp: s,
  stopTimestamp: a,
  isStreaming: r,
  mostRecentSummary: i,       // Latest summary for collapsed view
  onToggle: o,
  messageUuid: l,
  isFirstBlockOfMessage: c,
  isLastBlockOfMessage: p,
  renderMode: m,
  isFirstItemInGroup: h,
  isLastItemInGroup: f,
  conversationUuid: g
}) => {
```

**Feature flags for thinking UX:**
```js
const sFe = n({
  enabled: s(),
  fallback_summary_debounce_ms: c(),   // default 2000
  fallback_summary_min_len: c(),       // default 50
  fallback_summary_max_len: c(),       // default 100
  fallback_summary_regex: r()          // default ".*(\\n|\\.(\\s|$)|。)"
})
const aFe = {
  enabled: false,
  fallback_summary_debounce_ms: 2000,
  fallback_summary_min_len: 50,
  fallback_summary_max_len: 100,
  fallback_summary_regex: ".*(\\n|\\.(\\s|$)|。)"
}
```

### 2.12 Thinking Duration Display

```js
function rFe(e, t) {     // e=startTimestamp, t=stopTimestamp
  if (!e) return;
  const n = (t ? U.fromISO(t) : U.now()).diff(U.fromISO(e), ["hours", "minutes", "seconds"]);
  return n.toMillis() < 0 ? is.fromMillis(0) : n;
}
```

Rendered via `cFe`:
```js
const cFe = d.memo(function({ startTimestamp: e, stopTimestamp: t, isStreaming: n = false }) {
  const [s, a] = d.useState(() => rFe(e, t));
  // If streaming, poll every 1 second:
  return d.useEffect(() => {
    let t;
    return n && (t = setInterval(() => a(rFe(e)), 1000)), () => clearInterval(t);
  }, [n, e]),
  s ? u.jsx(nFe, { value: s, listStyle: "narrow", unitDisplay: "narrow", maximumFractionDigits: 0 }) : null
})
```

**Display format:** Uses Intl.DurationFormat-style formatting with narrow units (e.g. "42s", "1m 23s").

The duration display appears after **10 seconds** of thinking:
```js
const E = Boolean(s && a && !S.current);
const [A, T] = d.useState(() => {
  let e = false;
  if (E) {
    const t = rFe(s, a);
    e = !!t && t.as("milliseconds") >= 10000  // >= 10 seconds
  }
  return e
});
d.useEffect(() => {
  let e;
  return r && (e = setTimeout(() => T(true), 10000)), () => clearTimeout(e);
}, [r])
```

### 2.13 Thinking Block Collapse/Expand

- Collapsed by default (uses `Vke` hook for expand/collapse state)
- Shows the `mostRecentSummary` or fallback summary when collapsed
- When streaming: shows "Thinking..." then transitions to summary text with animation
- When completed: shows "Thought process" or summary
- Labels:
  - Streaming: `"Thinking..."` (id: "QrZMdiKa7h")
  - Static: `"Thinking"` (id: "AHQWDTo4+e")
  - Expanded header: `"Thought process"` (id: "zl6fNbo7RW")
- Cut-off warning: "The rest of the thought process is not available for this response."

### 2.14 Thinking Content Rendering

When expanded, thinking text is rendered via:
```js
const lFe = ({ text: e, cutOff: t }) => u.jsxs("div", {
  className: "text-text-300 text-sm font-normal gap-0.5 relative font-claude-response",
  children: [
    u.jsx(Nwe, { className: "p-3 pt-0 pr-8", text: e }),  // Markdown-rendered thinking
    true !== t ? null : u.jsx(oFe, {})                      // Cut-off warning
  ]
})
```

### 2.15 Thinking in Analytics

When sending a message:
```js
thinking_mode: "extended" === c?.paprika_mode ? "enabled" : "disabled"
```

### 2.16 Rate Limiting

Specific error handling for thinking:
```js
"thinking_messages_rate_limit_exceeded" === t.errorCode
  ? e("You've reached your weekly limit for thinking messages. Please try again next week.")
```

### 2.17 Redacted Strings System

The thinking UX uses obfuscated config keys via `iW()`:
```js
rW = "golden_river_cascade";
function iW() {
  const e = Fx("apps_redacted_strings_paprika"),
        // ...many redacted string configs
}
```

Thinking mode labels in the i18n system:
```js
copper_sunrise_meadow: "Auto thinking"
silver_mountain_stream: "Match thinking to complexity"
golden_forest_whisper: "Extended thinking"
amber_river_echo: "Think longer for complex tasks"
crystal_lake_dawn: "Instant"
midnight_cloud_drift: "Respond right away"
crimson_peak_summit: "Extended"
```

### 2.18 Thinking Modes in UI

Full thinking mode options from i18n:
```js
thinking_mode_extended_title: "Extended thinking"
thinking_mode_extended_description: "Think longer for complex tasks"
thinking_mode_extended_selection_title: "Extended"

// Modes offered:
// 1. "Auto thinking" — "Match thinking to complexity"
// 2. "Extended thinking" — "Think longer for complex tasks"
// 3. "Instant" — "Respond right away"
```

### 2.19 paprika_mode in API Requests

Sent in the completion request body:
```js
e.paprika_mode && (t.paprika_mode = e.paprika_mode)
```

Also sent in the retry/create conversation flow:
```js
paprikaMode: a.paprika_mode ?? void 0
```

---

## 3. Analysis Tool / Code Execution

### 3.1 Internal Codename

**"Monkeys in a Barrel"** = the analysis tool / code execution / wiggle feature
- Setting key: `enabled_monkeys_in_a_barrel`
- Feature preview image: `"wiggle"`

### 3.2 Feature Flag & Experiment

```js
const { value: n, source: s } = y2(e ?? {})
// y2 reads:
Gx("frontend", "analysis_tool_experiment_enabled", false, Hx)
```

Additionally:
```js
t = Bx("claudeai_analysis_tool_allowed")
```

### 3.3 Analysis Tool Description (i18n)

```js
analysis_tool_title: "Analysis tool"
analysis_tool_description: "Claude can write and run code to process data, run analysis, and produce data visualizations in real time."
analysis_tool_short_description: "Upload CSVs for Claude to analyze quantitative data with high accuracy and create interactive data visualizations."
```

### 3.4 Wiggle = Code Execution Sandbox

The analysis tool uses **"wiggle"** as the code execution sandbox:
- `wiggleEnabled` — property on the chat context
- `onOpenWiggleFile` — handler for opening files created by the sandbox
- `enabled_monkeys_in_a_barrel` — the user-facing toggle setting

File download from wiggle:
```js
R = tDe(), // wiggle file download hook
O = d.useCallback(e => {
  E?.uuid && R(p
    ? { filepaths: e, orgUuid: E?.uuid, snapshotUuid: c, isShared: true, source: "wiggle_file_card_download_all" }
    : { filepaths: e, orgUuid: E?.uuid, conversationUuid: c, isShared: false, source: "wiggle_file_card_download_all" })
}, [E?.uuid, p, c, R])
```

### 3.5 Wiggle Graduation Status

```js
r = Bx("wiggle_graduated")   // Feature flag for whether wiggle has "graduated" from preview
```

### 3.6 Feature Preview Toggle

```js
"enabled_monkeys_in_a_barrel" === e && l
  // Shows: "Code execution and file creation"
  // Description: "Claude can execute code and create and edit docs, spreadsheets, presentations, PDFs, and data reports."
```

### 3.7 Mutual Exclusion with Artifact Attachments

When enabling monkeys_in_a_barrel:
```js
i({ [e]: o,
  ..."enabled_monkeys_in_a_barrel" === e && o && {
    enabled_artifacts_attachments: false,
    preview_feature_uses_artifacts: true
  },
  ..."enabled_artifacts_attachments" === e && o && {
    enabled_monkeys_in_a_barrel: false
  }
})
```

**Analysis tool and artifact attachments are mutually exclusive.**

### 3.8 Wiggle Egress Settings

When wiggle is enabled, there are network egress controls:
```js
h = Bx("claudeai_wiggle_egress_settings")
// Shows: "This feature gives Claude internet access to create and analyze files, which has security risks."
// With allowed hosts configuration UI
```

### 3.9 Analysis Tool Availability Check

```js
function y2(e) {
  // Checks analysis_tool_experiment_enabled flag
  // AND checks if monkeys_in_a_barrel is enabled in settings
  // OR if disabled_by_user but enabled_monkeys_in_a_barrel in settings
  return !!s.isAvailable || (!("disabled_by_user" !== s.status || !e?.settings?.enabled_monkeys_in_a_barrel) || n)
}
```

### 3.10 Status Values for Analysis Tool Availability

```js
// SZ() returns status:
"blocked_by_org_admin"
"blocked_by_entitlement"
"blocked_by_platform"
"disabled_by_user"
"isAvailable"
```

### 3.11 Turmeric = Artifact Rendering Engine

```js
J = Bx("apps_use_turmeric")     // Feature flag for turmeric (artifact rendering)
enabled_turmeric                  // Another feature preview toggle
```

Turmeric appears to be the sandbox/rendering engine for artifacts.

### 3.12 Tool Type for REPL

```js
s && t.push({ type: "repl_v0", name: "repl" })
```

The REPL tool is pushed alongside artifacts:
```js
t.push({ type: "artifacts_v0", name: "artifacts" })
```

---

## 4. Tool Toggle UI

### 4.1 Conversation Settings (All Toggleable Settings)

The full list of conversation settings that are synced:
```js
const Yc = ["paprika_mode", "compass_mode"]

// Tool-related settings:
const settingsKeys = [
  "enabled_web_search",
  "enabled_bananagrams",       // Google Drive search
  "enabled_sourdough",         // Gmail search
  "enabled_foccacia",          // Google Calendar search
  "enabled_mcp_tools",         // MCP connector tools (object: { [serverUuid]: boolean })
  "paprika_mode",              // Extended thinking
  "tool_search_mode",          // MCP tool search mode ("auto" or "off")
  "compass_mode",              // Deep research
]
```

### 4.2 Codename Mapping

| Codename | Feature |
|----------|---------|
| `enabled_web_search` | Web search |
| `enabled_bananagrams` | Google Drive search |
| `enabled_sourdough` | Gmail search |
| `enabled_foccacia` | Google Calendar search |
| `enabled_mcp_tools` | MCP connector tools |
| `enabled_monkeys_in_a_barrel` | Analysis tool / code execution (wiggle) |
| `enabled_imagine` | Image generation |
| `enabled_turmeric` | Turmeric (artifact rendering) |
| `enabled_artifacts_attachments` | Artifact attachments (older feature) |
| `preview_feature_uses_artifacts` | Artifacts enabled |
| `preview_feature_uses_latex` | LaTeX rendering |
| `preview_feature_uses_citations` | Citations |
| `tool_search_mode` | MCP tool search auto-loading |

### 4.3 Feature Preview Image Mapping

```js
const xle = {
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

### 4.4 Tool Menu Items

The model selector / tool menu includes these items:
1. **Web search** — Toggle switch, uses `Jre` / `kre` for availability check
2. **Google Drive search** — Toggle, requires Drive auth
3. **Google Calendar** — Toggle, requires Calendar auth
4. **Gmail search** — Toggle, requires Gmail auth
5. **MCP connector tools** — Per-server toggles
6. **Research mode** — Special toggle that enables compass_mode + auto-enables web search
7. **Tool search mode** — Sub-menu with "Load tools when needed" vs "Tools already loaded"

### 4.5 Tool Count for Analytics

```js
function Ore({ toolToIgnore: e, currentStates: { enabled_web_search, enabled_bananagrams, enabled_sourdough, enabled_foccacia, enabled_mcp_tools } }) {
  // Counts how many tools are currently enabled
  let n = 0;
  enabled_web_search && n++;
  enabled_bananagrams && n++;
  enabled_sourdough && n++;
  enabled_foccacia && n++;
  enabled_mcp_tools && Object.values(enabled_mcp_tools).some(e => !!e) && n++;
  return n;
}
```

### 4.6 Tools Sent to API

Web search tool type is configurable:
```js
d && e?.enabled_web_search && t.push({
  type: n?.dream_circuit_wave || "",    // Obfuscated web search tool type
  name: d                               // Obfuscated web search tool name
})
t.push({ type: "artifacts_v0", name: "artifacts" })
s && t.push({ type: "repl_v0", name: "repl" })
r && t.push({ type: "project_knowledge_search", name: "project_knowledge_search" })
// Plus MCP tools, suggested connectors, etc.
```

### 4.7 Tool Search Mode

```js
h = (() => {
  const t = "off" === (_1("tool_search_mode") ?? "auto") ? "off" : "on";
  // Default is "auto" which maps to "on"
  // Options:
  // "on" — "Load tools when needed" / "Chats compact less since tools aren't pre-loaded."
  // "off" — "Tools already loaded" / "Chats compact more often since tools are always there."
})
```

---

## 5. Model-Specific Capabilities

### 5.1 Model Schema

```js
{
  model: string,
  name: string,
  name_i18n_key: string?,
  description: string?,
  description_i18n_key: string?,
  notice_text: string?,
  notice_text_i18n_key: string?,
  inactive: boolean?,
  overflow: boolean?,
  knowledgeCutoff: string?,
  slow_kb_warning_threshold: number?,
  paprika_modes: [ld]?,              // Array of supported thinking modes
  thinking_modes: [{                  // Detailed thinking mode configs
    id: string,
    title: string,
    description: string,
    mode: ld | null,
    selection_title: string?,
    is_default: boolean?
  }]?,
  capabilities: {
    mm_pdf: boolean?,               // PDF upload support
    mm_images: boolean?,            // Image upload support
    web_search: boolean?,           // Web search support
    gsuite_tools: boolean?,         // Google Workspace tools
    compass: boolean?               // Deep research support
  }?
}
```

### 5.2 Capability Checks in UI

- **Thinking toggle:** Hidden when model has no `paprika_modes` (e.g., Haiku)
  ```js
  (!N || v) && u.jsx(Q9e, { currentModel: A, currentMode: V })
  ```
- **Research mode:** Only available when `capabilities.compass` is true
- **Web search:** Checked via `SQ()(e, "web_search")` — model must have `capabilities.web_search`
- **GSuite tools:** Checked via `SQ()(e, "gsuite_tools")` — model must have `capabilities.gsuite_tools`

### 5.3 Model-Switch Behavior

When switching models:
```js
// Adjust thinking mode to what new model supports:
const t = L.find(t => t.model === e.model)?.paprika_modes;
const n = t?.find(e => e === V) ?? null;
Y("paprika_mode", n);

// Clear compass if new model doesn't support it:
G(e.model) || Y("compass_mode", null);
```

### 5.4 Model Descriptions (i18n)

```js
"opus-current-gen-description": "Most capable for ambitious work"
"opus-current-gen-notice": "Opus consumes usage limits faster than other models"
"sonnet-current-gen-description": "Most efficient for everyday tasks"
"haiku-current-gen-description": "Fastest for quick answers"
```

---

## 6. Prompt Improvement

### 6.1 Streaming Improvement Endpoint

```js
const d = `/api/organizations/${e?.uuid}/prompt/improve/stream`
```

### 6.2 State Management

```js
// In store:
isImprovingPrompt: false,
setIsImprovingPrompt: t => e({ isImprovingPrompt: t })

// In context:
improvePrompt: () => {},
isImprovingPrompt: false,
```

### 6.3 Keyboard/Action Trigger

The prompt improvement is callable via:
```js
case "improvePrompt": nt()  // Action handler
```

And exposed in the chat context:
```js
improvePrompt: nt,
isImprovingPrompt: tt,
```

### 6.4 API Call

It's a streaming POST to `/api/organizations/{orgUuid}/prompt/improve/stream` which returns improved prompt text streamed back to replace the user's input.

---

## 7. Conversation Settings Sent on Create/Append

### 7.1 Create Conversation Parameters

```js
const E = {
  name: v ?? "",
  model: s,
  project_uuid: d,
  include_conversation_preferences: h,
  paprika_mode: x,
  compass_mode: b,
  create_mode: y,
  is_temporary: C,
  enabled_imagine: S,
  orbit_action_uuid: N
}
```

### 7.2 Conversation Settings Object

```js
const n = {
  enabled_web_search: j,
  enabled_mcp_tools: M,
  enabled_imagine: S,
  paprika_mode: x,
  compass_mode: b
}
```

### 7.3 Message Send Analytics

```js
L({
  conversation_uuid: t,
  message_length: 0,
  message_index: o,
  is_new_conversation: false,
  is_retry: true,
  is_incognito: l,
  is_yukon_gold: false,
  document_attachment_count: 0,
  image_attachment_count: 0,
  thinking_mode: "extended" === c?.paprika_mode ? "enabled" : "disabled",
  research_mode: "advanced" === c?.compass_mode ? "advanced" : "disabled",
  tool_count: u,
  enabled_web_search: c?.enabled_web_search ?? false,
  used_inline_conversation_create: false
})
```

---

## 8. Summary of Key Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `Tre` | `"advanced"` | compass_mode value for "research on" |
| `paprika_mode` | `"extended"` | paprika_mode value for "thinking on" |
| `"enabled_monkeys_in_a_barrel"` | boolean | Analysis tool / wiggle enabled |
| Default polling interval | `30` seconds | Compass task status polling |
| Thinking duration threshold | `10000` ms | Show duration after 10s of thinking |
| Fallback summary debounce | `2000` ms | Wait 2s before generating fallback summary |

## 9. Platform Enum

```js
cd = {
  UNKNOWN: "unknown",
  ANDROID: "android",
  IOS: "ios",
  DESKTOP_APP: "desktop_app",
  WEB_CLAUDE_AI: "web_claude_ai",
  WEB_CONSOLE: "web_console",
  WEB_CUSTOM_AGENTS: "web_custom_agents"
}
```

## 10. Task Status Values (MCP Protocol)

From the MCP protocol schema embedded in the bundle:
```js
bB = ne(["working", "input_required", "completed", "failed", "cancelled"])

yB = {
  taskId: string,
  status: bB,           // "working" | "input_required" | "completed" | "failed" | "cancelled"
  ttl: number | null,
  createdAt: string,
  lastUpdatedAt: string,
  pollInterval: number?,
  statusMessage: string?
}
```

MCP task methods:
- `tasks/get` — Get task status
- `tasks/result` — Get task result
- `tasks/list` — List tasks
- `tasks/cancel` — Cancel a task
- `notifications/tasks/status` — Task status notification

This is the MCP protocol's task system, distinct from the Compass task system but structurally similar.
