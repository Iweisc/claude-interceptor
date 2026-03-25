'use strict';

const ARTIFACT_TOOLS = [
  {
    name: 'create_file',
    description: 'Create a file artifact. Use for standalone code, scripts, documents, and any content the user might want to download. Always provide complete, working code. After creating, ALWAYS call present_files to display it.',
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
    description: 'Present created files to the user for viewing/download. MUST be called after create_file to make the file visible.',
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
    description: 'Render inline SVG diagrams, charts, or interactive HTML widgets that display directly in the conversation. Use for flowcharts, diagrams, dashboards, forms, calculators, data tables, games, illustrations, recipes, or any visual content. Rules: No DOCTYPE/html/head/body tags — just content fragments. Use CSS variables for theming: --color-text-primary, --color-text-secondary, --color-background-primary, --color-background-secondary, --color-border-tertiary, --border-radius-md (8px), --border-radius-lg (12px), --font-sans. No gradients/shadows/emoji. Flat clean design. Keep style under 15 lines. Script tags execute after streaming. CDN allowed: cdnjs.cloudflare.com, esm.sh, cdn.jsdelivr.net, unpkg.com.',
    input_schema: {
      type: 'object',
      properties: {
        loading_messages: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4, description: '1-4 short loading messages shown while rendering' },
        title: { type: 'string', description: 'Short snake_case identifier for this visual' },
        widget_code: { type: 'string', description: 'Complete SVG or HTML code to render. For HTML: include all CSS/JS inline, no DOCTYPE/html/head/body tags.' },
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

const WEB_FETCH_TOOL = {
  name: 'web_fetch',
  description: 'Fetch the full contents of a specific URL. Returns the page text content. Use when you need to read a specific webpage, article, or document.',
  input_schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
    },
    required: ['url'],
  },
};

const IMAGE_SEARCH_TOOL = {
  name: 'image_search',
  description: 'Search for images on the web. Returns image URLs, titles, and source pages.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Image search query' },
    },
    required: ['query'],
  },
};

const WEATHER_FETCH_TOOL = {
  name: 'weather_fetch',
  description: 'Fetch current weather for a location. Returns temperature, conditions, and forecast.',
  input_schema: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name or location' },
      units: { type: 'string', enum: ['celsius', 'fahrenheit'], description: 'Temperature units' },
    },
    required: ['location'],
  },
};

const PLACES_SEARCH_TOOL = {
  name: 'places_search',
  description: 'Search for places, businesses, and attractions. Returns names, addresses, ratings, and descriptions.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Place search query, e.g. "best coffee shops in Portland"' },
    },
    required: ['query'],
  },
};

const FETCH_SPORTS_DATA_TOOL = {
  name: 'fetch_sports_data',
  description: 'Get live/recent scores, standings, and game stats for major leagues.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Sports query, e.g. "NBA scores today" or "Premier League standings"' },
    },
    required: ['query'],
  },
};

const PLACES_MAP_DISPLAY_TOOL = {
  name: 'places_map_display',
  description: 'Display locations on an interactive map or as an itinerary. Use after places_search to show results visually.',
  input_schema: {
    type: 'object',
    properties: {
      locations: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, address: { type: 'string' }, lat: { type: 'number' }, lng: { type: 'number' } } }, description: 'Array of locations to display' },
      title: { type: 'string', description: 'Map title' },
    },
    required: ['locations'],
  },
};

const MESSAGE_COMPOSE_TOOL = {
  name: 'message_compose',
  description: 'Draft emails, Slack messages, or texts with different strategic approaches. Returns the composed message for the user to review and send.',
  input_schema: {
    type: 'object',
    properties: {
      message_type: { type: 'string', enum: ['email', 'slack', 'text', 'other'], description: 'Type of message' },
      recipient: { type: 'string', description: 'Who the message is for' },
      subject: { type: 'string', description: 'Subject line (for emails)' },
      body: { type: 'string', description: 'The composed message body' },
      tone: { type: 'string', description: 'Desired tone (formal, casual, friendly, etc.)' },
    },
    required: ['message_type', 'body'],
  },
};

const RECIPE_DISPLAY_TOOL = {
  name: 'recipe_display',
  description: 'Show interactive recipes with adjustable servings. Use when the user asks for a recipe or cooking instructions.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Recipe name' },
      servings: { type: 'integer', description: 'Number of servings' },
      ingredients: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, amount: { type: 'string' }, unit: { type: 'string' } } }, description: 'Ingredients list' },
      instructions: { type: 'array', items: { type: 'string' }, description: 'Step-by-step instructions' },
      prep_time: { type: 'string', description: 'Prep time' },
      cook_time: { type: 'string', description: 'Cook time' },
    },
    required: ['title', 'ingredients', 'instructions'],
  },
};

const ASK_USER_INPUT_TOOL = {
  name: 'ask_user_input',
  description: 'Present the user with clickable choices or ranking widgets. Use when you need the user to make a selection from specific options.',
  input_schema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question to ask' },
      options: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, description: { type: 'string' } } }, description: 'Options to present' },
      allow_multiple: { type: 'boolean', description: 'Allow selecting multiple options' },
    },
    required: ['question', 'options'],
  },
};

const BASH_TOOL = {
  name: 'bash_tool',
  description: 'Run bash commands in a Linux container. Use for file operations, running scripts, installing packages, data processing, or any shell command.',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The bash command to execute' },
    },
    required: ['command'],
  },
};

const STR_REPLACE_TOOL = {
  name: 'str_replace',
  description: 'Edit existing files with precise find-and-replace. Use to modify specific parts of a file without rewriting the whole thing.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to edit' },
      old_str: { type: 'string', description: 'Exact string to find' },
      new_str: { type: 'string', description: 'Replacement string' },
    },
    required: ['path', 'old_str', 'new_str'],
  },
};

const VIEW_TOOL = {
  name: 'view',
  description: 'View files or directory listings. Use to read file contents or explore the file system.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File or directory path to view' },
      line_range: { type: 'string', description: 'Optional line range like "1-50"' },
    },
    required: ['path'],
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
  const tools = [
    ...ARTIFACT_TOOLS,
    WEB_SEARCH_TOOL,
    WEB_FETCH_TOOL,
    IMAGE_SEARCH_TOOL,
    WEATHER_FETCH_TOOL,
    PLACES_SEARCH_TOOL,
    FETCH_SPORTS_DATA_TOOL,
    STR_REPLACE_TOOL,
    VIEW_TOOL,
  ];

  if (!isTemporary) {
    tools.push(MEMORY_TOOL, CONVERSATION_SEARCH_TOOL, RECENT_CHATS_TOOL);
  }

  return tools;
}

module.exports = {
  ARTIFACT_TOOLS,
  buildToolDefinitions,
  CONVERSATION_SEARCH_TOOL,
  FETCH_SPORTS_DATA_TOOL,
  IMAGE_SEARCH_TOOL,
  MEMORY_TOOL,
  PLACES_SEARCH_TOOL,
  RECENT_CHATS_TOOL,
  WEATHER_FETCH_TOOL,
  WEB_FETCH_TOOL,
  WEB_SEARCH_TOOL,
};
