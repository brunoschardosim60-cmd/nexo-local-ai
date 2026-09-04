param(
  [switch]$ForceConfig
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$workspaceRoot = Split-Path $repositoryRoot -Parent
$integrationRoot = Join-Path $workspaceRoot '.nexo-integrations\google-workspace-mcp'
$sourceUrl = 'https://github.com/rishapgandhi/google_mcp.git'
$pinnedRevision = '58383d86d7d9f6ce2eeac25c29bfd14117184139'
$patchPath = Join-Path $PSScriptRoot 'google-workspace-minimal-scopes.patch'
$configTemplate = Join-Path $repositoryRoot 'mcp-servers.google.example.json'
$configPath = Join-Path $repositoryRoot 'data\mcp-servers.json'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git não encontrado.' }
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { throw 'uv não encontrado. Instale o uv antes de continuar.' }

if (-not (Test-Path -LiteralPath (Join-Path $integrationRoot '.git'))) {
  New-Item -ItemType Directory -Path (Split-Path $integrationRoot -Parent) -Force | Out-Null
  git clone $sourceUrl $integrationRoot
}

$resolvedIntegration = (Resolve-Path -LiteralPath $integrationRoot).Path
if (-not $resolvedIntegration.StartsWith($workspaceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Diretório de integração fora do workspace: $resolvedIntegration"
}

git -C $resolvedIntegration fetch origin main
git -C $resolvedIntegration checkout --detach $pinnedRevision
$oauthPath = Join-Path $resolvedIntegration 'src\auth\oauth.py'
if (-not (Select-String -LiteralPath $oauthPath -Pattern 'MINIMAL_SCOPES' -Quiet)) {
  git -C $resolvedIntegration apply --check $patchPath
  if ($LASTEXITCODE -ne 0) { throw 'O patch de escopos mínimos não é compatível com a revisão fixada.' }
  git -C $resolvedIntegration apply $patchPath
}

$venvPython = Join-Path $resolvedIntegration '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) {
  uv venv --python 3.12 (Join-Path $resolvedIntegration '.venv')
}
uv pip install --python $venvPython 'mcp>=1.0,<2' --editable $resolvedIntegration

if ($ForceConfig -or -not (Test-Path -LiteralPath $configPath)) {
  Copy-Item -LiteralPath $configTemplate -Destination $configPath -Force
  Write-Host "Configuração MCP criada em $configPath"
} else {
  Write-Host "Configuração MCP existente preservada em $configPath"
}

Write-Host ''
Write-Host 'Google Workspace MCP instalado com revisão e escopos mínimos fixados.'
Write-Host 'Próximo passo: npm run google:auth'
