import { collect as defaultCollect } from './collectors/index.js';
import { worst } from './severity.js';
import { setSnapshot } from './snapshot.js';

export const INTERVAL_MS = 10_000;
export const CENTRAL_TIMEOUT_MS = 8_000; // < INTERVAL_MS: ciclos não se acumulam

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout após ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function statusOf(central, collect, timeoutMs) {
  const base = { id: central.id, name: central.name, ip: central.ip, type: central.type };
  try {
    if (central.credError) throw new Error(central.credError);
    const { cpu, mem, disk } = await withTimeout(Promise.resolve().then(() => collect(central)), timeoutMs);
    return { ...base, cpu, mem, disk, state: worst(cpu, mem, disk), error: null, updatedAt: new Date().toISOString() };
  } catch (err) {
    return { ...base, cpu: null, mem: null, disk: null, state: 'down', error: err?.message || String(err), updatedAt: new Date().toISOString() };
  }
}

// Um ciclo: coleta todas as centrais em paralelo, cada uma isolada por timeout.
export async function runCycle(centrals, { collect = defaultCollect, timeoutMs = CENTRAL_TIMEOUT_MS } = {}) {
  const snap = await Promise.all(centrals.map(c => statusOf(c, collect, timeoutMs)));
  setSnapshot(snap);
  return snap;
}

export function startScheduler({ getCentrals = () => [], intervalMs = INTERVAL_MS } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runCycle(await getCentrals()); }
    catch (err) { console.error('ciclo de coleta falhou:', err); }
    finally { running = false; }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
