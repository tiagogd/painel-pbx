import express from 'express';
import { fileURLToPath } from 'node:url';
import * as users from '../models/users.js';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));

export function authRouter({ db }) {
  const router = express.Router();
  const body = [express.urlencoded({ extended: false }), express.json()];

  router.get('/login', (req, res) => res.sendFile('login.html', { root: publicDir }));

  router.post('/login', body, (req, res, next) => {
    const user = users.verify(db, req.body?.email, req.body?.password);
    if (!user) return res.redirect('/login?erro=1');
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };
      req.session.save((err2) => (err2 ? next(err2) : res.redirect('/')));
    });
  });

  router.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      res.redirect('/login');
    });
  });

  return router;
}
