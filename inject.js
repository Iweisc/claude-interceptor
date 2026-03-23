'use strict';

const PROXY_ORIGIN = 'https://proxy-ns-0ffzk4u2.usw-1.sealos.app';
const SETTINGS_KEY = '__CLAUDE_PROXY_SETTINGS__';
const COMPLETION_RE = /\/api\/organizations\/[^/]+\/chat_conversations\/[^/]+\/(completion|retry_completion)$/;
const BOOTSTRAP_RE = /^\/api\/bootstrap\/[^/]+\/app_start$/;
const ARTIFACT_TOOLS_RE = /^\/artifacts\/wiggle_artifact\/[^/]+\/tools/;
const DEFAULT_PROXY_SETTINGS = Object.freeze({
  endpoint: '',
  model: 'claude-sonnet-4-6',
  apiKey: '',
  enableThinking: false,
  thinkingBudget: 10000,
});

function readProxySettingsFromDataAttributes(dataset) {
  if (!dataset || typeof dataset !== 'object') {
    return { ...DEFAULT_PROXY_SETTINGS };
  }

  const thinkingBudget = Number.parseInt(dataset.thinkingBudget, 10);
  return {
    endpoint: typeof dataset.endpoint === 'string' ? dataset.endpoint : '',
    model: typeof dataset.model === 'string' && dataset.model ? dataset.model : DEFAULT_PROXY_SETTINGS.model,
    apiKey: typeof dataset.apiKey === 'string' ? dataset.apiKey : '',
    enableThinking: dataset.enableThinking === 'true',
    thinkingBudget: Number.isFinite(thinkingBudget) ? thinkingBudget : DEFAULT_PROXY_SETTINGS.thinkingBudget,
  };
}

const INITIAL_PROXY_SETTINGS = typeof document !== 'undefined'
  ? readProxySettingsFromDataAttributes(document.currentScript?.dataset)
  : { ...DEFAULT_PROXY_SETTINGS };

function shouldBypassProxy(pathname, pagePath) {
  if (pathname.startsWith('/api/auth/')) {
    return true;
  }

  if (pagePath === '/login' || pagePath.startsWith('/login/')) {
    return pathname === '/api/account' || BOOTSTRAP_RE.test(pathname);
  }

  return false;
}

function rewriteClaudeUrl(inputUrl, options = {}) {
  const url = String(inputUrl || '');
  const pagePath = typeof options.pagePath === 'string'
    ? options.pagePath
    : (typeof window !== 'undefined' && window.location ? window.location.pathname : '');
  const prefixes = [
    ['https://claude.ai', 'https://claude.ai'],
    ['http://claude.ai', 'http://claude.ai'],
  ];
  const parsed = new URL(url, 'https://claude.ai');
  if (shouldBypassProxy(parsed.pathname, pagePath)) {
    return url;
  }

  if (url.startsWith('/api/') || url.startsWith('/wiggle/download-file') || ARTIFACT_TOOLS_RE.test(url)) {
    return `${PROXY_ORIGIN}${url}`;
  }

  for (const [prefix] of prefixes) {
    if (url.startsWith(`${prefix}/api/`) || url.startsWith(`${prefix}/wiggle/download-file`) || url.startsWith(`${prefix}/artifacts/wiggle_artifact/`)) {
      return `${PROXY_ORIGIN}${url.slice(prefix.length)}`;
    }
  }

  return url;
}

function mergeCompletionBodyWithSettings(body, settings) {
  const next = body && typeof body === 'object' ? { ...body } : {};
  const model = typeof settings?.model === 'string' ? settings.model.trim() : '';
  const thinkingBudget = Number.parseInt(settings?.thinkingBudget, 10);

  if (model) next.model = model;
  next._thinkingEnabled = settings?.enableThinking === true;
  if (Number.isFinite(thinkingBudget)) {
    next._thinkingBudget = Math.min(Math.max(thinkingBudget, 0), 126000);
  }

  return next;
}

function getProxySettings() {
  if (typeof window === 'undefined') return {};
  if (window[SETTINGS_KEY] && typeof window[SETTINGS_KEY] === 'object') {
    return window[SETTINGS_KEY];
  }
  return INITIAL_PROXY_SETTINGS;
}

function isCompletionUrl(url) {
  return COMPLETION_RE.test(new URL(url, 'https://claude.ai').pathname);
}

function buildProxyHeaders(existingHeaders, settings) {
  const headers = new Headers(existingHeaders || {});
  headers.set('X-Forward-Cookie', document.cookie || '');
  if (settings.endpoint) headers.set('X-LiteLLM-Endpoint', settings.endpoint);
  if (settings.apiKey) headers.set('X-LiteLLM-Key', settings.apiKey);
  return headers;
}

async function rewriteFetchRequest(input, init) {
  const originalRequest = input instanceof Request ? input : null;
  const originalUrl = typeof input === 'string' ? input : input.url;
  const rewrittenUrl = rewriteClaudeUrl(originalUrl);
  if (rewrittenUrl === originalUrl) {
    return { input, init };
  }

  const settings = getProxySettings();
  if (originalRequest && !init && !isCompletionUrl(originalUrl)) {
    const nextRequest = new Request(rewrittenUrl, originalRequest);
    const headers = buildProxyHeaders(nextRequest.headers, settings);
    return { input: new Request(nextRequest, { headers }), init: undefined };
  }

  const method = init?.method || originalRequest?.method || 'GET';
  const headers = buildProxyHeaders(init?.headers || originalRequest?.headers, settings);
  let body = init?.body;

  if (body === undefined && originalRequest && method !== 'GET' && method !== 'HEAD' && isCompletionUrl(originalUrl)) {
    body = await originalRequest.clone().text();
  }

  if (isCompletionUrl(originalUrl) && typeof body === 'string') {
    try {
      body = JSON.stringify(mergeCompletionBodyWithSettings(JSON.parse(body), settings));
      headers.set('content-type', 'application/json');
    } catch (error) {
      // Leave invalid or non-JSON bodies untouched.
    }
  }

  return {
    input: rewrittenUrl,
    init: {
      ...(init || {}),
      method,
      headers,
      body,
      credentials: init?.credentials || originalRequest?.credentials,
      mode: init?.mode || originalRequest?.mode,
      cache: init?.cache || originalRequest?.cache,
      redirect: init?.redirect || originalRequest?.redirect,
      referrer: init?.referrer || originalRequest?.referrer,
      referrerPolicy: init?.referrerPolicy || originalRequest?.referrerPolicy,
      integrity: originalRequest?.integrity,
      keepalive: init?.keepalive ?? originalRequest?.keepalive,
      signal: init?.signal || originalRequest?.signal,
    },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PROXY_ORIGIN,
    mergeCompletionBodyWithSettings,
    readProxySettingsFromDataAttributes,
    rewriteClaudeUrl,
  };
}

(function () {
  if (typeof window === 'undefined') return;

  window[SETTINGS_KEY] = getProxySettings();

  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && (/^(growthbook|statsig|gb_|ss_)/).test(key)) {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {}

  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const rewritten = await rewriteFetchRequest(input, init);
    return originalFetch.call(this, rewritten.input, rewritten.init);
  };

  const XHR = window.XMLHttpRequest;
  const originalOpen = XHR.prototype.open;
  const originalSend = XHR.prototype.send;

  XHR.prototype.open = function (method, url, ...rest) {
    this.__proxyOriginalUrl = String(url || '');
    return originalOpen.call(this, method, rewriteClaudeUrl(url), ...rest);
  };

  XHR.prototype.send = function (body) {
    const settings = getProxySettings();

    try {
      this.setRequestHeader('X-Forward-Cookie', document.cookie || '');
      if (settings.endpoint) this.setRequestHeader('X-LiteLLM-Endpoint', settings.endpoint);
      if (settings.apiKey) this.setRequestHeader('X-LiteLLM-Key', settings.apiKey);
    } catch (error) {}

    let nextBody = body;
    if (isCompletionUrl(this.__proxyOriginalUrl || '') && typeof body === 'string') {
      try {
        nextBody = JSON.stringify(mergeCompletionBodyWithSettings(JSON.parse(body), settings));
      } catch (error) {}
    }

    return originalSend.call(this, nextBody);
  };
})();
