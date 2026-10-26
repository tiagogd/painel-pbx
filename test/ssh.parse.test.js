import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMemPct, parseDiskPct, parseCpuPct } from '../src/collectors/ssh.js';

const FREE_SAMPLE = `              total        used        free      shared  buff/cache   available
Mem:           7976        3100         900         120        3976        2712
Swap:          2047           0        2047
`;
const DF_SAMPLE = `Filesystem     1024-blocks     Used Available Capacity Mounted on
/dev/sda1         51474044 45000000   3000000      94% /
`;
const STAT_T0 = `cpu  1000 0 500 8000 500 0 0 0 0 0
cpu0 500 0 250 4000 250 0 0 0 0 0
intr 12345
`;
const STAT_T1 = `cpu  1300 0 610 8560 530 0 0 0 0 0
cpu0 650 0 305 4280 265 0 0 0 0 0
intr 23456
`;

test('parse de free/df/proc', () => {
  assert.equal(parseMemPct(FREE_SAMPLE), 66);
  assert.equal(parseDiskPct(DF_SAMPLE), 94);
  assert.ok(Math.abs(parseCpuPct(STAT_T0, STAT_T1) - 41) < 2);
  assert.throws(() => parseDiskPct('lixo'));
});

test('parsers lançam em entrada malformada', () => {
  assert.throws(() => parseMemPct('lixo'));
  assert.throws(() => parseMemPct('Mem: 0 0 0 0 0 0'));
  assert.throws(() => parseCpuPct('lixo', STAT_T1));
  assert.throws(() => parseCpuPct(STAT_T0, STAT_T0)); // delta zero
  assert.throws(() => parseDiskPct('Filesystem Use%\n/dev/sda1 150% /'));
});
