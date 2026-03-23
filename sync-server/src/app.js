'use strict';

const express = require('express');

function createApp({ config, pool, repositories = {}, services = {} }) {
  void config;
  void pool;
  void repositories;
  void services;

  const app = express();

  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

module.exports = {
  createApp,
};
