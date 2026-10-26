import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { bootForTest, TEST_ADMIN_EMAIL } from '../src/server.js';
import { auditModel } from '../src/models/audit.js';

async function login(app, email, password) {
  const a = request.agent(app);
  await a.post('/login').type('form').send({ email, password }).expect(302);
  return a;
}

test('admin cria usuário viewer (auditado); viewer não gerencia usuários', async () => {
  const { app, db } = await bootForTest();
  const admin = await login(app, TEST_ADMIN_EMAIL, 'senha-de-teste');
  const r = await admin.post('/admin/api/users').send({ email: 'v@x.com', name: 'V', role: 'viewer', password: 'p' }).expect(201);
  assert.equal(r.body.email, 'v@x.com');
  assert.ok(!('password_hash' in r.body));
  assert.ok(auditModel(db).list().some(a => a.action === 'user.create' && a.actor_email === TEST_ADMIN_EMAIL));
  await admin.post('/admin/api/users').send({ email: 'V@x.com', password: 'p' }).expect(400); // duplicado

  const viewer = await login(app, 'v@x.com', 'p');
  assert.equal((await viewer.get('/admin/api/users')).status, 403);
  assert.equal((await viewer.post('/admin/api/users').send({ email: 'z@x.com', password: 'p' })).status, 403);
  assert.equal((await viewer.post('/admin/api/tv')).status, 403);
  // viewer vê o dashboard e o status via sessão
  assert.equal((await viewer.get('/')).status, 200);
  assert.equal((await viewer.get('/api/status')).status, 200);
});

test('admin lista, troca senha e desativa (auditado); não desativa a si mesmo', async () => {
  const { app, db } = await bootForTest();
  const admin = await login(app, TEST_ADMIN_EMAIL, 'senha-de-teste');
  const v = (await admin.post('/admin/api/users').send({ email: 'v@x.com', role: 'viewer', password: 'p' }).expect(201)).body;
  assert.ok((await admin.get('/admin/api/users').expect(200)).body.length >= 2);
  await admin.put(`/admin/api/users/${v.id}/password`).send({ password: 'nova' }).expect(204);
  await login(app, 'v@x.com', 'nova');
  await admin.post(`/admin/api/users/${v.id}/disable`).expect(204);
  await request(app).post('/login').type('form').send({ email: 'v@x.com', password: 'nova' }).expect(302).expect('location', '/login?erro=1');
  const me = (await admin.get('/admin/api/users')).body.find(u => u.email === TEST_ADMIN_EMAIL);
  await admin.post(`/admin/api/users/${me.id}/disable`).expect(400);
  const acts = auditModel(db).list().map(a => a.action);
  assert.ok(acts.includes('user.password') && acts.includes('user.disable'));
  assert.ok(!JSON.stringify(auditModel(db).list()).includes('nova'));
});
