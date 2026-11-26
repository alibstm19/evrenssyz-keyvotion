@echo off
rem Keyvotion Console - launcher
rem Runs the Electron app from src/ (the only dependency is electron 45.2.1).
cd /d "%~dp0src"
if not exist "node_modules\electron\dist\electron.exe" (
  echo [Keyvotion] electron bulunamadi. Once kurun:  cd src ^&^& npm.cmd install
  pause
  exit /b 1
)
call npm.cmd start
if errorlevel 1 pause
