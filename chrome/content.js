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

  if (typeof window === 'undefined' || typeof chrome === 'undefined') {
    return;
  }

  if (!shouldInjectProxyScript(window.location.pathname)) {
    return;
  }

  // early-inject.js (MAIN world, document_start) handles IDB cache override and localStorage clearing.
  // No inline script needed here — Chrome CSP blocks it anyway.

  const style = document.createElement('style');
  style.textContent = 'a[href="/upgrade"] { display: none !important; } [data-testid="upgrade-badge"] { display: none !important; }';
  (document.head || document.documentElement).appendChild(style);

  async function getSessionContext() {
    try {
      return await chrome.runtime.sendMessage({ type: 'CLAUDE_PROXY_GET_SESSION_CONTEXT' }) || {};
    } catch (error) {
      return {};
    }
  }

  chrome.storage.local.get('settings', async ({ settings }) => {
    const sessionContext = await getSessionContext();
    const dataset = buildInjectedScriptDataset(
      settings,
      sessionContext.userEmail || '',
      sessionContext.cookieHeader || ''
    );

    const script = document.createElement('script');
    applyInjectedScriptAttributes(script, dataset, getPageScriptNonce(document));
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  });

})();
