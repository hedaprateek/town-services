@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to preview the contact editor.
  pause
  exit /b 1
)
node serve.cjs --admin --open
pause
