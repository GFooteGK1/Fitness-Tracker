import { beforeAll,beforeEach,afterAll,describe,it,expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { confirmedUnwrittenEvent } from '@/app/lib/recommendations/event-recovery'
import { sqlFile } from './fixture'
import { intent,runningOutcome } from '../fixtures/personalized-coaching/intent'
import { recommendationFixture } from './recommendation-fixture'
let db:PGlite
let owner=randomUUID();const other=randomUUID(),runtime='a'.repeat(64)
let date:string,deadline:string
async function actor(id=owner,role='authenticated'){await db.exec(`SET ROLE ${role}`);await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id])}
async function rpc(name:string,args:unknown[]){return(await db.query<any>(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result}
async function claim(id=owner,fp=runtime){await actor(id,'service_role');return rpc('claim_recommendation_refresh',[id,fp,date,0])}
function decision(c:any,patch:any={}){return{schemaVersion:1,kind:'abstain',ruleId:'no_eligible_action',ruleVersion:'1',policyVersion:'bounded-actions-1',runtimeFingerprint:runtime,scopeKey:'today:'+date,evidenceFingerprint:'b'.repeat(64),sourceRevision:c.sourceRevision,responseRevision:c.responseRevision,localDate:date,tzOffset:0,validUntil:deadline,planVersionId:c.activePlanId,intentMemoryId:c.intentMemoryId,intentVersion:c.intentVersion,goalId:null,title:'Current records',reason:'No eligible action',reasonCodes:['no_eligible_action'],missing:[],conflicts:[],destination:null,sources:[],outcome:null,...patch}}
async function publish(c:any,d=decision(c)){await actor(owner,'service_role');return rpc('publish_recommendations',[owner,c.leaseToken,c.sourceRevision,c.responseRevision,d.runtimeFingerprint,date,0,[d],null])}
const provenance={schemaVersion:1,occurrence:{origin:'athlete_reported',reviewState:'athlete_confirmed',sourceReferences:[]},fields:{macros:{origin:'model_estimated',reviewState:'unreviewed',sourceReferences:[]}}}
async function meal(recommendationId?:string){await actor();const l=await rpc('begin_logging_request',[randomUUID(),'d'.repeat(64)]),at=new Date().toISOString();const p={sourceItemId:'meal:1',kind:'meal',record:{meal_timestamp:at,items:[{food:'Egg',portion:'one',protein:6,carbs:0,fat:5,calories:69}]},blocks:[],provenance,inputMethod:'text',eventAt:at,...(recommendationId?{recommendationId}:{})};const rows=await rpc('freeze_logging_request_items',[l.id,[p]]);return {receipt:await rpc('commit_logging_request_item',[rows[0].id]),child:rows[0],ledger:l,p}}
beforeAll(async()=>{db=await recommendationFixture();await db.query('INSERT INTO auth.users(id) VALUES($1),($2)',[owner,other]);const now=(await db.query<any>("SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date::text date,((clock_timestamp() AT TIME ZONE 'UTC')::date+1)::timestamp AT TIME ZONE 'UTC'-interval '1 second' deadline")).rows[0];date=now.date;deadline=new Date(now.deadline).toISOString()},30000)
beforeEach(async()=>{await db.exec('RESET ROLE');owner=randomUUID();await db.query('INSERT INTO auth.users(id) VALUES($1)',[owner])})
afterAll(async()=>{await db?.close()})
describe('W7 real PostgreSQL persistence and fences',()=>{
 it('publishes once, replays exact publication and reads only fresh current scope',async()=>{
 const c=await claim(),d=decision(c),r=await publish(c,d);expect(r.recommendations).toHaveLength(1);expect(await publish(c,d)).toEqual(r)
 expect(await claim()).toBeNull()
 const read=await rpc('read_recommendations',[owner,runtime,date,0]);expect(read.refreshState.pending).toBe(false);expect(read.recommendations[0].decision).toEqual(d)
 expect((await rpc('read_recommendations',[owner,'c'.repeat(64),date,0])).recommendations).toHaveLength(0)
 await expect(publish(c,{...d,title:'Changed'})).rejects.toThrow('replay payload')
 })
 it('invalidates within a canonical save and fences an outstanding computation',async()=>{
 await meal();const c=await claim();await meal();await expect(publish(c)).rejects.toThrow('inputs changed')
 await actor(owner,'service_role');expect(await rpc('fail_recommendation_refresh',[owner,c.leaseToken,c.sourceRevision,c.responseRevision,'source_changed'])).toBe(true)
 const fresh=await claim();expect(fresh.sourceRevision).toBeGreaterThan(c.sourceRevision);await publish(fresh)
 })
 it('fences same-revision lease takeover without letting the old worker clear the new lease',async()=>{
 await meal();const first=await claim();await db.exec('RESET ROLE');await db.query("UPDATE recommendation_refresh_state SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE user_id=$1",[owner]);const next=await claim();expect(next.sourceRevision).toBe(first.sourceRevision);expect(next.leaseToken).not.toBe(first.leaseToken)
 await expect(publish(first)).rejects.toThrow('lease or authority');expect(await rpc('fail_recommendation_refresh',[owner,first.leaseToken,first.sourceRevision,first.responseRevision,'late_worker'])).toBe(false);await publish(next)
 })
 it('denies client publication and foreign reads with narrow grants',async()=>{
 await actor();await expect(rpc('claim_recommendation_refresh',[owner,runtime,date,0])).rejects.toThrow('permission denied')
 for(const table of ['recommendations','recommendation_refresh_state','recommendation_events','recommendation_suppressions','recommendation_publications','logging_coverage_confirmations'])for(const role of ['authenticated','service_role','anon'])expect((await db.query<any>('SELECT has_table_privilege($1,$2,\'INSERT,UPDATE,DELETE\') allowed',[role,table])).rows[0].allowed).toBe(false)
 await actor(other);expect((await db.query('SELECT id FROM recommendations WHERE user_id=$1',[owner])).rows).toHaveLength(0)
 })
})

async function refresh(patch:any={}){await db.exec('RESET ROLE');await db.query('SELECT dirty_recommendations($1)',[owner]);const c=await claim();return (await publish(c,decision(c,patch))).recommendations[0]}
async function read(){await actor(owner,'service_role');return rpc('read_recommendations',[owner,runtime,date,0])}
const action={kind:'collect_signal',ruleId:'missing_signal.baseline',scopeKey:'baseline:squat',destination:{type:'baseline',href:'/program'}}
async function respond(id:string,response='done_reported',until:string|null=null,key=randomUUID()){await actor();return rpc('respond_recommendation',[id,key,response,until,runtime,0])}
async function revision(){await db.exec('RESET ROLE');return(await db.query<any>('SELECT source_revision,nutrition_revision FROM recommendation_refresh_state WHERE user_id=$1',[owner])).rows[0]}
async function measurement(){
 const binding={measurement:{assessmentDefinition:{id:'strength.repetition_max',version:'1.0.0'},protocol:{id:'strength.repetition_max',version:'1.0.0'},metricId:'strength.load',unit:'kg'},binding:{movementId:'squat',variation:null,distance:null,equipmentIds:['barbell'],assessmentContext:{repetitions:5}}}
 const due=new Date(Date.now()-1000).toISOString(),r=await refresh({...action,outcome:{kind:'measurement',sourceId:'goal:test',metricId:'strength.load',unit:'kg',binding,dueAt:due}}),group=randomUUID(),value=randomUUID()
 await db.exec('RESET ROLE');await db.query("UPDATE recommendations SET created_at=clock_timestamp()-interval '1 hour' WHERE id=$1",[r.id])
 await db.query(`INSERT INTO performance_observation_groups(id,user_id,observation_kind,status,observed_at,captured_at,source_kind,source_system,source_device,source_record_id,assessment_definition_id,assessment_catalog_version,protocol_version,parser_version,verification_status,verified_at,verified_by,comparability_key,comparison_modifiers,metadata) VALUES($1::uuid,$2::uuid,'strength_set','complete',clock_timestamp()-interval '30 seconds',now(),'manual','sociusfit_training_baseline','web',($1::uuid)::text,'strength.repetition_max','0.2.0','1.0.0','manual-1','athlete_confirmed',now(),$2,'comparison:test',training_outcome_comparison($3),$4)`,[group,owner,binding,{origin:'athlete_reported',assessmentDefinitionVersion:'1.0.0',protocolId:'strength.repetition_max'}])
 await db.query("INSERT INTO performance_observation_values(id,group_id,user_id,metric_id,semantic_role,value_numeric,unit) VALUES($1,$2,$3,'strength.load','direct_outcome',100,'kg')",[value,group,owner])
 const outcome={schemaVersion:1,adherence:'observed',evidence:[{table:'performance_observation_groups',id:group,revision:null},{table:'performance_observation_values',id:value,revision:null}],metricId:'strength.load',unit:'kg',binding,summary:'Comparable later measurement recorded; benefit unknown.',attributionLimits:['No causal inference.']}
 return {r,group,value,outcome}
}
describe('W7 response, time, capture and outcome boundaries',()=>{
 it('records shown once without dirtying, while Done is only reported adherence',async()=>{
  const r=await refresh(action),before=await revision();await actor();const key=randomUUID(),args=[r.id,key,runtime,0],shown=await rpc('acknowledge_recommendation_shown',args);expect(await rpc('acknowledge_recommendation_shown',args)).toEqual(shown);expect(await revision()).toEqual(before)
  const response=await respond(r.id);expect((await read()).recommendations).toHaveLength(0)
  await actor();expect(await rpc('respond_recommendation',[r.id,response.request_id,'done_reported',null,'c'.repeat(64),60])).toEqual(response)
  expect((await db.query('SELECT id FROM workouts WHERE user_id=$1',[owner])).rows).toHaveLength(0);expect((await db.query('SELECT id FROM meals WHERE user_id=$1',[owner])).rows).toHaveLength(0)
  await expect(respond(r.id,'not_applicable',null,response.request_id)).rejects.toThrow('replay payload')
 })
 it('rejects new stale response/runtime/travel but preserves exact shown replay',async()=>{
  const r=await refresh(action);await actor();const args=[r.id,randomUUID(),runtime,0],shown=await rpc('acknowledge_recommendation_shown',args)
  await expect(rpc('respond_recommendation',[r.id,randomUUID(),'done_reported',null,'c'.repeat(64),0])).rejects.toThrow('no longer current')
  await expect(rpc('respond_recommendation',[r.id,randomUUID(),'done_reported',null,runtime,60])).rejects.toThrow()
  await meal();await expect(respond(r.id)).rejects.toThrow('no longer current');await actor();expect(await rpc('acknowledge_recommendation_shown',args)).toEqual(shown)
 })
 it('suppresses unchanged meaningful evidence but allows changed evidence; defer spans fingerprints',async()=>{
  const r=await refresh(action);await respond(r.id);await actor(owner,'service_role');expect(await rpc('get_recommendation_suppressions',[owner,[{scopeKey:r.scope_key,evidenceFingerprint:r.evidence_fingerprint}]])).toHaveLength(1)
  const newer=await refresh({...action,evidenceFingerprint:'c'.repeat(64)});await respond(newer.id,'deferred',new Date(Date.now()+60000).toISOString());await actor(owner,'service_role');expect(await rpc('get_recommendation_suppressions',[owner,[{scopeKey:r.scope_key,evidenceFingerprint:'d'.repeat(64)}]])).toHaveLength(1)
  const c=await claim();await expect(publish(c,decision(c,{...action,evidenceFingerprint:'d'.repeat(64)}))).rejects.toThrow('suppressed')
 })
 it('reuses immutable active evidence after irrelevant audit changes but never resurrects a superseded row',async()=>{
  const r=await refresh(action);await meal();const c=await claim(),same=await publish(c,decision(c,{...action,sources:[{table:'meals',id:randomUUID(),at:new Date().toISOString(),revision:2,facts:{}}]}));expect(same.recommendations[0].id).toBe(r.id);expect(same.recommendations[0].decision.sources).toEqual([])
  await refresh({...action,evidenceFingerprint:'c'.repeat(64)});const renewed=await refresh(action);expect(renewed.id).not.toBe(r.id);expect((await db.query<any>('SELECT lifecycle FROM recommendations WHERE id=$1',[r.id])).rows[0].lifecycle).toBe('superseded')
 })
 it('expires old active identity before inserting the same current identity',async()=>{
  const r=await refresh(action);await db.exec('RESET ROLE');await db.query("UPDATE recommendations SET valid_until=clock_timestamp()-interval '1 second' WHERE id=$1",[r.id]);const next=await refresh(action);expect(next.id).not.toBe(r.id);expect((await db.query<any>('SELECT lifecycle FROM recommendations WHERE id=$1',[r.id])).rows[0].lifecycle).toBe('expired')
 })
 it('coverage stays valid across unrelated source changes and becomes stale after nutrition edits',async()=>{
  await refresh();const rev=await revision(),at=new Date().toISOString(),args=['nutrition',date,at,'complete_through',randomUUID(),rev.source_revision,0];await actor();const result=await rpc('confirm_logging_coverage',args);expect(await rpc('confirm_logging_coverage',args)).toEqual(result);expect((await read()).coverage.coverageValid).toBe(true)
  await db.exec('RESET ROLE');await db.query('SELECT dirty_recommendations($1,false)',[owner]);expect((await read()).coverage.coverageValid).toBe(true)
  await meal();expect((await read()).coverage.coverageValid).toBe(false);await actor();await expect(rpc('confirm_logging_coverage',[...args.slice(0,4),randomUUID(),rev.source_revision,0])).rejects.toThrow('sources changed')
 })
 it('freezes owned recommendation origin and rejects foreign origin or changed replay',async()=>{
  const r=await refresh(action),m=await meal(r.id);expect(m.receipt.recommendationId).toBe(r.id);await actor();expect(await rpc('commit_logging_request_item',[m.child.id])).toEqual(m.receipt);expect((await db.query<any>('SELECT capture_recommendation_id FROM meals WHERE id=$1',[m.receipt.entityId])).rows[0].capture_recommendation_id).toBe(r.id)
  await expect(rpc('freeze_logging_request_items',[m.ledger.id,[{...m.p,recommendationId:randomUUID()}]])).rejects.toThrow();await actor(other);const ledger=await rpc('begin_logging_request',[randomUUID(),'d'.repeat(64)]);await expect(rpc('freeze_logging_request_items',[ledger.id,[m.p]])).rejects.toThrow('owned recommendation')
 })
 it('saves a standalone draft with first origin and refuses adding origin after originless commit',async()=>{
  const r=await refresh(action),m=await meal();await actor();const d=await rpc('save_activity_draft',[randomUUID(),null,null,m.p,false]),l=await rpc('begin_logging_request',[randomUUID(),'d'.repeat(64)]);const receipt=await rpc('commit_activity_draft',[d.id,1,l.id,r.id]);expect(receipt.recommendationId).toBe(r.id);expect(await rpc('commit_activity_draft',[d.id,1,l.id,r.id])).toEqual(receipt)
  const d2=await rpc('save_activity_draft',[randomUUID(),null,null,m.p,false]),l2=await rpc('begin_logging_request',[randomUUID(),'d'.repeat(64)]);await rpc('commit_activity_draft',[d2.id,1,l2.id]);await expect(rpc('commit_activity_draft',[d2.id,1,l2.id,r.id])).rejects.toThrow('origin changed')
 })
 it('records typed observed measurement once and appends invalidation on later retraction',async()=>{
  const f=await measurement();await actor(owner,'service_role');const key=randomUUID(),args=[owner,f.r.id,key,f.outcome],e=await rpc('record_recommendation_outcome',args);expect(await rpc('record_recommendation_outcome',args)).toEqual(e);await expect(rpc('record_recommendation_outcome',[owner,f.r.id,randomUUID(),f.outcome])).rejects.toThrow('already recorded')
  await db.exec('RESET ROLE');await db.query("UPDATE performance_observation_groups SET verification_status='rejected' WHERE id=$1",[f.group]);const result=await read();expect(result.outcomes[0]).toMatchObject({id:e.id,recommendationId:f.r.id,invalidated:true});expect(result.outcomes[0].payload).toEqual(f.outcome)
 })
 it.each(['verification','verifier','value'])('rejects %s changes between evaluator read and outcome RPC',async(kind)=>{
  const f=await measurement();await db.exec('RESET ROLE');const before=await revision()
  if(kind==='verification')await db.query("UPDATE performance_observation_groups SET verification_status='rejected' WHERE id=$1",[f.group]);
  if(kind==='verifier')await db.query('UPDATE performance_observation_groups SET verified_by=$2 WHERE id=$1',[f.group,other]);
  if(kind==='value')await db.query("UPDATE performance_observation_values SET status='excluded' WHERE id=$1",[f.value]);
  expect((await revision()).source_revision).toBeGreaterThan(before.source_revision);await actor(owner,'service_role');await expect(rpc('record_recommendation_outcome',[owner,f.r.id,randomUUID(),f.outcome])).rejects.toThrow(/comparability changed|retracted/)
 })
 it('rolls back canonical save if required invalidation cannot persist',async()=>{
  await refresh();await db.exec('RESET ROLE');await db.exec("CREATE FUNCTION fail_refresh_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic invalidation failure'; END $$; CREATE TRIGGER fail_refresh_write BEFORE UPDATE ON recommendation_refresh_state FOR EACH ROW EXECUTE FUNCTION fail_refresh_write();")
  await expect(meal()).rejects.toThrow('synthetic invalidation failure');await db.exec('RESET ROLE');await db.exec('DROP TRIGGER fail_refresh_write ON recommendation_refresh_state; DROP FUNCTION fail_refresh_write();');expect((await db.query('SELECT id FROM meals WHERE user_id=$1',[owner])).rows).toHaveLength(0)
 })
})


describe('W7 consumed sources and account lifecycle',()=>{
 it('installs exact triggers only on existing columns and keeps unconsumed target timestamp changes quiet',async()=>{
  const triggers=(await db.query<any>("SELECT c.relname table_name,encode(t.tgargs,'escape') fields FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname='dirty_recommendations'")).rows;expect(triggers.length).toBe(15)
  for(const trigger of triggers){const fields=trigger.fields.replace(/\\000$/,'').split(',');const columns=(await db.query<any>('SELECT column_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1',[trigger.table_name])).rows.map(r=>r.column_name);for(const field of fields)expect(columns).toContain(field)}
  await refresh();await db.exec('RESET ROLE');await db.query('INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories) VALUES($1,100,200,60,1740)',[owner]);const before=await revision();await db.query('UPDATE daily_targets SET updated_at=now() WHERE user_id=$1',[owner]);expect(await revision()).toEqual(before);await db.query('UPDATE daily_targets SET target_protein=110 WHERE user_id=$1',[owner]);expect((await revision()).nutrition_revision).toBeGreaterThan(before.nutrition_revision)
 })
 it('invalidates service-owned source insert/update/delete and both owners on reassignment',async()=>{
  await refresh();await db.exec('RESET ROLE');await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON daily_targets TO service_role');await db.query('SELECT dirty_recommendations($1)',[other]);const before=await revision();await actor(owner,'service_role');await db.query('INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories) VALUES($1,100,200,60,1740)',[owner]);expect((await revision()).source_revision).toBeGreaterThan(before.source_revision)
  const a=await revision();await actor(owner,'service_role');await db.query('UPDATE daily_targets SET user_id=$2 WHERE user_id=$1',[owner,other]);expect((await revision()).source_revision).toBeGreaterThan(a.source_revision);const otherBefore=(await db.query<any>('SELECT source_revision FROM recommendation_refresh_state WHERE user_id=$1',[other])).rows[0].source_revision;await actor(owner,'service_role');await db.query('DELETE FROM daily_targets WHERE user_id=$1',[other]);await db.exec('RESET ROLE');expect((await db.query<any>('SELECT source_revision FROM recommendation_refresh_state WHERE user_id=$1',[other])).rows[0].source_revision).toBeGreaterThan(otherBefore)
 })
 it('cascades new recommendation storage and owned capture refs on account deletion',async()=>{
  const r=await refresh(action),m=await meal(r.id);await refresh({...action,evidenceFingerprint:'c'.repeat(64)});const latest=(await read()).recommendations[0];await respond(latest.id);const rev=await revision();await actor();await rpc('confirm_logging_coverage',['nutrition',date,new Date().toISOString(),'partial',randomUUID(),rev.source_revision,0]);await actor();await rpc('delete_logged_activity',['meal',m.receipt.entityId,1,randomUUID()]);await db.exec('RESET ROLE');await db.query('DELETE FROM auth.users WHERE id=$1',[owner]);for(const table of ['recommendations','recommendation_events','recommendation_refresh_state','recommendation_suppressions','recommendation_publications','logging_coverage_confirmations','meals','activity_revisions'])expect((await db.query(`SELECT user_id FROM ${table} WHERE user_id=$1`,[owner])).rows).toHaveLength(0)
 })
})

describe('W7 original basis corrections',()=>{
 it('withdraws factual meal guidance after correction while preserving its original snapshot',async()=>{
  const m=await meal(),r=await refresh({kind:'action',ruleId:'logged_nutrition.remaining',scopeKey:'nutrition:'+date,sources:[{table:'meals',id:m.receipt.entityId,at:m.p.eventAt,revision:1,facts:{protein:6,calories:69,estimated:true}}]});await actor();await rpc('amend_logged_activity',['meal',m.receipt.entityId,1,randomUUID(),{...m.p.record,items:[{...m.p.record.items[0],protein:9}]},[],provenance]);const saved=(await db.query<any>('SELECT lifecycle,withdrawal_reason,decision FROM recommendations WHERE id=$1',[r.id])).rows[0];expect(saved.lifecycle).toBe('withdrawn');expect(saved.withdrawal_reason).toBe('source_basis_changed');expect(saved.decision).toEqual(r.decision);expect((await read()).recommendations).toHaveLength(0)
 })
 it('does not withdraw on capture audit revision noise with unchanged meal facts',async()=>{
  const m=await meal(),r=await refresh({sources:[{table:'meals',id:m.receipt.entityId,at:m.p.eventAt,revision:1,facts:{protein:6}}]});await actor();await rpc('amend_logged_activity',['meal',m.receipt.entityId,1,randomUUID(),{...m.p.record,input_text:'Corrected note only'},[],provenance]);expect((await db.query<any>('SELECT withdrawal_reason FROM recommendations WHERE id=$1',[r.id])).rows[0].withdrawal_reason).toBeNull()
 })
})

describe('W7 accepted execution and original intent authority',()=>{
 it('captures session origin atomically and keeps expected completion eligible for observed follow-up',async()=>{
  await db.exec('RESET ROLE');await db.exec(sqlFile('docs/migrations/verify-atomic-coach-session-completion-migration.sql').split('SET LOCAL ROLE authenticated;')[0].replaceAll(', TRUE)',', FALSE)')+' COMMIT;');const setting=async(k:string)=>(await db.query<any>('SELECT current_setting($1) v',['atomic_completion_test.'+k])).rows[0].v;owner=await setting('user_1');const session=await setting('session_as_prescribed')
  const r=await refresh({kind:'action',ruleId:'accepted_plan.session',scopeKey:'session:'+session,sources:[{table:'prescribed_sessions',id:session,at:date,revision:null,facts:{status:'planned'}}],outcome:{kind:'session_completion',sourceId:session,dueAt:deadline}})
  const feedback={schemaVersion:2,feedbackVersion:2,outcome:'as_planned',sessionRpe:null,energy:null,pain:null,note:null,provenance:{sessionRpe:{origin:'unknown',reviewState:'unreviewed'},energy:{origin:'unknown',reviewState:'unreviewed'},pain:{origin:'unknown',reviewState:'unreviewed'}}},work={mode:'as_prescribed',workoutDate:'2026-09-17',inputText:null,blocks:null,totalDurationMinutes:null},args=[session,'completed',feedback,new Date().toISOString(),randomUUID(),work,[],r.id]
  await actor();const saved=await rpc('record_coach_session_capture',args);expect(saved.receipt.recommendationId).toBe(r.id);expect((await rpc('record_coach_session_capture',args)).receipt).toEqual(saved.receipt);expect((await db.query<any>('SELECT withdrawal_reason FROM recommendations WHERE id=$1',[r.id])).rows[0].withdrawal_reason).toBeNull();await expect(rpc('record_coach_session_capture',[...args.slice(0,7),randomUUID()])).rejects.toThrow()
  await db.exec('RESET ROLE');await db.query("UPDATE recommendations SET decision=jsonb_set(decision,'{outcome,dueAt}',to_jsonb(clock_timestamp()::text)) WHERE id=$1",[r.id]);await actor(owner,'service_role');const observed=await rpc('record_recommendation_outcome',[owner,r.id,randomUUID(),{schemaVersion:1,adherence:'observed',evidence:[{table:'workouts',id:saved.receipt.entityId,revision:1},{table:'prescribed_sessions',id:session,revision:null}],summary:'Linked completion recorded; benefit unknown.',attributionLimits:['No causation inferred.']}]);expect(observed.payload.adherence).toBe('observed')
 })
 it('withdraws original intent basis and refuses observed interpretation after intent retraction',async()=>{
  await actor();const confirmed=await db.query<any>('SELECT * FROM confirm_training_intent($1,$2,$3)',[intent(runningOutcome()),randomUUID(),null]);const memory=confirmed.rows[0].memory_id;expect(memory).toBeTruthy();const f=await measurement();await db.exec('RESET ROLE');await db.query("UPDATE recommendations SET decision=jsonb_set(decision,'{sources}',$2) WHERE id=$1",[f.r.id,[{table:'coach_memories',id:memory,at:new Date().toISOString(),revision:1,facts:{goal:'running'}}]]);await db.query("UPDATE coach_memories SET status='withdrawn' WHERE id=$1",[memory]);expect((await db.query<any>('SELECT withdrawal_reason FROM recommendations WHERE id=$1',[f.r.id])).rows[0].withdrawal_reason).toBe('source_basis_changed');await actor(owner,'service_role');await expect(rpc('record_recommendation_outcome',[owner,f.r.id,randomUUID(),f.outcome])).rejects.toThrow('Observed outcome unavailable')
 })
})

describe('W7 later measurement ambiguity',()=>{
 it('invalidates a prior interpretation when a second matching value makes its measurement ambiguous',async()=>{
  const f=await measurement();await actor(owner,'service_role');await rpc('record_recommendation_outcome',[owner,f.r.id,randomUUID(),f.outcome]);await db.exec('RESET ROLE');await db.query("INSERT INTO performance_observation_values(group_id,user_id,metric_id,semantic_role,value_numeric,unit,ordinal) VALUES($1,$2,'strength.load','direct_outcome',101,'kg',1)",[f.group,owner]);expect((await read()).outcomes[0]).toMatchObject({invalidated:true,payload:f.outcome})
 })
})

describe('W7 exact-consumption exclusion',()=>{
 it('does not trigger recommendation refresh for unconsumed wearable tables or unrelated memory',async()=>{
  await refresh();const before=await revision();expect((await db.query("SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname='dirty_recommendations' AND c.relname LIKE 'whoop_%'")).rows).toHaveLength(0)
  await db.exec('RESET ROLE');await db.query("INSERT INTO coach_memories(user_id,memory_key,content,kind,status,version,idempotency_key) VALUES($1,'unrelated_note','{}','preference','confirmed',1,'unrelated-memory')",[owner]);expect(await revision()).toEqual(before)
 })
})

describe('W7 unpublished migration replay cleanup',()=>{
 it('removes earlier draft wearable triggers while retaining the narrow source inventory',async()=>{
  await db.exec('RESET ROLE');await db.exec("CREATE TRIGGER dirty_recommendations AFTER INSERT OR UPDATE OR DELETE ON whoop_sync_status FOR EACH ROW EXECUTE FUNCTION invalidate_recommendation_source('status');");await db.exec(sqlFile('supabase/migrations/20260918050000_recommendations.sql'));expect((await db.query("SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname='dirty_recommendations' AND c.relname LIKE 'whoop_%'")).rows).toHaveLength(0)
 })
})

describe('W9 exact event recovery ordering',()=>{
 it('replays committed defer and shown events before stale source/date/runtime checks but rejects new attempts with exact proof',async()=>{
  const r=await refresh(action),shownKey=randomUUID(),responseKey=randomUUID(),until=new Date(Date.now()+60000).toISOString();await actor()
  const shownArgs=[r.id,shownKey,runtime,0],shown=await rpc('acknowledge_recommendation_shown',shownArgs),responseArgs=[r.id,responseKey,'deferred',until,runtime,0],saved=await rpc('respond_recommendation',responseArgs)
  await meal();await actor();const travelOffset=new Date().getUTCHours()<14?840:-840
  expect(await rpc('respond_recommendation',[...responseArgs.slice(0,4),'c'.repeat(64),travelOffset])).toEqual(saved)
  expect(await rpc('acknowledge_recommendation_shown',[r.id,shownKey,'c'.repeat(64),travelOffset])).toEqual(shown)
  const rejected=await rpc('respond_recommendation',[r.id,randomUUID(),'deferred',until,runtime,0]).catch(error=>error);expect(rejected).toMatchObject({code:'40001',message:'Recommendation is no longer current'});expect(confirmedUnwrittenEvent(rejected,'response')).toBe(true)
  const changed=await rpc('respond_recommendation',[r.id,responseKey,'not_applicable',null,runtime,0]).catch(error=>error);expect(changed).toMatchObject({code:'22023',message:'Response replay payload changed'});expect(confirmedUnwrittenEvent(changed,'response')).toBe(false)
  expect((await db.query("SELECT id FROM recommendation_events WHERE recommendation_id=$1 AND event_type='response'",[r.id])).rows).toHaveLength(1)
 })
 it('distinguishes uncommitted expired defer from a payload conflict',async()=>{
  const r=await refresh(action);await actor();const rejected=await rpc('respond_recommendation',[r.id,randomUUID(),'deferred',new Date(Date.now()-60000).toISOString(),runtime,0]).catch(error=>error);expect(rejected).toMatchObject({code:'22023',message:'Invalid defer time'});expect(confirmedUnwrittenEvent(rejected,'response')).toBe(true);expect((await db.query('SELECT id FROM recommendation_events WHERE recommendation_id=$1',[r.id])).rows).toHaveLength(0)
 })
 it('replays saved coverage before source checks; uncommitted stale source and date have distinct exact no-write errors',async()=>{
  await refresh();const rev=await revision(),args=['nutrition',date,new Date().toISOString(),'partial',randomUUID(),rev.source_revision,0];await actor();const saved=await rpc('confirm_logging_coverage',args);await meal();await actor();expect(await rpc('confirm_logging_coverage',args)).toEqual(saved)
  const source=await rpc('confirm_logging_coverage',[...args.slice(0,4),randomUUID(),rev.source_revision,0]).catch(error=>error);expect(source).toMatchObject({code:'40001',message:'Coverage sources changed'});expect(confirmedUnwrittenEvent(source,'coverage')).toBe(true)
  const staleDate=await rpc('confirm_logging_coverage',['nutrition','2000-01-01','2000-01-01T12:00:00Z','partial',randomUUID(),rev.source_revision,0]).catch(error=>error);expect(staleDate).toMatchObject({code:'22023',message:'Invalid bounded coverage confirmation'});expect(confirmedUnwrittenEvent(staleDate,'coverage')).toBe(true)
  const changed=await rpc('confirm_logging_coverage',[...args.slice(0,3),'unknown',...args.slice(4)]).catch(error=>error);expect(changed).toMatchObject({code:'22023',message:'Coverage replay payload changed'});expect(confirmedUnwrittenEvent(changed,'coverage')).toBe(false)
  expect((await db.query('SELECT id FROM logging_coverage_confirmations WHERE user_id=$1',[owner])).rows).toHaveLength(1)
 })
})
