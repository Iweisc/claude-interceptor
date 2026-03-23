'use strict';

function buildCookieHeader(cookies) {
  return (Array.isArray(cookies) ? cookies : [])
    .filter((cookie) => cookie && typeof cookie.name === 'string' && typeof cookie.value === 'string')
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

async function getClaudeCookieHeader(browserApi) {
  if (!browserApi?.cookies?.getAll) {
    return '';
  }
  const cookies = await browserApi.cookies.getAll({ domain: 'claude.ai' });
  return buildCookieHeader(cookies);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildCookieHeader,
  };
}

(function () {
  if (typeof browser === 'undefined' || !browser.runtime?.onMessage) {
    return;
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'CLAUDE_PROXY_GET_COOKIE_HEADER') {
      return undefined;
    }

    return getClaudeCookieHeader(browser).then((cookieHeader) => ({ cookieHeader }));
  });
})();
