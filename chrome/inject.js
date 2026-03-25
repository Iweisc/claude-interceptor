'use strict';

// Override IDB preload cache ASAP
try {
  Object.defineProperty(window, '__PRELOADED_IDB_CACHE__', {
    value: Promise.resolve(undefined),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, '__PRELOADED_IDB_CACHE_RESULT__', {
    value: undefined,
    writable: true,
    configurable: true,
  });
} catch (e) { /* ignore */ }

// Clear GrowthBook/Statsig localStorage caches
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && /^(growthbook|statsig|gb_|ss_)/.test(key)) {
      localStorage.removeItem(key);
    }
  }
} catch (e) { /* ignore */ }

const PROXY_ORIGIN = 'https://proxy-ns-0ffzk4u2.usw-1.sealos.app';
const SETTINGS_KEY = '__CLAUDE_PROXY_SETTINGS__';
const USER_EMAIL_KEY = '__CLAUDE_PROXY_USER_EMAIL__';
const COOKIE_HEADER_KEY = '__CLAUDE_PROXY_COOKIE_HEADER__';
const COMPLETION_RE = /\/api\/organizations\/[^/]+\/chat_conversations\/[^/]+\/(completion|retry_completion)$/;
const BOOTSTRAP_RE = /^\/api\/bootstrap(?:\/[^/]+\/app_start)?$/;
const ARTIFACT_TOOLS_RE = /^\/artifacts\/wiggle_artifact\/[^/]+\/tools/;
const PROXY_OWNED_ORG_ROUTE_RE = /^\/api\/organizations\/[^/]+\/(?:chat_conversations(?:_v\d+)?(?:\/[^/]+(?:\/(?:completion|retry_completion|title|tool_result))?)?|memory|artifacts(?:\/.*)?|conversations\/[^/]+\/wiggle(?:\/.*)?|subscription_details)$/;
const SIDEBAR_LIST_RE = /^\/api\/organizations\/([^/]+)\/chat_conversations_v\d+/;
const MAX_RATE_LIMIT_TIER = 'default_claude_max_20x';
const MAX_BOOTSTRAP_MODELS = Object.freeze([
  { model: 'claude-sonnet-4-5-20250929', name: 'Sonnet 4.5' },
  { model: 'claude-opus-4-6', name: 'Opus 4.6' },
  { model: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5' },
]);
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
const INITIAL_PROXY_USER_EMAIL = typeof document !== 'undefined' && typeof document.currentScript?.dataset?.userEmail === 'string'
  ? document.currentScript.dataset.userEmail.trim().toLowerCase()
  : '';
const INITIAL_PROXY_COOKIE_HEADER = typeof document !== 'undefined' && typeof document.currentScript?.dataset?.cookieHeader === 'string'
  ? document.currentScript.dataset.cookieHeader
  : '';

function shouldBypassProxy(pathname, pagePath) {
  if (pathname.startsWith('/api/auth/')) {
    return true;
  }

  if (pathname === '/api/account' || pathname === '/api/account_profile' || BOOTSTRAP_RE.test(pathname)) {
    return true;
  }

  if (pagePath === '/login' || pagePath.startsWith('/login/')) {
    return true;
  }

  return false;
}

function shouldProxyRoute(pathname) {
  if (typeof pathname !== 'string' || !pathname) {
    return false;
  }

  return PROXY_OWNED_ORG_ROUTE_RE.test(pathname)
    || pathname === '/wiggle/download-file'
    || ARTIFACT_TOOLS_RE.test(pathname);
}

function rewriteClaudeUrl(inputUrl, options = {}) {
  const url = String(inputUrl || '');
  const pagePath = typeof options.pagePath === 'string'
    ? options.pagePath
    : (typeof window !== 'undefined' && window.location ? window.location.pathname : '');
  const parsed = new URL(url, 'https://claude.ai');
  if (shouldBypassProxy(parsed.pathname, pagePath) || !shouldProxyRoute(parsed.pathname)) {
    return url;
  }

  return `${PROXY_ORIGIN}${parsed.pathname}${parsed.search}`;
}

function mergeCompletionBodyWithSettings(body, settings) {
  const next = body && typeof body === 'object' ? { ...body } : {};
  const thinkingBudget = Number.parseInt(settings?.thinkingBudget, 10);
  const settingsModel = typeof settings?.model === 'string' ? settings.model.trim() : '';

  if (settingsModel && !next.model) {
    next.model = settingsModel;
  }
  if (Number.isFinite(thinkingBudget) && thinkingBudget > 0) {
    next._thinkingBudget = Math.min(Math.max(thinkingBudget, 0), 126000);
  }
  if (settings?.enableThinking && !next.paprika_mode) {
    next.paprika_mode = 'extended';
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
  const headerValues = buildProxyHeaderValues(settings);
  headers.set('X-Forward-Cookie', headerValues.cookieHeader || document.cookie || '');
  const userEmail = headerValues.userEmail;
  if (userEmail) headers.set('X-User-Email', userEmail);
  if (headerValues.endpoint) headers.set('X-LiteLLM-Endpoint', headerValues.endpoint);
  if (headerValues.apiKey) headers.set('X-LiteLLM-Key', headerValues.apiKey);
  return headers;
}

function buildProxyHeaderValues(settings) {
  return {
    cookieHeader: getProxyCookieHeader(),
    userEmail: getProxyUserEmail(),
    endpoint: settings?.endpoint || '',
    apiKey: settings?.apiKey || '',
  };
}

function setProxyUserEmail(email) {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalized) return;
  if (typeof window !== 'undefined') {
    window[USER_EMAIL_KEY] = normalized;
  }
  try {
    localStorage.setItem(USER_EMAIL_KEY, normalized);
  } catch (error) {}
}

function getProxyUserEmail() {
  if (typeof window === 'undefined') {
    return globalThis.__codexProxyUserEmail || '';
  }
  if (typeof window !== 'undefined' && typeof window[USER_EMAIL_KEY] === 'string' && window[USER_EMAIL_KEY]) {
    return window[USER_EMAIL_KEY];
  }
  try {
    return localStorage.getItem(USER_EMAIL_KEY) || '';
  } catch (error) {
    return '';
  }
}

function getProxyCookieHeader() {
  if (typeof window === 'undefined') {
    return globalThis.__codexProxyCookieHeader || '';
  }
  if (typeof window[COOKIE_HEADER_KEY] === 'string' && window[COOKIE_HEADER_KEY]) {
    return window[COOKIE_HEADER_KEY];
  }
  try {
    return localStorage.getItem(COOKIE_HEADER_KEY) || '';
  } catch (error) {
    return '';
  }
}

function setProxyCookieHeaderForTests(cookieHeader) {
  globalThis.__codexProxyCookieHeader = cookieHeader;
  if (typeof window !== 'undefined') {
    window[COOKIE_HEADER_KEY] = cookieHeader;
  }
}

function setProxyUserEmailForTests(email) {
  globalThis.__codexProxyUserEmail = email;
  if (typeof window !== 'undefined') {
    window[USER_EMAIL_KEY] = email;
  }
}

function withMaxCapabilities(capabilities) {
  return Array.from(new Set([...(Array.isArray(capabilities) ? capabilities : []), 'claude_pro', 'claude_max']));
}

function patchBootstrapModelsConfig(models) {
  const KNOWN_MODELS = new Set(MAX_BOOTSTRAP_MODELS.map((m) => m.model));
  const next = [];
  const seen = new Set();

  if (Array.isArray(models)) {
    for (const model of models) {
      if (!model || typeof model !== 'object' || typeof model.model !== 'string') continue;
      if (!KNOWN_MODELS.has(model.model)) continue;
      next.push({ ...model, inactive: false });
      seen.add(model.model);
    }
  }

  for (const model of MAX_BOOTSTRAP_MODELS) {
    if (seen.has(model.model)) continue;
    next.push({ ...model, inactive: false, overflow: false });
  }

  return next;
}

function patchStatsigValues(section) {
  if (!section || typeof section !== 'object') return;
  const containers = [section.feature_gates, section.values?.feature_gates];
  for (const gates of containers) {
    if (!gates || typeof gates !== 'object') continue;
    for (const gate of Object.values(gates)) {
      if (gate && typeof gate === 'object' && 'value' in gate) gate.value = true;
    }
  }
}

function patchOrganization(org) {
  org.billing_type = 'stripe';
  org.rate_limit_tier = MAX_RATE_LIMIT_TIER;
  org.subscription_type = 'claude_max';
  org.free_credits_status = null;
  org.api_disabled_reason = null;
  org.capabilities = withMaxCapabilities(org.capabilities);
  org.active_flags = withMaxCapabilities(org.active_flags || []);
  org.claude_ai_bootstrap_models_config = patchBootstrapModelsConfig(
    org.claude_ai_bootstrap_models_config
  );
}

function patchAccountPayloadForBrowser(payload) {
  const next = payload && typeof payload === 'object' ? structuredClone(payload) : {};
  const email = typeof next.email_address === 'string' ? next.email_address : typeof next.email === 'string' ? next.email : '';
  if (email) setProxyUserEmail(email);
  if (Array.isArray(next.memberships)) {
    for (const membership of next.memberships) {
      if (!membership?.organization) continue;
      patchOrganization(membership.organization);
    }
  }
  return next;
}

function patchBootstrapPayloadForBrowser(payload) {
  const next = payload && typeof payload === 'object' ? structuredClone(payload) : {};

  if (next.account?.memberships) {
    for (const membership of next.account.memberships) {
      if (!membership?.organization?.capabilities?.includes('chat')) continue;
      patchOrganization(membership.organization);
    }
  }

  if (next.growthbook?.attributes) {
    next.growthbook.attributes.isPro = true;
    next.growthbook.attributes.isMax = true;
  }

  if (next.org_growthbook?.user) {
    next.org_growthbook.user.orgType = 'claude_max';
    next.org_growthbook.user.isPro = true;
    next.org_growthbook.user.isMax = true;
  }

  for (const key of ['statsig', 'org_statsig']) {
    if (next[key]?.user) {
      next[key].user.orgType = 'claude_max';
      next[key].user.isPro = true;
      next[key].user.isMax = true;
    }
    patchStatsigValues(next[key]);
  }

  if (Array.isArray(next.models)) {
    next.models = next.models.map((model) => ({ ...model, minimum_tier: 'free' }));
  }

  if (next.current_user_access && Array.isArray(next.current_user_access.features)) {
    const feats = next.current_user_access.features;
    const required = ['web_search', 'wiggle', 'skills', 'mcp_artifacts', 'inline_visualizations', 'interactive_content', 'saffron', 'geolocation', 'thumbs', 'tool_approval_default_always_allow'];
    const existing = new Set(feats.map((f) => f.feature));
    for (const name of required) {
      const entry = feats.find((f) => f.feature === name);
      if (entry) { entry.status = 'available'; }
      else { feats.push({ feature: name, status: 'available' }); }
    }
  }

  return next;
}

async function mergeSidebarConversations(fetchFn, thisArg, input, init, orgId) {
  const proxyListUrl = `${PROXY_ORIGIN}/api/organizations/${orgId}/chat_conversations?limit=50`;
  const settings = getProxySettings();
  const proxyHeaders = buildProxyHeaders(new Headers(), settings);

  const [upstreamResult, proxyResult] = await Promise.allSettled([
    fetchFn.call(thisArg, input, init),
    fetchFn.call(thisArg, proxyListUrl, { headers: proxyHeaders }),
  ]);

  const upstream = upstreamResult.status === 'fulfilled' ? upstreamResult.value : null;

  let proxyConversations = [];
  if (proxyResult.status === 'fulfilled' && proxyResult.value.ok) {
    try { proxyConversations = await proxyResult.value.json(); } catch (error) { /* ignore */ }
  }
  if (!Array.isArray(proxyConversations)) proxyConversations = [];

  try {
    const upstreamBody = upstream ? await upstream.clone().json() : [];

    if (Array.isArray(upstreamBody)) {
      return new Response(JSON.stringify(proxyConversations), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    if (upstreamBody && typeof upstreamBody === 'object') {
      upstreamBody.conversations = proxyConversations;
      return new Response(JSON.stringify(upstreamBody), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(proxyConversations), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify(proxyConversations), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }
}

async function patchBrowserResponse(response, patcher) {
  try {
    const body = await response.clone().json();
    return new Response(JSON.stringify(patcher(body)), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    return response;
  }
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
    } catch (error) {}
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
    buildProxyHeaderValues,
    PROXY_ORIGIN,
    getProxyCookieHeader,
    getProxyUserEmail,
    mergeCompletionBodyWithSettings,
    readProxyCookieHeaderFromDataAttributes: (dataset) => typeof dataset?.cookieHeader === 'string' ? dataset.cookieHeader : '',
    readProxySettingsFromDataAttributes,
    rewriteClaudeUrl,
    setProxyCookieHeaderForTests,
    setProxyUserEmailForTests,
  };
}

(function () {
  if (typeof window === 'undefined') return;

  window[SETTINGS_KEY] = getProxySettings();
  if (INITIAL_PROXY_USER_EMAIL) {
    window[USER_EMAIL_KEY] = INITIAL_PROXY_USER_EMAIL;
  }
  if (INITIAL_PROXY_COOKIE_HEADER) {
    window[COOKIE_HEADER_KEY] = INITIAL_PROXY_COOKIE_HEADER;
  }

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
    const originalUrl = typeof input === 'string' ? input : input.url;
    const pathname = new URL(originalUrl, 'https://claude.ai').pathname;
    if (pathname === '/api/account' || pathname === '/api/account_profile') {
      return patchBrowserResponse(await originalFetch.call(this, input, init), patchAccountPayloadForBrowser);
    }
    if (BOOTSTRAP_RE.test(pathname)) {
      return patchBrowserResponse(await originalFetch.call(this, input, init), patchBootstrapPayloadForBrowser);
    }
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
    const headerValues = buildProxyHeaderValues(settings);

    try {
      this.setRequestHeader('X-Forward-Cookie', headerValues.cookieHeader || document.cookie || '');
      if (headerValues.userEmail) this.setRequestHeader('X-User-Email', headerValues.userEmail);
      if (headerValues.endpoint) this.setRequestHeader('X-LiteLLM-Endpoint', headerValues.endpoint);
      if (headerValues.apiKey) this.setRequestHeader('X-LiteLLM-Key', headerValues.apiKey);
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
