(function () {
  'use strict';

  function shouldInjectProxyScript(pathname) {
    return typeof pathname === 'string' && !pathname.startsWith('/login');
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      shouldInjectProxyScript,
    };
  }

  if (typeof window === 'undefined' || typeof chrome === 'undefined') {
    return;
  }

  if (!shouldInjectProxyScript(window.location.pathname)) {
    return;
  }

  try {
    const request = indexedDB.open('keyval-store', 1);
    request.onsuccess = () => {
      try {
        const db = request.result;
        const transaction = db.transaction('keyval', 'readwrite');
        transaction.objectStore('keyval').delete('react-query-cache');
        transaction.oncomplete = () => db.close();
      } catch (error) {}
    };
  } catch (error) {}

  async function getCookieHeader() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CLAUDE_PROXY_GET_COOKIE_HEADER' });
      return response?.cookieHeader || '';
    } catch (error) {
      return '';
    }
  }

  chrome.storage.local.get('settings', async ({ settings }) => {
    const cookieHeader = await getCookieHeader();

    const script = document.createElement('script');
    script.dataset.endpoint = settings?.endpoint || '';
    script.dataset.model = settings?.model || 'claude-sonnet-4-6';
    script.dataset.apiKey = settings?.apiKey || '';
    script.dataset.enableThinking = String(settings?.enableThinking === true);
    script.dataset.thinkingBudget = String(Number.parseInt(settings?.thinkingBudget, 10) || 10000);
    script.dataset.cookieHeader = cookieHeader;
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  });

  const style = document.createElement('style');
  style.textContent = `
    a[href="/upgrade"] { display: none !important; }
    [aria-disabled="true"] { pointer-events: auto !important; opacity: 1 !important; }
  `;
  (document.head || document.documentElement).appendChild(style);
})();
