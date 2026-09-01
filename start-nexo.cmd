@echo off
title Nexo Local
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\tts\start-piper.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\tts\start-agent-with-voice.ps1"
npm run dev
