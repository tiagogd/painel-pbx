import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCycle } from '../src/scheduler.js';
import { getSnapshot } from '../src/snapshot.js';

const okCentral = { id: 1, name: 'A', ip: '10.0.0.1', type: 'asterisk' };
const okHot = { id: 3, name: 'C', ip: '10.0.0.3', type: 'asterisk' };
const falhaCentral = { id: 2, name: 'B', ip: '10.0.0.2', type: 'asterisk' };
const lentaCentral = { id: 4, name: 'D', ip: '10.0.0.4', type: 'asterisk' };

const collect = async (c) => {
  if (c.id === 2) throw new Error('conexao recusada');
  if (c.id === 4) return new Promise(() => {}); // nunca resolve
  if (c.id === 3) return { cpu: 95, mem: 10, disk: 10 };
  return { cpu: 10, mem: 20, disk: 30 };
};

test('central inacessivel vira down e nao derruba as outras', async () => {
  const snap = await runCycle([okCentral, falhaCentral, okHot], { collect, timeoutMs: 200 });
  const ok = snap.find(c => c.id === 1);
  assert.equal(ok.state, 'ok');
  assert.equal(ok.error, null);
  assert.equal(snap.find(c => c.id === 3).state, 'crit');
  const ruim = snap.find(c => c.id === 2);
  assert.equal(ruim.state, 'down');
  assert.match(ruim.error, /conexao recusada/);
  assert.equal(ruim.cpu, null);
  assert.ok(!Number.isNaN(Date.parse(ruim.updatedAt)));
  assert.deepEqual(getSnapshot(), snap);
});

test('collect mais lento que o timeout vira down sem bloquear as outras', async () => {
  const t0 = Date.now();
  const snap = await runCycle([lentaCentral, okCentral], { collect, timeoutMs: 100 });
  assert.ok(Date.now() - t0 < 1000);
  const lenta = snap.find(c => c.id === 4);
  assert.equal(lenta.state, 'down');
  assert.match(lenta.error, /timeout/i);
  assert.equal(snap.find(c => c.id === 1).state, 'ok');
});

test('extras (uptime/status/ramais) chegam ao snapshot', async () => {
  const col = async () => ({ cpu: 10, mem: 20, disk: 30, uptime: '1 day 02:03:04', sysStatus: 'running', extOnline: 5, extTotal: 8 });
  const snap = await runCycle([{ id: 9, name: 'Y', ip: '10.0.0.9', type: 'yeastar' }], { collect: col, timeoutMs: 200 });
  const y = snap[0];
  assert.equal(y.state, 'ok');
  assert.equal(y.uptime, '1 day 02:03:04');
  assert.equal(y.sysStatus, 'running');
  assert.equal(y.extOnline, 5);
  assert.equal(y.extTotal, 8);
});
