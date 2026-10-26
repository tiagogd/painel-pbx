import snmp from 'net-snmp';

// OIDs num só lugar. São os padrões UCD-SNMP (net-snmp agent); os exatos serão
// confirmados contra um Yeastar P-Series real ao plugar o primeiro (variam um pouco
// por modelo/firmware). Ajustar aqui e em mapVarbinds se necessário.
export const OIDS = {
  cpuIdle: '1.3.6.1.4.1.2021.11.11.0',      // UCD ssCpuIdle (% ocioso)
  memTotal: '1.3.6.1.4.1.2021.4.5.0',       // UCD memTotalReal (kB)
  memAvail: '1.3.6.1.4.1.2021.4.6.0',       // UCD memAvailReal (kB)
  diskPercent: '1.3.6.1.4.1.2021.9.1.9.1',  // UCD dskPercent da 1ª partição (%)
};

const TIMEOUT_MS = 3000; // por requisição
const RETRIES = 1;       // pior caso ~ 2 x 3s = 6s
const OVERALL_TIMEOUT_MS = 8000;

function pct(n, nome) {
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`percentual inválido (${nome}): ${n}`);
  return Math.round(n);
}

function num(map, oid, nome) {
  const vb = map.get(oid);
  if (!vb) throw new Error(`varbind ausente: ${nome} (${oid})`);
  if (snmp.isVarbindError(vb)) throw new Error(`erro SNMP em ${nome}: ${snmp.varbindError(vb)}`);
  const raw = vb.value;
  const v = Buffer.isBuffer(raw) ? Number(raw.toString().trim()) : typeof raw === 'string' ? Number(raw.trim()) : raw;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`valor não numérico: ${nome}`);
  return v;
}

// Função pura: varbinds do GET -> { cpu, mem, disk } em 0-100. Lança se faltar/for inválido.
export function mapVarbinds(varbinds) {
  const map = new Map((varbinds || []).map((vb) => [vb.oid, vb]));
  const idle = num(map, OIDS.cpuIdle, 'cpu');
  const total = num(map, OIDS.memTotal, 'memTotal');
  const avail = num(map, OIDS.memAvail, 'memAvail');
  const disk = num(map, OIDS.diskPercent, 'disk');
  if (!(total > 0)) throw new Error('memTotal inválido');
  return {
    cpu: pct(100 - idle, 'cpu'),
    mem: pct(((total - avail) / total) * 100, 'mem'),
    disk: pct(disk, 'disk'),
  };
}

function openSession(central) {
  const target = central.host || central.ip;
  const opts = { port: central.port || 161, timeout: TIMEOUT_MS, retries: RETRIES };
  if (central.snmpVersion === '2c' || central.snmpVersion === 2) {
    return snmp.createSession(target, central.community, { ...opts, version: snmp.Version2c });
  }
  // v3 preferido: authPriv
  const user = {
    name: central.snmpUser,
    level: snmp.SecurityLevel.authPriv,
    authProtocol: snmp.AuthProtocols[central.authProtocol || 'sha'],
    authKey: central.authKey,
    privProtocol: snmp.PrivProtocols[central.privProtocol || 'aes'],
    privKey: central.privKey,
  };
  return snmp.createV3Session(target, user, { ...opts, version: snmp.Version3 });
}

// central: { host|ip, port?, snmpVersion: '3'|'2c', v3: snmpUser/authKey/privKey/authProtocol?/privProtocol?,
//            v2c: community } (credenciais já decifradas; Task 7)
export async function collect(central) {
  const session = openSession(central);
  let timer;
  try {
    const get = new Promise((resolve, reject) => {
      session.on('error', reject);
      session.get(Object.values(OIDS), (err, varbinds) => (err ? reject(err) : resolve(varbinds)));
    });
    const guard = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout na coleta snmp')), OVERALL_TIMEOUT_MS);
    });
    return mapVarbinds(await Promise.race([get, guard]));
  } finally {
    clearTimeout(timer);
    session.close();
  }
}
