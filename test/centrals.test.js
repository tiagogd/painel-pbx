import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { bootForTest, TEST_ADMIN_EMAIL } from '../src/server.js';
import { decrypt } from '../src/crypto.js';
import { centralsModel } from '../src/models/centrals.js';
import { auditModel } from '../src/models/audit.js';
import * as users from '../src/models/users.js';

const actor = { email: 'admin@teste.local' };

async function setup() {
  const { app, db, config } = await bootForTest();
  return { app, db, config, centrals: centralsModel(db, config.secret), audit: auditModel(db) };
}

test('credencial é cifrada em repouso, não volta na listagem e é recuperável p/ coleta', async () => {
  const { db, config, centrals } = await setup();
  const c = centrals.create(actor, { name: 'X', ip: '10.0.0.1', type: '3cx', collectMethod: 'ssh', username: 'root', password: 'minha-chave' });
  const row = db.prepare('select cred_cipher from centrals where id=?').get(c.id);
  assert.ok(!row.cred_cipher.includes('minha-chave'));
  assert.ok(!Buffer.from(row.cred_cipher, 'base64').toString('latin1').includes('minha-chave'));
  assert.equal(JSON.parse(decrypt(row.cred_cipher, config.secret)).password, 'minha-chave');
  const listed = centrals.list();
  assert.ok(!JSON.stringify(listed).includes('minha-chave'));
  assert.ok(!('cred_cipher' in listed[0]) && !('password' in listed[0]));
  assert.ok(!JSON.stringify(c).includes('minha-chave'));
  const [forCollector] = centrals.listForCollector();
  assert.deepEqual(
    { host: forCollector.host, port: forCollector.port, collectMethod: forCollector.collectMethod, username: forCollector.username, password: forCollector.password, ip: forCollector.ip },
    { host: '10.0.0.1', port: null, collectMethod: 'ssh', username: 'root', password: 'minha-chave', ip: '10.0.0.1' });
});

test('mapeamento SNMP v3 para o formato do coletor', async () => {
  const { centrals } = await setup();
  centrals.create(actor, { name: 'Y', ip: '10.0.0.2', type: 'yeastar', collectMethod: 'snmp', snmpVersion: '3', port: 161,
    snmpUser: 'u', authKey: 'ak-12345678', privKey: 'pk-12345678', authProtocol: 'sha', privProtocol: 'aes' });
  const [c] = centrals.listForCollector();
  assert.equal(c.snmpVersion, '3');
  assert.equal(c.snmpUser, 'u');
  assert.equal(c.authKey, 'ak-12345678');
  assert.equal(c.privKey, 'pk-12345678');
  assert.equal(c.port, 161);
});

test('cadastro, edição e remoção geram auditoria com o ator, sem segredos', async () => {
  const { centrals, audit } = await setup();
  const c = centrals.create(actor, { name: 'Y', ip: '10.0.0.2', type: 'yeastar', collectMethod: 'snmp', snmpVersion: '2c', community: 'comunidade-secreta' });
  centrals.update(actor, c.id, { name: 'Y2' });
  centrals.remove(actor, c.id);
  const log = audit.list();
  for (const a of ['central.create', 'central.update', 'central.remove']) {
    assert.ok(log.some(l => l.action === a && l.actor_email === actor.email), a);
  }
  assert.ok(!JSON.stringify(log).includes('comunidade-secreta'));
});

test('update sem segredo mantém o existente; com segredo substitui', async () => {
  const { centrals } = await setup();
  const c = centrals.create(actor, { name: 'S', ip: '1.1.1.1', type: '3cx', collectMethod: 'ssh', username: 'root', password: 'antiga' });
  centrals.update(actor, c.id, { name: 'S2', password: '' });
  assert.equal(centrals.listForCollector()[0].password, 'antiga');
  centrals.update(actor, c.id, { password: 'nova' });
  const [x] = centrals.listForCollector();
  assert.equal(x.password, 'nova');
  assert.equal(x.username, 'root');
  assert.equal(x.name, 'S2');
});

test('validação rejeita dados inválidos', async () => {
  const { centrals } = await setup();
  assert.throws(() => centrals.create(actor, { name: '', ip: '1.1.1.1', type: 'x', collectMethod: 'ssh' }));
  assert.throws(() => centrals.create(actor, { name: 'a', ip: '1.1.1.1', type: 'x', collectMethod: 'telnet' }));
});

async function loginAs(app, email, password) {
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ email, password });
  return agent;
}

test('rotas /admin/api/centrals: só admin, e a resposta nunca traz segredos', async () => {
  const { app, db } = await setup();
  users.create(db, { email: 'v@teste.local', password: 'pw-viewer', role: 'viewer' });
  assert.equal((await request(app).get('/admin/api/centrals')).status, 302);
  const viewer = await loginAs(app, 'v@teste.local', 'pw-viewer');
  assert.equal((await viewer.get('/admin/api/centrals')).status, 403);
  assert.equal((await viewer.post('/admin/api/centrals').send({})).status, 403);

  const admin = await loginAs(app, TEST_ADMIN_EMAIL, 'senha-de-teste');
  const created = await admin.post('/admin/api/centrals').send({ name: 'R', ip: '2.2.2.2', type: '3cx', collectMethod: 'ssh', username: 'root', password: 'segredo-rota' });
  assert.equal(created.status, 201);
  const upd = await admin.put(`/admin/api/centrals/${created.body.id}`).send({ name: 'R2' });
  assert.equal(upd.status, 200);
  const list = await admin.get('/admin/api/centrals');
  assert.equal(list.status, 200);
  for (const body of [created.body, upd.body, list.body]) {
    assert.ok(!JSON.stringify(body).includes('segredo-rota'));
    assert.ok(!JSON.stringify(body).includes('cred_cipher'));
  }
  assert.equal(list.body[0].hasCredential, true);
  assert.equal((await admin.post('/admin/api/centrals').send({ name: '' })).status, 400);
  assert.equal((await admin.delete(`/admin/api/centrals/${created.body.id}`)).status, 204);
  assert.equal((await admin.get('/admin/api/centrals')).body.length, 0);
});

test('pagina /admin serve o HTML real so para admin', async () => {
  const { app } = await setup();
  const admin = await loginAs(app, TEST_ADMIN_EMAIL, 'senha-de-teste');
  const res = await admin.get('/admin');
  assert.equal(res.status, 200);
  assert.match(res.text, /id="form-central"/);
});
