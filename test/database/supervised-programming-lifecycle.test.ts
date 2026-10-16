import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest'
import { supervisedLifecycleFixture, lifecycleIds, sourceClient } from './supervised-lifecycle-fixture'
import { sqlFile } from './fixture'
import { reviewedSetReport } from '../fixtures/reviewed-set-report'
import { reviewedCompletion } from '../fixtures/reviewed-completion'
import { reviewedSessionActivities } from '@/app/lib/coach/reviewed-session-contract'
import { parseSupervisedLifecycleReceipt, type SupervisedLifecycleRequest } from '@/app/lib/coach/supervised-lifecycle-recovery'
import { createSupervisedReviewService } from '@/app/lib/coach/supervised-review-service'
import { createSupervisedWeekIssuer } from '@/app/lib/coach/supervised-proposal-issuer'
import { prepareSupervisedCandidate } from '@/app/lib/coach/supervised-candidate-server'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'

describe('supervised programming database lifecycle', () => {
  let f: Awaited<ReturnType<typeof supervisedLifecycleFixture>>
  const { owner, reviewer, foreign, program, base } = lifecycleIds
  beforeAll(async () => {
    f = await supervisedLifecycleFixture()
    await f.db.exec(sqlFile('supabase/migrations/20261003150403_supervised_issue_closure_preflight.sql'))
  }, 30000)
  beforeEach(async () => { await f.db.exec('BEGIN'); await f.actor(); await f.scalar('SELECT get_coach_context_revision() AS value') })
  afterEach(async () => { await f.db.exec('ROLLBACK; RESET ROLE') })
  afterAll(async () => { await f?.db.close() })
  async function rejected(call: () => Promise<unknown>, code: string) {
    await f.db.exec('SAVEPOINT expected_rejection')
    try { await expect(call()).rejects.toMatchObject({ code }) }
    finally { await f.db.exec('ROLLBACK TO SAVEPOINT expected_rejection; RELEASE SAVEPOINT expected_rejection') }
  }
  async function ready() { const enrollment = await f.enrollment(); await f.anchor(); return enrollment }
  async function accepted(enrollment: string, transition: 'same_week' | 'next_week' = 'same_week') {
    const candidate = await f.prepare(enrollment, transition); await f.register(candidate)
    const proposal = await f.issue(candidate); await f.accept(proposal)
    await f.db.exec('SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED')
    return { candidate, proposal }
  }
  async function report(sessionId: string, payload: unknown, key = randomUUID()) {
    await f.actor(); const saved = await f.scalar('SELECT to_jsonb(r) AS value FROM record_reviewed_session_set($1,$2,$3) r', [sessionId, key, JSON.stringify(payload)])
    return { key, saved }
  }
  async function complete(sessionId: string, ids: string[], key = randomUUID()) {
    await f.actor(); const day = await f.scalar<string>('SELECT scheduled_date::text AS value FROM prescribed_sessions WHERE id=$1', [sessionId])
    const payload = { ...reviewedCompletion(ids), occurredAt: `${day}T18:00:00Z`, workoutDate: day }
    const saved = await f.scalar('SELECT complete_reviewed_session($1,$2,$3) AS value', [sessionId, key, JSON.stringify(payload)])
    return { key, payload, saved }
  }
  async function readReceipt(request: SupervisedLifecycleRequest) {
    await f.actor(request.expectedUserId)
    const value = await f.scalar('SELECT get_supervised_lifecycle_receipt($1,$2,$3,$4) AS value', [request.programId, request.operation, request.requestId, JSON.stringify(request.identity)])
    expect(parseSupervisedLifecycleReceipt(value, request)).toEqual(value)
    return value
  }
  const legacyIntent = { horizon_weeks: 1, primary_domain: 'strength', weeks: [{ week_number: 1 }] }
  const legacySessions = (day: string) => [{ week_number: 1, session_index: 1, scheduled_date: day,
    prescription: { domain: 'strength', intent: 'Legacy qualitative work', dose: {}, effort: 'Controlled', rest: 'As needed',
      success_condition: 'Quality', stop_condition: 'Pain', scale_options: [], evidence: {} } }]
  const legacySetup = { schemaVersion: 1, memories: { primary_goal: null, training_schedule: null, available_equipment: null, training_constraints: null } }
  const callLegacy = (name: string, args: unknown[]) => f.scalar(`SELECT to_jsonb(r) AS value FROM ${name}(${args.map((_, index) => `$${index + 1}`).join(',')}) r`,
    args.map(value => value !== null && typeof value === 'object' ? JSON.stringify(value) : value))
  async function legacyReview(programId: string, baseId: string, day: string, revision: number) {
    return callLegacy('record_coach_weekly_review', [programId, baseId, day, 'athlete_requested', 'continue', 'same_track', 'sufficient', 0.8, {}, {}, {}, [], null,
      { executionSources: [], observationSources: [], contextRevision: revision, setupMemoryBindings: legacySetup }, [], 'rolling-weekly-0.1.0', 'weekly-review-0.3.0', 'b'.repeat(64), randomUUID()])
  }
  it('issues through the real compiler, review service and SQL, then recovers without writes when disabled', async () => {
    const enrollment = await ready(), draft = await f.draft(enrollment)
    const calls: string[] = [], athleteClient = sourceClient(f.db, owner, 'authenticated', calls)
    const reviewerClient = sourceClient(f.db, reviewer, 'authenticated', calls)
    const serviceClient = sourceClient(f.db, owner, 'service_role', calls)
    let enabled = true
    const options = { enabled: () => enabled, createServiceClient: () => serviceClient }
    const review = createSupervisedReviewService(options)
    const submitted = await review.submit(athleteClient, owner, draft)
    expect(submitted.kind).toBe('saved')
    if (submitted.kind !== 'saved') throw new Error(JSON.stringify(submitted))
    const candidate = submitted.candidate
    const decision = await review.decide(reviewerClient, { expectedUserId: reviewer, candidateId: candidate.candidateId,
      requestId: randomUUID(), decision: 'approve', enrollmentId: enrollment, contentHash: candidate.contentHash, sourceHash: candidate.sourceHash })
    expect(decision.kind).toBe('decided')
    const issue = createSupervisedWeekIssuer({ ...options, review })
    const request = { expectedUserId: owner, programId: program, candidateId: candidate.candidateId, requestId: randomUUID() }
    const issued = await issue(athleteClient, request)
    expect(issued).toMatchObject({ kind: 'issued', replayed: false, programId: program })
    if (issued.kind !== 'issued') throw new Error(JSON.stringify(issued))
    expect(calls).toContain('register_reviewed_week_proposal')
    expect(calls).toContain('get_approved_supervised_candidate')
    await f.db.exec('SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED')
    enabled = false
    await f.enrollment(false)
    await f.db.exec('RESET ROLE; UPDATE coaching_write_control SET paused=true')
    calls.length = 0
    const recovered = await issue(athleteClient, request)
    expect(recovered).toMatchObject({ kind: 'recovered', receipt: { disposition: 'saved', result: {
      proposalId: issued.proposalId, planVersionId: issued.planVersionId, programId: program } } })
    expect(calls).toEqual(['get_supervised_lifecycle_receipt'])
    // Exercise the changed SQL issuer itself, not only its receipt getter.
    await f.actor()
    expect(await f.scalar('SELECT create_registered_reviewed_week_proposal($1,$2) AS value',
      [candidate.candidateId,request.requestId])).toMatchObject({proposalId:issued.proposalId,
      planVersionId:issued.planVersionId,programId:program,replayed:true})
  })
  it('refuses a valid pre-existing nonpilot registration through the supervised issuer', async () => {
    const calls: string[] = [], athleteClient = sourceClient(f.db, owner, 'authenticated', calls)
    const serviceClient = sourceClient(f.db, owner, 'service_role', calls)
    const draft = await f.draft(randomUUID())
    const prepared = await prepareSupervisedCandidate(athleteClient, draft)
    expect(prepared.kind).toBe('prepared_candidate')
    if (prepared.kind !== 'prepared_candidate') throw new Error(JSON.stringify(prepared))
    // A mechanically valid legacy registration has no supervised enrollment or
    // approval. The shared legacy SQL path intentionally still supports it.
    const registered = await serviceClient.rpc('register_reviewed_week_proposal', { p_id: draft.candidateId,
      p_packet: prepared.privatePacket, p_fingerprint: doseContentHash(prepared.privatePacket) })
    expect(registered.error).toBeNull()
    const options = { enabled: () => true, createServiceClient: () => serviceClient }
    const issue = createSupervisedWeekIssuer({ ...options, review: createSupervisedReviewService(options) })
    const request = { expectedUserId: owner, programId: program, candidateId: draft.candidateId, requestId: randomUUID() }
    calls.length = 0
    expect(await issue(athleteClient, request)).toMatchObject({ kind: 'review_required' })
    expect(calls).not.toContain('create_registered_reviewed_week_proposal')
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT count(*)::int AS value FROM adaptation_proposals')).toBe(0)
    const legacy = await athleteClient.rpc('create_registered_reviewed_week_proposal', {
      p_registration_id: draft.candidateId, p_idempotency_key: request.requestId })
    expect(legacy.error).toBeNull()
    expect(legacy.data).toMatchObject({ programId: program, replayed: false })
  })
  it('runs two approved cycles and logs independent RIR after source history changes', async () => {
    const enrollment = await ready(), first = await accepted(enrollment), session = await f.session()
    const payload = { ...reviewedSetReport('required-work'), performedAt: `${session.scheduled_date}T17:00:00Z`, schemaVersion: 2, repetitions: 24, rir: 2.5 }
    const logged = await report(session.id, payload)
    const corrected = await report(session.id, { ...payload, revision: 2, repetitions: 25, rir: 2 })
    const finished = await complete(session.id, [corrected.saved.id])
    expect(finished.saved.result.session_status).toBe('completed')
    const second = await accepted(enrollment, 'next_week')
    expect(second.candidate.privatePacket.source.binding.history.workouts.some(w => w.id === finished.saved.result.workout_id)).toBe(true)
    expect(second.candidate.reviewPacket.evidence.some(row => row.summary.includes('"rir":2'))).toBe(true)
    expect(second.proposal.planVersionId).not.toBe(first.proposal.planVersionId)
    const nextSession = await f.session()
    const nextPayload = { ...payload, performedAt: `${nextSession.scheduled_date}T17:00:00Z`, repetitions: 26 }
    expect((await report(nextSession.id, nextPayload)).saved.replayed).toBe(false)
    const nextCorrection = await report(nextSession.id, { ...nextPayload, revision: 2, repetitions: 27, rir: 1.5 })
    const nextCompletion = await complete(nextSession.id, [nextCorrection.saved.id])
    const thirdReview = await f.prepare(enrollment, 'next_week')
    expect(thirdReview.privatePacket.source.binding.history.workouts.some(w => w.id === nextCompletion.saved.result.workout_id)).toBe(true)
    expect(thirdReview.reviewPacket.evidence.some(row => row.summary.includes('"rir":1.5'))).toBe(true)
    const receipt = await readReceipt({ expectedUserId: owner, programId: program, operation: 'accept', requestId: first.proposal.key,
      identity: { proposalId: first.proposal.proposalId, planVersionId: first.proposal.planVersionId } })
    expect(receipt.result.active_plan_version_id).toBe(first.proposal.planVersionId)
    expect((await readReceipt({ expectedUserId: owner, programId: program, operation: 'set', requestId: logged.key, identity: { sessionId: session.id, report: payload } })).disposition).toBe('saved')
  })
  it('anchors only an existing exact base once and executes it without inventing a new approval', async () => {
    await ready(); const session = await f.session(base)
    const activity = reviewedSessionActivities(session.prescription.content).find(a => a.role === 'working')!
    expect((await report(session.id, reviewedSetReport(activity.id))).saved.replayed).toBe(false)
    await f.actor(owner, 'service_role')
    expect(await f.anchor()).toMatchObject({ planVersionId: base, replayed: true })
    await rejected(() => f.scalar('SELECT provision_supervised_initial_base($1,$2,$3) AS value', [program, randomUUID(), 'changed']), '22023')
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_supervised_decisions')).toBe(0)
  })
  it('denies unapproved registration, changed packet and revoked preacceptance approval', async () => {
    const enrollment = await ready(), unapproved = await f.prepare(enrollment, 'same_week', false)
    await rejected(() => f.register(unapproved), '55000')
    const candidate = await f.prepare(enrollment)
    const changed = structuredClone(candidate); changed.privatePacket.intent.reviewed_week.title = 'Changed'
    await rejected(() => f.register(changed), '55000')
    await f.register(candidate); const proposal = await f.issue(candidate)
    await f.enrollment(false)
    await rejected(() => f.accept(proposal), '55000')
    await rejected(() => f.issue(candidate), '22023') // Existing registration/request identity conflict stays authoritative.
  })
  it('preserves exact set/completion/issue/accept receipts when revoked and globally paused', async () => {
    const enrollment = await ready(), { candidate, proposal } = await accepted(enrollment), session = await f.session()
    const payload = { ...reviewedSetReport('required-work'), performedAt: `${session.scheduled_date}T17:00:00Z`, schemaVersion: 2, rir: 2.5 }
    const logged = await report(session.id, payload), finished = await complete(session.id, [logged.saved.id])
    await f.enrollment(false); await f.db.exec('RESET ROLE; UPDATE coaching_write_control SET paused=true')
    for (const request of [
      { operation: 'issue', requestId: proposal.key, identity: { reviewId: candidate.candidateId, registrationId: candidate.candidateId } },
      { operation: 'accept', requestId: proposal.key, identity: { proposalId: proposal.proposalId, planVersionId: proposal.planVersionId } },
      { operation: 'set', requestId: logged.key, identity: { sessionId: session.id, report: payload } },
      { operation: 'complete', requestId: finished.key, identity: { sessionId: session.id, completion: finished.payload } },
    ] as const) expect((await readReceipt({ ...request, expectedUserId: owner, programId: program })).disposition).toBe('saved')
    expect((await readReceipt({ expectedUserId: owner, programId: program, operation: 'set', requestId: randomUUID(), identity: { sessionId: session.id, report: payload } })).disposition).toBe('not_found')
    await rejected(() => readReceipt({ expectedUserId: foreign, programId: program, operation: 'set', requestId: logged.key, identity: { sessionId: session.id, report: payload } }), 'P0002')
    await rejected(() => readReceipt({ expectedUserId: owner, programId: program, operation: 'set', requestId: logged.key, identity: { sessionId: session.id, report: { ...payload, repetitions: 100 } } }), '22023')
  })
  it('denies new execution on revoke, expiry and pause while allowing a new enrollment for accepted content', async () => {
    const enrollment = await ready(); await accepted(enrollment); const session = await f.session()
    const payload = { ...reviewedSetReport('required-work'), schemaVersion: 2, rir: 2 }
    await f.enrollment(false)
    await rejected(() => report(session.id, payload), '55000')
    await f.enrollment(true, foreign)
    expect((await report(session.id, payload)).saved.replayed).toBe(false)
    await f.db.exec('RESET ROLE; UPDATE coaching_write_control SET paused=true')
    await rejected(() => report(session.id, { ...payload, revision: 2 }), 'PT503')
    await f.db.exec('RESET ROLE; UPDATE coaching_write_control SET paused=false')
    await f.enrollment(true, reviewer, new Date(Date.now() + 200).toISOString())
    await new Promise(resolve => setTimeout(resolve, 250))
    await rejected(() => report(session.id, { ...payload, revision: 2 }), '55000')
  })
  it('refuses new registration/issuance under replaced enrollment or newly stale source', async () => {
    const enrollment = await ready(), candidate = await f.prepare(enrollment)
    await f.register(candidate)
    await f.enrollment()
    await rejected(() => f.issue(candidate), '55000')
    await f.db.exec('RESET ROLE')
    const current = await f.scalar<string>('SELECT id AS value FROM coach_supervised_enrollments ORDER BY version DESC LIMIT 1')
    const fresh = await f.prepare(current)
    const session = await f.session(base), activity = reviewedSessionActivities(session.prescription.content).find(a => a.role === 'working')!
    await report(session.id, reviewedSetReport(activity.id))
    await rejected(() => f.register(fresh), '40001')
  })
  it('pauses candidate/decision writes but still allows operator revocation and receipt reads', async () => {
    const enrollment = await ready(), candidate = await f.prepare(enrollment, 'same_week', false)
    await f.db.exec('RESET ROLE; UPDATE coaching_write_control SET paused=true')
    await f.actor(reviewer)
    await rejected(() => f.scalar('SELECT decide_supervised_candidate($1,$2,$3,$4,$5,$6) AS value', [candidate.candidateId, randomUUID(), 'approve', candidate.saved.contentHash, candidate.saved.sourceHash, enrollment]), 'PT503')
    await f.enrollment(false)
    expect((await readReceipt({ expectedUserId: owner, programId: program, operation: 'issue', requestId: randomUUID(),
      identity: { reviewId: candidate.candidateId, registrationId: candidate.candidateId } })).disposition).toBe('not_found')
  })
  it('rejects direct owner downgrade inserts and protected-helper calls', async () => {
    await ready(); await f.actor()
    await rejected(() => f.db.query(`INSERT INTO training_plan_versions(id,program_id,user_id,version,status,reference_version,policy_version,intent,input_snapshot)
      VALUES($1,$2,$3,2,'proposed','legacy','legacy','{}','{}')`, [randomUUID(), program, owner]), '42501')
    await f.actor(owner, 'service_role')
    await rejected(() => f.db.query(`INSERT INTO training_plan_versions(id,program_id,user_id,version,status,reference_version,policy_version,intent,input_snapshot)
      VALUES($1,$2,$3,2,'proposed','legacy','legacy','{}','{}')`, [randomUUID(), program, owner]), '55000')
    const session = await f.session(base)
    await rejected(() => f.db.query("UPDATE prescribed_sessions SET status='completed',completed_at=now() WHERE id=$1", [session.id]), '42501')
    await f.actor(owner, 'service_role')
    await rejected(() => f.db.query("UPDATE prescribed_sessions SET status='completed',completed_at=now() WHERE id=$1", [session.id]), '55000')
    for (const role of ['authenticated', 'service_role']) {
      await f.actor(owner, role)
      for (const query of ["SELECT assert_supervised_accepted_content(null,null,null)",
        "SELECT complete_reviewed_session_before_supervision(null,null,null)", "SELECT register_reviewed_week_proposal_before_supervision(null,null,null)",
        'SELECT * FROM coach_supervised_initial_bases']) await rejected(() => f.db.exec(query), '42501')
    }
    await f.actor(); await rejected(() => f.db.exec('UPDATE workouts SET notes=notes'), '42501')
    await rejected(() => f.db.exec('DELETE FROM workouts'), '42501')
  })
  it('prevents direct active-pointer clearing, base reactivation and saved proposal identity edits', async () => {
    const enrollment = await ready(), { proposal } = await accepted(enrollment)
    await f.actor(owner, 'service_role')
    await rejected(() => f.db.query('UPDATE training_programs SET active_plan_version_id=NULL,status=\'draft\' WHERE id=$1', [program]), '55000')
    await rejected(() => f.db.query("UPDATE training_plan_versions SET status='accepted' WHERE id=$1", [base]), '55000')
    await rejected(() => f.db.query('UPDATE adaptation_proposals SET idempotency_key=$1 WHERE id=$2', [randomUUID(), proposal.proposalId]), '55000')
    await rejected(() => f.db.query("UPDATE adaptation_proposals SET status='rejected' WHERE id=$1", [proposal.proposalId]), '55000')
    await rejected(() => f.db.query("UPDATE training_plan_versions SET accepted_at=accepted_at+interval '1 day' WHERE id=$1", [proposal.planVersionId]), '55000')
    await rejected(() => f.db.query('UPDATE training_programs SET active_plan_version_id=$1 WHERE id=$2', [base, program]), '55000')
    await f.enrollment(false); await f.actor(owner, 'service_role')
    await rejected(() => f.db.query('UPDATE training_programs SET active_plan_version_id=$1 WHERE id=$2', [base, program]), '55000')
  })
  it('protects the exact anchored session manifest and approved execution slot roots', async () => {
    const enrollment = await ready(), { proposal } = await accepted(enrollment)
    await f.db.exec('RESET ROLE')
    await rejected(() => f.db.query('DELETE FROM coach_reviewed_execution_slots WHERE plan_version_id=$1', [proposal.planVersionId]), '55000')
    const session = await f.session(); await f.actor(owner, 'service_role')
    await rejected(() => f.db.query('UPDATE prescribed_sessions SET scheduled_date=scheduled_date+1 WHERE id=$1', [session.id]), '22023')
  })
  it('preserves enabled historical canonical amendments and exact replay after revocation', async () => {
    const enrollment = await ready(); const first = await accepted(enrollment), session = await f.session()
    const logged = await report(session.id, { ...reviewedSetReport('required-work'), performedAt: `${session.scheduled_date}T17:00:00Z`, schemaVersion: 2, rir: 2 })
    const finished = await complete(session.id, [logged.saved.id])
    await accepted(enrollment, 'next_week') // Historical correction must not require current active membership.
    await f.actor()
    const workout = await f.scalar<Record<string, unknown>>('SELECT to_jsonb(w) AS value FROM workouts w WHERE id=$1', [finished.saved.result.workout_id])
    const correctedRecord = { workout_date: workout.workout_date, input_text: workout.input_text, blocks: workout.blocks, notes: 'Corrected actual-session note',
      rpe: workout.rpe, total_duration_min: workout.total_duration_min, tags: workout.tags }
    const key = randomUUID(), values = [workout.id, workout.capture_revision, key, JSON.stringify(correctedRecord), '[{}]', JSON.stringify(workout.capture_provenance)]
    const amendment = await f.scalar('SELECT amend_program_execution($1,$2,$3,$4,$5,$6) AS value', values)
    expect(amendment.revision).toBe(Number(workout.capture_revision) + 1)
    await f.enrollment(false); await f.actor()
    expect(await f.scalar('SELECT amend_program_execution($1,$2,$3,$4,$5,$6) AS value', values)).toEqual(amendment)
    await rejected(() => f.scalar('SELECT amend_program_execution($1,$2,$3,$4,$5,$6) AS value', [workout.id, amendment.revision, randomUUID(), values[3], values[4], values[5]]), '55000')
    expect((await readReceipt({ expectedUserId: owner, programId: program, operation: 'accept', requestId: first.proposal.key,
      identity: { proposalId: first.proposal.proposalId, planVersionId: first.proposal.planVersionId } })).disposition).toBe('saved')
  })
  it('leaves genuine nonpilot reviewed session execution unchanged', async () => {
    const session = await f.session(base), activity = reviewedSessionActivities(session.prescription.content).find(a => a.role === 'working')!
    expect((await report(session.id, reviewedSetReport(activity.id))).saved.replayed).toBe(false)
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_supervised_programs')).toBe(0)
  })
  it('does not let unanchored candidate submission make later explicit provisioning impossible', async () => {
    const enrollment = await f.enrollment()
    await rejected(() => f.prepare(enrollment), '55000')
    expect(await f.anchor()).toMatchObject({ planVersionId: base, replayed: false })
    expect((await f.prepare(enrollment)).kind).toBe('prepared_candidate')
  })
  it('retains explicit expired-proposal closure without new acceptance authority', async () => {
    const enrollment = await ready(), candidate = await f.prepare(enrollment); await f.register(candidate)
    const proposal = await f.issue(candidate)
    await f.actor(owner, 'service_role')
    await f.db.query("UPDATE adaptation_proposals SET status='expired',decided_at=now() WHERE id=$1", [proposal.proposalId])
    await f.enrollment(false); await f.actor()
    const identity = { proposalId: proposal.proposalId, planVersionId: proposal.planVersionId }
    const result = await f.scalar('SELECT resolve_reviewed_proposal_request($1,$2,$3,$4) AS value', [program, 'accept', proposal.key, JSON.stringify(identity)])
    expect(result.disposition).toBe('closed')
    await rejected(() => f.accept(proposal), '55000')
  })
  it('rejects legacy eight-week downgrade through the real authenticated proposal RPC', async () => {
    await ready(); await f.actor()
    const sessions = Array.from({ length: 16 }, (_, i) => ({ week_number: Math.floor(i / 2) + 1, session_index: i % 2 + 1, scheduled_date: '2026-08-03',
      prescription: { domain: 'strength', intent: 'Legacy', dose: {}, effort: 'Controlled', rest: 'As needed', success_condition: 'Quality', stop_condition: 'Pain', scale_options: [], evidence: {} } }))
    await rejected(() => f.scalar('SELECT to_jsonb(r) AS value FROM create_training_plan_replacement_proposal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) r',
      [program, base, 'Legacy downgrade', 'Strength', '2026-08-03', 'legacy', 'legacy', '{"horizon_weeks":8}', '{}', JSON.stringify(sessions), '{}', 'a'.repeat(64), randomUUID()]), '55000')
  })
  it('rejects a legacy rolling replacement with its valid weekly review for an enrolled program', async () => {
    await ready(); await f.actor()
    const revision = await f.scalar<number>('SELECT get_coach_context_revision() AS value')
    const review = await legacyReview(program, base, '2026-08-03', revision)
    await rejected(() => callLegacy('create_rolling_weekly_replacement_proposal', [program, base, review.review_id,
      'Legacy next week', 'Strength', '2026-08-10', null, {}, 'legacy', 'legacy', legacyIntent,
      { contextRevision: revision, setupMemoryBindings: legacySetup }, legacySessions('2026-08-10'), {}, 'c'.repeat(64), randomUUID()]), '55000')
  })
  it('keeps a nonpilot legacy initial/review/replacement/acceptance lifecycle unchanged', async () => {
    await f.actor(foreign)
    const revision = await f.scalar<number>('SELECT get_coach_context_revision() AS value'), key = randomUUID()
    const initial = await callLegacy('create_initial_rolling_weekly_proposal', ['Nonpilot initial', 'Strength', '2026-08-03', null, {}, 'legacy', 'legacy',
      legacyIntent, { contextRevision: revision, setupMemoryBindings: legacySetup }, legacySessions('2026-08-03'), {}, 'a'.repeat(64), key])
    await callLegacy('accept_adaptation_proposal', [initial.proposal_id, key])
    const current = await f.scalar<number>('SELECT get_coach_context_revision() AS value')
    const review = await legacyReview(initial.proposed_program_id, initial.proposed_plan_version_id, '2026-08-03', current)
    const nextKey = randomUUID(), next = await callLegacy('create_rolling_weekly_replacement_proposal', [initial.proposed_program_id, initial.proposed_plan_version_id, review.review_id,
      'Nonpilot next', 'Strength', '2026-08-10', null, {}, 'legacy', 'legacy', legacyIntent,
      { contextRevision: current, setupMemoryBindings: legacySetup }, legacySessions('2026-08-10'), {}, 'c'.repeat(64), nextKey])
    expect(await callLegacy('accept_adaptation_proposal', [next.proposal_id, nextKey])).toMatchObject({ active_plan_version_id: next.proposed_plan_version_id, proposal_status: 'accepted' })
    await f.db.exec('SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED; RESET ROLE')
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_supervised_programs')).toBe(0)
  })
  it('can anchor an unchanged accepted base after upgrading existing foundation candidates without rewriting history', async () => {
    const prior = await supervisedLifecycleFixture(false)
    try {
      await prior.db.exec('BEGIN'); await prior.actor(); await prior.scalar('SELECT get_coach_context_revision() AS value')
      const enrollment = await prior.enrollment(), candidate = await prior.prepare(enrollment)
      await prior.db.exec('RESET ROLE')
      const before = await prior.scalar(`SELECT jsonb_build_object('candidate',(SELECT to_jsonb(c) FROM coach_supervised_candidates c WHERE id=$1),
        'decision',(SELECT to_jsonb(d) FROM coach_supervised_decisions d WHERE candidate_id=$1)) AS value`, [candidate.candidateId])
      await prior.db.exec('COMMIT')
      await prior.db.exec(sqlFile('supabase/migrations/20260930020000_supervised_programming_lifecycle.sql'))
      await prior.db.exec('BEGIN'); await prior.anchor(); await prior.db.exec('RESET ROLE')
      expect(await prior.scalar(`SELECT jsonb_build_object('candidate',(SELECT to_jsonb(c) FROM coach_supervised_candidates c WHERE id=$1),
        'decision',(SELECT to_jsonb(d) FROM coach_supervised_decisions d WHERE candidate_id=$1)) AS value`, [candidate.candidateId])).toEqual(before)
      await prior.register(candidate)
      await prior.db.exec('RESET ROLE'); await prior.db.query('UPDATE coach_context_revisions SET revision=revision+1 WHERE user_id=$1', [owner])
      await prior.actor()
      await expect(prior.issue(candidate)).rejects.toMatchObject({ code: '40001' })
    } finally { await prior.db.exec('ROLLBACK; RESET ROLE'); await prior.db.close() }
  })
})
