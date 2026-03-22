(function () {
  'use strict';

  // Override the IDB preload cache ASAP. The page has an inline script that reads
  // react-query-cache from IndexedDB into __PRELOADED_IDB_CACHE__. This inject.js
  // runs after that preload but BEFORE the app's module scripts read the cache.
  // By overriding here, the app gets undefined and falls back to a fresh network
  // fetch (which background.js modifies via filterResponseData).
  try {
    Object.defineProperty(window, '__PRELOADED_IDB_CACHE__', {
      value: Promise.resolve(undefined),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, '__PRELOADED_IDB_CACHE_RESULT__', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  } catch (e) { /* ignore */ }

  const COMPLETION_RE = /\/api\/organizations\/[^/]+\/chat_conversations\/([^/]+)\/completion$/;
  const CONVERSATION_GET_RE = /\/api\/organizations\/[^/]+\/chat_conversations\/([^/?]+)\?.*tree=True/;
  const CONVERSATION_ANY_RE = /\/api\/organizations\/[^/]+\/chat_conversations\/([^/?]+)/;
  const ACCOUNT_RE = /\/api\/account$/;
  const SUBSCRIPTION_RE = /\/api\/organizations\/[^/]+\/subscription_details/;
  const DOWNLOAD_FILE_RE = /\/wiggle\/download-file\?path=([^&]+)/;
  const ARTIFACT_TOOLS_RE = /\/artifacts\/wiggle_artifact\/[^/]+\/tools/;
  const originalFetch = window.fetch;
  const pendingRequests = new Map();

  // Track messages per conversation for GET response injection
  // Persisted to localStorage so they survive page refreshes
  const STORAGE_KEY = '__claude_intercepter_tracked';
  const ARTIFACTS_KEY = '__claude_intercepter_artifacts';
  const SETTINGS_KEY = '__claude_intercepter_conv_settings';

  function loadFromStorage(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function saveToStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) { /* quota exceeded or other error */ }
  }

  // Hydrate from localStorage
  const _trackedData = loadFromStorage(STORAGE_KEY);
  const trackedConversations = new Map(Object.entries(_trackedData));

  const _settingsData = loadFromStorage(SETTINGS_KEY);
  const conversationSettings = new Map(Object.entries(_settingsData));

  const _artifactsData = loadFromStorage(ARTIFACTS_KEY);
  const storedArtifacts = new Map(Object.entries(_artifactsData));

  // Persist helpers
  function persistTracked() {
    const obj = {};
    trackedConversations.forEach((v, k) => { obj[k] = v; });
    saveToStorage(STORAGE_KEY, obj);
  }

  function persistSettings() {
    const obj = {};
    conversationSettings.forEach((v, k) => { obj[k] = v; });
    saveToStorage(SETTINGS_KEY, obj);
  }

  function persistArtifacts() {
    const obj = {};
    storedArtifacts.forEach((v, k) => { obj[k] = v; });
    saveToStorage(ARTIFACTS_KEY, obj);
  }

  // Clear React Query IDB cache so the app fetches fresh bootstrap data
  // (The app caches bootstrap in IndexedDB and reads it before any fetch happens)
  try {
    const req = indexedDB.open('keyval-store', 1);
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction('keyval', 'readwrite');
        const store = tx.objectStore('keyval');
        store.delete('react-query-cache');
        tx.oncomplete = () => {
          db.close();
          console.log('[inject.js] Cleared react-query-cache from IDB');
        };
      } catch (e) { /* ignore */ }
    };
  } catch (e) { /* ignore */ }

  // Clear GrowthBook/Statsig SDK caches so they re-evaluate from our modified bootstrap
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('growthbook') || key.startsWith('statsig') || key.startsWith('gb_') || key.startsWith('ss_'))) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    if (keysToRemove.length > 0) {
      console.log('[inject.js] Cleared', keysToRemove.length, 'cached SDK entries:', keysToRemove);
    }
  } catch (e) { /* ignore */ }

  console.log('[inject.js] Loaded', trackedConversations.size, 'tracked conversations from storage');

  function getConvTracker(convId) {
    if (!trackedConversations.has(convId)) {
      trackedConversations.set(convId, { messages: [], lastGetResponse: null });
    }
    return trackedConversations.get(convId);
  }

  function buildMessageObject(uuid, sender, text, parentUuid, index) {
    const now = new Date().toISOString();
    const msg = {
      uuid,
      text: '',
      content: [{ start_timestamp: now, stop_timestamp: now, type: 'text', text, citations: [] }],
      sender,
      index,
      created_at: now,
      updated_at: now,
      truncated: false,
      attachments: [],
      files: [],
      files_v2: [],
      sync_sources: [],
      parent_message_uuid: parentUuid,
    };
    if (sender === 'assistant') {
      msg.stop_reason = 'stop_sequence';
    }
    return msg;
  }

  // Handle messages from content.js
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    const { type, id, data, error } = event.data;

    const pending = pendingRequests.get(id);
    if (!pending) return;

    switch (type) {
      case 'CLAUDE_INTERCEPT_CHUNK':
        if (!pending.resolved) {
          pending.resolved = true;
          pending.resolve(
            new Response(pending.stream, {
              status: 200,
              headers: {
                'content-type': 'text/event-stream; charset=utf-8',
                'cache-control': 'no-cache',
              },
            })
          );
        }
        // Track assistant content from SSE chunks (text + thinking)
        try {
          const lines = data.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === 'content_block_start') {
                if (!pending.contentBlocks) pending.contentBlocks = [];
                pending.contentBlocks[parsed.index] = {
                  type: parsed.content_block?.type || 'text',
                  name: parsed.content_block?.name || '',
                  text: '',
                  thinking: '',
                  toolInput: '',
                };
              }
              if (parsed.type === 'content_block_delta') {
                const block = pending.contentBlocks?.[parsed.index];
                if (block && parsed.delta?.type === 'text_delta') {
                  block.text += parsed.delta.text;
                  pending.assistantText = (pending.assistantText || '') + parsed.delta.text;
                } else if (block && parsed.delta?.type === 'thinking_delta') {
                  block.thinking += parsed.delta.thinking;
                } else if (block && parsed.delta?.type === 'input_json_delta') {
                  block.toolInput += parsed.delta.partial_json;
                }
              }
              // When a tool_use block completes, store artifact files
              if (parsed.type === 'content_block_stop') {
                const block = pending.contentBlocks?.[parsed.index];
                if (block && block.name === 'create_file' && block.toolInput) {
                  try {
                    const input = JSON.parse(block.toolInput);
                    if (input.path && input.file_text) {
                      storedArtifacts.set(input.path, {
                        content: input.file_text,
                        mimeType: input.path.endsWith('.html') ? 'text/html' :
                                  input.path.endsWith('.py') ? 'text/x-python' :
                                  input.path.endsWith('.js') ? 'application/javascript' :
                                  input.path.endsWith('.css') ? 'text/css' : 'text/plain',
                      });
                      persistArtifacts();
                      console.log('[inject.js] Stored artifact:', input.path, input.file_text.length, 'chars');
                    }
                  } catch (e) { /* ignore */ }
                }
              }
            }
          }
        } catch (e) { /* ignore parse errors */ }
        pending.controller.enqueue(new TextEncoder().encode(data));
        break;

      case 'CLAUDE_INTERCEPT_DONE': {
        if (!pending.resolved) {
          pending.resolved = true;
          pending.resolve(
            new Response(pending.stream, {
              status: 200,
              headers: { 'content-type': 'text/event-stream; charset=utf-8' },
            })
          );
        }
        pending.controller.close();

        // Save tracked messages for this conversation
        if (pending.convId && pending.requestBody) {
          const tracker = getConvTracker(pending.convId);
          const body = pending.requestBody;
          const humanUuid = body.turn_message_uuids?.human_message_uuid;
          const assistantUuid = body.turn_message_uuids?.assistant_message_uuid;
          const parentUuid = body.parent_message_uuid || (tracker.messages.length > 0
            ? tracker.messages[tracker.messages.length - 1].uuid
            : '00000000-0000-4000-8000-000000000000');

          const baseIndex = tracker.messages.length;
          const humanMsg = buildMessageObject(humanUuid, 'human', body.prompt, parentUuid, baseIndex);

          // Build assistant content with thinking blocks preserved
          const assistantContent = [];
          if (pending.contentBlocks) {
            for (const block of pending.contentBlocks) {
              if (!block) continue;
              const now = new Date().toISOString();
              if (block.type === 'thinking' && block.thinking) {
                assistantContent.push({
                  start_timestamp: now, stop_timestamp: now,
                  type: 'thinking', thinking: block.thinking,
                  summaries: [], cut_off: false, truncated: false,
                });
              } else if (block.type === 'text' && block.text) {
                assistantContent.push({
                  start_timestamp: now, stop_timestamp: now,
                  type: 'text', text: block.text, citations: [],
                });
              }
            }
          }
          if (assistantContent.length === 0) {
            assistantContent.push({
              start_timestamp: new Date().toISOString(),
              stop_timestamp: new Date().toISOString(),
              type: 'text', text: pending.assistantText || '', citations: [],
            });
          }

          const assistantMsg = buildMessageObject(assistantUuid, 'assistant', '', humanUuid, baseIndex + 1);
          assistantMsg.content = assistantContent; // Override with rich content

          tracker.messages.push(humanMsg, assistantMsg);
          persistTracked();
          console.log('[inject.js] Tracked messages for conversation:', pending.convId, 'total:', tracker.messages.length);
        }

        pendingRequests.delete(id);
        break;
      }

      case 'CLAUDE_INTERCEPT_ERROR':
        if (!pending.resolved) {
          pending.resolved = true;
          console.warn('[inject.js] Intercept error, falling through to original fetch:', error);
          originalFetch(pending.url, pending.init).then(pending.resolve, pending.reject);
        } else {
          pending.controller.error(new Error(error || 'Intercept failed'));
        }
        pendingRequests.delete(id);
        break;

      case 'CLAUDE_INTERCEPT_PASSTHROUGH':
        pendingRequests.delete(id);
        console.log('[inject.js] Passthrough — using original fetch');
        originalFetch(pending.url, pending.init).then(pending.resolve, pending.reject);
        break;
    }
  });

  // Helper: read a response, extract conversation settings, return a cloned response
  function trackConversationSettings(response, url) {
    const clone = response.clone();
    clone.json().then((body) => {
      if (body.uuid && body.settings) {
        const paprikaMode = body.settings.paprika_mode || null;
        conversationSettings.set(body.uuid, { paprikaMode });
        persistSettings();
        console.log('[inject.js] Tracked settings for', body.uuid, '→ paprika_mode:', paprikaMode);
      }
    }).catch(() => {});
    return response;
  }

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input.url;

    // Track conversation creation/update responses (POST or PUT to /chat_conversations)
    const convAnyMatch = url.match(CONVERSATION_ANY_RE);
    if (convAnyMatch && init && (init.method === 'POST' || init.method === 'PUT') && !url.includes('completion') && !url.includes('title')) {
      return originalFetch.call(this, input, init).then((response) => trackConversationSettings(response, url));
    }

    // Also track settings from conversation GET responses (without tree=True — the initial load)
    if (convAnyMatch && (!init || !init.method || init.method === 'GET') && !url.includes('tree=True') && !url.includes('completion')) {
      return originalFetch.call(this, input, init).then((response) => trackConversationSettings(response, url));
    }

    // Intercept /api/account response to remove upgrade restrictions
    if (ACCOUNT_RE.test(url) && (!init || !init.method || init.method === 'GET')) {
      return originalFetch.call(this, input, init).then(async (response) => {
        try {
          const body = await response.clone().json();
          // Modify all org memberships to look like a Pro plan
          if (body.memberships) {
            for (const m of body.memberships) {
              if (m.organization) {
                m.organization.billing_type = 'stripe';
                m.organization.rate_limit_tier = 'claude_pro_2025_06';
                if (m.organization.capabilities?.includes('chat') && !m.organization.capabilities.includes('claude_pro')) {
                  m.organization.capabilities.push('claude_pro');
                }
              }
            }
            console.log('[inject.js] Modified account response to remove upgrade gates');
          }
          return new Response(JSON.stringify(body), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        } catch (e) {
          return response;
        }
      });
    }

    // Intercept subscription_details — returns 403 for free accounts but we're
    // spoofing Pro, so return a fake empty subscription to suppress error toasts
    if (SUBSCRIPTION_RE.test(url)) {
      return Promise.resolve(new Response(JSON.stringify({
        subscription: null,
        is_active: false,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    }

    // Intercept completion requests
    const completionMatch = url.match(COMPLETION_RE);
    if (completionMatch) {
      const convId = completionMatch[1];
      console.log('[inject.js] Intercepted completion for conversation:', convId);

      const id = crypto.randomUUID();
      let body = null;
      try {
        body = init && init.body ? JSON.parse(init.body) : null;
      } catch (e) {
        console.error('[inject.js] Failed to parse request body, passing through:', e);
        return originalFetch.call(this, input, init);
      }

      // Attach conversation settings (thinking mode) detected from API responses
      if (body) {
        const convSettings = conversationSettings.get(convId);
        body._thinkingEnabled = convSettings?.paprikaMode === 'extended';
        console.log('[inject.js] Model:', body.model, 'Thinking:', body._thinkingEnabled, '(from API paprika_mode)');
      }

      return new Promise((resolve, reject) => {
        let controller;
        const stream = new ReadableStream({
          start(c) { controller = c; },
        });

        pendingRequests.set(id, {
          controller,
          stream,
          resolve,
          reject,
          url,
          init,
          resolved: false,
          convId,
          requestBody: body,
          assistantText: '',
        });

        window.postMessage(
          { type: 'CLAUDE_INTERCEPT_REQUEST', id, body, url },
          '*'
        );
      });
    }

    // Intercept GET conversation requests to inject tracked messages
    const getMatch = url.match(CONVERSATION_GET_RE);
    if (getMatch && (!init || !init.method || init.method === 'GET')) {
      const convId = getMatch[1];
      const tracker = trackedConversations.get(convId);

      if (tracker && tracker.messages.length > 0) {
        console.log('[inject.js] Intercepting GET conversation to REPLACE with', tracker.messages.length, 'tracked messages');

        return originalFetch.call(this, input, init).then(async (response) => {
          try {
            const body = await response.json();

            // REPLACE server messages entirely with our tracked ones
            // This prevents overlap between server state and our intercepted state
            body.chat_messages = [...tracker.messages];
            body.current_leaf_message_uuid = tracker.messages[tracker.messages.length - 1].uuid;

            console.log('[inject.js] GET response replaced. Messages:', body.chat_messages.length, 'leaf:', body.current_leaf_message_uuid);

            return new Response(JSON.stringify(body), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          } catch (e) {
            console.error('[inject.js] Failed to modify GET response:', e);
            return originalFetch.call(this, input, init);
          }
        });
      }
    }

    // Intercept artifact file download requests — serve from stored artifacts
    const downloadMatch = url.match(DOWNLOAD_FILE_RE);
    if (downloadMatch) {
      const path = decodeURIComponent(downloadMatch[1]);
      const artifact = storedArtifacts.get(path);
      if (artifact) {
        console.log('[inject.js] Serving stored artifact:', path);
        return Promise.resolve(new Response(artifact.content, {
          status: 200,
          headers: { 'content-type': artifact.mimeType + '; charset=utf-8' },
        }));
      }
    }

    // Intercept artifact tools requests — return empty tools
    if (ARTIFACT_TOOLS_RE.test(url)) {
      console.log('[inject.js] Intercepting artifact tools request');
      return Promise.resolve(new Response(JSON.stringify({ tools: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    }

    return originalFetch.call(this, input, init);
  };

  // Clean up old tracked conversations to prevent memory/storage bloat (keep max 20)
  function pruneTrackedConversations() {
    const MAX = 20;
    if (trackedConversations.size > MAX) {
      const keys = [...trackedConversations.keys()];
      const toDelete = keys.slice(0, keys.length - MAX);
      for (const k of toDelete) trackedConversations.delete(k);
      persistTracked();
    }
    if (storedArtifacts.size > 50) {
      const keys = [...storedArtifacts.keys()];
      for (const k of keys.slice(0, keys.length - 50)) storedArtifacts.delete(k);
      persistArtifacts();
    }
    if (conversationSettings.size > 50) {
      const keys = [...conversationSettings.keys()];
      for (const k of keys.slice(0, keys.length - 50)) conversationSettings.delete(k);
      persistSettings();
    }
  }

  // Prune periodically
  setInterval(pruneTrackedConversations, 60000);

  console.log('[inject.js] Claude Intercepter: fetch override installed');
})();
