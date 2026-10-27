(() => {
  let refreshS = 10; // atualizado pelo /api/status (configurável no Admin)
  // Na view de TV (/tv) o acesso é pelo token do link; no painel normal vale a sessão.
  const tvToken = location.pathname === '/tv' ? new URLSearchParams(location.search).get('token') : null;
  const statusUrl = tvToken ? '/api/status?token=' + encodeURIComponent(tvToken) : '/api/status';
  const grid = document.getElementById('grid');
  const tally = document.getElementById('tally');
  const live = document.getElementById('live');
  const liveText = document.getElementById('liveText');
  const rank = { crit: 0, warn: 1, down: 2, ok: 3 };
  let remaining = refreshS;
  let failed = false;
  let hasData = false;

  const sev = v => (v >= 90 ? 'crit' : v >= 80 ? 'warn' : 'ok');
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  function metric(label, v, down) {
    const row = el('div', 'metric');
    row.appendChild(el('span', 'lbl', label));
    const bar = el('div', 'bar');
    const fill = el('i');
    const has = !down && typeof v === 'number';
    if (has) {
      fill.className = 'fill-' + sev(v);
      fill.style.width = Math.max(0, Math.min(100, v)) + '%';
    }
    bar.appendChild(fill);
    row.appendChild(bar);
    row.appendChild(el('span', 'val', has ? Math.round(v) + '%' : '—'));
    return row;
  }

  function compactUptime(s) {
    if (!s) return '—';
    const d = /(\d+)\s*day/i.exec(s);     // "34 days 04:58:55"
    const t = /(\d{1,2}):(\d{2})/.exec(s);
    const days = d ? d[1] + 'd ' : '';
    const hours = t ? t[1].padStart(2, '0') + 'h' : '';
    return (days + hours).trim() || s;
  }

  function footer(c, down) {
    if (down) {
      const f = el('div', 'card-foot');
      const s = el('span', 'st off'); s.append(el('i'), '— sem dados');
      f.append(s, el('span', 'uptime', '—'));
      return f;
    }
    // Sem extras (ex.: 3CX coletado por SSH) -> rodapé discreto.
    if (c.sysStatus == null && c.extTotal == null && c.uptime == null) {
      return el('div', 'foot-ssh', '— coleta por SSH');
    }
    const frag = document.createDocumentFragment();
    const f = el('div', 'card-foot');
    const s = el('span', 'st up'); s.append(el('i'), c.sysStatus || 'ok');
    f.append(s, el('span', 'uptime', '↑ ' + compactUptime(c.uptime)));
    frag.appendChild(f);
    if (typeof c.extOnline === 'number' && typeof c.extTotal === 'number' && c.extTotal > 0) {
      const ext = el('div', 'card-ext');
      ext.appendChild(el('span', 'lbl', 'RAMAIS'));
      const bar = el('div', 'ebar');
      const fill = el('i');
      fill.style.width = Math.max(0, Math.min(100, Math.round(c.extOnline / c.extTotal * 100))) + '%';
      bar.appendChild(fill);
      ext.appendChild(bar);
      const count = el('span', 'ecount');
      count.append(el('b', null, String(c.extOnline)), '/' + c.extTotal);
      ext.appendChild(count);
      frag.appendChild(ext);
    }
    return frag;
  }

  function card(c) {
    const down = c.state === 'down';
    const node = el('div', 'card ' + (c.state in rank ? c.state : 'down'));
    const top = el('div', 'card-top');
    const head = el('div', 'chead');
    head.appendChild(el('span', 'cname', c.name));
    head.appendChild(el('span', 'cip', c.ip));
    top.appendChild(head);
    const known = c.type === 'yeastar' || c.type === '3cx';
    const label = c.type === 'yeastar' ? 'Yeastar' : c.type === '3cx' ? '3CX' : String(c.type);
    top.appendChild(el('span', 'badge ' + (c.type === 'yeastar' ? 'yeastar' : known ? 't3cx' : ''), label));
    node.appendChild(top);
    if (down) {
      const l = el('div', 'down-label', 'sem resposta');
      if (c.error) l.title = c.error;
      node.appendChild(l);
    }
    node.appendChild(metric('CPU', c.cpu, down));
    node.appendChild(metric('MEM', c.mem, down));
    node.appendChild(metric('DISK', c.disk, down));
    node.appendChild(footer(c, down));
    return node;
  }

  function render(centrals) {
    const counts = { ok: 0, warn: 0, crit: 0, down: 0 };
    centrals.forEach(c => { if (c.state in counts) counts[c.state]++; });
    tally.replaceChildren();
    [['ok', counts.ok + ' ok'], ['warn', counts.warn + ' alerta'], ['crit', counts.crit + ' crítica'], ['down', counts.down + ' sem resposta']]
      .forEach(([k, t]) => {
        if (k === 'down' && !counts.down) return;
        const s = el('span');
        const i = el('i');
        i.style.background = 'var(--' + k + ')';
        s.append(i, t);
        tally.appendChild(s);
      });
    const sorted = [...centrals].sort((a, b) =>
      (rank[a.state] ?? 2) - (rank[b.state] ?? 2) || String(a.name).localeCompare(String(b.name)));
    grid.replaceChildren(...(sorted.length ? sorted.map(card) : [el('div', 'empty', 'Nenhuma central cadastrada')]));
  }

  function paintLive() {
    live.classList.toggle('stale', failed);
    liveText.textContent = failed
      ? 'reconectando… nova tentativa em ' + remaining + 's'
      : 'atualiza em ' + remaining + 's';
  }

  let inFlight = false;
  async function refresh() {
    if (inFlight) return;
    inFlight = true;
    try {
      const res = await fetch(statusUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (Number.isFinite(data.refreshSeconds)) refreshS = data.refreshSeconds;
      render(Array.isArray(data.centrals) ? data.centrals : []);
      hasData = true;
      failed = false;
    } catch (e) {
      failed = true;
      if (!hasData) grid.replaceChildren(el('div', 'empty', 'Reconectando ao servidor…'));
    }
    inFlight = false;
    remaining = refreshS;
    paintLive();
  }

  setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    paintLive();
    if (remaining === 0) refresh();
  }, 1000);
  refresh();
})();
