(() => {
  const REFRESH_S = 10;
  const grid = document.getElementById('grid');
  const tally = document.getElementById('tally');
  const live = document.getElementById('live');
  const liveText = document.getElementById('liveText');
  const rank = { crit: 0, warn: 1, down: 2, ok: 3 };
  let remaining = REFRESH_S;
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

  async function refresh() {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      render(Array.isArray(data.centrals) ? data.centrals : []);
      hasData = true;
      failed = false;
    } catch (e) {
      failed = true;
      if (!hasData) grid.replaceChildren(el('div', 'empty', 'Reconectando ao servidor…'));
    }
    remaining = REFRESH_S;
    paintLive();
  }

  setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    paintLive();
    if (remaining === 0) refresh();
  }, 1000);
  refresh();
})();
