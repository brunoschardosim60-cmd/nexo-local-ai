$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runtimeRoot = Join-Path $projectRoot '.nexo-stt'
$venvRoot = Join-Path $runtimeRoot '.venv'
$modelsRoot = Join-Path $runtimeRoot 'models'
$pythonPath = Join-Path $venvRoot 'Scripts\python.exe'
$requirementsPath = Join-Path $PSScriptRoot 'requirements.txt'

New-Item -ItemType Directory -Force -Path $runtimeRoot, $modelsRoot | Out-Null
if (-not (Test-Path -LiteralPath $pythonPath)) {
  & uv venv $venvRoot --python 3.12
}
& uv pip install --python $pythonPath -r $requirementsPath
& $pythonPath -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8', download_root=r'$modelsRoot')"
Write-Output 'Faster Whisper small instalado para STT local em CPU.'
