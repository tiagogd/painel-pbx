#!/usr/bin/env bash
# Painel PBX - instala e sobe tudo localmente (Linux/macOS), via Docker.
# Uso:  bash scripts/start.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Painel PBX - instalar e rodar (local, via Docker) =="

if ! command -v docker >/dev/null 2>&1; then
  echo "ERRO: Docker nao encontrado. Instale o Docker Desktop/Engine e rode de novo:"
  echo "      https://www.docker.com/products/docker-desktop/"
  exit 1
fi

if [ ! -f .env ]; then
  echo "Gerando .env (primeira vez)..."
  if command -v openssl >/dev/null 2>&1; then
    SECRET=$(openssl rand -hex 32)   # 64 hex = 64 bytes (>= 32)
    PW=$(openssl rand -hex 6)
  else
    SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    PW=$(node -e "console.log(require('crypto').randomBytes(6).toString('hex'))")
  fi
  cat > .env <<EOF
# Gerado automaticamente por scripts/start.sh (edite se quiser)
PANEL_PORT=8080
PORT=3000
DB_PATH=/data/panel.sqlite
PANEL_SECRET=$SECRET
ADMIN_EMAIL=admin@local
ADMIN_PASSWORD=$PW
EOF
  echo ""
  echo ">> Login de administrador criado:"
  echo "   e-mail: admin@local"
  echo "   senha : $PW"
  echo "   (tambem gravado no arquivo .env, campo ADMIN_PASSWORD)"
  echo ""
fi

echo "Construindo e subindo o container (a 1a vez demora alguns minutos)..."
docker compose up -d --build

PORT=$(grep -E '^PANEL_PORT=' .env | cut -d= -f2)
echo ""
echo "== Pronto! Abra http://localhost:${PORT} =="
echo "Parar:  bash scripts/stop.sh   (ou: docker compose down)"
echo "Logs:   docker compose logs -f"
