$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runtimeRoot = Join-Path $projectRoot '.nexo-tts'
$venvRoot = Join-Path $runtimeRoot '.venv'
$voicesRoot = Join-Path $runtimeRoot 'voices'
$pythonPath = Join-Path $venvRoot 'Scripts\python.exe'
$requirementsPath = Join-Path $PSScriptRoot 'requirements.txt'

New-Item -ItemType Directory -Force -Path $runtimeRoot, $voicesRoot | Out-Null
if (-not (Test-Path -LiteralPath $pythonPath)) {
  & uv venv $venvRoot --python 3.13
}
& uv pip install --python $pythonPath -r $requirementsPath
& $pythonPath -m piper.download_voices --data-dir $voicesRoot pt_BR-faber-medium
Write-Output "Piper instalado em $runtimeRoot"
