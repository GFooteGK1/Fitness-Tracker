# Applies one fixed W5 migration to the existing synthetic container.
# No hosted connection, reset, bootstrap replay, volume deletion or secret output.
param([ValidateSet('SetReports','Completion','SetupFreshness','ProposalRegistration','ExecutionSlots','NextWeek','RegistrationRecovery','RequestResolution','ProposalResolution','QualitativeRecovery','EffortRir')][string]$Stage = 'SetReports')
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$podman = Join-Path $repo 'output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe'
$migrationName = switch ($Stage) {
  'Completion' { '20260928020000_reviewed_session_completion.sql' }
  'SetupFreshness' { '20260926010000_coach_setup_memory_bindings.sql' }
  'ProposalRegistration' { '20260928030000_reviewed_proposal_registration.sql' }
  'ExecutionSlots' { '20260928040000_reviewed_execution_slots.sql' }
  'NextWeek' { '20260928050000_reviewed_next_week_transition.sql' }
  'RegistrationRecovery' { '20260928060000_reviewed_registration_recovery.sql' }
  'RequestResolution' { '20260928070000_reviewed_session_request_resolution.sql' }
  'ProposalResolution' { '20260928080000_reviewed_proposal_resolution.sql' }
  'QualitativeRecovery' { '20260928090000_reviewed_qualitative_recovery.sql' }
  'EffortRir' { '20260929010000_reviewed_effort_rir.sql' }
  default { '20260928010000_reviewed_session_set_reports.sql' }
}
$migration = Join-Path $repo ('supabase/migrations/' + $migrationName)
& (Join-Path $PSScriptRoot 'local-supabase.ps1') -Action Status
if ($LASTEXITCODE -ne 0) { throw 'Local stack verification failed' }
$container = 'supabase_db_sociusfit-programming-local'
$inspection = & $podman --connection sociusfit-local inspect $container | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $inspection[0].Config.Labels.'com.supabase.cli.project' -ne 'sociusfit-programming-local') { throw 'Unexpected local container' }
$preflight = @'
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR current_setting('server_version_num')::integer/10000<>17 THEN RAISE EXCEPTION 'Unexpected local database'; END IF;
 IF to_regclass('public.coach_context_revisions') IS NULL THEN RAISE EXCEPTION 'Expected existing coaching schema'; END IF;
 IF to_regclass('public.coach_reviewed_set_reports') IS NOT NULL THEN RAISE EXCEPTION 'Migration already applied; do not replay'; END IF;
END $guard$;
'@
if ($Stage -eq 'Completion') {
  $preflight = @'
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR current_setting('server_version_num')::integer/10000<>17 THEN RAISE EXCEPTION 'Unexpected local database'; END IF;
 IF to_regclass('public.coach_reviewed_set_reports') IS NULL THEN RAISE EXCEPTION 'Expected existing reviewed set schema'; END IF;
 IF to_regprocedure('public.complete_reviewed_session(uuid,text,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Migration already applied; do not replay'; END IF;
END $guard$;
'@
}
if ($Stage -eq 'ProposalRegistration') {
  $preflight = @'
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR current_setting('server_version_num')::integer/10000<>17 THEN RAISE EXCEPTION 'Unexpected local database'; END IF;
 IF to_regprocedure('public.complete_reviewed_session(uuid,text,jsonb)') IS NULL THEN RAISE EXCEPTION 'Expected existing reviewed completion schema'; END IF;
 IF to_regprocedure('public.assert_coach_setup_memories_current(uuid,jsonb,jsonb)') IS NULL THEN RAISE EXCEPTION 'Apply setup-freshness prerequisite first'; END IF;
 IF to_regclass('public.coach_reviewed_proposal_registrations') IS NOT NULL THEN RAISE EXCEPTION 'Migration already applied; do not replay'; END IF;
END $guard$;
'@
}
if ($Stage -eq 'ExecutionSlots') {
  $preflight = @'
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR current_setting('server_version_num')::integer/10000<>17 THEN RAISE EXCEPTION 'Unexpected local database'; END IF;
 IF to_regclass('public.coach_reviewed_proposal_registrations') IS NULL THEN RAISE EXCEPTION 'Expected existing reviewed registration schema'; END IF;
 IF to_regclass('public.coach_reviewed_execution_slots') IS NOT NULL THEN RAISE EXCEPTION 'Migration already applied; do not replay'; END IF;
END $guard$;
'@
}
if ($Stage -eq 'SetupFreshness') {
  $preflight = @'
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR current_setting('server_version_num')::integer/10000<>17 THEN RAISE EXCEPTION 'Unexpected local database'; END IF;
 IF to_regclass('public.coach_context_revisions') IS NULL THEN RAISE EXCEPTION 'Expected existing coaching revision schema'; END IF;
 IF to_regprocedure('public.assert_coach_setup_memories_current(uuid,jsonb,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Migration already applied; do not replay'; END IF;
END $guard$;
'@
}
if ($Stage -eq 'NextWeek') {
  $preflight = @'
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR current_setting('server_version_num')::integer/10000<>17 THEN RAISE EXCEPTION 'Unexpected local database'; END IF;
 IF to_regclass('public.coach_reviewed_execution_slots') IS NULL THEN RAISE EXCEPTION 'Expected existing reviewed execution schema'; END IF;
 IF to_regprocedure('public.assert_reviewed_week_transition(jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Migration already applied; do not replay'; END IF;
END $guard$;
'@
}
if ($Stage -eq 'RegistrationRecovery') {
  $preflight = @'
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR current_setting('server_version_num')::integer/10000<>17 THEN RAISE EXCEPTION 'Unexpected local database'; END IF;
 IF to_regprocedure('public.assert_reviewed_week_transition(jsonb)') IS NULL THEN RAISE EXCEPTION 'Expected existing next-week schema'; END IF;
 IF to_regprocedure('public.get_reviewed_week_registration(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'Migration already applied; do not replay'; END IF;
END $guard$;
'@
}
if ($Stage -eq 'RequestResolution') {
  $preflight = @'
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR current_setting('server_version_num')::integer/10000<>17 THEN RAISE EXCEPTION 'Unexpected local database'; END IF;
 IF to_regprocedure('public.get_reviewed_week_registration(uuid)') IS NULL THEN RAISE EXCEPTION 'Expected existing registration recovery schema'; END IF;
 IF to_regclass('public.coach_reviewed_request_resolutions') IS NOT NULL OR to_regprocedure('public.resolve_reviewed_session_request(uuid,text,text,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Migration already applied; do not replay'; END IF;
END $guard$;
'@
}
if ($Stage -eq 'ProposalResolution') {
  $preflight = @'
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR current_setting('server_version_num')::integer/10000<>17 THEN RAISE EXCEPTION 'Unexpected local database'; END IF;
 IF to_regprocedure('public.resolve_reviewed_session_request(uuid,text,text,jsonb)') IS NULL THEN RAISE EXCEPTION 'Expected existing session resolution schema'; END IF;
 IF to_regclass('public.coach_reviewed_proposal_resolutions') IS NOT NULL OR to_regprocedure('public.resolve_reviewed_proposal_request(uuid,text,text,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Migration already applied; do not replay'; END IF;
END $guard$;
'@
}
$migrationSql = Get-Content -LiteralPath $migration -Raw
$postflight = ''
if ($Stage -eq 'QualitativeRecovery') {
  if ((Get-FileHash -LiteralPath $migration -Algorithm SHA256).Hash -ne 'BAD7735DCA6EAB25EF0F9FE0CDF8DFCBB3415F15D2366830E502B206EB7F794B') { throw 'Reviewed migration hash changed' }
  $preflight = @'
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtext('local-reviewed-qualitative-recovery'));
DO $guard$ DECLARE definition text; BEGIN
 IF current_database()<>'postgres' OR current_setting('server_version_num')::integer/10000<>17 THEN RAISE EXCEPTION 'Unexpected local database'; END IF;
 IF to_regprocedure('public.resolve_reviewed_proposal_request(uuid,text,text,jsonb)') IS NULL THEN RAISE EXCEPTION 'Expected existing proposal resolution schema'; END IF;
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conrelid='public.prescribed_sessions'::regclass AND conname='prescribed_sessions_contract_check';
 IF md5(definition) IS DISTINCT FROM '47162cb929eb9c03a9ad8c4f2df5af7f' THEN RAISE EXCEPTION 'Exact local constraint changed; inspect before applying'; END IF;
 IF definition IS NULL OR position('schemaVersion' IN definition)=0 OR position('= ''1''::jsonb' IN definition)=0 OR position('''2''::jsonb' IN definition)>0 THEN RAISE EXCEPTION 'Unexpected or already applied session constraint; do not replay'; END IF;
END $guard$;
CREATE TEMP TABLE recovery_before ON COMMIT DROP AS
 SELECT 'prescribed_sessions' AS name,count(*) AS rows,md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) AS digest FROM public.prescribed_sessions s
 UNION ALL SELECT 'training_plan_versions',count(*),md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) FROM public.training_plan_versions s
 UNION ALL SELECT 'adaptation_proposals',count(*),md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) FROM public.adaptation_proposals s;
'@
  # The reviewed file hash is fixed above. Use one transaction for guard, change
  # and immutable-data comparison; never replay the original bootstrap.
  $migrationSql = $migrationSql -replace '(?m)^BEGIN;\r?\n','' -replace '(?m)^COMMIT;\r?\n?',''
  $postflight = @'
CREATE TEMP TABLE recovery_after ON COMMIT DROP AS
 SELECT 'prescribed_sessions' AS name,count(*) AS rows,md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) AS digest FROM public.prescribed_sessions s
 UNION ALL SELECT 'training_plan_versions',count(*),md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) FROM public.training_plan_versions s
 UNION ALL SELECT 'adaptation_proposals',count(*),md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) FROM public.adaptation_proposals s;
DO $guard$ BEGIN
 IF EXISTS(SELECT * FROM recovery_before EXCEPT SELECT * FROM recovery_after) OR EXISTS(SELECT * FROM recovery_after EXCEPT SELECT * FROM recovery_before) THEN RAISE EXCEPTION 'Existing reviewed data changed'; END IF;
END $guard$;
SELECT name,rows,digest FROM recovery_after ORDER BY name;
COMMIT;
'@
}
if ($Stage -eq 'EffortRir') {
  if ((Get-FileHash -LiteralPath $migration -Algorithm SHA256).Hash -ne '8406D796120A4AF4B06E99916364F42592336828B6C0AB2CA191CE992F35775D') { throw 'Reviewed effort/RIR migration hash changed' }
  if ([regex]::Matches($migrationSql, '(?m)^BEGIN;\r?$').Count -ne 1 -or [regex]::Matches($migrationSql, '(?m)^COMMIT;\r?$').Count -ne 1) { throw 'Expected one migration transaction' }
  $preflight = @'
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtext('local-reviewed-effort-rir'));
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR current_setting('server_version_num')::integer/10000<>17 THEN RAISE EXCEPTION 'Unexpected local database'; END IF;
 IF to_regprocedure('public.resolve_reviewed_proposal_request(uuid,text,text,jsonb)') IS NULL THEN RAISE EXCEPTION 'Expected existing proposal resolution schema'; END IF;
 IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='public.prescribed_sessions'::regclass AND conname='prescribed_sessions_contract_check') IS DISTINCT FROM 'bfb306b6629ee2a35e445458399017d8' THEN RAISE EXCEPTION 'Exact local session constraint changed or migration already applied'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.valid_reviewed_set_report(jsonb)'))) IS DISTINCT FROM 'bdfed7a50d4f1ee48119002e89fd26f2' THEN RAISE EXCEPTION 'Exact local report validator changed or migration already applied'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.complete_reviewed_session(uuid,text,jsonb)'))) IS DISTINCT FROM 'b4a382d53464426d7842fb1ed6a1383e' THEN RAISE EXCEPTION 'Exact local completion function changed or migration already applied'; END IF;
END $guard$;
LOCK TABLE public.prescribed_sessions, public.training_plan_versions, public.adaptation_proposals, public.coach_reviewed_set_reports, public.workouts IN SHARE MODE;
CREATE TEMP TABLE effort_before ON COMMIT DROP AS
 SELECT 'prescribed_sessions' AS name,count(*) AS rows,md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) AS digest FROM public.prescribed_sessions s
 UNION ALL SELECT 'training_plan_versions',count(*),md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) FROM public.training_plan_versions s
 UNION ALL SELECT 'adaptation_proposals',count(*),md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) FROM public.adaptation_proposals s
 UNION ALL SELECT 'coach_reviewed_set_reports',count(*),md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) FROM public.coach_reviewed_set_reports s
 UNION ALL SELECT 'workouts',count(*),md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) FROM public.workouts s;
'@
  $migrationSql = $migrationSql -replace '(?m)^BEGIN;\r?\n','' -replace '(?m)^COMMIT;\r?\n?',''
  $postflight = @'
CREATE TEMP TABLE effort_after ON COMMIT DROP AS
 SELECT 'prescribed_sessions' AS name,count(*) AS rows,md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) AS digest FROM public.prescribed_sessions s
 UNION ALL SELECT 'training_plan_versions',count(*),md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) FROM public.training_plan_versions s
 UNION ALL SELECT 'adaptation_proposals',count(*),md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) FROM public.adaptation_proposals s
 UNION ALL SELECT 'coach_reviewed_set_reports',count(*),md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) FROM public.coach_reviewed_set_reports s
 UNION ALL SELECT 'workouts',count(*),md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY id),'')) FROM public.workouts s;
DO $guard$ BEGIN
 IF EXISTS(SELECT * FROM effort_before EXCEPT SELECT * FROM effort_after) OR EXISTS(SELECT * FROM effort_after EXCEPT SELECT * FROM effort_before) THEN RAISE EXCEPTION 'Existing reviewed data changed'; END IF;
 IF position('''3''::jsonb' IN pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conrelid='public.prescribed_sessions'::regclass AND conname='prescribed_sessions_contract_check')))=0 THEN RAISE EXCEPTION 'Schema3 contract missing'; END IF;
 IF position('effort_repetitions' IN pg_get_functiondef('public.complete_reviewed_session(uuid,text,jsonb)'::regprocedure))=0 THEN RAISE EXCEPTION 'Effort completion missing'; END IF;
END $guard$;
SELECT name,rows,digest FROM effort_after ORDER BY name;
COMMIT;
'@
}
$sql = $preflight + "`n" + $migrationSql + "`n" + $postflight + "`nNOTIFY pgrst, 'reload schema';"
$log = Join-Path $repo ('output/app-quality-release/reviewed-set-migration-' + [guid]::NewGuid().ToString() + '.log')
$sql | & $podman --connection sociusfit-local exec -i $container psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 *> $log
if ($LASTEXITCODE -ne 0) { throw "Local migration failed; inspect $log before retrying" }
[pscustomobject]@{ target=$container; migration=$migration; sha256=(Get-FileHash -LiteralPath $migration -Algorithm SHA256).Hash; log=$log; applied=$true } | ConvertTo-Json
