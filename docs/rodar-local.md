# Rodar localmente em outra máquina (1 script)

Este guia é para subir o Painel PBX **em outra máquina**, do jeito que ele roda
aqui hoje, **sem hospedar em VM** — basta clonar e rodar **um script**, que
instala e sobe tudo (em container Docker).

## Pré-requisitos (só dois)

1. **Git** — para clonar o repositório.
2. **Docker Desktop** (Windows/macOS) ou **Docker Engine** (Linux) — é o único
   "runtime" necessário; o Node e as dependências são instalados **dentro** do
   container, você não precisa instalar nada disso na máquina.
   - Download: https://www.docker.com/products/docker-desktop/
   - Depois de instalar, abra o Docker Desktop uma vez e espere ele ficar
     "running".

## Passo a passo

```bash
git clone https://github.com/tiagogd/painel-pbx.git
cd painel-pbx
```

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
```

**Linux / macOS:**
```bash
bash scripts/start.sh
```

O script, na primeira vez:
1. gera o arquivo `.env` com um segredo aleatório e um **login de administrador**
   (`admin@local` + uma senha gerada — ele mostra a senha na tela e grava em
   `.env`, campo `ADMIN_PASSWORD`);
2. constrói a imagem e sobe o container (a primeira vez baixa a base e instala
   as dependências — pode levar alguns minutos);
3. no fim, imprime o endereço: **http://localhost:8080**.

Abra `http://localhost:8080`, entre com `admin@local` e a senha gerada, e
cadastre as centrais em **Admin**.

## Operação

| Ação | Windows | Linux/macOS |
|---|---|---|
| Subir / atualizar | `scripts\start.ps1` | `bash scripts/start.sh` |
| Parar (mantém dados) | `scripts\stop.ps1` | `bash scripts/stop.sh` |
| Ver logs | `docker compose logs -f` | `docker compose logs -f` |
| Zerar tudo (apaga dados) | `docker compose down -v` | `docker compose down -v` |

- Os dados (usuários, centrais cifradas, auditoria) ficam num **volume Docker**
  e sobrevivem a parar/subir e a atualizações. Só `down -v` apaga.
- Para **atualizar** depois de um `git pull`, rode o script de start de novo —
  ele reconstrói a imagem e preserva o volume.
- Trocar a porta: edite `PANEL_PORT` no `.env` e rode o start de novo.

## Importante: alcance de rede até as centrais

O painel coleta por **SNMP (UDP 161)** nos Yeastar e **SSH (TCP 22)** nos 3CX. A
máquina onde ele roda precisa **enxergar as centrais** por essas portas (mesma
rede, VPN, ou IP público liberado no firewall). Sem isso o painel **sobe
normalmente**, mas as centrais aparecem como **"sem resposta"** até haver rota.

## Sem Docker? (alternativa com Node)

Se a máquina não tiver Docker mas tiver **Node.js 22+**, dá para rodar direto:

```bash
npm install
# defina as variáveis de ambiente (veja o manual) com DB_PATH local, ex.:
#   PANEL_SECRET (32+ caracteres), ADMIN_EMAIL, ADMIN_PASSWORD, PORT=3000, DB_PATH=./data/panel.sqlite
npm start
```

O caminho recomendado continua sendo o script com Docker — é o que replica
exatamente o ambiente daqui. Detalhes gerais de configuração e uso estão no
[manual de instalação e uso](manual.md).
