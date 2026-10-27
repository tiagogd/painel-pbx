# Painel PBX - instala e sobe tudo localmente (Windows), via Docker.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\start.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host "== Painel PBX - instalar e rodar (local, via Docker) =="

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "ERRO: Docker nao encontrado. Instale o Docker Desktop e rode de novo:" -ForegroundColor Red
  Write-Host "      https://www.docker.com/products/docker-desktop/"
  exit 1
}

if (-not (Test-Path .env)) {
  Write-Host "Gerando .env (primeira vez)..."
  $secret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')  # 64 hex = 64 bytes (>= 32)
  $pw = [guid]::NewGuid().ToString('N').Substring(0, 12)
  @"
# Gerado automaticamente por scripts/start.ps1 (edite se quiser)
PANEL_PORT=8080
PORT=3000
DB_PATH=/data/panel.sqlite
PANEL_SECRET=$secret
ADMIN_EMAIL=admin@local
ADMIN_PASSWORD=$pw
"@ | Set-Content -Encoding utf8 .env
  Write-Host ""
  Write-Host ">> Login de administrador criado:" -ForegroundColor Cyan
  Write-Host "   e-mail: admin@local"
  Write-Host "   senha : $pw"
  Write-Host "   (tambem gravado no arquivo .env, campo ADMIN_PASSWORD)"
  Write-Host ""
}

Write-Host "Construindo e subindo o container (a 1a vez demora alguns minutos)..."
docker compose up -d --build

$port = ((Select-String -Path .env -Pattern '^PANEL_PORT=').Line -split '=', 2)[1]
Write-Host ""
Write-Host "== Pronto! Abra http://localhost:$port ==" -ForegroundColor Green
Write-Host "Parar:  powershell -ExecutionPolicy Bypass -File scripts\stop.ps1   (ou: docker compose down)"
Write-Host "Logs:   docker compose logs -f"
