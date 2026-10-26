import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { bootForTest, TEST_ADMIN_EMAIL } from '../src/server.js';

async function loggedIn(app) {
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ email: TEST_ADMIN_EMAIL, password: 'senha-de-teste' }).expect(302);
  return agent;
}

test('dashboard exige login e é servida a quem está logado', async () => {
  const { app } = await bootForTest();
  const anon = await request(app).get('/');
  assert.equal(anon.status, 302);
  assert.equal(anon.headers.location, '/login');
  const res = await (await loggedIn(app)).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /dashboard\.js/);
});

test('assets estáticos e endpoint respondem para a página', async () => {
  const { app } = await bootForTest();
  const agent = await loggedIn(app);
  assert.equal((await request(app).get('/dashboard.js')).status, 200);
  assert.equal((await request(app).get('/styles.css')).status, 200);
  assert.equal((await agent.get('/api/status')).status, 200);
  assert.equal((await request(app).get('/api/status')).status, 401);
});
