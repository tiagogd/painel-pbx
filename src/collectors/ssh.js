import { Client } from 'ssh2';

const CPU_SAMPLE_SECS = 1;       // intervalo entre as duas leituras de /proc/stat
const READY_TIMEOUT_MS = 5000;   // handshake SSH
const OVERALL_TIMEOUT_MS = 10000; // guarda total (conexão + comandos)

function pct(n) {
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`percentual inválido: ${n}`);
  return Math.round(n);
}

// `free -m`: usa total e available (memória realmente utilizável).
export function parseMemPct(out) {
  const line = String(out).split('\n').find((l) => /^Mem:/.test(l.trim()));
  if (!line) throw new Error('saída de free inesperada');
  const f = line.trim().split(/\s+/).slice(1).map(Number);
  const total = f[0];
  const avail = f[5];
  if (!(total > 0) || !Number.isFinite(avail)) throw new Error('saída de free inesperada');
  return pct(((total - avail) / total) * 100);
}

// `df -P /`: lê a coluna de capacidade (NN%) da linha de dados.
export function parseDiskPct(out) {
  const lines = String(out).split('\n').map((l) => l.trim()).filter(Boolean);
  for (const l of lines.slice(1)) {
    const m = l.match(/\s(\d{1,3})%(\s|$)/);
    if (m) return pct(Number(m[1]));
  }
  throw new Error('saída de df inesperada');
}

function cpuTimes(stat) {
  const line = String(stat).split('\n').find((l) => /^cpu\s/.test(l));
  if (!line) throw new Error('saída de /proc/stat inesperada');
  const f = line.trim().split(/\s+/).slice(1, 9).map(Number);
  if (f.length < 4 || f.some((x) => !Number.isFinite(x))) throw new Error('saída de /proc/stat inesperada');
  const idle = f[3] + (f[4] || 0); // idle + iowait
  const total = f.reduce((a, b) => a + b, 0);
  return { idle, total };
}

export function parseCpuPct(t0, t1) {
  const a = cpuTimes(t0);
  const b = cpuTimes(t1);
  const dTotal = b.total - a.total;
  const dIdle = b.idle - a.idle;
  if (!(dTotal > 0)) throw new Error('amostras de CPU sem variação');
  return pct(((dTotal - dIdle) / dTotal) * 100);
}

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', (d) => { out += d; });
      stream.stderr.on('data', () => {});
      stream.on('close', () => resolve(out));
    });
  });
}

const SEP = '@@SEP@@';
// Somente leitura: free, df e duas leituras de /proc/stat.
const CMD = `export LC_ALL=C; free -m; echo ${SEP}; df -P /; echo ${SEP}; head -1 /proc/stat; sleep ${CPU_SAMPLE_SECS}; echo ${SEP}; head -1 /proc/stat`;

// central: { host|ip, port?, username, privateKey? | password? } (credenciais já decifradas; Task 7)
export async function collect(central) {
  const conn = new Client();
  let timer;
  try {
    const work = new Promise((resolve, reject) => {
      conn.on('error', reject);
      conn.on('ready', () => {
        run(conn, CMD).then(resolve, reject);
      });
      conn.connect({
        host: central.host || central.ip,
        port: central.port || 22,
        username: central.username,
        privateKey: central.privateKey,
        password: central.password,
        readyTimeout: READY_TIMEOUT_MS,
      });
    });
    const guard = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout na coleta ssh')), OVERALL_TIMEOUT_MS);
    });
    const out = await Promise.race([work, guard]);
    const [free, df, s0, s1] = out.split(SEP).map((s) => s.trim());
    return { cpu: parseCpuPct(s0, s1), mem: parseMemPct(free), disk: parseDiskPct(df) };
  } finally {
    clearTimeout(timer);
    conn.destroy();
  }
}
