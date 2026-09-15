@echo off
REM ERLC Bot launcher - run this (double-click) to start the bot detached.
cd /d "%~dp0"
taskkill /F /IM node.exe >nul 2>&1
start "" /b node src/index.js >> bot.log 2>&1
timeout /t 6 >nul
type bot.log