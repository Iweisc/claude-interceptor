'use strict';

function buildCookieHeader(cookies) {
  return (Array.isArray(cookies) ? cookies : [])
    .filter((cookie) => cookie && typeof cookie.name === 'string' && typeof cookie.value === 'string')
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function extractAccountEmailFromPayload(payload) {
  if (typeof payload?.email_address === 'string' && payload.email_address.trim()) {
    return payload.email_address.trim();
  }
  if (typeof payload?.email === 'string' && payload.email.trim()) {
    return payload.email.trim();
  }
  return '';
}

async function getClaudeCookieHeader(browserApi) {
  if (!browserApi?.cookies?.getAll) {
    return '';
  }
  const cookies = await browserApi.cookies.getAll({ domain: 'claude.ai' });
  return buildCookieHeader(cookies);
}

async function getClaudeSessionContext(browserApi) {
  const cookieHeader = await getClaudeCookieHeader(browserApi);
  let userEmail = '';

  if (cookieHeader && typeof fetch === 'function') {
    try {
      const response = await fetch('https://claude.ai/api/account', {
        headers: {
          cookie: cookieHeader,
          accept: 'application/json',
        },
      });
      if (response.ok) {
        userEmail = extractAccountEmailFromPayload(await response.json());
      }
    } catch (error) {}
  }

  return { cookieHeader, userEmail };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildCookieHeader,
    extractAccountEmailFromPayload,
  };
}

(function () {
  if (typeof browser === 'undefined' || !browser.runtime?.onMessage) {
    return;
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'CLAUDE_PROXY_GET_COOKIE_HEADER') {
      if (message?.type !== 'CLAUDE_PROXY_GET_SESSION_CONTEXT') {
        return undefined;
      }
      return getClaudeSessionContext(browser);
    }

    return getClaudeCookieHeader(browser).then((cookieHeader) => ({ cookieHeader }));
  });
})();
