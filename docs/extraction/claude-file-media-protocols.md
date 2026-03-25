# Claude.ai Frontend File, Media, and Binary Data Protocols

**Source:** `index-DcrCrePJ.js` (7.2MB minified bundle)

---

## 1. File Upload Flow

### Upload Endpoints

```
General upload:        /api/{orgUuid}/upload
Project upload:        /api/organizations/{orgUuid}/projects/{projectUuid}/upload
Wiggle (sandbox) upload: /api/organizations/{orgUuid}/conversations/{conversationUuid}/wiggle/upload-file
```

The `rQ()` function resolves the upload URL:
```js
function rQ(e) {
  if (QJ(e)) return eQ(e);  // wiggle upload endpoint
  const { orgUuid: t, projectUuid: n } = e;
  return n
    ? `/api/organizations/${t}/projects/${n}/upload`
    : `/api/${t}/upload`;
}
```

### Multipart Request Format

All uploads use `FormData` with a single field named `"file"`:

```js
async function JJ(e, t, n, s) {
  const r = new FormData;
  r.append("file", e);
  const i = await fetch(t, {
    method: "POST",
    body: r,
    signal: n,
    credentials: "include"
  });
  // ...
}
```

No `Content-Type` header is set explicitly -- the browser sets it to `multipart/form-data` with boundary automatically. The generic fetch wrapper detects `FormData` and skips setting `Content-Type`:

```js
a.has("Content-Type") || s.body instanceof FormData || a.set("Content-Type", "application/json")
```

### Upload Response Shape

The upload response MUST contain `file_kind` and `file_uuid`:

```js
if (!("file_kind" in l) || !("file_uuid" in l))
  throw new Error(`Invalid upload response structure for file: ${e.name}`);
```

`file_kind` enum (`HJ`):
```js
var HJ = (e => (
  e.Image = "image",
  e.Blob = "blob",
  e.WiggleVM = "WiggleVM",
  e.SanitizedDocument = "document"
))(HJ || {});
```

Full response shape (inferred):
```json
{
  "file_kind": "image" | "blob" | "WiggleVM" | "document",
  "file_uuid": "<uuid>",
  "file_name": "<string>",
  "created_at": "<ISO date>",
  "localPath": "<path>",
  "path": "<path>"
}
```

### Size Limits

```js
const OJ = 31457280;   // 30MB max file size (31,457,280 bytes)
const zJ = {
  maxFileSize: OJ,                        // 30MB
  maxImageSize: 10485760,                  // 10MB
  maxFilesPerBatch: 20,
  maxFilesPerMessage: 20,
  maxAttachmentsPerMessage: 20,
  maxTotalUploadsPerMessage: 20,
  maxFilesPerConversation: 100,
  maxAttachmentsPerConversation: 500,
  maxTokensPerFile: 100000,
  maxTokensPerMessage: 200000
};
```

Image-specific: max base64 encoded size = 5,238,784 bytes (5MB). Max dimension = 8000px per side.

```js
const t = 5238784;  // max encoded bytes for images
function fQ(e, t) {
  const n = 7968;    // ~8000px dimension limit
  // ...
}
```

In-context file size limit (configurable, default 15,360 bytes):
```js
function PJ() {
  const e = Px("cai_file_upload_config", "max_in_context_file_bytes", 15360);
  return e;
}
```

### Allowed File Types

**Image extensions** (`bJ`/`yJ`): `jpg, jpeg, png, gif, webp`

**Image MIME types** (`AJ`): `image/jpeg, image/png, image/gif, image/webp`

**PDF** (`vJ`): `pdf`

**Text/code files** (`CJ`/`wJ`): `txt, py, ipynb, js, jsx, html, css, java, cs, php, c, cc, cpp, cxx, cts, h, hh, hpp, rs, R, Rmd, swift, go, rb, kt, kts, ts, tsx, m, mm, mts, scala, dart, lua, pl, pm, t, sh, bash, zsh, csv, log, ini, cfg, config, json, proto, prisma, yaml, yml, toml, sql, bat, md, coffee, tex, latex, gd, gdshader, tres, tscn, typst, rst, adoc, asciidoc, textile, creole, wiki, env, gitignore, dockerignore, editorconfig, prettierrc, eslintrc, gradle, sbt, cabal, podspec, gemspec, makefile, dockerfile, xml, rss, atom, graphql, gql, hbs, handlebars, mustache, twig, jinja, jinja2, j2, vue, svelte, glsl, hlsl, frag, vert, shader, elm, clj, cljs, erl, ex, exs, hs, nim, zig, fs, fsx, ml, mli, v, vsh, vv, pas, pp, inc, fish, csh, tcsh, ps1, psm1, psd1, tsv, tab, jsonl, ndjson, lock, ignore, gitattributes, gitmodules, htaccess, htpasswd, robots, sitemap`

**Document conversion files** (`IJ`): `docx, rtf, epub, odt`

**Out-of-context / analysis files** (`kJ`): `csv, xls, xlsx, xlsb, xlm, xlsm, xlt, xltm, xltx, ods, zip`

**Native conversion MIME types** (`EJ`): `application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.oasis.opendocument.text, application/rtf, application/epub+zip`

**Unsupported/blocked extensions** (`SJ`): `bmp, ico, tiff, tif, psd, raw, cr2, nef, orf, sr2, mobi, jp2, svg, svgz, ai, eps, ps, indd, heic, mp4, mov, avi, mkv, wmv, flv, webm, mpeg, mpg, m4v, ...` (video, audio, font, archive, 3D files)

### Completion Request Body (files reference)

When sending a message, files are referenced by UUID in the `files` array:

```js
body: {
  organization_uuid: w.uuid,
  conversation_uuid: e,
  text: i,
  attachments: d,                    // in-context attachments (extracted_content)
  files: h.map(e => e.file_uuid),    // array of file UUIDs (binary/image uploads)
  sync_sources: f.map(e => e.uuid)   // external sync sources
}
```

### File Handler Chain

Files are processed through a handler chain (registered in order):
1. `UnsupportedFileHandler` - rejects unsupported types
2. `FileSizeHandler` - rejects files > 30MB
3. `PdfHandler` - PDF rasterization or text extraction
4. `ImageHandler` - image upload with resize
5. `ContentExtractorHandler` - docx/rtf/epub/odt conversion
6. `OutOfContextFileHandler` - spreadsheets/large files -> blob upload
7. `TextAttachmentHandler` - text file -> extracted_content inline
8. `SimpleUploadToWiggleHandler` - fallback wiggle upload

### Attachment Data Shape (in-context)

```js
{
  file_name: "example.txt",
  file_type: "text/plain",
  file_size: 1234,
  extracted_content: "<the file text>",
  origin: "user_upload" | "url_parameter" | "first_party",
  kind: "file" | "pasted_text" | "excerpt" | "progress_item",
  path: "/mnt/user-data/uploads/example.txt"  // optional, wiggle path
}
```

### Upload Error Codes

- `400` - file format not supported or corrupted
- `413` - file too large
- `429` - rate limit (too many upload attempts)
- `document_password_protected` - PDF is password protected
- `invalid_file_type` - server rejected file type
- `document_too_many_pages` - PDF has too many pages (fallback to text extraction)

---

## 2. Image Upload and Preview

### Image Preview Endpoint

```
/api/{orgUuid}/files/{fileUuid}/preview
```

Used in tool results and inline rendering:
```js
src={`/api/${orgUuid}/files/${e.file_uuid}/preview`}
```

### Image Contents (Download) Endpoint

```
/api/organizations/{orgUuid}/files/{fileUuid}/contents
```

### Image Content Preview (Text Metadata)

```
/api/organizations/{orgUuid}/files/{fileUuid}/content_preview
```

### Image Resizing / Canvas Conversion

When `use_canvas_resize` feature gate is enabled, images are resized client-side before upload:

```js
async function aQ(e, t = 2000, n = 2000) {
  const s = new Image;
  s.src = URL.createObjectURL(e);
  // skip resize if not PNG and within limits
  if ("image/png" !== e.type && s.width <= t && s.height <= n) return e;
  // maintain aspect ratio, constrain to 2000x2000
  const a = s.width / s.height;
  let r = s.width, i = s.height;
  s.width > t && (r = t, i = r / a);
  i > n && (i = n, r = i * a);
  // draw to canvas and export
  const o = document.createElement("canvas");
  // ... toBlob conversion
}
```

- Max resize dimensions: **2000x2000** pixels
- PNG files are always resized through canvas (converts to JPEG)
- Default output MIME type: `image/jpeg` (`DJ = "image/jpeg"`)

### Image Block Format (in messages)

Images sent inline as base64 blocks:
```js
{
  type: "image",
  source: {
    type: "base64",
    media_type: "image/jpeg",  // or image/png, image/gif, image/webp
    data: "<base64 string>"
  }
}
```

### Supported Image MIME to Extension Map

```js
const RJ = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf"
};
```

---

## 3. Document Conversion

### Convert Document Endpoint

```
POST /api/organizations/{orgUuid}/convert_document
Content-Type: multipart/form-data
Body: FormData with field "file"
```

```js
async function KJ(e, t, n) {
  const s = new FormData;
  s.append("file", e);
  const a = `/api/organizations/${t}/convert_document`;
  const r = await fetch(a, {
    method: "POST",
    body: s,
    signal: n,
    credentials: "include"
  });
  // ...
}
```

### Convert Document Response

```json
{
  "file_name": "document.docx",
  "file_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "extracted_content": "<plain text extracted from document>"
}
```

Null bytes are stripped from all returned fields:
```js
o.extracted_content = ZJ(o.extracted_content);  // .replace(/\0/g, "")
o.file_name = ZJ(o.file_name);
o.file_type = ZJ(o.file_type);
```

### Document Types That Get Server-Side Extraction

- **docx** (Word)
- **rtf** (Rich Text)
- **epub** (eBook)
- **odt** (OpenDocument Text)
- **doc** / **pptx** / **zip** (via `_J` array, also go through conversion if wiggle is enabled)

### PDF Handling

PDFs have dual-path processing via `PdfHandler`:

1. **Rasterization path** (when `janus_claude_ai` gate + `pdf_in` model config):
   - Upload as binary file for server-side rasterization
   - Returns `file_kind: "document"`, `file_uuid`

2. **Text extraction fallback** (when rasterization unavailable or `document_too_many_pages`):
   - Sent through `/api/organizations/{orgUuid}/convert_document`
   - Returns `extracted_content` as plain text

---

## 4. Artifact File System (Wiggle)

### Wiggle Endpoints

```
Upload:     POST /api/organizations/{orgUuid}/conversations/{convUuid}/wiggle/upload-file
Delete:     POST /api/organizations/{orgUuid}/conversations/{convUuid}/wiggle/delete-file
                  Body: { "file_uuid": "<uuid>" }
Download:   GET  /api/organizations/{orgUuid}/conversations/{convUuid}/wiggle/download-file?path=<path>
Multi-DL:   GET  /api/organizations/{orgUuid}/conversations/{convUuid}/wiggle/download-files?paths=<path1>&paths=<path2>
List:       GET  /api/organizations/{orgUuid}/conversations/{convUuid}/wiggle/list-files
Convert:    POST /api/organizations/{orgUuid}/conversations/{convUuid}/wiggle/convert-file-to-artifact
```

### Shared/Snapshot Variants

For shared conversations, URLs swap `conversations/{convUuid}` to `snapshots/{snapshotUuid}`:
```
/api/organizations/{orgUuid}/snapshots/{snapshotUuid}/wiggle/download-file?path=<path>
/api/organizations/{orgUuid}/snapshots/{snapshotUuid}/wiggle/download-files?paths=...
```

### File Path Convention

Files in the sandbox use the `/mnt/user-data/` prefix:
- Output files: `/mnt/user-data/outputs/`
- General: `/mnt/user-data/uploads/`
- CLAUDE.md: `/mnt/.claude/CLAUDE.md` (global instructions)

The path may also use `computer://` prefix which is stripped:
```js
const r = e.replace("computer://", "");
```

### Wiggle Feature Gate

Wiggle functionality is gated:
```js
function QJ(e) { return e.featureGates.wiggleEnabled; }
```

### Artifact Content Types (P6 enum)

```js
var P6 = (e => (
  e.Text      = "text/plain",
  e.Markdown  = "text/markdown",
  e.Html      = "text/html",
  e.Code      = "application/vnd.ant.code",
  e.Svg       = "image/svg+xml",
  e.Mermaid   = "application/vnd.ant.mermaid",
  e.React     = "application/vnd.ant.react"
))(P6 || {});
```

### Binary/Document Artifact Types (z6 enum)

```js
var z6 = (e => (
  e.Pdf            = "application/pdf",
  e.Excel          = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  e.ExcelLegacy    = "application/vnd.ms-excel",
  e.Word           = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  e.WordLegacy     = "application/msword",
  e.PowerPoint     = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  e.PowerPointLegacy = "application/vnd.ms-powerpoint",
  e.Csv            = "text/csv",
  e.Tsv            = "text/tab-separated-values",
  e.Skill          = "application/vnd.ant.skill",
  e.Plugin         = "application/vnd.ant.plugin"
))(z6 || {});
```

### Artifact Version Schema

Artifact blocks in the stream are parsed via:
```js
const V6 = {
  version_uuid: string | null,
  command: "create" | "update" | "rewrite",
  id: string | null,
  title: string | null,
  type: P6,           // content type
  language: string | null,
  content: string | null,
  old_str: string | null,
  new_str: string | null,
  source: "c" | "w",  // "c" = Claude, "w" = web/user
  md_citations: array
};
```

### Artifact Rendering

- **Code** (`P6.Code`): rendered in syntax-highlighted code block (always-black background)
- **Markdown** (`P6.Markdown`): rendered as rich markdown
- **HTML** (`P6.Html`), **React** (`P6.React`), **SVG** (`P6.Svg`), **Mermaid** (`P6.Mermaid`): rendered in sandboxed iframe
- **CSV** (`z6.Csv`), **TSV** (`z6.Tsv`): column preview with row/column counts
- **PDF**, **Excel**, **Word**, **PowerPoint**: rendered as binary in sandbox iframe

### Artifact Tools Endpoint

```
GET /api/organizations/{orgUuid}/artifacts/{artifactEntityType}/{entityId}/tools?chat_conversation_uuid={convUuid}&file_path={filePath}
```

Gated by `claude_create_marble` feature flag. Entity types include `"wiggle_artifact"`.

### Artifact Storage (Persistent Key-Value)

```
GET    /api/organizations/{orgUuid}/artifacts/{type}/{uuid}/storage/{key}?shared={bool}&chat_conversation_uuid={convUuid}&file_path={filePath}
PUT    /api/organizations/{orgUuid}/artifacts/{type}/{uuid}/storage/{key}
       Body: { "value": <any>, "shared": bool, "chat_conversation_uuid": <uuid>, "file_path": <path> }
DELETE /api/organizations/{orgUuid}/artifacts/{type}/{uuid}/storage/{key}
GET    /api/organizations/{orgUuid}/artifacts/{type}/{uuid}/storage?prefix=<str>&shared={bool}
```

Reset storage:
```
POST /api/organizations/{orgUuid}/artifacts/{type}/{uuid}/manage/storage/reset
```

Storage info:
```
GET /api/organizations/{orgUuid}/artifacts/{type}/{uuid}/manage/storage/info
```

---

## 5. Sandbox / Code Execution (Iframe Communication Protocol)

### Sandbox Iframe Setup

```js
u.jsx("iframe", {
  ref: r,
  src: x,
  style: { display: "none" },
  referrerPolicy: "no-referrer",
  sandbox: "allow-scripts allow-same-origin",
  title: ""
})
```

### Message Protocol

Communication uses a request/response protocol with protobuf-style `@type` fields:

```js
// Request format
{
  channel: "request",
  requestId: "<string>",
  method: "<method_name>",
  payload: { "@type": "<protobuf_type>", ...fields }
}

// Response format
{
  channel: "response",
  requestId: "<string>",
  status: <100-599>,
  payload: { "@type": "<protobuf_type>", ...fields }
}
```

### Sandbox Methods (uDe enum)

```
ReadyForContent              - Sandbox signals ready for content
SetContent                   - Parent sends artifact content to sandbox
  payload: { content, type (P6 or z6), watchContentSize, tailwindStylesEnabled }
GetFile                      - Sandbox requests a file by key
  request:  { key }
  response: { value: Uint8Array | null }
SendConversationMessage      - Sandbox sends message back to conversation
  payload: { message, messageType: "text" | "error" }
RunCode                      - Sandbox requests code execution
  request:  { code }
  response: { status: "success" | "error", result?, logs[], error? }
ClaudeCompletion             - Sandbox requests an AI completion
  request:  { prompt }
  response: { completion: string | null }
ReportError                  - Sandbox reports an error
  payload: { error: UnsupportedImports | RuntimeError | FileNotFound | ClaudeCompletionError | ArtifactStorageError }
GetScreenshot                - Parent takes screenshot of sandbox
  response: { screenshot: string | null }  (base64)
BroadcastContentSize         - Sandbox broadcasts its content dimensions
  payload: { height, width }
OpenExternal                 - Sandbox requests opening external URL
  payload: { href }
DownloadFile                 - Sandbox triggers file download
  payload: { filename, data: ArrayBuffer, mimeType }
CopyHtmlContent              - Sandbox copies HTML to clipboard
  response: { reportHTMLContent }
TrackInteraction             - Sandbox tracks user interaction
  payload: { interactionType: "click" }
ProxyFetch                   - Sandbox requests proxied HTTP fetch
  request:  { url, method, headers, body: ArrayBuffer | null, channelId }
  response: { status, statusText, headers }
ProxyFetchStream             - Streaming response chunks for ProxyFetch
  payload: { channelId, chunk: ArrayBuffer | null, done, error? }
GetDOMSnapshot               - Parent requests DOM snapshot
  response: { domSnapshot: string | null }
DOMContentLoaded             - Sandbox signals DOM ready
StorageGet/Set/Delete/List   - Key-value storage operations (shared flag)
```

### Always-Permitted Methods

These methods do not require user confirmation:
- ReadyForContent
- ReportError
- OpenExternal
- DownloadFile
- TrackInteraction
- DOMContentLoaded

### Claude Completion Proxy for Artifacts

```
POST /api/organizations/{orgUuid}/proxy/v1/messages
Headers: {
  "Content-Type": "application/json",
  "anthropic-artifact-id": <artifact_uuid>,
  "anthropic-artifact-entity-type": <entity_type>,
  "anthropic-chat-conversation-uuid": <conv_uuid>,    // for wiggle_artifact
  "anthropic-file-path": <file_path>                   // for wiggle_artifact
}
Body: { "messages": [{ "role": "user", "content": "<prompt>" }] }
```

---

## 6. Image Search (Server-Side Tool)

### Image Gallery Content Block

The `image_search` tool returns `image_gallery` content blocks:
```js
for (const t of e.content)
  if ("image_gallery" === t.type) {
    return (t.images ?? []).filter(e => e && e.id && e.thumbnail_url);
  }
```

Image objects have: `id`, `thumbnail_url`, `url`, `alt`, `source`, `page_url`.

### Image Gallery Click Tracking

```
POST /api/organizations/{orgUuid}/image_gallery/click
Body: { telemetry: <click_data> }
```

### Image Gallery Rendering

Multiple `image_search` tool calls in sequence are aggregated into a single gallery with a fullscreen carousel viewer. Images can be expired (`is_expired` flag).

### Image Gallery Feedback

Feedback mechanism for image search quality:
```js
event_key: "claudeai.tool.feedback_submitted"
feedback_type: "thumbs_up" | "thumbs_down"
tool_name: "image_search"
```

---

## 7. Published Artifacts

### Publish Endpoint

```
POST /api/organizations/{orgUuid}/publish_artifact
```

### Unpublish Endpoint

```
DELETE /api/organizations/{orgUuid}/published_artifacts/{publishedArtifactUuid}
```

### Set Visibility

```
POST /api/organizations/{orgUuid}/artifact-versions/{artifactVersionUuid}/visibility
```

### Get Visibility

```
GET /api/organizations/{orgUuid}/artifact-versions/{artifactVersionUuid}/visibility
```

Response includes `visibility` field (e.g., `"shared"`).

### Published Artifact URL Structure

```js
const publishedUrl = `${publishedArtifactsBaseUrl}/...`;
const embedUrl = `${publishedArtifactsEmbedBaseUrl}/public/artifacts/${published_artifact_uuid}/embed`;
```

### Embed Whitelist

```
GET  /api/published_artifacts/{publishedArtifactUuid}/embed_whitelist
PUT  /api/organizations/{orgUuid}/published_artifacts/{publishedArtifactUuid}/embed_whitelist
```

### Shared Artifact Version

```
GET /api/organizations/{orgUuid}/artifact-versions/{artifactVersionUuid}
```

### Artifact Versions by Index

```
POST /api/organizations/{orgUuid}/artifacts/{artifactIdentifier}/byindex
Body: { version_index: <number>, artifact_identifier: <string> }
```

### Artifact Versions for Conversation

```
GET /api/organizations/{orgUuid}/artifacts/{conversationUuid}/versions
```

### Published Artifacts List

```
GET /api/organizations/{orgUuid}/published_artifacts
```

---

## 8. Conversation Snapshots / Sharing

### Share a Conversation

```
POST /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/share
```

### Unshare

```
DELETE /api/organizations/{orgUuid}/share/{shareId}
```

### List Shares

```
GET /api/organizations/{orgUuid}/shares
```

### Get Snapshot

```
GET /api/organizations/{orgUuid}/chat_snapshots/{snapshotUuid}?rendering_mode=messages&render_all_tools=true
```

Anonymous access (no org):
```
GET /api/chat_snapshots/{snapshotUuid}?rendering_mode=messages&render_all_tools=true
```

### Latest Snapshot

```
GET /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/latest
```

Response: `{ snapshot, shareable, disabled_reason }`

### Snapshot Data Format

Messages in snapshots are mapped through `fj()` normalizer. The snapshot response includes `chat_messages` array.

---

## 9. Clipboard / Paste Handling

### Paste Events

The paste handler (`vce` hook) handles three paste scenarios:

1. **Image files from clipboard**: When `clipboardData.files` contain images and the model supports image input, files are extracted and uploaded.

2. **Microsoft Office paste detection**: Special handling for Word/Excel/PowerPoint pastes (detected by `urn:schemas-microsoft-com:office:`, `content=Word.Document`, `class="Mso"` etc.) -- extracts plain text instead of HTML.

3. **Large text paste (>=4096 bytes)**: When pasting text >= 4096 bytes, it's automatically converted to an attachment:

```js
r || !u || m < 4096 || o || (
  l.preventDefault(),
  e(e => [...e, {
    file_name: "",
    file_size: m,
    file_type: "txt",
    extracted_content: d
  }])
)
```

### Pasted Content Identification

Pasted text attachments are identified by:
```js
function pue(e) {
  return e.kind === $J.PastedText ||
    "" === e.file_name ||
    !!e.file_name.match(/^paste(-\d+)?\.txt$/) ||
    !!e.file_name.match(/^Pasted-.*\.txt$/);
}
```

### TipTap Editor Paste

The editor uses ProseMirror/TipTap with custom paste plugins:
- `pasteCodeAsPlainText` - strips formatting from code pastes
- `linkOnPaste` - auto-creates links when pasting URLs
- Standard TipTap paste with `handlePaste` hooks

---

## 10. Drag and Drop

### Drop Handler

The drag-drop system uses `webkitGetAsEntry()` for directory traversal:

```js
const l = d.useCallback(e => {
  e.preventDefault();
  // ...
  const s = e.dataTransfer?.items;
  // check for directories
  for (let n = 0; n < s.length; n++) {
    const a = s[n].webkitGetAsEntry();
    if (a?.isDirectory) {
      // handle folder drops (local agent mode)
    }
  }
  // process files via webkitGetAsEntry recursively
  // directories: createReader().readEntries()
}, []);
```

### Accepted Drop Types

Same as upload -- determined by `VJ()` which combines:
- `_J` (doc, pptx, zip) -- when wiggle is enabled
- `vJ` (pdf)
- `IJ` (docx, rtf, epub, odt)
- `wJ` (all text/code files)
- `yJ` (images) -- when images are enabled
- `kJ` (csv, xls, xlsx, etc.) -- when out-of-context files enabled

### Local Agent Mode Folder Drops

In local agent mode, dropped folders are resolved to native file paths via `yQ()` which extracts the system path from the `File` object.

---

## 11. CSV / Data File Rendering

### CSV Preview

CSV files uploaded via the analysis tool get a column preview:

```js
f.file_type === wue.Csv
  ? // render column names, column count, row count
    {
      column_names: [...],
      column_count: N,
      row_count: N
    }
```

The preview shows:
- Column names in a scrollable list
- Summary: `"{columnCount} columns, {rowCount} rows"`
- Note: "Claude can analyze CSVs with the Analysis tool."

### CSV/TSV Artifact Rendering

CSV and TSV are part of the `z6` binary content type enum and are rendered in the sandbox iframe (not inline).

### Spreadsheet File Types for Analysis

The out-of-context file list (`kJ`): `csv, xls, xlsx, xlsb, xlm, xlsm, xlt, xltm, xltx, ods, zip`

These require the "Code execution and file creation" capability to be enabled.

---

## 12. LaTeX / Math Rendering

### Math Rendering

No KaTeX or MathJax library is directly bundled in this specific JS file. Math rendering is handled:

1. **In Mermaid artifacts**: Mermaid diagrams are sent to the sandbox iframe via the `SetContent` protocol with type `P6.Mermaid`.

2. **In Markdown content**: The markdown renderer handles LaTeX via the standard `$...$` (inline) and `$$...$$` (display) delimiters, processed through the TipTap/ProseMirror rendering pipeline.

3. **TeX/LaTeX files**: Both `tex` and `latex` are in the `CJ` accepted text extensions list, uploaded as text attachments with extracted content.

---

## 13. Additional Protocols

### Project File Upload

```
POST /api/organizations/{orgUuid}/projects/{projectUuid}/upload
```

Project files use:
```
GET  /api/organizations/{orgUuid}/projects/{projectUuid}/files
POST /api/organizations/{orgUuid}/projects/{projectUuid}/files/delete_many
     Body: { file_uuids: [...] }
```

### Project Knowledge (Docs)

```
POST /api/organizations/{orgUuid}/projects/{projectUuid}/docs
     with { file_name, content }
DELETE /api/organizations/{orgUuid}/projects/{projectUuid}/docs/{docUuid}
GET  /api/organizations/{orgUuid}/projects/{projectUuid}/docs/{docUuid}
```

### Shared Artifact File Contents

```
GET /api/organizations/{orgUuid}/shared_artifact/{sharedArtifactId}/files/{fileUuid}/contents
GET /api/organizations/{orgUuid}/files/{fileUuid}/contents
```

### Plugin Upload

```
POST /api/organizations/{orgUuid}/plugins/upload-plugin
POST /api/organizations/{orgUuid}/marketplaces/{marketplaceId}/plugin_upload?overwrite=true
```

### Style Preview

```
POST /api/organizations/{orgUuid}/styles/preview
Body: { style_prompt, example_key, example_text }
```

### Secret Scanning

```
POST /api/organizations/{orgUuid}/code/shares/scan_secrets
```

### Completion Status Polling

```
GET /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/completion_status?poll=false
```

### Task Status

```
GET /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/task/{taskId}/status
GET /api/organizations/{orgUuid}/chat_snapshots/{snapshotUuid}/task/{taskId}/status
```

---

## 14. Server-Side Tools (Built-in)

### Tool Names with Custom Rendering

```js
const tools = [
  "image_search",          // image gallery
  "display_stock_data",    // stock charts
  "quiz_display_v0",       // interactive quiz
  "weather_fetch",         // weather widget
  "message_compose_v1",    // email/message composer
  "places_map_display_v0", // map with places
  "places_map_display_v1", // map v2
  "recipe_display_v0",     // recipe card
  "AskUserQuestion",       // interactive quiz/survey
  "recommend_claude_apps", // app recommendations
  "places_search",         // places search
  "places_search_v1",
  "ask_user_input_v0",
  "fetch_sports_data"
];
```

### Activity Status Enum

```js
var dd = (e => (
  e.Starting = "starting",
  e.Planning = "planning",
  e.InitiatingAgents = "initiating_agents",
  e.Searching = "searching",
  e.CreatingArtifact = "creating_artifact",
  e.Completed = "completed",
  e.Cancelled = "cancelled",
  e.TimedOut = "timed_out",
  e.Failed = "failed"
))(dd || {});
```

---

## 15. File Origin and Kind Enums

### File Origin (`GJ`)

```js
var GJ = (e => (
  e.URLParameter = "url_parameter",   // from ?attachment= URL param
  e.UserUpload = "user_upload",       // user drag/drop/click upload
  e.FirstParty = "first_party"        // system-generated (e.g., todo items)
))(GJ || {});
```

### Attachment Kind (`$J`)

```js
var $J = (e => (
  e.File = "file",
  e.PastedText = "pasted_text",
  e.Excerpt = "excerpt",           // excerpt from previous message
  e.ProgressItem = "progress_item" // todo/progress panel items
))($J || {});
```

### Excerpt Attachment

When user copies an excerpt from a previous assistant message:
```js
const e = {
  file_name: "excerpt_from_previous_claude_message.txt",
  file_size: new Blob([i]).size,
  file_type: "txt",
  extracted_content: i,
  origin: GJ.UserUpload,
  kind: $J.Excerpt
};
```

---

## 16. Analytics Events (File/Media Related)

```js
"file_upload_too_large"
"sse_interrupted"
"wiggle.file.downloaded"
"wiggle.file.downloaded_all"
"artifact.share_button_clicked"
"artifact.publish_button_clicked"
"claudeai.tool.feedback_submitted"
"claudeai.message.completion_failed"
"claudeai.message.duplicate_key"
"chat.share.button.clicked"
"activity_panel.feedback"
```

---

## 17. Transport: SSE vs gRPC

The completion endpoint supports two transports:
```js
const g = a ? tT.GRPC : tT.SSE;
```

gRPC mode requires `grpcTools` configuration. The transport is tracked in analytics:
```js
transport: s ? "grpc" : "sse"
```

Retry modes: `"off"`, `"emergency"`, `"expanded"`, `"legacy"`
