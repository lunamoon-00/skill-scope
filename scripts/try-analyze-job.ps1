# =====================================================================
# analyze-job をローカルで試すためのスクリプト（ローカル開発専用）
#
# 使い方：
#   .\scripts\try-analyze-job.ps1 -File samples\job-1.txt -Title "Webエンジニア" -Company "サンプル社"
#
# やっていること：
#   ① supabase status から、ローカルのURLとキーを取り出す
#   ② テストユーザーでログインして、トークン（通行証）をもらう
#   ③ そのトークンを付けて analyze-job を呼ぶ
# =====================================================================
#
# クラウド（本番）で試すとき：-Remote を付ける
#   .\scripts\try-analyze-job.ps1 -Remote -File samples\job-1.txt
#   接続先はプロジェクト直下の .env（SUPABASE_URL / SUPABASE_ANON_KEY）から読み、
#   メールアドレスとパスワードはその場で入力する（ファイルには残さない）
param(
  [Parameter(Mandatory = $true)] [string] $File,
  [string] $Title = "テスト求人",
  [string] $Company = "",
  [switch] $Remote
)

if ($Remote) {
  # ① クラウドの接続情報を .env から読む
  $envFile = Join-Path $PSScriptRoot "..\.env"
  if (-not (Test-Path $envFile)) { Write-Host ".env がありません。.env.example をコピーして作ってください" -ForegroundColor Red; exit 1 }
  $vars = @{}
  Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.*)$' } | ForEach-Object { $vars[$Matches[1]] = $Matches[2].Trim() }
  $api  = $vars["SUPABASE_URL"]
  $anon = $vars["SUPABASE_ANON_KEY"]
  if (-not $api -or -not $anon) { Write-Host ".env に SUPABASE_URL と SUPABASE_ANON_KEY を書いてください" -ForegroundColor Red; exit 1 }

  # ② ダッシュボードで作ったユーザーでログイン（パスワードは画面に表示されない）
  $email = Read-Host "メールアドレス"
  $secure = Read-Host "パスワード" -AsSecureString
  $password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  $credential = @{ email = $email; password = $password } | ConvertTo-Json
} else {
  # ① ローカルの接続情報（手元専用の値なので、コードに書かず毎回取り出す）
  $status = npx supabase status -o json 2>$null | ConvertFrom-Json
  $api  = $status.API_URL
  $anon = $status.ANON_KEY
  # ② テストユーザー（seed.sql で作ったユーザー）
  $credential = '{"email":"test@example.com","password":"password123"}'
}

Write-Host "接続先：$api" -ForegroundColor Cyan

try {
  $login = Invoke-RestMethod "$api/auth/v1/token?grant_type=password" -Method Post `
    -Headers @{ apikey = $anon } -ContentType "application/json" -Body $credential
} catch {
  Write-Host "ログインに失敗しました：$($_.ErrorDetails.Message)" -ForegroundColor Red
  exit 1
}

# ③ 求人票のファイルを読み込んで、analyze-job に送る
$body = @{
  title    = $Title
  company  = $Company
  # Get-Content だと余計な情報が付いてJSONが崩れるので、純粋な文字列として読む
  raw_text = [IO.File]::ReadAllText((Resolve-Path $File), [Text.Encoding]::UTF8)
} | ConvertTo-Json

try {
  $result = Invoke-RestMethod "$api/functions/v1/analyze-job" -Method Post `
    -Headers @{ apikey = $anon; Authorization = "Bearer $($login.access_token)" } `
    -ContentType "application/json; charset=utf-8" `
    -Body ([Text.Encoding]::UTF8.GetBytes($body))
  Write-Host "求人ID: $($result.job_id)" -ForegroundColor Green
  $result.skills | Format-Table name, requirement
} catch {
  Write-Host "エラー：$($_.ErrorDetails.Message)" -ForegroundColor Red
}
