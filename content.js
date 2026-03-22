(function () {
  'use strict';

  // Clear the React Query IDB cache (content scripts share origin with the page).
  // The page preloads this cache from an inline script in the HTML. We clear it here
  // (document_start) so the preload finds nothing and falls back to a network fetch,
  // which background.js modifies via filterResponseData.
  try {
    const req = indexedDB.open('keyval-store', 1);
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').delete('react-query-cache');
        tx.oncomplete = () => db.close();
      } catch (e) { /* ignore */ }
    };
  } catch (e) { /* ignore */ }

  // Inject the fetch interceptor into the page context
  const script = document.createElement('script');
  script.src = browser.runtime.getURL('inject.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  // Inject CSS for basic upgrade hiding
  const style = document.createElement('style');
  style.textContent = `
    a[href="/upgrade"] { display: none !important; }
    [aria-disabled="true"] { pointer-events: auto !important; opacity: 1 !important; }
  `;
  (document.head || document.documentElement).appendChild(style);

  // No DOM text manipulation — the bootstrap API interception in background.js
  // handles plan spoofing at the network level.

  // Active ports keyed by request ID
  const activePorts = new Map();

  // Listen for messages from inject.js (page context)
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type !== 'CLAUDE_INTERCEPT_REQUEST') return;

    const { id, body, url } = event.data;
    console.log('[content.js] Relaying request to background, id=' + id);

    const port = browser.runtime.connect({ name: 'intercept' });
    activePorts.set(id, port);

    port.postMessage({ type: 'REQUEST', id, body, url });

    port.onMessage.addListener((msg) => {
      window.postMessage(
        { type: 'CLAUDE_INTERCEPT_' + msg.type, id, data: msg.data, error: msg.error },
        '*'
      );

      if (msg.type === 'DONE' || msg.type === 'ERROR' || msg.type === 'PASSTHROUGH') {
        activePorts.delete(id);
        port.disconnect();
      }
    });

    port.onDisconnect.addListener(() => {
      if (activePorts.has(id)) {
        window.postMessage(
          { type: 'CLAUDE_INTERCEPT_ERROR', id, error: 'Background script disconnected' },
          '*'
        );
        activePorts.delete(id);
      }
    });
  });

  console.log('[content.js] Claude Intercepter: content script loaded');
})();
