@echo off
title Aichi Exam Study App
cd /d "%~dp0"

if exist node_modules\express (
  echo Starting server...
) else (
  echo First run: installing dependencies. This may take a moment...
  call npm install
  echo Done.
)

start "AichiServer" /min cmd /c "node server.js"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
