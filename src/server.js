import express from 'express';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { statusRouter } from './routes/status.js';
import { pagesRouter } from './routes/pages.js';
import { startScheduler } from './scheduler.js';

export function createApp({ db, config } = {}) {
  const app = express();
  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use('/api', statusRouter());
  app.use(pagesRouter());
  return app;
}

export const TEST_ADMIN_EMAIL = 'admin@teste.local';

// DB em memória descartável: nunca toca arquivo real.
export async function bootForTest() {
  const config = loadConfig({
    PANEL_SECRET: 'segredo-de-teste-com-pelo-menos-32-bytes!!',
    DB_PATH: ':memory:',
    ADMIN_EMAIL: TEST_ADMIN_EMAIL,
    ADMIN_PASSWORD: 'senha-de-teste',
  });
  const db = openDb(config);
  return { app: createApp({ db, config }), db, config };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const db = openDb(config);
  const app = createApp({ db, config });
  startScheduler();
  app.listen(config.port, () => console.log(`Painel PBX em http://localhost:${config.port}`));
}
