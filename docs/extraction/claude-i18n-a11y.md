# Claude.ai Frontend: Localization, Accessibility, Keyboard & Platform Details

Bundle: `index-DcrCrePJ.js` (7.2 MB, minified)

---

## 1. Localization / i18n

### Translation framework

Uses **react-intl** (FormatJS). All UI strings are wrapped in `<T defaultMessage="..." id="..." />` components or `intl.formatMessage({defaultMessage, id})` calls. Each string has a stable hash-based `id` (e.g. `"gjBiyjshwX"` for "Loading...").

### Supported locales (sent to the model in the completion body)

The allowlist (`cM`) that gates what locale value is accepted in the completion request:

```
en-US, de-DE, fr-FR, ko-KR, ja-JP, es-419, es-ES, it-IT, hi-IN, pt-BR, id-ID
```

Default (`lM`): **`en-US`**

If the user's resolved locale is not in this list, the completion body falls back to `"en-US"`.

### Pseudo-locale / test locales (internal only, behind `$y()` gate)

```
xx-LS  -- "Long stringsSSSSSSSS"
xx-AC  -- "ALL CAPS"
xx-HA  -- "[javascript] prefixed strings"
en-XA  -- accented English
en-XB  -- Bidi English (upside-down)
```

These appear in the Language picker only when internal dev gates are active.

### Additional locale codes found in the bundle

Used for `Intl.DisplayNames`, `Intl.Collator`, and similar browser APIs:

```
de-CH, en-AU, en-CA, en-GB, en-IN, en-NZ, zh-HK, zh-TW, nl-BE, fr-CA
```

### Cron description locale map

For scheduled-task cron rendering:

```js
{
  "en-US": "en", "de-DE": "de", "fr-FR": "fr", "ko-KR": "ko",
  "ja-JP": "ja", "es-419": "es", "es-ES": "es", "it-IT": "it",
  "hi-IN": "en", "pt-BR": "pt_BR", "id-ID": "id"
}
```

### How locale is determined

Resolution function `dM(candidates, supportedLocales)`:

1. Checks `localStorage["spa:locale"]` first (previously chosen locale).
2. Falls through `navigator.languages` (browser preference list).
3. For each candidate, tries exact match, then language-prefix match (e.g. `"fr"` matches `"fr-FR"`).
4. Falls back to `"en-US"`.

```js
const FJt = dM([
  (() => { try { return localStorage.getItem("spa:locale") } catch { return null } })(),
  ...navigator.languages
]);
```

The resolved locale is passed into `<IntlProvider locale={FJt} messages={...}>` at the app root.

### How locale is persisted

- `localStorage["spa:locale"]` stores the user's manual language selection.
- The bootstrap API returns the server-side locale in its response (`/api/bootstrap/{orgId}/app_start` -> `locale` field).
- After language change the app calls `bIe()` mutation (PATCH to the account endpoint) then either sets a `localeOverride` in the Zustand store (for SPA clients) or reloads the page.
- Desktop app is notified: `window.electronIntl?.requestLocaleChange?.(locale)`.

### i18n message loading endpoints

Three JSON files are fetched per locale:

| Endpoint                                | Purpose                                      |
|-----------------------------------------|----------------------------------------------|
| `/i18n/{locale}.json`                   | Public translated strings                    |
| `/i18n/statsig/{locale}.json`           | Strings gated behind Statsig feature flags   |
| `/i18n/{locale}.overrides.json`         | Override translations (non-en-US only)       |
| `/web-api/gated-messages?locale={loc}`  | Server-gated messages (require auth/org)     |

The public messages have `staleTime: Infinity`; gated messages refresh every 5 minutes.

### Language picker UI

The settings menu has a "Language" item. It builds the option list by calling:
```js
Intl.DisplayNames(locale, { type: "language", languageDisplay: "standard" })
```
for each supported locale, then sorts alphabetically using `Intl.Collator`.

### Model name i18n

Model definitions include optional `name_i18n_key`, `description_i18n_key`, and `notice_text_i18n_key` fields for localized model names.

---

## 2. Timezone Handling

### Completion body

The `timezone` field is populated from:
```js
Luxon.DateTime.local().zoneName   // e.g. "America/New_York"
```

Falls back to `undefined` if unavailable. Sent in `fM()` (completion body builder) and also in retry paths.

### Voice mode

Voice WebSocket URL includes timezone from `Intl.DateTimeFormat().resolvedOptions().timeZone`.

### Analytics / Segment

The Segment enrichment plugin also captures timezone via:
```js
Intl.DateTimeFormat().resolvedOptions().timeZone
```

### Scheduled tasks (Orbit)

- Scheduled task settings store `orbit_timezone`.
- Cron schedule conversion uses `new Date().getTimezoneOffset()` for UTC offset math.
- Display uses `Intl.DateTimeFormat(undefined, { timeZoneName: "short" })` for the timezone abbreviation (e.g. "PST").

### Concise mode

A "concise peak" feature activates during Pacific time business hours (Mon-Fri 6am-10am America/Los_Angeles), using:
```js
new Date(date.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
```

### Rate limit reset display

Rate limit reset times use `intl.formatDate(date, { timeZoneName: "short" })` for display.

---

## 3. Accessibility (a11y)

### ARIA attributes used (by frequency)

| Attribute            | Count | Notes                                    |
|----------------------|------:|------------------------------------------|
| `aria-label`         |  348  | Primary labeling mechanism               |
| `aria-hidden`        |  113  | Hide decorative elements                 |
| `aria-expanded`      |   37  | Sidebar, dropdowns, collapsibles         |
| `aria-selected`      |   14  | Tab panels, list items                   |
| `aria-labelledby`    |   14  | Dialog titles, form groups               |
| `aria-live`          |   11  | Status messages, streaming content       |
| `aria-pressed`       |   10  | Toggle buttons (sidebar, settings)       |
| `aria-disabled`      |   10  | Disabled interactive elements            |
| `aria-describedby`   |   10  | Supplementary descriptions               |
| `aria-activedescendant` | 9  | Combobox/listbox focus management       |
| `aria-controls`      |    8  | Linked control relationships             |
| `aria-autocomplete`  |    7  | Input autocomplete hint                  |
| `aria-valuenow/min/max` | 5 each | Progress bars                        |
| `aria-atomic`        |    5  | Live region atomicity                    |
| `aria-orientation`   |    4  | Slider/separator orientation             |
| `aria-checked`       |    4  | Checkboxes, radio buttons                |
| `aria-haspopup`      |    3  | Menu triggers                            |
| `aria-required`      |    2  | Required form fields                     |

### ARIA roles used

| Role            | Count | Where                                        |
|-----------------|------:|----------------------------------------------|
| `status`        |   29  | Rate limit banners, loading states, streaming |
| `option`        |   10  | Dropdown/combobox items                      |
| `presentation`  |    9  | Decorative wrappers                          |
| `button`        |    9  | Non-native button elements                   |
| `listbox`       |    7  | Dropdown lists, command palette              |
| `combobox`      |    7  | Search inputs, model selector                |
| `progressbar`   |    5  | Upload progress, loading                     |
| `menuitem`      |    5  | Context menus, dropdown menus                |
| `group`         |    5  | Message action groups                        |
| `menu`          |    4  | Context menus                                |
| `tablist`/`tab`/`tabpanel` | 3/3/1 | Settings tabs, code viewer        |
| `list`/`listitem` | 3/2 | Sidebar items                              |
| `textbox`       |    2  | Rich text inputs                             |
| `separator`     |    2  | Menu dividers                                |
| `link`          |    2  | Custom link elements                         |
| `banner`        |    2  | Page banners                                 |
| `switch`        |    1  | Toggle switches                              |
| `radiogroup`/`radio` | 1/1 | Radio button groups                      |
| `note`          |    1  | Annotation                                   |
| `img`           |    1  | SVG images                                   |
| `dialog`        |    2  | Modals                                       |

### Screen reader support

- `sr-only` CSS class used for visually hidden text (loading spinners, checkbox labels, footnote headings, status messages).
- `<span className="sr-only">` wraps "Loading..." text on spinners.
- Checkboxes use `<input className="sr-only peer">` pattern (hidden input + styled sibling).
- Toggle switches: `<input className="peer sr-only" role="switch">`.
- Footnote labels: `className: ["sr-only"]` on `<h2>` elements.

### Live regions

- Message streaming area: `aria-live="polite"` with `aria-atomic="false"` -- announces new content incrementally.
- Rate limit banners: `role="status" aria-live="polite"`.
- Sidebar collapse status: `role="status" aria-live="polite"` with `sr-only` text.
- Tool result descriptions: `aria-live="off"` to suppress noisy updates.
- Drag-and-drop: `role="status" aria-live="assertive"` for DnD announcements.
- Ping animation: `aria-hidden="true"` to hide decorative pulse.

### Focus management

- **After sending a message**: Focus returns to the prompt input via `focusInput()` which calls `promptInputRef.current?.focus()`.
- **Modal close**: Saves the trigger element ref (`N.current`), and after close animation returns focus to it (with a 50ms timeout to handle Radix portal cleanup).
- **Sidebar toggle**: Toggle button has `aria-pressed={isExpanded}`.
- **Sidebar collapsed**: Content gets `aria-hidden={!isExpanded}` and `inert={!isExpanded}` to trap focus out of hidden sidebar.
- **Modal**: `onEscapeKeyDown` handler, `onInteractOutside` handler, configurable `autoFocusOnOpen` and `returnFocusOnClose`.
- **Motion reduce**: Spinners use `motion-reduce:animate-[spin_1.5s_linear_infinite]` and ping uses `motion-reduce:animate-none`.

---

## 4. Keyboard Shortcuts

### Shortcut system

Custom hook `XP(shortcutName)` that:
1. Detects Mac vs non-Mac via `uk()` (regex: `/(macintosh|macintel|macppc|mac68k|macos)/i`).
2. Detects desktop app vs web via `Bb()`.
3. Filters bindings by platform and app context.
4. Returns `matchShortcut(event)` function and `shortcutString` for display.

Shortcuts are rendered as `<kbd>` elements via the `<Ck>` component. On Mac, "cmd" renders as the symbol; on non-Mac, "ctrl" renders as text.

### Complete shortcut table

| Action                        | Mac                  | Windows/Linux         |
|-------------------------------|----------------------|-----------------------|
| Command palette               | Cmd+K                | Ctrl+K                |
| Search palette                | Cmd+Shift+K          | Ctrl+Shift+K          |
| Quick chat (desktop)          | Cmd+Ctrl+K           | Ctrl+Alt+K            |
| New conversation              | Cmd+Shift+O          | Ctrl+Shift+O          |
| Settings                      | Cmd+Shift+,          | Ctrl+Shift+,          |
| Incognito chat                | Cmd+Shift+I          | Ctrl+Shift+I          |
| File upload                   | Cmd+U                | Ctrl+U                |
| Toggle extended thinking      | Cmd+Shift+E          | Ctrl+Shift+E          |
| Toggle sidebar                | Cmd+.                | Ctrl+.                |
| All keyboard shortcuts        | Cmd+/                | Ctrl+/                |
| Toggle plan mode              | Cmd+Shift+P          | Ctrl+Shift+P          |
| Import issue                  | Cmd+Shift+I          | Ctrl+Shift+I          |
| Toggle dictation              | Cmd+D                | Ctrl+D                |

### Other key interactions

| Key            | Context                | Action                                    |
|----------------|------------------------|-------------------------------------------|
| Enter          | Prompt input           | Send message                              |
| Shift+Enter    | Prompt input           | New line                                  |
| Option+Enter   | Prompt input           | New line (alternative)                    |
| Cmd+Enter      | Prompt input           | Submit (also shown on submit button)      |
| Escape         | Modal                  | Close modal                               |
| Escape         | Command palette        | Close palette                             |

### Shortcut groups

Shortcuts are organized into groups for the shortcuts modal:
- **navigation**: Chats, Projects, Artifacts, Code, New conversation
- **chat**: Incognito, Share, File upload, Extended thinking
- **settings**: General settings, Capabilities, Connectors
- **general**: Toggle sidebar, All shortcuts
- **other**: Command palette, Search palette, Quick chat, Plan mode, Import issue

### Tiptap editor keyboard shortcuts

The rich text editor (Tiptap/ProseMirror) has its own keymap including standard text editing shortcuts (undo via Backspace at start of block, etc.).

---

## 5. Mobile / Responsive Behavior

### Breakpoint system

Tailwind-style breakpoints used throughout:

| Token | Media query            | Usage                                         |
|-------|------------------------|-----------------------------------------------|
| `sm`  | `min-width: 640px`     | Layout adjustments, masonry columns            |
| `md`  | `min-width: 768px`     | Sidebar visibility, file tree, 2-column layout |
| `lg`  | `min-width: 1024px`    | Sidebar auto-show, desktop layout              |
| `xl`  | `min-width: 1280px`    | Wide content                                   |
| `2xl` | `min-width: 1536px`    | Extra-wide content                             |

Custom breakpoint object:
```js
{ sm: "(min-width: 640px)", md: "(min-width: 768px)", lg: "(min-width: 1024px)",
  xl: "(min-width: 1280px)", "2xl": "(min-width: 1536px)" }
```

### Mobile detection

- **Sidebar**: `isMobile` computed from `Db("(max-width: 1023px)")` -- the sidebar context stores this.
- **Small mobile**: `eb("(max-width: 599px)")` used for compact code session UI and draft list.
- **Code session layout**: `eb("(min-width: 768px)")` for file tree side panel.
- **Masonry layout**: 1 column < 640px, 2 columns 640-768px, 3 columns >= 768px.
- **Scheduled task modal**: `eb("(max-height: 680px) and (min-width: 900px)")` for compact form.

### Mobile-specific behaviors

- **Sidebar**: On mobile (`< 1024px`), sidebar opens as overlay with backdrop click-to-close; `closeSidebarOnMobile()` is called after navigation.
- **Touch share**: On iOS/iPad/Mac with touch (`"ontouchend" in document`), uses `navigator.share()` native share sheet instead of email links.
- **Pointer coarse**: `window.matchMedia("(pointer: coarse)").matches` suppresses certain hover interactions on touch devices.
- **Container queries**: Some components use `@container` queries (e.g. `[@container_(min-width:768px)]:block` for Cowork side panel).

### Media query hook

`eb(query, defaultValue, options)` -- a `useMediaQuery` hook that:
1. Creates `window.matchMedia(query)`.
2. Listens for `change` events.
3. Supports SSR with `getInitialValueInEffect` option.

`Db(query)` -- another media query hook using `useSyncExternalStore` for React 18 concurrent mode safety.

---

## 6. Platform Detection

### Client platform enum

```js
{
  UNKNOWN:           "unknown",
  ANDROID:           "android",
  IOS:               "ios",
  DESKTOP_APP:       "desktop_app",
  WEB_CLAUDE_AI:     "web_claude_ai",
  WEB_CONSOLE:       "web_console",
  WEB_CUSTOM_AGENTS: "web_custom_agents"
}
```

Detection logic:
```
if (UA matches claude desktop pattern) -> DESKTOP_APP
else if (appType === "claude-dot")     -> WEB_CLAUDE_AI
else if (appType === "console")        -> WEB_CONSOLE
else if (appType === "custom-agents")  -> WEB_CUSTOM_AGENTS
```

Sent as HTTP header: `anthropic-client-platform: <value>`.

### Desktop app detection

`Uc(userAgent)` parses UA for `/claude(nest|gov)?\/([^ ]+)/i`:
- Returns `{ version, variant }` where variant is `"nest"`, `"gov"`, or `"prod"`.

`qc(ua, { version, platform })` checks:
- Version satisfies semver constraint (e.g. `>=0.9.0`).
- Platform matches (`"mac"` -> UA contains "macintosh"; `"windows"` -> UA contains "windows").
- `window.claudeAppBindings` exists.

Version constraints used:
```
Vc = { version: ">=0.3.7" }
Gc = { version: ">=0.9.0" }
$c = { version: ">=0.14.0" }
Hc = { version: ">=0.9.0", platform: "mac" }  // Mac-specific features
Wc = { version: ">=0.12.0" }
```

### Mac detection (for keyboard shortcuts)

```js
const ck = /(macintosh|macintel|macppc|mac68k|macos)/i;
function uk() { return ck.test(window.navigator.userAgent); }
```

### Windows detection

```js
const pk = /(win32|win64|windows|wince)/i;
```

### iOS / mobile OS detection

```js
function detectMobilePlatform(ua) {
  if (ua.includes("iphone") || ua.includes("ipad") ||
      (ua.includes("mac") && "ontouchend" in document)) return "ios";
  if (ua.includes("android")) return "android";
  if (ua.includes("macintosh")) return "mac";
  if (ua.includes("windows")) return "windows";
  return "other";
}
```

### Electron / Desktop app integration points

- `window.claudeAppBindings` -- MCP server management, binding registration, settings:
  - `.registerBinding(key, callback)` / `.unregisterBinding(key)`
  - `.connectToMcpServer(name)` / `.listMcpServers()`
  - `.openMcpSettings(name)`
- `window.electronWindowControl` -- Window management:
  - `.resize(width, height)`
  - `.setIncognitoMode(bool)`
  - `.setThemeMode("system" | "dark" | "light")`
  - `.openSettingsWindow()`
  - `.openQuickEntryWindow()`
  - `.getQuickEntryPayload()`
- `window.electronIntl` -- Locale sync:
  - `.requestLocaleChange(locale)`
- `window.registerDesktopApi(name, handler)` -- Register APIs the desktop app can call.
- `window.claudeAppSettings.filePickers.getPathForFile(file)` -- Native file path resolution.

---

## 7. Clipboard API Usage

### Primary clipboard hook

`Mne()` returns `{ didCopy, copyToClipboard }`:

```js
copyToClipboard(input) where input = string | { text, html }
```

Strategy:
1. If HTML content provided, try `navigator.clipboard.write()` with `ClipboardItem` containing both `text/plain` and `text/html` blobs.
2. If that fails, try `ClipboardEvent` with `DataTransfer` (dispatched on `document`).
3. Fall back to `navigator.clipboard.writeText(text)`.
4. Final fallback (in some artifact code): create a hidden `<textarea>`, `select()`, `document.execCommand("copy")`, then remove it.

`didCopy` state resets after 2 seconds (via `setTimeout`).

### Where clipboard is used

| Feature                | What is copied                                        |
|------------------------|-------------------------------------------------------|
| Copy message           | Message text content (with optional artifact removal)  |
| Copy code block        | Code block text                                        |
| Copy artifact          | Artifact source code                                   |
| Copy embed code        | `<iframe>` embed HTML                                  |
| Copy published link    | Artifact published URL                                 |
| Copy referral link     | Referral URL                                           |
| Copy file path         | File path from code session                            |
| Copy org ID            | Organization UUID                                      |
| Copy server URL        | MCP server URL                                         |
| Copy CLI command       | "claude remote-control" command string                  |
| Copy prompt to input   | Copies compose message content to clipboard             |
| Share via native       | `navigator.share()` on iOS/mobile                      |

### Read clipboard

No `navigator.clipboard.readText()` usage found in the main bundle -- clipboard is write-only from the application's perspective.

---

## 8. Print / PDF Export

### Print functionality

Artifacts have a print/export feature. The implementation:

1. Creates a hidden `<iframe>` and writes a full HTML document into it.
2. The document includes a `@media print` stylesheet:

```css
@page {
  margin: 0;       /* Removes browser datetime/page/URL headers */
  padding: 25px 0; /* Top and bottom page padding */
}

@media print {
  html, body, pre, code {
    -webkit-print-color-adjust: exact !important;
    color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* Smart page breaks */
  h1, h2, h3 {
    page-break-after: avoid !important;
  }
  img, pre, table {
    page-break-inside: avoid !important;
  }
}
```

3. Sets `document.title` to the artifact title before printing (so the PDF filename is meaningful).
4. Calls `iframe.contentWindow.print()` (falls back to `iframe.contentDocument.execCommand("print")`).
5. Waits for CSS stylesheets to load (with 1-second timeout) before triggering print.
6. Restores original document title and removes the iframe after printing.

### No server-side PDF generation

There is no API endpoint for PDF export. Printing is entirely client-side using the browser's native print dialog / "Save as PDF".

### File download

A separate utility creates downloadable files via `URL.createObjectURL(new Blob([content], { type }))` and a dynamically created `<a>` element -- used for JSON data export, not conversation PDF export.

---

## 9. MCP App Context Schema (for embedded apps)

The MCP app iframe receives a context object with these i18n/platform fields:

```typescript
{
  locale?: string;             // BCP 47 format
  timeZone?: string;           // IANA timezone
  userAgent?: string;          // Host app identifier
  platform?: "web" | "desktop" | "mobile";
  deviceCapabilities?: {
    touch?: boolean;
    hover?: boolean;
  };
  safeAreaInsets?: {
    top: number; right: number; bottom: number; left: number;
  };
  theme?: ThemeConfig;
  displayMode?: DisplayMode;
  containerDimensions?: { width|maxWidth, height|maxHeight };
}
```

---

## 10. Voice Mode

### Default voice configuration

```js
{
  voice: "buttery",
  inputEncoding: "opus",
  inputSampleRate: 16000,
  inputChannels: 1,
  outputFormat: "pcm_16000",
  language: "en",
  serverInterruptEnabled: true
}
```

Language is hardcoded to `"en"` in the default config. The voice WebSocket URL includes `language`, `timezone`, `voice`, and `client_platform` as query parameters.

### Dictation language detection

`D5e(locale)` maps the user's intl locale to a BCP-47 speech recognition language code. This enables dictation in the user's configured language.

---

## 11. Additional i18n Details

### String format

All translatable strings use FormatJS ICU MessageFormat syntax:
- Plurals: `{count, plural, one {# comment} other {# comments}}`
- Select: used for conditional messages
- Rich text: `<emphasis>text</emphasis>` with custom tag renderers

### Country-specific legal documents

Legal document versions are keyed by country code (e.g. `GB`, `CH`, `DE`, `JP`, `CA`, `US`, plus all EU/EEA countries). The `consumer-terms` document has ~30 country-specific versions. Japan has a specific `acst-disclosure` document.

### Consent / GDPR

Countries requiring explicit consent are checked via `wYt.has(ipCountry)`. GPC (Global Privacy Control) detection is also supported via `gpcDetected` flag.
