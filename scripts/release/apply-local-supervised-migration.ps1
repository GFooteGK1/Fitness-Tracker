# Additive synthetic-local batch. Never links, resets, creates users or enables policy.
param([Parameter(Mandatory=$true)][string]$PlanDirectory,[Parameter(Mandatory=$true)][string]$ExpectedSqlSha256)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$allowed = [IO.Path]::GetFullPath((Join-Path $repo 'output/app-quality-release')) + [IO.Path]::DirectorySeparatorChar
$directory = [IO.Path]::GetFullPath($PlanDirectory)
if (-not $directory.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or $ExpectedSqlSha256 -notmatch '^[a-f0-9]{64}$') { throw 'Unexpected plan location/hash' }
$sqlPath = Join-Path $directory 'plan.sql'
$manifest = Get-Content -LiteralPath (Join-Path $directory 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.target -ne 'supabase_db_sociusfit-programming-local' -or $manifest.machine -ne 'sociusfit-local' -or $manifest.database -ne 'postgres' -or $manifest.api -ne 'http://127.0.0.1:55321') { throw 'Unexpected plan target' }
$sqlBytes = [IO.File]::ReadAllBytes($sqlPath)
$hasher = [Security.Cryptography.SHA256]::Create()
try { $capturedHash = [Convert]::ToHexString($hasher.ComputeHash($sqlBytes)).ToLowerInvariant() } finally { $hasher.Dispose() }
$sqlText = [Text.UTF8Encoding]::new($false,$true).GetString($sqlBytes)
if ($manifest.sqlSha256 -cne $ExpectedSqlSha256 -or $capturedHash -cne $ExpectedSqlSha256) { throw 'Plan changed since review' }
$fixedNames = switch ($manifest.kind) {
  'pause' { @('20260923010000_coaching_write_pause.sql') }
  'issue_closure' { @('20261003150403_supervised_issue_closure_preflight.sql') }
  'supervised' { @('20260930010000_supervised_programming_review.sql','20260930020000_supervised_programming_lifecycle.sql','20260930030000_supervised_programming_workspace.sql','20260930040000_supervised_resource_scope.sql','20261003134727_supervised_request_resolution.sql','20261003150403_supervised_issue_closure_preflight.sql') }
  default { throw 'Unexpected fixed migration kind' }
}
if (($manifest.files.name -join ',') -cne ($fixedNames -join ',')) { throw 'Unexpected migration batch' }
foreach ($file in $manifest.files) {
  $source = Join-Path $repo ('supabase/migrations/' + $file.name)
  if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.sha256) { throw 'Migration source changed since review' }
}
$hashMode = switch ($manifest.kind) { 'pause' { '--pause-hash-only' }; 'issue_closure' { '--issue-closure-hash-only' }; default { '--hash-only' } }
$rebuiltHash = & node (Join-Path $PSScriptRoot 'supervised-local-migration-plan.mjs') $hashMode
if ($LASTEXITCODE -ne 0 -or ($rebuiltHash -join '').Trim() -cne $ExpectedSqlSha256) { throw 'Reviewed SQL is not the current fixed migration plan' }
& (Join-Path $PSScriptRoot 'local-supabase.ps1') -Action Status
if ($LASTEXITCODE -ne 0) { throw 'Local target verification failed' }
$podman = Join-Path $repo 'output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe'
$inspection = & $podman --connection sociusfit-local inspect $manifest.target | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $inspection[0].Config.Labels.'com.supabase.cli.project' -ne 'sociusfit-programming-local') { throw 'Unexpected local container' }
$log = Join-Path $directory 'apply.log'
$attempt = Join-Path $directory 'apply-attempt.json'
# CreateNew is the reservation, not a separate existence check. Keep it even
# when the native process fails or its outcome is uncertain.
$stream = [IO.File]::Open($attempt,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try {
  $receipt = [Text.Encoding]::UTF8.GetBytes((@{ target=$manifest.target;sqlSha256=$capturedHash;attemptedAt=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json))
  $stream.Write($receipt,0,$receipt.Length)
  $stream.Flush($true)
} finally { $stream.Dispose() }
$logReservation = [IO.File]::Open($log,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
$logReservation.Dispose()
$sqlText | & $podman --connection sociusfit-local exec -i $manifest.target psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 *> $log
if ($LASTEXITCODE -ne 0) { throw "Migration attempt failed; inspect $log before any retry" }
[PSCustomObject]@{ target=$manifest.target;sqlSha256=$ExpectedSqlSha256;log=$log;applied=$true } | ConvertTo-Json
