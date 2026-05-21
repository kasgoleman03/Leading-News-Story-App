# -----------------------------------------------------------------------------
# News Reader — start all dev servers (Windows / PowerShell).
#
# Spawns three background jobs (scorer, proxy, client) and streams their
# output to the current console with a prefix. Ctrl-C stops all three.
# -----------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path "proxy\.env")) {
  Write-Host "!! proxy\.env missing. Run scripts\setup.ps1 first."
  exit 1
}

$jobs = @()

function Start-DevJob {
  param([string]$Name, [string]$WorkDir, [string]$Command)
  $job = Start-Job -Name $Name -ScriptBlock {
    param($dir, $cmd)
    Set-Location $dir
    Invoke-Expression $cmd
  } -ArgumentList (Resolve-Path $WorkDir).Path, $Command
  return $job
}

try {
  Write-Host "==> Starting Go scorer"
  $jobs += Start-DevJob -Name 'scorer' -WorkDir 'services' -Command 'go run ./cmd/scorer'
  Start-Sleep -Seconds 1

  Write-Host "==> Starting Express proxy"
  $jobs += Start-DevJob -Name 'proxy' -WorkDir 'proxy' -Command 'npm run dev'

  Write-Host "==> Starting Vite client"
  $jobs += Start-DevJob -Name 'client' -WorkDir 'client' -Command 'npm run dev'

  Write-Host ""
  Write-Host "All three dev servers running. Press Ctrl-C to stop."
  Write-Host ""

  while ($true) {
    foreach ($job in $jobs) {
      $output = Receive-Job -Job $job -Keep:$false
      if ($output) {
        foreach ($line in $output) {
          Write-Host "[$($job.Name)] $line"
        }
      }
    }
    Start-Sleep -Milliseconds 400
  }
}
finally {
  Write-Host ""
  Write-Host "==> Stopping dev jobs"
  $jobs | ForEach-Object {
    Stop-Job -Job $_ -ErrorAction SilentlyContinue
    Remove-Job -Job $_ -Force -ErrorAction SilentlyContinue
  }
}
