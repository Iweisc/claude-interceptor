function normalizeTrackedConversation(tracker) {
  if (!tracker || typeof tracker !== 'object') {
    return { messages: [], artifactPaths: [], lastGetResponse: null };
  }

  const messages = Array.isArray(tracker.messages) ? tracker.messages : [];
  const artifactPaths = Array.from(new Set(
    (Array.isArray(tracker.artifactPaths) ? tracker.artifactPaths : [])
      .filter((path) => typeof path === 'string' && path)
  ));

  return {
    ...tracker,
    messages,
    artifactPaths,
    lastGetResponse: tracker.lastGetResponse ?? null,
  };
}

function mergeTrackedConversation(localTracker, syncedTracker) {
  const local = normalizeTrackedConversation(localTracker);
  const synced = normalizeTrackedConversation(syncedTracker);
  const preferred = synced.messages.length > local.messages.length ? synced : local;
  const secondary = preferred === synced ? local : synced;

  return {
    ...secondary,
    ...preferred,
    messages: preferred.messages,
    artifactPaths: Array.from(new Set([
      ...preferred.artifactPaths,
      ...secondary.artifactPaths,
    ])),
    lastGetResponse: preferred.lastGetResponse ?? secondary.lastGetResponse ?? null,
  };
}

function getArtifactEntry(store, path) {
  if (store && typeof store.get === 'function') return store.get(path);
  if (store && typeof store === 'object') return store[path];
  return undefined;
}

function mergeArtifactEntries(localArtifacts, syncedArtifacts) {
  const merged = {};
  const sources = [syncedArtifacts, localArtifacts];

  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const entries = typeof source.entries === 'function'
      ? [...source.entries()]
      : Object.entries(source);
    for (const [path, artifact] of entries) {
      if (typeof path === 'string' && artifact && typeof artifact === 'object') {
        merged[path] = artifact;
      }
    }
  }

  return merged;
}

function buildConversationSyncPayload(tracker, settings, storedArtifacts) {
  const normalizedTracker = normalizeTrackedConversation(tracker);
  const payload = {};

  if (normalizedTracker.messages.length > 0 || normalizedTracker.artifactPaths.length > 0) {
    payload.tracked = normalizedTracker;
  }

  if (settings && typeof settings === 'object' && Object.keys(settings).length > 0) {
    payload.settings = settings;
  }

  const artifacts = {};
  for (const path of normalizedTracker.artifactPaths) {
    const artifact = getArtifactEntry(storedArtifacts, path);
    if (artifact && typeof artifact === 'object') {
      artifacts[path] = artifact;
    }
  }
  if (Object.keys(artifacts).length > 0) {
    payload.artifacts = artifacts;
  }

  return payload;
}

function hydrateConversationSyncState(localTracker, syncedConversation, localArtifacts) {
  const fallbackTracker = normalizeTrackedConversation(syncedConversation?.tracked).messages.length > 0
    ? syncedConversation?.tracked
    : buildTrackedConversationFromHistory(syncedConversation?.id, syncedConversation?.history);

  return {
    tracker: mergeTrackedConversation(localTracker, fallbackTracker),
    settings: syncedConversation?.settings && typeof syncedConversation.settings === 'object'
      ? syncedConversation.settings
      : null,
    artifacts: mergeArtifactEntries(localArtifacts, syncedConversation?.artifacts),
  };
}

function buildTrackedTextContent(text, timestamp) {
  return {
    start_timestamp: timestamp,
    stop_timestamp: timestamp,
    type: 'text',
    text,
    citations: [],
  };
}

function buildTrackedContentBlocks(content, artifactPaths, messageUuid) {
  const timestamp = new Date().toISOString();

  if (typeof content === 'string') {
    return [buildTrackedTextContent(content, timestamp)];
  }

  if (!Array.isArray(content)) {
    return [buildTrackedTextContent(String(content ?? ''), timestamp)];
  }

  const blocks = [];
  for (let index = 0; index < content.length; index++) {
    const part = content[index];
    if (!part || typeof part !== 'object') continue;

    if (part.type === 'text' && typeof part.text === 'string') {
      blocks.push(buildTrackedTextContent(part.text, timestamp));
      continue;
    }

    if (part.type === 'image') {
      blocks.push(buildTrackedTextContent('[Image]', timestamp));
      continue;
    }

    if (part.type === 'thinking' && typeof part.thinking === 'string') {
      blocks.push({
        start_timestamp: timestamp,
        stop_timestamp: timestamp,
        type: 'thinking',
        thinking: part.thinking,
        summaries: [],
        cut_off: false,
        truncated: false,
      });
      continue;
    }

    if (part.type === 'tool_use') {
      const input = part.input && typeof part.input === 'object' ? part.input : {};
      if (typeof input.path === 'string' && input.path && !artifactPaths.includes(input.path)) {
        artifactPaths.push(input.path);
      }

      blocks.push({
        start_timestamp: timestamp,
        stop_timestamp: timestamp,
        type: 'tool_use',
        id: part.id || `${messageUuid}-tool-use-${index}`,
        name: part.name || '',
        input,
        message: part.name === 'create_file' ? 'Creating file' :
                 part.name === 'show_widget' ? 'Rendering' :
                 part.name === 'web_search' ? 'Searching' : 'Working...',
        integration_name: null,
        integration_icon_url: null,
        icon_name: 'file',
        context: null,
        display_content: part.name === 'create_file' && input.file_text ? {
          type: 'json_block',
          json_block: JSON.stringify({
            language: (input.path || '').split('.').pop() || 'text',
            code: input.file_text,
            filename: input.path || 'file.txt',
          }),
        } : null,
      });
      continue;
    }

    if (part.type === 'tool_result') {
      const resultContent = Array.isArray(part.content)
        ? part.content
        : [{
            type: 'text',
            text: typeof part.content === 'string' ? part.content : String(part.content ?? ''),
            uuid: `${messageUuid}-tool-result-${index}`,
          }];

      blocks.push({
        start_timestamp: timestamp,
        stop_timestamp: timestamp,
        type: 'tool_result',
        tool_use_id: part.tool_use_id || '',
        name: part.name || '',
        content: resultContent,
        is_error: false,
        structured_content: null,
        meta: null,
        display_content: null,
      });
    }
  }

  return blocks.length > 0 ? blocks : [buildTrackedTextContent('', timestamp)];
}

function buildTrackedConversationFromHistory(convId, history) {
  const tracker = normalizeTrackedConversation(null);
  const ROOT_UUID = '00000000-0000-4000-8000-000000000000';
  let parentUuid = ROOT_UUID;

  for (let index = 0; index < (Array.isArray(history) ? history.length : 0); index++) {
    const entry = history[index];
    if (!entry || typeof entry !== 'object') continue;

    const isToolResultOnlyUserEntry = entry.role === 'user' &&
      Array.isArray(entry.content) &&
      entry.content.length > 0 &&
      entry.content.every((part) => part && part.type === 'tool_result');

    if (isToolResultOnlyUserEntry) {
      const previousMessage = tracker.messages[tracker.messages.length - 1];
      if (previousMessage && previousMessage.sender === 'assistant') {
        previousMessage.content.push(
          ...buildTrackedContentBlocks(entry.content, tracker.artifactPaths, previousMessage.uuid)
        );
        continue;
      }
    }

    const sender = entry.role === 'assistant' ? 'assistant' : 'human';
    const uuid = `${convId || 'conversation'}-sync-${index}`;
    const timestamp = new Date().toISOString();
    const message = {
      uuid,
      text: '',
      content: buildTrackedContentBlocks(entry.content, tracker.artifactPaths, uuid),
      sender,
      index: tracker.messages.length,
      created_at: timestamp,
      updated_at: timestamp,
      truncated: false,
      attachments: [],
      files: [],
      files_v2: [],
      sync_sources: [],
      parent_message_uuid: parentUuid,
    };

    if (sender === 'assistant') {
      message.stop_reason = 'stop_sequence';
    }

    tracker.messages.push(message);
    parentUuid = uuid;
  }

  return normalizeTrackedConversation(tracker);
}

function normalizeLegacySkillFiles(skill) {
  const files = Array.isArray(skill?.files)
    ? skill.files.filter((file) => file && typeof file.path === 'string' && typeof file.content === 'string')
    : [];

  if (files.length > 0) return files;

  return [{
    path: 'SKILL.md',
    content: typeof skill?.prompt === 'string' ? skill.prompt : '',
  }];
}

function mapLegacySkillRowToClaudeSkill(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    creator_type: row.creator_type || 'user',
    updated_at: row.updated_at || row.created_at || new Date().toISOString(),
    enabled: row.enabled !== false,
    partition_by: row.partition_by || 'user',
    is_public_provisioned: row.is_public_provisioned === true,
    user_invocable: row.user_invocable !== false,
    is_shared: row.is_shared === true,
  };
}

function buildLegacySkillDetail(skill) {
  return {
    ...mapLegacySkillRowToClaudeSkill(skill),
    instructions: typeof skill?.prompt === 'string' ? skill.prompt : '',
    prompt: typeof skill?.prompt === 'string' ? skill.prompt : '',
    files: normalizeLegacySkillFiles(skill),
  };
}

async function safeParseJsonResponse(response) {
  if (!response) return null;

  const contentType = response.headers?.get ? (response.headers.get('content-type') || '') : '';
  const text = await response.text();
  const trimmed = text.trim();
  const looksJson = /json/i.test(contentType) || trimmed.startsWith('{') || trimmed.startsWith('[');

  if (!looksJson) return null;

  try {
    return JSON.parse(trimmed);
  } catch (e) {
    return null;
  }
}

function slugifySkillId(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let crc = index;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[index] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index++) {
    crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatUint8Arrays(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function buildStoredZipBuffer(files) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const dataBytes = encoder.encode(file.content || '');
    const checksum = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localChunks.push(localHeader, dataBytes);
    centralChunks.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirectory = concatUint8Arrays(centralChunks);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return concatUint8Arrays([...localChunks, centralDirectory, endRecord]);
}

function buildLegacySkillArchiveBuffer(skill) {
  return buildStoredZipBuffer(normalizeLegacySkillFiles(skill));
}

(function () {
  'use strict';
  if (typeof window === 'undefined') return;

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

  const COMPLETION_RE = /\/api\/organizations\/[^/]+\/chat_conversations\/([^/]+)\/(completion|retry_completion)$/;
  const CONVERSATION_GET_RE = /\/api\/organizations\/[^/]+\/chat_conversations\/([^/?]+)\?.*tree=True/;
  const CONVERSATION_ANY_RE = /\/api\/organizations\/[^/]+\/chat_conversations\/([^/?]+)/;
  const ACCOUNT_RE = /\/api\/account$/;
  const BOOTSTRAP_RE = /\/api\/bootstrap\/[^/]+\/app_start/;
  const SUBSCRIPTION_RE = /\/api\/organizations\/[^/]+\/subscription_details/;
  const MEMORY_RE = /\/api\/organizations\/[^/]+\/memory$/;
  const SKILLS_LIST_RE = /\/api\/organizations\/[^/]+\/skills\/list-skills(?:\?.*)?$/;
  const ORG_SKILLS_LIST_RE = /\/api\/organizations\/[^/]+\/skills\/list-org-skills(?:\?.*)?$/;
  const SKILL_DOWNLOAD_RE = /\/api\/organizations\/[^/]+\/skills\/download-dot-skill-file(?:\?.*)?$/;
  const SKILL_UPLOAD_RE = /\/api\/organizations\/[^/]+\/skills\/upload-skill(?:\?.*)?$/;
  const SKILL_UPLOAD_ORG_RE = /\/api\/organizations\/[^/]+\/skills\/upload-org-skill(?:\?.*)?$/;
  const SKILL_CREATE_SIMPLE_RE = /\/api\/organizations\/[^/]+\/skills\/create-simple-skill(?:\?.*)?$/;
  const SKILL_EDIT_SIMPLE_RE = /\/api\/organizations\/[^/]+\/skills\/edit-simple-skill(?:\?.*)?$/;
  const SKILL_ENABLE_RE = /\/api\/organizations\/[^/]+\/skills\/enable-skill(?:\?.*)?$/;
  const SKILL_DISABLE_RE = /\/api\/organizations\/[^/]+\/skills\/disable-skill(?:\?.*)?$/;
  const SKILL_DELETE_RE = /\/api\/organizations\/[^/]+\/skills\/delete-skill(?:\?.*)?$/;
  const SKILL_DELETE_ORG_RE = /\/api\/organizations\/[^/]+\/skills\/delete-org-skill(?:\?.*)?$/;
  const SKILL_DUPLICATE_RE = /\/api\/organizations\/[^/]+\/skills\/duplicate-skill(?:\?.*)?$/;
  const SKILL_RENAME_RE = /\/api\/organizations\/[^/]+\/skills\/rename-skill(?:\?.*)?$/;
  const SKILL_DETAIL_RE = /\/api\/organizations\/[^/]+\/skills\/([^/?]+)(?:\?.*)?$/;
  const PROJECTS_RE = /\/api\/organizations\/[^/]+\/projects/;
  const DOWNLOAD_FILE_RE = /\/wiggle\/download-file\?path=([^&]+)/;
  const ARTIFACT_TOOLS_RE = /\/artifacts\/wiggle_artifact\/[^/]+\/tools/;
  const VOICE_WS_RE = /\/api\/ws\/voice\//;
  const originalFetch = window.fetch;
  const originalWebSocket = window.WebSocket;
  const pendingRequests = new Map();

  // Override XHR to redirect completion/retry_completion through our fetch pipeline
  const OrigXHR = window.XMLHttpRequest;
  const origXHROpen = OrigXHR.prototype.open;
  const origXHRSend = OrigXHR.prototype.send;
  OrigXHR.prototype.open = function (method, url, ...rest) {
    this._interceptUrl = url;
    this._interceptMethod = method;
    return origXHROpen.call(this, method, url, ...rest);
  };
  OrigXHR.prototype.send = function (body) {
    const url = this._interceptUrl || '';
    if (COMPLETION_RE.test(url) && this._interceptMethod === 'POST') {
      console.log('[inject.js] XHR completion intercepted, redirecting through fetch pipeline:', url);
      window.fetch(url, {
        method: 'POST',
        body: body,
        headers: { 'content-type': 'application/json' },
      }).then(async (resp) => {
        const text = await resp.text();
        Object.defineProperty(this, 'readyState', { value: 4, writable: true });
        Object.defineProperty(this, 'status', { value: resp.status, writable: true });
        Object.defineProperty(this, 'statusText', { value: resp.statusText, writable: true });
        Object.defineProperty(this, 'responseText', { value: text, writable: true });
        Object.defineProperty(this, 'response', { value: text, writable: true });
        if (this.onreadystatechange) this.onreadystatechange(new Event('readystatechange'));
        if (this.onload) this.onload(new ProgressEvent('load'));
        this.dispatchEvent(new Event('load'));
      }).catch(() => {
        if (this.onerror) this.onerror(new ProgressEvent('error'));
        this.dispatchEvent(new Event('error'));
      });
      return;
    }
    return origXHRSend.call(this, body);
  };


  // Central infrastructure — hardcoded
  const _syncUrl = 'https://sync-interceptor.usw-1.sealos.app';
  const _syncKey = 'bd8ff72b3b454aa9923b988b9ba3c64e43f5838a275a98f6f717f87aed7bd9dc';

  // LiteLLM settings (loaded from extension storage via content.js for voice mode)
  let _litellmEndpoint = '';
  let _litellmApiKey = '';
  window.postMessage({ type: 'CLAUDE_INTERCEPT_GET_SETTINGS' }, '*');
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'CLAUDE_INTERCEPT_SETTINGS') {
      _litellmEndpoint = event.data.endpoint || '';
      _litellmApiKey = event.data.apiKey || '';
    }
  });

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
  const trackedConversations = new Map(
    Object.entries(_trackedData).map(([convId, tracker]) => [convId, normalizeTrackedConversation(tracker)])
  );

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

  async function getSyncUserEmail() {
    try {
      const acctResp = await originalFetch.call(window, '/api/account');
      if (!acctResp.ok) return '';
      const acctData = await acctResp.json();
      return acctData.email_address || acctData.email || '';
    } catch (e) {
      return '';
    }
  }

  async function fetchSync(path, options) {
    const email = await getSyncUserEmail();
    if (!email) return null;

    const headers = new Headers(options?.headers || {});
    headers.set('authorization', 'Bearer ' + _syncKey);
    headers.set('x-user-id', email);

    return originalFetch.call(window, _syncUrl + path, {
      ...options,
      headers,
    });
  }

  function buildForwardedJsonResponse(response, text) {
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
    });
  }

  function mergeSkills(realSkills, syncSkills) {
    const merged = new Map();
    for (const skill of Array.isArray(realSkills) ? realSkills : []) {
      const key = skill?.id || skill?.uuid || skill?.name;
      if (key) merged.set(key, skill);
    }
    for (const skill of Array.isArray(syncSkills) ? syncSkills : []) {
      const key = skill?.id || skill?.uuid || skill?.name;
      if (key) merged.set(key, skill);
    }
    return [...merged.values()];
  }

  async function forwardSkillJsonRequest(path, init, fallback) {
    try {
      const syncResp = await fetchSync(path, {
        method: init?.method || 'POST',
        headers: { 'content-type': 'application/json' },
        body: init?.body,
      });
      if (!syncResp) return fallback();

      const text = await syncResp.text();
      return buildForwardedJsonResponse(syncResp, text);
    } catch (e) {
      return fallback();
    }
  }

  async function forwardSkillUploadRequest(path, init, fallback) {
    try {
      const syncResp = await fetchSync(path, {
        method: init?.method || 'POST',
        body: init?.body,
      });
      if (!syncResp) return fallback();

      const text = await syncResp.text();
      return buildForwardedJsonResponse(syncResp, text);
    } catch (e) {
      return fallback();
    }
  }

  async function fetchCompatibleSkillList(partitionBy) {
    const preferredPath = partitionBy === 'organization'
      ? '/api/skills/list-org-skills'
      : '/api/skills/list-skills';

    const preferredResp = await fetchSync(preferredPath, { method: 'GET' });
    const preferredData = await safeParseJsonResponse(preferredResp);
    if (preferredData?.skills && Array.isArray(preferredData.skills)) {
      return preferredData.skills;
    }

    const legacyResp = await fetchSync('/api/skills', { method: 'GET' });
    const legacyData = await safeParseJsonResponse(legacyResp);
    if (!legacyData?.skills || !Array.isArray(legacyData.skills)) {
      return null;
    }

    return legacyData.skills
      .map(mapLegacySkillRowToClaudeSkill)
      .filter((skill) => !partitionBy || skill.partition_by === partitionBy);
  }

  async function fetchCompatibleSkillDetail(skillId) {
    const preferredResp = await fetchSync('/api/skills/' + encodeURIComponent(skillId), { method: 'GET' });
    const preferredData = await safeParseJsonResponse(preferredResp);
    if (preferredData && typeof preferredData === 'object' && preferredData.id) {
      return preferredData;
    }

    const legacyResp = await fetchSync('/api/skills', { method: 'GET' });
    const legacyData = await safeParseJsonResponse(legacyResp);
    if (!legacyData?.skills || !Array.isArray(legacyData.skills)) {
      return null;
    }

    const legacySkill = legacyData.skills.find((skill) =>
      skill?.id === skillId || slugifySkillId(skill?.name) === skillId
    );
    return legacySkill ? buildLegacySkillDetail(legacySkill) : null;
  }

  const pendingConversationSyncs = new Map();

  async function syncConversationState(convId) {
    if (!convId) return;

    const tracker = normalizeTrackedConversation(trackedConversations.get(convId));
    trackedConversations.set(convId, tracker);

    const payload = buildConversationSyncPayload(
      tracker,
      conversationSettings.get(convId),
      storedArtifacts
    );

    if (Object.keys(payload).length === 0) return;

    const resp = await fetchSync('/api/conversations/' + convId, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp || !resp.ok) {
      throw new Error(`sync state failed for ${convId}`);
    }
  }

  function scheduleConversationStateSync(convId, delay = 150) {
    if (!convId) return;

    const existingTimer = pendingConversationSyncs.get(convId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      pendingConversationSyncs.delete(convId);
      syncConversationState(convId).catch((e) => {
        console.warn('[inject.js] Conversation state sync failed for', convId, e);
      });
    }, delay);

    pendingConversationSyncs.set(convId, timer);
  }

  async function hydrateConversationStateFromSync(convId) {
    if (!convId) return normalizeTrackedConversation(trackedConversations.get(convId));

    const syncResp = await fetchSync('/api/conversations/' + convId, { method: 'GET' });
    if (!syncResp || !syncResp.ok) {
      return normalizeTrackedConversation(trackedConversations.get(convId));
    }

    const syncedConversation = await syncResp.json();
    const hadSyncedTracked = normalizeTrackedConversation(syncedConversation?.tracked).messages.length > 0;
    const hydrated = hydrateConversationSyncState(
      trackedConversations.get(convId),
      syncedConversation,
      storedArtifacts
    );

    trackedConversations.set(convId, hydrated.tracker);
    persistTracked();

    if (hydrated.settings && Object.keys(hydrated.settings).length > 0) {
      conversationSettings.set(convId, hydrated.settings);
      persistSettings();
    }

    let wroteArtifacts = false;
    for (const [path, artifact] of Object.entries(hydrated.artifacts)) {
      const previous = storedArtifacts.get(path);
      if (!previous || previous.content !== artifact.content || previous.mimeType !== artifact.mimeType) {
        wroteArtifacts = true;
      }
      storedArtifacts.set(path, artifact);
    }
    if (wroteArtifacts) persistArtifacts();

    if (!hadSyncedTracked && hydrated.tracker.messages.length > 0) {
      scheduleConversationStateSync(convId, 0);
    }

    return hydrated.tracker;
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
    const tracker = normalizeTrackedConversation(trackedConversations.get(convId));
    trackedConversations.set(convId, tracker);
    return tracker;
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
                const cb = parsed.content_block || {};
                pending.contentBlocks[parsed.index] = {
                  type: cb.type || 'text',
                  name: cb.name || '',
                  id: cb.id || '',
                  toolUseId: cb.tool_use_id || '',
                  text: '',
                  thinking: '',
                  toolInput: '',
                  resultContent: cb.content || [],
                  displayContent: cb.display_content || null,
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
                      if (pending.convId) {
                        const tracker = getConvTracker(pending.convId);
                        if (!tracker.artifactPaths.includes(input.path)) {
                          tracker.artifactPaths.push(input.path);
                          persistTracked();
                        }
                        scheduleConversationStateSync(pending.convId);
                      }
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
        // Delay stream close to let browser flush all enqueued chunks
        setTimeout(() => {
          try { pending.controller.close(); } catch (e) {}
        }, 100);

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

          // Build assistant content with ALL block types preserved
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
              } else if (block.type === 'tool_use') {
                let parsedInput = {};
                try { parsedInput = JSON.parse(block.toolInput || '{}'); } catch (e) {}
                assistantContent.push({
                  start_timestamp: now, stop_timestamp: now,
                  type: 'tool_use', id: block.id || crypto.randomUUID(),
                  name: block.name || '', input: parsedInput,
                  message: block.name === 'create_file' ? 'Creating file' :
                           block.name === 'show_widget' ? 'Rendering' :
                           block.name === 'web_search' ? 'Searching' : 'Working...',
                  integration_name: null, integration_icon_url: null,
                  icon_name: 'file', context: null,
                  display_content: block.name === 'create_file' && parsedInput.file_text ? {
                    type: 'json_block',
                    json_block: JSON.stringify({
                      language: (parsedInput.path || '').split('.').pop() || 'text',
                      code: parsedInput.file_text,
                      filename: parsedInput.path || 'file.txt',
                    }),
                  } : null,
                });
              } else if (block.type === 'tool_result') {
                assistantContent.push({
                  start_timestamp: now, stop_timestamp: now,
                  type: 'tool_result', tool_use_id: block.toolUseId || '',
                  name: block.name || '', content: block.resultContent || [],
                  is_error: false, structured_content: null, meta: null,
                  display_content: block.displayContent || null,
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
          scheduleConversationStateSync(pending.convId);
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

  // Helper: read a response, extract conversation settings, return a new response.
  // MUST await the JSON parse so settings are available before the completion fires.
  async function trackConversationSettings(response, url) {
    try {
      const body = await response.json();
      if (body.uuid && body.settings) {
        const paprikaMode = body.settings.paprika_mode || null;
        const compassMode = body.settings.compass_mode || null;
        const isTemporary = body.is_temporary === true;
        conversationSettings.set(body.uuid, { paprikaMode, compassMode, isTemporary });
        persistSettings();
        scheduleConversationStateSync(body.uuid);
        console.log('[inject.js] Tracked settings for', body.uuid, '→ paprika:', paprikaMode, 'compass:', compassMode, 'temp:', isTemporary);
      }
      // Return a new Response since we consumed the body
      return new Response(JSON.stringify(body), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (e) {
      return response;
    }
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

    // Intercept bootstrap/app_start to spoof Pro plan (Chrome has no filterResponseData)
    if (BOOTSTRAP_RE.test(url) && (!init || !init.method || init.method === 'GET')) {
      return originalFetch.call(this, input, init).then(async (response) => {
        try {
          const body = await response.clone().json();
          if (body.account?.memberships) {
            for (const m of body.account.memberships) {
              if (m.organization?.capabilities?.includes('chat')) {
                m.organization.billing_type = 'stripe';
                m.organization.rate_limit_tier = 'claude_pro_2025_06';
                m.organization.free_credits_status = null;
                if (!m.organization.capabilities.includes('claude_pro')) {
                  m.organization.capabilities.push('claude_pro');
                }
              }
            }
          }
          console.log('[inject.js] Modified bootstrap response for Pro plan');
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

    // Intercept memory API — serve from sync server if configured
    if (MEMORY_RE.test(url) && (!init || !init.method || init.method === 'GET')) {
      {
        return (async () => {
          try {
            // Get user email from account endpoint (cached by the page)
            let email = '';
            try {
              const acctResp = await originalFetch.call(window, '/api/account');
              const acctData = await acctResp.json();
              email = acctData.email_address || acctData.email || '';
            } catch (e) {}
            if (!email) {
              return originalFetch.call(this, input, init);
            }
            const resp = await originalFetch.call(window, _syncUrl + '/api/memories', {
              headers: {
                'authorization': 'Bearer ' + _syncKey,
                'x-user-id': email,
              },
            });
            const data = await resp.json();
            const formatted = (data.memories || []).map(m => {
              const date = new Date(m.created_at).toISOString().split('T')[0];
              return `[${date}] - ${m.text}`;
            }).join('\n');
            // Return in claude.ai format
            return new Response(JSON.stringify({
              memory: '',
              controls: formatted ? [formatted] : [],
              updated_at: new Date().toISOString(),
            }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          } catch (e) {
            console.warn('[inject.js] Memory fetch failed, falling through:', e);
            return originalFetch.call(this, input, init);
          }
        })();
      }
    }

    if (SKILLS_LIST_RE.test(url) && (!init || !init.method || init.method === 'GET')) {
      return (async () => {
        try {
          const syncSkills = await fetchCompatibleSkillList('user');
          if (!syncSkills) return originalFetch.call(this, input, init);

          let realSkills = [];
          try {
            const realResp = await originalFetch.call(this, input, init);
            const realData = await realResp.json();
            realSkills = realData.skills || realData || [];
          } catch (e) {}

          return new Response(JSON.stringify({
            skills: mergeSkills(realSkills, syncSkills),
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        } catch (e) {
          console.warn('[inject.js] Skills list proxy failed, falling through:', e);
          return originalFetch.call(this, input, init);
        }
      })();
    }

    if (ORG_SKILLS_LIST_RE.test(url) && (!init || !init.method || init.method === 'GET')) {
      return (async () => {
        try {
          const syncSkills = await fetchCompatibleSkillList('organization');
          if (!syncSkills) return originalFetch.call(this, input, init);

          let realSkills = [];
          try {
            const realResp = await originalFetch.call(this, input, init);
            const realData = await realResp.json();
            realSkills = realData.skills || realData || [];
          } catch (e) {}

          return new Response(JSON.stringify({
            skills: mergeSkills(realSkills, syncSkills),
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        } catch (e) {
          console.warn('[inject.js] Org skills list proxy failed, falling through:', e);
          return originalFetch.call(this, input, init);
        }
      })();
    }

    if (SKILL_DOWNLOAD_RE.test(url) && (!init || !init.method || init.method === 'GET')) {
      return (async () => {
        try {
          const parsedUrl = new URL(url, window.location.origin);
          const skillId = parsedUrl.searchParams.get('skill_id');
          if (!skillId) return originalFetch.call(this, input, init);

          const syncResp = await fetchSync('/api/skills/download-dot-skill-file?skill_id=' + encodeURIComponent(skillId), { method: 'GET' });
          let body;
          let contentType = 'application/zip';
          let contentDisposition = `attachment; filename="${skillId}.skill"`;

          if (syncResp && syncResp.ok) {
            body = await syncResp.arrayBuffer();
            contentType = syncResp.headers.get('content-type') || contentType;
            contentDisposition = syncResp.headers.get('content-disposition') || contentDisposition;
          } else {
            const legacySkill = await fetchCompatibleSkillDetail(skillId);
            if (!legacySkill) return originalFetch.call(this, input, init);
            body = buildLegacySkillArchiveBuffer(legacySkill);
          }

          return new Response(body, {
            status: 200,
            headers: {
              'content-type': contentType,
              'content-disposition': contentDisposition,
            },
          });
        } catch (e) {
          console.warn('[inject.js] Skill download proxy failed, falling through:', e);
          return originalFetch.call(this, input, init);
        }
      })();
    }

    if (SKILL_UPLOAD_RE.test(url)) {
      const parsedUrl = new URL(url, window.location.origin);
      return forwardSkillUploadRequest('/api/skills/upload-skill' + parsedUrl.search, init, () => originalFetch.call(this, input, init));
    }

    if (SKILL_UPLOAD_ORG_RE.test(url)) {
      const parsedUrl = new URL(url, window.location.origin);
      return forwardSkillUploadRequest('/api/skills/upload-org-skill' + parsedUrl.search, init, () => originalFetch.call(this, input, init));
    }

    if (SKILL_CREATE_SIMPLE_RE.test(url)) {
      return forwardSkillJsonRequest('/api/skills/create-simple-skill', init, () => originalFetch.call(this, input, init));
    }

    if (SKILL_EDIT_SIMPLE_RE.test(url)) {
      return forwardSkillJsonRequest('/api/skills/edit-simple-skill', init, () => originalFetch.call(this, input, init));
    }

    if (SKILL_ENABLE_RE.test(url)) {
      return forwardSkillJsonRequest('/api/skills/enable-skill', init, () => originalFetch.call(this, input, init));
    }

    if (SKILL_DISABLE_RE.test(url)) {
      return forwardSkillJsonRequest('/api/skills/disable-skill', init, () => originalFetch.call(this, input, init));
    }

    if (SKILL_DELETE_RE.test(url)) {
      return forwardSkillJsonRequest('/api/skills/delete-skill', init, () => originalFetch.call(this, input, init));
    }

    if (SKILL_DELETE_ORG_RE.test(url)) {
      return forwardSkillJsonRequest('/api/skills/delete-org-skill', init, () => originalFetch.call(this, input, init));
    }

    if (SKILL_DUPLICATE_RE.test(url)) {
      return forwardSkillJsonRequest('/api/skills/duplicate-skill', init, () => originalFetch.call(this, input, init));
    }

    if (SKILL_RENAME_RE.test(url)) {
      return forwardSkillJsonRequest('/api/skills/rename-skill', init, () => originalFetch.call(this, input, init));
    }

    const skillDetailMatch = url.match(SKILL_DETAIL_RE);
    if (skillDetailMatch && (!init || !init.method || init.method === 'GET')) {
      return (async () => {
        try {
          const skill = await fetchCompatibleSkillDetail(skillDetailMatch[1]);
          if (!skill) return originalFetch.call(this, input, init);

          return new Response(JSON.stringify(skill), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        } catch (e) {
          console.warn('[inject.js] Skill detail proxy failed, falling through:', e);
          return originalFetch.call(this, input, init);
        }
      })();
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

      // Detect thinking/compass/incognito from tracked conversation settings
      if (body) {
        const convSettings = conversationSettings.get(convId);
        if (convSettings) {
          body._thinkingEnabled = convSettings.paprikaMode === 'extended';
          if (convSettings.compassMode === 'advanced') body._compassMode = true;
          if (convSettings.isTemporary) body.is_temporary = true;
        }
        console.log('[inject.js] Model:', body.model, 'Thinking:', body._thinkingEnabled ?? 'ext default', 'Compass:', body._compassMode || false, 'Incognito:', body.is_temporary || false);
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
      return (async () => {
        const tracker = await hydrateConversationStateFromSync(convId);
        if (!tracker || tracker.messages.length === 0) {
          return originalFetch.call(this, input, init);
        }

        console.log('[inject.js] Intercepting GET conversation to REPLACE with', tracker.messages.length, 'tracked messages');

        return originalFetch.call(this, input, init).then(async (response) => {
          try {
            const body = await response.json();

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
      })();
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

  // ========================================================================
  // Voice Mode: Intercept WebSocket → STT (Web Speech API) → LiteLLM → TTS (OpenAI via LiteLLM)
  // ========================================================================
  window.WebSocket = function (url, protocols) {
    // Only intercept voice WebSocket connections
    if (typeof url === 'string' && VOICE_WS_RE.test(url)) {
      console.log('[inject.js] Intercepting voice WebSocket:', url);
      return new VoicePipeline(url);
    }
    // Pass through all other WebSocket connections
    if (protocols !== undefined) {
      return new originalWebSocket(url, protocols);
    }
    return new originalWebSocket(url);
  };
  // Preserve WebSocket static properties
  window.WebSocket.CONNECTING = originalWebSocket.CONNECTING;
  window.WebSocket.OPEN = originalWebSocket.OPEN;
  window.WebSocket.CLOSING = originalWebSocket.CLOSING;
  window.WebSocket.CLOSED = originalWebSocket.CLOSED;
  window.WebSocket.prototype = originalWebSocket.prototype;

  class VoicePipeline extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.readyState = 1; // OPEN
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
      this.binaryType = 'arraybuffer';
      this.extensions = '';
      this.protocol = '';
      this.bufferedAmount = 0;
      this._recognition = null;
      this._transcriptBuffer = '';
      this._speaking = false;

      // Fire onopen asynchronously, then send ready events the app expects
      setTimeout(() => {
        const openEvt = new Event('open');
        if (this.onopen) this.onopen(openEvt);
        this.dispatchEvent(openEvt);
        this._emit({ type: 'session_begin' });
        this._emit({ type: 'ready' });
        this._emit({ type: 'state', state: 'listening' });
      }, 50);

      this._startSTT();
    }

    _startSTT() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.warn('[voice] SpeechRecognition not available in this browser');
        setTimeout(() => {
          this._emit({ type: 'error', error: 'speech_recognition_unavailable', message: 'Speech recognition is not supported in this browser. Try Chrome.' });
        }, 200);
        return;
      }
      this._recognition = new SpeechRecognition();
      this._recognition.continuous = true;
      this._recognition.interimResults = true;
      this._recognition.lang = 'en-US';

      this._recognition.onresult = (event) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }
        // Send interim transcript event
        if (interim) {
          this._emit({ type: 'TranscriptInterim', text: interim });
        }
        if (final) {
          this._transcriptBuffer += final;
          this._emit({ type: 'TranscriptText', text: final });
        }
      };

      this._recognition.onend = () => {
        // Recognition ended (user stopped speaking)
        if (this._transcriptBuffer.trim() && !this._speaking) {
          this._emit({ type: 'TranscriptEndpoint' });
          this._processTranscript(this._transcriptBuffer.trim());
          this._transcriptBuffer = '';
        }
      };

      this._recognition.onerror = (e) => {
        console.warn('[voice] STT error:', e.error);
      };

      try {
        this._recognition.start();
        console.log('[voice] STT started');
      } catch (e) {
        console.warn('[voice] STT start failed:', e);
      }
    }

    async _processTranscript(text) {
      this._speaking = true;
      console.log('[voice] Processing transcript:', text.substring(0, 80));

      try {
        // Send as completion through the existing interception pipeline
        // The page will handle it via the normal completion flow
        // For voice, we also need TTS output
        if (_litellmEndpoint && _litellmApiKey) {
          // Direct API call for voice (non-streaming, simpler)
          const resp = await originalFetch.call(window, _litellmEndpoint + '/v1/messages', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'anthropic-version': '2023-06-01',
              'x-api-key': _litellmApiKey,
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6',
              max_tokens: 1024,
              messages: [{ role: 'user', content: text }],
            }),
          });

          if (resp.ok) {
            const data = await resp.json();
            const responseText = data.content?.map(b => b.text).join('') || '';
            // Send transcript of response
            this._emit({ type: 'TranscriptText', text: responseText });

            // TTS via OpenAI-compatible endpoint on LiteLLM
            await this._speak(responseText);
          }
        }
      } catch (e) {
        console.error('[voice] Processing error:', e);
      }

      this._speaking = false;
      // Restart recognition for next utterance
      if (this.readyState === 1 && this._recognition) {
        try { this._recognition.start(); } catch (e) {}
      }
    }

    async _speak(text) {
      if (!text || !_litellmEndpoint || !_litellmApiKey) return;
      try {
        const resp = await originalFetch.call(window, _litellmEndpoint + '/v1/audio/speech', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'authorization': 'Bearer ' + _litellmApiKey,
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: text.substring(0, 4096),
            voice: 'alloy',
            response_format: 'mp3',
          }),
        });
        if (resp.ok) {
          const blob = await resp.blob();
          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          await audio.play();
          // Wait for audio to finish
          await new Promise(resolve => {
            audio.onended = resolve;
            audio.onerror = resolve;
          });
          URL.revokeObjectURL(audioUrl);
        }
      } catch (e) {
        console.warn('[voice] TTS error:', e);
        // Fallback to browser TTS
        if (window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(text);
          window.speechSynthesis.speak(utterance);
        }
      }
    }

    _emit(data) {
      const evt = new MessageEvent('message', { data: JSON.stringify(data) });
      if (this.onmessage) this.onmessage(evt);
      this.dispatchEvent(evt);
    }

    send(data) {
      // Handle binary (audio) data -- ignored (we use browser STT instead)
      if (data instanceof ArrayBuffer || data instanceof Blob) return;
      // Handle JSON control messages
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'signal_input_end') {
          // User stopped talking
          if (this._recognition) {
            try { this._recognition.stop(); } catch (e) {}
          }
        } else if (msg.type === 'interrupt') {
          // Stop TTS playback
          if (window.speechSynthesis) window.speechSynthesis.cancel();
        } else if (msg.type === 'CloseStream') {
          this.close();
        }
      } catch (e) {}
    }

    close() {
      this.readyState = 3; // CLOSED
      if (this._recognition) {
        try { this._recognition.stop(); } catch (e) {}
      }
      const evt = new CloseEvent('close');
      if (this.onclose) this.onclose(evt);
      this.dispatchEvent(evt);
    }
  }

  console.log('[inject.js] Claude Intercepter: fetch + voice override installed');
})();
