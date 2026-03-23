'use strict';

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
}

module.exports = {
  registerArtifactRoutes,
};
