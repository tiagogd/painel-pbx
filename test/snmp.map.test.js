import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapVarbinds, OIDS } from '../src/collectors/snmp.js';

// Formato do net-snmp: { oid, type, value }. Contadores/inteiros vêm como number.
const SAMPLE_VARBINDS = [
  { oid: OIDS.cpuIdle, type: 2, value: 78 },          // ssCpuIdle: 78% ocioso -> cpu 22
  { oid: OIDS.memTotal, type: 2, value: 8000000 },    // kB
  { oid: OIDS.memAvail, type: 2, value: 2000000 },    // kB -> mem 75
  { oid: OIDS.diskPercent, type: 2, value: 41 },      // dskPercent
];
const clone = () => SAMPLE_VARBINDS.map((v) => ({ ...v }));

test('mapeia varbinds de host-resources para percentuais', () => {
  const r = mapVarbinds(SAMPLE_VARBINDS);
  assert.deepEqual(r, { cpu: 22, mem: 75, disk: 41 });
});

test('aceita valor numérico em Buffer/string (OCTET STRING)', () => {
  const v = clone();
  v[3].value = Buffer.from('41');
  assert.equal(mapVarbinds(v).disk, 41);
});

test('varbind ausente lança', () => {
  assert.throws(() => mapVarbinds(clone().slice(0, 3)), /ausente/);
});

test('varbind com erro SNMP (noSuchInstance) lança', () => {
  const v = clone();
  v[0] = { oid: OIDS.cpuIdle, type: 129, value: null }; // noSuchInstance
  assert.throws(() => mapVarbinds(v));
});

test('valor não numérico ou fora de 0-100 lança', () => {
  const v = clone();
  v[3].value = Buffer.from('abc');
  assert.throws(() => mapVarbinds(v));
  const w = clone();
  w[0].value = 150;
  assert.throws(() => mapVarbinds(w), /inválido/);
  const z = clone();
  z[1].value = 0;
  assert.throws(() => mapVarbinds(z));
});
