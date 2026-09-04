$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
& (Join-Path $projectRoot 'scripts\tts\start-piper.ps1')
& (Join-Path $projectRoot 'scripts\stt\start-faster-whisper.ps1')
Write-Output 'Voz local completa ativa: Piper TTS + Faster Whisper STT.'
