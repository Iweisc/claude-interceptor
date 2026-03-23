'use strict';

const { runCompletion } = require('../services/completion-runner');

function registerCompletionRoutes(app, { repositories, services, config }) {
  app.post('/api/organizations/:orgId/chat_conversations/:convId/completion', async (req, res) => {
    await runCompletion({
      req,
      res,
      context: {
        userId: req.userId,
        orgId: req.params.orgId,
        conversationId: req.params.convId,
      },
      repositories,
      services,
      config,
      isRetry: false,
    });
  });

  app.post('/api/organizations/:orgId/chat_conversations/:convId/retry_completion', async (req, res) => {
    await runCompletion({
      req,
      res,
      context: {
        userId: req.userId,
        orgId: req.params.orgId,
        conversationId: req.params.convId,
      },
      repositories,
      services,
      config,
      isRetry: true,
    });
  });
}

module.exports = {
  registerCompletionRoutes,
};
