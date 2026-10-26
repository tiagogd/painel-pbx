export function loadConfig(env = process.env) {
  const secret = env.PANEL_SECRET || '';
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('PANEL_SECRET ausente ou curto demais: defina um valor com pelo menos 32 bytes.');
  }
  return {
    port: Number(env.PORT) || 3000,
    dbPath: env.DB_PATH || './data/painel.sqlite',
    secret,
    admin: { email: env.ADMIN_EMAIL || '', password: env.ADMIN_PASSWORD || '' },
  };
}
