$ErrorActionPreference = 'Stop'
$runtimeRoot = if ($env:NEXO_IMAGE_RUNTIME_ROOT) { $env:NEXO_IMAGE_RUNTIME_ROOT } else { 'D:\Nexo\stable-diffusion-webui-amdgpu' }
$launcher = Join-Path $runtimeRoot 'webui-user.bat'
$stdoutPath = Join-Path $runtimeRoot 'nexo-image.stdout.log'
$stderrPath = Join-Path $runtimeRoot 'nexo-image.stderr.log'

try {
  $options = Invoke-RestMethod -Uri 'http://127.0.0.1:7860/sdapi/v1/options' -TimeoutSec 3
  if ($options.sd_model_checkpoint) { Write-Output 'Gerador de imagens já está ativo.'; exit 0 }
} catch {}

if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Runtime de imagem ausente em $runtimeRoot. Execute npm run image:setup."
}

Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/c', 'webui-user.bat') -WorkingDirectory $runtimeRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
for ($attempt = 0; $attempt -lt 360; $attempt += 1) {
  Start-Sleep -Milliseconds 500
  try {
    $options = Invoke-RestMethod -Uri 'http://127.0.0.1:7860/sdapi/v1/options' -TimeoutSec 3
    if ($options.sd_model_checkpoint) { Write-Output 'Gerador de imagens AMD ativo.'; exit 0 }
  } catch {}
}
throw "Gerador de imagens não iniciou. Consulte $stderrPath e $stdoutPath"
