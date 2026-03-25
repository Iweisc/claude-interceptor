'use strict';

// This script runs in MAIN world at document_start — before ANY page scripts.
// It overrides the IDB preload cache, clears stale caches, AND installs
// the fetch override that patches bootstrap/account responses for Pro spoofing.

// 1. Override IDB preload cache
try {
  Object.defineProperty(window, '__PRELOADED_IDB_CACHE__', {
    value: Promise.resolve(undefined),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, '__PRELOADED_IDB_CACHE_RESULT__', {
    value: undefined,
    writable: true,
    configurable: true,
  });
} catch (e) { /* ignore */ }

// 2. Clear GrowthBook/Statsig localStorage caches
try {
  for (var i = localStorage.length - 1; i >= 0; i--) {
    var k = localStorage.key(i);
    if (k && /^(growthbook|statsig|gb_|ss_)/.test(k)) {
      localStorage.removeItem(k);
    }
  }
} catch (e) { /* ignore */ }

// 3. Clear IDB cache
try {
  var req = indexedDB.open('keyval-store', 1);
  req.onsuccess = function () {
    try {
      var db = req.result;
      var tx = db.transaction('keyval', 'readwrite');
      tx.objectStore('keyval').delete('react-query-cache');
      tx.oncomplete = function () { db.close(); };
    } catch (e) { /* ignore */ }
  };
} catch (e) { /* ignore */ }

// 4. Install fetch override for plan spoofing BEFORE any page scripts fetch bootstrap
(function () {
  var BOOTSTRAP_RE = /^\/api\/bootstrap(?:\/[^/]+\/app_start)?$/;
  var originalFetch = window.fetch;

  function patchOrg(org) {
    if (!org) return;
    org.billing_type = 'stripe';
    org.rate_limit_tier = 'default_claude_max_20x';
    org.subscription_type = 'claude_max';
    org.free_credits_status = null;
    org.api_disabled_reason = null;
    if (Array.isArray(org.capabilities)) {
      // Only add claude_max (not claude_pro) so the UI shows "Max plan"
      // The ternary is: hasPro ? "Pro" : hasMax ? "Max" : "Free"
      // Adding both would show "Pro" since it's checked first
      if (!org.capabilities.includes('claude_max')) org.capabilities.push('claude_max');
    }
    // Override model tiers to all "free"
    if (org.claude_ai_bootstrap_models_config) {
      try {
        var config = typeof org.claude_ai_bootstrap_models_config === 'string'
          ? JSON.parse(org.claude_ai_bootstrap_models_config)
          : org.claude_ai_bootstrap_models_config;
        if (Array.isArray(config.models)) {
          config.models.forEach(function (m) { m.minimum_tier = 'free'; });
          org.claude_ai_bootstrap_models_config = typeof org.claude_ai_bootstrap_models_config === 'string'
            ? JSON.stringify(config)
            : config;
        }
      } catch (e) { /* ignore */ }
    }
  }

  function patchAccountPayload(body) {
    if (body && Array.isArray(body.memberships)) {
      body.memberships.forEach(function (m) {
        if (m && m.organization) patchOrg(m.organization);
      });
    }
    return body;
  }

  function patchBootstrapPayload(body) {
    if (body && body.account && Array.isArray(body.account.memberships)) {
      body.account.memberships.forEach(function (m) {
        if (m && m.organization && Array.isArray(m.organization.capabilities) && m.organization.capabilities.indexOf('chat') !== -1) {
          patchOrg(m.organization);
        }
      });
    }
    // Patch GrowthBook
    if (body && body.org_growthbook && body.org_growthbook.user) {
      body.org_growthbook.user.orgType = 'claude_max';
      body.org_growthbook.user.isPro = true;
      body.org_growthbook.user.isMax = true;
    }
    if (body && body.growthbook && body.growthbook.attributes) {
      body.growthbook.attributes.isPro = true;
      body.growthbook.attributes.isMax = true;
    }
    // Patch Statsig
    if (body && body.org_statsig && body.org_statsig.user) {
      body.org_statsig.user.orgType = 'claude_max';
      body.org_statsig.user.isPro = true;
      body.org_statsig.user.isMax = true;
    }
    // Override model tiers in GrowthBook features
    if (body && body.org_growthbook && body.org_growthbook.features) {
      var features = body.org_growthbook.features;
      Object.keys(features).forEach(function (fid) {
        var fval = features[fid];
        var dv = fval && fval.defaultValue;
        if (dv && dv.models && Array.isArray(dv.models) && dv.models[0] && dv.models[0].minimum_tier !== undefined) {
          dv.models.forEach(function (m) { m.minimum_tier = 'free'; });
          if (fval.rules) {
            fval.rules.forEach(function (rule) {
              if (rule.force && rule.force.models) {
                rule.force.models.forEach(function (m) { m.minimum_tier = 'free'; });
              }
            });
          }
        }
      });
    }
    if (body && body.current_user_access && Array.isArray(body.current_user_access.features)) {
      var required = ['web_search', 'wiggle', 'skills', 'mcp_artifacts', 'inline_visualizations', 'interactive_content', 'saffron', 'geolocation', 'thumbs', 'tool_approval_default_always_allow'];
      var feats = body.current_user_access.features;
      var existingSet = {};
      feats.forEach(function (f) { if (f && f.feature) existingSet[f.feature] = f; });
      required.forEach(function (name) {
        if (existingSet[name]) { existingSet[name].status = 'available'; }
        else { feats.push({ feature: name, status: 'available' }); }
      });
    }
    return body;
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    var pathname;
    try { pathname = new URL(url, 'https://claude.ai').pathname; } catch (e) { pathname = ''; }

    // Patch /api/account
    if (pathname === '/api/account' || pathname === '/api/account_profile') {
      return originalFetch.apply(this, arguments).then(function (response) {
        return response.clone().json().then(function (body) {
          patchAccountPayload(body);
          return new Response(JSON.stringify(body), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }).catch(function () { return response; });
      });
    }

    // Patch /api/bootstrap
    if (BOOTSTRAP_RE.test(pathname)) {
      return originalFetch.apply(this, arguments).then(function (response) {
        return response.clone().json().then(function (body) {
          patchBootstrapPayload(body);
          return new Response(JSON.stringify(body), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }).catch(function () { return response; });
      });
    }

    // Fake subscription_details
    if (/\/subscription_details$/.test(pathname)) {
      return Promise.resolve(new Response(JSON.stringify({ subscription: null, is_active: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    }

    return originalFetch.apply(this, arguments);
  };
})();
