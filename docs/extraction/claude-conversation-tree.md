# Claude.ai Conversation Tree: Complete Frontend Architecture

Source: `index-DcrCrePJ.js` (7.2MB minified bundle)

---

## 1. Message Tree Data Model

### Core Data Structures

The conversation tree is stored as a flat array of messages (`chat_messages`) plus five derived Maps for efficient tree traversal:

```js
{
  uuid: string,                    // conversation UUID
  name: string,                    // conversation title
  model: string,                   // model used
  summary: string,
  created_at: string,              // ISO timestamp
  updated_at: string,              // ISO timestamp
  is_starred: boolean,
  is_temporary: boolean,
  project_uuid: string | null,
  session_id: string | null,
  platform: string | null,
  settings: object,                // conversation-level settings
  current_leaf_message_uuid: string,

  // The flat message array (from server):
  chat_messages: Message[],

  // Client-side derived Maps:
  messageByUuid: Map<string, Message>,
  parentByChildUuid: Map<string, string>,       // child UUID -> parent UUID
  childrenByParentUuid: Map<string, string[]>,   // parent UUID -> [child UUIDs]
  selectedChildByUuid: Map<string, number>,      // parent UUID -> index into children array

  // Optional:
  danglingHumanMessages: Message[]   // human messages without assistant responses
}
```

### Message Shape

```js
{
  uuid: string,
  sender: "human" | "assistant",
  content: ContentBlock[],           // [{type: "text", text: "...", citations: []}, ...]
  created_at: string,                // ISO timestamp
  updated_at: string,                // ISO timestamp
  attachments: Attachment[],
  files: File[],
  files_v2: File[],
  sync_sources: SyncSource[],
  index: number,                     // position in the flat array
  parent_message_uuid: string | undefined,
  input_mode?: "voice",             // set for voice input messages
  stop_reason?: string,             // "refusal", "error", etc.
  pending?: boolean,
  metadata?: {
    compass_mode?: string,
    is_resume_completion_placeholder_message?: boolean,
  },

  // Added client-side during path resolution (by vj):
  nOptions?: number,                // total sibling branches at this node
  selectedOption?: number,          // currently selected branch index (0-based)
}
```

### ContentBlock types observed:
- `{type: "text", text: string, citations: []}`
- `{type: "tool_use", name: string, input: object, partial_json?: string}`
- `{type: "tool_result", name: string, ...}`
- `{type: "bell", text: string, title: string}`
- `{type: "voice_note", text: string, title: string}`

### Root UUID Sentinel

```js
const uj = "00000000-0000-4000-8000-000000000000";
```

This is the virtual root of every tree. The first human message has `parent_message_uuid: uj`. All tree traversals start from or terminate at `uj`.

### Tree Building Function: `gj(conversation)`

Called when the server response is first received. Builds the five Maps from the flat `chat_messages` array:

```js
const gj = (e) => {
  const t = new Map,   // index -> message (for parent fallback)
        n = new Map,   // messageByUuid
        s = new Map,   // parentByChildUuid
        a = new Map,   // childrenByParentUuid
        r = new Map;   // selectedChildByUuid

  if (0 === e.chat_messages.length)
    return { messageByUuid: n, parentByChildUuid: s, childrenByParentUuid: a, selectedChildByUuid: r };

  const i = e.chat_messages.map(fj); // fj normalizes: adds content block if missing
  for (const o of i) t.set(o.index, o), n.set(o.uuid, o);
  for (const o of i) {
    let e = o.parent_message_uuid;
    // Fallback: if no parent_message_uuid, walk backwards by index to find one
    if (!e) {
      let n = o.index - 1;
      for (; !e && n >= 0; ) e = t.get(n)?.uuid, n--;
    }
    e = e ?? uj;  // default to root sentinel
    s.set(o.uuid, e);
    a.set(e, (a.get(e) ?? []).concat(o.uuid));
    r.set(e, 0);  // default: select first child
  }
  if (!a.get(uj)?.[0]) throw new Error("No root message found");
  return { chat_messages: i, messageByUuid: n, parentByChildUuid: s, childrenByParentUuid: a, selectedChildByUuid: r };
};
```

**Key insight:** If a message lacks `parent_message_uuid`, the frontend walks backwards by `index` to find the nearest existing message and uses its `uuid` as the parent. This is a fallback for legacy/malformed data.

### Tree Pruning Function: `xj(conversation, returnDangling)`

Filters the tree to keep only "relevant" messages. Keeps:
- All assistant messages
- Human messages that have an assistant reply
- Human messages with no `parent_message_uuid`
- If `returnDangling=true`, keeps everything

```js
const xj = (e, t = false) => {
  // ...builds set of "keeper" UUIDs...
  // assistant messages always kept
  // human messages that are parents of assistant messages kept
  // walks parent chains to include ancestors
  const r = e.chat_messages.filter(e => keepers.has(e.uuid));
  const i = e.chat_messages.filter(e => !r.includes(e) && "human" === e.sender); // dangling humans
  const l = { ...pruned, ...gj(pruned), danglingHumanMessages: i };
  // Re-resolves current_leaf_message_uuid
  return hj(l, c);  // c = last valid message if current leaf was pruned
};
```

### API: Fetching the Tree

**Query key:** `["chat_conversation_tree", {orgUuid}, {uuid}, {returnDanglingHumanMessage}]`

The constant `rf = "chat_conversation_tree"` is used as the React Query key prefix.

**URL construction (function `Cj`):**

```js
const Cj = (orgUuid, conversationUuid, consistency, returnDanglingHumanMessage) => {
  const params = new URLSearchParams();
  params.append("tree", "True");
  params.append("rendering_mode", "messages");
  params.append("render_all_tools", "true");
  if (consistency) params.append("consistency", consistency);  // "eventual" or "strong"
  if (returnDanglingHumanMessage) params.append("return_dangling_human_message", "true");
  return `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}?${params}`;
};
```

**Parameters:**
| Parameter | Values | Meaning |
|-----------|--------|---------|
| `tree` | `"True"` | Returns full message tree (all branches), not just current path |
| `rendering_mode` | `"messages"` or `"raw"` | `"messages"` returns rendered content blocks; `"raw"` returns metadata only (used for settings updates) |
| `render_all_tools` | `"true"` | Include tool_use/tool_result blocks in content |
| `consistency` | `"eventual"` or `"strong"` | Database consistency level for the read |
| `return_dangling_human_message` | `"true"` | Include human messages that don't have an assistant response yet |

**Without `tree=True`:** The server returns only the messages on the current path (from root to `current_leaf_message_uuid`). The frontend ALWAYS requests `tree=True`.

**The `rendering_mode` values:**
- `"messages"` - Full rendered content, used for display
- `"raw"` - Just metadata/settings, used for PUT operations on conversation settings

### Consistency Model

```js
const Mj = {
  conversations_stale_time_sec: 300,
  conversations_only_strong_consistency_for_invalidation: false,
  conversations_force_refresh_window_secs: 0,
  conversations_explicit_strong_consistency: true,
};
```

The frontend uses feature flags to control whether to use `"eventual"` or `"strong"` consistency. After a write, it may force a strong-consistency read. A session-storage timestamp tracks the last query time to decide if a force-refresh is needed.

---

## 2. Branch Navigation UI (the `< 1/2 >` arrows)

### How Branches Are Detected

During path resolution (`vj` function), each message on the current path is annotated with:
- `nOptions`: total number of siblings (children of its parent)
- `selectedOption`: which sibling index is currently selected (0-based)

The UI shows the navigation arrows when `nOptions > 1`:

```js
// In the message component:
const L = !isStreaming && (message.nOptions ?? 0) > 1 && changeDisplayedConversationPath && !isEmbedded;
```

### Branch Navigation Component: `cTe`

```js
function cTe({ message, changeDisplayedConversationPath }) {
  const n = (message.selectedOption ?? 0) + 1;  // 1-based display
  const s = 1 === n;                              // is first
  const a = n === message.nOptions;                // is last

  return (
    <div className="inline-flex items-center gap-1">
      <Button disabled={s} onClick={() => changeDisplayedConversationPath(message, -1)}
              aria-label="Previous version" icon={<ChevronLeft/>} />
      <span>{selectedOption} / {totalOptions}</span>
      <Button disabled={a} onClick={() => changeDisplayedConversationPath(message, 1)}
              aria-label="Next version" icon={<ChevronRight/>} />
    </div>
  );
}
```

### The Navigation Function

```js
changeDisplayedConversationPath = (conversationUuid, message, delta, onLeafChanged) => {
  queryClient.setQueryData([rf, {orgUuid}, {uuid: conversationUuid}, ...], tree => {
    // Core logic:
    const parentUuid = mj(tree.parentByChildUuid, message.uuid);
    const siblings = mj(tree.childrenByParentUuid, parentUuid);
    const newIndex = clamp((message.selectedOption ?? 0) + delta, 0, siblings.length - 1);

    tree.selectedChildByUuid.set(parentUuid, newIndex);

    // Rebuild path from parent downward to find new leaf
    const newPath = vj(tree, parentUuid);
    const newLeafUuid = newPath[newPath.length - 1].uuid;

    return hj(tree, newLeafUuid);  // updates current_leaf_message_uuid
  });
};
```

### API Call on Navigation

After changing the displayed path client-side, the frontend PUTs the new leaf:

```js
ee({ current_leaf_message_uuid: newLeafUuid })
```

**Endpoint:** `PUT /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/current_leaf_message_uuid`

**Body:** `{ current_leaf_message_uuid: "..." }`

This persists the user's branch selection server-side so reopening the conversation shows the same branch.

### Analytics Event

```js
{
  event_key: "claudeai.conversation_tree.navigated",
  direction: delta === 1 ? "next" : "previous",
  is_last_human_message: message.uuid === lastHumanMessageUuid
}
```

---

## 3. Message Editing

### Edit Flow

Editing is handled via an event emitter pattern:

```js
// Start edit UI:
const { isUserEditing, currentEdit, setCurrentEdit, startEdit, finishEdit, cancelEdit } = ({
  editable, actionEmitter, updatedMessage, modelOverride
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");

  // Extract current text from message
  let originalText = "";
  const textBlock = message.content?.find(e => "text" === e.type);
  if (textBlock && "text" in textBlock) originalText = textBlock.text;

  const startEdit = () => { setEditText(originalText); setIsEditing(true); };

  const finishEdit = () => {
    if (editText.length === 0) return;
    actionEmitter.emit("edit", { message, text: editText, modelOverride });
    setIsEditing(false);
    setEditText("");
  };
};
```

### What Happens When Edit is Submitted

The `"edit"` event handler calls `$e(message, text, modelOverride)`:

```js
const de = async (message, newText, modelOverride) => {
  const originalText = rj(message);  // extract text from message
  if (originalText !== newText) {
    track({
      event_key: "claudeai.message.edited",
      is_last_human_message: message.uuid === lastHumanMessageUuid,
      is_identical_content: originalText === newText
    });

    // KEY: calls the SAME stream function as a new message, but with the ORIGINAL message's parent_message_uuid
    await ie({
      prompt: newText,
      attachments: message.attachments,
      files: Lte(message),
      syncSources: message.sync_sources,
      parent_message_uuid: message.parent_message_uuid ?? undefined,  // <-- PARENT of the edited message
      personalized_style: U,
      compass_mode: message.metadata?.compass_mode,
      modelOverride: modelOverride
    });
  }
};
```

**Critical insight: Editing a human message creates a NEW branch.** It sends a new completion request with:
- The **edited text** as `prompt`
- The **original message's `parent_message_uuid`** (NOT the message's own UUID)

This means the edited message becomes a NEW sibling child of the same parent as the original. The server creates a new human message + assistant response pair, forming a new branch. The original branch remains accessible via the `< 1/N >` navigation.

### Editability Rules

A message is editable when:
```js
const isEditable = (isHuman || !isStreaming) && !isResearchPending && editable && editMessage
                   && message.parent_message_uuid && isInteractive;
```

Only human messages with a `parent_message_uuid` can be edited. The edit button appears in the message action bar.

---

## 4. Conversation Forking / Branching on Retry

### Retry Flow

When the user clicks "Retry" on an assistant message:

```js
// The retry button onClick:
onClick={() => F("assistant_message_footer", message.parent_message_uuid ?? undefined)
```

The retry emits:
```js
actionEmitter.emit("retry", {
  parent_message_uuid: e,
  paprika_mode: t,
  modelOverride: modelOverride
});
```

### The `Ve` (retry handler) function:

```js
const le = async (parentUuid, paprikaMode, modelOverride, compassMode, grpcTools) => {
  // Analytics
  track({
    is_retry: true,
    is_new_conversation: false,
    // ...
  });

  // Calls the RETRY stream
  return re(parentUuid, paprikaMode, modelOverride, compassMode, grpcTools);
};
```

### Retry Creates a Sibling Branch

The retry stream function (`C` in the retry hook):

```js
const C = async (parentUuid, paprikaMode, modelOverride, compassMode, grpcTools) => {
  // Only use parentUuid if it's a real UUID (not a temp "new-*" prefix)
  const validParent = (parentUuid != null && parentUuid !== "null" && parentUuid !== uj && pj(parentUuid))
    ? parentUuid : undefined;

  // Create a placeholder assistant message
  const placeholders = [{
    uuid: `${cj}-${oj()}`,  // "new-assistant-message-uuid-{random}"
    content: [],
    created_at: new Date().toISOString(),
    sender: "assistant",
    attachments: [], files: [], files_v2: [], sync_sources: [],
    parent_message_uuid: validParent ?? uj,
    selectedOption: 0,
    index: 0
  }];

  // Append to tree, which updates selectedChildByUuid to point to the new branch
  await appendToTree(conversationUuid, tree => {
    placeholders[0].index = bj(tree) + 1;  // max index + 1
    return yj(tree, placeholders);          // yj appends and sets leaf
  });

  // Actually call the API
  await runStream({
    prompt: "",          // empty prompt for retry
    attachments: [],
    files: [],
    syncSources: [],
    parent_message_uuid: validParent,
    personalized_style: personalizedStyle,
    paprika_mode: paprikaMode ?? undefined,
    compass_mode: compassMode ?? undefined,
    isRetry: true,
    modelOverride: modelOverride,
    tool_states: toolStates,
    turnMessageUuids: { assistantMessageUuid: lj() }  // only assistant UUID for retry
  });
};
```

### API Endpoints

Two distinct endpoints:

| Endpoint Value | Enum | URL Pattern |
|---|---|---|
| `1` | `APPEND_MESSAGE_WITH_COMPLETION` | `POST /api/organizations/{org}/chat_conversations/{conv}/completion` |
| `2` | `RETRY_MESSAGE_WITH_COMPLETION` | `POST /api/organizations/{org}/chat_conversations/{conv}/retry_completion` |

```js
var uT = (e => (
  e[e.APPEND_MESSAGE_WITH_COMPLETION = 1] = "APPEND_MESSAGE_WITH_COMPLETION",
  e[e.RETRY_MESSAGE_WITH_COMPLETION = 2] = "RETRY_MESSAGE_WITH_COMPLETION",
  e
))(uT || {});
```

**Retry uses `retry_completion` endpoint.** The body includes `parent_message_uuid` pointing to the human message whose assistant response should be regenerated. The server creates a new assistant message as a sibling of the existing one.

### gRPC Retry

For gRPC transport, the retry uses `retryMessage`:
```js
p.retryMessage({
  organizationUuid: orgUuid,
  chatConversationUuid: conversationUuid,
  parentMessageUuid: body.parent_message_uuid ?? undefined,
  model: body.model,
  timezone: ...,
  customSystemPrompt: ...,
  locale: ...,
  paprikaMode: ...,
  tools: grpcTools,
  maxTokensToSample: ...,
  renderingMode: "MESSAGES"
})
```

### Key Difference: Retry vs Edit

| | Edit | Retry |
|---|---|---|
| **parent_message_uuid** | Parent of the HUMAN message being edited | Parent of the ASSISTANT message (= the human message) |
| **prompt** | New edited text | Empty string `""` |
| **endpoint** | `completion` (same as new message) | `retry_completion` |
| **Creates** | New human + assistant pair (sibling of original human) | New assistant message (sibling of original assistant) |
| **turnMessageUuids** | Both human + assistant UUIDs | Only assistant UUID |

---

## 5. Message Deletion

**There is NO individual message deletion in the frontend.** No `deleteMessage`, `delete_message`, or `remove_message` functions exist.

Messages can only be removed by:
1. Deleting the entire conversation
2. The tree pruning logic (`xj`) filtering out messages that don't meet criteria

There IS a message **flag deletion** endpoint used for removing content flags:
```
DELETE /api/organizations/{org}/chat_conversations/{conv}/chat_messages/{messageUuid}/flags
Body: { flag_name: flagName }
```

But this removes metadata flags, not messages themselves.

---

## 6. Conversation Deletion and Bulk Operations

### Delete Single Conversation

```js
// Endpoint:
DELETE /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}

// React Query mutation:
Hh(e => `/api/organizations/${orgUuid}/chat_conversations/${e.uuid}`, "DELETE", {
  onMutate(vars) {
    // Optimistically remove from all list caches
    // ...
  },
  onSuccess() {
    track({ event_key: "chat.conversations.invalidate", action: "delete" });
    await Zj(queryClient, orgUuid);  // invalidate conversation lists
  }
});
```

### Bulk Delete Conversations

```js
// Endpoint:
POST /api/organizations/{orgUuid}/chat_conversations/delete_many

// Body: { conversation_uuids: string[] }  (inferred)

// On success:
track({ event_key: "chat.conversations.invalidate", action: "delete_many" });
await Zj(queryClient, orgUuid);
```

### Move Conversations (to project)

```js
// Endpoint:
POST /api/organizations/{orgUuid}/chat_conversations/move_many

// On success:
track({ event_key: "chat.conversations.invalidate", action: "move_many" });
await Zj(queryClient, orgUuid);
await Kj(queryClient, orgUuid, response.moved);  // invalidate specific conversation trees
```

### Create Conversation

```js
POST /api/organizations/{orgUuid}/chat_conversations

// Body:
{
  uuid: string,          // client-generated
  name: string,
  model: string,
  project_uuid?: string,
  include_conversation_preferences?: boolean,
  paprika_mode?: string,
  compass_mode?: string,
  create_mode?: string,
  is_temporary?: boolean,
  enabled_imagine?: boolean,
  orbit_action_uuid?: string
}
```

---

## 7. Current Path Resolution

### The `hj` function: Set Leaf and Update Selection

Given a target leaf UUID, walks UP the tree and sets `selectedChildByUuid` at each parent so the path from root reaches that leaf:

```js
const hj = (tree, targetLeaf) => {
  let n = targetLeaf ?? tree.current_leaf_message_uuid;
  if (!n) return tree;

  const visited = new Set();
  while (n !== uj) {
    if (visited.has(n)) throw new Error(`Circular reference at UUID: ${n}`);
    visited.add(n);

    const parentUuid = tree.parentByChildUuid.get(n);
    if (parentUuid === undefined) break;  // incomplete chain

    const siblings = tree.childrenByParentUuid.get(parentUuid);
    if (siblings === undefined) break;

    const myIndex = siblings.indexOf(n);
    tree.selectedChildByUuid.set(parentUuid, myIndex);
    n = parentUuid;
  }

  return { ...tree, current_leaf_message_uuid: targetLeaf };
};
```

### The `vj` function: Walk DOWN from root to build the display path

```js
const vj = (tree, startUuid) => {
  const path = [];
  let current = startUuid ?? uj;
  const visited = new Set();

  while (tree.childrenByParentUuid.has(current)) {
    if (visited.has(current)) throw new Error(`Circular reference at UUID: ${current}`);
    visited.add(current);

    const children = mj(tree.childrenByParentUuid, current);
    if (children.length === 0) break;

    const selectedIndex = mj(tree.selectedChildByUuid, current);
    const selectedMessage = mj(tree.messageByUuid, children[selectedIndex]);

    path.push({
      ...selectedMessage,
      parent_message_uuid: current,
      nOptions: children.length,       // <-- branch count at this level
      selectedOption: selectedIndex     // <-- which branch is active
    });

    current = selectedMessage.uuid;
  }
  return path;
};
```

### How `currentPath` is exposed to the UI

In the `Aj` hook (conversation tree query):

```js
const currentPath = useMemo(() => {
  if (!queryData) return [];
  const path = vj(queryData);
  // Only update reference if contents changed
  if (path differs from previous) pathRef.current = path;
  return pathRef.current;
}, [queryData]);
```

Components receive `messageUuids` which is the list of message UUIDs on `currentPath`. Each message component receives the full annotated message object with `nOptions` and `selectedOption`.

---

## 8. Message Ordering

### The `index` field

Every message has an `index` field. New messages get `index = bj(tree) + 1` where:

```js
const bj = (tree) => {
  const indices = Array.from(tree.messageByUuid.values())
    .map(m => m.index)
    .filter(i => i !== undefined);
  return indices.length === 0 ? -1 : Math.max(...indices);
};
```

So `index` is a monotonically increasing counter across ALL messages in the tree (not just the current path).

When appending a human+assistant pair:
```js
newHuman.index = bj(tree) + 1;
newAssistant.index = bj(tree) + 2;  // after human is added
```

### Display Order

Messages are displayed in the order returned by `vj()`, which follows `childrenByParentUuid` + `selectedChildByUuid` from root to leaf. The `index` field is NOT used for display ordering -- the tree structure determines it.

The `index` is primarily used for:
- The fallback parent resolution in `gj` (walking backwards by index)
- Analytics (calculating `message_index`)

---

## 9. Conversation Metadata Updates

### Rename

**Manual rename:**
```
PUT /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}
Body: { name: "New Title" }
```

Uses function `Gj`:
```js
Gj = (conversationUuid, projectUuid) => {
  return mutation(`/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}`, "PUT", {
    onMutate: ({ name }) => {
      // Optimistically update tree cache and conversation list
      Vj(conversationUuid, { name });
    }
  });
};
```

**Auto-generated title:**
```
POST /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/title
Response: { title: string }
```

Auto-title logic:
```js
// If conversation has messages, is not yet titled, and either:
// - Title generation errored previously, OR
// - The conversation has received initial messages
// Then: take first 30 chars of the last message as temporary name
const tempTitle = lastMessage.slice(0, 30) + (lastMessage.length > 30 ? "..." : "");
mutate({ name: tempTitle });

// Later, if conditions met and not yet auto-titled:
generateTitle({})  // POST to /title endpoint
```

### Starring

Starring uses the same general PUT endpoint:

```
PUT /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}?rendering_mode=raw
Body: { is_starred: true/false }
```

Optimistic updates:
```js
// Moves conversation between starred/unstarred lists in cache
// Updates the tree cache's is_starred field
// Tracks: "claudeai.conversation.starred" / "claudeai.conversation.unstarred"
```

The toggle function:
```js
const toggleStar = () => {
  const newValue = !conversation.is_starred;
  mutate({ is_starred: newValue });
  track({
    event_key: newValue ? "claudeai.conversation.starred" : "claudeai.conversation.unstarred",
    conversation_uuid: conversation.uuid,
    conversation_name: title
  });
};
```

---

## 10. Conversation Settings Mutations

### Settings Update Endpoint

```
PUT /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}?rendering_mode=raw
Body: { settings: { ... } }
```

Function `Wj`:
```js
Wj = (conversationUuid, options) => {
  return mutation(
    `/api/organizations/${orgUuid}/chat_conversations/${conversationUuid}?rendering_mode=raw`,
    "PUT",
    (body, existing) => existing ? { ...existing, settings: { ...existing.settings, ...body.settings } } : undefined,
    {
      onSuccess: (response) => {
        // Update tree cache with new settings
        queryClient.setQueryData([rf, ...], tree => tree ? { ...tree, settings: response.settings } : tree);
      }
    }
  );
};
```

### Mutable Settings

Settings that can be changed mid-conversation:

```js
const settingsKeys = [
  "enabled_web_search",
  "enabled_bananagrams",       // artifacts feature flag names
  "enabled_sourdough",
  "enabled_foccacia",
  "enabled_mcp_tools",
  "paprika_mode",              // thinking mode: "extended" = extended thinking
  "tool_search_mode",
];

// Conditionally added:
if (hasProject && stickyProjectSettings) {
  settingsKeys.push("compass_mode");  // research mode: "advanced" = deep research
}
```

The `paprika_mode` and `compass_mode` are special: they are included in the `Yc` array of settings that are only stored in pending state (not yet persisted) when no conversation exists:

```js
const Yc = ["paprika_mode", "compass_mode"];
```

### Model Fallback

```
PUT /api/organizations/{orgUuid}/chat_conversations/{conversationUuid}/model_fallback
Response: { model: string }
```

Used when a model produces an error and the system falls back to a different model.

---

## 11. Message UUID Generation

### Two UUID generators

**`oj()` - Standard UUIDv4 (for temporary/placeholder IDs):**

```js
const oj = () =>
  void 0 === crypto.randomUUID
    ? "10000000-1000-4000-8000-100000000000".replace(/[018]/g, e => {
        const t = parseInt(e);
        return (t ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> t / 4).toString(16);
      })
    : crypto.randomUUID();
```

Standard `crypto.randomUUID()` with a polyfill. Produces UUIDv4.

**`lj()` - UUIDv7 (time-ordered, for real message IDs):**

```js
const lj = () => {
  const timestamp = Date.now();
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  // Encode millisecond timestamp in first 6 bytes (48 bits)
  bytes[0] = timestamp / 2**40 & 255;
  bytes[1] = timestamp / 2**32 & 255;
  bytes[2] = timestamp / 2**24 & 255;
  bytes[3] = timestamp / 65536 & 255;
  bytes[4] = timestamp / 256 & 255;
  bytes[5] = timestamp & 255;

  // Set version to 7
  bytes[6] = 15 & bytes[6] | 112;   // 0x70 = version 7

  // Set variant to RFC 4122
  bytes[8] = 63 & bytes[8] | 128;   // 0x80 = variant 10

  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
```

**This is UUIDv7** -- a time-ordered UUID with the Unix millisecond timestamp in the high bits. This means UUIDs sort chronologically.

### Temporary Placeholder Prefixes

```js
const cj = "new-assistant-message-uuid";   // placeholder prefix for assistant messages
const dj = "new-human-message-uuid";       // placeholder prefix for human messages
```

Temp UUIDs are generated as `"new-assistant-message-uuid-{oj()}"` or `"new-human-message-uuid-{oj()}"`.

The function `pj` checks if a UUID is a "real" (server-assigned) UUID:
```js
const pj = (uuid) => !uuid.startsWith(cj) && !uuid.startsWith(dj);
```

### `turn_message_uuids`

The client generates UUIDs for both human and assistant messages BEFORE sending the request:

```js
// For new messages:
const turnMessageUuids = {
  humanMessageUuid: lj(),     // UUIDv7
  assistantMessageUuid: lj()  // UUIDv7
};

// For retry (only assistant):
const turnMessageUuids = {
  assistantMessageUuid: lj()
};
```

These are sent in the POST body as:
```js
{
  turn_message_uuids: {
    human_message_uuid: "...",      // optional, omitted for retry
    assistant_message_uuid: "..."
  }
}
```

The server uses these client-provided UUIDs when creating the messages, ensuring the client can optimistically create local message objects with the correct UUIDs before the server responds.

### The Root Sentinel

```js
const uj = "00000000-0000-4000-8000-000000000000";
```

This is **NOT** `00000000-0000-0000-0000-000000000000` (nil UUID). It has version bits set to `4` and variant bits set to `8`, making it look like a valid UUIDv4 but with all-zero random bits. It serves as the virtual root parent.

---

## 12. Scroll Position and Message Loading

### No Pagination

Messages are loaded **all at once** via the tree query. There is no pagination or lazy loading of messages within a conversation. The entire tree is fetched in one request via the `Cj` URL.

### Conversation List Pagination

The conversation **list** (sidebar) IS paginated:

```
GET /api/organizations/{orgUuid}/chat_conversations_v2?limit=30&offset=0&starred=false&consistency=strong
```

```js
const _j = 30;   // default page size for conversation list
const kj = 10000; // some other limit
```

### Scroll Behavior

The frontend uses `scrollIntoView` for auto-scrolling to new messages:

```js
// On new message or streaming:
ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
```

An `IntersectionObserver` is used for various UI features (detecting if elements are in view), but not for message virtualization. Messages are rendered in a standard list without virtual scrolling.

---

## 13. Complete POST Body for Message Completion

The `fM` function builds the request body:

```js
function fM(params) {
  const body = {
    prompt: params.prompt,
    parent_message_uuid: params.parent_message_uuid ?? undefined,
    timezone: params.timezone,
    personalized_styles: params.personalized_style ? [params.personalized_style] : undefined,
    locale: cM.includes(params.locale) ? params.locale : "en-US",
  };

  // Optional custom system prompt from localStorage
  const customPrompt = localStorage.getItem("customSystemPrompt");
  if (customPrompt) body.custom_system_prompt = customPrompt;

  if (params.model) body.model = params.model;
  if (params.modelOverride) body.model = params.modelOverride;
  if (params.temperature) body.temperature = parseInt(params.temperature);
  if (params.maxTokensToSample) body.max_tokens_to_sample = parseInt(params.maxTokensToSample);
  if (params.paprika_mode) body.paprika_mode = params.paprika_mode;
  if (params.tools.length) body.tools = params.tools;
  if (params.tool_states?.length) body.tool_states = params.tool_states;

  if (params.turnMessageUuids) {
    const { humanMessageUuid, assistantMessageUuid } = params.turnMessageUuids;
    body.turn_message_uuids = {
      ...(humanMessageUuid && { human_message_uuid: humanMessageUuid }),
      ...(assistantMessageUuid && { assistant_message_uuid: assistantMessageUuid }),
    };
  }

  return body;
}
```

The full POST body sent to `/completion` also includes (wrapped around `fM`'s output):

```js
{
  organization_uuid: orgUuid,
  conversation_uuid: conversationUuid,
  // ... all fM fields ...
  text: undefined,         // explicitly set to undefined
  rendering_mode: "messages",
  create_conversation_params: { ... },  // only on first message
}
```

---

## 14. Appendix: Function Reference Table

| Minified Name | Purpose |
|---|---|
| `uj` | Root UUID sentinel `"00000000-0000-4000-8000-000000000000"` |
| `oj()` | Generate UUIDv4 (for placeholders) |
| `lj()` | Generate UUIDv7 (for real message IDs, time-ordered) |
| `cj` | Prefix `"new-assistant-message-uuid"` |
| `dj` | Prefix `"new-human-message-uuid"` |
| `pj(uuid)` | Check if UUID is a real (non-placeholder) UUID |
| `mj(map, key)` | Safe Map.get with throw on missing key |
| `fj(msg)` | Normalize message: ensure `content` array exists |
| `gj(conv)` | Build the 5 tree Maps from flat `chat_messages` |
| `xj(conv, returnDangling)` | Prune tree, filter dangling human messages |
| `hj(tree, leafUuid)` | Set current leaf and update `selectedChildByUuid` walking up |
| `vj(tree, startUuid?)` | Walk down from root building display path array |
| `yj(tree, messages)` | Append messages to tree, update maps, set leaf |
| `bj(tree)` | Get max `index` across all messages |
| `Cj(org, conv, consistency, dangling)` | Build GET URL for conversation tree |
| `Aj(uuid, options)` | React Query hook for fetching conversation tree |
| `Lj(tree?)` | Extract/default the 5 Maps from a tree object |
| `Rj()` | Create initial empty tree state with timestamps |
| `Oj(client, org, uuid, data)` | Create conversation entry in query cache |
| `Vj()` | Returns callback to update conversation metadata in cache |
| `Gj(conv, project)` | Mutation hook for renaming conversation (PUT) |
| `Wj(conv, options)` | Mutation hook for updating conversation settings (PUT) |
| `fM(params)` | Build the POST body for completion/retry requests |
| `rf` | Query key constant `"chat_conversation_tree"` |
| `af` | Query key constant `"chat_conversation_list"` |
| `uT` | Endpoint enum: `1=APPEND_MESSAGE_WITH_COMPLETION`, `2=RETRY_MESSAGE_WITH_COMPLETION` |

---

## 15. Appendix: Complete API Endpoint Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/organizations/{org}/chat_conversations_v2?limit=&offset=&starred=&searchQuery=&consistency=` | List conversations (paginated) |
| POST | `/api/organizations/{org}/chat_conversations` | Create conversation |
| GET | `/api/organizations/{org}/chat_conversations/{conv}?tree=True&rendering_mode=messages&render_all_tools=true&consistency=&return_dangling_human_message=` | Get conversation tree |
| PUT | `/api/organizations/{org}/chat_conversations/{conv}` | Update name, is_starred, model |
| PUT | `/api/organizations/{org}/chat_conversations/{conv}?rendering_mode=raw` | Update settings |
| DELETE | `/api/organizations/{org}/chat_conversations/{conv}` | Delete conversation |
| POST | `/api/organizations/{org}/chat_conversations/delete_many` | Bulk delete |
| POST | `/api/organizations/{org}/chat_conversations/move_many` | Move to project |
| PUT | `/api/organizations/{org}/chat_conversations/{conv}/current_leaf_message_uuid` | Persist branch selection |
| PUT | `/api/organizations/{org}/chat_conversations/{conv}/model_fallback` | Switch model after failure |
| POST | `/api/organizations/{org}/chat_conversations/{conv}/title` | Auto-generate title |
| POST | `/api/organizations/{org}/chat_conversations/{conv}/completion` | New message + completion |
| POST | `/api/organizations/{org}/chat_conversations/{conv}/retry_completion` | Retry assistant response |
| POST/PUT | `/api/organizations/{org}/chat_conversations/{conv}/chat_messages/{msg}/chat_feedback` | Submit feedback |
| DELETE | `/api/organizations/{org}/chat_conversations/{conv}/chat_messages/{msg}/flags` | Remove message flag |
| GET | `/api/organizations/{org}/shares` | List shared conversations |
| GET | `/api/chat_snapshots/{snapshot}?rendering_mode=messages&render_all_tools=true` | Get shared snapshot |

---

## 16. Appendix: Tree Operation Visualizations

### New Message
```
Before:                    After:
root -> H1 -> A1           root -> H1 -> A1
                                        -> H2 (new) -> A2 (new, = leaf)
parent_message_uuid of H2 = A1.uuid
```

### Edit (editing H1)
```
Before:                    After:
root -> H1 -> A1           root -> H1 -> A1
                                 -> H1' (new, edited text) -> A1' (new, = leaf)
parent_message_uuid of H1' = root (= H1.parent_message_uuid)
```

### Retry (retrying A1)
```
Before:                    After:
root -> H1 -> A1           root -> H1 -> A1
                                       -> A1' (new, = leaf)
parent_message_uuid of A1' = H1.uuid (= A1.parent_message_uuid)
```

### Branch Navigation (at H1, switching from branch 0 to branch 1)
```
Tree:
root -> H1 (branch 0) -> A1 -> H2 -> A2
     -> H1' (branch 1) -> A1' -> H3 -> A3

selectedChildByUuid.set(root, 1)  // select branch 1
current_leaf_message_uuid = A3.uuid  // walk down branch 1 to leaf
PUT current_leaf_message_uuid = A3.uuid
```
