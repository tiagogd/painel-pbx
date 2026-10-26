import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt } from '../src/crypto.js';

const SECRET = 'segredo-de-teste-com-pelo-menos-32-bytes!!';

test('decrypt(encrypt(x)) devolve x e o blob não contém o texto claro', () => {
  const blob = encrypt('minha-chave-super-secreta', SECRET);
  assert.ok(!blob.includes('minha-chave-super-secreta'));
  assert.ok(!Buffer.from(blob, 'base64').toString('latin1').includes('minha-chave-super-secreta'));
  assert.equal(decrypt(blob, SECRET), 'minha-chave-super-secreta');
});

test('IV aleatório: mesma entrada gera blobs diferentes', () => {
  assert.notEqual(encrypt('x', SECRET), encrypt('x', SECRET));
});

test('adulterar o blob faz decrypt lançar (GCM autenticado)', () => {
  const buf = Buffer.from(encrypt('dado', SECRET), 'base64');
  buf[buf.length - 1] ^= 1;
  assert.throws(() => decrypt(buf.toString('base64'), SECRET));
});

test('segredo errado não decifra', () => {
  const blob = encrypt('dado', SECRET);
  assert.throws(() => decrypt(blob, SECRET + 'x'));
});
