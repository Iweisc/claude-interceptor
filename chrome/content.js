(function () {
  'use strict';

  function injectScript(textContent) {
    const script = document.createElement('script');
    script.textContent = textContent;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
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

  chrome.storage.local.get('settings', ({ settings }) => {
    injectScript(`window.__CLAUDE_PROXY_SETTINGS__ = ${JSON.stringify({
      endpoint: settings?.endpoint || '',
      model: settings?.model || 'claude-sonnet-4-6',
      apiKey: settings?.apiKey || '',
      enableThinking: settings?.enableThinking === true,
      thinkingBudget: Number.parseInt(settings?.thinkingBudget, 10) || 10000,
    })};`);

    const script = document.createElement('script');
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
