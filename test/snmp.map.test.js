import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapVarbinds, OIDS } from '../src/collectors/snmp.js';

// net-snmp: { oid, type, value }. No Yeastar P-Series os percentuais vêm como
// OCTET STRING no formato "NN%" (type 4).
const SAMPLE_VARBINDS = [
  { oid: OIDS.cpu, type: 4, value: Buffer.from('39%') },
  { oid: OIDS.mem, type: 4, value: Buffer.from('37%') },
  { oid: OIDS.disk, type: 4, value: Buffer.from('45%') },
];
const clone = () => SAMPLE_VARBINDS.map((v) => ({ ...v }));

test('mapeia os percentuais do MIB Yeastar (OCTET STRING "NN%")', () => {
  assert.deepEqual(mapVarbinds(SAMPLE_VARBINDS), { cpu: 39, mem: 37, disk: 45 });
});

test('aceita valor numérico puro', () => {
  const v = clone();
  v[0].value = 39;
  assert.equal(mapVarbinds(v).cpu, 39);
});

test('varbind ausente lança', () => {
  assert.throws(() => mapVarbinds(clone().slice(0, 2)), /ausente/);
});

test('varbind com erro SNMP (noSuchInstance) lança', () => {
  const v = clone();
  v[0] = { oid: OIDS.cpu, type: 129, value: null }; // noSuchInstance
  assert.throws(() => mapVarbinds(v));
});

test('valor não numérico, vazio ou fora de 0-100 lança', () => {
  const bad = clone(); bad[2].value = Buffer.from('abc%');
  assert.throws(() => mapVarbinds(bad));
  const high = clone(); high[0].value = Buffer.from('150%');
  assert.throws(() => mapVarbinds(high), /inválido/);
  const empty = clone(); empty[1].value = Buffer.from('');
  assert.throws(() => mapVarbinds(empty), /vazio/);
});
