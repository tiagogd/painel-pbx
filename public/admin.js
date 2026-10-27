const form = document.getElementById('form-central');
const lista = document.getElementById('lista');
const msg = document.getElementById('msg');
const salvar = document.getElementById('salvar');
const cancelar = document.getElementById('cancelar');
const SECRETS = ['username', 'password', 'privateKey', 'snmpUser', 'authKey', 'privKey', 'authProtocol', 'privProtocol', 'community'];
let centrais = [];

function say(text, erro = false) {
  msg.textContent = text;
  msg.className = erro ? 'msg erro' : 'msg';
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `erro ${res.status}`);
  return data;
}

function syncMethod() {
  const m = form.collectMethod.value;
  for (const fs of form.querySelectorAll('fieldset[data-method]')) fs.hidden = fs.dataset.method !== m;
}
form.collectMethod.addEventListener('change', syncMethod);

function resetForm() {
  form.reset();
  form.elements.id.value = '';
  for (const i of form.querySelectorAll('input')) {
    if (i.placeholder && i.placeholder.includes('mantida')) i.placeholder = '';
  }
  salvar.textContent = 'Adicionar';
  cancelar.hidden = true;
  syncMethod();
}
cancelar.addEventListener('click', () => { resetForm(); say(''); });

async function startEdit(c) {
  resetForm();
  let full = c;
  try { full = await api('GET', `/admin/api/centrals/${c.id}`); } catch { /* usa o resumo da lista */ }
  const el = (name) => form.elements.namedItem(name);
  el('id').value = full.id;
  el('name').value = full.name ?? '';
  el('ip').value = full.ip ?? '';
  el('type').value = full.type;
  el('collectMethod').value = full.collectMethod;
  el('port').value = full.port ?? '';
  if (full.snmpVersion) el('snmpVersion').value = full.snmpVersion;
  syncMethod();
  // Identidade não-secreta reaparece; os segredos ficam em branco com aviso "mantida".
  const active = form.querySelector(`fieldset[data-method="${full.collectMethod}"]`);
  if (active) {
    for (const k of ['username', 'snmpUser', 'authProtocol', 'privProtocol']) {
      const i = active.querySelector(`[name="${k}"]`);
      if (i && full[k] != null) i.value = full[k];
    }
    if (full.hasCredential) {
      for (const k of ['password', 'privateKey', 'authKey', 'privKey', 'community']) {
        const i = active.querySelector(`[name="${k}"]`);
        if (i) i.placeholder = '•••• mantida (preencha para trocar)';
      }
    }
  }
  salvar.textContent = 'Salvar alterações';
  cancelar.hidden = false;
  el('name').focus();
}

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

function render() {
  lista.replaceChildren();
  for (const c of centrais) {
    const tr = document.createElement('tr');
    tr.append(cell(c.name), cell(c.ip), cell(c.type), cell(c.collectMethod), cell(c.hasCredential ? 'salva' : 'nenhuma'));
    const acoes = document.createElement('td');
    const ed = document.createElement('button');
    ed.type = 'button'; ed.className = 'sec'; ed.textContent = 'Editar';
    ed.addEventListener('click', () => startEdit(c));
    const rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'perigo'; rm.textContent = 'Remover';
    rm.addEventListener('click', async () => {
      if (!confirm(`Remover a central "${c.name}"?`)) return;
      try { await api('DELETE', `/admin/api/centrals/${c.id}`); say('Central removida.'); await load(); }
      catch (err) { say(err.message, true); }
    });
    acoes.append(ed, ' ', rm);
    tr.append(acoes);
    lista.append(tr);
  }
}

async function load() {
  centrais = await api('GET', '/admin/api/centrals');
  render();
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const data = {
    name: form.name.value.trim(), ip: form.ip.value.trim(), type: form.type.value,
    collectMethod: form.collectMethod.value, port: form.port.value,
  };
  if (data.collectMethod === 'snmp') data.snmpVersion = form.snmpVersion.value;
  // Só envia segredos do método escolhido e não vazios (vazio = manter o atual).
  const active = form.querySelector(`fieldset[data-method="${data.collectMethod}"]`);
  for (const k of SECRETS) {
    const el = active.querySelector(`[name="${k}"]`);
    if (el && el.value) data[k] = el.value;
  }
  try {
    const id = form.elements.id.value;
    if (id) await api('PUT', `/admin/api/centrals/${id}`, data);
    else await api('POST', '/admin/api/centrals', data);
    say(id ? 'Central atualizada.' : 'Central adicionada.');
    resetForm();
    await load();
  } catch (err) { say(err.message, true); }
});

syncMethod();
load().catch((err) => say(err.message, true));

// ---- Usuários ----
const formU = document.getElementById('form-usuario');
const listaU = document.getElementById('lista-usuarios');
const msgU = document.getElementById('msg-usuario');
function sayU(t, erro = false) { msgU.textContent = t; msgU.className = erro ? 'msg erro' : 'msg'; }

async function loadUsers() {
  const users = await api('GET', '/admin/api/users');
  listaU.replaceChildren();
  for (const u of users) {
    const tr = document.createElement('tr');
    tr.append(cell(u.email), cell(u.name || ''), cell(u.role), cell(u.disabled ? 'desativado' : 'ativo'));
    const acoes = document.createElement('td');
    const pw = document.createElement('button');
    pw.type = 'button'; pw.className = 'sec'; pw.textContent = 'Trocar senha';
    pw.addEventListener('click', async () => {
      const password = prompt(`Nova senha para ${u.email}:`);
      if (!password) return;
      try { await api('PUT', `/admin/api/users/${u.id}/password`, { password }); sayU('Senha alterada.'); }
      catch (err) { sayU(err.message, true); }
    });
    acoes.append(pw);
    if (!u.disabled) {
      const off = document.createElement('button');
      off.type = 'button'; off.className = 'perigo'; off.textContent = 'Desativar';
      off.addEventListener('click', async () => {
        if (!confirm(`Desativar ${u.email}?`)) return;
        try { await api('POST', `/admin/api/users/${u.id}/disable`); sayU('Usuário desativado.'); await loadUsers(); }
        catch (err) { sayU(err.message, true); }
      });
      acoes.append(' ', off);
    }
    tr.append(acoes);
    listaU.append(tr);
  }
}

formU.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await api('POST', '/admin/api/users', {
      email: formU.email.value.trim(), name: formU.name.value.trim() || null,
      role: formU.role.value, password: formU.password.value,
    });
    formU.reset();
    sayU('Usuário criado.');
    await loadUsers();
  } catch (err) { sayU(err.message, true); }
});

// ---- Link de TV ----
const listaT = document.getElementById('lista-tv');
const msgT = document.getElementById('msg-tv');
function sayT(t, erro = false) { msgT.textContent = t; msgT.className = erro ? 'msg erro' : 'msg'; }

async function loadTv() {
  const toks = await api('GET', '/admin/api/tv');
  listaT.replaceChildren();
  for (const t of toks) {
    const url = window.location.origin + '/tv?token=' + t.token;
    const tr = document.createElement('tr');
    const link = document.createElement('td');
    const input = document.createElement('input');
    input.readOnly = true; input.value = url; input.style.width = '100%';
    input.addEventListener('focus', () => input.select());
    link.append(input);
    tr.append(link, cell(t.created_at));
    const acoes = document.createElement('td');
    const rv = document.createElement('button');
    rv.type = 'button'; rv.className = 'perigo'; rv.textContent = 'Revogar';
    rv.addEventListener('click', async () => {
      if (!confirm('Revogar este link? Telas que o usam deixarão de atualizar.')) return;
      try { await api('DELETE', '/admin/api/tv/' + encodeURIComponent(t.token)); sayT('Link revogado.'); await loadTv(); }
      catch (err) { sayT(err.message, true); }
    });
    acoes.append(rv);
    tr.append(acoes);
    listaT.append(tr);
  }
}
document.getElementById('gerar-tv').addEventListener('click', async () => {
  try { await api('POST', '/admin/api/tv'); sayT('Link gerado.'); await loadTv(); }
  catch (err) { sayT(err.message, true); }
});

loadUsers().catch((err) => sayU(err.message, true));
loadTv().catch((err) => sayT(err.message, true));

// ---- Auditoria (somente leitura) ----
const listaA = document.getElementById('lista-audit');
async function loadAudit() {
  const rows = await api('GET', '/admin/api/audit');
  listaA.replaceChildren();
  for (const a of rows) {
    const tr = document.createElement('tr');
    tr.append(cell(a.ts), cell(a.actor_email || ''), cell(a.action), cell(a.target || ''), cell(a.detail || ''));
    listaA.append(tr);
  }
}
loadAudit().catch(() => {});

// ---- Atualização (intervalo) ----
const selRefresh = document.getElementById('refresh-seconds');
const msgRefresh = document.getElementById('msg-refresh');
function sayR(t, erro = false) { msgRefresh.textContent = t; msgRefresh.className = erro ? 'msg erro' : 'msg'; }
async function loadRefresh() {
  const s = await api('GET', '/admin/api/settings');
  selRefresh.value = String(s.refreshSeconds);
}
selRefresh.addEventListener('change', async () => {
  try {
    const r = await api('PUT', '/admin/api/settings/refresh', { seconds: Number(selRefresh.value) });
    sayR('Intervalo salvo: ' + r.refreshSeconds + 's (vale para o painel e a TV).');
  } catch (err) { sayR(err.message, true); await loadRefresh(); }
});
loadRefresh().catch((err) => sayR(err.message, true));
