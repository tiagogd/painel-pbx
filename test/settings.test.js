import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { settingsModel, ALLOWED_REFRESH, DEFAULT_REFRESH } from '../src/models/settings.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec('create table settings (key text primary key, value text not null)');
  return db;
}

test('intervalo: padrão e todos os valores permitidos', () => {
  const s = settingsModel(freshDb());
  assert.equal(s.getRefreshSeconds(), DEFAULT_REFRESH);
  for (const v of ALLOWED_REFRESH) {
    assert.equal(s.setRefreshSeconds(v), v);
    assert.equal(s.getRefreshSeconds(), v);
  }
});

test('trava: rejeita intervalo fora da lista permitida', () => {
  const s = settingsModel(freshDb());
  assert.throws(() => s.setRefreshSeconds(7), /inválido/);
  assert.throws(() => s.setRefreshSeconds(0), /inválido/);
  assert.throws(() => s.setRefreshSeconds(15), /inválido/);
  assert.throws(() => s.setRefreshSeconds('abc'), /inválido/);
  assert.equal(s.getRefreshSeconds(), DEFAULT_REFRESH); // nada foi gravado
});
