param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9][a-z0-9._-]{0,80}$')]
  [string]$ReleaseTag
)

$ErrorActionPreference = "Stop"
$envFile = Join-Path (Get-Location) ".env.staging"
if (!(Test-Path -LiteralPath $envFile)) {
  throw "Missing .env.staging. Copy .env.staging.example and set private staging values first."
}

$settings = @{}
foreach ($line in Get-Content -LiteralPath $envFile) {
  if ($line -match '^\s*#' -or $line -notmatch '^\s*([^=]+)=(.*)$') { continue }
  $settings[$matches[1].Trim()] = $matches[2].Trim()
}

if ($settings["APP_ENV"] -ne "staging" -or
    $settings["APP_BIND"] -ne "127.0.0.1" -or
    $settings["DEMO_DATA_ENABLED"] -ne "false" -or
    $settings["INVITE_ONLY"] -ne "true" -or
    $settings["RUN_MIGRATIONS"] -ne "false" -or
    $settings["LOAD_DEMO_DATA"] -ne "false" -or
    $settings["APP_ORIGIN"] -notmatch '^https://[^/]+$') {
  throw ".env.staging must use staging mode, loopback binding, HTTPS origin, disabled demos/seeding, invite-only access, and explicit migrations."
}

$env:APP_IMAGE = "afroie-meet:$ReleaseTag"
$env:APP_BUILD_TARGET = "runner"
$compose = @(
  "compose",
  "--profile", "local-staging-https",
  "-p", "afroie-staging",
  "--env-file", $envFile
)

& docker @compose build app
if ($LASTEXITCODE -ne 0) { throw "Staging image build failed." }

& docker @compose run --rm app ./node_modules/.bin/prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "Staging migration failed; the app was not started." }

& docker @compose up -d
if ($LASTEXITCODE -ne 0) { throw "Staging services failed to start." }

$appPort = if ($settings["APP_PORT"]) { $settings["APP_PORT"] } else { "3000" }
$baseUrl = "http://127.0.0.1:$appPort"
$healthy = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 3
    $auth = Invoke-RestMethod -Uri "$baseUrl/api/auth" -TimeoutSec 3
    if ($health.status -eq "ok" -and
        $auth.demoAvailable -eq $false -and
        $auth.inviteRequired -eq $true) {
      $healthy = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 2
  }
}
if (!$healthy) { throw "Staging failed health or invite-only/demo-disabled verification." }

$imageId = & docker image inspect $env:APP_IMAGE --format '{{.Id}}'
if ($LASTEXITCODE -ne 0) { throw "Could not read the built image identity." }
Write-Output "Staging release is healthy: $($env:APP_IMAGE) ($imageId)"
Write-Output "Private local HTTPS endpoint: https://localhost:3443"
