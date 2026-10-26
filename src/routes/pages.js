import express from 'express';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));

export function pagesRouter() {
  const router = express.Router();
  router.get('/', (req, res) => res.sendFile('dashboard.html', { root: publicDir }));
  router.use(express.static(publicDir, { index: false }));
  return router;
}
