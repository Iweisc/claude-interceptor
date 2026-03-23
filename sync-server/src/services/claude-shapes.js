'use strict';

const ROOT_MESSAGE_UUID = '00000000-0000-4000-8000-000000000000';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeContentBlocks(content, timestamp) {
  if (Array.isArray(content)) {
    return content;
  }

  if (typeof content === 'string') {
    return [{
      start_timestamp: timestamp,
      stop_timestamp: timestamp,
      type: 'text',
      text: content,
      citations: [],
    }];
  }

  return [{
    start_timestamp: timestamp,
    stop_timestamp: timestamp,
    type: 'text',
    text: String(content || ''),
    citations: [],
  }];
}

function buildMessageText(contentBlocks) {
  return contentBlocks
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

function buildConversationMetadataResponse(row) {
  const settings = isPlainObject(row?.settings) ? row.settings : {};
  return {
    uuid: row?.id || '',
    name: row?.title || '',
    settings,
    is_temporary: settings.is_temporary === true || settings.isTemporary === true,
  };
}

function buildTreeResponse(row) {
  const history = Array.isArray(row?.history) ? row.history : [];
  const chatMessages = [];
  let parentMessageUuid = ROOT_MESSAGE_UUID;

  for (let index = 0; index < history.length; index += 1) {
    const entry = history[index] || {};
    const timestamp = entry.created_at || new Date().toISOString();
    const content = normalizeContentBlocks(entry.content, timestamp);
    const uuid = entry.uuid || `${row?.id || 'conversation'}-message-${index}`;
    const message = {
      uuid,
      text: buildMessageText(content),
      content,
      sender: entry.role === 'assistant' ? 'assistant' : 'human',
      index,
      created_at: timestamp,
      updated_at: entry.updated_at || timestamp,
      truncated: false,
      attachments: [],
      files: [],
      files_v2: [],
      sync_sources: [],
      parent_message_uuid: parentMessageUuid,
    };

    if (message.sender === 'assistant') {
      message.stop_reason = entry.stop_reason || 'stop_sequence';
    }

    chatMessages.push(message);
    parentMessageUuid = uuid;
  }

  return {
    ...buildConversationMetadataResponse(row),
    chat_messages: chatMessages,
    current_leaf_message_uuid: chatMessages.at(-1)?.uuid || null,
  };
}

function buildMemoryResponse(rows) {
  const controls = [];
  if (Array.isArray(rows) && rows.length > 0) {
    const formatted = rows.map((row) => {
      const date = new Date(row.created_at).toISOString().split('T')[0];
      return `[${date}] - ${row.text}`;
    }).join('\n');
    controls.push(formatted);
  }

  return {
    memory: '',
    controls,
    updated_at: new Date().toISOString(),
  };
}

module.exports = {
  ROOT_MESSAGE_UUID,
  buildConversationMetadataResponse,
  buildMemoryResponse,
  buildTreeResponse,
};
