'use strict';

function buildCookieHeader(cookies) {
  return (Array.isArray(cookies) ? cookies : [])
    .filter((cookie) => cookie && typeof cookie.name === 'string' && typeof cookie.value === 'string')
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildCookieHeader,
  };
}

(function () {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'CLAUDE_PROXY_GET_COOKIE_HEADER') {
      return false;
    }

    chrome.cookies.getAll({ domain: 'claude.ai' }, (cookies) => {
      sendResponse({ cookieHeader: buildCookieHeader(cookies) });
    });
    return true;
  });
})();
