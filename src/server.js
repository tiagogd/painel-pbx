import express from 'express';
import session from 'express-session';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { statusRouter } from './routes/status.js';
import { pagesRouter } from './routes/pages.js';
import { startScheduler } from './scheduler.js';
import { SqliteStore } from './auth/store.js';
import { authRouter } from './auth/routes.js';
import { requireAuth, requireRole } from './auth/middleware.js';
import { centralsRouter } from './routes/centrals.js';
import { centralsModel } from './models/centrals.js';
import { tvtokensModel } from './models/tvtokens.js';
import { usersRouter } from './routes/users.js';
import { settingsModel } from './models/settings.js';
import { settingsRouter } from './routes/settings.js';
import { auditModel } from './models/audit.js';

export function createApp({ db, config } = {}) {
  const app = express();
  app.locals.db = db;
  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use(session({
    name: 'connect.sid',
    secret: config.secret,
    store: new SqliteStore(db),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600 * 1000 },
  }));
  app.use(authRouter({ db }));
  const centrals = centralsModel(db, config.secret);
  const settings = settingsModel(db);
  const audit = auditModel(db);
  app.get('/admin', requireAuth, requireRole('admin'), (req, res) =>
    res.sendFile('admin.html', { root: fileURLToPath(new URL('../public/', import.meta.url)) }));
  app.use(centralsRouter({ centrals }));
  app.use(settingsRouter({ settings, audit }));
  const tvtokens = tvtokensModel(db);
  app.use(usersRouter({ db, tvtokens }));
  app.use('/api', statusRouter({ tvtokens, settings }));
  app.use(pagesRouter({ tvtokens }));
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
  const centrals = centralsModel(db, config.secret);
  const settings = settingsModel(db);
  startScheduler({
    getCentrals: () => centrals.listForCollector(),
    getIntervalMs: () => settings.getRefreshSeconds() * 1000,
  });
  app.listen(config.port, '0.0.0.0', () => console.log(`Painel PBX escutando em 0.0.0.0:${config.port}`));
}
