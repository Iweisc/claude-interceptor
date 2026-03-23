(function () {
  'use strict';

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
    const script = document.createElement('script');
    script.dataset.endpoint = settings?.endpoint || '';
    script.dataset.model = settings?.model || 'claude-sonnet-4-6';
    script.dataset.apiKey = settings?.apiKey || '';
    script.dataset.enableThinking = String(settings?.enableThinking === true);
    script.dataset.thinkingBudget = String(Number.parseInt(settings?.thinkingBudget, 10) || 10000);
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
