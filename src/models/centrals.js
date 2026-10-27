import { encrypt, decrypt } from '../crypto.js';
import { auditModel } from './audit.js';

const METHODS = ['ssh', 'snmp', 'simulator'];
// Campos secretos por método: vão para o bundle cifrado em cred_cipher.
const SECRET_FIELDS = {
  ssh: ['username', 'privateKey', 'password'],
  snmp: ['snmpUser', 'authKey', 'privKey', 'authProtocol', 'privProtocol', 'community'],
  simulator: [],
};
// Subconjunto NÃO secreto (identidade/config) que pode voltar à tela ao editar.
// Nunca inclui chaves, senhas nem community.
const IDENTITY_FIELDS = {
  ssh: ['username'],
  snmp: ['snmpUser', 'authProtocol', 'privProtocol'],
  simulator: [],
};
const COLS = 'id, name, ip, type, collect_method, port, snmp_version, cred_cipher, created_at';

const blank = (v) => v === undefined || v === null || v === '';

function toPublic(row) {
  return {
    id: row.id, name: row.name, ip: row.ip, type: row.type,
    collectMethod: row.collect_method, port: row.port, snmpVersion: row.snmp_version,
    hasCredential: !!row.cred_cipher, createdAt: row.created_at,
  };
}

function validate({ name, ip, type, collectMethod, port, snmpVersion }) {
  if (blank(name) || blank(ip) || blank(type)) throw new Error('nome, ip e tipo são obrigatórios');
  if (!METHODS.includes(collectMethod)) throw new Error('método de coleta inválido');
  if (!blank(port) && !(Number.isInteger(Number(port)) && Number(port) > 0 && Number(port) < 65536)) throw new Error('porta inválida');
  if (collectMethod === 'snmp' && !['3', '2c'].includes(String(snmpVersion))) throw new Error('versão SNMP inválida (3 ou 2c)');
}

// Mantém só os campos secretos do método; vazio = "não informado".
const pickSecrets = (method, data) =>
  Object.fromEntries(SECRET_FIELDS[method].filter((k) => !blank(data[k])).map((k) => [k, String(data[k])]));

export function centralsModel(db, secret) {
  const audit = auditModel(db);
  const getRow = (id) => db.prepare(`select ${COLS} from centrals where id = ?`).get(id);
  const bundleOf = (row) => (row.cred_cipher ? JSON.parse(decrypt(row.cred_cipher, secret)) : {});
  const seal = (bundle) => (Object.keys(bundle).length ? encrypt(JSON.stringify(bundle), secret) : null);
  const num = (v) => (blank(v) ? null : Number(v));
  const notFound = () => Object.assign(new Error('central não encontrada'), { status: 404 });

  return {
    list() {
      return db.prepare(`select ${COLS} from centrals order by id`).all().map(toPublic);
    },

    // Para o formulário de edição: público + identidade NÃO secreta (usuário/protocolo).
    // Nunca devolve chaves, senhas nem community.
    getForEdit(id) {
      const row = getRow(id);
      if (!row) throw notFound();
      const out = toPublic(row);
      try {
        const bundle = bundleOf(row);
        for (const k of (IDENTITY_FIELDS[row.collect_method] || [])) {
          if (bundle[k] !== undefined) out[k] = bundle[k];
        }
      } catch { /* credencial ilegível: devolve só o público */ }
      return out;
    },

    create(actor, data) {
      validate(data);
      const info = db.prepare(
        'insert into centrals (name, ip, type, collect_method, port, snmp_version, cred_cipher) values (?, ?, ?, ?, ?, ?, ?)',
      ).run(String(data.name).trim(), String(data.ip).trim(), String(data.type).trim(), data.collectMethod,
        num(data.port), data.collectMethod === 'snmp' ? String(data.snmpVersion) : null,
        seal(pickSecrets(data.collectMethod, data)));
      const row = getRow(info.lastInsertRowid);
      audit.add(actor, 'central.create', `${row.name} (#${row.id})`, `metodo=${row.collect_method}`);
      return toPublic(row);
    },

    update(actor, id, data) {
      const cur = getRow(id);
      if (!cur) throw notFound();
      const merged = {
        name: data.name ?? cur.name, ip: data.ip ?? cur.ip, type: data.type ?? cur.type,
        collectMethod: data.collectMethod ?? cur.collect_method,
        port: data.port !== undefined ? data.port : cur.port,
        snmpVersion: data.snmpVersion ?? cur.snmp_version,
      };
      validate(merged);
      // Segredos: mantém os atuais (se o método não mudou) e sobrepõe só o que foi reenviado.
      const base = merged.collectMethod === cur.collect_method ? bundleOf(cur) : {};
      const sent = pickSecrets(merged.collectMethod, data);
      const bundle = { ...base, ...sent };
      const changed = ['name', 'ip', 'type', 'collectMethod', 'port', 'snmpVersion'].filter((k) => data[k] !== undefined);
      db.prepare(
        'update centrals set name=?, ip=?, type=?, collect_method=?, port=?, snmp_version=?, cred_cipher=? where id=?',
      ).run(String(merged.name).trim(), String(merged.ip).trim(), String(merged.type).trim(), merged.collectMethod,
        num(merged.port), merged.collectMethod === 'snmp' ? String(merged.snmpVersion) : null, seal(bundle), id);
      const row = getRow(id);
      // Detalhe da auditoria: só nomes de campos, nunca valores.
      audit.add(actor, 'central.update', `${row.name} (#${row.id})`,
        `campos=${[...changed, ...(Object.keys(sent).length ? ['credencial'] : [])].join(',')}`);
      return toPublic(row);
    },

    remove(actor, id) {
      const cur = getRow(id);
      if (!cur) throw notFound();
      db.prepare('delete from centrals where id = ?').run(id);
      audit.add(actor, 'central.remove', `${cur.name} (#${cur.id})`, null);
    },

    // INTERNO: só para o scheduler. Devolve o formato que cada coletor espera, com segredos decifrados.
    // Nunca expor em rota/resposta.
    listForCollector() {
      return db.prepare(`select ${COLS} from centrals order by id`).all().map((row) => {
        const base = {
          id: row.id, name: row.name, ip: row.ip, type: row.type,
          host: row.ip, port: row.port, collectMethod: row.collect_method, snmpVersion: row.snmp_version,
        };
        // Credencial ilegível não derruba o ciclo: marca a central, o scheduler a mostra como down.
        try { return { ...base, ...bundleOf(row) }; }
        catch { return { ...base, credError: 'credencial ilegível (verifique PANEL_SECRET)' }; }
      });
    },
  };
}
