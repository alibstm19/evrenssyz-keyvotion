@echo off
setlocal
title Keyvotion Console - Kurulum
if /I "%~1"=="/Kaldir" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Uninstall
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
)
set "KV_SETUP_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %KV_SETUP_EXIT%
