export function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  res.redirect('/login');
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.session?.user?.role === role) return next();
    res.status(403).send('Acesso negado');
  };
}
