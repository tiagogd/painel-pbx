import snmp from 'net-snmp';

// OIDs confirmados num Yeastar P-Series real (enterprise Yeastar = 22736).
// O P-Series NÃO expõe UCD-SNMP (2021) nem host-resources (25): CPU/mem/disco
// vivem no MIB privado da Yeastar, como OCTET STRING no formato "NN%".
export const OIDS = {
  cpu:  '1.3.6.1.4.1.22736.3.1.6.0',  // uso de CPU, ex. "39%"
  mem:  '1.3.6.1.4.1.22736.3.1.7.0',  // uso de memória, ex. "37%"
  disk: '1.3.6.1.4.1.22736.3.1.8.0',  // uso de disco, ex. "45%"
};

const TIMEOUT_MS = 2500;      // por requisição
const RETRIES = 2;            // cobre a descoberta de engine do SNMPv3 na 1ª troca
const OVERALL_TIMEOUT_MS = 8000;

function pct(n, nome) {
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`percentual inválido (${nome}): ${n}`);
  return Math.round(n);
}

// Lê um varbind e converte "NN%" / número em percentual. Lança se faltar/for inválido/vazio.
function readPct(map, oid, nome) {
  const vb = map.get(oid);
  if (!vb) throw new Error(`varbind ausente: ${nome} (${oid})`);
  if (snmp.isVarbindError(vb)) throw new Error(`erro SNMP em ${nome}: ${snmp.varbindError(vb)}`);
  const raw = vb.value;
  const s = typeof raw === 'number'
    ? String(raw)
    : (Buffer.isBuffer(raw) ? raw.toString() : String(raw)).replace('%', '').trim();
  if (s === '') throw new Error(`valor vazio: ${nome}`);
  return pct(Number(s), nome);
}

// Função pura: varbinds do GET -> { cpu, mem, disk } em 0-100. Lança se faltar/for inválido.
export function mapVarbinds(varbinds) {
  const map = new Map((varbinds || []).map((vb) => [vb.oid, vb]));
  return {
    cpu: readPct(map, OIDS.cpu, 'cpu'),
    mem: readPct(map, OIDS.mem, 'mem'),
    disk: readPct(map, OIDS.disk, 'disk'),
  };
}

function openSession(central) {
  const target = central.host || central.ip;
  if (!target) throw new Error('central sem host/ip');
  const opts = { port: central.port || 161, timeout: TIMEOUT_MS, retries: RETRIES };

  if (central.snmpVersion === '2c' || central.snmpVersion === 2) {
    return snmp.createSession(target, central.community, { ...opts, version: snmp.Version2c });
  }

  // SNMPv3: authNoPriv por padrão; authPriv só quando há chave de privacidade.
  const authProtocol = snmp.AuthProtocols[central.authProtocol || 'sha']; // "padrão" no form = sha
  if (!authProtocol) throw new Error(`authProtocol SNMPv3 inválido: ${central.authProtocol} (use 'md5' ou 'sha')`);
  const hasPriv = Boolean(central.privKey);
  const user = {
    name: central.snmpUser,
    level: hasPriv ? snmp.SecurityLevel.authPriv : snmp.SecurityLevel.authNoPriv,
    authProtocol,
    authKey: central.authKey,
  };
  if (hasPriv) {
    const privProtocol = snmp.PrivProtocols[central.privProtocol || 'aes'];
    if (!privProtocol) throw new Error(`privProtocol SNMPv3 inválido: ${central.privProtocol}`);
    user.privProtocol = privProtocol;
    user.privKey = central.privKey;
  }
  return snmp.createV3Session(target, user, { ...opts, version: snmp.Version3 });
}

// central: { host|ip, port?, snmpVersion: '3'|'2c',
//   v3: snmpUser/authKey/authProtocol ('md5'|'sha') + opcional privKey/privProtocol (authPriv),
//   v2c: community } (credenciais já decifradas; Task 7)
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
