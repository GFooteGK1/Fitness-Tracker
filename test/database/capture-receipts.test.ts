import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { databaseFixture, sqlFile } from './fixture'
let db:PGlite
const owner=randomUUID(), other=randomUUID()
const provenance={schemaVersion:1,occurrence:{origin:'athlete_reported',reviewState:'athlete_confirmed',sourceReferences:[]},fields:{macros:{origin:'model_estimated',reviewState:'corrected',sourceReferences:['text:item-1']}}}
const record={meal_timestamp:'2026-09-17T12:00:00Z',items:[{food:'egg',portion:'1 egg',protein:6,carbs:0,fat:5,calories:69}],total_protein:999,total_carbs:999,total_fat:999,total_calories:999,photo_url:null}
const operation=(sourceItemId='item-1',r:any=record)=>({sourceItemId,kind:'meal',record:r,blocks:[],provenance,inputMethod:'text',eventAt:r.meal_timestamp})
async function actor(id=owner){await db.exec('SET ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id])}
async function call(fn:string,args:any[]){return (await db.query<any>(`SELECT ${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result}
async function freeze(items:any[]=[operation()]){const l=await call('begin_logging_request',[randomUUID(),'a'.repeat(64)]); return {l,items:await call('freeze_logging_request_items',[l.id,items])}}
async function meal(){const f=await freeze();return await call('commit_logging_request_item',[f.items[0].id])}
async function executionFixture(){
 await db.exec('RESET ROLE');const setup=sqlFile('docs/migrations/verify-atomic-coach-session-completion-migration.sql').split('SET LOCAL ROLE authenticated;')[0].replaceAll(', TRUE)',', FALSE)');await db.exec(`${setup}\nCOMMIT;`)
 const setting=async(key:string)=>(await db.query<any>('SELECT current_setting($1) v',['atomic_completion_test.'+key])).rows[0].v
 await actor(await setting('user_1'));return setting
}
function optionalFeedback(outcome='as_planned',rpe:number|null=null){return {schemaVersion:2,feedbackVersion:2,outcome,sessionRpe:rpe,energy:null,pain:null,note:null,provenance:{sessionRpe:{origin:rpe===null?'unknown':'athlete_reported',reviewState:rpe===null?'unreviewed':'athlete_confirmed'},energy:{origin:'unknown',reviewState:'unreviewed'},pain:{origin:'unknown',reviewState:'unreviewed'}}}}
const prescribedWork={mode:'as_prescribed',workoutDate:'2026-09-17',inputText:null,blocks:null,totalDurationMinutes:null}
beforeAll(async()=>{
 db=await databaseFixture()
 await db.exec("ALTER TABLE benchmark_prs ENABLE ROW LEVEL SECURITY; CREATE POLICY capture_test_benchmark_owner ON benchmark_prs TO authenticated USING(user_id=auth.uid()); GRANT SELECT ON benchmark_prs TO authenticated;")
 for(const file of ['coach-system-migration.sql','coach-plan-replacement-migration.sql','coach-complete-programming-v0-3-migration.sql','coach-execution-feedback-migration.sql','layered-adaptive-evidence-migration.sql','atomic-coach-session-completion-migration.sql','qwik-vbt-import-migration.sql','coach-trust-review-migration.sql','rolling-weekly-coach-migration.sql']) await db.exec(sqlFile(`docs/migrations/${file}`))
 for(const file of ['20260728143952_nutrition_fast_logging.sql','20260730130953_coach_workout_runner_v0_5.sql','20260904023000_fix_atomic_session_workout_link.sql','20260904120000_logging_receipts.sql','20260918010000_optional_session_feedback.sql','20260918011000_session_capture_signals.sql']) await db.exec(sqlFile(`supabase/migrations/${file}`))
 await db.exec(sqlFile('docs/migrations/personal-records-migration.sql'))
 await db.exec(sqlFile('supabase/migrations/20260728134202_personal_record_idempotency.sql'))
 const migration=sqlFile('supabase/migrations/20260918020000_capture_receipts.sql');await db.exec(migration);await db.exec(migration)
 await db.query('INSERT INTO auth.users(id) VALUES($1),($2)',[owner,other]);await actor()
},30000)
afterAll(async()=>{await db?.close()})
describe('capture receipts PostgreSQL transitions',()=>{
 it('deletes an observed manual workout while preserving owned immutable measurements and source identity',async()=>{
 const owner=randomUUID();await db.exec('RESET ROLE');await db.query('INSERT INTO auth.users(id) VALUES($1)',[owner]);await actor(owner)
 const raw={workout_date:'2026-09-17',input_text:'Reported squat',blocks:[{block_type:'STRENGTH',movements:[{name:'Squat',reps:5,weight:'80 lb'}]}]}
 const frozen=await freeze([{sourceItemId:'observed-workout',kind:'workout',record:raw,blocks:[{}],provenance,inputMethod:'text',eventAt:raw.workout_date}]);const saved=await call('commit_logging_request_item',[frozen.items[0].id]),group=randomUUID(),value=randomUUID()
 await db.exec('RESET ROLE')
 await db.query(`INSERT INTO performance_observation_groups(id,user_id,workout_id,observation_kind,status,observed_at,captured_at,source_kind,source_system,source_record_id,assessment_definition_id,assessment_catalog_version,protocol_version,parser_version,verification_status,verified_at,comparability_key,comparison_modifiers,metadata)
 VALUES($1,$2,$3,'strength_set','complete',now(),now(),'manual','capture-test',$4,'strength.repetition_max','0.2.0','1.0.0','manual-0.1.0','athlete_confirmed',now(),'comparison:test','{}','{"immutable":"source"}')`,[group,owner,saved.entityId,group])
 await db.query(`INSERT INTO performance_observation_values(id,user_id,group_id,metric_id,semantic_role,value_numeric,unit,status,provenance) VALUES($1,$2,$3,'strength.load','direct_outcome',80,'lb','complete','{}')`,[value,owner,group])
 const original=(await db.query<any>('SELECT * FROM performance_observation_groups WHERE id=$1',[group])).rows[0]
 await expect(db.query('UPDATE performance_observation_groups SET original_workout_id=$1 WHERE id=$2',[randomUUID(),group])).rejects.toThrow('immutable')
 await expect(db.query('UPDATE performance_observation_groups SET workout_id=NULL WHERE id=$1',[group])).rejects.toThrow('immutable')
 await expect(db.query('DELETE FROM workouts WHERE id=$1',[saved.entityId])).rejects.toThrow('audited terminal')
 await actor(other);await expect(call('delete_logged_activity',['workout',saved.entityId,1,randomUUID()])).rejects.toThrow();await actor(owner)
 const key=randomUUID(),removed=await call('delete_logged_activity',['workout',saved.entityId,1,key]);expect(await call('delete_logged_activity',['workout',saved.entityId,1,key])).toEqual(removed)
 const detached=(await db.query<any>('SELECT * FROM performance_observation_groups WHERE id=$1',[group])).rows[0]
 expect(detached).toMatchObject({user_id:owner,workout_id:null,original_workout_id:saved.entityId,status:'excluded',source_workout_invalidation_reason:'canonical_workout_deleted',metadata:original.metadata,observed_at:original.observed_at,verification_status:original.verification_status})
 const terminal=(await db.query<any>('SELECT deleted,original_entity_id,user_id FROM activity_revisions WHERE id=$1',[detached.source_workout_deletion_revision_id])).rows[0];expect(terminal).toEqual({deleted:true,original_entity_id:saved.entityId,user_id:owner})
 expect((await db.query<any>('SELECT value_numeric,status FROM performance_observation_values WHERE id=$1',[value])).rows[0]).toEqual({value_numeric:'80',status:'complete'})
 expect((await db.query('SELECT id FROM workouts WHERE id=$1',[saved.entityId])).rows).toHaveLength(0)
 await actor(other);expect((await db.query('SELECT id FROM performance_observation_groups WHERE id=$1',[group])).rows).toHaveLength(0)
 await actor()
 })
 it('captures planned completion atomically and replays the initial receipt after execution amendment',async()=>{
 const setting=await executionFixture(),session=await setting('session_as_prescribed'),key=randomUUID(),feedback=optionalFeedback()
 const args=[session,'completed',feedback,'2026-09-17T12:00:00Z',key,prescribedWork,[]]
 const saved=await call('record_coach_session_capture',args)
 expect(saved.result.replayed).toBe(false);expect(saved.receipt).toMatchObject({entityId:saved.result.workout_id,revision:1,inputMethod:'program',eventAt:'2026-09-17',eventPrecision:'date'})
 expect(saved.receipt.provenance.fields.quantities.origin).toBe('copied_template');expect(saved.receipt.provenance.fields.rpe).toMatchObject({origin:'legacy_unknown',reviewState:'unreviewed'})
 const snap=(await db.query<any>('SELECT * FROM activity_revisions WHERE original_entity_id=$1',[saved.result.workout_id])).rows[0];expect(snap.revision).toBe(1);expect(snap.record.reported_rpe).toBeNull();expect(snap.record.capture_provenance).toEqual(saved.receipt.provenance)
 const correction={workout_date:'2026-09-17',input_text:'Correct actual reps',blocks:[{block_type:'STRENGTH',movements:[{name:'Squat',reps:5,weight:'80 lb'}]}]}
 await call('amend_program_execution',[saved.result.workout_id,1,randomUUID(),correction,[{}],provenance])
 const replay=await call('record_coach_session_capture',args);expect(replay.result.replayed).toBe(true);expect(replay.receipt).toEqual(saved.receipt)
 await expect(call('record_coach_session_capture',[...args.slice(0,2),{...feedback,note:'changed'},...args.slice(3)])).rejects.toThrow()
 await actor(other);await expect(call('record_coach_session_capture',args)).rejects.toThrow();await actor()
 })
 it('preserves explicit modified work and fractional RPE without promoting absent feedback',async()=>{
 const setting=await executionFixture(),session=await setting('session_modified')
 const work={...prescribedWork,mode:'modified',inputText:'Five actual squats',blocks:[{block_type:'STRENGTH',movements:[{name:'Squat',reps:5,weight:'80 lb'}]}],totalDurationMinutes:20}
 const saved=await call('record_coach_session_capture',[session,'completed',optionalFeedback('modified',7.5),'2026-09-17T12:00:00Z',randomUUID(),work,[]])
 expect(saved.receipt.provenance.fields).toMatchObject({blocks:{origin:'athlete_reported'},quantities:{origin:'athlete_reported'},rpe:{origin:'athlete_reported',reviewState:'athlete_confirmed'},duration:{origin:'athlete_reported'}})
 const snap=(await db.query<any>('SELECT record FROM activity_revisions WHERE original_entity_id=$1',[saved.result.workout_id])).rows[0].record;expect(snap.reported_rpe).toBe(7.5);expect(snap.rpe).toBeNull()
 expect((await db.query<any>('SELECT responses FROM coach_checkins WHERE id=$1',[saved.result.checkin_id])).rows[0].responses.pain).toBeNull();await actor()
 })
 it('returns no fabricated receipt for skipped or pre-wrapper completion and rejects v1 at the new entry point',async()=>{
 const setting=await executionFixture(),session=await setting('session_as_prescribed'),key=randomUUID(),args=[session,'completed',optionalFeedback(),'2026-09-17T12:00:00Z',key,prescribedWork,[]]
 await db.query('SELECT * FROM record_coach_session_result_v2($1,$2,$3,$4,$5,$6,$7)',args)
 const historical=await call('record_coach_session_capture',args);expect(historical.receipt).toBeNull()
 await call('save_activity_draft',['session-capture:'+historical.result.checkin_id,null,null,operation(),false])
 await expect(call('record_coach_session_capture',args)).rejects.toThrow('identity conflict')
 const skipped=await call('record_coach_session_capture',[await setting('session_skipped'),'skipped',optionalFeedback('skipped'),'2026-09-17T12:00:00Z',randomUUID(),null,[]]);expect(skipped.result.session_status).toBe('skipped');expect(skipped.receipt).toBeNull()
 await expect(call('record_coach_session_capture',[...args.slice(0,2),{schemaVersion:1},...args.slice(3)])).rejects.toThrow('requires feedback v2')
 expect((await db.query('SELECT id FROM activity_revisions')).rows).toHaveLength(0)
 expect((await db.query<any>("SELECT has_function_privilege('service_role','record_coach_session_capture(uuid,text,jsonb,timestamp with time zone,text,jsonb,jsonb)','EXECUTE') allowed")).rows[0].allowed).toBe(false);await actor()
 })
 it('rolls back the canonical completion when initial capture snapshot fails',async()=>{
 const setting=await executionFixture(),session=await setting('session_as_prescribed');await db.exec('RESET ROLE')
 await db.exec("CREATE FUNCTION capture_test_reject_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'snapshot unavailable'; END $$; CREATE TRIGGER capture_test_reject_snapshot BEFORE INSERT ON activity_revisions FOR EACH ROW EXECUTE FUNCTION capture_test_reject_snapshot();")
 await actor(await setting('user_1'))
 await expect(call('record_coach_session_capture',[session,'completed',optionalFeedback(),'2026-09-17T12:00:00Z',randomUUID(),prescribedWork,[]])).rejects.toThrow('snapshot unavailable')
 expect((await db.query<any>('SELECT completed_workout_id,status FROM prescribed_sessions WHERE id=$1',[session])).rows[0]).toEqual({completed_workout_id:null,status:'planned'})
 expect((await db.query('SELECT id FROM workouts')).rows).toHaveLength(0);expect((await db.query('SELECT id FROM coach_checkins')).rows).toHaveLength(0)
 await db.exec('RESET ROLE');await db.exec('DROP TRIGGER capture_test_reject_snapshot ON activity_revisions; DROP FUNCTION capture_test_reject_snapshot();');await actor()
 })
 it('freezes once, replays exact receipts, recomputes meal totals and retains estimate origin',async()=>{
 const f=await freeze();const result=await call('commit_logging_request_item',[f.items[0].id]);expect(result.schemaVersion).toBe(2);expect(result.provenance).toEqual(provenance)
 expect(await call('commit_logging_request_item',[f.items[0].id])).toEqual(result)
 expect((await call('freeze_logging_request_items',[f.l.id,[operation()]]))[0].receipt).toEqual(result)
 const m=(await db.query<any>('SELECT total_protein,capture_revision FROM meals WHERE id=$1',[result.entityId])).rows[0];expect(Number(m.total_protein)).toBe(6);expect(m.capture_revision).toBe(1)
 expect((await db.query('SELECT id FROM activity_revisions WHERE original_entity_id=$1',[result.entityId])).rows).toHaveLength(1)
 })
 it('rejects changed payload, ordering and additions after freeze',async()=>{
 const f=await freeze();await expect(call('freeze_logging_request_items',[f.l.id,[operation('other')]])).rejects.toThrow('different operations');await expect(call('freeze_logging_request_items',[f.l.id,[operation(),operation('second')]])).rejects.toThrow('different operations')
 })
 it('keeps distinct same-food occurrences and per-child partial state',async()=>{
 const f=await freeze([operation(),operation('second')]);const first=await call('commit_logging_request_item',[f.items[0].id]);await db.exec('RESET ROLE');await db.query("UPDATE activity_drafts SET expires_at=now()-interval '1 day' WHERE id=$1",[f.items[1].draft_id]);await actor();await expect(call('commit_logging_request_item',[f.items[1].id])).rejects.toThrow('expired');expect(await call('commit_logging_request_item',[f.items[0].id])).toEqual(first)
 const g=await freeze([operation(),operation('second')]);const ids=await Promise.all(g.items.map((x:any)=>call('commit_logging_request_item',[x.id])));expect(ids[0].entityId).not.toBe(ids[1].entityId)
 })
 it('amends once with immutable revisions and rejects stale edits',async()=>{
 const m=await meal(),key=randomUUID(),changed={...record,items:[{...record.items[0],protein:12}]};const a=await call('amend_logged_activity',['meal',m.entityId,1,key,changed,[],provenance]);expect(a.revision).toBe(2);expect(await call('amend_logged_activity',['meal',m.entityId,1,key,changed,[],provenance])).toEqual(a)
 await expect(call('amend_logged_activity',['meal',m.entityId,1,randomUUID(),record,[],provenance])).rejects.toThrow('revision changed')
 const rs=(await db.query<any>('SELECT revision,record FROM activity_revisions WHERE original_entity_id=$1 ORDER BY revision',[m.entityId])).rows;expect(rs).toHaveLength(2);expect(Number(rs[0].record.total_protein)).toBe(6);expect(Number(rs[1].record.total_protein)).toBe(12)
 })
 it('deletes canonical data but retains detached owned snapshots and replay',async()=>{
 const m=await meal(),key=randomUUID();const receipt=await call('delete_logged_activity',['meal',m.entityId,1,key]);expect(receipt.deleted).toBe(true);expect(await call('delete_logged_activity',['meal',m.entityId,1,key])).toEqual(receipt)
 expect((await db.query('SELECT id FROM meals WHERE id=$1',[m.entityId])).rows).toHaveLength(0)
 const rs=(await db.query<any>('SELECT meal_id,user_id,deleted FROM activity_revisions WHERE original_entity_id=$1 ORDER BY revision',[m.entityId])).rows;expect(rs).toEqual([{meal_id:null,user_id:owner,deleted:false},{meal_id:null,user_id:owner,deleted:true}])
 })
 it('enforces owner reads and RPC/column grant boundaries',async()=>{
 const f=await freeze();await actor(other);expect((await db.query('SELECT id FROM logging_request_items WHERE id=$1',[f.items[0].id])).rows).toHaveLength(0);await expect(call('commit_logging_request_item',[f.items[0].id])).rejects.toThrow('Unknown');await actor()
 for(const table of ['activity_drafts','activity_revisions','logging_request_items','activity_mutations']){const permissions=(await db.query<any>("SELECT has_table_privilege('authenticated',$1,'INSERT,UPDATE,DELETE') direct,has_table_privilege('service_role',$1,'INSERT,UPDATE,DELETE') service",[table])).rows[0];expect(permissions).toEqual({direct:false,service:false})}
 expect((await db.query<any>("SELECT has_table_privilege('authenticated','meals','UPDATE,DELETE') p")).rows[0].p).toBe(false)
 await db.exec('SET ROLE anon');await expect(call('freeze_logging_request_items',[f.l.id,[operation()]])).rejects.toThrow('permission denied');await actor()
 })
 it('keeps draft editing separate from frozen operation identity',async()=>{
 const d=await call('save_activity_draft',[randomUUID(),null,null,operation(),false]);expect(d.status).toBe('draft');const changed=await call('save_activity_draft',[randomUUID(),d.id,1,operation('edited'),false]);expect(changed.revision).toBe(2);await expect(call('save_activity_draft',[randomUUID(),d.id,1,operation(),false])).rejects.toThrow('revision changed')
 const f=await freeze();await expect(call('save_activity_draft',[randomUUID(),f.items[0].draft_id,1,operation('edited'),false])).rejects.toThrow('Frozen')
 })
 it('recomputes corrected workout block projections and supported PR histories without unit inference',async()=>{
 const factual={...provenance,fields:{quantities:{origin:'athlete_reported',reviewState:'athlete_confirmed',sourceReferences:[]}}}
 const blocks=(weight:number)=>[{block_type:'STRENGTH',title:'Squat',rx_status:'rx',movements:[{name:'Squat',reps:5,weight:`${weight} lb`}],segments:[{rounds:1,events:[{movement_name:'Squat',performed:{reps:5,load:{value:weight,unit:'lb'}}}]}]}]
 const workout=async(weight:number)=>{const r={workout_date:'2026-09-17',input_text:'Squat',blocks:blocks(weight),rpe:null,reported_rpe:7.5};const f=await freeze([{sourceItemId:'workout',kind:'workout',record:r,blocks:[{block_type:'STRENGTH',is_pr:true,tonnage_lb:99999}],provenance:factual,inputMethod:'text',eventAt:'2026-09-17T12:00:00Z'}]);return await call('commit_logging_request_item',[f.items[0].id])}
 const w1=await workout(100),w2=await workout(150)
 expect((await db.query<any>("SELECT value FROM personal_records WHERE workout_id=$1 AND exercise='Squat' AND pr_type='weight'",[w2.entityId])).rows.map(x=>Number(x.value))).toEqual([150])
 const changed={workout_date:'2026-09-18',input_text:'Corrected load',blocks:blocks(80),rpe:null,reported_rpe:7.5}
 await call('amend_logged_activity',['workout',w2.entityId,1,randomUUID(),changed,[{}],factual])
 const score=(await db.query<any>('SELECT tonnage_lb,is_pr,rx_status FROM block_scores WHERE workout_id=$1',[w2.entityId])).rows[0];expect(Number(score.tonnage_lb)).toBe(400);expect(score.is_pr).toBe(false);expect(score.rx_status).toBe('rx')
 const prs=(await db.query<any>("SELECT value,workout_id FROM personal_records WHERE user_id=$1 AND exercise='Squat' AND pr_type='weight'",[owner])).rows;expect(prs.map(x=>Number(x.value))).toEqual([100]);expect(prs[0].workout_id).toBe(w1.entityId)
 const snap=(await db.query<any>('SELECT record FROM activity_revisions WHERE original_entity_id=$1 AND revision=2',[w2.entityId])).rows[0].record;expect(snap.reported_rpe).toBe(7.5)
 const unknown={...changed,blocks:[{block_type:'STRENGTH',movements:[{name:'Squat',reps:'5-8',weight:'80'}]}]};await call('amend_logged_activity',['workout',w2.entityId,2,randomUUID(),unknown,[{}],factual]);const n=(await db.query<any>('SELECT total_reps,tonnage_lb FROM block_scores WHERE workout_id=$1',[w2.entityId])).rows[0];expect(n).toEqual({total_reps:null,tonnage_lb:null})
 })
 it('recomputes a known benchmark time direction and withholds ambiguous assertions',async()=>{
 const factual={...provenance,fields:{quantities:{origin:'athlete_reported',reviewState:'corrected',sourceReferences:[]}}}
 const make=async(time:number,date:string)=>{const r={workout_date:date,blocks:[{block_type:'FOR_TIME',title:'Fran',rx_status:'RX',score:{time_s:time}}]};const f=await freeze([{sourceItemId:'w',kind:'workout',record:r,blocks:[{}],provenance:factual,inputMethod:'text',eventAt:date+'T12:00:00Z'}]);return call('commit_logging_request_item',[f.items[0].id])}
 const a=await make(300,'2026-09-01'),b=await make(250,'2026-09-02');await db.exec('RESET ROLE');await db.query("INSERT INTO benchmark_prs(user_id,benchmark_name,date,score_value,workout_id,rx_status) VALUES($1,'Fran','2026-09-02',250,$2,'RX')",[owner,b.entityId]);await actor()
 await call('amend_logged_activity',['workout',b.entityId,1,randomUUID(),{workout_date:'2026-09-02',blocks:[{block_type:'FOR_TIME',title:'Fran',rx_status:'RX',score:{time_s:350}}]},[{}],factual])
 const prs=(await db.query<any>("SELECT score_value,workout_id FROM benchmark_prs WHERE user_id=$1 AND benchmark_name='Fran'",[owner])).rows;expect(prs.map(x=>Number(x.score_value))).toEqual([300]);expect(prs[0].workout_id).toBe(a.entityId)
 })
 it('preserves accepted execution links and original feedback while superseding only its projection',async()=>{
 await db.exec('RESET ROLE')
 const setup=sqlFile('docs/migrations/verify-atomic-coach-session-completion-migration.sql').split('SET LOCAL ROLE authenticated;')[0].replaceAll(', TRUE)',', FALSE)');await db.exec(`${setup}\nCOMMIT;`)
 const get=async(k:string)=>(await db.query<any>('SELECT current_setting($1) v',[k])).rows[0].v
 const executionOwner=await get('atomic_completion_test.user_1'),session=await get('atomic_completion_test.session_as_prescribed');await actor(executionOwner)
 const f={schemaVersion:2,feedbackVersion:2,outcome:'as_planned',sessionRpe:null,energy:null,pain:null,note:null,provenance:{sessionRpe:{origin:'unknown',reviewState:'unreviewed'},energy:{origin:'unknown',reviewState:'unreviewed'},pain:{origin:'unknown',reviewState:'unreviewed'}}}
 const done=(await db.query<any>("SELECT * FROM record_coach_session_result_v2($1,'completed',$2,'2026-09-17T12:00:00Z',$3,$4,'[]')",[session,f,randomUUID(),{mode:'as_prescribed',workoutDate:'2026-09-17',inputText:null,blocks:null,totalDurationMinutes:null}])).rows[0]
 const prior=(await db.query<any>('SELECT prescription,completed_workout_id FROM prescribed_sessions WHERE id=$1',[session])).rows[0]
 const r={workout_date:'2026-09-17',input_text:'Actually performed five reps',blocks:[{block_type:'STRENGTH',movements:[{name:'Squat',reps:5,weight:'80 lb'}]}]}
 await expect(call('amend_logged_activity',['workout',done.workout_id,1,randomUUID(),r,[{}],provenance])).rejects.toThrow('dedicated')
 await expect(call('delete_logged_activity',['workout',done.workout_id,1,randomUUID()])).rejects.toThrow('dedicated')
 const amended=await call('amend_program_execution',[done.workout_id,1,randomUUID(),r,[{}],provenance]);expect(amended.revision).toBe(2)
 expect((await db.query<any>('SELECT prescription,completed_workout_id FROM prescribed_sessions WHERE id=$1',[session])).rows[0]).toEqual(prior)
 expect((await db.query('SELECT id FROM coach_checkins WHERE id=$1',[done.checkin_id])).rows).toHaveLength(1)
 const audit=(await db.query<any>('SELECT execution_supersession FROM activity_revisions WHERE original_entity_id=$1 AND revision=2',[done.workout_id])).rows[0].execution_supersession;expect(audit.originalCheckinIds).toContain(done.checkin_id);expect(audit.acceptedPrescription).toEqual(prior.prescription)
 await actor()
 })

 it('cannot bypass frozen child identity through the old save or finish RPC',async()=>{
 const f=await freeze();await expect(call('save_logged_activity',['meal',record,[],f.l.id,null])).rejects.toThrow('original child');await expect(call('finish_logging_request',[f.l.id,{ok:true},200])).rejects.toThrow('unresolved')
 const receipt=await call('commit_logging_request_item',[f.items[0].id]);await call('finish_logging_request',[f.l.id,{ok:true},200]);expect(await call('commit_logging_request_item',[f.items[0].id])).toEqual(receipt)
 const legacy=await call('begin_logging_request',[randomUUID(),'a'.repeat(64)]);const id=await call('save_logged_activity',['meal',record,[],legacy.id,{analysisStatus:'complete'}]);expect(id).toBeTruthy();expect((await call('begin_logging_request',[legacy.request_key,'a'.repeat(64)])).status).toBe('complete')
 })
 it.each([
 ['invalid provenance',{provenance:{...provenance,fields:{macros:{origin:'measured',reviewState:'corrected',sourceReferences:[]}}}}],
 ['raw nested photo',{record:{...record,items:[{...record.items[0],base64:'raw bytes'}]}}],
 ['forged identity',{record:{...record,user_id:other}}],
 ['forged canonical metadata',{record:{...record,capture_input_method:'program'}}],
 ['unsupported recommendation',{recommendationId:randomUUID()}],
 ['non-finite macro',{record:{...record,items:[{...record.items[0],protein:'NaN'}]}}],
 ])('rejects %s without persisting drafts',async(_name,change)=>{
 const l=await call('begin_logging_request',[randomUUID(),'a'.repeat(64)]);await expect(call('freeze_logging_request_items',[l.id,[{...operation(),...change}]])).rejects.toBeTruthy();expect((await db.query('SELECT id FROM logging_request_items WHERE request_id=$1',[l.id])).rows).toHaveLength(0)
 })
 it('rejects cross-owner canonical references even for an internal database writer',async()=>{
 const m=await meal();await db.exec('RESET ROLE');await expect(db.query("INSERT INTO activity_drafts(user_id,kind,normalized,provenance,input_method,event_at,meal_id) VALUES($1,'meal','{}','{}','text',now(),$2)",[other,m.entityId])).rejects.toThrow('foreign key');await actor()
 })
 it('keeps immutable audit grants narrow including private legacy helpers',async()=>{
 for(const fn of ['capture_snapshot(text,uuid,uuid,boolean,jsonb,jsonb,timestamp with time zone,text)','save_logged_activity_legacy_capture(text,jsonb,jsonb,uuid,jsonb)','mutate_capture_activity(text,uuid,integer,text,jsonb,jsonb,jsonb,boolean,boolean)']){
 const row=(await db.query<any>("SELECT has_function_privilege('authenticated',$1,'EXECUTE') a,has_function_privilege('service_role',$1,'EXECUTE') s,has_function_privilege('anon',$1,'EXECUTE') n",[fn])).rows[0];expect(row).toEqual({a:false,s:false,n:false})}
 const rls=(await db.query<any>("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('activity_drafts','activity_revisions','logging_request_items','activity_mutations')")).rows;expect(rls).toHaveLength(4);expect(rls.every(x=>x.relrowsecurity&&x.relforcerowsecurity)).toBe(true)
 })
 it('uses real capture timestamps and preserves immutable original event time after a same-day correction',async()=>{
 const r={workout_date:'2000-01-01',blocks:[{block_type:'CARDIO'}]};const f=await freeze([{sourceItemId:'event',kind:'workout',record:r,blocks:[{}],provenance,inputMethod:'manual',eventAt:'2000-01-01T19:30:00Z'}]);const receipt=await call('commit_logging_request_item',[f.items[0].id]);await call('amend_logged_activity',['workout',receipt.entityId,1,randomUUID(),r,[{}],provenance]);const rows=(await db.query<any>('SELECT event_at,captured_at FROM activity_revisions WHERE original_entity_id=$1 ORDER BY revision',[receipt.entityId])).rows;expect(rows.every(x=>new Date(x.event_at).toISOString()==='2000-01-01T19:30:00.000Z')).toBe(true);expect(rows.every(x=>new Date(x.captured_at).getUTCFullYear()>2000)).toBe(true)
 })
 it('cascades drafts, detached history, mutations and request items on account deletion',async()=>{
 await db.exec('RESET ROLE');const disposable=randomUUID();await db.query('INSERT INTO auth.users(id) VALUES($1)',[disposable]);await actor(disposable);const m=await meal();await call('delete_logged_activity',['meal',m.entityId,1,randomUUID()]);await db.exec('RESET ROLE');await db.query('DELETE FROM auth.users WHERE id=$1',[disposable]);for(const table of ['activity_drafts','activity_revisions','activity_mutations','logging_request_items','logging_requests']) expect((await db.query(`SELECT id FROM ${table} WHERE user_id=$1`,[disposable])).rows).toHaveLength(0);await actor()
 })

 it('commits the original standalone draft once and binds later retries to its request',async()=>{
 const d=await call('save_activity_draft',[randomUUID(),null,null,operation(),false]);const l=await call('begin_logging_request',[randomUUID(),'a'.repeat(64)]);const receipt=await call('commit_activity_draft',[d.id,1,l.id]);expect(await call('commit_activity_draft',[d.id,1,l.id])).toEqual(receipt)
 const saved=(await db.query<any>('SELECT status,original_entity_id FROM activity_drafts WHERE id=$1',[d.id])).rows[0];expect(saved).toEqual({status:'committed',original_entity_id:receipt.entityId});const newLedger=await call('begin_logging_request',[randomUUID(),'a'.repeat(64)]);await expect(call('commit_activity_draft',[d.id,1,newLedger.id])).rejects.toThrow('another request')
 })
 it('commits an analysis correction draft as an amendment without creating another meal',async()=>{
 const m=await meal();const proposed={...operation(),record:{...record,items:[{...record.items[0],protein:9}]},response:{correction:{entityId:m.entityId,expectedRevision:1}}};const d=await call('save_activity_draft',[randomUUID(),null,null,proposed,false]);const l=await call('begin_logging_request',[randomUUID(),'a'.repeat(64)]);const receipt=await call('commit_activity_draft',[d.id,1,l.id]);expect(receipt.entityId).toBe(m.entityId);expect(receipt.revision).toBe(2);expect((await db.query<any>('SELECT total_protein FROM meals WHERE id=$1',[m.entityId])).rows[0].total_protein).toBe('9.00');expect(await call('commit_activity_draft',[d.id,1,l.id])).toEqual(receipt)
 })
 it('marks date-only events and rejects timestamp/local-date contradictions',async()=>{
 const base={sourceItemId:'date',kind:'workout',record:{workout_date:'2026-09-17',blocks:[{block_type:'CARDIO'}]},blocks:[{}],provenance,inputMethod:'manual',eventAt:'2026-09-17',eventPrecision:'date'};const f=await freeze([base]);const receipt=await call('commit_logging_request_item',[f.items[0].id]);expect(receipt.eventAt).toBe('2026-09-17');expect(receipt.eventPrecision).toBe('date');const row=(await db.query<any>('SELECT event_precision FROM activity_revisions WHERE original_entity_id=$1',[receipt.entityId])).rows[0];expect(row.event_precision).toBe('date')
 const amended=await call('amend_logged_activity',['workout',receipt.entityId,1,randomUUID(),base.record,[{}],provenance]);expect(amended.eventAt).toBe('2026-09-17');expect(amended.projectionsStatus).toBe('recomputed_supported_only')
 await expect(freeze([{...base,eventAt:'2026-09-18'}])).rejects.toThrow('local scope');await expect(freeze([{...base,eventAt:'2026-09-18T01:00:00Z',eventPrecision:'timestamp'}])).rejects.toThrow('local scope');const timezone=await freeze([{...base,eventAt:'2026-09-18T01:00:00Z',eventPrecision:'timestamp',eventTimezoneOffset:300}]);expect(timezone.items).toHaveLength(1)
 })
 it('preserves source review time and owned template reference without fresh review invention',async()=>{
 const m=await meal();const reviewed='2020-01-01T12:00:00Z',r={...record,entry_method:'quick_log',source_meal_id:m.entityId,reviewed_at:reviewed};const f=await freeze([operation('template',r)]);const receipt=await call('commit_logging_request_item',[f.items[0].id]);const saved=(await db.query<any>('SELECT source_meal_id,entry_method,reviewed_at FROM meals WHERE id=$1',[receipt.entityId])).rows[0];expect(saved.source_meal_id).toBe(m.entityId);expect(saved.entry_method).toBe('quick_log');expect(new Date(saved.reviewed_at).toISOString()).toBe('2020-01-01T12:00:00.000Z')
 await actor(other);await expect(freeze([operation('forged',r)])).rejects.toThrow('Unknown source meal');await actor()
 })

 it('never reports retry-safe no-write after a committed amendment lost its response',async()=>{
 const m=await meal(),l=await call('begin_logging_request',[randomUUID(),'a'.repeat(64)]);const amended=await call('amend_logged_activity',['meal',m.entityId,1,l.id,record,[],provenance]);const finished=await call('finish_logging_request',[l.id,{error:'Transport interrupted',retrySafe:true},503]);expect(finished.retryAllowed).toBe(false);expect(finished.receipts).toEqual([amended]);expect(finished.savedEntities).toEqual([{kind:'meal',id:m.entityId}])
 })
 it('explicit draft commit confirms occurrence only and preserves estimated composition',async()=>{
 const proposed={...operation(),provenance:{...provenance,occurrence:{origin:'legacy_unknown',reviewState:'unreviewed',sourceReferences:['draft']}}};const d=await call('save_activity_draft',[randomUUID(),null,null,proposed,false]);const l=await call('begin_logging_request',[randomUUID(),'a'.repeat(64)]);const receipt=await call('commit_activity_draft',[d.id,1,l.id]);expect(receipt.provenance.occurrence).toEqual({origin:'athlete_reported',reviewState:'athlete_confirmed',sourceReferences:['draft']});expect(receipt.provenance.fields).toEqual(provenance.fields);expect(await call('commit_activity_draft',[d.id,1,l.id])).toEqual(receipt)
 })

 it('explicit cancellation proves no-write even after expiry and prevents all future original commits',async()=>{
 const f=await freeze();await db.exec('RESET ROLE');await db.query("UPDATE activity_drafts SET expires_at=now()-interval '1 day' WHERE id=$1",[f.items[0].draft_id]);await actor();const proof=await call('cancel_logging_request_item',[f.items[0].id]);expect(proof).toMatchObject({operationId:f.items[0].id,state:'canceled',noWriteConfirmed:true});expect(await call('cancel_logging_request_item',[f.items[0].id])).toEqual(proof);await expect(call('commit_logging_request_item',[f.items[0].id])).rejects.toThrow('explicitly canceled')
 const finished=await call('finish_logging_request',[f.l.id,{error:'Canceled for review',retrySafe:true},409]);expect(finished.retryAllowed).toBe(true);const state=(await call('freeze_logging_request_items',[f.l.id,[operation()]]))[0];expect(state.status).toBe('canceled');expect(state.receipt).toBeNull();expect(state.cancellation).toEqual(proof)
 })
 it('commit winning the lock order cannot be canceled and its original receipt stays replayable',async()=>{
 const f=await freeze();const receipt=await call('commit_logging_request_item',[f.items[0].id]);await expect(call('cancel_logging_request_item',[f.items[0].id])).rejects.toThrow('already committed');expect(await call('commit_logging_request_item',[f.items[0].id])).toEqual(receipt)
 })
 it('partial cancellation retains saved children and cannot declare the whole request safe to duplicate',async()=>{
 const f=await freeze([operation(),operation('two'),operation('three')]);const receipt=await call('commit_logging_request_item',[f.items[0].id]);await call('cancel_logging_request_item',[f.items[1].id]);await expect(call('finish_logging_request',[f.l.id,{retrySafe:true},409])).rejects.toThrow('unresolved');await call('cancel_logging_request_item',[f.items[2].id]);const finished=await call('finish_logging_request',[f.l.id,{retrySafe:true},409]);expect(finished.retryAllowed).toBe(false);expect(finished.savedEntities).toEqual([{kind:'meal',id:receipt.entityId}]);expect(await call('commit_logging_request_item',[f.items[0].id])).toEqual(receipt)
 await actor(other);await expect(call('cancel_logging_request_item',[f.items[1].id])).rejects.toThrow('Unknown');await actor()
 })

})
