# Auto-start runner: Windows Task Scheduler runs this at system startup as SYSTEM (no login needed).
# Restarts node server.js 3 seconds after it exits; output goes to data\server.log (data\ is git-ignored).
# Keep this file ASCII-only: Windows PowerShell 5.1 misreads UTF-8 without BOM.
$repo = Split-Path -Parent $PSScriptRoot
$log  = Join-Path $repo 'data\server.log'
$node = 'C:\Program Files\nodejs\node.exe'
Set-Location -LiteralPath $repo
while ($true) {
  Add-Content -LiteralPath $log -Value ('[{0}] start server' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
  cmd /c "`"$node`" server.js >> `"$log`" 2>&1"
  Add-Content -LiteralPath $log -Value ('[{0}] server exited (code {1}), restarting in 3s' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $LASTEXITCODE)
  Start-Sleep -Seconds 3
}
