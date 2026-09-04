$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$workspaceRoot = Split-Path $repositoryRoot -Parent
$integrationRoot = Join-Path $workspaceRoot '.nexo-integrations\google-workspace-mcp'
$environmentPath = Join-Path $integrationRoot '.env'

if (-not (Test-Path -LiteralPath (Join-Path $integrationRoot '.venv\Scripts\python.exe'))) {
  throw 'A integração ainda não foi instalada. Execute npm run google:setup primeiro.'
}

$clientId = (Read-Host 'Google OAuth Client ID (Desktop app)').Trim()
$secureSecret = Read-Host 'Google OAuth Client Secret' -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
try {
  $clientSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
  if (-not $clientId -or -not $clientSecret) { throw 'Client ID e Client Secret são obrigatórios.' }
  $lines = @(
    "GOOGLE_OAUTH_CLIENT_ID=$clientId"
    "GOOGLE_OAUTH_CLIENT_SECRET=$clientSecret"
  )
  Set-Content -LiteralPath $environmentPath -Value $lines -Encoding utf8NoBOM
} finally {
  if ($secretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer) }
  $clientSecret = $null
}

icacls $environmentPath /inheritance:r /grant:r "${env:USERNAME}:(R,W)" | Out-Null
Write-Host 'Credenciais salvas somente no runtime local ignorado pelo Git.'
Write-Host 'Reinicie o Nexo Core e faça a primeira chamada Google para abrir o consentimento OAuth.'
