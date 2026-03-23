'use strict';

const PROXY_ORIGIN = 'https://proxy-ns-0ffzk4u2.usw-1.sealos.app';
const SETTINGS_KEY = '__CLAUDE_PROXY_SETTINGS__';
const USER_EMAIL_KEY = '__CLAUDE_PROXY_USER_EMAIL__';
const COOKIE_HEADER_KEY = '__CLAUDE_PROXY_COOKIE_HEADER__';
const COMPLETION_RE = /\/api\/organizations\/[^/]+\/chat_conversations\/[^/]+\/(completion|retry_completion)$/;
const BOOTSTRAP_RE = /^\/api\/bootstrap(?:\/[^/]+\/app_start)?$/;
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

function patchAccountPayloadForBrowser(payload) {
  const next = payload && typeof payload === 'object' ? structuredClone(payload) : {};
  const email = typeof next.email_address === 'string' ? next.email_address : typeof next.email === 'string' ? next.email : '';
  if (email) setProxyUserEmail(email);
  if (Array.isArray(next.memberships)) {
    for (const membership of next.memberships) {
      if (!membership?.organization) continue;
      membership.organization.billing_type = 'stripe';
      membership.organization.rate_limit_tier = 'claude_pro_2025_06';
      membership.organization.capabilities = Array.from(new Set([...(membership.organization.capabilities || []), 'claude_pro']));
    }
  }
  return next;
}

function patchBootstrapPayloadForBrowser(payload) {
  const next = payload && typeof payload === 'object' ? structuredClone(payload) : {};

  if (next.account?.memberships) {
    for (const membership of next.account.memberships) {
      if (!membership?.organization?.capabilities?.includes('chat')) continue;
      membership.organization.billing_type = 'stripe';
      membership.organization.rate_limit_tier = 'claude_pro_2025_06';
      membership.organization.free_credits_status = null;
      membership.organization.api_disabled_reason = null;
      membership.organization.capabilities = Array.from(new Set([...(membership.organization.capabilities || []), 'claude_pro']));
    }
  }

  if (next.org_growthbook?.user) {
    next.org_growthbook.user.orgType = 'claude_pro';
    next.org_growthbook.user.isPro = true;
    next.org_growthbook.user.isMax = false;
  }

  if (next.org_statsig?.user) {
    next.org_statsig.user.orgType = 'claude_pro';
    next.org_statsig.user.isPro = true;
  }

  if (Array.isArray(next.models)) {
    next.models = next.models.map((model) => ({ ...model, minimum_tier: 'free' }));
  }

  return next;
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
    if (pathname === '/api/account') {
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
