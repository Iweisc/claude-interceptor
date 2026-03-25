'use strict';

const path = require('node:path');

function isValidArtifactPath(path) {
  return typeof path === 'string' && path.startsWith('/mnt/user-data/outputs/');
}

function registerArtifactRoutes(app, repositories) {
  app.get('/wiggle/download-file', async (req, res) => {
    if (!repositories?.conversations) {
      res.status(500).json({ error: 'Conversations repository unavailable' });
      return;
    }

    const path = typeof req.query.path === 'string' ? req.query.path : '';
    if (!isValidArtifactPath(path)) {
      res.status(400).json({ error: 'Invalid artifact path' });
      return;
    }

    try {
      const artifact = await repositories.conversations.findArtifactByPath({
        userId: req.userId,
        orgId: typeof req.query.orgId === 'string' ? req.query.orgId : '',
      }, path);

      if (!artifact) {
        res.status(404).json({ error: 'Artifact not found' });
        return;
      }

      res.setHeader('Content-Type', `${artifact.mimeType || 'text/plain'}; charset=utf-8`);
      res.send(artifact.content || '');
    } catch (error) {
      res.status(500).json({ error: 'Failed to load artifact' });
    }
  });

  app.get('/artifacts/wiggle_artifact/:artifactId/tools', (_req, res) => {
    res.json({ tools: [] });
  });

  app.get('/api/organizations/:orgId/artifacts/wiggle_artifact/:artifactId/tools', (_req, res) => {
    res.json({ tools: [] });
  });

  app.get('/api/organizations/:orgId/artifacts/wiggle_artifact/:artifactId/manage/storage/info', (_req, res) => {
    res.json({ storage: { used: 0, limit: 1073741824 } });
  });

  app.get('/api/organizations/:orgId/conversations/:convId/wiggle/download-file', async (req, res) => {
    if (!repositories?.conversations) {
      res.status(500).json({ error: 'Conversations repository unavailable' });
      return;
    }

    const filePath = typeof req.query.path === 'string' ? req.query.path : '';
    if (!filePath) {
      res.status(400).json({ error: 'Missing path parameter' });
      return;
    }

    try {
      const artifact = await repositories.conversations.getArtifactByPath({
        userId: req.userId,
        orgId: req.params.orgId,
        conversationId: req.params.convId,
      }, filePath);

      if (!artifact) {
        res.status(404).json({ error: 'Artifact not found' });
        return;
      }

      res.setHeader('Content-Type', `${artifact.mimeType || 'text/plain'}; charset=utf-8`);
      res.send(artifact.content || '');
    } catch (error) {
      res.status(500).json({ error: 'Failed to load artifact' });
    }
  });

  app.get('/api/organizations/:orgId/artifacts/:artifactId/versions', async (req, res) => {
    if (!repositories?.conversations?.getConversation) {
      res.status(500).json({ error: 'Conversations repository unavailable' });
      return;
    }

    try {
      const conversation = await repositories.conversations.getConversation({
        userId: req.userId,
        orgId: req.params.orgId,
        conversationId: req.params.artifactId,
      });
      if (!conversation) {
        res.status(404).json({ error: 'Artifact versions not found' });
        return;
      }

      const files = Object.entries(conversation.artifacts || {}).map(([filePath, artifact]) => ({
        file_path: filePath,
        filename: path.posix.basename(filePath),
        mime_type: artifact?.mimeType || 'text/plain',
      }));

      res.json({
        versions: files.length > 0
          ? [{ version_uuid: req.params.artifactId, files }]
          : [],
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to load artifact versions' });
    }
  });
}

module.exports = {
  registerArtifactRoutes,
};
