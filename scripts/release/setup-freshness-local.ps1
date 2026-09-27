param([ValidateSet('Start', 'Status')][string]$Action = 'Status')

# Fixed, separate synthetic target. Never stops/resets the existing local stack.
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$platform = [IO.Path]::GetFullPath((Join-Path $repo '../programming-quality/output/app-quality-release'))
$output = Join-Path $repo 'output/setup-freshness-release'
$project = Join-Path $output 'local-supabase'
$projectId = 'sociusfit-setup-freshness-local'
$podmanDir = Join-Path $platform 'tools/podman-5.8.3/podman-5.8.3/usr/bin'
$podman = Join-Path $podmanDir 'podman.exe'
$supabase = Join-Path $platform 'tools/supabase-2.117.0/supabase.exe'
$configPath = Join-Path $project 'supabase/config.toml'
$ports = @(55421,55422,55423,55424)
foreach ($file in @($podman,$supabase)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Existing local platform tool missing' }
}
if (Test-Path -LiteralPath (Join-Path $project 'supabase/.temp/project-ref')) { throw 'Refusing a linked project' }
if ($Action -eq 'Start' -and -not (Test-Path -LiteralPath $configPath)) {
  $occupied = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in @(55420,55421,55422,55423,55424,55427,55429) })
  if ($occupied.Count) { throw 'Rehearsal ports are already occupied' }
  $source = Get-Content -LiteralPath (Join-Path $platform 'local-supabase/supabase/config.toml') -Raw
  if ($source -notmatch '(?m)^project_id = "sociusfit-programming-local"\s*$') { throw 'Unexpected source configuration' }
  $config = $source.Replace('sociusfit-programming-local',$projectId).Replace('5532','5542')
  New-Item -ItemType Directory -Path (Split-Path $configPath) -Force | Out-Null
  [IO.File]::WriteAllText($configPath,$config,[Text.UTF8Encoding]::new($false))
}
if (-not (Test-Path -LiteralPath $configPath)) { throw 'Run Start to prepare the isolated local project' }
$config = Get-Content -LiteralPath $configPath -Raw
if ($config -notmatch '(?m)^project_id = "sociusfit-setup-freshness-local"\s*$' -or $config -match '5532[0-9]') { throw 'Unexpected rehearsal configuration' }
# No automatic migration or seed files may accompany container initialization.
foreach ($directory in @('migrations','seeds')) {
  if (Test-Path -LiteralPath (Join-Path $project "supabase/$directory")) { throw 'Refusing automatic database inputs' }
}
$saved = @{}
$variables = @{ PATH="$podmanDir;$env:PATH"; DOCKER_HOST='npipe:////./pipe/podman-sociusfit-local'; CONTAINER_CONNECTION='sociusfit-local'; SUPABASE_ACCESS_TOKEN=''; OPENAI_API_KEY=''; ANTHROPIC_API_KEY='' }
try {
  foreach ($name in $variables.Keys) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name,'Process')
    [Environment]::SetEnvironmentVariable($name,$variables[$name],'Process')
  }
  $rootless = & $podman --connection sociusfit-local info --format '{{.Host.Security.Rootless}}'
  if ($LASTEXITCODE -ne 0 -or $rootless.Trim() -ne 'true') { throw 'Existing rootless connection unavailable' }
  & $podman --connection sociusfit-local network inspect sociusfit-local-net *> (Join-Path $output 'network.private.json')
  if ($LASTEXITCODE -ne 0) { throw 'Existing local network unavailable' }
  if ($Action -eq 'Start') {
    # This installed CLI requires its empty Studio bind-mount directory to exist.
    New-Item -ItemType Directory -Path (Join-Path $project 'supabase/snippets') -Force | Out-Null
    # Windows PowerShell 5.1 wraps ordinary native stderr as NativeCommandError.
    # Preserve that output in the private log and judge the process exit code.
    $ErrorActionPreference = 'Continue'
    & $supabase start --workdir $project --network-id sociusfit-local-net *> (Join-Path $output 'supabase-start.private.log')
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0) { throw 'Isolated stack start failed; inspect the private local log' }
  }
  $container = @(& $podman --connection sociusfit-local inspect "supabase_db_$projectId" | ConvertFrom-Json)[0]
  if ($LASTEXITCODE -ne 0 -or -not $container.State.Running -or $container.Config.Labels.'com.supabase.cli.project' -ne $projectId -or $container.Config.Labels.'com.supabase.cli.workdir' -ne $project) { throw 'Rehearsal container identity mismatch' }
  $listeners = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in $ports })
  if (@($listeners | Where-Object { $_.LocalAddress -notin @('127.0.0.1','::1') }).Count -or @($listeners.LocalPort | Select-Object -Unique).Count -ne 4) { throw 'Expected four loopback-only rehearsal listeners' }
  $ErrorActionPreference = 'Continue'
  $statusOutput = & $supabase status --workdir $project --output json 2> (Join-Path $output 'supabase-status.private.log')
  $ErrorActionPreference = 'Stop'
  if ($LASTEXITCODE -ne 0) { throw 'Local status capture failed' }
  # Keep Node-readable UTF-8 under both Windows PowerShell5.1 and PowerShell7.
  [IO.File]::WriteAllText((Join-Path $output 'local-supabase-status.private.json'),($statusOutput -join "`n"),[Text.UTF8Encoding]::new($false))
  $status = Get-Content -LiteralPath (Join-Path $output 'local-supabase-status.private.json') -Raw | ConvertFrom-Json
  $database = [Uri]$status.DB_URL
  if ($status.API_URL -ne 'http://127.0.0.1:55421' -or $database.Host -ne '127.0.0.1' -or $database.Port -ne 55422) { throw 'Local endpoint mismatch' }
  $version = & $podman --connection sociusfit-local exec "supabase_db_$projectId" psql -X -qAt -U postgres -d postgres -c 'SHOW server_version_num'
  if ($LASTEXITCODE -ne 0 -or [int]$version -lt 170000 -or [int]$version -ge 180000) { throw 'Expected real PostgreSQL 17' }
  Write-Output "Verified isolated $projectId; PostgreSQL $version; API 127.0.0.1:55421; DB 127.0.0.1:55422; loopback-only."
} finally {
  foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
}
