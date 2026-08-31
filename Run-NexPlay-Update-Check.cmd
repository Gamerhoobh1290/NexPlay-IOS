@echo off
setlocal

set "ROOT=%~dp0"
set "UPDATER=%ROOT%dist\NexPlay Updater.exe"

if not exist "%UPDATER%" (
  echo [NexPlay] Updater executable not found:
  echo %UPDATER%
  exit /b 1
)

start "" "%UPDATER%" --check
exit /b 0
