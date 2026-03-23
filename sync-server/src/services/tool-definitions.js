'use strict';

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

function buildToolDefinitions({ isTemporary = false } = {}) {
  const tools = [...ARTIFACT_TOOLS, WEB_SEARCH_TOOL];

  if (!isTemporary) {
    tools.push(MEMORY_TOOL, CONVERSATION_SEARCH_TOOL, RECENT_CHATS_TOOL);
  }

  return tools;
}

module.exports = {
  ARTIFACT_TOOLS,
  buildToolDefinitions,
  CONVERSATION_SEARCH_TOOL,
  MEMORY_TOOL,
  RECENT_CHATS_TOOL,
  WEB_SEARCH_TOOL,
};
