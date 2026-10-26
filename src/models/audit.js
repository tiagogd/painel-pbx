export function auditModel(db) {
  return {
    add(actor, action, target = null, detail = null) {
      db.prepare('insert into audit (actor_email, action, target, detail) values (?, ?, ?, ?)')
        .run(actor?.email ?? null, action, target == null ? null : String(target), detail == null ? null : String(detail));
    },
    list(limit = 200) {
      return db.prepare('select id, ts, actor_email, action, target, detail from audit order by id desc limit ?').all(limit);
    },
  };
}
