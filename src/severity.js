export const WARN_AT = 80;
export const CRIT_AT = 90;

export function sev(v) {
  if (v >= CRIT_AT) return 'crit';
  if (v >= WARN_AT) return 'warn';
  return 'ok';
}

const RANK = { ok: 0, warn: 1, crit: 2 };

export function worst(cpu, mem, disk) {
  return [cpu, mem, disk].map(sev).reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok');
}
