(function () {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    endpoint: '',
    model: 'claude-sonnet-4-6',
    apiKey: '',
    enableThinking: false,
    thinkingBudget: 10000,
    syncUrl: 'https://sync-interceptor.usw-1.sealos.app',
    syncKey: 'bd8ff72b3b454aa9923b988b9ba3c64e43f5838a275a98f6f717f87aed7bd9dc',
  };

  const $ = (id) => document.getElementById(id);

  async function load() {
    try {
      const { settings } = await chrome.storage.local.get('settings');
      const s = { ...DEFAULTS, ...settings };
      $('enabled').checked = s.enabled;
      $('endpoint').value = s.endpoint;
      $('model').value = s.model;
      $('apiKey').value = s.apiKey;
      $('enableThinking').checked = s.enableThinking;
      $('thinkingBudget').value = s.thinkingBudget;
      $('syncUrl').value = s.syncUrl;
      $('syncKey').value = s.syncKey;
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }

  async function save() {
    const settings = {
      enabled: $('enabled').checked,
      endpoint: $('endpoint').value.replace(/\/+$/, ''),
      model: $('model').value.trim(),
      apiKey: $('apiKey').value.trim(),
      enableThinking: $('enableThinking').checked,
      thinkingBudget: parseInt($('thinkingBudget').value, 10) || 10000,
      syncUrl: $('syncUrl').value.replace(/\/+$/, ''),
      syncKey: $('syncKey').value.trim(),
    };

    try {
      await chrome.storage.local.set({ settings });
      $('status').textContent = 'Saved!';
      setTimeout(() => { $('status').textContent = ''; }, 1500);
    } catch (e) {
      $('status').textContent = 'Error: ' + e.message;
    }
  }

  $('save').addEventListener('click', save);
  load();
})();
