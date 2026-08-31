@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_PATH=%SCRIPT_DIR%scripts\uninstall-nexplay.ps1"

if not exist "%SCRIPT_PATH%" (
    echo Could not find "%SCRIPT_PATH%".
    echo Make sure this file stays next to the "scripts" folder.
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_PATH%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo Uninstaller exited with code %EXIT_CODE%.
)

exit /b %EXIT_CODE%
