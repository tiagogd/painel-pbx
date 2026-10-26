import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { bootForTest, TEST_ADMIN_EMAIL } from '../src/server.js';

test('GET /health responde ok e o schema existe', async () => {
  const { app, db } = await bootForTest();
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  const tabelas = db.prepare("select name from sqlite_master where type='table'").all().map(t => t.name);
  for (const t of ['users', 'centrals', 'sessions', 'audit', 'tv_tokens']) assert.ok(tabelas.includes(t), t);
});

test('primeiro admin é semeado a partir do config', async () => {
  const { db } = await bootForTest();
  const admin = db.prepare('select role from users where email=?').get(TEST_ADMIN_EMAIL);
  assert.equal(admin.role, 'admin');
});

test('config recusa PANEL_SECRET curto', async () => {
  const { loadConfig } = await import('../src/config.js');
  assert.throws(() => loadConfig({ PANEL_SECRET: 'curto' }), /PANEL_SECRET/);
});
