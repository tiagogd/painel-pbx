# Painel das Centrais PBX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um painel web de parede que mostra o estado (CPU, memória, disco) das ~20 centrais PBX da Nextcomm, atualizando a cada 10s, com login/papéis e um link de TV somente-exibição.

**Architecture:** Um único processo Node.js: um *scheduler* coleta as métricas de cada central a cada 10s (SNMP nos Yeastar, SSH nos 3CX), guarda o último retrato em memória, e um servidor Express serve a página (grade de cartões "Opção A") que consome `/api/status`. Usuários, configuração das centrais, tokens de TV e auditoria ficam em SQLite no próprio host; credenciais de coleta ficam cifradas em repouso.

**Tech Stack:** Node.js, Express, better-sqlite3, ssh2 (3CX), net-snmp (Yeastar), bcryptjs, express-session (store em SQLite), AES-256-GCM via `crypto` nativo para cifrar credenciais. Front-end: HTML/CSS/JS puro (reaproveita o mockup da Opção A). Testes: node:test + supertest.

**Spec:** `docs/design.md` (neste mesmo projeto).

## Global Constraints

- **Nenhum agente é instalado dentro das centrais.** Coleta só por SNMP (Yeastar P-Series) ou SSH read-only (3CX). Copiado da spec.
- **Credenciais de coleta nunca voltam para a tela** depois de cadastradas, e ficam cifradas em repouso (chave vinda de `PANEL_SECRET`/arquivo no host).
- **Yeastar → SNMP v3** (auth+priv) preferível a v2c. **3CX → SSH** com usuário dedicado somente-leitura por chave.
- **Papéis:** `admin` (configura tudo + gerencia usuários) e `viewer` (vê o painel no navegador, não configura). Sem auto-cadastro; primeiro admin semeado na instalação.
- **Usuários identificados por e-mail** e camada de login isolada, para "Entrar com a Microsoft" (Entra ID/OIDC) encaixar depois sem retrabalho.
- **Limiares:** `warn ≥ 80%`, `crit ≥ 90%` (confirmar num equipamento real; manter num ponto único de configuração).
- Senhas com hash forte (bcryptjs); sessão por cookie httpOnly.

## Review Focus

- **Central inacessível** (timeout de SSH, SNMP sem resposta): o cartão mostra estado `down` ("sem resposta"), o scheduler não trava e os outros cartões seguem atualizando. → Task 2.
- **Uma central lenta** não pode bloquear nem empilhar ciclos: coleta concorrente com timeout por ciclo (< 10s). → Task 2.
- **Token de TV inválido/revogado** é rejeitado — nenhum dado vaza pelo endpoint read-only. → Task 8.
- **Acesso não autenticado** a rota de admin/viewer redireciona para login (não dá erro 500), e `viewer` recebe 403 ao tentar configurar. → Task 6.
- **Saída de `df`/`free` com formato inesperado** (FS incomum, locale) não derruba a coleta daquela central; vira `down` com erro registrado, não exceção não tratada. → Task 4.

---

## File Structure

```
painel-pbx/
  package.json
  .env.example                 # PANEL_SECRET, PORT, ADMIN_EMAIL, ADMIN_PASSWORD, DB_PATH
  src/
    config.js                  # lê env; caminhos; chave de cifragem
    db.js                      # better-sqlite3: abre o banco + cria schema (migração idempotente)
    crypto.js                  # encrypt(text)/decrypt(blob) AES-256-GCM
    snapshot.js                # retrato mais recente em memória (get/set)
    scheduler.js               # a cada 10s coleta todas as centrais → snapshot
    severity.js                # sev(valor) e worst(cpu,mem,disk) → ok|warn|crit
    collectors/
      index.js                 # collect(central) despacha por central.collectMethod
      simulator.js             # gera métricas falsas (dev / item 1)
      ssh.js                   # 3CX
      snmp.js                  # Yeastar
    models/
      centrals.js              # CRUD de centrais (credenciais cifradas)
      users.js                 # CRUD de usuários + verificação de senha
      audit.js                 # append + listagem do log
      tvtokens.js              # criar/revogar/validar token de TV
    auth/
      middleware.js            # requireAuth, requireRole('admin'), tvOrAuth
      routes.js                # POST /login, POST /logout
    routes/
      status.js                # GET /api/status  (sessão OU token de TV)
      centrals.js              # /api/centrals*   (admin)
      users.js                 # /api/users*      (admin)
      pages.js                 # serve login, dashboard, tv, admin
    server.js                  # monta o Express e sobe scheduler
  public/
    dashboard.html  dashboard.js  styles.css   # Opção A (reaproveita o mockup)
    tv.html                    # dashboard em modo somente-exibição
    login.html
    admin.html  admin.js       # cadastro de centrais e usuários
  test/                        # node:test + supertest, espelhando src/
```

---

### Task 1: Esqueleto do projeto, banco e configuração

**Files:**
- Create: `package.json`, `.env.example`, `src/config.js`, `src/db.js`, `src/server.js`
- Test: `test/boot.test.js`

**Interfaces:**
- Produces: `db` (instância better-sqlite3 com schema criado); `config` (`{ port, dbPath, secret, admin:{email,password} }`); servidor Express exportado de `server.js` com rota `GET /health` → `{ok:true}`.
- Schema (tabelas criadas idempotentemente em `db.js`):
  - `users(id, email UNIQUE, name, password_hash, role, disabled, created_at)`
  - `centrals(id, name, ip, type, collect_method, port, snmp_version, cred_cipher, thresholds_json, created_at)`
  - `sessions(sid, data, expires)` (para o store de sessão)
  - `audit(id, ts, actor_email, action, target, detail)`
  - `tv_tokens(token, created_by, created_at, revoked_at)`

- [ ] **Step 1: Write the failing test** em `test/boot.test.js`:

```js
test('GET /health responde ok e o schema existe', async () => {
  const { app, db } = await bootForTest();          // usa DB em arquivo temporário
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  const tabelas = db.prepare("select name from sqlite_master where type='table'").all().map(t=>t.name);
  for (const t of ['users','centrals','sessions','audit','tv_tokens']) assert.ok(tabelas.includes(t));
});

test('primeiro admin é semeado a partir do config', async () => {
  const { db } = await bootForTest();
  const admin = db.prepare('select role from users where email=?').get(TEST_ADMIN_EMAIL);
  assert.equal(admin.role, 'admin');
});
```

- [ ] **Step 2: Run test to verify it fails** — `node --test test/boot.test.js` → FAIL (módulos não existem).
- [ ] **Step 3:** Implementar `config.js` (lê env, valida que `PANEL_SECRET` tem ≥ 32 bytes), `db.js` (abre better-sqlite3 em `config.dbPath`, cria o schema acima, semeia o admin de `config.admin` se a tabela `users` estiver vazia, com `password_hash` via bcryptjs), e `server.js` (Express com `GET /health`; exporta `app` e um `bootForTest()` que usa DB temporário). `package.json` com `"type":"module"` e script `start`.
- [ ] **Step 4: Run test to verify it passes** → PASS.
- [ ] **Step 5: Commit** — `feat: esqueleto do projeto, schema sqlite e health`.

---

### Task 2: Coletor (simulador), severidade, scheduler e `/api/status`

**Depende de:** Task 1. **Pode correr em paralelo com:** Task 6.

**Files:**
- Create: `src/severity.js`, `src/snapshot.js`, `src/collectors/index.js`, `src/collectors/simulator.js`, `src/scheduler.js`, `src/routes/status.js`
- Modify: `src/server.js` (montar `/api/status` e iniciar o scheduler)
- Test: `test/severity.test.js`, `test/scheduler.test.js`, `test/status.test.js`

**Interfaces:**
- Produces:
  - `sev(v:number):'ok'|'warn'|'crit'` e `worst(cpu,mem,disk)` em `severity.js`.
  - Contrato do coletor: `collect(central):Promise<{cpu:number,mem:number,disk:number}>`; lança em falha.
  - `CentralStatus = { id, name, ip, type, cpu:number|null, mem:number|null, disk:number|null, state:'ok'|'warn'|'crit'|'down', error:string|null, updatedAt:string }`.
  - `GET /api/status` → `{ generatedAt:string, centrals: CentralStatus[] }`.
- Consumes: `db`, `centrals` (na Task 2 pode ler uma lista fixa/simulada se a Task 7 ainda não existir).

- [ ] **Step 1: Write the failing test** — severidade e limiares exatos:

```js
test('limiares', () => {
  assert.equal(sev(79),'ok'); assert.equal(sev(80),'warn');
  assert.equal(sev(89),'warn'); assert.equal(sev(90),'crit');
  assert.equal(worst(10,85,20),'warn'); assert.equal(worst(95,10,10),'crit');
});
```

- [ ] **Step 2:** Teste do scheduler: uma central cujo `collect` rejeita vira `state:'down'` com `error` preenchido e **não** impede outra central de atualizar; um `collect` que demora mais que o timeout do ciclo também vira `down`.

```js
test('central inacessível vira down e não derruba as outras', async () => {
  const snap = await runCycle([ okCentral, falhaCentral ]);   // injeta coletores fake
  assert.equal(snap.find(c=>c.id===okCentral.id).state !== 'down', true);
  const ruim = snap.find(c=>c.id===falhaCentral.id);
  assert.equal(ruim.state,'down'); assert.ok(ruim.error);
});
```

- [ ] **Step 3:** Teste de `/api/status`: retorna `centrals[]` com a forma de `CentralStatus` e `generatedAt` ISO.
- [ ] **Step 4: Run tests to verify they fail** → FAIL.
- [ ] **Step 5:** Implementar `severity.js`; `snapshot.js` (get/set em memória); `simulator.js` (`collect` devolve números plausíveis, com uma central oscilando para crítico); `collectors/index.js` (despacha por `central.collectMethod`, default `simulator` em dev); `scheduler.js` (a cada 10s, `Promise.allSettled` com timeout por central < 10s, calcula `state` via `worst`, grava no snapshot); `routes/status.js`.
- [ ] **Step 6: Run tests to verify they pass** → PASS.
- [ ] **Step 7: Commit** — `feat: coletor simulado, scheduler 10s e /api/status`.

---

### Task 3: Tela da Opção A ao vivo (item 1 concluído)

**Depende de:** Task 2 (forma do `/api/status`).

**Files:**
- Create: `public/dashboard.html`, `public/dashboard.js`, `public/styles.css`
- Modify: `src/routes/pages.js`, `src/server.js` (servir `public/`)
- Test: `test/dashboard.smoke.test.js`

**Interfaces:**
- Consumes: `GET /api/status`.

- [ ] **Step 1: Write the failing test** — a página é servida e referencia o script; o endpoint responde para ela.

```js
test('dashboard é servida', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status,200);
  assert.match(res.text, /dashboard\.js/);
});
```

- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3:** Portar o markup/estilo da Opção A do mockup (`docs`/artefato) para `public/`. `dashboard.js` busca `/api/status` a cada 10s, redesenha os cartões (nome, IP, tipo, três barras, borda por `state`), mostra o contador "atualiza em Ns" e um estado visual para `down`. Respeitar `prefers-reduced-motion`.
- [ ] **Step 4: Run test** → PASS. Verificação manual contra o simulador (a grade atualiza sozinha).
- [ ] **Step 5: Commit** — `feat: painel Opção A ao vivo contra o simulador`.

---

### Task 4: Coletor SSH real (3CX)

**Depende de:** Task 2 (contrato `collect`). **Paralelo com:** Task 5.

**Files:**
- Create: `src/collectors/ssh.js`
- Test: `test/ssh.parse.test.js`

**Interfaces:**
- Produces: `collect(central)` que abre SSH (ssh2) com credencial decifrada, roda os comandos e devolve `{cpu,mem,disk}`.

- [ ] **Step 1: Write the failing test** — funções puras de parsing (sem rede):

```js
test('parse de free/df/proc', () => {
  assert.equal(parseMemPct(FREE_SAMPLE), 66);    // amostras reais fixas no teste
  assert.equal(parseDiskPct(DF_SAMPLE), 94);
  assert.ok(Math.abs(parseCpuPct(STAT_T0, STAT_T1) - 41) < 2);
  assert.throws(() => parseDiskPct('lixo'));      // formato inesperado → erro tratável
});
```

- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3:** Implementar o parsing puro (`parseMemPct`, `parseDiskPct`, `parseCpuPct`) e o `collect` que usa ssh2 (timeout curto, uma conexão por ciclo, read-only). Credencial vem decifrada de `centrals`.
- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit** — `feat: coletor ssh para 3cx`.

---

### Task 5: Coletor SNMP real (Yeastar P-Series)

**Depende de:** Task 2. **Paralelo com:** Task 4.

**Files:**
- Create: `src/collectors/snmp.js`
- Test: `test/snmp.map.test.js`

**Interfaces:**
- Produces: `collect(central)` que faz SNMP GET (net-snmp, v3 auth+priv; v2c como fallback) e mapeia os OIDs de CPU/mem/disco para `{cpu,mem,disk}`.

- [ ] **Step 1: Write the failing test** — mapeamento de varbinds → percentuais (função pura, OIDs numa tabela num só lugar, fáceis de ajustar quando confirmados no equipamento real):

```js
test('mapeia varbinds de host-resources para percentuais', () => {
  const r = mapVarbinds(SAMPLE_VARBINDS);
  assert.ok(r.cpu>=0 && r.cpu<=100);
  assert.ok(r.mem>=0 && r.mem<=100);
  assert.ok(r.disk>=0 && r.disk<=100);
});
```

- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3:** Implementar `mapVarbinds` + `collect` com net-snmp. OIDs padrão de HOST-RESOURCES/UCD numa constante única, com comentário de que são confirmados num P-Series real ao plugar o primeiro.
- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit** — `feat: coletor snmp para yeastar`.

---

### Task 6: Login, papéis e sessão

**Depende de:** Task 1. **Paralelo com:** Task 2.

**Files:**
- Create: `src/models/users.js`, `src/auth/middleware.js`, `src/auth/routes.js`, `public/login.html`
- Modify: `src/server.js` (express-session com store SQLite; montar `/login`,`/logout`)
- Test: `test/auth.test.js`

**Interfaces:**
- Produces: `users.verify(email,senha)→user|null`, `users.create/list/setPassword/disable`; middlewares `requireAuth`, `requireRole('admin')`; sessão no cookie.

- [ ] **Step 1: Write the failing test:**

```js
test('login válido cria sessão; rota protegida sem sessão redireciona', async () => {
  const agent = request.agent(app);
  assert.equal((await agent.get('/admin')).status, 302);           // vai para /login
  await agent.post('/login').send({email:ADMIN,password:ADMIN_PW}).expect(302);
  assert.equal((await agent.get('/admin')).status, 200);
});
test('viewer não acessa rota de admin', async () => {
  const agent = await loginAs(viewer);
  assert.equal((await agent.get('/api/centrals')).status, 403);
});
```

- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3:** Implementar `users.js` (bcryptjs), `middleware.js` (`requireAuth` redireciona 302 para `/login`; `requireRole` → 403), `routes.js` (login/logout), `login.html`, e configurar express-session com store em SQLite.
- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit** — `feat: login local, papéis e sessão`.

---

### Task 7: Cadastro de centrais (admin), credenciais cifradas e auditoria

**Depende de:** Tasks 1, 2 (forma de `centrals`), 6 (middleware).

**Files:**
- Create: `src/crypto.js`, `src/models/centrals.js`, `src/models/audit.js`, `src/routes/centrals.js`, `public/admin.html`, `public/admin.js`
- Modify: `src/collectors/index.js` (passar a ler centrais reais do banco), `src/scheduler.js` (iterar `centrals.list()`)
- Test: `test/crypto.test.js`, `test/centrals.test.js`

**Interfaces:**
- Produces: `encrypt/decrypt`; `centrals.create/update/remove/list` (grava credencial via `encrypt`, nunca devolve o texto claro em `list`); `audit.add(actor,action,target,detail)`.

- [ ] **Step 1: Write the failing test:**

```js
test('credencial é cifrada em repouso e não volta na listagem', async () => {
  const c = await centrals.create(adminActor, {name:'X',ip:'10.0.0.1',type:'3cx',collectMethod:'ssh',secret:'minha-chave'});
  const row = db.prepare('select cred_cipher from centrals where id=?').get(c.id);
  assert.ok(!row.cred_cipher.includes('minha-chave'));             // cifrado
  assert.equal(centrals.list()[0].secret, undefined);              // não exposto
  assert.equal(decrypt(row.cred_cipher), 'minha-chave');           // recuperável p/ coleta
});
test('cadastro gera registro de auditoria', async () => {
  await centrals.create(adminActor, {name:'Y',ip:'10.0.0.2',type:'yeastar',collectMethod:'snmp',secret:'s'});
  assert.ok(audit.list().some(a=>a.action==='central.create' && a.actor_email===adminActor.email));
});
```

- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3:** Implementar `crypto.js` (AES-256-GCM, chave de `config.secret`), `centrals.js`, `audit.js`, rotas CRUD protegidas por `requireRole('admin')` que chamam `audit.add`, e a tela `admin.html/js`. Ligar o scheduler às centrais reais.
- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit** — `feat: cadastro de centrais, credenciais cifradas e auditoria`.

---

### Task 8: Gestão de usuários (admin) e link de TV somente-exibição

**Depende de:** Tasks 6, 7, e 3 (dashboard).

**Files:**
- Create: `src/models/tvtokens.js`, `src/routes/users.js`, `public/tv.html`
- Modify: `src/routes/status.js` (aceitar sessão **ou** token de TV válido), `src/auth/middleware.js` (`tvOrAuth`), `src/routes/pages.js` (`/tv?token=...`), `public/admin.js` (UI de usuários + gerar/revogar token)
- Test: `test/users.test.js`, `test/tvtoken.test.js`

**Interfaces:**
- Produces: `tvtokens.create(actor)`, `tvtokens.revoke(token)`, `tvtokens.isValid(token)`; `users` CRUD exposto por rota admin (auditado); `GET /tv?token=` serve o dashboard read-only.

- [ ] **Step 1: Write the failing test:**

```js
test('token de TV válido acessa status; inválido/revogado é barrado', async () => {
  const { token } = await tvtokens.create(adminActor);
  assert.equal((await request(app).get('/api/status?token='+token)).status, 200);
  assert.equal((await request(app).get('/api/status')).status, 401);          // sem sessão e sem token
  await tvtokens.revoke(token);
  assert.equal((await request(app).get('/api/status?token='+token)).status, 401);
});
test('admin cria usuário viewer (auditado); viewer não gerencia usuários', async () => {
  const admin = await loginAs(adminActor);
  await admin.post('/api/users').send({email:'v@x.com',name:'V',role:'viewer',password:'p'}).expect(201);
  assert.ok(audit.list().some(a=>a.action==='user.create'));
});
```

- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3:** Implementar `tvtokens.js`, `tvOrAuth` (sessão OU `isValid(token)`), `/tv` servindo o dashboard sem controles, rotas de usuários (admin, auditadas) e a UI em `admin.js`.
- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit** — `feat: gestão de usuários e link de tv somente-exibição`.

---

## Ordem e paralelismo

- **Task 1** primeiro (todas dependem dela).
- Depois, em paralelo: **Task 2** (coletor+endpoint) e **Task 6** (login).
- Depois de 2: **Task 3** (tela), **Task 4** (SSH) e **Task 5** (SNMP) são independentes entre si → três frentes em paralelo.
- **Task 7** depois de 2+6; **Task 8** por último (depende de 3+6+7).

## Self-review (feito)

- Cobertura da spec: coleta sem agente (T2/T4/T5), Opção A (T3), login/papéis (T6), centrais+credenciais cifradas+auditoria (T7), usuários+link de TV (T8), limiares (T2), Microsoft depois (camada de login isolada em T6). ✔
- Review Focus: cada item tem teste na task dona (down→T2, lento→T2, token→T8, não-autenticado→T6, parsing→T4). ✔
- Consistência de tipos: `CentralStatus`, `collect()` e `sev/worst` definidos na T2 e consumidos igual nas T3/T4/T5. ✔
