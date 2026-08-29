@echo off
title Nexo Local
cd /d "%~dp0"
start "Nexo Agent" /min cmd /c "npm run agent"
npm run dev
