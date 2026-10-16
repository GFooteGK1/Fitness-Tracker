import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it } from 'vitest'
import { supervisedLifecycleFixture, lifecycleIds, sourceClient } from './supervised-lifecycle-fixture'
import { sqlFile } from './fixture'
import { validReviewedSetupMemory, reviewedSetupMatchesProfile } from '@/app/lib/coach/reviewed-setup-memory'
import { captureSetupMemoryBindings } from '@/app/lib/coach/setup-memory-bindings'
import { savedSetupIsConfirmed } from '@/app/lib/coach/complete-intake'
import { validateProgrammingProfile, validateReviewedProgrammingProfile } from '@/app/lib/coach/programming-schema'
import { createFirstReviewedProfileService } from '@/app/lib/coach/first-reviewed-profile-service'
import { SUPERVISED_REVIEW_SHAPES } from '@/app/lib/coach/supervised-programming-contract'

describe('saved reviewed setup v2 (disposable SQL; synthetic Auth claims)', () => {
  let f: Awaited<ReturnType<typeof supervisedLifecycleFixture>>
  const { owner, reviewer, foreign, program, base } = lifecycleIds
  beforeAll(async () => {
    f = await supervisedLifecycleFixture(true,true,true)
    await f.db.exec(sqlFile('supabase/migrations/20261005120000_first_reviewed_designation.sql'))
    await f.db.exec(sqlFile('supabase/migrations/20261005130000_first_reviewed_candidates.sql'))
  },30000)
  beforeEach(async () => { await f.db.exec('BEGIN') })
  afterEach(async () => { await f.db.exec('ROLLBACK; RESET ROLE') })
  afterAll(async () => { await f?.db.close() })
  function setup() {
    if (f.initialWeek.kind !== 'weekly_plan') throw Error('Genuine legacy base required')
    const profile = { ...structuredClone(f.initialWeek.profileSnapshot),startDate:'2026-10-05' }
    profile.sessionAvailability[0].minutes=75
    const originalDescription=' My gym has a barbell, rack and bench. '
    profile.equipment={ resolvedIds:['barbell','rack','bench','bodyweight'],unresolvedAthleteDescription:null,
      athleteDescription:originalDescription }
    return { profile, schedule:{ schemaVersion:2,experience:profile.trainingExperience,sessionAvailability:profile.sessionAvailability },
      equipment:{ schemaVersion:2,equipment:originalDescription,resolvedEquipmentIds:profile.equipment.resolvedIds,unresolvedAthleteDescription:null } }
  }
  async function save(key: string, content: unknown, request=randomUUID()) {
    await f.actor(owner)
    return (await f.db.query<{memory_id:string;memory_version:number}>(
      'SELECT * FROM confirm_coach_memory($1,$2,$3,$4,$5,$6)',
      [key,key==='training_schedule'?'schedule':'equipment',JSON.stringify(content),'{"source":"athlete_confirmed"}',1,request])).rows[0]
  }
  async function rejected(work:()=>Promise<unknown>,code:string) {
    await f.db.exec('SAVEPOINT denial')
    try { await expect(work()).rejects.toMatchObject({code}) }
    finally { await f.db.exec('ROLLBACK TO SAVEPOINT denial; RELEASE SAVEPOINT denial') }
  }
  it('saves unequal daily times and resolved equipment without erasing the original wording', async () => {
    const s=setup(), request=randomUUID(), first=await save('training_schedule',s.schedule,request)
    expect(await save('training_schedule',s.schedule,request)).toEqual(first)
    const changed=structuredClone(s.schedule); changed.sessionAvailability[0].minutes=80
    await rejected(()=>save('training_schedule',changed,request),'22023')
    await save('available_equipment',s.equipment)
    const bindings=await captureSetupMemoryBindings(sourceClient(f.db,owner),owner,s.profile,{reviewedSetup:true})
    expect(bindings.memories.training_schedule?.content).toEqual(s.schedule)
    expect(bindings.memories.available_equipment?.content).toEqual(s.equipment)
    expect(s.profile.equipment.athleteDescription).toBe(s.equipment.equipment)
    expect(validateReviewedProgrammingProfile(s.profile).ok).toBe(true)
    expect(validateProgrammingProfile(s.profile).ok).toBe(false)
    expect(savedSetupIsConfirmed(s.schedule,s.equipment)).toBe(false)
    await expect(captureSetupMemoryBindings(sourceClient(f.db,owner),owner,s.profile)).rejects.toThrow('confirmation')
  })
  it('does not ignore a new original-description field when binding legacy equipment', async () => {
    const s=setup()
    await save('available_equipment',{equipment:'',resolvedEquipmentIds:s.equipment.resolvedEquipmentIds})
    const db=sourceClient(f.db,owner)
    await expect(captureSetupMemoryBindings(db,owner,s.profile,{reviewedSetup:true})).rejects.toThrow('confirmation')
    const binding=await captureSetupMemoryBindings(db,owner,s.profile,{review:true})
    await f.db.exec('RESET ROLE')
    await rejected(()=>f.db.query('SELECT assert_coach_setup_memories_current($1,$2,$3)',[owner,JSON.stringify(binding),
      JSON.stringify({weekly_plan:{format:'first_review_profile_v1',profileSnapshot:s.profile}})]),'40001')
  })
  it('requires exact saved schedule and original prose, not just resolved IDs', async () => {
    const s=setup(); await save('training_schedule',s.schedule); await save('available_equipment',s.equipment)
    const changed=structuredClone(s.profile); changed.sessionAvailability[0].minutes=60
    expect(reviewedSetupMatchesProfile('training_schedule',s.schedule,changed)).toBe(false)
    await expect(captureSetupMemoryBindings(sourceClient(f.db,owner),owner,changed,{reviewedSetup:true})).rejects.toThrow('confirmation')
    const changedProse=structuredClone(s.profile); changedProse.equipment.athleteDescription=s.equipment.equipment.trim()
    expect(reviewedSetupMatchesProfile('available_equipment',s.equipment,changedProse)).toBe(false)
  })
  it('preserves corrected history and replays the original correction after replacement', async () => {
    const s=setup(), original=await save('training_schedule',s.schedule), request=randomUUID()
    const revised=structuredClone(s.schedule); revised.sessionAvailability[0].minutes=80
    await f.actor(owner)
    const args=[original.memory_id,JSON.stringify(revised),request]
    const first=(await f.db.query('SELECT * FROM correct_coach_memory_with_review($1,$2,$3)',args)).rows
    expect((await f.db.query('SELECT * FROM correct_coach_memory_with_review($1,$2,$3)',args)).rows).toEqual(first)
    await rejected(()=>f.db.query('SELECT * FROM correct_coach_memory_with_review($1,$2,$3)',
      [original.memory_id,JSON.stringify(s.schedule),request]),'22023')
    await f.db.exec('RESET ROLE')
    const old=await f.scalar('SELECT content AS value FROM coach_memories WHERE id=$1',[original.memory_id])
    expect(old).toEqual(s.schedule)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_memory_review_events WHERE memory_id=$1',[original.memory_id])).toBe(1)
    await f.actor(foreign)
    await rejected(()=>f.db.query('SELECT * FROM correct_coach_memory_with_review($1,$2,$3)',args),'P0002')
  })
  it('binds v2 setup to owned fresh profile confirmation with unchanged legacy history', async () => {
    const s=setup(); await save('training_schedule',s.schedule); await save('available_equipment',s.equipment)
    await f.db.exec('RESET ROLE')
    const before=await f.scalar('SELECT to_jsonb(v) AS value FROM training_plan_versions v WHERE id=$1',[base])
    const designationId=randomUUID(); await f.actor(owner,'service_role')
    await f.scalar('SELECT version_first_review_designation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value',
      [designationId,program,owner,base,reviewer,0,'2026-10-05',true,new Date(Date.now()+3600000).toISOString(),'disposable setup qualification'])
    const service=createFirstReviewedProfileService({enabled:()=>true,createServiceClient:()=>sourceClient(f.db,owner,'service_role')})
    const saved=await service.prepare(sourceClient(f.db,owner),owner,{snapshotId:randomUUID(),designationId,programId:program,
      basePlanVersionId:base,historyDays:90,tzOffset:0,windowStart:s.profile.startDate,targetSetup:s.profile})
    expect(saved.kind).toBe('saved'); if (saved.kind!=='saved') throw Error(JSON.stringify(saved))
    expect(saved.snapshot.projection.profile.sessionAvailability).toEqual(s.profile.sessionAvailability)
    expect(saved.snapshot.projection.profile.equipment).toEqual(s.profile.equipment)
    const confirmation={snapshotId:saved.snapshot.snapshotId,requestId:randomUUID(),expectedUserId:owner,
      contentHash:saved.snapshot.contentHash,sourceHash:saved.snapshot.sourceHash,profileHash:saved.snapshot.profileHash}
    expect((await service.confirm(sourceClient(f.db,owner),confirmation)).kind).toBe('confirmed')
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT to_jsonb(v) AS value FROM training_plan_versions v WHERE id=$1',[base])).toEqual(before)
  })
  it('enforces exact SQL profile/setup agreement and denies automatic flattening', async () => {
    const s=setup(); await save('training_schedule',s.schedule); await save('available_equipment',s.equipment)
    const bindings=await captureSetupMemoryBindings(sourceClient(f.db,owner),owner,s.profile,{reviewedSetup:true})
    await f.db.exec('RESET ROLE')
    const intent={weekly_plan:{format:'first_review_profile_v1',profileSnapshot:s.profile}}
    await f.db.query('SELECT assert_coach_setup_memories_current($1,$2,$3)',[owner,JSON.stringify(bindings),JSON.stringify(intent)])
    // Real reviewed packets use reviewed_week; availability is independent of the week start.
    const next={reviewed_week:{format:'reviewed_rolling_week_v0_1',profileSnapshot:{...s.profile,startDate:'2026-10-12'}}}
    await f.db.query('SELECT assert_coach_setup_memories_current($1,$2,$3)',[owner,JSON.stringify(bindings),JSON.stringify(next)])
    for (const mutate of [
      (v:typeof intent)=>{ v.weekly_plan.profileSnapshot.sessionAvailability[0].minutes=60 },
      (v:typeof intent)=>{ v.weekly_plan.profileSnapshot.equipment.athleteDescription='' },
      (v:typeof intent)=>{ v.weekly_plan.profileSnapshot.equipment.resolvedIds.push('track') },
      (v:typeof intent)=>{ v.weekly_plan.format='complete_programming_v0_3' }
    ]) { const bad=structuredClone(intent); mutate(bad)
      await rejected(()=>f.db.query('SELECT assert_coach_setup_memories_current($1,$2,$3)',[owner,JSON.stringify(bindings),JSON.stringify(bad)]),'40001') }
  })
  const badCases: Array<[string,(v:Record<string,any>)=>void]> = [
    ['training_schedule',v=>{delete v.sessionAvailability}],
    ['training_schedule',v=>{v.schemaVersion=3}],
    ['training_schedule',v=>{v.experience='beginner'}],
    ['training_schedule',v=>{v.experience=['consistent']}],
    ['training_schedule',v=>{v.sessionAvailability[0].minutes='75'}],
    ['training_schedule',v=>{v.sessionAvailability[0].minutes=75.5}],
    ['training_schedule',v=>{v.sessionAvailability[0].minutes=91}],
    ['training_schedule',v=>{v.sessionAvailability[0].minutes=null}],
    ['training_schedule',v=>{v.sessionAvailability[0].day='Funday'}],
    ['training_schedule',v=>{v.sessionAvailability[0].day=['monday']}],
    ['training_schedule',v=>{v.sessionAvailability[1].day=v.sessionAvailability[0].day}],
    ['training_schedule',v=>{v.sessionMinutes=60}],
    ['available_equipment',v=>{v.resolvedEquipmentIds=['invented_gym']}],
    ['available_equipment',v=>{v.resolvedEquipmentIds=['barbell','barbell']}],
    ['available_equipment',v=>{v.equipment=''}],
    ['available_equipment',v=>{delete v.unresolvedAthleteDescription}],
    ['available_equipment',v=>{v.unresolvedAthleteDescription=1}],
    ['available_equipment',v=>{v.resolvedEquipmentIds=[]}],
    ['available_equipment',v=>{v.rawWorkouts=[]}]
  ]
  it.each(badCases)('denies malformed %s at both app and direct SQL boundaries (%#)', async (key,mutate) => {
    const s=setup(), bad:Record<string,any>=structuredClone(key==='training_schedule'?s.schedule:s.equipment); mutate(bad)
    expect(validReviewedSetupMemory(key,bad)).toBe(false)
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT valid_reviewed_setup_memory($1,$2) AS value',[key,JSON.stringify(bad)])).toBe(false)
    await rejected(()=>save(key,bad),'22023')
  })
  it('keeps the current SQL/server review whitelist in parity', async () => {
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT supervised_review_field_map() AS value')).toEqual(SUPERVISED_REVIEW_SHAPES)
  })
})
