import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
create table if not exists users (
  id integer primary key autoincrement,
  email text not null unique,
  name text,
  password_hash text not null,
  role text not null default 'viewer',
  disabled integer not null default 0,
  created_at text not null default (datetime('now'))
);
create table if not exists centrals (
  id integer primary key autoincrement,
  name text not null,
  ip text not null,
  type text not null,
  collect_method text not null,
  port integer,
  snmp_version text,
  cred_cipher text,
  created_at text not null default (datetime('now'))
);
create table if not exists sessions (
  sid text primary key,
  data text not null,
  expires integer not null
);
create table if not exists audit (
  id integer primary key autoincrement,
  ts text not null default (datetime('now')),
  actor_email text,
  action text not null,
  target text,
  detail text
);
create table if not exists tv_tokens (
  token text primary key,
  created_by text,
  created_at text not null default (datetime('now')),
  revoked_at text
);
create table if not exists settings (
  key text primary key,
  value text not null
);
`;

export function openDb(config) {
  if (config.dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(config.dbPath)), { recursive: true });
  }
  const db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  seedAdmin(db, config.admin);
  return db;
}

function seedAdmin(db, admin) {
  const { n } = db.prepare('select count(*) n from users').get();
  if (n > 0 || !admin?.email || !admin?.password) return;
  db.prepare("insert into users (email, name, password_hash, role) values (?, 'Administrador', ?, 'admin')")
    .run(admin.email, bcrypt.hashSync(admin.password, 10));
}
