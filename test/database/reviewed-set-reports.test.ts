import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { databaseFixture, sqlFile } from './fixture'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { reviewedSetReport, invalidSetPatches } from '../fixtures/reviewed-set-report'
import { reviewedCompletion } from '../fixtures/reviewed-completion'
import { conditionalRecoveryPlan } from '../fixtures/reviewed-conditional-recovery'
import { reviewedSessionActivities } from '@/app/lib/coach/reviewed-session-contract'

const owner='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002'
const program='00000000-0000-4000-8000-000000000010', plan='00000000-0000-4000-8000-000000000011', session='00000000-0000-4000-8000-000000000100'
const fixture=reviewedRollingWeek(), scheduled=fixture.plan.scheduledSessions[1]
const activity=scheduled.prescription.content.steps.find(step=>step.kind==='activity' && step.role==='working')!
const report=reviewedSetReport(activity.id)
let db:PGlite
async function actor(id=owner,role='authenticated') {
  await db.exec(`RESET ROLE; SET LOCAL ROLE ${role}`)
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id])
}
const save=(value:unknown=report,key='reviewed-set-1')=>db.query<{id:string;replayed:boolean}>(
  'SELECT * FROM record_reviewed_session_set($1,$2,$3)',[session,key,JSON.stringify(value)])
const complete=(request:unknown,key='reviewed-completion-1')=>db.query<{result:{result:{workout_id:string|null;checkin_id:string;replayed:boolean};receipt:unknown}}>(
  'SELECT complete_reviewed_session($1,$2,$3) AS result',[session,key,JSON.stringify(request)])
async function rejected(call:()=>Promise<unknown>,code:string) {
  await db.exec('SAVEPOINT rejected')
  try { await expect(call()).rejects.toMatchObject({code}) }
  finally { await db.exec('ROLLBACK TO SAVEPOINT rejected; RELEASE SAVEPOINT rejected') }
}

describe('reviewed session storage and actual set evidence',()=>{
  beforeAll(async()=>{
    db=await databaseFixture()
    for(const file of ['coach-system-migration.sql','coach-plan-replacement-migration.sql','coach-complete-programming-v0-3-migration.sql',
      'coach-execution-feedback-migration.sql','layered-adaptive-evidence-migration.sql','atomic-coach-session-completion-migration.sql',
      'qwik-vbt-import-migration.sql','coach-trust-review-migration.sql','rolling-weekly-coach-migration.sql']) await db.exec(sqlFile(`docs/migrations/${file}`))
    for(const file of ['20260730130953_coach_workout_runner_v0_5.sql','20260904023000_fix_atomic_session_workout_link.sql',
      '20260904120000_logging_receipts.sql','20260915220000_exercise_preferences.sql','20260918010000_optional_session_feedback.sql',
      '20260918011000_session_capture_signals.sql']) await db.exec(sqlFile(`supabase/migrations/${file}`))
    await db.exec(sqlFile('docs/migrations/personal-records-migration.sql'))
    for(const file of ['20260728134202_personal_record_idempotency.sql','20260918020000_capture_receipts.sql','20260918030000_training_intent.sql',
      '20260918040000_targeted_review_sources.sql','20260921010000_coach_proposal_context_revision.sql','20260926010000_coach_setup_memory_bindings.sql',
      '20260928010000_reviewed_session_set_reports.sql','20260928020000_reviewed_session_completion.sql',
      '20260928090000_reviewed_qualitative_recovery.sql']) await db.exec(sqlFile(`supabase/migrations/${file}`))
    await db.query('INSERT INTO auth.users(id) VALUES($1),($2)',[owner,other])
    await db.query(`INSERT INTO training_programs(id,user_id,title,goal_summary,start_date,end_date,status,program_mode)
      VALUES($1,$2,'Reviewed fixture','Synthetic week',$3,$4,'draft','rolling_weekly')`,[program,owner,fixture.plan.windowStart,fixture.plan.windowEnd])
    await db.query(`INSERT INTO training_plan_versions(id,program_id,user_id,version,status,accepted_at,reference_version,policy_version,
      plan_mode,window_start,window_end,sequence_number,intent,input_snapshot)
      VALUES($1,$2,$3,1,'accepted',now(),'fixture','initial-dose-0.2.0','rolling_weekly',$4,$5,1,$6,'{}')`,
    [plan,program,owner,fixture.plan.windowStart,fixture.plan.windowEnd,JSON.stringify(fixture.intent)])
    await db.query("UPDATE training_programs SET status='active',active_plan_version_id=$1 WHERE id=$2",[plan,program])
    await db.query(`INSERT INTO prescribed_sessions(id,plan_version_id,program_id,user_id,week_number,session_index,scheduled_date,prescription)
      VALUES($1,$2,$3,$4,1,2,$5,$6)`,[session,plan,program,owner,scheduled.scheduledDate,JSON.stringify(scheduled.prescription)])
  },30000)
  beforeEach(async()=>{await db.exec('BEGIN');await actor()})
  afterEach(async()=>{await db.exec('ROLLBACK; RESET ROLE')})
  afterAll(async()=>{await db?.close()})

  it('stores schema2 losslessly, retains parent equality and keeps actual recovery distinct',async()=>{
    // Disposable mechanical SQL fixture, not a trusted coaching registration.
    await db.exec('RESET ROLE')
    const week=conditionalRecoveryPlan(), slot=week.scheduledSessions[0], prescription=slot.prescription
    const localProgram='00000000-0000-4000-8000-000000000030', localPlan='00000000-0000-4000-8000-000000000031', localSession='00000000-0000-4000-8000-000000000300'
    await db.query(`INSERT INTO training_programs(id,user_id,title,goal_summary,start_date,end_date,status,program_mode)
      VALUES($1,$2,'Representation fixture','No coaching approval',$3,$4,'draft','rolling_weekly')`,[localProgram,owner,week.windowStart,week.windowEnd])
    await db.query(`INSERT INTO training_plan_versions(id,program_id,user_id,version,status,accepted_at,reference_version,policy_version,
      plan_mode,window_start,window_end,sequence_number,intent,input_snapshot)
      VALUES($1,$2,$3,1,'accepted',now(),'fixture','initial-dose-0.2.0','rolling_weekly',$4,$5,1,$6,'{}')`,
    [localPlan,localProgram,owner,week.windowStart,week.windowEnd,JSON.stringify({format:'reviewed_weekly_intent_v0_1',horizon_weeks:1,reviewed_week:week})])
    await db.query("UPDATE training_programs SET status='active',active_plan_version_id=$1 WHERE id=$2",[localPlan,localProgram])
    const insert=(value:unknown)=>db.query(`INSERT INTO prescribed_sessions(id,plan_version_id,program_id,user_id,week_number,session_index,scheduled_date,prescription)
      VALUES($1,$2,$3,$4,1,1,$5,$6)`,[localSession,localPlan,localProgram,owner,slot.scheduledDate,JSON.stringify(value)])
    const changed=structuredClone(prescription)
    reviewedSessionActivities(changed.content)[0].restAfterSeconds={kind:'as_needed',estimatedSeconds:181}
    await rejected(()=>insert(changed),'22023')
    await insert(prescription)
    await actor()
    expect((await db.query<{prescription:unknown}>('SELECT prescription FROM prescribed_sessions WHERE id=$1',[localSession])).rows[0].prescription).toEqual(prescription)
    const prep=reviewedSessionActivities(prescription.content)[0]
    const actual={...reviewedSetReport(prep.id),repetitions:null,load:null,rpe:null,restAfterSeconds:null}
    await db.query('SELECT * FROM record_reviewed_session_set($1,$2,$3)',[localSession,'conditional-actual',JSON.stringify(actual)])
    const saved=(await db.query<{report:unknown;activity_snapshot:unknown}>('SELECT report,activity_snapshot FROM coach_reviewed_set_reports WHERE prescribed_session_id=$1',[localSession])).rows[0]
    expect(saved.report).toEqual(actual)
    expect(saved.activity_snapshot).toEqual(prep)
    await actor(other)
    expect((await db.query('SELECT * FROM prescribed_sessions WHERE id=$1',[localSession])).rows).toHaveLength(0)
    await rejected(()=>db.query('SELECT * FROM record_reviewed_session_set($1,$2,$3)',[localSession,'foreign-conditional',JSON.stringify(actual)]),'P0002')
  })

  it('stores exact per-set actuals and accepted snapshot, advances context, and leaves targets untouched',async()=>{
    const before=await db.query<{revision:number}>('SELECT revision FROM coach_context_revisions')
    const first=await save()
    expect(first.rows[0].replayed).toBe(false)
    const rows=await db.query('SELECT report,prescription_snapshot,activity_snapshot FROM coach_reviewed_set_reports')
    expect(rows.rows[0]).toEqual({report,prescription_snapshot:scheduled.prescription,activity_snapshot:activity})
    const after=await db.query<{revision:number}>('SELECT revision FROM coach_context_revisions')
    expect(Number(after.rows[0].revision)).toBe(Number(before.rows[0].revision)+1)
    expect((await db.query<{prescription:unknown}>('SELECT prescription FROM prescribed_sessions')).rows[0].prescription).toEqual(scheduled.prescription)
    expect((await db.query('SELECT * FROM workouts')).rows).toHaveLength(0)
  })
  it('completes latest set revisions to one canonical workout, snapshot and exact replay receipt',async()=>{
    const original=(await save()).rows[0]
    const corrected=(await save({...report,revision:2,repetitions:5,rpe:null,load:null},'set-correction')).rows[0]
    await rejected(()=>complete(reviewedCompletion([original.id])),'40001')
    const request=reviewedCompletion([corrected.id]), first=(await complete(request)).rows[0].result
    expect(first.result.workout_id).toBeTruthy()
    expect(first.result.replayed).toBe(false)
    const workout=(await db.query<{blocks:Array<{movements:Array<Record<string,unknown>>}>;capture_provenance:unknown}>('SELECT blocks,capture_provenance FROM workouts')).rows[0]
    expect(workout.blocks).toHaveLength(1)
    expect(workout.blocks[0].movements[0]).toMatchObject({sets:1,reps:5,load:null,unit:null,effort:null,restAfterSeconds:180,
      setReportId:corrected.id,setReportRevision:2,completed:true})
    expect((await db.query('SELECT * FROM activity_revisions')).rows).toHaveLength(1)
    expect((await db.query('SELECT * FROM performance_observation_groups')).rows).toHaveLength(0)
    expect((await db.query('SELECT status,completion_contract_version FROM prescribed_sessions')).rows[0]).toEqual({status:'completed',completion_contract_version:3})
    expect((await complete(request)).rows[0].result).toEqual({...first,result:{...first.result,replayed:true}})
    await rejected(()=>complete({...request,totalDurationMinutes:45}),'22023')
    await rejected(()=>complete(request,'different-completion-key'),'55000')
    await rejected(()=>save({...report,revision:3},'post-terminal-set'),'55000')
    expect((await save()).rows[0]).toEqual({...original,replayed:true})
    expect((await db.query('SELECT * FROM workouts')).rows).toHaveLength(1)
  })
  it('anchors overnight sessions to performed work and ignores earlier nonperformance for start time',async()=>{
    const skipped=(await save({...report,status:'not_performed',repetitions:null,load:null,rpe:null,restAfterSeconds:null,
      performedAt:'2026-08-04T04:45:00Z'},'not-performed-before-midnight')).rows[0]
    const actualTime='2026-08-04T05:15:00Z'
    const actual=(await save({...report,setNumber:2,performedAt:actualTime},'actual-after-midnight')).rows[0]
    const request={...reviewedCompletion([skipped.id,actual.id]),occurredAt:'2026-08-05T05:05:00Z'}
    await complete(request)
    const row=(await db.query<{workout_date:Date;started_at:Date}>('SELECT workout_date,started_at FROM workouts')).rows[0]
    expect(new Date(row.started_at).toISOString()).toBe(actualTime.replace('Z','.000Z'))
    expect(new Date(row.workout_date).toISOString().slice(0,10)).toBe('2026-08-04')
  })
  it('rejects relabeling older performed work with a later workout date',async()=>{
    const saved=(await save()).rows[0]
    await rejected(()=>complete({...reviewedCompletion([saved.id]),workoutDate:'2026-08-09',occurredAt:'2026-08-09T18:00:00Z'}),'22023')
    expect((await db.query('SELECT * FROM workouts')).rows).toHaveLength(0)
  })
  it('keeps half-point session effort and raw sensor data without fabricating load or event results',async()=>{
    const velocity={unit:'m/s',device:'Qwik',method:'video mean concentric',repetitions:[{rep:1,meanConcentricVelocity:0.42}]}
    const saved=(await save({...report,load:null,velocity})).rows[0]
    const request=reviewedCompletion([saved.id])
    await complete({...request,feedback:{...request.feedback,sessionRpe:6.5,provenance:{...request.feedback.provenance,
      sessionRpe:{origin:'athlete_reported',reviewState:'athlete_confirmed'}}}})
    const workout=(await db.query<{rpe:number|null;blocks:Array<{movements:Array<Record<string,unknown>>}>}>('SELECT rpe,blocks FROM workouts')).rows[0]
    expect(workout.rpe).toBeNull() // legacy integer field cannot encode a half-point
    expect(workout.blocks[0].movements[0]).toMatchObject({load:null,velocity,effort:report.rpe,
      unilateralConvention:{side:'both',loadConvention:null},protocol:{actualSetup:'unknown'}})
    expect((await db.query<{record:{reported_rpe:number}}>('SELECT record FROM activity_revisions')).rows[0].record.reported_rpe).toBe(6.5)
    expect((await db.query<{responses:{sessionRpe:number}}>('SELECT responses FROM coach_checkins')).rows[0].responses.sessionRpe).toBe(6.5)
    expect((await db.query('SELECT * FROM performance_observation_groups')).rows).toHaveLength(0)
  })
  it('skips without inventing a workout, and cannot skip recorded performed sets',async()=>{
    const request=reviewedCompletion([],'skipped'), first=(await complete(request)).rows[0].result
    expect(first.result.workout_id).toBeNull()
    expect(first.receipt).toBeNull()
    expect((await complete(request)).rows[0].result.result.replayed).toBe(true)
    expect((await db.query('SELECT * FROM workouts')).rows).toHaveLength(0)
  })
  it('rejects incomplete manifests, contradictory status and invalid timestamps without side effects',async()=>{
    const saved=(await save()).rows[0], request=reviewedCompletion([saved.id])
    await rejected(()=>complete(reviewedCompletion([])),'40001')
    await rejected(()=>complete(reviewedCompletion([saved.id],'skipped')),'22023')
    for(const invalid of [{...request,setReportIds:[saved.id,saved.id]},{...request,tzOffset:0,workoutDate:'2026-08-03'},
      {...request,occurredAt:'2026-08-04T16:00:00Z'},{...request,occurredAt:'2099-08-04T18:00:00Z',workoutDate:'2099-08-04'},
      {...request,totalDurationMinutes:1.5},{...request,extra:true}]) await rejected(()=>complete(invalid),'22023')
    expect((await db.query('SELECT * FROM workouts')).rows).toHaveLength(0)
    expect((await db.query('SELECT * FROM activity_mutations')).rows).toHaveLength(0)
    expect((await db.query('SELECT status FROM prescribed_sessions')).rows[0]).toEqual({status:'planned'})
  })
  it('requires authentication/ownership and refuses service-role completion',async()=>{
    const saved=(await save()).rows[0], request=reviewedCompletion([saved.id])
    await actor(other); await rejected(()=>complete(request),'P0002')
    await actor(''); await rejected(()=>complete(request),'28000')
    await actor(owner,'service_role'); await rejected(()=>complete(request),'42501')
  })
  it('appends corrections with optimistic revision and keeps exact replay stable',async()=>{
    const first=await save()
    expect((await save()).rows[0]).toEqual({...first.rows[0],replayed:true})
    await rejected(()=>save({...report,repetitions:5}), '22023')
    await rejected(()=>save({...report,repetitions:5},'another-request'), '40001')
    await rejected(()=>save({...report,revision:3},'future-revision'), '40001')
    await save({...report,revision:2,repetitions:5},'correction-request')
    expect((await db.query<{report:unknown}>('SELECT report FROM coach_reviewed_set_reports ORDER BY revision')).rows.map(r=>r.report)).toEqual([report,{...report,revision:2,repetitions:5}])
    expect((await save()).rows[0]).toEqual({...first.rows[0],replayed:true})
  })
  it('enforces RLS and denies direct writes and unauthenticated/service-role RPCs',async()=>{
    await save()
    await rejected(()=>db.exec("UPDATE coach_reviewed_set_reports SET side='left'"),'42501')
    await rejected(()=>db.exec('DELETE FROM coach_reviewed_set_reports'),'42501')
    await rejected(()=>db.query('INSERT INTO coach_reviewed_set_reports(user_id) VALUES($1)',[owner]),'42501')
    await actor(other)
    expect((await db.query('SELECT * FROM coach_reviewed_set_reports')).rows).toHaveLength(0)
    await rejected(()=>save(),'P0002')
    await actor('')
    await rejected(()=>save(),'28000')
    await actor(owner,'service_role')
    await rejected(()=>save(),'42501')
    await actor('','anon')
    await rejected(()=>save(),'42501')
  })
  it.each(invalidSetPatches)('rejects malformed reports consistently with TS %j',async patch=>{
    await rejected(()=>save({...report,...patch}),'22023')
  })
  it('rejects missing fields, wrong activity/side and future occurrence',async()=>{
    const missing:Record<string,unknown>={...report};delete missing.rpe
    for(const value of [missing,{...report,activityId:'invented'},{...report,side:'left'},{...report,performedAt:'2099-01-01T00:00:00Z'}]) {
      await rejected(()=>save(value),'22023')
    }
  })
  it('preserves extra performed sets and rep-level velocity provenance',async()=>{
    const value={...report,setNumber:100,rpe:null,velocity:{unit:'m/s',device:'Qwik',method:'video mean concentric',repetitions:[{rep:1,meanConcentricVelocity:0.41}]}}
    await save(value)
    expect((await db.query<{report:unknown}>('SELECT report FROM coach_reviewed_set_reports')).rows[0].report).toEqual(value)
  })
  it('keeps historical replay but rejects new reports when plan or session is no longer current',async()=>{
    const first=await save()
    await db.exec('RESET ROLE')
    await db.query("UPDATE training_programs SET status='archived' WHERE id=$1",[program])
    await actor()
    expect((await save()).rows[0]).toEqual({...first.rows[0],replayed:true})
    await rejected(()=>save({...report,setNumber:2},'new-stale-request'),'40001')
    await db.exec('RESET ROLE')
    await db.query("UPDATE prescribed_sessions SET status='skipped' WHERE id=$1",[session])
    await actor()
    expect((await save()).rows[0]).toEqual({...first.rows[0],replayed:true})
    await rejected(()=>save({...report,setNumber:2},'new-terminal-request'),'55000')
  })
  it('requires exact saved parent session and immutable accepted content',async()=>{
    await db.exec('RESET ROLE')
    await rejected(()=>db.query("UPDATE prescribed_sessions SET prescription=jsonb_set(prescription,'{title}','\"altered\"') WHERE id=$1",[session]),'22023')
    await rejected(()=>db.query('UPDATE prescribed_sessions SET scheduled_date=scheduled_date+1 WHERE id=$1',[session]),'22023')
    await rejected(()=>db.query(`INSERT INTO prescribed_sessions(plan_version_id,program_id,user_id,week_number,session_index,scheduled_date,prescription)
      VALUES($1,$2,$3,1,3,$4,$5)`,[plan,program,owner,scheduled.scheduledDate,JSON.stringify(scheduled.prescription)]),'22023')
    const legacy={domain:'strength',intent:'legacy',dose:{},effort:'controlled',rest:'full',success_condition:'quality',stop_condition:'pain',scale_options:[],evidence:{}}
    await rejected(()=>db.query(`INSERT INTO prescribed_sessions(plan_version_id,program_id,user_id,week_number,session_index,scheduled_date,prescription)
      VALUES($1,$2,$3,1,3,$4,$5)`,[plan,program,owner,scheduled.scheduledDate,JSON.stringify(legacy)]),'22023')
  })
  it('blocks new reviewed proposals and acceptance of a preexisting proposal',async()=>{
    await db.exec('RESET ROLE')
    const insert=()=>db.query(`INSERT INTO adaptation_proposals(user_id,program_id,proposed_plan_version_id,idempotency_key,rationale)
      VALUES($1,$2,$3,'reviewed-proposal','{}') RETURNING id`,[owner,program,plan])
    await rejected(insert,'55000')
    // Privileged rollback-only fixture for a proposal predating this fence.
    await db.exec('ALTER TABLE adaptation_proposals DISABLE TRIGGER guard_reviewed_proposal_disabled; ALTER TABLE adaptation_proposals DISABLE TRIGGER zz_guard_coach_proposal_context')
    await insert()
    await db.exec('ALTER TABLE adaptation_proposals ENABLE TRIGGER guard_reviewed_proposal_disabled; ALTER TABLE adaptation_proposals ENABLE TRIGGER zz_guard_coach_proposal_context')
    await rejected(()=>db.exec("UPDATE adaptation_proposals SET status='accepted',decided_at=now() WHERE idempotency_key='reviewed-proposal'"),'55000')
  })
  it('fences the incompatible old completion and rolls back its canonical workout',async()=>{
    const feedback={schemaVersion:2,feedbackVersion:2,outcome:'as_planned',sessionRpe:null,energy:null,pain:null,note:null,
      provenance:Object.fromEntries(['sessionRpe','energy','pain'].map(k=>[k,{origin:'unknown',reviewState:'unreviewed'}]))}
    const work={mode:'as_prescribed',workoutDate:scheduled.scheduledDate,inputText:null,blocks:null,totalDurationMinutes:null}
    await rejected(()=>db.query(`SELECT * FROM record_coach_session_result_v2($1,'completed',$2,now(),'reviewed-completion',$3,'[]')`,
      [session,JSON.stringify(feedback),JSON.stringify(work)]),'55000')
    expect((await db.query('SELECT * FROM workouts')).rows).toHaveLength(0)
    expect((await db.query('SELECT * FROM coach_checkins')).rows).toHaveLength(0)
  })
  it('preserves legacy storage and existing exercise capture after the new migration',async()=>{
    await db.exec('RESET ROLE')
    const legacyProgram='00000000-0000-4000-8000-000000000020', legacyPlan='00000000-0000-4000-8000-000000000021', legacySession='00000000-0000-4000-8000-000000000200'
    await db.query(`INSERT INTO training_programs(id,user_id,title,goal_summary,start_date,end_date,status,program_mode)
      VALUES($1,$2,'Legacy fixture','Legacy','2026-08-03','2026-08-09','draft','rolling_weekly')`,[legacyProgram,other])
    await db.query(`INSERT INTO training_plan_versions(id,program_id,user_id,version,status,accepted_at,reference_version,policy_version,
      plan_mode,window_start,window_end,sequence_number,intent,input_snapshot)
      VALUES($1,$2,$3,1,'accepted',now(),'fixture','legacy','rolling_weekly','2026-08-03','2026-08-09',1,'{"horizon_weeks":1}','{}')`,[legacyPlan,legacyProgram,other])
    await db.query("UPDATE training_programs SET status='active',active_plan_version_id=$1 WHERE id=$2",[legacyPlan,legacyProgram])
    const legacy={domain:'strength',intent:'legacy',dose:{},effort:'controlled',rest:'full',success_condition:'quality',stop_condition:'pain',scale_options:[],evidence:{},
      blocks:[{id:'work',exercises:[{movementId:'barbell_back_squat',sets:3,reps:{min:5,max:8}}]}]}
    await db.query(`INSERT INTO prescribed_sessions(id,plan_version_id,program_id,user_id,week_number,session_index,scheduled_date,prescription)
      VALUES($1,$2,$3,$4,1,1,'2026-08-04',$5)`,[legacySession,legacyPlan,legacyProgram,other,JSON.stringify(legacy)])
    await actor(other)
    const saved=await db.query<{replayed:boolean}>('SELECT * FROM record_coach_session_signal($1,$2,$3)',[legacySession,'legacy-report-key',
      {schemaVersion:1,exerciseId:'work:0',ratingScope:'hardest_set',workStatus:'as_planned',rpe:7,rpeScale:'rir_based'}])
    expect(saved.rows[0].replayed).toBe(false)
    expect((await db.query('SELECT * FROM coach_reviewed_set_reports')).rows).toHaveLength(0)
  })
})
