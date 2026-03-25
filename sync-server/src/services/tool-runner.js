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

async function executeSearxng(fetchImpl, searxngUrl, query, categories = 'general') {
  if (typeof query !== 'string' || !query.trim()) {
    throw new Error('Search query is required');
  }

  const response = await fetchImpl(
    `${searxngUrl}/search?q=${encodeURIComponent(query.trim())}&format=json&categories=${categories}&language=en`,
    {
      headers: { accept: 'application/json' },
    }
  );

  if (!response.ok) {
    return { results: [], raw: `Search failed: ${response.status}` };
  }

  const data = await response.json();
  return { results: Array.isArray(data.results) ? data.results : [], raw: null };
}

async function executeWebSearch(fetchImpl, searxngUrl, query) {
  const { results, raw } = await executeSearxng(fetchImpl, searxngUrl, query);
  if (raw) return raw;
  const top = results.slice(0, 5);
  if (top.length === 0) return 'No results found.';
  return top.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content || ''}`).join('\n\n');
}

async function executeWebFetch(fetchImpl, url) {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('URL is required');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchImpl(url.trim(), {
      headers: { accept: 'text/html,application/xhtml+xml,text/plain,*/*', 'user-agent': 'Mozilla/5.0 (compatible; ClaudeBot/1.0)' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) return `Fetch failed: ${response.status} ${response.statusText}`;
    const text = await response.text();
    // Strip HTML tags for a basic text extraction
    const cleaned = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.slice(0, 15000) || 'Page returned empty content.';
  } finally {
    clearTimeout(timeout);
  }
}

async function executeImageSearch(fetchImpl, searxngUrl, query) {
  const { results, raw } = await executeSearxng(fetchImpl, searxngUrl, query, 'images');
  if (raw) return raw;
  const top = results.slice(0, 8);
  if (top.length === 0) return 'No images found.';
  return top.map((r, i) => `[${i + 1}] ${r.title || 'Image'}\nImage: ${r.img_src || r.url}\nSource: ${r.url}`).join('\n\n');
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

    case 'web_fetch':
      return {
        resultText: await executeWebFetch(fetchImpl, input.url),
      };

    case 'image_search':
      return {
        resultText: await executeImageSearch(fetchImpl, searxngUrl, input.query),
      };

    case 'weather_fetch':
      return {
        resultText: await executeWebSearch(fetchImpl, searxngUrl, `current weather ${input.location || ''} ${input.units || 'celsius'}`),
      };

    case 'places_search':
      return {
        resultText: await executeWebSearch(fetchImpl, searxngUrl, input.query),
      };

    case 'fetch_sports_data':
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
      const widgetPath = `/mnt/user-data/outputs/${title.replace(/[^a-z0-9_-]/gi, '_')}.html`;
      await repositories.conversations.upsertArtifact(context, widgetPath, {
        content: widgetCode,
        mimeType: 'text/html',
      });
      return { resultText: 'Widget rendered successfully' };
    }

    case 'places_map_display': {
      const locations = Array.isArray(input.locations) ? input.locations : [];
      const title = input.title || 'Map';
      const lines = locations.map((loc, i) => `${i + 1}. ${loc.name || 'Location'}${loc.address ? ` — ${loc.address}` : ''}${loc.lat ? ` (${loc.lat}, ${loc.lng})` : ''}`);
      return { resultText: `${title}\n${lines.join('\n') || 'No locations provided.'}` };
    }

    case 'message_compose':
      return {
        resultText: `[${(input.message_type || 'message').toUpperCase()}]${input.recipient ? ` To: ${input.recipient}` : ''}${input.subject ? `\nSubject: ${input.subject}` : ''}\n\n${input.body || ''}`,
      };

    case 'recipe_display': {
      const ingredients = Array.isArray(input.ingredients) ? input.ingredients.map((ing) => `- ${ing.amount || ''} ${ing.unit || ''} ${ing.name || ''}`).join('\n') : '';
      const steps = Array.isArray(input.instructions) ? input.instructions.map((s, i) => `${i + 1}. ${s}`).join('\n') : '';
      return {
        resultText: `${input.title || 'Recipe'}${input.servings ? ` (${input.servings} servings)` : ''}${input.prep_time ? `\nPrep: ${input.prep_time}` : ''}${input.cook_time ? ` Cook: ${input.cook_time}` : ''}\n\nIngredients:\n${ingredients}\n\nInstructions:\n${steps}`,
      };
    }

    case 'ask_user_input': {
      const opts = Array.isArray(input.options) ? input.options.map((o, i) => `${i + 1}. ${o.label || ''}${o.description ? ` — ${o.description}` : ''}`).join('\n') : '';
      return { resultText: `${input.question || 'Choose an option:'}\n${opts}` };
    }

    case 'bash_tool':
      return { resultText: 'Bash execution is not available in the current environment.' };

    case 'str_replace': {
      const filePath = typeof input.path === 'string' ? input.path.trim() : '';
      if (!filePath) throw new Error('File path is required');
      const artifact = await repositories.conversations.getArtifactByPath(context, filePath);
      if (!artifact) return { resultText: `File not found: ${filePath}` };
      const oldStr = typeof input.old_str === 'string' ? input.old_str : '';
      const newStr = typeof input.new_str === 'string' ? input.new_str : '';
      if (!artifact.content.includes(oldStr)) return { resultText: `String not found in ${filePath}` };
      const updated = artifact.content.replace(oldStr, newStr);
      await repositories.conversations.upsertArtifact(context, filePath, { ...artifact, content: updated });
      return { resultText: `Updated ${filePath}: replaced ${oldStr.length} chars` };
    }

    case 'view': {
      const viewPath = typeof input.path === 'string' ? input.path.trim() : '';
      if (!viewPath) throw new Error('Path is required');
      const viewArtifact = await repositories.conversations.getArtifactByPath(context, viewPath);
      if (!viewArtifact) return { resultText: `File not found: ${viewPath}` };
      let content = viewArtifact.content || '';
      if (input.line_range) {
        const [start, end] = input.line_range.split('-').map(Number);
        const lines = content.split('\n');
        content = lines.slice((start || 1) - 1, end || lines.length).join('\n');
      }
      return { resultText: content.slice(0, 15000) };
    }

    default:
      return { resultText: `Tool "${toolCall.name}" executed successfully.` };
  }
}

module.exports = {
  executeToolCall,
  inferMimeType,
};
