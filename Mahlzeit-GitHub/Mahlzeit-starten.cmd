@echo off
setlocal
cd /d "%~dp0"
set "MAHLZEIT_NODE=node"
where node >nul 2>&1
if errorlevel 1 (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    set "MAHLZEIT_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  ) else (
    echo Zum Starten bitte Node.js 24 installieren.
    pause
    exit /b 1
  )
)
echo Im Browser http://127.0.0.1:4173 aufrufen.
"%MAHLZEIT_NODE%" --env-file-if-exists=.env dev.mjs
if errorlevel 1 pause

