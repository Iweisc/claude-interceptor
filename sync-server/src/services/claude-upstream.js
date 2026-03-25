'use strict';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const MAX_RATE_LIMIT_TIER = 'default_claude_max_20x';
const MAX_BOOTSTRAP_MODELS = Object.freeze([
  { model: 'claude-sonnet-4-5-20250929', name: 'Sonnet 4.5' },
  { model: 'claude-opus-4-6', name: 'Opus 4.6' },
  { model: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5' },
]);

function clonePayload(payload) {
  return payload && typeof payload === 'object' ? structuredClone(payload) : {};
}

function withMaxCapabilities(capabilities) {
  return Array.from(new Set([...(Array.isArray(capabilities) ? capabilities : []), 'claude_pro', 'claude_max']));
}

function patchBootstrapModelsConfig(models) {
  const next = [];
  const seen = new Set();

  if (Array.isArray(models)) {
    for (const model of models) {
      if (!model || typeof model !== 'object' || typeof model.model !== 'string') continue;
      next.push({ ...model, inactive: false });
      seen.add(model.model);
    }
  }

  for (const model of MAX_BOOTSTRAP_MODELS) {
    if (seen.has(model.model)) continue;
    next.push({ ...model, inactive: false, overflow: false });
  }

  return next;
}

function patchOrganization(organization) {
  if (!organization || typeof organization !== 'object') return organization;

  return {
    ...organization,
    billing_type: 'stripe',
    rate_limit_tier: MAX_RATE_LIMIT_TIER,
    free_credits_status: null,
    api_disabled_reason: null,
    capabilities: withMaxCapabilities(organization.capabilities),
    claude_ai_bootstrap_models_config: patchBootstrapModelsConfig(organization.claude_ai_bootstrap_models_config),
  };
}

function patchMemberships(memberships) {
  if (!Array.isArray(memberships)) return memberships;

  return memberships.map((membership) => {
    if (!membership || typeof membership !== 'object') return membership;
    return {
      ...membership,
      organization: patchOrganization(membership.organization),
    };
  });
}

function patchModels(models) {
  if (!Array.isArray(models)) return models;

  return models.map((model) => {
    if (!model || typeof model !== 'object') return model;
    return {
      ...model,
      minimum_tier: 'free',
    };
  });
}

function patchFeatureCollection(features) {
  if (!features || typeof features !== 'object') return features;

  const next = {};

  for (const [featureId, featureValue] of Object.entries(features)) {
    if (!featureValue || typeof featureValue !== 'object') {
      next[featureId] = featureValue;
      continue;
    }

    const patchedFeature = { ...featureValue };

    if (patchedFeature.defaultValue?.models) {
      patchedFeature.defaultValue = {
        ...patchedFeature.defaultValue,
        models: patchModels(patchedFeature.defaultValue.models),
      };
    }

    if (Array.isArray(patchedFeature.rules)) {
      patchedFeature.rules = patchedFeature.rules.map((rule) => {
        if (!rule || typeof rule !== 'object' || !rule.force?.models) return rule;
        return {
          ...rule,
          force: {
            ...rule.force,
            models: patchModels(rule.force.models),
          },
        };
      });
    }

    next[featureId] = patchedFeature;
  }

  return next;
}

function patchAccountPayload(payload) {
  const next = clonePayload(payload);

  if (Array.isArray(next.memberships)) {
    next.memberships = patchMemberships(next.memberships);
  }

  if (next.account?.memberships) {
    next.account = {
      ...next.account,
      memberships: patchMemberships(next.account.memberships),
    };
  }

  if (next.organization) {
    next.organization = patchOrganization(next.organization);
  }

  if ('capabilities' in next || Array.isArray(next.capabilities)) {
    next.capabilities = withMaxCapabilities(next.capabilities);
  }

  if ('billing_type' in next) {
    next.billing_type = 'stripe';
  }

  return next;
}

function patchBootstrapPayload(payload) {
  const next = patchAccountPayload(payload);

  if (next.growthbook?.attributes) {
    next.growthbook = {
      ...next.growthbook,
      attributes: {
        ...next.growthbook.attributes,
        isPro: true,
        isMax: true,
      },
    };
  }

  if (next.org_growthbook?.user || next.org_growthbook?.features) {
    next.org_growthbook = {
      ...next.org_growthbook,
      user: next.org_growthbook?.user ? {
        ...next.org_growthbook.user,
        orgType: 'claude_max',
        isPro: true,
        isMax: true,
      } : next.org_growthbook?.user,
      features: patchFeatureCollection(next.org_growthbook?.features),
    };
  }

  if (next.org_statsig?.user) {
    next.org_statsig = {
      ...next.org_statsig,
      user: {
        ...next.org_statsig.user,
        orgType: 'claude_max',
        isPro: true,
        isMax: true,
      },
    };
  }

  if (Array.isArray(next.models)) {
    next.models = patchModels(next.models);
  }

  return next;
}

function extractAccountEmail(payload) {
  if (typeof payload?.email_address === 'string' && payload.email_address.trim()) {
    return payload.email_address.trim();
  }

  if (typeof payload?.email === 'string' && payload.email.trim()) {
    return payload.email.trim();
  }

  return '';
}

function buildUpstreamHeaders(requestHeaders, cookieHeader) {
  const headers = {
    accept: requestHeaders.accept || 'application/json',
  };

  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  if (requestHeaders['user-agent']) {
    headers['user-agent'] = requestHeaders['user-agent'];
  }

  if (requestHeaders['accept-language']) {
    headers['accept-language'] = requestHeaders['accept-language'];
  }

  return headers;
}

function buildPassthroughHeaders(requestHeaders, cookieHeader) {
  const headers = {};

  for (const [name, value] of Object.entries(requestHeaders || {})) {
    const lower = name.toLowerCase();
    if (!value || HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (lower === 'x-forward-cookie' || lower === 'x-litellm-endpoint' || lower === 'x-litellm-key') continue;
    headers[lower] = Array.isArray(value) ? value.join(', ') : value;
  }

  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  return headers;
}

async function fetchUpstreamJson({ fetchImpl, url, headers, timeoutMs }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const text = await response.text();

    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = null;
    }

    return {
      response,
      text,
      payload,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function proxyUpstreamRequest({ fetchImpl, url, method, headers, body, timeoutMs }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    return {
      response,
      body: Buffer.from(await response.arrayBuffer()),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  buildPassthroughHeaders,
  buildUpstreamHeaders,
  extractAccountEmail,
  fetchUpstreamJson,
  patchAccountPayload,
  patchBootstrapPayload,
  proxyUpstreamRequest,
};
