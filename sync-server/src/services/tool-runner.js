'use strict';

const DEFAULT_SEARXNG_URL = 'https://searxng-ns-0ffzk4u2.usw-1.sealos.app';

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function inferMimeType(path) {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.js')) return 'application/javascript';
  if (path.endsWith('.py')) return 'text/x-python';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.json')) return 'application/json';
  return 'text/plain';
}

function flattenHistoryText(history) {
  if (!Array.isArray(history)) return '';

  return history.map((entry) => {
    if (typeof entry?.content === 'string') return entry.content;
    if (Array.isArray(entry?.content)) {
      return entry.content
        .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join(' ');
    }
    return '';
  }).join(' ').trim();
}

async function executeWebSearch(fetchImpl, searxngUrl, query) {
  if (typeof query !== 'string' || !query.trim()) {
    throw new Error('Search query is required');
  }

  const response = await fetchImpl(
    `${searxngUrl}/search?q=${encodeURIComponent(query.trim())}&format=json&categories=general&language=en`,
    {
      headers: { accept: 'application/json' },
    }
  );

  if (!response.ok) {
    return `Search failed: ${response.status}`;
  }

  const data = await response.json();
  const results = Array.isArray(data.results) ? data.results.slice(0, 5) : [];
  if (results.length === 0) {
    return 'No results found.';
  }

  return results.map((result, index) => (
    `[${index + 1}] ${result.title}\n${result.url}\n${result.content || ''}`
  )).join('\n\n');
}

async function executeMemoryTool(repositories, context, input) {
  const command = input.command;
  const memories = await repositories.memories.listMemories(context.userId);

  if (command === 'view') {
    if (memories.length === 0) return 'No memories stored.';
    return memories.map((memory, index) => `${index + 1}. ${memory.text}`).join('\n');
  }

  if (command === 'add') {
    const text = typeof input.control === 'string' ? input.control.trim() : '';
    if (!text || text.length > 200) {
      throw new Error('Memory text is required and must be 200 characters or fewer');
    }
    const memory = await repositories.memories.createMemory(context.userId, text);
    return `Added memory #${memory.id}: ${text}`;
  }

  const lineNumber = Number.parseInt(input.line_number, 10);
  if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > memories.length) {
    throw new Error('Invalid line number');
  }

  const memory = memories[lineNumber - 1];
  if (command === 'remove') {
    await repositories.memories.deleteMemory(context.userId, memory.id);
    return `Removed memory #${lineNumber}`;
  }

  if (command === 'replace') {
    const text = typeof input.replacement === 'string' ? input.replacement.trim() : '';
    if (!text || text.length > 200) {
      throw new Error('Replacement text is required and must be 200 characters or fewer');
    }
    await repositories.memories.replaceMemory(context.userId, memory.id, text);
    return `Replaced memory #${lineNumber}: ${text}`;
  }

  throw new Error(`Unknown memory command: ${command}`);
}

function buildConversationSearchResult(row) {
  const snippet = flattenHistoryText(row.history).slice(0, 200);
  return `<chat uri="${row.id}" url="https://claude.ai/chat/${row.id}" updated_at="${row.updated_at}">${snippet}</chat>`;
}

async function executeToolCall({ toolCall, repositories, services = {}, context }) {
  const input = ensureObject(toolCall.input);
  const fetchImpl = services.fetchImpl || fetch;
  const searxngUrl = services.searxngUrl || DEFAULT_SEARXNG_URL;

  switch (toolCall.name) {
    case 'web_search':
      return {
        resultText: await executeWebSearch(fetchImpl, searxngUrl, input.query),
      };

    case 'memory_user_edits':
      return {
        resultText: await executeMemoryTool(repositories, context, input),
      };

    case 'conversation_search': {
      const query = typeof input.query === 'string' ? input.query.trim() : '';
      if (!query) throw new Error('Conversation search query is required');
      const rows = await repositories.conversations.searchConversationHistory(context, {
        query,
        limit: 5,
      });
      return {
        resultText: rows.length === 0
          ? 'No matching conversations found.'
          : rows.map(buildConversationSearchResult).join('\n'),
      };
    }

    case 'recent_chats': {
      const limit = Math.min(Math.max(Number.parseInt(input.n, 10) || 10, 1), 20);
      const rows = await repositories.conversations.listRecentConversations(context, {
        limit,
        before: input.before,
        after: input.after,
        sortOrder: input.sort_order,
      });
      return {
        resultText: rows.length === 0
          ? 'No recent conversations found.'
          : rows.map(buildConversationSearchResult).join('\n'),
      };
    }

    case 'create_file': {
      const path = typeof input.path === 'string' ? input.path.trim() : '';
      const fileText = typeof input.file_text === 'string' ? input.file_text : '';
      if (!path.startsWith('/mnt/user-data/outputs/')) {
        throw new Error('File path must be under /mnt/user-data/outputs/');
      }
      if (!fileText) {
        throw new Error('File content is required');
      }
      await repositories.conversations.upsertArtifact(context, path, {
        content: fileText,
        mimeType: inferMimeType(path),
      });
      return {
        resultText: `File created successfully: ${path}`,
      };
    }

    case 'present_files': {
      const filepaths = Array.isArray(input.filepaths) ? input.filepaths.filter((value) => typeof value === 'string' && value) : [];
      if (filepaths.length === 0) {
        throw new Error('At least one file path is required');
      }
      return {
        resultText: `Files presented: ${filepaths.join(', ')}`,
      };
    }

    case 'show_widget': {
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      const widgetCode = typeof input.widget_code === 'string' ? input.widget_code.trim() : '';
      if (!title || !widgetCode) {
        throw new Error('Widget title and code are required');
      }
      return {
        resultText: 'Widget rendered successfully',
      };
    }

    default:
      throw new Error(`Unsupported tool: ${toolCall.name}`);
  }
}

module.exports = {
  executeToolCall,
  inferMimeType,
};
