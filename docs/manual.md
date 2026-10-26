# Manual de Instalação e Uso — Painel PBX

Este manual cobre os pré-requisitos, a instalação (Docker ou Node local), a
configuração, o primeiro acesso, o uso diário e a operação do painel.

---

## 1. Pré-requisitos

### Do servidor onde o painel vai rodar
- **Docker + Docker Compose** (caminho recomendado), ou **Node.js 22+** para
  rodar direto.
- Uma **porta livre** no host para publicar o painel (padrão `8080`) — escolha
  uma que não conflite com a outra aplicação da máquina.
- **Alcance de rede até as centrais**, a partir desse servidor:
  - **SSH (porta 22/TCP)** para cada central **3CX**;
  - **SNMP (porta 161/UDP)** para cada central **Yeastar**.
  - Se as centrais estão em outra rede/nuvem (AWS, Virtuax), garanta rota/VPN e
    liberação de firewall para essas portas.

### Em cada central (feito uma vez, por central)
- **3CX (Debian):** um **usuário SSH dedicado e somente-leitura**. O painel só
  roda `free`, `df` e lê `/proc/stat`. Guarde a chave privada (preferível) ou a
  senha desse usuário.
- **Yeastar (P-Series):** **SNMP habilitado**, de preferência **v3** (com
  usuário, senha de autenticação e de criptografia). Evite v2c, que manda a
  "community" em texto puro. Anote as credenciais.

### Para a TV
- Uma Smart TV ou um mini-PC com **navegador** moderno, capaz de abrir uma URL
  e ficar em tela cheia.

---

## 2. Instalação com Docker (recomendado)

```bash
git clone https://github.com/tiagogd/painel-pbx.git
cd painel-pbx
cp .env.example .env
```

Edite o `.env` (veja a seção 4), depois:

```bash
docker compose build
docker compose up -d
```

Confira que subiu saudável:

```bash
docker compose ps          # deve mostrar "healthy"
curl http://127.0.0.1:8080/health   # -> {"ok":true}
```

O container roda como usuário **não-root** e guarda o banco SQLite num **volume
nomeado** (`painel-data`), então os dados sobrevivem a `restart` e a
`docker compose down`/`up`. **Não** use `docker compose down -v` a menos que
queira apagar tudo (o `-v` remove o volume).

---

## 3. Instalação com Node (sem Docker)

```bash
git clone https://github.com/tiagogd/painel-pbx.git
cd painel-pbx
npm install
```

Defina as variáveis de ambiente (seção 4) e rode:

```bash
# exemplo em Linux/macOS
export PANEL_SECRET="um-segredo-bem-longo-de-32-bytes-ou-mais"
export PORT=3000
export DB_PATH=./data/panel.sqlite
export ADMIN_EMAIL="admin@nextcomm.com.br"
export ADMIN_PASSWORD="defina-uma-senha-forte"
npm start
```

O painel fica em `http://127.0.0.1:3000`. (No Docker, a porta publicada é a
`PANEL_PORT`; rodando direto, é a `PORT`.)

---

## 4. Configuração (variáveis de ambiente)

| Variável | Para que serve |
|---|---|
| `PANEL_PORT` | Porta publicada no host (só no Docker). Padrão `8080`. Escolha uma livre. |
| `PORT` | Porta interna da aplicação. Padrão `3000`. |
| `DB_PATH` | Caminho do arquivo SQLite. No Docker **deve** ficar dentro do volume: `/data/panel.sqlite`. |
| `PANEL_SECRET` | Segredo do painel — **mínimo 32 bytes/caracteres**. Protege as sessões **e** deriva a chave que cifra as credenciais das centrais. A aplicação se recusa a subir sem ele. |
| `ADMIN_EMAIL` | E-mail do primeiro administrador. |
| `ADMIN_PASSWORD` | Senha do primeiro administrador. |

> ⚠️ **Sobre o `PANEL_SECRET`:** ele deriva a chave de criptografia das
> credenciais. Se você trocá-lo depois de já ter cadastrado centrais, as
> credenciais antigas deixam de ser decifráveis — as centrais afetadas passam a
> aparecer como "down" até serem recadastradas. Defina um bom segredo **antes**
> de cadastrar centrais e guarde-o.

> O primeiro admin é criado **apenas quando o banco está vazio**. Mudar
> `ADMIN_EMAIL`/`ADMIN_PASSWORD` depois **não** atualiza o usuário já existente
> (use a tela de usuários para isso).

---

## 5. Primeiro acesso

1. Abra `http://SEU_HOST:PANEL_PORT` (Docker) ou `:PORT` (Node).
2. Faça login com o `ADMIN_EMAIL` / `ADMIN_PASSWORD` do `.env`.
3. Você cai no painel (ainda vazio) — vá à área **Admin** para cadastrar as
   centrais e os usuários.

---

## 6. Usando o painel

### Cadastrar uma central (Admin)
Na área **Admin**, adicione uma central informando:
- **Nome** (como aparece no cartão), **IP**, **tipo** (Yeastar ou 3CX) e a
  **porta**.
- **3CX (SSH):** usuário e a **chave privada** (ou senha) do usuário
  somente-leitura.
- **Yeastar (SNMP):** versão (**v3** recomendado) com usuário SNMP, chaves de
  autenticação/criptografia e os protocolos; ou, em v2c, a *community*.

As credenciais são **cifradas** ao salvar e **não voltam** para a tela depois —
para trocar, basta reenviar; deixando em branco, mantém a atual. Em até 10s a
central aparece na grade.

### Gerenciar usuários (Admin)
Crie usuários nomeados com papel **admin** (configura) ou **viewer** (só vê o
painel pelo navegador). Dá para trocar senha e desativar. Desativar um usuário
corta o acesso dele no próximo request.

### Gerar o link da TV (Admin)
Gere um **link de TV**: uma URL com token que abre o painel em modo
**somente-exibição** (sem login, sem controles). Copie a URL e abra na TV. Para
revogar um link antigo, revogue o token na mesma tela.

### Montar na TV
1. No navegador da TV, abra o link de TV gerado no passo anterior
   (`/tv?token=...`).
2. Coloque em **tela cheia** (geralmente `F11`).
3. Pronto — a grade se atualiza sozinha a cada 10s. Um token inválido ou
   revogado mostra "link inválido".

### Cores / limiares
- **Verde:** ok · **Amarelo:** uso ≥ 80% · **Vermelho:** uso ≥ 90% (em CPU,
  memória **ou** disco — vale o pior dos três). **Cinza / "sem resposta":** a
  central não respondeu à coleta.

---

## 7. Operação

- **Saúde / monitoramento externo:** `GET /health` responde `{"ok":true}`. É o
  que o healthcheck do container usa; pode apontar seu monitoramento para ele.
- **Logs (Docker):** `docker compose logs -f painel-pbx`.
- **Backup:** todo o estado (usuários, centrais cifradas, auditoria) está no
  SQLite dentro do volume `painel-data`. Faça backup desse arquivo (ex.:
  `docker run --rm -v painel-data:/data -v "$PWD":/bkp alpine cp /data/panel.sqlite /bkp/`).
  Guarde também o `PANEL_SECRET` — sem ele o backup não decifra as credenciais.
- **Atualizar:** `git pull && docker compose build && docker compose up -d`
  (o volume preserva os dados).
- **Parar:** `docker compose down` (mantém os dados) · `down -v` (apaga os
  dados).

---

## 8. Resolução de problemas

| Sintoma | O que verificar |
|---|---|
| Central aparece "sem resposta"/down | Rota e firewall do host até a central (SSH 22 ou SNMP 161); credenciais corretas; no Yeastar, SNMP realmente habilitado. |
| Todas as centrais congelam de uma vez | Pode ser `PANEL_SECRET` trocado após cadastro (credenciais deixam de decifrar). Veja a seção 4. |
| Não sobe / erro de segredo | `PANEL_SECRET` ausente ou com menos de 32 bytes. |
| Porta ocupada | Troque `PANEL_PORT` no `.env`. |
| Container "unhealthy" | `docker compose logs painel-pbx`; confira `PORT` e `DB_PATH`. |

---

## 9. Segurança — antes de expor com TLS/internet

O painel foi pensado para a **rede interna**. Antes de colocá-lo atrás de um
domínio público/TLS, trate os itens de endurecimento ainda pendentes:

- **TLS + `secure` no cookie** (e `trust proxy` se houver proxy reverso na
  frente).
- **Rate-limit no login** e **token CSRF** nos formulários de administração.
- **Verificação de host-key do SSH** (contra MITM) na coleta dos 3CX.
- O **token da TV** viaja na URL; trate o link como segredo e use HTTPS para
  ele não aparecer em logs de proxy.

---

## 10. Indo ao vivo pela primeira vez

Os **OIDs SNMP** usados para Yeastar são os padrão (UCD-SNMP) e devem ser
**confirmados no primeiro P-Series real** — conforme o modelo, pode ser
necessário ajustá-los (ou usar o fallback de armazenamento). Comece cadastrando
**uma** central de cada tipo, confirme que os números batem com o que você vê no
servidor, e então cadastre o resto.
