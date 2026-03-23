'use strict';

const crypto = require('node:crypto');

function formatSseEvent(eventType, data) {
  return `event: ${eventType}\r\ndata: ${data}\r\n\r\n`;
}

function generateMessageLimitEvent() {
  const now = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    type: 'message_limit',
    message_limit: {
      type: 'within_limit',
      resetsAt: null,
      remaining: null,
      perModelLimit: null,
      representativeClaim: 'five_hour',
      overageDisabledReason: 'overage_not_provisioned',
      overageInUse: false,
      windows: {
        '5h': { status: 'within_limit', resets_at: now + 18000, utilization: 0.01 },
        '7d': { status: 'within_limit', resets_at: now + 604800, utilization: 0.001 },
      },
    },
  });
}

function augmentClaudeEvent(data, requestContext, blockIndexOffset) {
  try {
    const parsed = JSON.parse(data);
    const now = new Date().toISOString();

    switch (parsed.type) {
      case 'message_start':
        parsed.message.parent_uuid = requestContext.humanUuid;
        parsed.message.uuid = requestContext.assistantUuid;
        parsed.message.trace_id = crypto.randomUUID().replace(/-/g, '');
        parsed.message.request_id = `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
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
      case 'message_stop':
        delete parsed.usage;
        break;
    }

    return JSON.stringify(parsed);
  } catch (error) {
    return data;
  }
}

function generateToolResultSse(toolUseId, toolName, toolInput, blockIndex) {
  const now = new Date().toISOString();
  const resultUuid = crypto.randomUUID();

  let resultContent;
  let displayContent;
  if (toolName === 'create_file') {
    const path = toolInput.path || '/mnt/user-data/outputs/file.txt';
    resultContent = [{ type: 'text', text: `File created successfully: ${path}`, uuid: resultUuid }];
    displayContent = { type: 'text', text: `File created successfully: ${path}` };
  } else if (toolName === 'present_files') {
    const paths = Array.isArray(toolInput.filepaths) ? toolInput.filepaths : [];
    resultContent = paths.map((path) => ({
      type: 'local_resource',
      file_path: path,
      name: path.split('/').pop().replace(/\.[^.]+$/, ''),
      mime_type: path.endsWith('.html')
        ? 'text/html'
        : path.endsWith('.py')
          ? 'text/x-python'
          : 'text/plain',
      uuid: crypto.randomUUID(),
    }));
    displayContent = null;
  } else {
    resultContent = [{ type: 'text', text: 'Tool executed successfully', uuid: resultUuid }];
    displayContent = { type: 'text', text: 'Tool executed successfully' };
  }

  const startEvent = {
    type: 'content_block_start',
    index: blockIndex,
    content_block: {
      start_timestamp: now,
      stop_timestamp: now,
      flags: null,
      type: 'tool_result',
      tool_use_id: toolUseId,
      name: toolName,
      content: [],
      is_error: false,
      structured_content: null,
      meta: null,
      message: toolName === 'present_files' ? 'Presented file' : null,
      integration_name: null,
      integration_icon_url: null,
      icon_name: 'file',
      display_content: displayContent,
    },
  };

  const deltaEvent = {
    type: 'content_block_delta',
    index: blockIndex,
    delta: { type: 'input_json_delta', partial_json: JSON.stringify(resultContent) },
  };

  const stopEvent = {
    type: 'content_block_stop',
    index: blockIndex,
    stop_timestamp: now,
  };

  return [
    formatSseEvent('content_block_start', JSON.stringify(startEvent)),
    formatSseEvent('content_block_delta', JSON.stringify(deltaEvent)),
    formatSseEvent('content_block_stop', JSON.stringify(stopEvent)),
  ].join('');
}

function generateCreateFileUpdateSse(blockIndex, toolInput) {
  if (!toolInput.file_text) return '';

  const path = toolInput.path || 'file.txt';
  const language = path.endsWith('.html')
    ? 'html'
    : path.endsWith('.py')
      ? 'python'
      : path.endsWith('.js')
        ? 'javascript'
        : 'text';

  const updateEvent = {
    type: 'content_block_delta',
    index: blockIndex,
    delta: {
      type: 'tool_use_block_update_delta',
      message: toolInput.description || 'Creating file',
      display_content: {
        type: 'json_block',
        json_block: JSON.stringify({
          language,
          code: toolInput.file_text,
          filename: path,
        }),
      },
    },
  };

  return formatSseEvent('content_block_delta', JSON.stringify(updateEvent));
}

module.exports = {
  augmentClaudeEvent,
  formatSseEvent,
  generateCreateFileUpdateSse,
  generateMessageLimitEvent,
  generateToolResultSse,
};
