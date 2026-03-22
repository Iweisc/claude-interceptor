(function () {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    endpoint: '',
    model: 'claude-sonnet-4-6',
    apiKey: '',
    enableThinking: false,
    thinkingBudget: 10000,
  };

  const $ = (id) => document.getElementById(id);

  async function load() {
    try {
      const { settings } = await browser.storage.local.get('settings');
      const s = { ...DEFAULTS, ...settings };
      $('enabled').checked = s.enabled;
      $('endpoint').value = s.endpoint;
      $('model').value = s.model;
      $('apiKey').value = s.apiKey;
      $('enableThinking').checked = s.enableThinking;
      $('thinkingBudget').value = s.thinkingBudget;
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
    };

    try {
      await browser.storage.local.set({ settings });
      $('status').textContent = 'Saved!';
      setTimeout(() => { $('status').textContent = ''; }, 1500);
    } catch (e) {
      $('status').textContent = 'Error: ' + e.message;
    }
  }

  $('save').addEventListener('click', save);
  load();
})();
