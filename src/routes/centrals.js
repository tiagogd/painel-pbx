import express from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';

// Todas as rotas exigem admin. Respostas só trazem campos públicos (nunca segredos).
export function centralsRouter({ centrals }) {
  const router = express.Router();
  router.use('/admin/api', requireAuth, requireRole('admin'), express.json({ limit: '64kb' }));

  const handle = (fn) => (req, res) => {
    try { fn(req, res); }
    catch (err) { res.status(err.status || 400).json({ error: err.message }); }
  };
  const idOf = (req) => Number(req.params.id);

  router.get('/admin/api/centrals', (req, res) => res.json(centrals.list()));
  router.post('/admin/api/centrals', handle((req, res) => {
    res.status(201).json(centrals.create(req.session.user, req.body ?? {}));
  }));
  router.put('/admin/api/centrals/:id', handle((req, res) => {
    res.json(centrals.update(req.session.user, idOf(req), req.body ?? {}));
  }));
  router.delete('/admin/api/centrals/:id', handle((req, res) => {
    centrals.remove(req.session.user, idOf(req));
    res.status(204).end();
  }));
  return router;
}
