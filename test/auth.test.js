import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { bootForTest, TEST_ADMIN_EMAIL } from '../src/server.js';
import * as users from '../src/models/users.js';

const ADMIN_PW = 'senha-de-teste';

async function setup() {
  const ctx = await bootForTest();
  users.create(ctx.db, { email: 'viewer@teste.local', name: 'V', password: 'viewer-pw', role: 'viewer' });
  return ctx;
}
async function loginAs(app, email, password) {
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ email, password }).expect(302);
  return agent;
}

test('login válido cria sessão; rota protegida sem sessão redireciona', async () => {
  const { app } = await setup();
  const agent = request.agent(app);
  const r = await agent.get('/admin');
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, '/login');
  const login = await agent.post('/login').send({ email: TEST_ADMIN_EMAIL, password: ADMIN_PW });
  assert.equal(login.status, 302);
  const cookie = login.headers['set-cookie'].join(';');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.equal((await agent.get('/admin')).status, 200);
});

test('email é case-insensitive e senha errada não loga', async () => {
  const { app } = await setup();
  await loginAs(app, TEST_ADMIN_EMAIL.toUpperCase(), ADMIN_PW);
  const bad = await request(app).post('/login').send({ email: TEST_ADMIN_EMAIL, password: 'errada' });
  assert.equal(bad.status, 302);
  assert.match(bad.headers.location, /^\/login\?erro/);
});

test('viewer não acessa rota de admin', async () => {
  const { app } = await setup();
  const agent = await loginAs(app, 'viewer@teste.local', 'viewer-pw');
  assert.equal((await agent.get('/admin')).status, 403);
});

test('logout encerra a sessão', async () => {
  const { app } = await setup();
  const agent = await loginAs(app, TEST_ADMIN_EMAIL, ADMIN_PW);
  await agent.post('/logout').expect(302);
  assert.equal((await agent.get('/admin')).status, 302);
});

test('usuário desabilitado não loga; verify não vaza password_hash', async () => {
  const { app, db } = await setup();
  const u = users.verify(db, 'viewer@teste.local', 'viewer-pw');
  assert.ok(u);
  assert.equal('password_hash' in u, false);
  assert.ok(users.list(db).every((x) => !('password_hash' in x)));
  users.disable(db, u.id);
  assert.equal(users.verify(db, 'viewer@teste.local', 'viewer-pw'), null);
});

test('sessão persiste no SQLite (sobrevive a novo app com o mesmo db)', async () => {
  const { app, db, config } = await setup();
  const agent = await loginAs(app, TEST_ADMIN_EMAIL, ADMIN_PW);
  const { createApp } = await import('../src/server.js');
  const app2 = createApp({ db, config });
  const cookie = agent.jar.getCookies({ domain: '127.0.0.1', path: '/', secure: false, script: false })
    .map((c) => `${c.name}=${c.value}`).join('; ');
  assert.equal((await request(app2).get('/admin').set('Cookie', cookie)).status, 200);
});
