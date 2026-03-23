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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildCookieHeader,
    extractAccountEmailFromPayload,
  };
}

(function () {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'CLAUDE_PROXY_GET_COOKIE_HEADER') {
      if (message?.type !== 'CLAUDE_PROXY_GET_SESSION_CONTEXT') {
        return false;
      }

      chrome.cookies.getAll({ domain: 'claude.ai' }, async (cookies) => {
        const cookieHeader = buildCookieHeader(cookies);
        let userEmail = '';
        if (cookieHeader) {
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
        sendResponse({ cookieHeader, userEmail });
      });
      return true;
    }

    chrome.cookies.getAll({ domain: 'claude.ai' }, (cookies) => {
      sendResponse({ cookieHeader: buildCookieHeader(cookies) });
    });
    return true;
  });
})();
