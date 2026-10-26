import express from 'express';
import { fileURLToPath } from 'node:url';
import { requireAuth, requireTvToken } from '../auth/middleware.js';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));

export function pagesRouter({ tvtokens }) {
  const router = express.Router();
  router.get('/', requireAuth, (req, res) => res.sendFile('dashboard.html', { root: publicDir }));
  router.get('/tv', requireTvToken(tvtokens), (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.sendFile('tv.html', { root: publicDir });
  });
  // Páginas protegidas não são servidas como estáticos soltos.
  router.get(['/dashboard.html', '/tv.html', '/admin.html'], (req, res) => res.status(404).end());
  router.use(express.static(publicDir, { index: false }));
  return router;
}
