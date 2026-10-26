import express from 'express';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { openDb } from './db.js';

export function createApp() {
  const app = express();
  app.get('/health', (req, res) => res.json({ ok: true }));
  return app;
}

export const app = createApp();

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
  return { app: createApp(), db, config };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  openDb(config);
  app.listen(config.port, () => console.log(`Painel PBX em http://localhost:${config.port}`));
}
