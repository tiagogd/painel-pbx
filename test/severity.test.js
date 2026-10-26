import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sev, worst } from '../src/severity.js';

test('limiares', () => {
  assert.equal(sev(79), 'ok'); assert.equal(sev(80), 'warn');
  assert.equal(sev(89), 'warn'); assert.equal(sev(90), 'crit');
  assert.equal(worst(10, 85, 20), 'warn'); assert.equal(worst(95, 10, 10), 'crit');
  assert.equal(worst(10, 20, 30), 'ok');
});
