#!/usr/bin/env bash
# Para o Painel PBX (Linux/macOS). Os dados continuam no volume Docker.
# Uso:  bash scripts/stop.sh
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose down
echo "Painel parado. Os dados continuam no volume (scripts/start.sh para subir de novo)."
