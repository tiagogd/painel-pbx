import express from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { auditModel } from '../models/audit.js';
import * as users from '../models/users.js';

// Tudo admin-only e auditado. Nunca devolve hash de senha.
export function usersRouter({ db, tvtokens }) {
  const router = express.Router();
  const audit = auditModel(db);
  router.use(['/admin/api/users', '/admin/api/tv'], requireAuth, requireRole('admin'), express.json({ limit: '16kb' }));

  const handle = (fn) => (req, res) => {
    try { fn(req, res); }
    catch (err) {
      const dup = /UNIQUE/i.test(err.message);
      res.status(400).json({ error: dup ? 'e-mail já cadastrado' : err.message });
    }
  };
  const idOf = (req) => Number(req.params.id);
  const exists = (id) => db.prepare('select 1 from users where id = ?').get(id);

  router.get('/admin/api/audit', requireAuth, requireRole('admin'), (req, res) => res.json(audit.list(200)));
  router.get('/admin/api/users', (req, res) => res.json(users.list(db)));
  router.post('/admin/api/users', handle((req, res) => {
    const { email, name, role, password } = req.body ?? {};
    if (!String(email ?? '').trim()) throw new Error('e-mail obrigatório');
    const u = users.create(db, { email, name, role: role ?? 'viewer', password });
    audit.add(req.session.user, 'user.create', u.email, `papel=${u.role}`);
    res.status(201).json(u);
  }));
  router.put('/admin/api/users/:id/password', handle((req, res) => {
    if (!exists(idOf(req))) throw new Error('usuário não encontrado');
    users.setPassword(db, idOf(req), req.body?.password);
    audit.add(req.session.user, 'user.password', idOf(req));
    res.status(204).end();
  }));
  router.post('/admin/api/users/:id/disable', handle((req, res) => {
    if (!exists(idOf(req))) throw new Error('usuário não encontrado');
    if (idOf(req) === req.session.user.id) throw new Error('você não pode desativar a si mesmo');
    users.disable(db, idOf(req));
    audit.add(req.session.user, 'user.disable', idOf(req));
    res.status(204).end();
  }));

  router.get('/admin/api/tv', (req, res) => res.json(tvtokens.list()));
  router.post('/admin/api/tv', (req, res) => res.status(201).json(tvtokens.create(req.session.user)));
  router.delete('/admin/api/tv/:token', (req, res) => {
    tvtokens.revoke(req.session.user, req.params.token);
    res.status(204).end();
  });
  return router;
}
