/** Offline fixed-file plan. Execution is a separate, guarded local-only operator. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
export const supervisedMigrationFiles = [
  '20260930010000_supervised_programming_review.sql',
  '20260930020000_supervised_programming_lifecycle.sql',
  '20260930030000_supervised_programming_workspace.sql',
  '20260930040000_supervised_resource_scope.sql',
  '20261003134727_supervised_request_resolution.sql',
  '20261003150403_supervised_issue_closure_preflight.sql',
]
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sha = value => createHash('sha256').update(value).digest('hex')
// Verified against maintained predecessor migrations and the retained PG17
// target. Normalize source line endings only; preserve every other character.
export const supervisedPredecessors = [
  ['accept_adaptation_proposal(uuid,text)','3f329206286083b1ea1e350c31058e9a','authenticated'],
  ['assert_reviewed_execution_active(uuid,uuid,uuid)','92c8889eb40b660b85da69d8fed44e8b',''],
  ['assert_reviewed_registration_current(uuid,boolean)','066a1f6e0dc30ce6113e1c17a3a8868b',''],
  ['complete_reviewed_session(uuid,text,jsonb)','da59aee71be44f069db22fcceb274155','authenticated'],
  ['create_registered_reviewed_week_proposal(uuid,text)','932af867ee9a126d063f69e3b9ccae65','authenticated'],
  ['guard_closed_reviewed_proposal_request()','516882465a50e5169810a64af643db6b',''],
  ['guard_reviewed_proposal_disabled()','d7299a6c7d74bacb5cbe826641c18cbc',''],
  ['record_reviewed_session_set(uuid,text,jsonb)','4ccc67ca0e6f9e3204a175d84df905b4','authenticated'],
  ['register_reviewed_week_proposal(uuid,jsonb,text)','fa2cf8cb2cf8ee778ffc66f336dec433','service_role'],
  ['resolve_reviewed_proposal_request(uuid,text,text,jsonb)','32c0462d9b787d9fe708ec9a08201f8b','authenticated'],
  ['resolve_reviewed_session_request(uuid,text,text,jsonb)','a77cd64f68745713adedf09de5ad1183','authenticated'],
]
export function buildSupervisedMigrationPlan() { return buildFixedPlan('supervised') }
export function buildLocalPausePrerequisitePlan() { return buildFixedPlan('pause') }
export function buildLocalIssueClosurePlan() { return buildFixedPlan('issue_closure') }
function buildFixedPlan(kind) {
  const fixedFiles = kind === 'pause' ? ['20260923010000_coaching_write_pause.sql'] : kind === 'issue_closure' ? ['20261003150403_supervised_issue_closure_preflight.sql'] : supervisedMigrationFiles
  const predecessors = kind === 'issue_closure' ? [['create_registered_reviewed_week_proposal(uuid,text)','1836cb9dc320f8f38b4ed90076e83967','authenticated']] : supervisedPredecessors
  const files = fixedFiles.map(name => {
    const bytes = readFileSync(path.join(root, 'supabase/migrations', name))
    const source = bytes.toString('utf8').replace(/\r\n/g, '\n').trim()
    if ((source.match(/^BEGIN;$/gm) ?? []).length !== 1 || (source.match(/^COMMIT;$/gm) ?? []).length !== 1
      || !source.endsWith('COMMIT;')) throw new Error(`Expected one migration transaction: ${name}`)
    return { name, sha256: sha(bytes), body: source.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '') }
  })
  const sql = `BEGIN;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='60s';
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR current_setting('server_version_num')::integer/10000<>17 THEN RAISE EXCEPTION 'Unexpected local database'; END IF;
 ${kind === 'pause' ? `IF to_regclass('public.coaching_write_control') IS NOT NULL OR to_regprocedure('public.assert_coaching_writes_open()') IS NOT NULL
   OR to_regprocedure('public.set_coaching_write_pause(boolean,bigint,text)') IS NOT NULL THEN RAISE EXCEPTION 'Pause prerequisite already or partially installed; inspect before replay'; END IF;`
 : kind === 'issue_closure' ? `IF to_regprocedure('public.resolve_supervised_request(jsonb)') IS NULL
   OR to_regprocedure('public.create_registered_reviewed_week_proposal_before_supervision(uuid,text)') IS NULL THEN RAISE EXCEPTION 'Supervised closure prerequisite missing'; END IF;`
 : `IF to_regprocedure('public.complete_reviewed_session(uuid,text,jsonb)') IS NULL
   OR to_regclass('public.coach_reviewed_proposal_resolutions') IS NULL THEN RAISE EXCEPTION 'Reviewed lifecycle prerequisite missing'; END IF;
 IF to_regclass('public.coach_supervised_programs') IS NOT NULL
   OR to_regprocedure('public.get_supervised_resource_scope(text,uuid)') IS NOT NULL
   OR to_regprocedure('public.resolve_supervised_request(jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Supervised batch already or partially applied; inspect instead of replaying'; END IF;
 IF to_regclass('public.coaching_write_control') IS NULL OR to_regprocedure('public.assert_coaching_writes_open()') IS NULL THEN RAISE EXCEPTION 'Coaching pause prerequisite missing'; END IF;`}
END $guard$;
${kind !== 'pause' ? `DO $predecessors$ DECLARE item record; function_oid oid; actual_acl text[]; expected_acl text[]; BEGIN
 FOR item IN SELECT * FROM (VALUES ${predecessors.map(([signature,digest,role]) => `('${signature}','${digest}','${role}')`).join(',\n')}) AS pinned(signature,digest,api_role) LOOP
  function_oid:=to_regprocedure('public.'||item.signature);
  IF function_oid IS NULL OR md5(replace(pg_get_functiondef(function_oid),E'\\r\\n',E'\\n'))<>item.digest
    OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=function_oid)<>'postgres' THEN
   RAISE EXCEPTION 'Reviewed predecessor definition changed: %',item.signature;
  END IF;
  SELECT ARRAY(SELECT coalesce(r.rolname,'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE p.oid=function_oid ORDER BY 1) INTO actual_acl;
  SELECT ARRAY(SELECT x FROM unnest(ARRAY['postgres:EXECUTE:false']||CASE WHEN item.api_role='' THEN ARRAY[]::text[] ELSE ARRAY[item.api_role||':EXECUTE:false'] END) x ORDER BY x) INTO expected_acl;
  IF actual_acl IS DISTINCT FROM expected_acl THEN RAISE EXCEPTION 'Reviewed predecessor privileges changed: %',item.signature; END IF;
 END LOOP;
END $predecessors$;` : ''}
CREATE TEMP TABLE supervised_before(schema_name text,table_name text,row_count bigint,digest text) ON COMMIT DROP;
DO $snapshot$ DECLARE item record; n bigint; h text; BEGIN
 FOR item IN SELECT ns.nspname,cl.relname FROM pg_class cl JOIN pg_namespace ns ON ns.oid=cl.relnamespace
   WHERE cl.relkind='r' AND (ns.nspname='public' OR (ns.nspname='auth' AND cl.relname='users')) ORDER BY ns.nspname,cl.relname LOOP
  EXECUTE format('SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY md5(to_jsonb(t)::text)),'''')) FROM %I.%I t',item.nspname,item.relname) INTO n,h;
  INSERT INTO supervised_before VALUES(item.nspname,item.relname,n,h);
 END LOOP;
END $snapshot$;
${files.map(f => `-- Pinned migration: ${f.name}\n${f.body}`).join('\n')}
DO $preserve$ DECLARE item record; n bigint; h text; BEGIN
 FOR item IN SELECT * FROM supervised_before LOOP
  EXECUTE format('SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY md5(to_jsonb(t)::text)),'''')) FROM %I.%I t',item.schema_name,item.table_name) INTO n,h;
  IF n IS DISTINCT FROM item.row_count OR h IS DISTINCT FROM item.digest THEN RAISE EXCEPTION 'Existing data changed in %.%',item.schema_name,item.table_name; END IF;
 END LOOP;
 ${kind === 'supervised' ? `IF EXISTS(SELECT 1 FROM coach_supervised_programs) OR EXISTS(SELECT 1 FROM coach_supervised_enrollments)
   OR EXISTS(SELECT 1 FROM coach_supervised_candidates) OR EXISTS(SELECT 1 FROM coach_supervised_request_resolutions) THEN RAISE EXCEPTION 'Migration introduced athlete enrollment/data'; END IF;`
 : kind === 'issue_closure' ? `IF md5(replace(pg_get_functiondef('public.create_registered_reviewed_week_proposal(uuid,text)'::regprocedure),E'\\r\\n',E'\\n'))='1836cb9dc320f8f38b4ed90076e83967' THEN RAISE EXCEPTION 'Closure correction not installed'; END IF;`
 : `IF (SELECT count(*) FROM public.coaching_write_control)<>1 OR NOT EXISTS(SELECT 1 FROM public.coaching_write_control WHERE singleton AND NOT paused AND generation=0)
   OR (SELECT count(*) FROM pg_trigger WHERE tgname='coaching_write_pause' AND NOT tgisinternal)<>6 THEN RAISE EXCEPTION 'Pause prerequisite verification failed'; END IF;`}
END $preserve$;
SELECT schema_name,table_name,row_count,digest FROM supervised_before ORDER BY schema_name,table_name;
NOTIFY pgrst,'reload schema';
COMMIT;
`
  return { sql, manifest: { schemaVersion: 1, kind, target: 'supabase_db_sociusfit-programming-local', machine: 'sociusfit-local',
    database: 'postgres', api: 'http://127.0.0.1:55321', files: files.map(({ name,sha256 }) => ({ name,sha256 })), sqlSha256: sha(sql) } }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3 || (process.argv[2] && !['--hash-only','--prepare-pause','--pause-hash-only','--prepare-issue-closure','--issue-closure-hash-only'].includes(process.argv[2]))) throw new Error('Unexpected preparation mode')
  const plan = process.argv[2]?.includes('pause') ? buildLocalPausePrerequisitePlan() : process.argv[2]?.includes('issue-closure') ? buildLocalIssueClosurePlan() : buildSupervisedMigrationPlan(), runId = randomUUID()
  if (process.argv[2]?.includes('hash-only')) { console.log(plan.manifest.sqlSha256); process.exit(0) }
  const directory = path.join(root,'output/app-quality-release',`${plan.manifest.kind}-migration-${runId}`)
  mkdirSync(directory)
  writeFileSync(path.join(directory,'plan.sql'),plan.sql,{ flag:'wx' })
  writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({ ...plan.manifest,runId },null,2),{ flag:'wx' })
  console.log(JSON.stringify({ directory,sqlSha256:plan.manifest.sqlSha256,files:plan.manifest.files }))
}
