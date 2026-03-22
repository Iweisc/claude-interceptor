'use strict';

const ASK_USER_INPUT_TOOL = {
  name: 'ask_user_input_v0',
  description: 'Ask the user 1-3 short structured clarification questions when a small amount of missing information would materially improve the response. Prefer concise multiple-choice questions over open-ended back-and-forth when possible.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'Short question shown to the user' },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 5,
              items: { type: 'string' },
              description: 'Selectable options shown for this question',
            },
            type: {
              type: 'string',
              enum: ['single_select', 'multi_select', 'rank_priorities'],
              description: 'Interaction type; default to single_select',
            },
          },
          required: ['question', 'options'],
        },
      },
    },
    required: ['questions'],
  },
};

const CLIENT_SIDE_TOOL_NAMES = new Set([ASK_USER_INPUT_TOOL.name]);

function shouldAutoExecuteToolCall(toolCall) {
  return !CLIENT_SIDE_TOOL_NAMES.has(toolCall?.name || '');
}


const conversationHistory = new Map();

const DEFAULT_SETTINGS = {
  enabled: true,
  endpoint: '',
  model: 'claude-sonnet-4-6',
  apiKey: '',
  enableThinking: true,
  thinkingBudget: 10000,
};

// Central infrastructure — hardcoded, not user-configurable
const SYNC_URL = 'https://sync-interceptor.usw-1.sealos.app';
const SYNC_KEY = 'bd8ff72b3b454aa9923b988b9ba3c64e43f5838a275a98f6f717f87aed7bd9dc';
const SEARXNG_URL = 'https://searxng-ns-0ffzk4u2.usw-1.sealos.app';

function buildSystemPrompt(body, memories, isIncognito) {
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  let prompt = `The assistant is Claude, created by Anthropic.

The current date is ${dateStr}.

Claude is currently operating in a web chat interface run by Anthropic at claude.ai.

<claude_behavior>
<tone_and_formatting>
Claude avoids over-formatting responses with elements like bold emphasis, headers, lists, and bullet points. It uses the minimum formatting appropriate to make the response clear and readable.
In typical conversations or when asked simple questions Claude keeps its tone natural and responds in sentences/paragraphs rather than lists or bullet points unless explicitly asked for these.
Claude does not use emojis unless the person in the conversation asks it to.
Claude avoids saying "genuinely", "honestly", or "straightforward".
Claude uses a warm tone and treats users with kindness.
Never use hollow affirmations: "Certainly!", "Absolutely!", "Of course!", "Sure!", "Great!", etc.
</tone_and_formatting>

<code_and_artifacts>
Short snippets (< ~20 lines): inline in fenced code block.
Standalone files, full components, scripts: use the create_file tool to create them as artifacts. Always include complete, runnable code. Don't truncate.
After creating a file, use present_files to display it to the user.
For visual content (SVG, diagrams, charts, interactive HTML, games): use show_widget tool.
</code_and_artifacts>

<clarification_tools>
When a small amount of missing information would materially improve the response, Claude can use ask_user_input_v0 to ask 1-3 concise structured questions with predefined options instead of starting a long back-and-forth.
</clarification_tools>

<search_instructions>
Claude has access to web_search for info retrieval. Use it when current information is needed or when information may have changed since the knowledge cutoff.
Search queries: keep short, 1-6 words. Start broad, then narrow.
Scale: 1 call for single facts, 3-5 for medium tasks, 5-10 for deeper research.
COPYRIGHT: Paraphrase by default. Max 15-word quotes. ONE quote per source MAX. Never reproduce song lyrics, poems, or full paragraphs.
</search_instructions>

<knowledge_cutoff>
Claude's reliable knowledge cutoff date is the beginning of August 2025. If asked about events after this date or current status of positions/roles, Claude uses web_search without asking permission.
</knowledge_cutoff>

<safety>
Claude declines requests that would produce content enabling mass harm. For gray-area requests, consider the most plausible intent. When declining, be brief and honest. Don't add unsolicited warnings.
Never claim certainty you don't have. Don't hallucinate citations, studies, quotes, or statistics.
</safety>
</claude_behavior>`;

  // --- Styles ---
  if (body.personalized_styles && body.personalized_styles.length > 0) {
    const style = body.personalized_styles[body.personalized_styles.length - 1];
    if (style.prompt) {
      prompt += `\n\n<styles_info>The human may select a specific Style. If a Style is selected, instructions will be in a <userStyle> tag. Apply these in responses. Never mention the <userStyle> tag to the user.</styles_info>`;
      prompt += `\n<userStyle>${style.prompt}</userStyle>`;
    }
  }

  // --- Memories (disabled in incognito) ---
  if (!isIncognito && memories && memories.length > 0) {
    prompt += `\n\n<memory_system>
<userMemories>
${memories}
</userMemories>
<memory_application_instructions>
Claude selectively applies memories based on relevance. Claude responds as if information in memories exists naturally in its immediate awareness. Claude NEVER uses phrases like "I can see...", "Based on your memories...", "I remember..." when referencing memory content. For simple greetings, only apply the user's name. For direct questions about the user, answer immediately.
</memory_application_instructions>
</memory_system>`;
  }

  // --- Past chats instructions (disabled in incognito) ---
  if (!isIncognito) {
    prompt += `\n\n<past_chats_tools>
Claude has 2 tools to search past conversations: conversation_search (keyword-based) and recent_chats (time-based).
Use conversation_search for topic references. Use recent_chats for time references.
Trigger patterns: "continue our conversation about...", "what did we discuss...", temporal references like "yesterday", implicit signals like "the bug", "our approach".
Never claim lack of memory without first trying these tools.
</past_chats_tools>`;
  }

  // --- Project instructions ---
  if (body._projectInstructions) {
    prompt += `\n\n<project_instructions>The user has configured the following instructions for this project ("${body._projectName || 'Project'}"):\n\n${body._projectInstructions}\n\nFollow these instructions when working in this project.</project_instructions>`;
  }
  if (body._projectLinks && body._projectLinks.length > 0) {
    for (const link of body._projectLinks) {
      prompt += `\n<link url="${link.url}" title="${link.title || ''}" />`;
    }
  }

  return prompt;
}

// Tool definitions
const ARTIFACT_TOOLS = [
  {
    name: 'create_file',
    description: 'Create a file artifact. Use this for any standalone code, HTML pages, scripts, or documents that the user might want to save or run. Always provide complete, working code.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Brief description of what is being created' },
        path: { type: 'string', description: 'File path like /mnt/user-data/outputs/filename.ext' },
        file_text: { type: 'string', description: 'Complete file content' },
      },
      required: ['description', 'path', 'file_text'],
    },
  },
  {
    name: 'present_files',
    description: 'Present created files to the user for viewing/download.',
    input_schema: {
      type: 'object',
      properties: {
        filepaths: { type: 'array', items: { type: 'string' }, description: 'Array of file paths to present' },
      },
      required: ['filepaths'],
    },
  },
  {
    name: 'show_widget',
    description: 'Show visual content — SVG graphics, diagrams, charts, or interactive HTML widgets — that renders inline alongside your text response. Use for flowcharts, architecture diagrams, dashboards, forms, calculators, data tables, games, illustrations, or any visual content. The code is auto-detected: starts with <svg = SVG mode, otherwise HTML mode.',
    input_schema: {
      type: 'object',
      properties: {
        loading_messages: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4, description: '1-4 short loading messages shown while rendering' },
        title: { type: 'string', description: 'Short snake_case identifier for this visual' },
        widget_code: { type: 'string', description: 'SVG or HTML code to render. For HTML: raw content, no DOCTYPE/html/head/body tags. Use CSS variables for theming.' },
      },
      required: ['loading_messages', 'title', 'widget_code'],
    },
  },
];

const WEB_SEARCH_TOOL = {
  name: 'web_search',
  description: 'Search the web for current information. Use for facts that may have changed since knowledge cutoff, current events, prices, people in roles, etc. Returns top results with titles, URLs, and snippets.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query, 1-6 words recommended' },
    },
    required: ['query'],
  },
};

const MEMORY_TOOL = {
  name: 'memory_user_edits',
  description: 'Manage user memory edits. Commands: "view" (show current), "add" (add new memory), "remove" (delete by line_number), "replace" (update by line_number). Max 30 edits, 200 chars each. CRITICAL: You MUST use this tool BEFORE confirming any memory action. Never just acknowledge conversationally.',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', enum: ['view', 'add', 'remove', 'replace'], description: 'Operation to perform' },
      control: { type: 'string', description: 'Text to add (for "add" command)' },
      line_number: { type: 'integer', description: 'Line number to remove/replace (1-indexed)' },
      replacement: { type: 'string', description: 'Replacement text (for "replace" command)' },
    },
    required: ['command'],
  },
};

const CONVERSATION_SEARCH_TOOL = {
  name: 'conversation_search',
  description: 'Search past conversations by keyword. Use for topic references like "what did we discuss about X". Extract substantive keywords only (nouns, specific concepts, project names). Avoid generic verbs and time markers.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Substantive keywords to search for' },
    },
    required: ['query'],
  },
};

const RECENT_CHATS_TOOL = {
  name: 'recent_chats',
  description: 'Retrieve recent conversations by time. Use for time references like "what did we talk about yesterday". Parameters: n (1-20 count), before/after (ISO datetime), sort_order (asc/desc).',
  input_schema: {
    type: 'object',
    properties: {
      n: { type: 'integer', minimum: 1, maximum: 20, description: 'Number of chats to retrieve' },
      before: { type: 'string', description: 'Get chats before this ISO datetime' },
      after: { type: 'string', description: 'Get chats after this ISO datetime' },
      sort_order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order (default desc)' },
    },
    required: ['n'],
  },
};

function buildToolsList(isIncognito) {
  const tools = [...ARTIFACT_TOOLS];
  tools.push(WEB_SEARCH_TOOL);
  tools.push(ASK_USER_INPUT_TOOL);
  if (!isIncognito) {
    tools.push(MEMORY_TOOL, CONVERSATION_SEARCH_TOOL, RECENT_CHATS_TOOL);
  }
  return tools;
}

async function getSettings() {
  try {
    const stored = await chrome.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS, ...stored.settings };
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}

function extractConversationId(url) {
  const match = url.match(/chat_conversations\/([^/]+)\/(completion|retry_completion)/);
  return match ? match[1] : null;
}

function extractOrgId(url) {
  const match = url.match(/organizations\/([^/]+)\//);
  return match ? match[1] : null;
}

async function fetchImageAsBase64(orgId, fileUuid) {
  try {
    const resp = await fetch(`https://claude.ai/api/${orgId}/files/${fileUuid}/preview`, { credentials: 'include' });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const mediaType = blob.type || 'image/webp';
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { base64: btoa(binary), mediaType };
  } catch (e) {
    console.error('[background.js] Image fetch error:', e);
    return null;
  }
}

function formatSSE(eventType, data) {
  return `event: ${eventType}\r\ndata: ${data}\r\n\r\n`;
}

function generateMessageLimitEvent() {
  const now = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    type: 'message_limit',
    message_limit: {
      type: 'within_limit', resetsAt: null, remaining: null, perModelLimit: null,
      representativeClaim: 'five_hour', overageDisabledReason: 'overage_not_provisioned', overageInUse: false,
      windows: {
        '5h': { status: 'within_limit', resets_at: now + 18000, utilization: 0.01 },
        '7d': { status: 'within_limit', resets_at: now + 604800, utilization: 0.001 },
      },
    },
  });
}

// Augment SSE events to match claude.ai format
function augmentEvent(data, requestContext, blockIndexOffset) {
  try {
    const parsed = JSON.parse(data);
    const now = new Date().toISOString();

    switch (parsed.type) {
      case 'message_start':
        parsed.message.parent_uuid = requestContext.humanUuid;
        parsed.message.uuid = requestContext.assistantUuid;
        parsed.message.trace_id = crypto.randomUUID().replace(/-/g, '');
        parsed.message.request_id = 'req_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
        parsed.message.model = '';
        delete parsed.message.usage;
        break;

      case 'content_block_start':
        parsed.index = (parsed.index || 0) + blockIndexOffset;
        if (parsed.content_block) {
          parsed.content_block.start_timestamp = now;
          parsed.content_block.stop_timestamp = null;
          parsed.content_block.flags = null;
          if (parsed.content_block.type === 'text') {
            parsed.content_block.citations = parsed.content_block.citations || [];
          }
          if (parsed.content_block.type === 'tool_use') {
            parsed.content_block.message = parsed.content_block.message || 'Working...';
            parsed.content_block.integration_name = null;
            parsed.content_block.integration_icon_url = null;
            parsed.content_block.icon_name = 'file';
            parsed.content_block.context = null;
            parsed.content_block.display_content = null;
            parsed.content_block.is_mcp_app = null;
          }
        }
        break;

      case 'content_block_delta':
        parsed.index = (parsed.index || 0) + blockIndexOffset;
        break;

      case 'content_block_stop':
        parsed.index = (parsed.index || 0) + blockIndexOffset;
        parsed.stop_timestamp = now;
        break;

      case 'message_delta':
        delete parsed.usage;
        break;

      case 'message_stop':
        delete parsed.usage;
        break;
    }

    return JSON.stringify(parsed);
  } catch (e) {
    return data;
  }
}

// Generate a tool_result SSE block in claude.ai format
function generateToolResultSSE(toolUseId, toolName, toolInput, blockIndex) {
  const now = new Date().toISOString();
  const resultUuid = crypto.randomUUID();

  let resultContent, displayContent;
  if (toolName === 'create_file') {
    const path = toolInput.path || '/mnt/user-data/outputs/file.txt';
    resultContent = [{ type: 'text', text: `File created successfully: ${path}`, uuid: resultUuid }];
    displayContent = { type: 'text', text: `File created successfully: ${path}` };
  } else if (toolName === 'present_files') {
    const paths = toolInput.filepaths || [];
    resultContent = paths.map(p => ({
      type: 'local_resource',
      file_path: p,
      name: p.split('/').pop().replace(/\.[^.]+$/, ''),
      mime_type: p.endsWith('.html') ? 'text/html' : p.endsWith('.py') ? 'text/x-python' : 'text/plain',
      uuid: crypto.randomUUID(),
    }));
    displayContent = null;
  } else {
    resultContent = [{ type: 'text', text: 'Tool executed successfully', uuid: resultUuid }];
    displayContent = { type: 'text', text: 'Tool executed successfully' };
  }

  // content_block_start for tool_result
  const startEvent = {
    type: 'content_block_start',
    index: blockIndex,
    content_block: {
      start_timestamp: now, stop_timestamp: now, flags: null,
      type: 'tool_result', tool_use_id: toolUseId, name: toolName,
      content: [], is_error: false, structured_content: null, meta: null,
      message: toolName === 'present_files' ? 'Presented file' : null,
      integration_name: null, integration_icon_url: null, icon_name: 'file',
      display_content: displayContent,
    },
  };

  // content_block_delta with result data
  const deltaEvent = {
    type: 'content_block_delta',
    index: blockIndex,
    delta: { type: 'input_json_delta', partial_json: JSON.stringify(resultContent) },
  };

  // content_block_stop
  const stopEvent = { type: 'content_block_stop', index: blockIndex, stop_timestamp: now };

  return [
    formatSSE('content_block_start', JSON.stringify(startEvent)),
    formatSSE('content_block_delta', JSON.stringify(deltaEvent)),
    formatSSE('content_block_stop', JSON.stringify(stopEvent)),
  ].join('');
}

// Generate tool_use_block_update_delta for create_file (shows code in artifact panel)
function generateCreateFileUpdateSSE(blockIndex, toolInput) {
  if (!toolInput.file_text) return '';
  const path = toolInput.path || 'file.txt';
  const lang = path.endsWith('.html') ? 'html' : path.endsWith('.py') ? 'python' : path.endsWith('.js') ? 'javascript' : 'text';

  const updateEvent = {
    type: 'content_block_delta',
    index: blockIndex,
    delta: {
      type: 'tool_use_block_update_delta',
      message: toolInput.description || 'Creating file',
      display_content: {
        type: 'json_block',
        json_block: JSON.stringify({ language: lang, code: toolInput.file_text, filename: path }),
      },
    },
  };
  return formatSSE('content_block_delta', JSON.stringify(updateEvent));
}

// Execute web_search via SearXNG
async function executeWebSearch(query) {
  try {
    const resp = await fetch(`${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!resp.ok) return `Search failed: ${resp.status}`;
    const data = await resp.json();
    const results = (data.results || []).slice(0, 5);
    if (results.length === 0) return 'No results found.';
    return results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content || ''}`).join('\n\n');
  } catch (e) {
    return `Search error: ${e.message}`;
  }
}

// Execute memory_user_edits via sync server
async function executeMemoryEdits(command, input) {
  const email = await getUserEmail();
  if (!email) return 'Memory system unavailable (not logged in)';
  const headers = {
    'content-type': 'application/json',
    'authorization': 'Bearer ' + SYNC_KEY,
    'x-user-id': email,
  };
  try {
    if (command === 'view') {
      const resp = await fetch(SYNC_URL + '/api/memories', { headers });
      const data = await resp.json();
      if (!data.memories || data.memories.length === 0) return 'No memories stored.';
      return data.memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
    }
    if (command === 'add') {
      const text = input.control;
      if (!text) return 'Error: control text required for add';
      const resp = await fetch(SYNC_URL + '/api/memories', {
        method: 'POST', headers, body: JSON.stringify({ text }),
      });
      const data = await resp.json();
      return data.ok ? `Added memory #${data.memory.id}: ${text}` : `Error: ${data.error}`;
    }
    if (command === 'remove') {
      // First get all memories to find by line number
      const listResp = await fetch(SYNC_URL + '/api/memories', { headers });
      const listData = await listResp.json();
      const idx = (input.line_number || 1) - 1;
      if (!listData.memories || idx < 0 || idx >= listData.memories.length) return 'Error: invalid line number';
      const memId = listData.memories[idx].id;
      await fetch(SYNC_URL + '/api/memories/' + memId, { method: 'DELETE', headers });
      return `Removed memory #${input.line_number}`;
    }
    if (command === 'replace') {
      const listResp = await fetch(SYNC_URL + '/api/memories', { headers });
      const listData = await listResp.json();
      const idx = (input.line_number || 1) - 1;
      if (!listData.memories || idx < 0 || idx >= listData.memories.length) return 'Error: invalid line number';
      const memId = listData.memories[idx].id;
      const text = input.replacement;
      if (!text) return 'Error: replacement text required';
      await fetch(SYNC_URL + '/api/memories/' + memId, {
        method: 'PUT', headers, body: JSON.stringify({ text }),
      });
      return `Replaced memory #${input.line_number}: ${text}`;
    }
    return 'Unknown command: ' + command;
  } catch (e) {
    return `Memory error: ${e.message}`;
  }
}

// Execute conversation_search via sync server
async function executeConversationSearch(query) {
  const email = await getUserEmail();
  if (!email) return 'Past chats unavailable (not logged in)';
  try {
    const resp = await fetch(SYNC_URL + '/api/conversations/search?q=' + encodeURIComponent(query) + '&limit=5', {
      headers: {
        'authorization': 'Bearer ' + SYNC_KEY,
        'x-user-id': email,
      },
    });
    const data = await resp.json();
    if (!data.results || data.results.length === 0) return 'No matching conversations found.';
    return data.results.map(r => {
      const snippet = (r.snippet || '').substring(0, 200);
      return `<chat uri="${r.id}" url="https://claude.ai/chat/${r.id}" updated_at="${r.updated_at}">${snippet}</chat>`;
    }).join('\n');
  } catch (e) {
    return `Search error: ${e.message}`;
  }
}

// Execute recent_chats via sync server
async function executeRecentChats(input) {
  const email = await getUserEmail();
  if (!email) return 'Past chats unavailable (not logged in)';
  try {
    const params = new URLSearchParams();
    params.set('limit', String(input.n || 10));
    if (input.before) params.set('before', input.before);
    if (input.after) params.set('after', input.after);
    if (input.sort_order) params.set('sort_order', input.sort_order);
    const resp = await fetch(SYNC_URL + '/api/conversations/recent?' + params.toString(), {
      headers: {
        'authorization': 'Bearer ' + SYNC_KEY,
        'x-user-id': email,
      },
    });
    const data = await resp.json();
    if (!data.conversations || data.conversations.length === 0) return 'No recent conversations found.';
    return data.conversations.map(c => {
      const preview = (c.first_message || '').substring(0, 150);
      return `<chat uri="${c.id}" url="https://claude.ai/chat/${c.id}" updated_at="${c.updated_at}">${preview}</chat>`;
    }).join('\n');
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

// Load user memories from sync server
async function loadMemories() {
  // Sync is always available (hardcoded server)
  const email = await getUserEmail();
  if (!email) return '';
  try {
    const resp = await fetch(SYNC_URL + '/api/memories/formatted', {
      headers: {
        'authorization': 'Bearer ' + SYNC_KEY,
        'x-user-id': email,
      },
    });
    const data = await resp.json();
    return data.formatted || '';
  } catch (e) {
    return '';
  }
}

// Stream a single LiteLLM request, return { assistantText, toolCalls, stopReason, blockCount }
async function streamLiteLLMRequest(apiRequest, settings, port, requestContext, blockIndexOffset, abortSignal) {
  let portDisconnected = false;
  const send = (data) => { if (!portDisconnected) port.postMessage({ type: 'CHUNK', data }); };

  // Check if port disconnects
  const disconnectHandler = () => { portDisconnected = true; };
  port.onDisconnect.addListener(disconnectHandler);

  const response = await fetch(settings.endpoint + '/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': settings.apiKey,
    },
    body: JSON.stringify(apiRequest),
    signal: abortSignal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LiteLLM returned ${response.status}: ${errText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assistantText = '';
  let stopReason = 'end_turn';
  let maxBlockIndex = 0;
  let isFirstMessage = blockIndexOffset === 0;

  // Track tool calls for multi-turn execution
  const toolCalls = []; // [{id, name, input}]
  let currentToolInput = '';
  let currentToolId = '';
  let currentToolName = '';
  let currentToolBlockIndex = -1;

  // Track thinking blocks for continuation (API requires them in history)
  const thinkingBlocks = []; // [{thinking, signature}]
  let currentThinkingText = '';
  let currentThinkingSignature = '';
  let inThinkingBlock = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done || portDisconnected) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    let currentEventType = '';
    for (const line of lines) {
      if (portDisconnected) break;

      if (line.startsWith('event: ')) {
        currentEventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6);

        try {
          const parsed = JSON.parse(data);

          // Track text for history
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            assistantText += parsed.delta.text;
          }

          // Track thinking blocks (needed for continuation with tool_use)
          if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'thinking') {
            inThinkingBlock = true;
            currentThinkingText = '';
            currentThinkingSignature = '';
          }
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'thinking_delta') {
            currentThinkingText += parsed.delta.thinking;
          }
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'signature_delta') {
            currentThinkingSignature += parsed.delta.signature;
          }
          if (parsed.type === 'content_block_stop' && inThinkingBlock) {
            thinkingBlocks.push({ type: 'thinking', thinking: currentThinkingText, signature: currentThinkingSignature });
            inThinkingBlock = false;
          }

          // Track tool_use blocks
          if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
            currentToolId = parsed.content_block.id;
            currentToolName = parsed.content_block.name;
            currentToolInput = '';
            currentToolBlockIndex = (parsed.index || 0) + blockIndexOffset;
          }
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
            currentToolInput += parsed.delta.partial_json;
          }
          if (parsed.type === 'content_block_stop' && currentToolId && (parsed.index || 0) + blockIndexOffset === currentToolBlockIndex) {
            let parsedInput = {};
            try { parsedInput = JSON.parse(currentToolInput); } catch (e) {}

            toolCalls.push({ id: currentToolId, name: currentToolName, input: parsedInput });

            // Inject tool_use_block_update_delta for create_file
            if (currentToolName === 'create_file') {
              send(generateCreateFileUpdateSSE(currentToolBlockIndex, parsedInput));
            }

            currentToolId = '';
            currentToolName = '';
          }

          // Track stop reason
          if (parsed.type === 'message_delta' && parsed.delta?.stop_reason) {
            stopReason = parsed.delta.stop_reason;
          }

          // Track max block index
          if (parsed.index !== undefined) {
            maxBlockIndex = Math.max(maxBlockIndex, (parsed.index || 0));
          }
        } catch (e) { /* ignore parse errors */ }

        // Skip message_start for continuation requests (already sent)
        if (currentEventType === 'message_start' && !isFirstMessage) continue;

        // Inject message_limit before message_stop
        if (currentEventType === 'message_stop') {
          send(formatSSE('message_limit', generateMessageLimitEvent()));
        }

        const augmented = augmentEvent(data, requestContext, blockIndexOffset);
        send(formatSSE(currentEventType, augmented));
      } else if (line.startsWith(': ')) {
        send(line + '\r\n\r\n');
      }
    }
  }

  if (portDisconnected) reader.cancel();

  return {
    assistantText,
    toolCalls,
    thinkingBlocks,
    stopReason,
    blockCount: maxBlockIndex + 1,
    portDisconnected,
  };
}

// Handle a completion request with tool execution loop
async function handleCompletionRequest(port, msg) {
  const settings = await getSettings();

  if (!settings.enabled) {
    port.postMessage({ type: 'PASSTHROUGH' });
    return;
  }

  const { id, body, url } = msg;
  const conversationId = extractConversationId(url);
  const orgId = extractOrgId(url);
  const isRetry = /\/retry_completion$/.test(url);
  const humanUuid = body.turn_message_uuids?.human_message_uuid || crypto.randomUUID();
  const assistantUuid = body.turn_message_uuids?.assistant_message_uuid || crypto.randomUUID();
  const requestContext = { humanUuid, assistantUuid };

  // Detect fresh conversation: no parent_message_uuid or root UUID means first message
  const ROOT_UUID = '00000000-0000-4000-8000-000000000000';
  const isFirstMessage = !body.parent_message_uuid || body.parent_message_uuid === ROOT_UUID;

  if (isFirstMessage && !isRetry) {
    conversationHistory.set(conversationId, []);
    console.log('[background.js] NEW conversation:', conversationId);
  } else if (!conversationHistory.has(conversationId)) {
    // Not in memory — try loading from sync server
    const synced = await loadFromSync(conversationId);
    conversationHistory.set(conversationId, synced || []);
    console.log('[background.js] Loaded conversation from sync:', conversationId, 'messages:', (synced || []).length);
  } else {
    console.log('[background.js] Continuing conversation:', conversationId, 'history:', conversationHistory.get(conversationId).length, 'messages');
  }
  const history = conversationHistory.get(conversationId);

  // For retry: pop the last assistant message so we re-generate it
  // Don't push a new user message (it already exists in history)
  if (isRetry) {
    // Remove last assistant response (and any trailing tool results)
    while (history.length > 0 && history[history.length - 1].role !== 'user') {
      history.pop();
    }
    console.log('[background.js] RETRY: rolled back to', history.length, 'messages');
    if (history.length === 0) {
      port.postMessage({ type: 'ERROR', error: 'No history to retry' });
      return;
    }
  } else {
    // Build user message content with images
    const files = body.files || [];
    const imageFiles = Array.isArray(files) ? files : [];
    let userContent;

    if (imageFiles.length > 0 && orgId) {
      console.log('[background.js] Fetching', imageFiles.length, 'image(s)');
      const contentParts = [];
      for (const fileRef of imageFiles) {
        const uuid = typeof fileRef === 'string' ? fileRef : fileRef.file_uuid;
        if (!uuid) continue;
        const img = await fetchImageAsBase64(orgId, uuid);
        if (img) {
          contentParts.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } });
        }
      }
      contentParts.push({ type: 'text', text: body.prompt });
      userContent = contentParts;
    } else {
      userContent = body.prompt;
    }

    history.push({ role: 'user', content: userContent });
  }

  // Use model from claude.ai's UI selection (body.model), fallback to settings
  const modelToUse = body.model || settings.model;

  // Use thinking from conversation settings (detected via paprika_mode), fallback to extension settings
  const thinkingEnabled = body._thinkingEnabled !== undefined ? body._thinkingEnabled : settings.enableThinking;
  const budgetTokens = thinkingEnabled ? Math.min(settings.thinkingBudget || 10000, 126000) : 0;
  const maxTokens = thinkingEnabled ? Math.max(budgetTokens + 2000, 16384) : 16384;

  console.log('[background.js] Using model:', modelToUse, '| thinking:', thinkingEnabled);

  const abortController = new AbortController();
  let portDisconnected = false;
  port.onDisconnect.addListener(() => {
    portDisconnected = true;
    // DON'T abort — keep streaming in the background so results are saved to history.
    // The stream continues silently; we just stop sending chunks to the dead port.
    console.log('[background.js] Port disconnected, continuing stream silently for:', conversationId);
  });

  // Detect incognito mode
  const isIncognito = body.is_temporary === true;

  // Load memories for system prompt (unless incognito)
  let memories = '';
  if (!isIncognito) {
    memories = await loadMemories();
  }

  // Build system prompt with styles, memories, past chats instructions
  const systemPrompt = body.system_prompt || buildSystemPrompt(body, memories, isIncognito);
  const tools = buildToolsList(isIncognito);

  try {
    let blockIndexOffset = 0;
    let allAssistantText = '';
    const MAX_TOOL_LOOPS = 8;

    for (let loop = 0; loop <= MAX_TOOL_LOOPS; loop++) {
      const apiRequest = {
        model: modelToUse,
        max_tokens: Math.min(maxTokens, 128000),
        messages: [...history],
        stream: true,
        tools,
      };

      apiRequest.system = systemPrompt;

      if (thinkingEnabled) {
        apiRequest.thinking = { type: 'enabled', budget_tokens: budgetTokens };
      }

      console.log(`[background.js] LiteLLM request (loop ${loop}), blockOffset=${blockIndexOffset}, messages=${apiRequest.messages.length}, tools=${apiRequest.tools?.length || 0}`);

      const result = await streamLiteLLMRequest(
        apiRequest, settings, port, requestContext, blockIndexOffset, abortController.signal
      );

      allAssistantText += result.assistantText;
      console.log(`[background.js] Stream result: stopReason=${result.stopReason}, toolCalls=${result.toolCalls.length}, blocks=${result.blockCount}, text=${result.assistantText.length}chars`);

      if (result.portDisconnected) {
        portDisconnected = true;
        break;
      }

      // If the model used tools, execute them and continue
      if (result.stopReason === 'tool_use' && result.toolCalls.length > 0 && loop < MAX_TOOL_LOOPS) {
        console.log('[background.js] Tool calls:', result.toolCalls.map(t => t.name).join(', '));

        // Build assistant message with thinking + tool_use blocks for history
        const assistantContent = [];
        for (const tb of result.thinkingBlocks) {
          assistantContent.push(tb);
        }
        if (result.assistantText) {
          assistantContent.push({ type: 'text', text: result.assistantText });
        }
        for (const tc of result.toolCalls) {
          assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
        }
        history.push({ role: 'assistant', content: assistantContent });

        if (result.toolCalls.some((tc) => !shouldAutoExecuteToolCall(tc))) {
          console.log('[background.js] Leaving client-side tool for the frontend:', result.toolCalls.map((tc) => tc.name).join(', '));
          break;
        }

        // Build tool_result message for continuation
        const toolResults = [];
        for (const tc of result.toolCalls) {
          // Generate tool_result SSE for the frontend
          const toolResultBlockIndex = blockIndexOffset + result.blockCount;
          const toolResultSSE = generateToolResultSSE(tc.id, tc.name, tc.input, toolResultBlockIndex);
          if (!portDisconnected) port.postMessage({ type: 'CHUNK', data: toolResultSSE });

          blockIndexOffset = toolResultBlockIndex + 1;

          // Execute each tool and get result text
          let resultText = 'Success';
          if (tc.name === 'create_file') {
            resultText = `File created successfully: ${tc.input.path}`;
          } else if (tc.name === 'present_files') {
            resultText = `Files presented: ${(tc.input.filepaths || []).join(', ')}`;
          } else if (tc.name === 'web_search') {
            resultText = await executeWebSearch(tc.input.query || '');
            console.log('[background.js] Web search:', tc.input.query, '→', resultText.length, 'chars');
          } else if (tc.name === 'memory_user_edits') {
            resultText = await executeMemoryEdits(tc.input.command, tc.input);
            console.log('[background.js] Memory edit:', tc.input.command, '→', resultText);
          } else if (tc.name === 'conversation_search') {
            resultText = await executeConversationSearch(tc.input.query || '');
            console.log('[background.js] Conversation search:', tc.input.query);
          } else if (tc.name === 'recent_chats') {
            resultText = await executeRecentChats(tc.input);
            console.log('[background.js] Recent chats: n=', tc.input.n);
          }
          toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: resultText });
        }
        history.push({ role: 'user', content: toolResults });

        continue; // Loop to send continuation request
      }

      // No more tool calls — we're done
      break;
    }

    // Save final text to history
    if (allAssistantText) {
      // Only push final text if the last history entry isn't already an assistant message from a tool loop
      const lastEntry = history[history.length - 1];
      if (!lastEntry || lastEntry.role !== 'assistant') {
        history.push({ role: 'assistant', content: allAssistantText });
      }
    }

    console.log('[background.js] Complete. Total text:', allAssistantText.length, 'chars');
    if (!portDisconnected) port.postMessage({ type: 'DONE' });

    // Sync to server in background (fire-and-forget)
    syncConversation(conversationId, history).catch(e =>
      console.warn('[background.js] Sync failed:', e.message)
    );
  } catch (e) {
    console.error('[background.js] Error:', e);
    if (history.length > 0 && history[history.length - 1].role === 'user') {
      history.pop(); // Remove failed user message
    }
    if (!portDisconnected) port.postMessage({ type: 'ERROR', error: e.message });
  }
}

// Cache the user's email for sync requests
let _cachedUserEmail = null;
async function getUserEmail() {
  if (_cachedUserEmail) return _cachedUserEmail;
  try {
    const resp = await fetch('https://claude.ai/api/account', { credentials: 'include' });
    if (!resp.ok) return null;
    const data = await resp.json();
    _cachedUserEmail = data.email_address || data.email || null;
    return _cachedUserEmail;
  } catch (e) { return null; }
}

// Sync conversation history to the sync server (scoped by user email)
async function syncConversation(convId, history) {
  const email = await getUserEmail();
  if (!email) return;
  await fetch(SYNC_URL + '/api/conversations/' + convId, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer ' + SYNC_KEY,
      'x-user-id': email,
    },
    body: JSON.stringify({ history }),
  });
  console.log('[background.js] Synced conversation:', convId, 'for', email);
}

// Load conversation history from sync server (scoped by user email)
async function loadFromSync(convId) {
  const email = await getUserEmail();
  if (!email) return null;
  try {
    const resp = await fetch(SYNC_URL + '/api/conversations/' + convId, {
      headers: {
        'authorization': 'Bearer ' + SYNC_KEY,
        'x-user-id': email,
      },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.history || null;
  } catch (e) { return null; }
}

function pruneConversationHistory() {
  const MAX = 50;
  if (conversationHistory.size > MAX) {
    const keys = [...conversationHistory.keys()];
    for (const k of keys.slice(0, keys.length - MAX)) conversationHistory.delete(k);
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'intercept') return;
  port.onMessage.addListener((msg) => {
    if (msg.type === 'REQUEST') {
      pruneConversationHistory();
      handleCompletionRequest(port, msg);
    }
  });
});

// Chrome MV3: No filterResponseData -- plan spoofing handled by inject.js
console.log('[background.js] Claude Interceptor: service worker loaded');
