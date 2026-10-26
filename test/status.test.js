import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { bootForTest, TEST_ADMIN_EMAIL } from '../src/server.js';
import { runCycle } from '../src/scheduler.js';

test('GET /api/status devolve a forma de CentralStatus', async () => {
  const { app } = await bootForTest();
  await runCycle([{ id: 7, name: 'X', ip: '1.2.3.4', type: 'issabel' }], {
    collect: async () => ({ cpu: 85, mem: 1, disk: 2 }),
  });
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ email: TEST_ADMIN_EMAIL, password: 'senha-de-teste' }).expect(302);
  const res = await agent.get('/api/status');
  assert.equal(res.status, 200);
  assert.ok(!Number.isNaN(Date.parse(res.body.generatedAt)));
  assert.equal(res.body.centrals.length, 1);
  const c = res.body.centrals[0];
  assert.deepEqual(Object.keys(c).sort(),
    ['cpu', 'disk', 'error', 'id', 'ip', 'mem', 'name', 'state', 'type', 'updatedAt']);
  assert.equal(c.state, 'warn');
  assert.equal(c.cpu, 85);
});
