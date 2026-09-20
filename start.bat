@echo off
rem 学習アプリ＋外部公開(ngrok)を一括起動する
cd /d "%~dp0"
if not exist "dist\aichi-exam-app.exe" (
  echo dist\aichi-exam-app.exe が見つかりません。
  pause
  exit /b 1
)
start "aichi-exam-app" "dist\aichi-exam-app.exe"
rem アプリの起動待ち（最大30秒）
set /a tries=0
:wait
timeout /t 2 /nobreak >nul
curl -sf http://localhost:3000/api/status >nul 2>&1
if errorlevel 1 (
  set /a tries+=1
  if %tries% lss 15 goto wait
  echo アプリの起動確認ができませんでした。dist\aichi-exam-app.exe の画面を確認してください。
  pause
  exit /b 1
)
start "ngrok" "C:\Users\aeroc\ngrok\ngrok.exe" http 3000 --url=https://jaundice-swiftness-impotence.ngrok-free.dev
echo 起動しました。公開URL: https://jaundice-swiftness-impotence.ngrok-free.dev
echo この画面と開いた2つの画面は閉じないでください。
