'use strict';

const { buildMemoryResponse } = require('../services/claude-shapes');

function registerMemoryRoutes(app, repositories) {
  app.get('/api/organizations/:orgId/memory', async (req, res) => {
    if (!repositories?.memories) {
      res.status(500).json({ error: 'Memories repository unavailable' });
      return;
    }

    try {
      const rows = await repositories.memories.listMemories(req.userId);
      res.json(buildMemoryResponse(rows));
    } catch (error) {
      res.status(500).json({ error: 'Failed to load memory' });
    }
  });

  app.get('/api/organizations/:orgId/subscription_details', (_req, res) => {
    res.json({
      subscription: {
        plan_type: 'claude_max',
        billing_interval: 'monthly',
        currency: 'USD',
      },
      plan_type: 'claude_max',
      is_active: true,
      has_schedule: false,
      next_charge_date: null,
    });
  });
}

module.exports = {
  registerMemoryRoutes,
};
