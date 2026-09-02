$ErrorActionPreference = 'Stop'
$runtimeRoot = if ($env:NEXO_IMAGE_RUNTIME_ROOT) { $env:NEXO_IMAGE_RUNTIME_ROOT } else { 'D:\Nexo\stable-diffusion-webui-amdgpu' }
$nexoRoot = Split-Path $runtimeRoot -Parent
$pythonRoot = Join-Path $nexoRoot 'python'
$pythonPath = Join-Path $pythonRoot 'cpython-3.10.20-windows-x86_64-none\python.exe'
$modelPath = Join-Path $runtimeRoot 'models\Stable-diffusion\DreamShaper_8_pruned.safetensors'
$modelUrl = 'https://huggingface.co/Lykon/DreamShaper/resolve/main/DreamShaper_8_pruned.safetensors?download=true'
$expectedHash = '879DB523C30D3B9017143D56705015E15A2CB5628762C11D086FED9538ABD7FD'

New-Item -ItemType Directory -Path $nexoRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $runtimeRoot)) {
  git clone --depth 1 https://github.com/lshqqytiger/stable-diffusion-webui-amdgpu.git $runtimeRoot
}
if (-not (Test-Path -LiteralPath $pythonPath)) {
  uv python install 3.10 --install-dir $pythonRoot --cache-dir (Join-Path $nexoRoot 'uv-cache') --no-registry --no-bin
}

$webuiUser = @"
@echo off
set PYTHON=$pythonPath
set GIT=
set VENV_DIR=$runtimeRoot\venv
set TEMP=$nexoRoot\tmp
set TMP=$nexoRoot\tmp
set PIP_CACHE_DIR=$nexoRoot\pip-cache
set HF_HOME=$nexoRoot\huggingface
set COMMANDLINE_ARGS=--use-directml --lowvram --opt-split-attention --api --port 7860 --skip-version-check --no-download-sd-model
call webui.bat
"@
[IO.File]::WriteAllText((Join-Path $runtimeRoot 'webui-user.bat'), $webuiUser, [Text.UTF8Encoding]::new($false))
New-Item -ItemType Directory -Path (Split-Path $modelPath -Parent),(Join-Path $nexoRoot 'tmp'),(Join-Path $nexoRoot 'pip-cache'),(Join-Path $nexoRoot 'huggingface') -Force | Out-Null
if (-not (Test-Path -LiteralPath $modelPath) -or (Get-FileHash -LiteralPath $modelPath -Algorithm SHA256).Hash -ne $expectedHash) {
  curl.exe -L --fail --retry 3 --output $modelPath $modelUrl
}
if ((Get-FileHash -LiteralPath $modelPath -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Hash do checkpoint DreamShaper 8 não confere.' }
Write-Output 'Runtime AMD e DreamShaper 8 preparados. Execute npm run image:start.'
