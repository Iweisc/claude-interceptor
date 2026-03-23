(function () {
  'use strict';

  function shouldInjectProxyScript(pathname) {
    return typeof pathname === 'string' && !pathname.startsWith('/login');
  }

  function buildInjectedScriptDataset(settings, userEmail, cookieHeader) {
    return {
      endpoint: settings?.endpoint || '',
      model: settings?.model || 'claude-sonnet-4-6',
      apiKey: settings?.apiKey || '',
      enableThinking: String(settings?.enableThinking === true),
      thinkingBudget: String(Number.parseInt(settings?.thinkingBudget, 10) || 10000),
      cookieHeader: typeof cookieHeader === 'string' ? cookieHeader : '',
      userEmail: typeof userEmail === 'string' ? userEmail : '',
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildInjectedScriptDataset,
      shouldInjectProxyScript,
    };
  }

  if (typeof window === 'undefined' || typeof browser === 'undefined') {
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

  async function getSessionContext() {
    try {
      return await browser.runtime.sendMessage({ type: 'CLAUDE_PROXY_GET_SESSION_CONTEXT' }) || {};
    } catch (error) {
      return {};
    }
  }

  browser.storage.local.get('settings').then(async ({ settings }) => {
    const sessionContext = await getSessionContext();
    const dataset = buildInjectedScriptDataset(
      settings,
      sessionContext.userEmail || '',
      sessionContext.cookieHeader || ''
    );

    const script = document.createElement('script');
    Object.assign(script.dataset, dataset);
    script.src = browser.runtime.getURL('inject.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }).catch(() => {
    const dataset = buildInjectedScriptDataset({}, '', '');
    const script = document.createElement('script');
    Object.assign(script.dataset, dataset);
    script.src = browser.runtime.getURL('inject.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  });

})();
