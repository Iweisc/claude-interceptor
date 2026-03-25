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

  function getPageScriptNonce(doc) {
    if (!doc?.querySelector) {
      return '';
    }
    const existingScript = doc.querySelector('script[nonce]');
    return typeof existingScript?.nonce === 'string' ? existingScript.nonce : '';
  }

  function applyInjectedScriptAttributes(script, dataset, nonce) {
    Object.assign(script.dataset, dataset);
    if (typeof nonce === 'string' && nonce) {
      script.nonce = nonce;
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      applyInjectedScriptAttributes,
      buildInjectedScriptDataset,
      getPageScriptNonce,
      shouldInjectProxyScript,
    };
  }

  if (typeof window === 'undefined' || typeof browser === 'undefined') {
    return;
  }

  if (!shouldInjectProxyScript(window.location.pathname)) {
    return;
  }

  // CRITICAL: Override IDB preload cache via wrappedJSObject SYNCHRONOUSLY before any page scripts run.
  // Firefox MV2 content scripts can access page globals via wrappedJSObject (no CSP issues).
  try {
    const pageWindow = window.wrappedJSObject;
    if (pageWindow) {
      const undefinedPromise = new pageWindow.Promise((resolve) => resolve(undefined));
      Object.defineProperty(pageWindow, '__PRELOADED_IDB_CACHE__', {
        value: undefinedPromise,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(pageWindow, '__PRELOADED_IDB_CACHE_RESULT__', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    }
  } catch (e) { /* ignore */ }

  // Clear GrowthBook/Statsig caches (content script shares localStorage with page)
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && /^(growthbook|statsig|gb_|ss_)/.test(key)) {
        localStorage.removeItem(key);
      }
    }
  } catch (e) { /* ignore */ }

  // Clear IDB cache (async, as backup)
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

  // Hide upgrade links
  const style = document.createElement('style');
  style.textContent = 'a[href="/upgrade"] { display: none !important; } [data-testid="upgrade-badge"] { display: none !important; }';
  (document.head || document.documentElement).appendChild(style);

  async function getSessionContext() {
    try {
      return await browser.runtime.sendMessage({ type: 'CLAUDE_PROXY_GET_SESSION_CONTEXT' }) || {};
    } catch (error) {
      return {};
    }
  }

  // Load the full inject.js with settings (async is OK now — the early script already set up the IDB override)
  browser.storage.local.get('settings').then(async ({ settings }) => {
    const sessionContext = await getSessionContext();
    const dataset = buildInjectedScriptDataset(
      settings,
      sessionContext.userEmail || '',
      sessionContext.cookieHeader || ''
    );

    const script = document.createElement('script');
    applyInjectedScriptAttributes(script, dataset, getPageScriptNonce(document));
    script.src = browser.runtime.getURL('inject.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }).catch(() => {
    const dataset = buildInjectedScriptDataset({}, '', '');
    const script = document.createElement('script');
    applyInjectedScriptAttributes(script, dataset, getPageScriptNonce(document));
    script.src = browser.runtime.getURL('inject.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  });

})();
