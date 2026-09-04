$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runtimeRoot = Join-Path $projectRoot '.nexo-stt'
$pythonPath = Join-Path $runtimeRoot '.venv\Scripts\python.exe'
$servicePath = Join-Path $PSScriptRoot 'faster-whisper-service.py'
$modelsRoot = Join-Path $runtimeRoot 'models'
$stdoutPath = Join-Path $projectRoot '.nexo-stt.stdout.log'
$stderrPath = Join-Path $projectRoot '.nexo-stt.stderr.log'

try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:7333/health' -TimeoutSec 2
  if ($health.ok) { Write-Output "Faster Whisper já está ativo: $($health.model)"; exit 0 }
} catch {}

if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw 'STT local ausente. Execute npm run stt:setup.'
}

Start-Process -FilePath $pythonPath -ArgumentList @($servicePath, '--host', '127.0.0.1', '--port', '7333', '--model', 'small', '--models-root', $modelsRoot) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
for ($attempt = 0; $attempt -lt 160; $attempt += 1) {
  Start-Sleep -Milliseconds 250
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:7333/health' -TimeoutSec 2
    if ($health.ok) { Write-Output "Faster Whisper ativo: $($health.model)"; exit 0 }
  } catch {}
}
throw "STT local não iniciou. Consulte $stderrPath"
