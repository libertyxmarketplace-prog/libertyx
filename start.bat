@echo off
cd /d "C:\Users\sulma\Downloads\ERLCAI"
echo Killing existing node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo Cleaning old logs...
del bot.log bot-err.log >nul 2>&1
echo Starting bot...
start /b node src/index.js >bot.log 2>&1
echo Waiting for bot to start...
timeout /t 15 /nobreak >nul
echo =====================
echo === BOT.LOG (last 30 lines) ===
echo =====================
type bot.log 2>nul | findstr /v "^$" | findstr /c:"Logged in" /c:"ready" /c:"BUILD" /c:"error" /c:"ERR" /c:"failed" /c:"Missing" /c:"command" /c:"Registered"
echo.
echo =====================
echo === BOT-ERR.LOG ===
echo =====================
type bot-err.log 2>nul || echo (clean)
echo.
echo =====================
echo === NODE PROCESSES ===
echo =====================
wmic process where "name='node.exe'" get processid,commandline /format:list 2>nul