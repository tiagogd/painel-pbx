import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { bootForTest, TEST_ADMIN_EMAIL } from '../src/server.js';
import { centralsModel } from '../src/models/centrals.js';
import { runCycle } from '../src/scheduler.js';
import * as users from '../src/models/users.js';

async function login(app, email, password) {
  const a = request.agent(app);
  await a.post('/login').type('form').send({ email, password }).expect(302);
  return a;
}

test('usuário desativado perde acesso imediatamente (página e API)', async () => {
  const { app, db } = await bootForTest();
  users.create(db, { email: 'v@x.com', password: 'p', role: 'viewer' });
  const v = await login(app, 'v@x.com', 'p');
  await v.get('/').expect(200);
  await v.get('/api/status').expect(200);
  db.prepare('update users set disabled = 1 where email = ?').run('v@x.com');
  await v.get('/').expect(302).expect('location', '/login');
  await v.get('/api/status').expect(401);
});

test('admin desativado não acessa mais /admin/api', async () => {
  const { app, db } = await bootForTest();
  users.create(db, { email: 'a2@x.com', password: 'p', role: 'admin' });
  const a = await login(app, 'a2@x.com', 'p');
  await a.get('/admin/api/users').expect(200);
  users.disable(db, users.getById(db, users.list(db).find(u => u.email === 'a2@x.com').id).id);
  await a.get('/admin/api/users').expect(302);
});

test('GET /admin/api/audit: admin vê entradas, viewer recebe 403', async () => {
  const { app, db } = await bootForTest();
  const admin = await login(app, TEST_ADMIN_EMAIL, 'senha-de-teste');
  await admin.post('/admin/api/users').send({ email: 'v@x.com', password: 'p' }).expect(201);
  const r = await admin.get('/admin/api/audit').expect(200);
  assert.ok(r.body.some(a => a.action === 'user.create'));
  assert.ok(r.body[0].id > r.body[r.body.length - 1].id || r.body.length === 1);
  const v = await login(app, 'v@x.com', 'p');
  assert.equal((await v.get('/admin/api/audit')).status, 403);
});

test('credencial ilegível: central vira down e as outras seguem', async () => {
  const { db, config } = await bootForTest();
  const centrals = centralsModel(db, config.secret);
  const actor = { email: 'a@x' };
  const bad = centrals.create(actor, { name: 'Ruim', ip: '10.0.0.1', type: '3cx', collectMethod: 'ssh', username: 'u', password: 'p' });
  centrals.create(actor, { name: 'Boa', ip: '10.0.0.2', type: '3cx', collectMethod: 'simulator' });
  db.prepare('update centrals set cred_cipher = ? where id = ?').run('lixo-nao-decifravel', bad.id);
  const list = centrals.listForCollector();
  assert.equal(list.length, 2);
  const snap = await runCycle(list, { collect: async () => ({ cpu: 10, mem: 10, disk: 10 }), timeoutMs: 200 });
  const r = snap.find(c => c.id === bad.id);
  assert.equal(r.state, 'down');
  assert.match(r.error, /credencial/);
  assert.equal(snap.find(c => c.id !== bad.id).state, 'ok');
});

test('/tv envia Referrer-Policy: no-referrer', async () => {
  const { app } = await bootForTest();
  const admin = await login(app, TEST_ADMIN_EMAIL, 'senha-de-teste');
  const t = (await admin.post('/admin/api/tv').expect(201)).body;
  const r = await request(app).get('/tv?token=' + t.token).expect(200);
  assert.equal(r.headers['referrer-policy'], 'no-referrer');
});
