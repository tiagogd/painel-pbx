import { Router } from 'express';
import { getSnapshot } from '../snapshot.js';
import { tvOrAuth } from '../auth/middleware.js';

export function statusRouter({ tvtokens, settings }) {
  const router = Router();
  router.get('/status', tvOrAuth(tvtokens), (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      generatedAt: new Date().toISOString(),
      refreshSeconds: settings.getRefreshSeconds(),
      centrals: getSnapshot(),
    });
  });
  return router;
}
