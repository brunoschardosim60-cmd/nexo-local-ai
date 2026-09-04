param(
  [Parameter(Mandatory = $true)]
  [string]$CredentialPath
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$workspaceRoot = Split-Path $repositoryRoot -Parent
$integrationRoot = Join-Path $workspaceRoot '.nexo-integrations\google-workspace-mcp'
$pythonPath = Join-Path $integrationRoot '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw 'A integração ainda não foi instalada. Execute npm run google:setup primeiro.'
}

$resolvedCredential = (Resolve-Path -LiteralPath $CredentialPath).Path
$payload = Get-Content -Raw -LiteralPath $resolvedCredential | ConvertFrom-Json
$client = if ($payload.installed) { $payload.installed } elseif ($payload.web) { $payload.web } else { $null }

if (-not $client.client_id -or -not $client.client_secret) {
  throw 'JSON OAuth inválido: client_id/client_secret não encontrados.'
}

$environmentPath = Join-Path $integrationRoot '.env'
$credentialDirectory = Join-Path $integrationRoot '.credentials'
$archivePath = Join-Path $credentialDirectory 'oauth-client.json'
New-Item -ItemType Directory -Force -Path $credentialDirectory | Out-Null

$lines = @(
  "GOOGLE_OAUTH_CLIENT_ID=$($client.client_id)"
  "GOOGLE_OAUTH_CLIENT_SECRET=$($client.client_secret)"
)
[IO.File]::WriteAllLines($environmentPath, $lines, [Text.UTF8Encoding]::new($false))

if ($resolvedCredential -ne $archivePath) {
  Move-Item -LiteralPath $resolvedCredential -Destination $archivePath -Force
}

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls $environmentPath /inheritance:r /grant:r "${currentIdentity}:(R,W)" | Out-Null
icacls $archivePath /inheritance:r /grant:r "${currentIdentity}:(R,W)" | Out-Null

Write-Host 'Credencial OAuth importada para o runtime local e removida da pasta Downloads.'
Write-Host 'Nenhum segredo foi exibido ou adicionado ao Git.'
