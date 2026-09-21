# 每天 16:00 由 Windows 工作排程器呼叫：把在校生抽獎系統的程式改動推到 GitHub
# 只推程式；報名資料 data\、admin-password.txt、sso-config.json（廠商帳密）已由 .gitignore 排除，不會上傳
# 推之前會先在「GitHub 上目前的狀態」打一個 auto/日期-時間 tag 當還原點
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$log  = Join-Path $repo 'auto-push.log'
$git  = 'C:\Program Files\Git\cmd\git.exe'

# 非互動環境：禁止 git / 憑證管理員彈窗或等待輸入，避免排程卡死
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'

function Log($msg) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -LiteralPath $log -Value $line -Encoding utf8
}

try {
  Set-Location -LiteralPath $repo
  Log '--- 排程啟動 ---'

  # 保護：有未完成的 merge / rebase / cherry-pick 就不要碰
  foreach ($m in 'MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD') {
    if (Test-Path (Join-Path $repo ".git\$m")) { Log "略過：偵測到未完成的 $m，請先手動處理"; exit 0 }
  }

  $branch = (& $git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -ne 'main') { Log "略過：目前在 $branch 分支，不是 main"; exit 0 }

  # 保險：萬一 .gitignore 被改動，資料檔還是不准上傳
  $tracked = & $git ls-files
  $leak = $tracked | Where-Object { $_ -like 'data/*' -or $_ -eq 'admin-password.txt' -or $_ -eq 'sso-config.json' }
  if ($leak) { Log "中止：偵測到資料、密碼或 SSO 帳密檔被納入版控（$($leak -join ', ')），請先處理再推送"; exit 1 }

  & $git fetch origin --quiet
  if ($LASTEXITCODE -ne 0) { Log '錯誤：git fetch 失敗（網路或憑證問題）'; exit 1 }

  $hasRemote = & $git rev-parse --verify --quiet origin/main
  if ($hasRemote) {
    $behind = [int](& $git rev-list --count 'HEAD..origin/main').Trim()
    if ($behind -gt 0) { Log "略過：本機落後 origin/main $behind 個 commit，請先手動 git pull 再說"; exit 0 }
    $ahead = [int](& $git rev-list --count 'origin/main..HEAD').Trim()
  } else {
    $ahead = 1  # 遠端還沒有 main，直接推
  }

  $dirty = & $git status --porcelain
  if (-not $dirty -and $ahead -eq 0) { Log '無變更，不動作'; exit 0 }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmm'
  if ($hasRemote) {
    $tag = "auto/$stamp"
    & $git tag -a $tag origin/main -m "自動排程推送前的還原點 $stamp"
    if ($LASTEXITCODE -ne 0) { Log "警告：tag $tag 建立失敗（可能同名已存在），繼續推送" } else { Log "已建立還原點 $tag" }
  }

  if ($dirty) {
    & $git add -A
    if ($LASTEXITCODE -ne 0) { Log '錯誤：git add 失敗'; exit 1 }
    & $git commit -q -m "自動排程備份 $stamp"
    if ($LASTEXITCODE -ne 0) { Log '錯誤：git commit 失敗'; exit 1 }
    Log '已自動 commit 程式改動'
  }

  $out = & $git push origin main --follow-tags 2>&1
  $code = $LASTEXITCODE
  foreach ($line in $out) { Log "push: $line" }
  if ($code -ne 0) { Log '錯誤：git push 失敗'; exit 1 }

  $head = (& $git rev-parse --short HEAD).Trim()
  Log "完成：main 已推到 $head"
}
catch {
  Log "例外：$($_.Exception.Message)"
  exit 1
}
