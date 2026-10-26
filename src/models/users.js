import bcrypt from 'bcryptjs';

const PUBLIC = 'id, email, name, role, disabled, created_at';
const norm = (email) => String(email ?? '').trim().toLowerCase();

export function verify(db, email, password) {
  const row = db.prepare('select * from users where lower(email) = ? and disabled = 0').get(norm(email));
  // compara sempre, para não vazar por tempo se o usuário existe
  const ok = bcrypt.compareSync(String(password ?? ''), row?.password_hash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
  if (!row || !ok) return null;
  return db.prepare(`select ${PUBLIC} from users where id = ?`).get(row.id);
}

export function getById(db, id) {
  return db.prepare(`select ${PUBLIC} from users where id = ?`).get(id) ?? null;
}

export function create(db, { email, name = null, password, role = 'viewer' }) {
  if (!['admin', 'viewer'].includes(role)) throw new Error('papel inválido');
  if (!password) throw new Error('senha obrigatória');
  const info = db.prepare('insert into users (email, name, password_hash, role) values (?, ?, ?, ?)')
    .run(norm(email), name, bcrypt.hashSync(password, 10), role);
  return db.prepare(`select ${PUBLIC} from users where id = ?`).get(info.lastInsertRowid);
}

export function list(db) {
  return db.prepare(`select ${PUBLIC} from users order by id`).all();
}

export function setPassword(db, id, password) {
  if (!password) throw new Error('senha obrigatória');
  db.prepare('update users set password_hash = ? where id = ?').run(bcrypt.hashSync(password, 10), id);
}

export function disable(db, id) {
  db.prepare('update users set disabled = 1 where id = ?').run(id);
}
