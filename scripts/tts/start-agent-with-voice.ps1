$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$stdoutPath = Join-Path $projectRoot '.nexo-agent.stdout.log'
$stderrPath = Join-Path $projectRoot '.nexo-agent.stderr.log'
$nodePath = (Get-Command node).Source

$connection = Get-NetTCPConnection -LocalPort 7331 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($connection) { Write-Output 'Nexo Core já está ativo.'; exit 0 }

$env:NEXO_TTS_PROVIDER_URL = 'http://127.0.0.1:7332/synthesize'
Start-Process -FilePath $nodePath -ArgumentList @('local-agent.mjs') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
  Start-Sleep -Milliseconds 250
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:7331/health' -TimeoutSec 2
    if ($health.ok) { Write-Output 'Nexo Core ativo com voz local.'; exit 0 }
  } catch {}
}
throw "Nexo Core não iniciou. Consulte $stderrPath"
