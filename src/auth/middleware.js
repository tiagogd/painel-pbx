import { getById } from '../models/users.js';

// Revalida o usuário da sessão a cada requisição: desativado/removido perde o acesso na hora.
function sessionUserActive(req) {
  const sid = req.session?.user?.id;
  if (sid == null) return false;
  const u = getById(req.app.locals.db, sid);
  if (u && !u.disabled) return true;
  req.session.destroy(() => {});
  return false;
}

export function requireAuth(req, res, next) {
  if (sessionUserActive(req)) return next();
  res.redirect('/login');
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.session?.user?.role === role) return next();
    res.status(403).send('Acesso negado');
  };
}

export function tokenFrom(req) {
  const q = req.query?.token;
  const t = typeof q === 'string' ? q : req.get('x-tv-token');
  return typeof t === 'string' ? t : '';
}

// Sessão (qualquer papel) OU token de TV válido. 401 (sem redirect) — uso em APIs.
export function tvOrAuth(tvtokens) {
  return (req, res, next) => {
    if (sessionUserActive(req) || tvtokens.isValid(tokenFrom(req))) return next();
    res.status(401).json({ error: 'não autorizado' });
  };
}

// Para páginas da TV: só token válido.
export function requireTvToken(tvtokens) {
  return (req, res, next) => {
    if (tvtokens.isValid(tokenFrom(req))) return next();
    res.status(401).type('html').send('<!doctype html><meta charset="utf-8"><title>Link inválido</title><p>Link inválido ou revogado.</p>');
  };
}
