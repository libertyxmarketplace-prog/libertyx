@echo off
cd /d "C:\Users\sulma\Downloads\ERLCAI"
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
del bot.log bot-err.log >nul 2>&1
start /b node src/index.js >bot.log 2>&1
timeout /t 15 /nobreak >nul
echo === BOT LOG ===
type bot.log
echo.
echo === ERR LOG ===
type bot-err.log 2>nul || echo (clean)
echo.
echo === NODE PROCESSES ===
wmic process where "name='node.exe'" get processid,commandline /format:list