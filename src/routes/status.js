import { Router } from 'express';
import { getSnapshot } from '../snapshot.js';

export function statusRouter() {
  const router = Router();
  router.get('/status', (req, res) => {
    res.json({ generatedAt: new Date().toISOString(), centrals: getSnapshot() });
  });
  return router;
}
