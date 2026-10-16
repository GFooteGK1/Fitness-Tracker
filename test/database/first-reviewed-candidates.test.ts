import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it } from 'vitest'
import { supervisedLifecycleFixture, lifecycleIds, sourceClient } from './supervised-lifecycle-fixture'
import { sqlFile } from './fixture'
import { effortWorkInput } from '../fixtures/reviewed-effort-work'
import { prepareFirstReviewedCandidate } from '@/app/lib/coach/first-reviewed-candidate-server'
import { FIRST_LEGACY_REVIEW_SHAPES, parseFirstReviewedDraft, parseFirstReviewedReviewPacket } from '@/app/lib/coach/first-reviewed-contract'
import { decodeCoachWeeklyIntent } from '@/app/lib/coach/rolling-weekly-api'
import { fetchReviewedDoseContext } from '@/app/lib/coach/reviewed-dose-context-server'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { formatUTCAsLocalDateWithOffset } from '@/app/lib/timezone-utils'
import { projectFirstReviewedProfileFacts } from '@/app/lib/coach/first-reviewed-profile-facts'
import { runningOutcome, intent } from '../fixtures/personalized-coaching/intent'
import { createFirstReviewedProfileService } from '@/app/lib/coach/first-reviewed-profile-service'
import { resolveFirstReviewedRequest } from '@/app/lib/coach/first-reviewed-request-resolution-server'
import { parseFirstReviewedPending, parseFirstReviewedRequestResolution, type FirstReviewedPending } from '@/app/lib/coach/first-reviewed-request-resolution'

describe('first reviewed candidate and decision boundary (disposable SQL)', () => {
  let f: Awaited<ReturnType<typeof supervisedLifecycleFixture>>
  const { owner, reviewer, foreign, program, base } = lifecycleIds
  beforeAll(async () => {
    f = await supervisedLifecycleFixture(true, true, true)
    await f.db.exec(sqlFile('supabase/migrations/20261005120000_first_reviewed_designation.sql'))
    await f.db.exec(sqlFile('supabase/migrations/20261005130000_first_reviewed_candidates.sql'))
  }, 30000)
  beforeEach(async () => { await f.db.exec('BEGIN') })
  afterEach(async () => { await f.db.exec('ROLLBACK; RESET ROLE') })
  afterAll(async () => { await f?.db.close() })
  async function designation(expected = 0, enabled = true, actor = reviewer, expiry = new Date(Date.now() + 3600000).toISOString()) {
    const id = randomUUID(); await f.actor(owner, 'service_role')
    await f.scalar('SELECT version_first_review_designation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value',
      [id, program, owner, base, actor, expected, '2026-10-05', enabled, expiry, 'disposable qualification'])
    return id
  }
  async function draft(id: string, reviewedSetup = false) {
    const input = effortWorkInput(), recipe = input.registry[0].recipe
    if (f.initialWeek.kind !== 'weekly_plan') throw Error('Expected genuine legacy baseline')
    const profile = { ...structuredClone(f.initialWeek.profileSnapshot), startDate: '2026-10-05' }
    if (reviewedSetup) {
      profile.sessionAvailability[0].minutes=75
      profile.equipment.athleteDescription='Original confirmed gym setup, retained after resolution.'
      profile.equipment.unresolvedAthleteDescription=null
      await f.actor(owner)
      for (const [key,kind,content] of [
        ['training_schedule','schedule',{schemaVersion:2,experience:profile.trainingExperience,sessionAvailability:profile.sessionAvailability}],
        ['available_equipment','equipment',{schemaVersion:2,equipment:profile.equipment.athleteDescription,
          resolvedEquipmentIds:profile.equipment.resolvedIds,unresolvedAthleteDescription:null}]
      ] as const) await f.db.query('SELECT * FROM confirm_coach_memory($1,$2,$3,$4,$5,$6)',
        [key,kind,JSON.stringify(content),'{"source":"athlete_confirmed"}',1,randomUUID()])
    }
    const profiles = createFirstReviewedProfileService({ enabled:()=>true,createServiceClient:()=>sourceClient(f.db,owner,'service_role') })
    const saved = await profiles.prepare(sourceClient(f.db,owner),owner,{ snapshotId:randomUUID(),designationId:id,programId:program,basePlanVersionId:base,
      historyDays:90,tzOffset:0,windowStart:profile.startDate,targetSetup:profile })
    if (saved.kind !== 'saved') throw Error(JSON.stringify(saved))
    const confirmationRequestId = randomUUID()
    const receipt = await profiles.confirm(sourceClient(f.db,owner),{ snapshotId:saved.snapshot.snapshotId,requestId:confirmationRequestId,expectedUserId:owner,
      contentHash:saved.snapshot.contentHash,sourceHash:saved.snapshot.sourceHash,profileHash:saved.snapshot.profileHash })
    if (receipt.kind !== 'confirmed') throw Error(JSON.stringify(receipt))
    return { candidateId: randomUUID(), designationId: id, programId: program, basePlanVersionId: base,
      profileSnapshotId:saved.snapshot.snapshotId,profileConfirmationRequestId:confirmationRequestId,
      historyDays: 90, tzOffset: 0, windowStart: profile.startDate, sequenceNumber: 2,
      confirmedTargetProfile: saved.snapshot.projection.profile, confirmedTargetProfileHash: saved.snapshot.profileHash,
      recipe: { sessions: recipe.sessions, baseSchedule: recipe.baseSchedule, schedules: recipe.schedules,
        protocols: recipe.protocols, instructions: recipe.instructions, limitations: recipe.limitations },
      scheduleId: input.input.context.scheduleId, rationale: 'Mechanical first-review qualification, not athlete suitability.' }
  }
  async function prepare(id: string, reviewedSetup = false) {
    const input = await draft(id, reviewedSetup)
    const result = await prepareFirstReviewedCandidate(sourceClient(f.db, owner), input)
    if (result.kind !== 'prepared_first_candidate') throw new Error(JSON.stringify(result))
    return { ...result, input }
  }
  async function submit(prepared: Awaited<ReturnType<typeof prepare>>) {
    await f.actor(owner, 'service_role')
    return f.scalar<{ candidateId: string; designationId: string; contentHash: string; sourceHash: string; reviewPacket: unknown }>(
      'SELECT submit_first_review_candidate($1,$2,$3,$4) AS value',
      [prepared.candidateId, prepared.designationId, JSON.stringify(prepared.privatePacket), JSON.stringify(prepared.reviewPacket)])
  }
  async function decide(saved: Awaited<ReturnType<typeof submit>>, request: string = randomUUID(), decision = 'approve') {
    await f.actor(reviewer)
    return f.scalar<{ requestId: string; replayed: boolean; decision: string }>(
      'SELECT decide_first_review_candidate($1,$2,$3,$4,$5,$6) AS value',
      [saved.candidateId, request, decision, saved.contentHash, saved.sourceHash, saved.designationId])
  }
  async function rejected(operation: () => Promise<unknown>, code: string) {
    await f.db.exec('SAVEPOINT expected_rejection')
    try { await expect(operation()).rejects.toMatchObject({ code }) }
    finally { await f.db.exec('ROLLBACK TO SAVEPOINT expected_rejection; RELEASE SAVEPOINT expected_rejection') }
  }
  function submitRequest(p: Awaited<ReturnType<typeof prepare>>): FirstReviewedPending {
    return { schemaVersion:1,userId:owner,programId:program,operation:'submit',body:{expectedUserId:owner,draft:p.input} }
  }
  function decisionRequest(c: Awaited<ReturnType<typeof submit>>): FirstReviewedPending {
    return { schemaVersion:1,userId:reviewer,programId:program,operation:'decide',body:{expectedUserId:reviewer,candidateId:c.candidateId,
      designationId:c.designationId,requestId:randomUUID(),decision:'approve',contentHash:c.contentHash,sourceHash:c.sourceHash} }
  }
  async function resolution(request:FirstReviewedPending,close=false) {
    await f.actor(request.userId)
    return f.scalar<Record<string,unknown>>(`SELECT ${close?'resolve_first_review_request':'get_first_review_request_resolution'}($1) AS value`,[JSON.stringify(request)])
  }
  async function closureCount() {
    await f.db.exec('RESET ROLE')
    return f.scalar<number>('SELECT count(*)::int AS value FROM coach_first_review_request_resolutions')
  }
  it('keeps absent submit/decision/issue readback pure and leaves the requests unresolved before lineage exists', async () => {
    const p=await prepare(await designation()), s=submitRequest(p)
    expect(await resolution(s)).toEqual({schemaVersion:1,request:s,disposition:'not_found'})
    const c=await submit(p), d=decisionRequest(c)
    const issue:FirstReviewedPending={schemaVersion:1,userId:owner,programId:program,operation:'issue',
      body:{expectedUserId:owner,programId:program,candidateId:c.candidateId,requestId:'first-issue-no-receipt'}}
    for(const pending of [d,issue])expect(await resolution(pending)).toEqual({schemaVersion:1,request:pending,disposition:'not_found'})
    expect(await closureCount()).toBe(0)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_reviewed_proposal_resolutions')).toBe(0)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_supervised_programs')).toBe(0)
  })
  it('closes an exact submission, recovers the closure after response loss, and fences both normal and alternate late writers', async () => {
    const p=await prepare(await designation()), request=submitRequest(p)
    const closed=await resolution(request,true)
    expect(closed).toMatchObject({disposition:'no_write',request})
    expect(parseFirstReviewedRequestResolution(closed,request)).toEqual(closed)
    const calls:string[]=[]
    const recovered=await resolveFirstReviewedRequest(sourceClient(f.db,owner,'authenticated',calls),request,false)
    expect(recovered).toEqual({kind:'resolved',resolution:closed})
    expect(calls).toEqual(['get_first_review_request_resolution'])
    expect(await resolution(request,true)).toEqual(closed)
    await rejected(()=>submit(p),'55000')
    await f.db.exec('RESET ROLE')
    await rejected(()=>f.db.query(`INSERT INTO coach_first_review_candidates(id,designation_id,user_id,program_id,base_plan_version_id,private_packet,review_packet,content_hash,source_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[p.candidateId,p.designationId,owner,program,base,JSON.stringify(p.privatePacket),JSON.stringify(p.reviewPacket),'a'.repeat(64),p.privatePacket.source.contextHash]),'55000')
    expect(await closureCount()).toBe(1)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_candidates')).toBe(0)
    expect(await f.scalar('SELECT active_plan_version_id::text AS value FROM training_programs WHERE id=$1',[program])).toBe(base)
  })
  it('returns a saved submission after designation revocation, without changing the candidate or creating closure', async () => {
    const p=await prepare(await designation()), c=await submit(p), request=submitRequest(p)
    await designation(1,false)
    for(const close of [false,true]) {
      const saved=await resolution(request,close)
      expect(saved).toEqual({schemaVersion:1,request,disposition:'saved',result:c})
      expect(parseFirstReviewedRequestResolution(saved,request)).toEqual(saved)
    }
    expect(await closureCount()).toBe(0)
    const changed=structuredClone(request)
    if(changed.operation!=='submit')throw Error('Expected submit')
    changed.body.draft.rationale='Changed request cannot recover saved content'
    await rejected(()=>resolution(changed),'22023')
  })
  it('recovers a committed closure after its transport response is lost without invoking the closer again', async () => {
    const p=await prepare(await designation()), request=submitRequest(p), calls:string[]=[]
    const client=sourceClient(f.db,owner,'authenticated',calls)
    const transport={auth:client.auth,rpc:async(name:string,args:Record<string,unknown>)=>{
      await client.rpc(name,args)
      throw Error('Disposable transport lost committed closure response')
    }} as unknown as SupabaseClient
    expect(await resolveFirstReviewedRequest(transport,request,true)).toEqual({kind:'retry_required',request})
    expect(await closureCount()).toBe(1)
    const recovered=await resolveFirstReviewedRequest(client,request,false)
    expect(recovered).toMatchObject({kind:'resolved',resolution:{disposition:'no_write',request}})
    expect(calls).toEqual(['resolve_first_review_request','get_first_review_request_resolution'])
    await designation(1,false)
    expect(await resolution(request)).toEqual(recovered.kind==='resolved'?recovered.resolution:null)
  })
  it('closes a pending designated decision and prevents both decision RPC and alternate inserts from reviving it', async () => {
    const c=await submit(await prepare(await designation())), request=decisionRequest(c)
    if(request.operation!=='decide')throw Error('Expected decision')
    const closed=await resolution(request,true)
    expect(await resolution(request)).toEqual(closed)
    await rejected(()=>decide(c,request.body.requestId),'55000')
    await f.db.exec('RESET ROLE')
    await rejected(()=>f.db.query(`INSERT INTO coach_first_review_decisions(candidate_id,designation_id,request_id,reviewer_id,decision,content_hash,source_hash)
      VALUES($1,$2,$3,$4,'approve',$5,$6)`,[c.candidateId,c.designationId,request.body.requestId,reviewer,c.contentHash,c.sourceHash]),'55000')
    expect(await closureCount()).toBe(1)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_decisions')).toBe(0)
    const changed=structuredClone(request);changed.body.decision='reject'
    await rejected(()=>resolution(changed),'22023')
  })
  it('recovers only the exact saved reviewer decision after revocation, without private packet disclosure', async () => {
    const c=await submit(await prepare(await designation())), request=decisionRequest(c)
    if(request.operation!=='decide')throw Error('Expected decision')
    await decide(c,request.body.requestId);await designation(1,false)
    for(const close of [false,true]) {
      const saved=await resolution(request,close)
      expect(saved).toMatchObject({disposition:'saved',result:{candidateId:c.candidateId,requestId:request.body.requestId,replayed:true}})
      expect(parseFirstReviewedRequestResolution(saved,request)).toEqual(saved)
      expect(JSON.stringify(saved)).not.toContain('privatePacket')
    }
    expect(await closureCount()).toBe(0)
    const changed=structuredClone(request);changed.body.decision='reject'
    await rejected(()=>resolution(changed),'22023')
  })
  it('reuses the reviewed issue fence before lineage and prevents registration after exact closure', async () => {
    const p=await prepare(await designation()), c=await submit(p)
    const request:FirstReviewedPending={schemaVersion:1,userId:owner,programId:program,operation:'issue',
      body:{expectedUserId:owner,programId:program,candidateId:c.candidateId,requestId:'first-issue-close-before-lineage'}}
    const closed=await resolution(request,true)
    expect(closed).toMatchObject({disposition:'no_write'})
    expect(await resolution(request)).toEqual(closed)
    expect(parseFirstReviewedRequestResolution(closed,request)).toEqual(closed)
    await f.db.exec('RESET ROLE')
    await rejected(()=>f.db.query('INSERT INTO coach_reviewed_proposal_registrations(id,user_id,packet,fingerprint) VALUES($1,$2,$3,$4)',
      [c.candidateId,owner,JSON.stringify(p.privatePacket),'b'.repeat(64)]),'55000')
    expect(await closureCount()).toBe(0)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_reviewed_proposal_resolutions')).toBe(1)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_supervised_programs')).toBe(0)
    await designation(1,false)
    expect(await resolution(request)).toEqual(closed)
    const changedKey=structuredClone(request);changedKey.body.requestId='different-first-issue-request-key'
    for(const close of [false,true])await rejected(()=>resolution(changedKey,close),'22023')
    const changed=structuredClone(request);changed.programId=randomUUID();changed.body.programId=changed.programId
    await rejected(()=>resolution(changed),'P0002')
  })
  it('keeps closures actor-scoped, private and immutable, rejecting unknown envelope fields and foreign access', async () => {
    const p=await prepare(await designation()), request=submitRequest(p)
    await resolution(request,true)
    await f.actor(foreign)
    await rejected(()=>f.scalar('SELECT get_first_review_request_resolution($1) AS value',[JSON.stringify(request)]),'22023')
    const forged={...request,userId:foreign,body:{expectedUserId:foreign,draft:p.input}}
    await rejected(()=>f.scalar('SELECT resolve_first_review_request($1) AS value',[JSON.stringify(forged)]),'P0002')
    await f.actor(owner)
    await rejected(()=>f.scalar('SELECT get_first_review_request_resolution($1) AS value',[JSON.stringify({...request,extra:true})]),'22023')
    for(const role of ['authenticated','service_role']) {
      await f.actor(owner,role)
      await rejected(()=>f.db.query('SELECT * FROM coach_first_review_request_resolutions'),'42501')
      await rejected(()=>f.scalar('SELECT first_review_request_resolution_result($1,false) AS value',[JSON.stringify(request)]),'42501')
    }
    await f.db.exec('RESET ROLE')
    await rejected(()=>f.db.exec('UPDATE coach_first_review_request_resolutions SET request=request'),'55000')
    await rejected(()=>f.db.exec('DELETE FROM coach_first_review_request_resolutions'),'55000')
    expect(await closureCount()).toBe(1)
  })
  it('rejects decision arrays in browser and SQL instead of coercing them into approval', async () => {
    const c=await submit(await prepare(await designation())), request=decisionRequest(c)
    if(request.operation!=='decide')throw Error('Expected decision')
    const malformed={...request,body:{...request.body,decision:['approve']}}
    expect(parseFirstReviewedPending(malformed)).toBeNull()
    await f.actor(reviewer)
    await rejected(()=>f.scalar('SELECT resolve_first_review_request($1) AS value',[JSON.stringify(malformed)]),'22023')
  })
  it('preserves saved receipts and permits no-write closure while coaching writes are paused', async () => {
    const p=await prepare(await designation()), c=await submit(p), s=submitRequest(p), d=decisionRequest(c)
    if(d.operation!=='decide')throw Error('Expected decision')
    await decide(c,d.body.requestId)
    await f.db.exec('RESET ROLE')
    await f.db.query('SELECT * FROM set_coaching_write_pause(true,0,$1)',['Disposable recovery qualification'])
    expect(await resolution(s)).toMatchObject({disposition:'saved',result:{candidateId:c.candidateId}})
    expect(await resolution(d)).toMatchObject({disposition:'saved',result:{requestId:d.body.requestId}})
    const pending=structuredClone(s)
    if(pending.operation!=='submit')throw Error('Expected submit')
    pending.body.draft.candidateId=randomUUID()
    const closed=await resolution(pending,true)
    expect(closed).toMatchObject({disposition:'no_write'})
    expect(await resolution(pending)).toEqual(closed)
    expect(await closureCount()).toBe(1)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_candidates')).toBe(1)
    expect(await f.scalar('SELECT paused AS value FROM coaching_write_control')).toBe(true)
  })
  it('exposes only the bounded authenticated wrappers, with no anonymous or service access to the helper', async () => {
    await f.db.exec('RESET ROLE')
    const privileges=await f.db.query<{role:string;getter:boolean;closer:boolean;helper:boolean}>(`SELECT role,
      has_function_privilege(role,'get_first_review_request_resolution(jsonb)','EXECUTE') AS getter,
      has_function_privilege(role,'resolve_first_review_request(jsonb)','EXECUTE') AS closer,
      has_function_privilege(role,'first_review_request_resolution_result(jsonb,boolean)','EXECUTE') AS helper
      FROM (VALUES('anon'),('authenticated'),('service_role')) roles(role)`)
    expect(privileges.rows).toEqual([
      {role:'anon',getter:false,closer:false,helper:false},
      {role:'authenticated',getter:true,closer:true,helper:false},
      {role:'service_role',getter:false,closer:false,helper:false}])
    expect(await f.scalar('SELECT relrowsecurity AND relforcerowsecurity AS value FROM pg_class WHERE oid=\'coach_first_review_request_resolutions\'::regclass')).toBe(true)
  })
  it('captures a current confirmed intent and scheduled baseline outside the history window through owned SQL reads, without changing the accepted base', async () => {
    await f.db.exec('RESET ROLE')
    const old = await f.scalar('SELECT to_jsonb(v) AS value FROM training_plan_versions v WHERE id=$1', [base])
    const workoutId = randomUUID(), groupId = randomUUID(), outcome = runningOutcome(), m = outcome.measurement!, b = outcome.binding
    outcome.baseline = { status: 'referenced', observationId: groupId }
    const sessionId = await f.scalar<string>('SELECT id AS value FROM prescribed_sessions WHERE program_id=$1 AND plan_version_id=$2 ORDER BY session_index LIMIT 1', [program, base])
    await f.db.query(`INSERT INTO workouts(id,user_id,workout_date,input_text,blocks,capture_revision,execution_revision,created_at,updated_at,captured_at)
      VALUES($1,$2,'2026-06-01','Disposable out-of-window baseline','[]',1,0,'2026-06-01','2026-06-01','2026-06-01')`, [workoutId, owner])
    const comparison = { movementId: b.movementId, variationId: b.variation, distance: b.distance, equipmentIds: b.equipmentIds,
      repetitions: null, externalLoad: null, duration: null, techniqueModifiers: [], environmentModifiers: [] }
    await f.db.query(`INSERT INTO performance_observation_groups(id,user_id,workout_id,prescribed_session_id,observation_kind,status,observed_at,captured_at,
      source_kind,source_system,source_record_id,assessment_definition_id,assessment_catalog_version,protocol_version,parser_version,
      verification_status,verified_at,verified_by,comparability_key,comparison_modifiers,metadata)
      VALUES($1::uuid,$2,$3,$4,'run_attempt','complete','2026-06-01','2026-06-01','coach_completion','sociusfit',($1::uuid)::text,$5,'0.2.0',$6,'fixture',
        'athlete_confirmed','2026-06-01',$2,'first-review-fixture',$7,$8)`,
    [groupId,owner,workoutId,sessionId,m.assessmentDefinition.id,m.protocol.version,JSON.stringify(comparison),
      JSON.stringify({ completionContractVersion: 2, assessmentDefinitionVersion: m.assessmentDefinition.version, protocolId: m.protocol.id })])
    await f.db.query("INSERT INTO performance_observation_values(group_id,user_id,metric_id,semantic_role,value_numeric,unit,ordinal) VALUES($1,$2,'run.time','direct_outcome',95.2,'s',0)", [groupId,owner])
    await f.db.query("INSERT INTO coach_memories(user_id,memory_key,content,kind,status,version,idempotency_key) VALUES($1,'training_intent',$2,'goal','confirmed',1,'first-factual-intent')", [owner,JSON.stringify(intent(outcome))])
    const client = sourceClient(f.db,owner), scope = { programId: program, basePlanVersionId: base, historyDays: 90, tzOffset: 0,
      historyThrough: formatUTCAsLocalDateWithOffset(new Date().toISOString(),0) }
    await expect(fetchReviewedDoseContext(client,scope)).rejects.toThrow('Confirmed training intent changed')
    await expect(fetchReviewedDoseContext(client,scope,{ firstReviewSetup: true })).rejects.toThrow('Confirmed training intent changed')
    const source = await fetchReviewedDoseContext(client,scope,{ firstReviewSetup: true, firstReviewFacts: true })
    expect(source.binding.history.workouts.some(row => row.id === workoutId)).toBe(false)
    expect(source.binding.intentBaselineWorkouts).toMatchObject([{ id: workoutId, user_id: owner, capture_revision: 1 }])
    const target = structuredClone(source.profile); target.primaryGoal.domain = 'aerobic'; target.secondaryGoals = []
    const projected = projectFirstReviewedProfileFacts(source,target)
    expect(projected.baselines).toMatchObject([{ observationId: groupId, source: 'scheduled_session', values: [{ ordinal: 0, value: 95.2 }] }])
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT to_jsonb(v) AS value FROM training_plan_versions v WHERE id=$1', [base])).toEqual(old)
    await f.db.query('UPDATE workouts SET capture_revision=2 WHERE id=$1',[workoutId])
    const amended = await fetchReviewedDoseContext(client,scope,{ firstReviewSetup: true, firstReviewFacts: true })
    expect(() => projectFirstReviewedProfileFacts(amended,target)).toThrow('amended or removed')
  })
  it.each(['missing','foreign'])('denies a %s referenced baseline before it can become confirmed SQL intent', async kind => {
    await f.db.exec('RESET ROLE')
    const groupId = randomUUID(), outcome = runningOutcome(), m = outcome.measurement!
    outcome.baseline = { status: 'referenced', observationId: groupId }
    if (kind === 'foreign') await f.db.query(`INSERT INTO performance_observation_groups(id,user_id,observation_kind,status,observed_at,captured_at,
      source_kind,source_system,source_record_id,assessment_definition_id,assessment_catalog_version,protocol_version,parser_version,
      verification_status,verified_at,verified_by,comparability_key,metadata)
      VALUES($1::uuid,$2,'run_attempt','complete','2026-06-01','2026-06-01','manual','sociusfit_training_baseline',($1::uuid)::text,
        $3,'0.2.0',$4,'fixture','athlete_confirmed','2026-06-01',$2,'foreign-baseline',$5)`,
    [groupId,foreign,m.assessmentDefinition.id,m.protocol.version,JSON.stringify({ origin: 'athlete_reported',
      assessmentDefinitionVersion: m.assessmentDefinition.version, protocolId: m.protocol.id })])
    await rejected(() => f.db.query("INSERT INTO coach_memories(user_id,memory_key,content,kind,status,version,idempotency_key) VALUES($1,'training_intent',$2,'goal','confirmed',1,'first-missing-baseline')", [owner,JSON.stringify(intent(outcome))]), '22023')
    const source = await fetchReviewedDoseContext(sourceClient(f.db,owner), { programId: program, basePlanVersionId: base,
      historyDays: 90, tzOffset: 0, historyThrough: formatUTCAsLocalDateWithOffset(new Date().toISOString(),0) },
    { firstReviewSetup: true, firstReviewFacts: true })
    expect(source.binding.observationGroups.some(row => row.id === groupId)).toBe(false)
    expect(source.binding.memories.some(row => row.memory_key === 'training_intent')).toBe(false)
  })
  it('prepares, submits and approves an exact v2 setup week without flattening daily time or deleting prose', async () => {
    const p=await prepare(await designation(),true)
    expect(p.reviewPacket.week.profileSnapshot.sessionAvailability[0].minutes).toBe(75)
    expect(p.reviewPacket.week.profileSnapshot.equipment.athleteDescription).toBe('Original confirmed gym setup, retained after resolution.')
    const saved=await submit(p)
    expect(await decide(saved)).toMatchObject({decision:'approve'})
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_supervised_programs')).toBe(0)
    expect(await f.scalar("SELECT count(*)::int AS value FROM training_plan_versions WHERE status='accepted'")).toBe(1)
  })
  it('seeds a decodable legacy intent and prepares exact complete content without changing prior data or enabling anything', async () => {
    const id = await designation()
    await f.db.exec('RESET ROLE')
    const before = await f.scalar('SELECT to_jsonb(v) AS value FROM training_plan_versions v WHERE id=$1', [base])
    expect(decodeCoachWeeklyIntent((before as { intent: unknown }).intent)?.kind).toBe('standard')
    const source = await fetchReviewedDoseContext(sourceClient(f.db, owner), { programId: program, basePlanVersionId: base,
      historyDays: 90, tzOffset: 0, historyThrough: formatUTCAsLocalDateWithOffset(new Date().toISOString(), 0) })
    expect(source.binding.executionSlots.length).toBeGreaterThan(0)
    const p = await prepare(id), saved = await submit(p)
    expect(saved.reviewPacket).toEqual(p.reviewPacket)
    expect(p.privatePacket.inputSnapshot.reviewedWeekTransition.kind).toBe('first_reviewed')
    expect(p.privatePacket.inputSnapshot.reviewedExecutionContinuity.slots.every(s => s.executionSessionId === null)).toBe(true)
    expect(p.persistable).toBe(false); expect(p.numericRuntimeEligible).toBe(false)
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT to_jsonb(v) AS value FROM training_plan_versions v WHERE id=$1', [base])).toEqual(before)
    for (const table of ['coach_supervised_programs', 'coach_supervised_enrollments', 'coach_supervised_initial_bases', 'coach_reviewed_proposal_registrations']) {
      expect(await f.scalar(`SELECT count(*)::int AS value FROM ${table}`)).toBe(0)
    }
  })
  it('keeps both authority tables private with forced RLS and the legacy whitelist identical in SQL and TypeScript', async () => {
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT first_legacy_review_field_map() AS value')).toEqual(FIRST_LEGACY_REVIEW_SHAPES)
    expect(await f.scalar("SELECT bool_and(relrowsecurity AND relforcerowsecurity) AS value FROM pg_class WHERE oid IN ('coach_first_review_candidates'::regclass,'coach_first_review_decisions'::regclass)")).toBe(true)
    await f.actor()
    await rejected(() => f.scalar('SELECT count(*) AS value FROM coach_first_review_candidates'), '42501')
    await rejected(() => f.scalar('SELECT count(*) AS value FROM coach_first_review_decisions'), '42501')
    await rejected(() => f.scalar('SELECT submit_first_review_candidate($1,$2,$3,$4) AS value', [randomUUID(), randomUUID(), '{}', '{}']), '42501')
  })
  it('rejects invented browser authority or private material in either complete-week projection', async () => {
    const id = await designation(), p = await prepare(id)
    expect(parseFirstReviewedDraft({ ...p.input, approved: true })).toBe(null)
    expect(parseFirstReviewedReviewPacket({ ...p.reviewPacket, rawSource: p.privatePacket.source })).toBe(null)
    const changed = structuredClone(p.reviewPacket)
    Object.assign(changed.legacyBase.scheduledSessions[0].prescription, { privateNotes: 'not for this projection' })
    expect(parseFirstReviewedReviewPacket(changed)).toBe(null)
    p.reviewPacket = changed
    await rejected(() => submit(p), '22023')
  })
  it('binds one immutable decision to the exact reviewer, designation and complete candidate', async () => {
    const id = await designation(), p = await prepare(id), saved = await submit(p), request = randomUUID()
    await f.actor(foreign)
    expect(await f.scalar('SELECT get_first_review_candidate($1) AS value', [p.candidateId])).toBe(null)
    await rejected(() => f.scalar('SELECT decide_first_review_candidate($1,$2,$3,$4,$5,$6) AS value',
      [p.candidateId, request, 'approve', saved.contentHash, saved.sourceHash, id]), 'P0002')
    expect(await decide(saved, request)).toMatchObject({ requestId: request, replayed: false, decision: 'approve' })
    expect(await decide(saved, request)).toMatchObject({ replayed: true })
    await rejected(() => decide(saved, request, 'reject'), '22023')
    await rejected(() => decide(saved), '22023')
    await f.db.exec('RESET ROLE')
    await rejected(() => f.db.query('UPDATE coach_first_review_candidates SET source_hash=$1 WHERE id=$2', ['a'.repeat(64), p.candidateId]), '55000')
    await rejected(() => f.db.query('DELETE FROM coach_first_review_decisions WHERE candidate_id=$1', [p.candidateId]), '55000')
  })
  it('recovers saved submission and decision after revocation without reviving approval or reviewer access', async () => {
    const id = await designation(), p = await prepare(id), saved = await submit(p), request = randomUUID()
    await decide(saved, request); await designation(1, false)
    expect(await submit(p)).toEqual(saved)
    expect(await decide(saved, request)).toMatchObject({ replayed: true })
    expect(await f.scalar('SELECT get_first_review_decision_receipt($1) AS value', [request])).toMatchObject({ requestId: request })
    await rejected(() => f.scalar('SELECT get_first_review_candidate($1) AS value', [p.candidateId]), '55000')
    await f.actor(owner)
    expect(await f.scalar('SELECT get_current_first_review_designation($1) AS value', [id])).toBe(null)
    expect(await f.scalar('SELECT get_first_review_candidate($1) AS value', [p.candidateId])).toEqual(saved)
    await f.actor(owner, 'service_role')
    await rejected(() => f.scalar('SELECT get_approved_first_review_candidate($1,$2,$3,$4) AS value', [p.candidateId, id, saved.contentHash, saved.sourceHash]), '55000')
  })
  it('rejects a stale source on submission and on a fresh decision', async () => {
    const id = await designation(), p = await prepare(id), saved = await submit(p)
    await f.db.exec('RESET ROLE')
    await f.db.query('UPDATE coach_context_revisions SET revision=revision+1 WHERE user_id=$1', [owner])
    await rejected(() => decide(saved), '40001')
    const unsaved = { ...p, candidateId: randomUUID(), privatePacket: structuredClone(p.privatePacket) }
    unsaved.privatePacket.registrationId = unsaved.candidateId
    unsaved.privatePacket.inputSnapshot.reviewedRegistrationId = unsaved.candidateId
    await rejected(() => submit(unsaved), '40001')
  })
  it('keeps existing ordinary transition validation unable to issue a first-reviewed gap', async () => {
    const id = await designation(), p = await prepare(id)
    await f.db.exec('RESET ROLE')
    await rejected(() => f.scalar('SELECT assert_reviewed_week_transition($1) AS value', [JSON.stringify(p.privatePacket)]), '22023')
  })
  it('requires a real owned confirmation rather than a browser profile hash or invented receipt ID', async () => {
    const id=await designation(), input=await draft(id)
    const forged={ ...input,profileConfirmationRequestId:randomUUID() }
    expect(await prepareFirstReviewedCandidate(sourceClient(f.db,owner),forged)).toMatchObject({ kind:'review_required' })
    const changed=structuredClone(input); changed.confirmedTargetProfile.recentTraining.completedSessionCount++
    changed.confirmedTargetProfileHash=doseContentHash(changed.confirmedTargetProfile)
    expect(await prepareFirstReviewedCandidate(sourceClient(f.db,owner),changed)).toMatchObject({ kind:'review_required' })
    const foreignInput={ ...input,profileSnapshotId:randomUUID() }
    expect(await prepareFirstReviewedCandidate(sourceClient(f.db,foreign),foreignInput)).toMatchObject({ kind:'review_required' })
  })
  it.each(['event','priority'])('uses a newly confirmed %s date and preserves all current outcomes through the SQL review guard', async dateSource => {
    const id=await designation(); await f.db.exec('RESET ROLE')
    const outcomes=(['strength','aerobic','power_explosiveness'] as const).map((domain,i)=>({ ...runningOutcome(`goal:${domain}`),domain,measurement:null,
      goal:{ ...runningOutcome(`goal:${domain}`).goal,kind:'process' as const,priority:i===0 ? 'primary' as const : 'secondary' as const,
        statement:`Develop ${domain}`,targetDate:i===0 ? '2027-04-01' : null,requiredQualityIds:['training_adherence' as const] },
      binding:{ movementId:null,distance:null,equipmentIds:[] as [],variation:null } }))
    const content=intent(...outcomes); content.priorityOrder=outcomes.map(o=>o.goal.id)
    if (dateSource==='event') content.event={ name:'Synthetic event',goalIds:content.priorityOrder,date:'2027-04-01' }
    await f.db.query("INSERT INTO coach_memories(user_id,memory_key,content,kind,status,version,idempotency_key) VALUES($1,'training_intent',$2,'goal','confirmed',1,'candidate-current-date')",[owner,JSON.stringify(content)])
    const p=await prepare(id), saved=await submit(p)
    expect(p.reviewPacket.week.directionSnapshot.goalTargetDate).toBe('2027-04-01')
    expect(p.reviewPacket.week.profileSnapshot.recentTraining.lookbackDays).toBe(90)
    expect(p.reviewPacket.profileFacts).toMatchObject({ snapshotId:p.input.profileSnapshotId,confirmationRequestId:p.input.profileConfirmationRequestId })
    expect(await decide(saved)).toMatchObject({ decision:'approve' })
  })
  it('rejects direct SQL replacement of confirmed facts or direction dates', async () => {
    const id=await designation(),p=await prepare(id); await f.db.exec('RESET ROLE')
    const changed=structuredClone(p.privatePacket)
    changed.intent.reviewed_week.profileSnapshot.recentTraining.completedSessionCount++
    await rejected(()=>f.scalar('SELECT assert_first_review_packet_current($1) AS value',[JSON.stringify(changed)]),'55000')
    const dated=structuredClone(p.privatePacket); dated.intent.reviewed_week.directionSnapshot.goalTargetDate='2027-04-01'
    await rejected(()=>f.scalar('SELECT assert_first_review_packet_current($1) AS value',[JSON.stringify(dated)]),'55000')
  })
  it('rejects raw material injected into bounded profile facts in TypeScript and SQL', async () => {
    const id=await designation(),p=await prepare(id)
    const changed=structuredClone(p.reviewPacket); Object.assign(changed.profileFacts,{ rawSource:p.privatePacket.source })
    expect(parseFirstReviewedReviewPacket(changed)).toBeNull()
    p.reviewPacket=changed; await rejected(()=>submit(p),'22023')
  })
  it('does not return private athlete context if Auth changes to the designated reviewer after the last source read', async () => {
    const id = await designation(), input = await draft(id), client = sourceClient(f.db, owner), reviewerClient = sourceClient(f.db, reviewer)
    let designationReads = 0, switched = false
    const changingClient = { ...client,
      auth: { ...client.auth, getUser: async () => switched ? reviewerClient.auth.getUser() : client.auth.getUser() },
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === 'get_current_first_review_designation' && ++designationReads === 2) switched = true
        return (switched ? reviewerClient : client).rpc(name, args)
      },
    } as unknown as typeof client
    expect(await prepareFirstReviewedCandidate(changingClient, input)).toMatchObject({ kind: 'review_required' })
    expect(switched).toBe(true)
  })
})
