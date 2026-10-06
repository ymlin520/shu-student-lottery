@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 在校生抽獎伺服器（自動重開）
echo ============================================
echo   世新在校生抽獎伺服器　port 8124
echo   這個視窗請不要關，萬一程式意外結束會自動重開
echo   要停止：直接關掉這個視窗
echo ============================================
echo.
:loop
node server.js
echo.
echo [%date% %time%] 伺服器結束了，3 秒後自動重新啟動...
timeout /t 3 >nul
goto loop
