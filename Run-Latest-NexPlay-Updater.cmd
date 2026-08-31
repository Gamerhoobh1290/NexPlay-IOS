@echo off
setlocal

set "ROOT=%~dp0"
set "UPDATER=%ROOT%dist\NexPlay Updater.exe"
set "SOURCE=%ROOT%dist-updater-payload\win-unpacked"
set "TARGET=%ROOT%dist-updater-build-latest\win-unpacked"

if not exist "%UPDATER%" (
  echo [NexPlay] Updater executable not found:
  echo %UPDATER%
  exit /b 1
)

if not exist "%SOURCE%" (
  echo [NexPlay] Updater payload not found:
  echo %SOURCE%
  exit /b 1
)

if exist "%TARGET%\NexPlay.exe" (
  start "" "%UPDATER%" --source "%SOURCE%" --install-dir "%TARGET%"
  exit /b 0
)

start "" "%UPDATER%" --source "%SOURCE%"
exit /b 0
