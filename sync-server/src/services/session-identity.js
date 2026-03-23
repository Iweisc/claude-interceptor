'use strict';

const crypto = require('node:crypto');

function buildSessionCacheKey(cookieHeader) {
  return crypto
    .createHash('sha256')
    .update(String(cookieHeader || ''))
    .digest('hex');
}

function createSessionIdentityCache({ ttlMs = 300000, now = () => Date.now() } = {}) {
  const cache = new Map();

  return {
    get(cookieHeader) {
      if (!cookieHeader) return null;

      const key = buildSessionCacheKey(cookieHeader);
      const entry = cache.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        cache.delete(key);
        return null;
      }

      return entry.email;
    },
    set(cookieHeader, email) {
      if (!cookieHeader || !email) return null;

      const normalizedEmail = String(email).trim().toLowerCase();
      const key = buildSessionCacheKey(cookieHeader);
      cache.set(key, {
        email: normalizedEmail,
        expiresAt: now() + ttlMs,
      });
      return normalizedEmail;
    },
  };
}

module.exports = {
  buildSessionCacheKey,
  createSessionIdentityCache,
};
