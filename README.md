# Painel PBX

<img width="1110" height="413" alt="image" src="https://github.com/user-attachments/assets/ba0b2587-34cb-4d5e-ba97-cda7879056f7" />


Painel web de parede para acompanhar, em tempo real, o estado das centrais
PBX da Nextcomm (**Yeastar** e **3CX**). Numa TV no NOC, mostra todas as
centrais numa grade de cartões que se atualiza **a cada 10 segundos** — e a
borda de cada cartão grita verde / amarelo / vermelho conforme CPU, memória e
disco. A ideia é inverter o reativo: ver o problema na tela antes de o cliente
ligar reclamando.

![estado](https://img.shields.io/badge/estado-MVP%20pronto-success) ![node](https://img.shields.io/badge/node-22%2B-informational) ![docker](https://img.shields.io/badge/docker-compose-informational)

## O que faz

- **Grade de cartões ao vivo** — uma central por cartão (nome, IP, tipo, CPU/mem/disco), atualizando a cada 10s. Central fora do ar aparece como "sem resposta".
- **Coleta sem agente** — nada é instalado dentro das centrais:
  - **Yeastar (P-Series)** via **SNMP v3** (leitura);
  - **3CX (Debian)** via **SSH** (comandos de leitura: `free`, `df`, `/proc/stat`).
- **Login com papéis** — `admin` (configura tudo e gerencia usuários) e `viewer` (só vê o painel no navegador).
- **Link da TV** — uma URL só-leitura com token, para a TV abrir sem login e sem controles.
- **Credenciais cifradas em repouso** (AES-256-GCM) — senhas, chaves SSH e credenciais SNMP nunca aparecem na tela nem ficam em texto puro no banco.
- **Log de auditoria** — quem mudou o quê e quando.
- **Roda em container** (Docker), isolado de outras aplicações na mesma máquina, com porta publicável configurável e os dados num volume.

## Começar rápido (Docker)

```bash
git clone https://github.com/tiagogd/painel-pbx.git
cd painel-pbx
cp .env.example .env            # edite: PANEL_SECRET (32+ chars), admin, PANEL_PORT
docker compose up -d
```

Abra `http://SEU_HOST:8080` (ou a `PANEL_PORT` que você escolheu) e entre com o
admin definido no `.env`.

**Mais fácil ainda — um comando que gera o `.env` e sobe tudo** (ideal para
rodar em outra máquina, sem VM): `powershell -ExecutionPolicy Bypass -File scripts\start.ps1`
(Windows) ou `bash scripts/start.sh` (Linux/macOS). Guia completo em
**[rodar localmente em outra máquina](docs/rodar-local.md)**.

O passo a passo completo — pré-requisitos, configuração das centrais, uso e
operação — está no **[manual de instalação e uso](docs/manual.md)**.

## Tecnologia

Node.js (ESM) · Express 5 · better-sqlite3 · ssh2 · net-snmp · bcryptjs ·
sessão em SQLite · front HTML/CSS/JS puro. Sem framework de front, sem servidor
de banco separado.

## Estrutura

```
src/
  server.js            # monta o Express e sobe o scheduler
  config.js  db.js  crypto.js
  scheduler.js  snapshot.js  severity.js
  collectors/          # index (dispatch) + ssh (3CX) + snmp (Yeastar) + simulator
  auth/                # middleware, rotas de login, store de sessão
  models/              # users, centrals, audit, tvtokens
  routes/              # status (/api/status), pages, centrals, users
public/                # dashboard, tv, login, admin (HTML/CSS/JS)
test/                  # node:test + supertest
docs/                  # design.md, plano, manual.md
Dockerfile  docker-compose.yml  .env.example
```

## Desenvolvimento

```bash
npm install
npm test          # suíte completa (node:test)
npm start         # roda local; precisa das variáveis de ambiente (veja o manual)
```

## Documentação

- [Rodar localmente em outra máquina (1 script)](docs/rodar-local.md)
- [Manual de instalação e uso](docs/manual.md)
- [Documento de design](docs/design.md) — intenção, decisões e escopo
- [Plano de implementação](docs/superpowers/plans/2026-10-26-painel-pbx.md)

## Licença

ISC.
