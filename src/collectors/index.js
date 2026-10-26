import * as simulator from './simulator.js';
import * as ssh from './ssh.js';
import * as snmp from './snmp.js';

const collectors = { simulator: simulator.collect, ssh: ssh.collect, snmp: snmp.collect };

// Despacha pelo collectMethod da central (formato produzido por centrals.listForCollector()).
export function collect(central) {
  const fn = collectors[central.collectMethod || 'simulator'];
  if (!fn) return Promise.reject(new Error(`método de coleta desconhecido: ${central.collectMethod}`));
  return fn(central);
}
