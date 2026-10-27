// Configurações do painel (key/value em SQLite). Hoje só o intervalo de atualização.
export const ALLOWED_REFRESH = [5, 10, 30, 60, 120]; // segundos (trava)
export const DEFAULT_REFRESH = 10;

export function settingsModel(db) {
  const getStmt = db.prepare('select value from settings where key = ?');
  const setStmt = db.prepare(
    'insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value',
  );

  return {
    getRefreshSeconds() {
      const row = getStmt.get('refresh_seconds');
      const n = row ? Number(row.value) : DEFAULT_REFRESH;
      return ALLOWED_REFRESH.includes(n) ? n : DEFAULT_REFRESH;
    },
    // Trava: só aceita os valores permitidos; qualquer outro é rejeitado.
    setRefreshSeconds(seconds) {
      const n = Number(seconds);
      if (!ALLOWED_REFRESH.includes(n)) {
        throw Object.assign(
          new Error(`intervalo inválido: use ${ALLOWED_REFRESH.join(', ')} segundos`),
          { status: 400 },
        );
      }
      setStmt.run('refresh_seconds', String(n));
      return n;
    },
  };
}
