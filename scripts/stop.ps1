# Para o Painel PBX (Windows). Os dados continuam no volume Docker.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\stop.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
docker compose down
Write-Host "Painel parado. Os dados continuam no volume (scripts\start.ps1 para subir de novo)."
