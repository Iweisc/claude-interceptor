(function () {
  'use strict';

  const conversationHistory = new Map();

  const DEFAULT_SETTINGS = {
    enabled: true,
    endpoint: '',
    model: 'claude-sonnet-4-6',
    apiKey: '',
    enableThinking: true,
    thinkingBudget: 10000,
  };

  function getSystemPrompt() {
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return `You are Claude, an AI assistant made by Anthropic. You are currently deployed in a chat interface.

## DATE & WORLD KNOWLEDGE
Today's date is ${dateStr}.
Your training has a knowledge cutoff. For anything that may have changed, acknowledge uncertainty and recommend the user verify. Don't disclaim your cutoff date unprompted.

## TONE & STYLE
- Warm, direct, and confident. Not sycophantic — never open with "Great question!" or similar filler.
- Match the register of the conversation: casual for casual, precise for technical, empathetic for emotional.
- Be concise. Prefer fewer words that say more. Avoid padding, throat-clearing, and unnecessary preamble.
- Don't be a pushover. If you disagree or think the user is wrong, say so respectfully and explain why.
- You have opinions and can share them when asked. Flag them as your view, not objective truth.
- Never use hollow affirmations: "Certainly!", "Absolutely!", "Of course!", "Sure!", "Great!", etc.

## FORMATTING & MARKDOWN
- Conversational replies: plain prose, no headers, minimal or no bullets.
- Technical explanations / comparisons: light structure — headers or bullets if it meaningfully helps.
- Long documents or reports: full markdown structure appropriate.
- Never use headers for short responses, bullet every thought, bold random phrases, or nest bullets more than two levels.
- When in doubt, write in sentences and paragraphs.

## CODE & ARTIFACTS
- Short snippets (< ~20 lines): inline in fenced code block.
- Standalone files, full components, scripts: use the create_file tool to create them as artifacts. Always include complete, runnable code. Don't truncate.
- After creating a file, use present_files to display it to the user.
- Prefer working, runnable code over pseudocode unless explicitly requested.

## HANDLING AMBIGUITY
- Make a reasonable interpretation and proceed rather than asking multiple clarifying questions upfront.
- State your interpretation briefly so the user can redirect if needed.
- For creative tasks, attempt something and invite feedback rather than interrogating intent first.

## SAFETY & REFUSALS
- Decline requests that would produce content enabling mass harm. These are firm limits.
- For gray-area requests, consider the most plausible intent. Don't assume malice.
- When you do decline, be brief and honest about why. Don't moralize or lecture.
- Don't add unsolicited warnings or disclaimers to benign content.

## HONESTY
- Never claim certainty you don't have. Use hedges when appropriate.
- Don't hallucinate citations, studies, quotes, or statistics. If unsure, say so.
- If you made a mistake, acknowledge it directly and fix it.

## MEMORY & CONTINUITY
You have no memory of previous conversations. Each conversation starts fresh.`;
  }

  // Tool definitions for artifacts
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

  async function getSettings() {
    try {
      const stored = await browser.storage.local.get('settings');
      return { ...DEFAULT_SETTINGS, ...stored.settings };
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  }

  function extractConversationId(url) {
    const match = url.match(/chat_conversations\/([^/]+)\/completion/);
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
              parsed.content_block.approval_options = null;
              parsed.content_block.approval_key = null;
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
    const humanUuid = body.turn_message_uuids?.human_message_uuid || crypto.randomUUID();
    const assistantUuid = body.turn_message_uuids?.assistant_message_uuid || crypto.randomUUID();
    const requestContext = { humanUuid, assistantUuid };

    // Detect fresh conversation: no parent_message_uuid or root UUID means first message
    const ROOT_UUID = '00000000-0000-4000-8000-000000000000';
    const isFirstMessage = !body.parent_message_uuid || body.parent_message_uuid === ROOT_UUID;

    if (isFirstMessage || !conversationHistory.has(conversationId)) {
      // Fresh conversation — clear any stale history
      conversationHistory.set(conversationId, []);
      console.log('[background.js] NEW conversation:', conversationId);
    } else {
      console.log('[background.js] Continuing conversation:', conversationId, 'history:', conversationHistory.get(conversationId).length, 'messages');
    }
    const history = conversationHistory.get(conversationId);

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

    try {
      let blockIndexOffset = 0;
      let allAssistantText = '';
      const MAX_TOOL_LOOPS = 5;

      for (let loop = 0; loop <= MAX_TOOL_LOOPS; loop++) {
        const apiRequest = {
          model: modelToUse,
          max_tokens: Math.min(maxTokens, 128000),
          messages: [...history],
          stream: true,
          tools: ARTIFACT_TOOLS,
        };

        apiRequest.system = body.system_prompt || getSystemPrompt();

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
          // API requires thinking blocks to be preserved for continuation
          const assistantContent = [];
          for (const tb of result.thinkingBlocks) {
            assistantContent.push(tb); // {type: "thinking", thinking: "...", signature: "..."}
          }
          if (result.assistantText) {
            assistantContent.push({ type: 'text', text: result.assistantText });
          }
          for (const tc of result.toolCalls) {
            assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
          }
          history.push({ role: 'assistant', content: assistantContent });

          // Build tool_result message for continuation
          const toolResults = [];
          for (const tc of result.toolCalls) {
            // Generate tool_result SSE for the frontend
            const toolResultBlockIndex = blockIndexOffset + result.blockCount;
            const toolResultSSE = generateToolResultSSE(tc.id, tc.name, tc.input, toolResultBlockIndex);
            if (!portDisconnected) port.postMessage({ type: 'CHUNK', data: toolResultSSE });

            blockIndexOffset = toolResultBlockIndex + 1;

            // Add to history for continuation request
            let resultText = 'Success';
            if (tc.name === 'create_file') {
              resultText = `File created successfully: ${tc.input.path}`;
            } else if (tc.name === 'present_files') {
              resultText = `Files presented: ${(tc.input.filepaths || []).join(', ')}`;
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
    } catch (e) {
      console.error('[background.js] Error:', e);
      if (history.length > 0 && history[history.length - 1].role === 'user') {
        history.pop(); // Remove failed user message
      }
      if (!portDisconnected) port.postMessage({ type: 'ERROR', error: e.message });
    }
  }

  function pruneConversationHistory() {
    const MAX = 50;
    if (conversationHistory.size > MAX) {
      const keys = [...conversationHistory.keys()];
      for (const k of keys.slice(0, keys.length - MAX)) conversationHistory.delete(k);
    }
  }

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'intercept') return;
    port.onMessage.addListener((msg) => {
      if (msg.type === 'REQUEST') {
        pruneConversationHistory();
        handleCompletionRequest(port, msg);
      }
    });
  });

  // ========================================================================
  // Network-level response modification using webRequest.filterResponseData()
  // This runs BEFORE the page JS sees the data — no race conditions.
  // ========================================================================

  // Force uncompressed responses for endpoints we need to modify.
  // filterResponseData receives raw bytes — if compressed, we can't parse JSON.
  browser.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      const headers = details.requestHeaders.filter(h => h.name.toLowerCase() !== 'accept-encoding');
      headers.push({ name: 'Accept-Encoding', value: 'identity' });
      return { requestHeaders: headers };
    },
    { urls: ['*://claude.ai/api/bootstrap/*/app_start*', '*://claude.ai/api/account*'] },
    ['blocking', 'requestHeaders']
  );

  // Intercept the bootstrap/app_start response — this is where the frontend
  // gets billing info, model access, rate limits. Modify it to look like Pro.
  function modifyBootstrapResponse(details) {
    const filter = browser.webRequest.filterResponseData(details.requestId);
    const decoder = new TextDecoder('utf-8');
    const encoder = new TextEncoder();
    const chunks = [];

    filter.ondata = (event) => {
      chunks.push(event.data);
    };

    filter.onstop = () => {
      const responseData = chunks.map(c => decoder.decode(c, { stream: true })).join('') + decoder.decode();
      try {
        const body = JSON.parse(responseData);

        // Modify org memberships to look like Pro plan
        if (body.account?.memberships) {
          for (const m of body.account.memberships) {
            if (m.organization?.capabilities?.includes('chat')) {
              m.organization.billing_type = 'stripe';
              m.organization.rate_limit_tier = 'claude_pro_2025_06';
              m.organization.free_credits_status = null;
              m.organization.api_disabled_reason = null;
              // Add claude_pro to capabilities — this is what the frontend checks
              if (!m.organization.capabilities.includes('claude_pro')) {
                m.organization.capabilities.push('claude_pro');
              }
            }
          }
        }

        // Modify GrowthBook user attributes
        if (body.org_growthbook?.user) {
          body.org_growthbook.user.orgType = 'claude_pro';
          body.org_growthbook.user.isPro = true;
          body.org_growthbook.user.isMax = false;
        }

        // Modify Statsig user attributes if present
        if (body.org_statsig?.user) {
          body.org_statsig.user.orgType = 'claude_pro';
          body.org_statsig.user.isPro = true;
        }

        // Modify GrowthBook feature flags that control model access
        if (body.org_growthbook?.features) {
          const features = body.org_growthbook.features;

          // All models available at minimum_tier "free"
          const allModels = [
            { model_id: 'claude-opus-4-6', minimum_tier: 'free' },
            { model_id: 'claude-sonnet-4-6', minimum_tier: 'free' },
            { model_id: 'claude-haiku-4-5-20251001', minimum_tier: 'free' },
            { model_id: 'claude-sonnet-4-20250514', minimum_tier: 'free' },
            { model_id: 'claude-opus-4-5-20251101', minimum_tier: 'free' },
            { model_id: 'claude-sonnet-4-5-20250929', minimum_tier: 'free' },
            { model_id: 'claude-3-opus-20240229', minimum_tier: 'free' },
            { model_id: 'claude-opus-4-1-20250805-claude-ai', minimum_tier: 'free' },
          ];

          // Find and override the model tier feature (991371702 or similar)
          for (const [fid, fval] of Object.entries(features)) {
            const dv = fval.defaultValue;
            // Feature that has models with minimum_tier
            if (dv?.models && Array.isArray(dv.models) && dv.models[0]?.minimum_tier !== undefined) {
              fval.defaultValue = { models: allModels };
              if (fval.rules) {
                for (const rule of fval.rules) {
                  if (rule.force?.models) rule.force = { models: allModels };
                }
              }
              console.log('[background.js] Override model tiers in feature', fid);
            }
          }
        }

        console.log('[background.js] Modified bootstrap: Pro plan + GrowthBook attrs + model tiers');

        const modified = JSON.stringify(body);
        filter.write(encoder.encode(modified));
        console.log('[background.js] Bootstrap response modified successfully (' + modified.length + ' bytes)');
      } catch (e) {
        console.error('[background.js] Bootstrap parse FAILED:', e.message, '| raw length:', responseData.length, '| first 100 chars:', responseData.substring(0, 100));
        // Parse failed — pass through raw chunks
        for (const chunk of chunks) filter.write(chunk);
      }
      filter.close();
    };

    filter.onerror = () => { try { filter.close(); } catch (e) {} };
  }

  browser.webRequest.onBeforeRequest.addListener(
    modifyBootstrapResponse,
    { urls: ['*://claude.ai/api/bootstrap/*/app_start*'], types: ['xmlhttprequest'] },
    ['blocking']
  );

  // Also intercept /api/account for good measure
  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
      const filter = browser.webRequest.filterResponseData(details.requestId);
      const decoder = new TextDecoder('utf-8');
      const encoder = new TextEncoder();
      const chunks = [];
      filter.ondata = (event) => { chunks.push(event.data); };
      filter.onstop = () => {
        const data = chunks.map(c => decoder.decode(c, { stream: true })).join('') + decoder.decode();
        try {
          const body = JSON.parse(data);
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
          }
          filter.write(encoder.encode(JSON.stringify(body)));
        } catch (e) {
          for (const c of chunks) filter.write(c);
        }
        filter.close();
      };
      filter.onerror = () => { try { filter.close(); } catch (e) {} };
    },
    { urls: ['*://claude.ai/api/account*'], types: ['xmlhttprequest'] },
    ['blocking']
  );

  console.log('[background.js] Claude Intercepter: background script loaded');
})();
