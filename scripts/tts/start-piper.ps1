$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runtimeRoot = Join-Path $projectRoot '.nexo-tts'
$pythonPath = Join-Path $runtimeRoot '.venv\Scripts\python.exe'
$modelPath = Join-Path $runtimeRoot 'voices\pt_BR-faber-medium.onnx'
$servicePath = Join-Path $PSScriptRoot 'piper-service.py'
$stdoutPath = Join-Path $runtimeRoot 'piper.stdout.log'
$stderrPath = Join-Path $runtimeRoot 'piper.stderr.log'

try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:7332/health' -TimeoutSec 2
  if ($health.ok) { Write-Output 'Piper já está ativo.'; exit 0 }
} catch {}

foreach ($path in @($pythonPath, $modelPath, $servicePath)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Arquivo necessário ausente: $path. Execute npm run tts:setup." }
}

Start-Process -FilePath $pythonPath -ArgumentList @($servicePath, '--host', '127.0.0.1', '--port', '7332', '--model', $modelPath) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
  Start-Sleep -Milliseconds 250
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:7332/health' -TimeoutSec 2
    if ($health.ok) { Write-Output "Piper ativo: $($health.model)"; exit 0 }
  } catch {}
}
throw "Piper não iniciou. Consulte $stderrPath"
