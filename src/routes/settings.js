import express from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { ALLOWED_REFRESH } from '../models/settings.js';

// Configurações do painel (admin). A alteração do intervalo é auditada.
export function settingsRouter({ settings, audit }) {
  const router = express.Router();
  router.use('/admin/api', requireAuth, requireRole('admin'), express.json({ limit: '8kb' }));

  const handle = (fn) => (req, res) => {
    try { fn(req, res); }
    catch (err) { res.status(err.status || 400).json({ error: err.message }); }
  };

  router.get('/admin/api/settings', (req, res) =>
    res.json({ refreshSeconds: settings.getRefreshSeconds(), allowed: ALLOWED_REFRESH }));

  router.put('/admin/api/settings/refresh', handle((req, res) => {
    const n = settings.setRefreshSeconds((req.body ?? {}).seconds);
    audit.add(req.session.user, 'settings.refresh', `${n}s`, null);
    res.json({ refreshSeconds: n });
  }));

  return router;
}
