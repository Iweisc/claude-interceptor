# Fix: Sidebar sync, show_widget, and thinking budget

## Problem 1: Sidebar conversations disappear after refresh

**Root cause**: `chat_conversations_v2` returns `{ "conversations": [...], "total_count": N }`, NOT a flat array. `mergeSidebarConversations` only handles `Array.isArray(upstreamBody)` → falls through, no merge.

**Fix**: In `mergeSidebarConversations` (both `inject.js` and `chrome/inject.js`), add object format handling after the array check:
```javascript
if (Array.isArray(upstreamBody?.conversations)) {
  const filtered = upstreamBody.conversations.filter((c) => !proxyUuids.has(c.uuid));
  upstreamBody.conversations = [...proxyConversations, ...filtered];
  return new Response(JSON.stringify(upstreamBody), { ... });
}
```

## Problem 2: `show_widget` tool does nothing

**Root cause**: `show_widget` returns stub text `"Widget rendered successfully"`. Widget code is never stored or presented. No special SSE events for it.

**Fix**: Treat `show_widget` like `create_file` + `present_files`:

1. **`tool-runner.js`**: Store widget HTML as an artifact under `/mnt/user-data/outputs/{title}.html`, return the path.
2. **`sse.js`**: Add `show_widget` case in `generateToolResultSse` to emit `local_resource` content (same as `present_files`). Add `generateWidgetUpdateSse` for `tool_use_block_update_delta` with HTML preview.
3. **`completion-runner.js`**: After `show_widget` execution, emit update + result SSE events (like `create_file` path).

## Problem 3: Thinking budget

**Root cause**: The model always thinks now. "Extended thinking" = larger budget, not toggle. Currently the completion runner skips `apiRequest.thinking` entirely when `enableThinking` is false, which means no thinking config at all.

**Fix**: Always include `apiRequest.thinking` but vary the budget:
- Extended OFF → small budget (e.g. 1024 tokens) for basic thinking
- Extended ON → user's configured `thinkingBudget` (default 10000, max 126000)

In `completion-runner.js` ~line 383:
```javascript
// Always enable thinking, vary budget
apiRequest.thinking = { type: 'enabled', budget_tokens: budgetTokens };
```
And set `budgetTokens` to a small default when not extended.

## Files to modify

1. `inject.js` + `chrome/inject.js` — Fix sidebar merge for object format
2. `sync-server/src/services/tool-runner.js` — Store widget as artifact
3. `sync-server/src/services/sse.js` — Widget SSE events
4. `sync-server/src/services/completion-runner.js` — Widget emit + thinking always on
5. Rebuild configmap + redeploy
