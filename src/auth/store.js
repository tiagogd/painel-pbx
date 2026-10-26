import session from 'express-session';

// Store de sessão na tabela `sessions` (sid, data, expires[ms]) do mesmo SQLite.
export class SqliteStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.db.prepare('delete from sessions where expires < ?').run(Date.now());
  }
  #expires(sess) {
    const e = sess?.cookie?.expires;
    return e ? new Date(e).getTime() : Date.now() + 86400000;
  }
  get(sid, cb) {
    try {
      const row = this.db.prepare('select data from sessions where sid = ? and expires > ?').get(sid, Date.now());
      cb(null, row ? JSON.parse(row.data) : null);
    } catch (e) { cb(e); }
  }
  set(sid, sess, cb) {
    try {
      this.db.prepare('insert or replace into sessions (sid, data, expires) values (?, ?, ?)')
        .run(sid, JSON.stringify(sess), this.#expires(sess));
      cb?.(null);
    } catch (e) { cb?.(e); }
  }
  destroy(sid, cb) {
    try { this.db.prepare('delete from sessions where sid = ?').run(sid); cb?.(null); } catch (e) { cb?.(e); }
  }
  touch(sid, sess, cb) {
    try {
      this.db.prepare('update sessions set expires = ? where sid = ?').run(this.#expires(sess), sid);
      cb?.(null);
    } catch (e) { cb?.(e); }
  }
}
