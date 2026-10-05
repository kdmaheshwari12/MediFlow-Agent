param(
  [string]$BackendUrl = "http://127.0.0.1:4000",
  [string]$AgentUrl   = "http://127.0.0.1:8000",
  [string]$BackendEnv = "D:\Z360 backend\backend\.env",
  [string]$AgentEnv   = "D:\Agent\.env",
  [string]$Mrn        = "MRN-10001"
)

function Get-EnvValue($path, $key) {
  $line = Select-String -Path $path -Pattern "^\s*$key\s*=" | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line.Line -split "=", 2)[1].Trim().Trim('"').Trim("'")
}
function Short-Hash($s) {
  $b = [Text.Encoding]::UTF8.GetBytes($s)
  $h = [Security.Cryptography.SHA256]::Create().ComputeHash($b)
  return ([BitConverter]::ToString($h) -replace "-", "").Substring(0, 12)
}
function Pass($m) { Write-Host "[PASS] $m" -ForegroundColor Green }
function Fail($m) { Write-Host "[FAIL] $m" -ForegroundColor Red }
function Info($m) { Write-Host "[INFO] $m" -ForegroundColor Yellow }

function Call($method, $url, $headers, $body) {
  try {
    $p = @{ Method = $method; Uri = $url; Headers = $headers; TimeoutSec = 90 }
    if ($body) { $p.Body = ($body | ConvertTo-Json -Depth 5); $p.ContentType = "application/json" }
    return @{ ok = $true; status = 200; data = (Invoke-RestMethod @p); detail = "" }
  } catch {
    $code = 0
    $detail = $_.Exception.Message
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $detail = $_.ErrorDetails.Message }
    return @{ ok = $false; status = $code; data = $null; detail = $detail }
  }
}

Write-Host "`n=== 1. Env keys (sirf set/missing, values nahi) ===" -ForegroundColor Cyan
$checks = @(
  @($BackendEnv, "AGENT_SERVICE_URL"), @($BackendEnv, "AGENT_SERVICE_TOKEN"),
  @($BackendEnv, "SUPABASE_URL"),      @($BackendEnv, "SUPABASE_ANON_KEY"),
  @($AgentEnv, "AGENT_SERVICE_TOKEN"), @($AgentEnv, "BACKEND_BASE_URL"),
  @($AgentEnv, "GROQ_API_KEY"),        @($AgentEnv, "GROQ_MODEL")
)
foreach ($c in $checks) {
  if (Get-EnvValue $c[0] $c[1]) { Pass "$([IO.Path]::GetFileName((Split-Path $c[0]))) $($c[1]) set" }
  else { Fail "$($c[1]) missing in $($c[0])" }
}

$bTok = Get-EnvValue $BackendEnv "AGENT_SERVICE_TOKEN"
$aTok = Get-EnvValue $AgentEnv "AGENT_SERVICE_TOKEN"
if ($bTok -and $aTok -and $bTok -eq $aTok) { Pass "AGENT_SERVICE_TOKEN dono jagah ek jaisa (hash $(Short-Hash $aTok))" }
else { Fail "AGENT_SERVICE_TOKEN dono .env mein alag ya missing hai" }
Info "Backend ka AGENT_SERVICE_URL: $(Get-EnvValue $BackendEnv 'AGENT_SERVICE_URL') (127.0.0.1:8000 hona chahiye)"
Info "Agent ka BACKEND_BASE_URL: $(Get-EnvValue $AgentEnv 'BACKEND_BASE_URL') (127.0.0.1:4000 hona chahiye)"

Write-Host "`n=== 2. Servers chal rahe hain? ===" -ForegroundColor Cyan
$r = Call "GET" "$BackendUrl/health" @{} $null
if ($r.ok) { Pass "Backend /health" } else { Fail "Backend /health (status $($r.status))" }
$r = Call "GET" "$AgentUrl/health" @{} $null
if ($r.ok) { Pass "Agent /health" } else { Fail "Agent /health (status $($r.status))" }

Write-Host "`n=== 3. Agent aur Groq ===" -ForegroundColor Cyan
$r = Call "GET" "$AgentUrl/v1/dev/ping" @{ Authorization = "Bearer $aTok" } $null
if ($r.ok -and $r.data.reply) { Pass "Agent ne Groq se jawab liya (model $($r.data.model))" }
else { Fail "Agent /v1/dev/ping fail (status $($r.status)): GROQ key/model ya token dekhein" }
$r = Call "GET" "$AgentUrl/v1/dev/ping" @{ Authorization = "Bearer wrong-token" } $null
if ($r.status -eq 401) { Pass "Agent ghalat token ko reject karta hai (401)" }
else { Fail "Agent ghalat token ko reject nahi kar raha (status $($r.status))" }

Write-Host "`n=== 4. Test doctor login ===" -ForegroundColor Cyan
$email = Read-Host "Test doctor email"
$sec = Read-Host "Test doctor password" -AsSecureString
$pwd = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
$sbUrl = Get-EnvValue $BackendEnv "SUPABASE_URL"
$anon  = Get-EnvValue $BackendEnv "SUPABASE_ANON_KEY"
$jwt = $null
try {
  $login = Invoke-RestMethod -Method Post -Uri "$sbUrl/auth/v1/token?grant_type=password" `
    -Headers @{ apikey = $anon } -ContentType "application/json" `
    -Body (@{ email = $email; password = $pwd } | ConvertTo-Json)
  $jwt = $login.access_token
  Pass "Doctor login ho gaya"
} catch { Fail "Doctor login fail (email/password ya Supabase keys)" }
$pwd = $null

if ($jwt) {
  $auth = @{ Authorization = "Bearer $jwt" }

  Write-Host "`n=== 5. Backend khud theek hai? ===" -ForegroundColor Cyan
  $r = Call "GET" "$BackendUrl/api/v1/patients/$Mrn/history-status" $auth $null
  if ($r.ok) { Pass "Backend history-status: isReturning=$($r.data.isReturning) visits=$($r.data.visitCount)" }
  else {
    Fail "Backend history-status fail (status $($r.status))"
    if (-not $r.ok) { Write-Host "   detail: $($r.detail)" }
  }

  Write-Host "`n=== 6. Agent -> Backend (agent backend se data le sakta hai?) ===" -ForegroundColor Cyan
  $r = Call "POST" "$AgentUrl/v1/history-summary" @{ Authorization = "Bearer $aTok"; "X-User-Token" = $jwt } @{ mrn = $Mrn }
  if ($r.ok) {
    $has = [bool]$r.data.summary
    Pass "Agent chala. isReturning=$($r.data.isReturning), summary mojood=$has"
    if (-not $r.data.isReturning) { Info "Patient naya hai, is liye summary nahi banti (ye theek hai). Purane patient ka MRN try karein." }
  } else {
    Fail "Agent history-summary fail (status $($r.status)). Agent ke terminal mein error dekhein"
    if (-not $r.ok) { Write-Host "   detail: $($r.detail)" }
  }

  Write-Host "`n=== 7. Backend -> Agent (poora chakkar) ===" -ForegroundColor Cyan
  $r = Call "POST" "$BackendUrl/api/v1/patients/$Mrn/summary/generate" $auth $null
  if ($r.ok) { Pass "Backend ne agent ko bulaya aur jawab mila (isReturning=$($r.data.isReturning), summary=$([bool]$r.data.summary))" }
  elseif ($r.status -eq 404) {
    Fail "404: backend mein summary/generate route nahi bana"
    if (-not $r.ok) { Write-Host "   detail: $($r.detail)" }
  }
  elseif ($r.status -eq 502) {
    Fail "502: backend agent tak pahuncha lekin agent fail hua. Agent ke terminal mein wajah dekhein"
    if (-not $r.ok) { Write-Host "   detail: $($r.detail)" }
  }
  else {
    Fail "Backend summary/generate fail (status $($r.status))"
    if (-not $r.ok) { Write-Host "   detail: $($r.detail)" }
  }
}
Write-Host ""