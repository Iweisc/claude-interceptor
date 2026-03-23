'use strict';

const crypto = require('node:crypto');

const { buildSystemPrompt } = require('./system-prompt');
const {
  augmentClaudeEvent,
  formatSseEvent,
  generateCreateFileUpdateSse,
  generateMessageLimitEvent,
  generateToolResultSse,
} = require('./sse');
const { buildToolDefinitions } = require('./tool-definitions');
const { executeToolCall } = require('./tool-runner');

function openSseStream(res) {
  if (res.headersSent) return;

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

function writeSseChunk(res, streamState, chunk) {
  if (streamState.clientClosed || res.writableEnded) return;

  try {
    res.write(chunk);
  } catch (error) {
    streamState.clientClosed = true;
  }
}

async function fetchImageAsBase64({ fetchImpl, baseUrl, cookieHeader, orgId, fileUuid }) {
  if (!orgId || !fileUuid) return null;

  const response = await fetchImpl(`${baseUrl}/api/${orgId}/files/${fileUuid}/preview`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });

  if (!response.ok) return null;

  const mediaType = response.headers.get('content-type') || 'image/webp';
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    base64: bytes.toString('base64'),
    mediaType,
  };
}

async function buildUserContent({ body, context, req, config, services }) {
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  const files = Array.isArray(body.files) ? body.files : [];

  if (files.length === 0 || !context.orgId) {
    return prompt;
  }

  const fetchImpl = services.fetchImpl || fetch;
  const baseUrl = config?.claudeUpstreamBaseUrl || 'https://claude.ai';
  const cookieHeader = typeof req.headers['x-forward-cookie'] === 'string'
    ? req.headers['x-forward-cookie']
    : '';
  const content = [];

  for (const file of files) {
    const fileUuid = typeof file === 'string' ? file : file?.file_uuid;
    if (!fileUuid) continue;

    const image = await fetchImageAsBase64({
      fetchImpl,
      baseUrl,
      cookieHeader,
      orgId: context.orgId,
      fileUuid,
    });
    if (!image) continue;

    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mediaType,
        data: image.base64,
      },
    });
  }

  if (content.length === 0) {
    return prompt;
  }

  content.push({ type: 'text', text: prompt });
  return content;
}

async function buildIncomingUserTurn({ body, context, req, config, services }) {
  const timestamp = new Date().toISOString();

  return {
    role: 'user',
    uuid: body.turn_message_uuids?.human_message_uuid || crypto.randomUUID(),
    created_at: timestamp,
    updated_at: timestamp,
    content: await buildUserContent({ body, context, req, config, services }),
  };
}

function toAnthropicMessage(turn) {
  return {
    role: turn.role === 'assistant' ? 'assistant' : 'user',
    content: turn.content,
  };
}

function buildAssistantTurn({ uuid, result }) {
  const timestamp = new Date().toISOString();
  const content = [];

  for (const block of result.thinkingBlocks || []) {
    content.push(block);
  }

  if (result.assistantText) {
    content.push({ type: 'text', text: result.assistantText });
  }

  for (const toolCall of result.toolCalls || []) {
    content.push({
      type: 'tool_use',
      id: toolCall.id,
      name: toolCall.name,
      input: toolCall.input,
    });
  }

  return {
    role: 'assistant',
    uuid,
    created_at: timestamp,
    updated_at: timestamp,
    content: content.length === 1 && content[0].type === 'text'
      ? content[0].text
      : content,
    stop_reason: result.stopReason === 'tool_use' ? null : 'stop_sequence',
  };
}

function buildToolResultTurn(toolResults) {
  const timestamp = new Date().toISOString();
  return {
    role: 'user',
    uuid: crypto.randomUUID(),
    created_at: timestamp,
    updated_at: timestamp,
    content: toolResults,
  };
}

async function streamLiteLlmRequest({
  apiRequest,
  endpoint,
  apiKey,
  fetchImpl,
  req,
  res,
  requestContext,
  blockIndexOffset,
  streamState,
}) {
  const response = await fetchImpl(`${endpoint.replace(/\/+$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(apiRequest),
  });

  if (!response.ok) {
    throw new Error(`LiteLLM returned ${response.status}: ${await response.text()}`);
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new Error('LiteLLM returned no readable stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assistantText = '';
  let stopReason = 'end_turn';
  let maxBlockIndex = 0;
  const toolCalls = [];
  const thinkingBlocks = [];
  let currentEventType = '';
  let currentToolInput = '';
  let currentToolId = '';
  let currentToolName = '';
  let currentToolBlockIndex = -1;
  let currentThinkingText = '';
  let currentThinkingSignature = '';
  let inThinkingBlock = false;
  const skipMessageStart = blockIndexOffset > 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');

      if (line.startsWith('event: ')) {
        currentEventType = line.slice(7).trim();
        continue;
      }

      if (line.startsWith('data: ')) {
        const data = line.slice(6);

        try {
          const parsed = JSON.parse(data);

          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            assistantText += parsed.delta.text;
          }

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
            thinkingBlocks.push({
              type: 'thinking',
              thinking: currentThinkingText,
              signature: currentThinkingSignature,
            });
            inThinkingBlock = false;
          }

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
            try {
              parsedInput = JSON.parse(currentToolInput);
            } catch (error) {
              parsedInput = {};
            }

            toolCalls.push({
              id: currentToolId,
              name: currentToolName,
              input: parsedInput,
            });

            if (currentToolName === 'create_file') {
              writeSseChunk(res, streamState, generateCreateFileUpdateSse(currentToolBlockIndex, parsedInput));
            }

            currentToolId = '';
            currentToolName = '';
          }

          if (parsed.type === 'message_delta' && parsed.delta?.stop_reason) {
            stopReason = parsed.delta.stop_reason;
          }

          if (parsed.index !== undefined) {
            maxBlockIndex = Math.max(maxBlockIndex, parsed.index || 0);
          }
        } catch (error) {
          // Keep streaming even if a chunk is not JSON parseable.
        }

        if (currentEventType === 'message_start' && skipMessageStart) {
          continue;
        }

        if (currentEventType === 'message_stop') {
          writeSseChunk(res, streamState, formatSseEvent('message_limit', generateMessageLimitEvent()));
        }

        writeSseChunk(
          res,
          streamState,
          formatSseEvent(currentEventType, augmentClaudeEvent(data, requestContext, blockIndexOffset))
        );
        continue;
      }

      if (line.startsWith(': ')) {
        writeSseChunk(res, streamState, `${line}\r\n\r\n`);
      }
    }
  }

  return {
    assistantText,
    toolCalls,
    thinkingBlocks,
    stopReason,
    blockCount: maxBlockIndex + 1,
  };
}

async function defaultStreamConversation({ req, res, context, repositories, services, config, requestContext }) {
  const fetchImpl = services.fetchImpl || fetch;
  const endpoint = typeof req.headers['x-litellm-endpoint'] === 'string'
    ? req.headers['x-litellm-endpoint'].trim()
    : '';
  const apiKey = typeof req.headers['x-litellm-key'] === 'string'
    ? req.headers['x-litellm-key'].trim()
    : '';
  if (!endpoint || !apiKey) {
    throw new Error('Missing LiteLLM endpoint or key');
  }

  const conversation = await repositories.conversations.getConversation(context);
  const history = Array.isArray(conversation?.history) ? [...conversation.history] : [];
  const settings = conversation?.settings || {};
  const body = req.body || {};
  const isTemporary = body.is_temporary === true || settings.is_temporary === true;
  const formattedMemories = !isTemporary && repositories.memories?.getFormattedMemories
    ? await repositories.memories.getFormattedMemories(context.userId)
    : { formatted: '' };
  const memories = formattedMemories?.formatted || '';
  const systemPrompt = body.system_prompt || buildSystemPrompt({ body, memories });
  const tools = buildToolDefinitions({ isTemporary });
  const modelToUse = body.model || settings.model || 'claude-sonnet-4-6';
  const conversationThinkingEnabled = settings.paprika_mode === 'extended' || settings.paprikaMode === 'extended';
  const thinkingEnabled = body._thinkingEnabled !== undefined
    ? body._thinkingEnabled === true
    : (conversationThinkingEnabled || Boolean(settings.enableThinking));
  const budgetTokens = thinkingEnabled
    ? Math.min(Number.parseInt(body._thinkingBudget, 10) || settings.thinkingBudget || 10000, 126000)
    : 0;
  const maxTokens = thinkingEnabled ? Math.max(budgetTokens + 2000, 16384) : 16384;
  const streamState = { clientClosed: false };
  const historyTurns = [];
  let blockIndexOffset = 0;

  if (typeof req.on === 'function') {
    req.on('close', () => {
      streamState.clientClosed = true;
    });
  }

  for (let loop = 0; loop <= 8; loop += 1) {
    const apiRequest = {
      model: modelToUse,
      max_tokens: Math.min(maxTokens, 128000),
      messages: history.map(toAnthropicMessage),
      stream: true,
      tools,
      system: systemPrompt,
    };

    if (thinkingEnabled) {
      apiRequest.thinking = { type: 'enabled', budget_tokens: budgetTokens };
    }

    const result = await streamLiteLlmRequest({
      apiRequest,
      endpoint,
      apiKey,
      fetchImpl,
      req,
      res,
      requestContext,
      blockIndexOffset,
      streamState,
    });

    if (result.stopReason === 'tool_use' && result.toolCalls.length > 0 && loop < 8) {
      const assistantTurn = buildAssistantTurn({
        uuid: historyTurns.some((turn) => turn.role === 'assistant')
          ? crypto.randomUUID()
          : requestContext.assistantUuid,
        result,
      });
      history.push(assistantTurn);
      historyTurns.push(assistantTurn);

      const toolResults = [];
      let nextToolResultIndex = blockIndexOffset + result.blockCount;
      for (const toolCall of result.toolCalls) {
        writeSseChunk(res, streamState, generateToolResultSse(toolCall.id, toolCall.name, toolCall.input, nextToolResultIndex));
        nextToolResultIndex += 1;

        const execution = await executeToolCall({
          toolCall,
          repositories,
          services,
          context,
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: execution.resultText,
        });
      }

      blockIndexOffset = nextToolResultIndex;

      const toolResultTurn = buildToolResultTurn(toolResults);
      history.push(toolResultTurn);
      historyTurns.push(toolResultTurn);
      continue;
    }

    const assistantTurn = buildAssistantTurn({
      uuid: historyTurns.some((turn) => turn.role === 'assistant')
        ? crypto.randomUUID()
        : requestContext.assistantUuid,
      result,
    });
    historyTurns.push(assistantTurn);
    break;
  }

  return { historyTurns };
}

async function runCompletion({ req, res, context, repositories, services = {}, config = {}, isRetry }) {
  const requestBody = req.body || {};
  const litellm = services.litellm || {
    streamConversation: (args) => defaultStreamConversation({ ...args, services, config }),
  };

  try {
    const requestContext = {
      humanUuid: null,
      assistantUuid: requestBody.turn_message_uuids?.assistant_message_uuid || crypto.randomUUID(),
    };

    if (isRetry) {
      const updated = await repositories.conversations.removeLastAssistantTurn(context);
      const history = Array.isArray(updated?.history) ? updated.history : [];
      const lastUserTurn = [...history].reverse().find((turn) => turn.role === 'user');
      if (!lastUserTurn) {
        throw new Error('No user turn available for retry');
      }
      requestContext.humanUuid = lastUserTurn.uuid || crypto.randomUUID();
    } else {
      const userTurn = await buildIncomingUserTurn({
        body: requestBody,
        context,
        req,
        config,
        services,
      });
      requestContext.humanUuid = userTurn.uuid;
      await repositories.conversations.appendUserTurn(context, userTurn);
    }

    openSseStream(res);

    const result = await litellm.streamConversation({
      req,
      res,
      context,
      repositories,
      services,
      config,
      requestContext,
      isRetry,
    });

    for (const turn of result.historyTurns || []) {
      if (turn.role === 'assistant') {
        await repositories.conversations.appendAssistantTurn(context, turn);
      } else {
        await repositories.conversations.appendUserTurn(context, turn);
      }
    }

    if (!res.writableEnded) {
      res.end();
    }
  } catch (error) {
    if (res.headersSent) {
      writeSseChunk(
        res,
        { clientClosed: false },
        formatSseEvent('error', JSON.stringify({ type: 'error', error: error.message }))
      );
      if (!res.writableEnded) {
        res.end();
      }
      return;
    }

    res.status(502).json({ error: error.message || 'Completion failed' });
  }
}

module.exports = {
  buildIncomingUserTurn,
  runCompletion,
};
