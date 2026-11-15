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
param(
  [Parameter(Mandatory = $true)] [string] $File,
  [string] $Title = "テスト求人",
  [string] $Company = ""
)

# ① ローカルの接続情報（手元専用の値なので、コードに書かず毎回取り出す）
$status = npx supabase status -o json 2>$null | ConvertFrom-Json
$api  = $status.API_URL
$anon = $status.ANON_KEY

# ② テストユーザーでログイン（seed.sql で作ったユーザー）
$login = Invoke-RestMethod "$api/auth/v1/token?grant_type=password" -Method Post `
  -Headers @{ apikey = $anon } -ContentType "application/json" `
  -Body '{"email":"test@example.com","password":"password123"}'

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
