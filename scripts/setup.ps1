# -----------------------------------------------------------------------------
# News Reader — one-shot setup (Windows / PowerShell).
#
# Mirrors scripts/setup.sh for users on Windows without a Bash shell.
# -----------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "==> Installing client dependencies"
Push-Location client
npm install
Pop-Location

Write-Host "==> Installing proxy dependencies"
Push-Location proxy
npm install
Pop-Location

Write-Host "==> Downloading Go module dependencies"
Push-Location services
go mod tidy
Pop-Location

if (-not (Test-Path "proxy\.env")) {
  Write-Host "==> Creating proxy\.env from proxy\.env.example"
  Copy-Item "proxy\.env.example" "proxy\.env"
  Write-Host "    !! Edit proxy\.env and set THENEWSAPI_KEY before running."
}

Write-Host "==> Setup complete. Run scripts\dev.ps1 to start everything."
