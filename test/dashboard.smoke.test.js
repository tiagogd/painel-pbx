import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { bootForTest } from '../src/server.js';

test('dashboard é servida', async () => {
  const { app } = await bootForTest();
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /dashboard\.js/);
});

test('assets estáticos e endpoint respondem para a página', async () => {
  const { app } = await bootForTest();
  assert.equal((await request(app).get('/dashboard.js')).status, 200);
  assert.equal((await request(app).get('/styles.css')).status, 200);
  assert.equal((await request(app).get('/api/status')).status, 200);
});
