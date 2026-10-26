import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

// AES-256-GCM. Layout do blob (base64): iv(12) | authTag(16) | ciphertext.
const IV_LEN = 12;
const TAG_LEN = 16;
const APP_SALT = Buffer.from('painel-pbx/credentials/v1');
const keyCache = new Map();

// Deriva a chave de 32 bytes do PANEL_SECRET via HKDF-SHA256 (nunca usa o segredo cru como chave).
function deriveKey(secret) {
  if (Buffer.byteLength(String(secret ?? ''), 'utf8') < 32) throw new Error('segredo curto demais para derivar chave');
  let key = keyCache.get(secret);
  if (!key) {
    key = Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), APP_SALT, 'aes-256-gcm key', 32));
    keyCache.set(secret, key);
  }
  return key;
}

export function encrypt(plaintext, secret) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv, { authTagLength: TAG_LEN });
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

// Lança se o blob foi adulterado, truncado ou a chave não confere.
export function decrypt(blob, secret) {
  const buf = Buffer.from(String(blob), 'base64');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('blob cifrado inválido');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), buf.subarray(0, IV_LEN), { authTagLength: TAG_LEN });
  decipher.setAuthTag(buf.subarray(IV_LEN, IV_LEN + TAG_LEN));
  return Buffer.concat([decipher.update(buf.subarray(IV_LEN + TAG_LEN)), decipher.final()]).toString('utf8');
}
