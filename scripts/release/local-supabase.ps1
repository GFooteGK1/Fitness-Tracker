param([ValidateSet('Start', 'Status', 'Stop')][string]$Action = 'Status')

# Operates only the already-provisioned synthetic local environment. No install,
# hosted linking, migrations, reset, volume deletion, or production credentials.
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$output = Join-Path $repo 'output/app-quality-release'
$project = Join-Path $output 'local-supabase'
$podmanDir = Join-Path $output 'tools/podman-5.8.3/podman-5.8.3/usr/bin'
$podman = Join-Path $podmanDir 'podman.exe'
$supabase = Join-Path $output 'tools/supabase-2.117.0/supabase.exe'
$projectId = 'sociusfit-programming-local'
$machine = 'sociusfit-local'
$network = 'sociusfit-local-net'

foreach ($file in @($podman, $supabase, (Join-Path $project 'supabase/config.toml'))) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Local setup missing: $file" }
}
$config = Get-Content -LiteralPath (Join-Path $project 'supabase/config.toml') -Raw
if ($config -notmatch '(?m)^project_id = "sociusfit-programming-local"\s*$') { throw 'Unexpected local project ID' }
if (Test-Path -LiteralPath (Join-Path $project 'supabase/.temp/project-ref')) { throw 'Refusing a linked project' }

$savedEnvironment = @{}
$variables = @{
  PATH = "$podmanDir;$env:PATH"
  DOCKER_HOST = 'npipe:////./pipe/podman-sociusfit-local'
  CONTAINER_CONNECTION = $machine
  SUPABASE_ACCESS_TOKEN = ''
  OPENAI_API_KEY = ''
  ANTHROPIC_API_KEY = ''
}
try {
  foreach ($name in $variables.Keys) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $variables[$name], 'Process')
  }
  $machines = & $podman machine inspect $machine | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $machines[0].Name -ne $machine) { throw 'Dedicated local machine missing' }
  if ($Action -eq 'Start') {
    if ($machines[0].State -ne 'running') {
      & $podman machine start $machine
      if ($LASTEXITCODE -ne 0) { throw 'Local machine start failed' }
    }
    & $podman --connection $machine network inspect $network *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Dedicated local network missing; inspect setup before creating it' }
    & $supabase start --workdir $project --network-id $network *> (Join-Path $output 'local-supabase-start.log')
    if ($LASTEXITCODE -ne 0) { throw 'Local start failed; inspect ignored local-supabase-start.log' }
  }
  if ($Action -eq 'Stop') {
    # Default stop preserves local data volumes. Never add --no-backup or --all.
    & $supabase stop --workdir $project --project-id $projectId *> (Join-Path $output 'local-supabase-stop.log')
    if ($LASTEXITCODE -ne 0) { throw 'Local stack stop failed; inspect ignored stop log' }
    Write-Output 'Stopped this synthetic Supabase stack; retained its data volumes and Podman machine.'
  } else {
    if ($machines[0].State -ne 'running' -and $Action -ne 'Start') { throw 'Local machine is stopped; use -Action Start' }
    $containerName = "supabase_db_$projectId"
    $containers = & $podman --connection $machine inspect $containerName | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $containers[0].Config.Labels.'com.supabase.cli.project' -ne $projectId) { throw 'Unexpected database container' }
    $listeners = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in @(55321,55322,55323,55324) })
    if (@($listeners | Where-Object { $_.LocalAddress -notin @('127.0.0.1','::1') }).Count) { throw 'Test port is not restricted to loopback; inspect before continuing' }
    if (@($listeners.LocalPort | Select-Object -Unique).Count -ne 4) { throw 'Expected local API/database/Studio/mail listeners are missing' }
    & $podman --connection $machine ps --filter "label=com.supabase.cli.project=$projectId" --format '{{.Names}} {{.Status}}'
    if ($LASTEXITCODE -ne 0) { throw 'Local container status failed' }
    Write-Output 'Local API: http://127.0.0.1:55321'
    Write-Output 'Local Studio: http://127.0.0.1:55323'
    Write-Output 'Local database: 127.0.0.1:55322; host listeners verified loopback-only.'
  }
} finally {
  foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
}
