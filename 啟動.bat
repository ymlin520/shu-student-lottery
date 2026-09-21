@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 啟動世新在校生抽獎伺服器（port 8124）...
start "shu-student-lottery-server" /min node server.js
timeout /t 2 >nul
echo 開啟 Cloudflare 臨時網址，請在下方找 https://xxxx.trycloudflare.com
echo 前台（學生登入報名）＝該網址
echo 抽獎畫面＝該網址/draw　後台＝該網址/admin　設計＝該網址/design
echo 管理密碼在 admin-password.txt
echo.
echo 注意：SSO 目前是測試模式，任何帳號密碼都會通過。
echo 　　　正式使用前請編輯 sso-config.json，把 mode 改成 api 並填入學校認證網址。
cloudflared tunnel --no-autoupdate --url http://localhost:8124
