// Read-only aggregate audit; no athlete rows leave PostgreSQL. A difference
// means investigation is required, never permission to restore athlete state.
import {isDeepStrictEqual} from 'node:util';
import {validateLiveSetupManifest} from './setup-freshness-live-contract.mjs';
export const LIVE_AUDIT_TABLES=Object.freeze(['training_programs','training_plan_versions','prescribed_sessions',
  'adaptation_proposals','coach_weekly_reviews','coach_weekly_review_observations','coach_memories','coach_context_revisions']);
const check=(ok,code)=>{if(!ok)throw Error(code);};
export function renderLiveAuditSql(manifest) {
  const validated=validateLiveSetupManifest(manifest),owners=Object.values(manifest.owners).map(o=>`'${o.userId}'::uuid`).join(',');
  const parts=LIVE_AUDIT_TABLES.map(table=>`SELECT '${table}' AS name,count(*)::text AS rows,
 encode(sha256(convert_to(coalesce(string_agg(digest,'' ORDER BY digest),''),'UTF8')),'hex') AS sha256
 FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') digest FROM public.${table} t WHERE user_id NOT IN (${owners})) hashes`);
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL ROLE postgres;
SET LOCAL statement_timeout='20s';
SET LOCAL row_security=off;
SET LOCAL search_path=pg_catalog;
WITH summaries AS (${parts.join('\nUNION ALL\n')})
SELECT jsonb_build_object('schema','setup-live-audit-1','manifestHash','${validated.hash}',
 'readOnly',current_setting('transaction_read_only'),'observedAt',clock_timestamp(),
 'control',(SELECT jsonb_build_object('paused',paused,'generation',generation::text) FROM public.coaching_write_control WHERE singleton),
 'tables',(SELECT jsonb_agg(to_jsonb(s) ORDER BY name) FROM summaries s));
ROLLBACK;
`;
}
export function compareLiveAudits(manifest,before,after,containment) {
  const v=validateLiveSetupManifest(manifest);
  check(containment?.manifestHash===v.hash&&containment.containmentVerified===true&&containment.workerStoppedVerified===true&&containment.pauseBoundaryVerified===true,'audit_containment');
  const canonical=snapshot=>{
    check(snapshot?.schema==='setup-live-audit-1'&&snapshot.manifestHash===v.hash&&snapshot.readOnly==='on','audit_identity');
    check(snapshot.control?.paused===true,'audit_requires_pause');
    check(Array.isArray(snapshot.tables)&&snapshot.tables.length===LIVE_AUDIT_TABLES.length,'audit_tables');
    const sorted=[...snapshot.tables].sort((a,b)=>a.name.localeCompare(b.name));
    check(sorted.map(x=>x.name).join(',')===[...LIVE_AUDIT_TABLES].sort().join(','),'audit_table_scope');
    check(sorted.every(x=>typeof x.rows==='string'&&/^\d+$/.test(x.rows)&&/^[a-f0-9]{64}$/.test(x.sha256)),'audit_digest');
    return sorted;
  };
  const a=canonical(before),b=canonical(after);
  check(before.control.generation===manifest.pausedGeneration&&after.control.generation===v.expectedClosedGeneration,'audit_generation');
  const started=Date.parse(before.observedAt),ended=Date.parse(after.observedAt);
  check(Number.isFinite(started)&&Number.isFinite(ended)&&ended>=started,'audit_order');
  const changedTables=a.filter((x,i)=>!isDeepStrictEqual(x,b[i])).map(x=>x.name);
  return Object.freeze({globalHistoryVerified:changedTables.length===0,changedTables,
    outcome:changedTables.length===0?'unchanged':'inconclusive_non_synthetic_changes'});
}
