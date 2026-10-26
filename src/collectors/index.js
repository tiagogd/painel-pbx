import * as simulator from './simulator.js';

const collectors = { simulator: simulator.collect };

export function collect(central) {
  const fn = collectors[central.collectMethod || 'simulator'];
  if (!fn) return Promise.reject(new Error(`método de coleta desconhecido: ${central.collectMethod}`));
  return fn(central);
}

// Task 7 troca isto para ler as centrais reais do banco.
export function listCentrals() {
  return simulator.simulatedCentrals;
}
