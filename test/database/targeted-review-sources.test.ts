import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { databaseFixture, sqlFile } from './fixture'
let db: PGlite
const provenance = {schemaVersion:1,occurrence:{origin:'athlete_reported',reviewState:'athlete_confirmed',sourceReferences:[]},fields:{quantities:{origin:'athlete_reported',reviewState:'athlete_confirmed',sourceReferences:[]}}}
const work = {workout_date:'2026-09-10',input_text:'Reported squat',blocks:[{block_type:'STRENGTH',movements:[{name:'Squat',reps:5,weight:'80 lb'}]}]}
async function actor(owner:string) { await db.exec('SET ROLE authenticated'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[owner]) }
async function call(fn:string,args:unknown[]) { return (await db.query<any>(`SELECT * FROM ${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)).rows[0] }
async function scalar(fn:string,args:unknown[]) { return (await call(fn,args))[fn] }
beforeAll(async()=>{
  db=await databaseFixture()
  for(const file of ['coach-system-migration.sql','coach-plan-replacement-migration.sql','coach-complete-programming-v0-3-migration.sql','coach-execution-feedback-migration.sql','layered-adaptive-evidence-migration.sql','atomic-coach-session-completion-migration.sql','qwik-vbt-import-migration.sql','coach-trust-review-migration.sql','rolling-weekly-coach-migration.sql']) await db.exec(sqlFile(`docs/migrations/${file}`))
  for(const file of ['20260728143952_nutrition_fast_logging.sql','20260730130953_coach_workout_runner_v0_5.sql','20260904023000_fix_atomic_session_workout_link.sql','20260904120000_logging_receipts.sql','20260918010000_optional_session_feedback.sql','20260918011000_session_capture_signals.sql']) await db.exec(sqlFile(`supabase/migrations/${file}`))
  await db.exec(sqlFile('docs/migrations/personal-records-migration.sql')); await db.exec(sqlFile('supabase/migrations/20260728134202_personal_record_idempotency.sql'))
  await db.exec(sqlFile('supabase/migrations/20260918020000_capture_receipts.sql'))
  const migration=sqlFile('supabase/migrations/20260918040000_targeted_review_sources.sql'); await db.exec(migration); await db.exec(migration)
},30000)
afterAll(async()=>{await db?.close()})
async function fixture(linked = true) {
  await db.exec('RESET ROLE; DROP TABLE IF EXISTS rolling_initial;')
  await db.exec(sqlFile('docs/migrations/verify-rolling-weekly-coach-migration.sql').split('DO $verify_initial_week$')[0].replaceAll(', TRUE)',', FALSE)')+'COMMIT;')
  const setting=async(k:string)=>(await db.query<any>('SELECT current_setting($1) v',['rolling_test.'+k])).rows[0].v
  const owner=await setting('user_1'),other=await setting('user_2'),program=await setting('program'),plan=await setting('plan_1')
  await actor(owner)
  const request=await scalar('begin_logging_request',[randomUUID(),'a'.repeat(64)])
  const items=await scalar('freeze_logging_request_items',[request.id,[{sourceItemId:'source',kind:'workout',record:work,blocks:[{}],provenance,inputMethod:'text',eventAt:work.workout_date}]])
  const receipt=await scalar('commit_logging_request_item',[items[0].id]),group=randomUUID()
  await db.exec('RESET ROLE')
  await db.query(`INSERT INTO performance_observation_groups(id,user_id,workout_id,observation_kind,status,observed_at,captured_at,source_kind,source_system,source_device,source_record_id,assessment_definition_id,assessment_catalog_version,protocol_version,parser_version,verification_status,verified_at,comparability_key,comparison_modifiers,metadata)
    VALUES($1,$2,$3,'strength_set','complete',now(),now(),'manual','sociusfit','web',$4,'strength.repetition_max','0.2.0','1.0.0','manual-0.1.0','athlete_confirmed',now(),'comparison:test','{}','{}')`,[group,owner,linked?receipt.entityId:null,group])
  const value=randomUUID()
  await db.query("INSERT INTO performance_observation_values(id,group_id,user_id,metric_id,semantic_role,value_numeric,unit) VALUES($1,$2,$3,'strength.load','direct_outcome',100,'kg')",[value,group,owner])
  await actor(owner)
  const source={observationId:group,workoutId:receipt.entityId,captureRevision:1,executionRevision:0}
  const reviewArgs=(sources:any[]=[source],links:any[]=[{groupId:group,disposition:'included'}],key=randomUUID())=>[program,plan,'2026-09-07','athlete_requested','continue','same_track','sufficient',0.8,{}, {},{},[],null,{executionSources:sources,observationSources:links.filter(l=>l.disposition==='included').map(()=>({observationId:group,valueId:value}))},links,'rolling-weekly-0.1.0','weekly-review-0.3.0','b'.repeat(64),key]
  const review=async()=>{const args=reviewArgs();return {args,...await call('record_coach_weekly_review',args)}}
  const amend=()=>scalar('amend_logged_activity',['workout',receipt.entityId,1,randomUUID(),{...work,input_text:'Corrected actual work'},[{}],provenance])
  const proposal=async(reviewId:string)=>{
    const key=randomUUID()
    const result=await call('create_rolling_weekly_replacement_proposal',[program,plan,reviewId,'Next weekly plan','Strength','2026-09-14','2026-12-31',{},'complete-programming-0.1.0','rolling-weekly-0.1.0',{horizon_weeks:1,primary_domain:'strength',weeks:[{week_number:1}]},{},[{week_number:1,session_index:1,scheduled_date:'2026-09-14',prescription:{domain:'strength',intent:'Repeat',dose:{},effort:'Controlled',rest:'As needed',success_condition:'Quality',stop_condition:'Stop on pain',scale_options:[],evidence:{}}}],{},'c'.repeat(64),key])
    return {...result,key}
  }
  return {owner,other,program,plan,group,value,receipt,source,reviewArgs,review,amend,proposal}
}
describe('targeted review immutable sources',()=>{
  it('records exact sources, retries unchanged review and rejects forged or incomplete source bindings',async()=>{
    const f=await fixture()
    await expect(call('record_coach_weekly_review',f.reviewArgs([]))).rejects.toThrow('incomplete')
    await expect(call('record_coach_weekly_review',f.reviewArgs([{...f.source,captureRevision:2}]))).rejects.toThrow('invalid')
    const r=await f.review();expect(await call('record_coach_weekly_review',r.args)).toMatchObject({review_id:r.review_id})
    await expect(call('record_coach_weekly_review',f.reviewArgs())).rejects.toThrow('already reviewed')
  })
  it('appends invalidation and successor, retains original replay and frees expired pending window',async()=>{
    const f=await fixture(),r=await f.review(),p=await f.proposal(r.review_id)
    await f.amend()
    await expect(call('accept_adaptation_proposal',[p.proposal_id,p.key])).rejects.toThrow('sources changed')
    expect((await db.query<any>('SELECT status FROM training_plan_versions WHERE id=$1',[f.plan])).rows[0].status).toBe('accepted')
    const old=(await db.query<any>('SELECT rationale FROM coach_weekly_reviews WHERE id=$1',[r.review_id])).rows[0].rationale
    expect(old.executionSources).toEqual([f.source])
    expect(await call('record_coach_weekly_review',r.args)).toMatchObject({review_id:r.review_id})
    const successor=await call('record_coach_weekly_review',f.reviewArgs([],[{groupId:f.group,disposition:'excluded',reason:'execution_amended_or_deleted'}]))
    expect((await db.query<any>('SELECT supersedes_review_id FROM coach_weekly_reviews WHERE id=$1',[successor.review_id])).rows[0].supersedes_review_id).toBe(r.review_id)
    expect((await db.query<any>('SELECT status FROM adaptation_proposals WHERE id=$1',[p.proposal_id])).rows[0].status).toBe('expired')
    const next=await f.proposal(successor.review_id);expect(next.proposal_id).not.toBe(p.proposal_id)
    expect((await db.query<any>('SELECT reason FROM coach_review_source_invalidations WHERE review_id=$1',[r.review_id])).rows).toEqual([{reason:'execution_amended'}])
  })
  it('detects a correction between evidence read and review write with full rollback',async()=>{
    const f=await fixture();await f.amend()
    await expect(f.review()).rejects.toThrow('sources changed')
    expect((await db.query('SELECT id FROM coach_weekly_reviews WHERE base_plan_version_id=$1',[f.plan])).rows).toHaveLength(0)
  })
  it('retains accepted plan and accepted replay after source correction',async()=>{
    const f=await fixture(),r=await f.review(),p=await f.proposal(r.review_id)
    const accepted=await call('accept_adaptation_proposal',[p.proposal_id,p.key]);await f.amend()
    expect(await call('accept_adaptation_proposal',[p.proposal_id,p.key])).toEqual(accepted)
    expect((await db.query<any>('SELECT status FROM training_plan_versions WHERE id=$1',[p.proposed_plan_version_id])).rows[0].status).toBe('accepted')
  })
  it.each(['group','value','deleted value'])('invalidates retracted %s evidence including an unlinked source',async(kind)=>{
    const f=await fixture(kind!=='group')
    const args=f.reviewArgs(kind==='group'?[]:[f.source]),r=await call('record_coach_weekly_review',args),p=await f.proposal(r.review_id)
    await db.exec('RESET ROLE')
    if(kind==='group') await db.query("UPDATE performance_observation_groups SET status='excluded',exclusion_reason='Athlete withdrew source' WHERE id=$1",[f.group])
    else if(kind==='deleted value') await db.query('DELETE FROM performance_observation_values WHERE id=$1',[f.value])
    else await db.query("UPDATE performance_observation_values SET status='excluded',exclusion_reason='Athlete corrected source' WHERE id=$1",[f.value])
    await actor(f.owner)
    await expect(call('accept_adaptation_proposal',[p.proposal_id,p.key])).rejects.toThrow('sources changed')
    expect((await db.query<any>('SELECT reason FROM coach_review_source_invalidations WHERE review_id=$1',[r.review_id])).rows).toEqual([{reason:'measurement_retracted'}])
    const successor=await call('record_coach_weekly_review',f.reviewArgs([],[{groupId:f.group,disposition:'excluded',reason:'measurement_retracted'}]))
    expect(successor.review_id).not.toBe(r.review_id)
  })
  it('upgrades a legacy pending numeric review into an explicit unverified audit and usable successor',async()=>{
    const f=await fixture();await db.exec('RESET ROLE')
    const original=sqlFile('docs/migrations/rolling-weekly-coach-migration.sql')
    // Simulate the pre-W6 RPC and absent guard for this upgrade fixture only.
    await db.exec(original.slice(original.indexOf('CREATE OR REPLACE FUNCTION public.record_coach_weekly_review('),original.indexOf('CREATE OR REPLACE FUNCTION public.create_initial_rolling_weekly_proposal(')))
    await db.exec('ALTER TABLE adaptation_proposals DISABLE TRIGGER guard_coach_proposal_sources')
    await actor(f.owner)
    const args=f.reviewArgs();args[4]='adjust_dose';args[5]='small_adjustment';args[16]='weekly-review-0.2.0'
    const r=await call('record_coach_weekly_review',args),p=await f.proposal(r.review_id)
    await db.exec('RESET ROLE; ALTER TABLE adaptation_proposals ENABLE TRIGGER guard_coach_proposal_sources')
    const migration=sqlFile('supabase/migrations/20260918040000_targeted_review_sources.sql');await db.exec(migration);await db.exec(migration)
    await actor(f.owner)
    expect((await db.query<any>('SELECT reason,activity_revision_id,observation_group_id FROM coach_review_source_invalidations WHERE review_id=$1',[r.review_id])).rows).toEqual([{reason:'legacy_source_unverified',activity_revision_id:null,observation_group_id:null}])
    await expect(call('accept_adaptation_proposal',[p.proposal_id,p.key])).rejects.toThrow('sources changed')
    expect(await call('record_coach_weekly_review',args)).toMatchObject({review_id:r.review_id})
    const successor=await f.review();expect(successor.review_id).not.toBe(r.review_id)
    expect((await db.query<any>('SELECT status FROM adaptation_proposals WHERE id=$1',[p.proposal_id])).rows[0].status).toBe('expired')
  })
  it('preserves deletion provenance, denies foreign reads and all direct writes',async()=>{
    const f=await fixture(),r=await f.review();await scalar('delete_logged_activity',['workout',f.receipt.entityId,1,randomUUID()])
    expect((await db.query<any>('SELECT reason FROM coach_review_source_invalidations WHERE review_id=$1',[r.review_id])).rows[0].reason).toBe('execution_deleted')
    await actor(f.other);expect((await db.query('SELECT id FROM coach_review_source_invalidations WHERE review_id=$1',[r.review_id])).rows).toHaveLength(0)
    for(const role of ['authenticated','service_role','anon']) expect((await db.query<any>("SELECT has_table_privilege($1,'coach_review_source_invalidations','INSERT,UPDATE,DELETE') allowed",[role])).rows[0].allowed).toBe(false)
    expect((await db.query<any>("SELECT relforcerowsecurity FROM pg_class WHERE relname='coach_review_source_invalidations'")).rows[0].relforcerowsecurity).toBe(true)
  })
})
