import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { bootForTest, TEST_ADMIN_EMAIL } from '../src/server.js';
import { tvtokensModel } from '../src/models/tvtokens.js';
import { auditModel } from '../src/models/audit.js';

const actor = { email: TEST_ADMIN_EMAIL };

test('token de TV válido acessa status; inválido/revogado é barrado', async () => {
  const { app, db } = await bootForTest();
  const tv = tvtokensModel(db);
  const { token } = tv.create(actor);
  assert.ok(token.length >= 40);
  assert.equal((await request(app).get('/api/status?token=' + token)).status, 200);
  assert.equal((await request(app).get('/api/status').set('x-tv-token', token)).status, 200);
  assert.equal((await request(app).get('/api/status')).status, 401);
  assert.equal((await request(app).get('/api/status?token=nope')).status, 401);
  tv.revoke(actor, token);
  assert.equal((await request(app).get('/api/status?token=' + token)).status, 401);
  const log = auditModel(db).list();
  assert.ok(log.some(a => a.action === 'tv.create') && log.some(a => a.action === 'tv.revoke'));
  assert.ok(!JSON.stringify(log).includes(token));
});

test('/tv serve a view read-only só com token válido; / exige login', async () => {
  const { app, db } = await bootForTest();
  const tv = tvtokensModel(db);
  const { token } = tv.create(actor);
  const ok = await request(app).get('/tv?token=' + token);
  assert.equal(ok.status, 200);
  assert.doesNotMatch(ok.text, /admin/i);
  assert.equal((await request(app).get('/tv')).status, 401);
  assert.equal((await request(app).get('/tv?token=zzz')).status, 401);
  const r = await request(app).get('/');
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, '/login');
  tv.revoke(actor, token);
  assert.equal((await request(app).get('/tv?token=' + token)).status, 401);
});

test('API de admin cria/lista/revoga link de TV; viewer é barrado', async () => {
  const { app, db } = await bootForTest();
  const admin = request.agent(app);
  await admin.post('/login').type('form').send({ email: TEST_ADMIN_EMAIL, password: 'senha-de-teste' }).expect(302);
  const created = await admin.post('/admin/api/tv').expect(201);
  const token = created.body.token;
  assert.equal((await request(app).get('/api/status?token=' + token)).status, 200);
  assert.equal((await admin.get('/api/status')).status, 200); // sessão admin
  assert.ok((await admin.get('/admin/api/tv').expect(200)).body.some(t => t.token === token));
  await admin.delete('/admin/api/tv/' + token).expect(204);
  assert.equal((await request(app).get('/api/status?token=' + token)).status, 401);
  void db;
});
