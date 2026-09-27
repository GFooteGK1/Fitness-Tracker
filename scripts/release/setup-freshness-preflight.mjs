// Pure read-only SQL and classifier. No transport, credentials, export or mutation.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { SETUP_PREDECESSORS, SETUP_MIGRATION } from './setup-freshness-install.mjs';
import { CUTOVER_MIGRATIONS, cutoverCatalogSql } from './cutover-migrations.mjs';

const reference=JSON.parse(fs.readFileSync(new URL('../../docs/verification/programming-quality/setup-freshness-local-release-2026-09-26.json',import.meta.url),'utf8'));
const catalog=JSON.parse(fs.readFileSync(new URL('./cutover-migrations.expected.json',import.meta.url),'utf8')).snapshots.revision;
// The approved workout release stored a transformed copy of its source in the
// ledger: JS replacement-string expansion collapsed four $$ delimiters to $.
// Pin the independently reproduced historical record, never the rehearsal copy.
// See docs/verification/programming-quality/workout-ledger-provenance-2026-09-27.md.
export const WORKOUT_RECOVERY_LEDGER=Object.freeze({version:'20260926120000',name:'workout_save_recovery',
  sha256:'c7319057d6d0d56d9135940d0b603442c43374468bb7218b357593a200ae92c6'});
const literal=value=>`'${value.replaceAll("'","''")}'`;
export const SETUP_PREFLIGHT_SQL=`-- Target must be verified independently: Supabase auolnfwetmfcwhtvakzy.
-- Metadata, row counts and digests only. No athlete content or application RPCs.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL ROLE postgres;
SET LOCAL row_security=off;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='5s';
WITH boundary AS (${cutoverCatalogSql('revision').replace(/;\s*$/,'')}),
signatures(signature) AS (VALUES ${SETUP_PREDECESSORS.map(s=>`(${literal(s)})`).join(',')}), functions AS (
 SELECT s.signature,p.oid IS NOT NULL present,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,
 md5(pg_get_functiondef(p.oid)) raw_md5,
 md5(replace(pg_get_functiondef(p.oid),E'\\r\\n',E'\\n')) lf_md5,
 (SELECT jsonb_object_agg(r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE')) FROM pg_roles r
  WHERE r.rolname IN ('anon','authenticated','service_role')) execute
 FROM signatures s LEFT JOIN pg_proc p ON p.oid=to_regprocedure(s.signature)
), ledger AS (
 SELECT version,name,cardinality(statements) statements,encode(sha256(convert_to(statements[1],'UTF8')),'hex') sha256
 FROM supabase_migrations.schema_migrations WHERE version IN ('20260921010000','20260923010000','20260926010000','20260926120000')
), accepted AS (
 SELECT id,md5(intent::text||input_snapshot::text) digest FROM public.training_plan_versions WHERE status IN ('accepted','superseded')
), sessions AS (
 SELECT s.id,md5(s.prescription::text) digest FROM public.prescribed_sessions s JOIN accepted a ON a.id=s.plan_version_id
)
SELECT jsonb_build_object('format','setup-freshness-preflight-1','observedAt',clock_timestamp(),
 'database',current_database(),'role',current_user,'version',current_setting('server_version_num'),
 'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),'rowSecurity',current_setting('row_security'),
 'ledger',(SELECT jsonb_agg(to_jsonb(l) ORDER BY version) FROM ledger l),
 'newerLedger',(SELECT coalesce(jsonb_agg(version ORDER BY version),'[]'::jsonb) FROM supabase_migrations.schema_migrations WHERE version>'20260926120000'),
 'boundary',(SELECT cutover_catalog FROM boundary),
 'functions',(SELECT jsonb_agg(to_jsonb(f) ORDER BY signature) FROM functions f),
 'setupHelpersAbsent',to_regprocedure('public.assert_coach_setup_memories_current(uuid,jsonb,jsonb)') IS NULL
   AND to_regprocedure('public.coach_setup_memories_current(uuid,jsonb,jsonb)') IS NULL,
 'control',(SELECT jsonb_build_object('paused',paused,'generation',generation::text) FROM public.coaching_write_control WHERE singleton),
 'workoutRpeType',(SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='workouts' AND column_name='rpe'),
 'accepted',jsonb_build_object('plans',(SELECT count(*) FROM accepted),'sessions',(SELECT count(*) FROM sessions),
   'planDigest',(SELECT md5(coalesce(string_agg(id::text||':'||digest,',' ORDER BY id),'')) FROM accepted),
   'sessionDigest',(SELECT md5(coalesce(string_agg(id::text||':'||digest,',' ORDER BY id),'')) FROM sessions))) AS setup_release_preflight;
ROLLBACK;
`;
export const SETUP_PREFLIGHT_QUERY_SHA256=createHash('sha256').update(SETUP_PREFLIGHT_SQL).digest('hex');

export function classifySetupPreflight(value, {projectRef,verifiedTarget,now=Date.now()}={}) {
  const checks={};
  checks.target=projectRef==='auolnfwetmfcwhtvakzy'&&verifiedTarget===true;
  checks.identity=value?.format==='setup-freshness-preflight-1'&&value.database==='postgres'&&value.role==='postgres'&&value.version==='170006';
  checks.readOnly=value?.readOnly==='on'&&value?.isolation==='repeatable read'&&value?.rowSecurity==='off';
  const observed=Date.parse(value?.observedAt);
  checks.fresh=Number.isFinite(observed)&&observed<=now+5000&&now-observed<=300000;
  checks.guardAbsent=value?.setupHelpersAbsent===true;
  // Full reviewed pause/revision functions, ACLs, control schema, RLS and trigger topology.
  checks.boundary=isDeepStrictEqual(value?.boundary,catalog);
  checks.control=value?.control?.paused===false&&typeof value.control.generation==='string'&&/^(0|[1-9]\d*)$/.test(value.control.generation);
  checks.workoutRpe=value?.workoutRpeType==='numeric';
  const wanted=[CUTOVER_MIGRATIONS.revision,CUTOVER_MIGRATIONS.pause,WORKOUT_RECOVERY_LEDGER];
  checks.ledger=Array.isArray(value?.ledger)&&value.ledger.length===3&&wanted.every(w=>value.ledger.filter(r=>r.version===w.version&&r.name===w.name&&r.statements===1&&r.sha256===w.sha256).length===1);
  checks.noNewerMigration=Array.isArray(value?.newerLedger)&&value.newerLedger.length===0;
  const rows=Array.isArray(value?.functions)?value.functions:[];
  checks.predecessors=rows.length===3&&SETUP_PREDECESSORS.every(signature=>{
    const matches=rows.filter(r=>r.signature===signature), r=matches[0];
    const expected=reference.predecessors.predecessors.find(p=>p.signature===signature);
    const security=catalog.functions.find(f=>signature.startsWith(`public.${f.proname}(`));
    return matches.length===1&&r.present===true&&r.lf_md5===expected.md5&&/^[a-f0-9]{32}$/.test(r.raw_md5??'')
      &&r.owner===security.owner&&r.prosecdef===security.prosecdef
      &&JSON.stringify(r.proconfig)===JSON.stringify(security.proconfig)
      &&['anon','authenticated','service_role'].every(role=>r.execute?.[role]===security.execute[role]);
  });
  const a=value?.accepted;
  checks.accepted=!!a&&['plans','sessions'].every(k=>Number.isSafeInteger(a[k])&&a[k]>=0)
    &&['planDigest','sessionDigest'].every(k=>typeof a[k]==='string'&&/^[a-f0-9]{32}$/.test(a[k]));
  const failedChecks=Object.keys(checks).filter(k=>!checks[k]);
  return {passed:failedChecks.length===0,checks,failedChecks,querySha256:SETUP_PREFLIGHT_QUERY_SHA256,
    candidateMigrationSha256:SETUP_MIGRATION.sha256,
    // Raw hashes remain the renderer's transaction fence; normalized values only establish source equivalence.
    ...(failedChecks.length===0?{predecessors:rows.map(r=>({signature:r.signature,md5:r.raw_md5})),observedGeneration:value.control.generation}:{}),
    limitations:['Read-only preflight only; no rollout authority','Pause generation and raw hashes must be refreshed at actual installation','Aggregate accepted digests are a baseline, not proof that a later deployment preserves history']};
}
