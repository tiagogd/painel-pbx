import { randomBytes } from 'node:crypto';
import { auditModel } from './audit.js';

// Nunca grava o token inteiro na auditoria: só um prefixo para identificar.
const tag = (token) => String(token).slice(0, 6) + '…';

export function tvtokensModel(db) {
  const audit = auditModel(db);
  return {
    create(actor) {
      const token = randomBytes(32).toString('base64url'); // 256 bits
      db.prepare('insert into tv_tokens (token, created_by) values (?, ?)').run(token, actor?.email ?? null);
      audit.add(actor, 'tv.create', tag(token));
      return { token };
    },
    revoke(actor, token) {
      const info = db.prepare("update tv_tokens set revoked_at = datetime('now') where token = ? and revoked_at is null").run(String(token ?? ''));
      if (info.changes) audit.add(actor, 'tv.revoke', tag(token));
      return info.changes > 0;
    },
    isValid(token) {
      if (!token || typeof token !== 'string') return false;
      return !!db.prepare('select 1 from tv_tokens where token = ? and revoked_at is null').get(token);
    },
    list() {
      return db.prepare('select token, created_by, created_at from tv_tokens where revoked_at is null order by created_at desc, rowid desc').all();
    },
  };
}
