$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Error 'Install Node.js 24 LTS, reopen PowerShell, and retry.'; exit 3 }
& node (Join-Path $PSScriptRoot 'scripts/setup/cli.mjs') install @args
exit $LASTEXITCODE
