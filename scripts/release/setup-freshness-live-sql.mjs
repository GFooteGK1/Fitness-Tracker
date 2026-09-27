// Reviewed SQL surface shared by fixed local and fixed production transports.
// No arbitrary SQL is accepted from a worker or IPC payload.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateLiveSetupManifest} from './setup-freshness-live-contract.mjs';
import {renderLiveFixtureSql} from './setup-freshness-live-fixtures.mjs';
import {renderLiveAuditSql} from './setup-freshness-live-audit.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
export const LIVE_GATE_READ_SQL="BEGIN READ ONLY; SET LOCAL ROLE postgres; SELECT json_build_object('paused',paused,'generation',generation::text) FROM public.coaching_write_control WHERE singleton; ROLLBACK;";

export function createLiveSqlOperator(input,{query,record}) {
  const manifest=structuredClone(input),v=validateLiveSetupManifest(manifest);
  assert.equal(typeof query,'function');assert.equal(typeof record,'function');
  const allowedPause=new Set([manifest.pausedGeneration,v.expectedOpenGeneration]),reserved=new Set();
  const control=(paused,generation)=>`BEGIN; SET LOCAL ROLE postgres; SET LOCAL statement_timeout='6s';
SELECT json_build_object('paused',paused,'generation',generation::text) FROM public.set_coaching_write_pause(${paused},${generation}::bigint,'Setup live ${manifest.runId}'); COMMIT;`;
  const dispatch=async(name,sql,context={})=>{
    context.signal?.throwIfAborted();
    await record(`${name}-intent`,{sql,sha256:hash(sql)});
    context.signal?.throwIfAborted();
    const result=await query(sql,context);await record(`${name}-result`,result);return result;
  };
  return Object.freeze({
    manifestHash:v.hash,
    readGate:context=>query(LIVE_GATE_READ_SQL,{...context,readOnly:true}),
    readDatabaseTime:context=>query('BEGIN READ ONLY; SELECT to_json(clock_timestamp()); ROLLBACK;',{...context,readOnly:true}),
    readInstalledMigration:context=>query(`BEGIN READ ONLY; SET LOCAL ROLE postgres;
SELECT json_build_object('installed',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations
 WHERE version='20260926010000' AND name='coach_setup_memory_bindings' AND cardinality(statements)=1
 AND encode(sha256(convert_to(statements[1],'UTF8')),'hex')='${manifest.migrationSha256}'),
 'helpersPresent',to_regprocedure('public.assert_coach_setup_memories_current(uuid,jsonb,jsonb)') IS NOT NULL
 AND to_regprocedure('public.coach_setup_memories_current(uuid,jsonb,jsonb)') IS NOT NULL); ROLLBACK;`,{...context,readOnly:true}),
    open:context=>dispatch('operator-open',control(false,manifest.pausedGeneration),context),
    async reservePause({expectedGeneration,signal}) {
      signal?.throwIfAborted();
      assert(allowedPause.has(expectedGeneration),'Unexpected pause generation');
      const sql=control(true,expectedGeneration);
      await record(`operator-pause-${expectedGeneration}-intent`,{sql,sha256:hash(sql)});
      signal?.throwIfAborted();
      reserved.add(expectedGeneration);
    },
    async pause({expectedGeneration,...context}) {
      context.signal?.throwIfAborted();
      assert(reserved.delete(expectedGeneration),'Pause intent must be reserved exactly once');
      const result=await query(control(true,expectedGeneration),context);
      await record(`operator-pause-${expectedGeneration}-result`,result);return result;
    },
    async fixture(payload) {
      const rendered=renderLiveFixtureSql(manifest,payload.step,payload.input);
      assert.equal(payload.manifestHash,v.hash);assert.equal(payload.owner,rendered.owner);
      assert.equal(payload.sha256,rendered.sha256);assert.equal(payload.sql,rendered.sql);
      return dispatch(`fixture-${payload.step}`,rendered.sql,{signal:payload.signal});
    },
    async audit(phase,context={}) {
      assert(['before','after','recovery'].includes(phase));
      return dispatch(`audit-${phase}`,renderLiveAuditSql(manifest),{...context,readOnly:true,timeoutMs:25000});
    },
    async history({owner,planId},context={}) {
      const label=Object.values(manifest.owners).find(x=>x.userId===owner)?.label;
      assert(label&&uuid(planId),'Unexpected synthetic history identity');
      const sql=`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL ROLE postgres;
SELECT json_build_object('plan',(SELECT json_build_object('id',id,'user_id',user_id,'intent',intent,'input_snapshot',input_snapshot) FROM public.training_plan_versions WHERE id='${planId}'::uuid AND user_id='${owner}'::uuid),
 'sessions',(SELECT coalesce(json_agg(json_build_object('id',id,'user_id',user_id,'plan_version_id',plan_version_id,'scheduled_date',scheduled_date,'week_number',week_number,'session_index',session_index,'prescription',prescription) ORDER BY id),'[]'::json)
 FROM public.prescribed_sessions WHERE plan_version_id='${planId}'::uuid AND user_id='${owner}'::uuid)); ROLLBACK;`;
      return dispatch(`history-${label}`,sql,{...context,readOnly:true});
    },
  });
}
