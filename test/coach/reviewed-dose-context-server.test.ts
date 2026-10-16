import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchReviewedDoseContext, compileAuthenticatedReviewedSession, type TrustedReviewedSessionRegistration } from '@/app/lib/coach/reviewed-dose-context-server'
import { buildReviewedRollingWeeklyPlan, buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { buildStoredRollingWeeklyIntent } from '@/app/lib/coach/rolling-weekly-api'
import { buildAdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'
import { captureProvenance } from '@/app/lib/capture/contracts'
import { reviewedBenchExample } from '../fixtures/reviewed-bench-session'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { reviewedC2rWeek, reviewedC2rWorkout } from '../fixtures/reviewed-c2r-week'
import { compileAuthenticatedReviewedWeek, type TrustedReviewedWeekRegistration } from '@/app/lib/coach/reviewed-week-context-server'
import { prepareReviewedWeekProposalRegistration, reviewedSourceValidBefore } from '@/app/lib/coach/reviewed-proposal-registration'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { intent } from '../fixtures/personalized-coaching/intent'
import { projectFirstReviewedProfileFacts } from '@/app/lib/coach/first-reviewed-profile-facts'

type Row = Record<string, any>
const scope = { programId: 'program-1', basePlanVersionId: 'plan-1', historyThrough: '2026-09-27', historyDays: 28, tzOffset: 300 }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-27T20:00:00Z')) })
afterEach(() => vi.useRealTimers())

function executionRows(sessions: Array<{ scheduledDate: string; prescription: unknown }>) {
  return sessions.map((slot, i) => ({ id: `session-${i + 1}`, user_id: 'athlete', program_id: 'program-1',
    plan_version_id: 'plan-1', execution_plan_version_id: 'plan-1', week_number: 1, session_index: i + 1,
    scheduled_date: slot.scheduledDate, prescription: structuredClone(slot.prescription), status: 'planned',
    completed_workout_id: null, completion_contract_version: null, has_reports: false }))
}

function database() {
  const example = reviewedBenchExample()
  const profile = { ...example.profile, startDate: '2026-09-21' }
  const plan = buildRollingWeeklyPlan({ source: 'initial', windowStart: profile.startDate, profile,
    direction: buildRollingTrainingDirection(profile, { hypothesis: 'Repeatable moderate exposures support strength development.', goalTargetDate: '2027-04-01' }) })
  if (plan.kind !== 'weekly_plan') throw new Error('Expected weekly plan')
  const stored = JSON.parse(JSON.stringify(buildStoredRollingWeeklyIntent(plan, buildAdaptivePlanContract(profile, [plan]))))
  const tables: Record<string, Row[]> = {
    training_programs: [{ id: 'program-1', user_id: 'athlete', status: 'active', program_mode: 'rolling_weekly', active_plan_version_id: 'plan-1' }],
    training_plan_versions: [{ id: 'plan-1', user_id: 'athlete', program_id: 'program-1', status: 'accepted', plan_mode: 'rolling_weekly', intent: stored, input_snapshot: {} }],
    coach_context_revisions: [{ user_id: 'athlete', revision: 5 }],
    workouts: [{ id: 'workout-1', user_id: 'athlete', workout_date: '2026-09-25', created_at: '2026-09-25T12:00:00Z', updated_at: '2026-09-25T12:00:00Z',
      capture_revision: 1, capture_provenance: captureProvenance('workout', 'athlete_reported', 'athlete_confirmed'),
      notes: 'Crisp reps, no pain.', input_text: 'Bench 165 lb 3x6; set RPE 7/7/7, 3 minute rests.',
      blocks: [{ role: 'priority_adaptation', movements: [{ name: 'Barbell bench press', sets: 3, reps: 6, load: 165, unit: 'lb', effort: [7, 7, 7] }] }] }],
    coach_checkins: [], coach_memories: [], coach_strength_assessments: [], performance_observation_groups: [], performance_observation_values: [], measurement_imports: [], coach_reviewed_set_reports: [], coach_session_signals: [],
    coach_effective_prescribed_sessions: executionRows(plan.scheduledSessions),
  }
  const reads: Record<string, number> = {}, queries: Array<{ table: string; columns?: string; filters: Row }> = []
  const state = { errorTable: '', wrongOwnerTable: '', raceTable: '', owner: 'athlete', serverCap: Infinity, expireDuringRead: false }
  const from = vi.fn((table: string) => {
    const filters: Row = {}, orders: Array<[string, boolean]> = []; let max = Infinity
    const record = { table, columns: undefined as string | undefined, filters }; queries.push(record)
    const chain = {
      select: (columns: string) => { record.columns = columns; return chain },
      eq: (key: string, value: unknown) => { filters[key] = value; return chain },
      gte: () => chain, lte: () => chain,
      order: (key: string, options: { ascending: boolean }) => { orders.push([key, options.ascending]); return chain },
      limit: (limit: number) => { max = limit; return chain },
      then: (resolve: (value: unknown) => unknown) => {
        reads[table] = (reads[table] ?? 0) + 1
        if (!(table in tables)) throw new Error(`Unknown table ${table}`)
        let rows = structuredClone(tables[table].filter(row => Object.entries(filters).every(([key, value]) => row[key] === value)))
        rows.sort((a, b) => { for (const [key, asc] of orders) { if (a[key] !== b[key]) return (a[key] < b[key] ? -1 : 1) * (asc ? 1 : -1) } return 0 })
        const count = rows.length
        rows = rows.slice(0, Math.min(max, state.serverCap))
        if (state.expireDuringRead && table === 'measurement_imports') vi.setSystemTime(new Date('2026-09-27T20:02:00Z'))
        if (state.wrongOwnerTable === table && rows[0]) rows[0].user_id = 'other-athlete'
        if (state.raceTable === table && reads[table] % 2 === 0 && rows[0]) {
          if (table === 'coach_context_revisions') rows[0].revision++
          if (table === 'training_programs') rows[0].active_plan_version_id = 'new-plan'
          if (table === 'training_plan_versions') rows[0].input_snapshot = { changed: true }
        }
        return Promise.resolve(resolve({ data: rows, count, error: state.errorTable === table ? { message: 'Unavailable' } : null }))
      },
    }
    return chain
  })
  const auth = { getUser: vi.fn(async () => ({ data: { user: state.owner ? { id: state.owner } : null }, error: null })) }
  const rpc = vi.fn(() => { throw new Error('No write-capable RPC permitted') })
  return { db: { from, auth, rpc } as unknown as SupabaseClient, tables, reads, queries, state, rpc, example }
}

async function registration(fixture: ReturnType<typeof database>): Promise<TrustedReviewedSessionRegistration> {
  const snapshot = await fetchReviewedDoseContext(fixture.db, scope)
  const { profile: _profile, ...compilation } = fixture.example
  void _profile
  // Mechanical transport fixture. No new human review or real-athlete approval is claimed.
  return { userId: 'athlete', scope, contextHash: snapshot.contextHash, compilation }
}

async function weekRegistration(fixture: ReturnType<typeof database>): Promise<TrustedReviewedWeekRegistration> {
  const reviewed = reviewedRollingWeek()
  Object.assign(fixture.tables.training_plan_versions[0], { intent: reviewed.intent,
    window_start: reviewed.plan.windowStart, window_end: reviewed.plan.windowEnd, sequence_number: 1 })
  fixture.tables.coach_effective_prescribed_sessions = executionRows(reviewed.plan.scheduledSessions)
  const snapshot = await fetchReviewedDoseContext(fixture.db, scope)
  const { profile: _profile, ...context } = reviewed.input.context; void _profile
  return { id: 'developmental-swap', userId: 'athlete', scope, contextHash: snapshot.contextHash,
    compilation: { ...reviewed.input, context }, reviewedWeeks: reviewed.registry }
}

describe('first-only captured facts, separate from accepted continuation', () => {
  function freshFixture() {
    const f = database(), base = f.tables.training_plan_versions[0], plan = base.intent.weekly_plan
    Object.assign(base, { window_start: plan.windowStart, window_end: plan.windowEnd, sequence_number: plan.sequenceNumber })
    f.tables.coach_memories.push({ id: 'current-intent', user_id: 'athlete', memory_key: 'training_intent', kind: 'goal',
      version: 1, status: 'confirmed', content: intent() })
    return f
  }
  it('captures a newly confirmed intent only in the explicit first factual path; existing preparers still reject stale accepted facts', async () => {
    const f = freshFixture()
    await expect(fetchReviewedDoseContext(f.db, scope)).rejects.toThrow('Confirmed training intent changed')
    await expect(fetchReviewedDoseContext(f.db, scope, { firstReviewSetup: true })).rejects.toThrow('Confirmed training intent changed')
    const source = await fetchReviewedDoseContext(f.db, scope, { firstReviewSetup: true, firstReviewFacts: true })
    const target = structuredClone(source.profile); target.primaryGoal.domain = 'aerobic'; target.secondaryGoals = []
    expect(projectFirstReviewedProfileFacts(source, target).profile.trainingIntent?.memoryId).toBe('current-intent')
    expect(source.profile.trainingIntent).toBeUndefined()
    expect(f.rpc).not.toHaveBeenCalled()
  })
  it('does not resurrect an older confirmed intent when the latest is withdrawn', async () => {
    const f = freshFixture()
    f.tables.coach_memories.push({ ...f.tables.coach_memories[0], id: 'withdrawn', version: 2, status: 'withdrawn' })
    await expect(fetchReviewedDoseContext(f.db, scope, { firstReviewSetup: true, firstReviewFacts: true })).rejects.toThrow('Latest training intent')
  })
  it('rejects a first factual read without explicit setup scope or a mismatched legacy calendar', async () => {
    const f = freshFixture()
    await expect(fetchReviewedDoseContext(f.db, scope, { firstReviewFacts: true })).rejects.toThrow('explicit first-review setup')
    f.tables.training_plan_versions[0].window_start = '2026-09-14'
    await expect(fetchReviewedDoseContext(f.db, scope, { firstReviewSetup: true, firstReviewFacts: true })).rejects.toThrow('complete current legacy base')
  })
  it('rejects a referenced scheduled baseline whose current owned workout is unavailable', async () => {
    const f = freshFixture(), id = '00000000-0000-4000-8000-000000000099'
    f.tables.coach_memories[0].content.outcomes[0].baseline = { status: 'referenced', observationId: id }
    f.tables.performance_observation_groups.push({ id, user_id: 'athlete', source_kind: 'coach_completion', workout_id: 'missing-baseline' })
    await expect(fetchReviewedDoseContext(f.db, scope, { firstReviewSetup: true, firstReviewFacts: true })).rejects.toThrow('baseline execution is missing')
  })
})

describe('server-owned reviewed proposal preparation', () => {
  async function c2rEntry(fixture: ReturnType<typeof database>): Promise<TrustedReviewedWeekRegistration> {
    vi.setSystemTime(new Date('2026-08-09T20:00:00Z'))
    const c2rScope = { ...scope, historyThrough: '2026-08-09' }
    Object.assign(fixture.tables.workouts[0], reviewedC2rWorkout('athlete'))
    const week = reviewedC2rWeek()
    Object.assign(fixture.tables.training_plan_versions[0], { intent: { format: 'reviewed_weekly_intent_v0_1', horizon_weeks: 1, reviewed_week: week.base },
      window_start: week.base.windowStart, window_end: week.base.windowEnd, sequence_number: 1 })
    fixture.tables.coach_effective_prescribed_sessions = executionRows(week.base.scheduledSessions)
    const snapshot = await fetchReviewedDoseContext(fixture.db, c2rScope)
    const { profile: _profile, ...context } = week.input.context; void _profile
    return { id: 'c2r-week', userId: 'athlete', scope: c2rScope, contextHash: snapshot.contextHash,
      operation: 'reviewed_load_trial', doseReconciliation: week.reconciliation,
      compilation: { ...week.input, context }, reviewedWeeks: week.registry }
  }
  it('prepares the approved C2-R week through owned source reads with its complete dose receipt', async () => {
    const fixture = database(), entry = await c2rEntry(fixture), before = structuredClone(fixture.tables)
    const result = await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])
    expect(result.kind).toBe('prepared_registration')
    if (result.kind !== 'prepared_registration') throw new Error(result.reasons.join('; '))
    const receipt = result.packet.inputSnapshot.reviewedDoseReconciliation!
    expect(receipt.owner).toBe('athlete'); expect(receipt.contextHash).toBe(result.packet.source.contextHash)
    expect(receipt.basePlanVersionId).toBe(scope.basePlanVersionId)
    expect(receipt.option.before.targetRpe).toBeNull()
    expect(receipt.summary.proposed).toContain('170 lb total')
    expect(result.packet.intent.reviewed_week.scheduledSessions).toHaveLength(3)
    expect(fixture.tables).toEqual(before); expect(fixture.rpc).not.toHaveBeenCalled()
  })
  it('requires the explicitly reviewed factual source even when the enclosing context is rebound', async () => {
    const fixture = database(), entry = await c2rEntry(fixture)
    fixture.tables.workouts[0].blocks[0].movements[0].effort = [9, 9, 9]
    entry.contextHash = (await fetchReviewedDoseContext(fixture.db, entry.scope)).contextHash
    expect((await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])).kind).toBe('review_required')
  })
  it.each(['missing_link', 'undeclared_link', 'source_correction', 'irrelevant_source', 'wrong_owner', 'changed_base', 'missing_history'])(
    'refuses a C2-R packet after %s', async change => {
      const fixture = database(), entry = await c2rEntry(fixture)
      if (change === 'missing_link') delete entry.doseReconciliation
      if (change === 'undeclared_link') delete entry.operation
      if (change === 'source_correction') fixture.tables.workouts[0].blocks[0].movements[0].effort = [9, 9, 9]
      if (change === 'irrelevant_source') fixture.tables.workouts[0].blocks[0].movements[0].name = 'Squat'
      if (change === 'wrong_owner') fixture.state.owner = 'other'
      if (change === 'changed_base') fixture.tables.training_plan_versions[0].input_snapshot.changed = true
      if (change === 'missing_history') fixture.tables.workouts = []
      expect((await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])).kind).toBe('review_required')
    })
  async function nextWeekEntry(fixture: ReturnType<typeof database>) {
    const entry = await weekRegistration(fixture)
    entry.transition = 'next_week'
    entry.compilation.windowStart = '2026-08-10'
    entry.compilation.sequenceNumber = 2
    const reviewed = reviewedRollingWeek()
    // Mechanical date-binding transport variant, not new athlete coaching approval.
    const profile = { ...reviewed.plan.profileSnapshot, startDate: entry.compilation.windowStart }
    const registration = entry.reviewedWeeks[0]
    registration.recipe.profileHash = doseContentHash(profile)
    registration.contentHash = doseContentHash(registration.recipe)
    return entry
  }

  it('requires explicit adjacent-week review and binds the new date without rewriting the accepted profile', async () => {
    const fixture = database(), entry = await nextWeekEntry(fixture), before = structuredClone(fixture.tables)
    const result = await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])
    expect(result.kind).toBe('prepared_registration')
    if (result.kind !== 'prepared_registration') throw new Error('Expected next-week packet')
    expect(result.packet.intent.reviewed_week.profileSnapshot).toEqual({ ...reviewedRollingWeek().plan.profileSnapshot, startDate: '2026-08-10' })
    expect(result.packet.intent.reviewed_week).toMatchObject({ windowStart: '2026-08-10', windowEnd: '2026-08-16', sequenceNumber: 2 })
    expect(result.packet.inputSnapshot.reviewedWeekTransition.targetWindow).toEqual({ windowStart: '2026-08-10', windowEnd: '2026-08-16', sequenceNumber: 2 })
    expect(Object.keys(result.packet.inputSnapshot.reviewedWeekTransition.sourceWindow).sort()).toEqual(['sequenceNumber', 'windowEnd', 'windowStart'])
    expect(result.packet.inputSnapshot.reviewedExecutionContinuity.slots.every(slot => slot.executionSessionId === null)).toBe(true)
    expect(result.packet.inputSnapshot.reviewedExecutionContinuity.priorExecution?.every(slot => slot.disposition === 'unreported')).toBe(true)
    expect(fixture.tables).toEqual(before)
  })

  it.each(['implicit', 'old_profile_review', 'nonadjacent', 'same_sequence', 'skipped_sequence', 'direction', 'begun'])(
    'rejects next-week %s drift', async failure => {
      const fixture = database(), entry = await nextWeekEntry(fixture)
      if (failure === 'implicit') delete entry.transition
      if (failure === 'old_profile_review') entry.reviewedWeeks = reviewedRollingWeek().registry
      if (failure === 'nonadjacent') entry.compilation.windowStart = '2026-10-05'
      if (failure === 'same_sequence') entry.compilation.sequenceNumber = 1
      if (failure === 'skipped_sequence') entry.compilation.sequenceNumber = 3
      if (failure === 'direction') entry.compilation.direction.trainingIntent = undefined
      if (failure === 'begun') {
        fixture.tables.coach_effective_prescribed_sessions[0].has_reports = true
        entry.contextHash = (await fetchReviewedDoseContext(fixture.db, scope)).contextHash
      }
      if (failure === 'direction') entry.compilation.direction.currentEmphasis = []
      expect((await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])).kind).toBe('review_required')
    })

  it('retains completed and skipped prior execution as history while new dated exposures get fresh roots', async () => {
    const fixture = database(), entry = await nextWeekEntry(fixture)
    Object.assign(fixture.tables.coach_effective_prescribed_sessions[0], { status: 'completed', completed_workout_id: 'workout', completion_contract_version: 3, has_reports: true })
    Object.assign(fixture.tables.coach_effective_prescribed_sessions[1], { status: 'skipped', completion_contract_version: 3, has_reports: true })
    entry.contextHash = (await fetchReviewedDoseContext(fixture.db, scope)).contextHash
    const result = await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])
    expect(result.kind).toBe('prepared_registration')
    if (result.kind === 'prepared_registration') expect(result.packet.inputSnapshot.reviewedExecutionContinuity.priorExecution?.map(row => row.disposition))
      .toEqual(['completed', 'skipped', 'unreported', 'unreported', 'unreported'])
  })
  it.each(['owner', 'root', 'missing', 'count', 'prescription', 'status', 'reports'])(
    'fails closed when execution projection has %s drift', async failure => {
      const fixture = database(), entry = await weekRegistration(fixture)
      const rows = fixture.tables.coach_effective_prescribed_sessions
      if (failure === 'owner') fixture.state.wrongOwnerTable = 'coach_effective_prescribed_sessions'
      if (failure === 'root') rows[1].id = rows[0].id
      if (failure === 'missing') rows.pop()
      if (failure === 'count') fixture.state.serverCap = 3
      if (failure === 'prescription') rows[0].prescription = {}
      if (failure === 'status') rows[0].completed_workout_id = 'unexpected'
      if (failure === 'reports') rows[0].has_reports = true
      expect((await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])).kind).toBe('review_required')
    })

  it('binds raw legacy signal corrections even when execution status remains planned', async () => {
    const fixture = database(), entry = await weekRegistration(fixture)
    fixture.tables.coach_session_signals.push({ id: 'signal-1', user_id: 'athlete', signal: { actualReps: 4 } })
    expect((await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])).kind).toBe('review_required')
  })
  it('carries a nonempty confirmed intent into the existing SQL guard field', async () => {
    const fixture = database(), reviewed = reviewedRollingWeek()
    // Mechanical transport variant; this does not assert a new coaching review.
    const snapshot = { schemaVersion: 1 as const, memoryId: '11111111-1111-4111-8111-111111111111', memoryVersion: 1, content: intent() }
    reviewed.input.context.profile.trainingIntent = snapshot
    reviewed.input.direction = buildRollingTrainingDirection(reviewed.input.context.profile,
      { hypothesis: reviewed.input.direction.hypothesis, goalTargetDate: null })
    reviewed.registry[0].recipe.profileHash = doseContentHash(reviewed.input.context.profile)
    reviewed.registry[0].contentHash = doseContentHash(reviewed.registry[0].recipe)
    const built = buildReviewedRollingWeeklyPlan(reviewed.input, reviewed.registry)
    if (built.kind !== 'reviewed_candidate') throw new Error(built.reasons.join('; '))
    Object.assign(fixture.tables.training_plan_versions[0], {
      intent: { format: 'reviewed_weekly_intent_v0_1', horizon_weeks: 1, reviewed_week: built.plan },
      window_start: built.plan.windowStart, window_end: built.plan.windowEnd, sequence_number: 1,
    })
    fixture.tables.coach_memories.push({ id: snapshot.memoryId, user_id: 'athlete', memory_key: 'training_intent',
      status: 'confirmed', version: 1, content: snapshot.content })
    fixture.tables.coach_effective_prescribed_sessions = executionRows(built.plan.scheduledSessions)
    const source = await fetchReviewedDoseContext(fixture.db, scope)
    const { profile: _profile, ...context } = reviewed.input.context; void _profile
    const entry = { id: 'confirmed-intent-transport', userId: 'athlete', scope, contextHash: source.contextHash,
      compilation: { ...reviewed.input, context }, reviewedWeeks: reviewed.registry }
    const result = await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])
    expect(result.kind).toBe('prepared_registration')
    if (result.kind === 'prepared_registration') {
      expect(result.packet.intent.training_intent).toEqual(snapshot)
      expect(result.packet.intent.reviewed_week.profileSnapshot.trainingIntent).toEqual(snapshot)
      expect(result.packet.intent.reviewed_week.directionSnapshot.trainingIntent).toEqual(snapshot)
    }
    fixture.tables.coach_memories[0].status = 'withdrawn'
    expect((await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])).kind).toBe('review_required')
  })

  it('preserves exact full sessions and source bindings without writing or activating', async () => {
    const fixture = database(), entry = await weekRegistration(fixture)
    const before = structuredClone(fixture.tables)
    const result = await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])
    expect(result.kind).toBe('prepared_registration')
    if (result.kind !== 'prepared_registration') throw new Error('Expected prepared packet')
    expect(result.packet.intent.reviewed_week).toEqual(reviewedRollingWeek().plan)
    expect(result.packet.sessions).toEqual(reviewedRollingWeek().plan.scheduledSessions.map((slot, i) => ({
      week_number: 1, session_index: i + 1, scheduled_date: slot.scheduledDate, prescription: slot.prescription,
    })))
    expect(result.packet.inputSnapshot).toMatchObject({ contextRevision: 5, reviewedSourceHash: entry.contextHash })
    expect(result.packet.source.binding.base.plan).toEqual(before.training_plan_versions[0])
    expect(result.packet.source.validBefore).toBe('2026-09-28T05:00:00.000Z')
    expect(result.fingerprint).toBe(doseContentHash(result.packet))
    expect(result.persistable).toBe(false)
    expect(result.numericRuntimeEligible).toBe(false)
    expect(fixture.tables).toEqual(before)
    expect(fixture.rpc).not.toHaveBeenCalled()
    vi.setSystemTime(new Date('2026-09-27T20:00:30Z'))
    const repeated = await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])
    expect(repeated.kind === 'prepared_registration' && repeated.fingerprint).toBe(result.fingerprint)
  })

  it.each(['foreign', 'anonymous', 'unknown', 'duplicate', 'absent_revision'])(
    'rejects %s registration authority', async failure => {
      const fixture = database()
      if (failure === 'absent_revision') fixture.tables.coach_context_revisions = []
      const entry = await weekRegistration(fixture)
      if (failure === 'foreign') fixture.state.owner = 'other'
      if (failure === 'anonymous') fixture.state.owner = ''
      const result = await prepareReviewedWeekProposalRegistration(fixture.db,
        failure === 'unknown' ? 'not-registered' : entry.id, failure === 'duplicate' ? [entry, entry] : [entry])
      expect(result.kind).toBe('review_required')
      expect(fixture.rpc).not.toHaveBeenCalled()
    })

  it('rejects correction between compilation and final packet read', async () => {
    const fixture = database(), entry = await weekRegistration(fixture)
    let calls = 0
    vi.spyOn(fixture.db.auth, 'getUser').mockImplementation(async () => {
      if (++calls === 4) fixture.tables.workouts[0].notes = 'Stopped early with symptoms'
      return { data: { user: { id: fixture.state.owner } }, error: null } as Awaited<ReturnType<typeof fixture.db.auth.getUser>>
    })
    const result = await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])
    expect(result).toEqual({ kind: 'review_required', reasons: ['Reviewed source changed while preparing registration'] })
  })

  it('detaches nested authority before authentication yields', async () => {
    const fixture = database(), entry = await weekRegistration(fixture)
    const original = fixture.db.auth.getUser.bind(fixture.db.auth)
    vi.spyOn(fixture.db.auth, 'getUser').mockImplementationOnce(async () => {
      entry.reviewedWeeks[0].recipe.sessions[0].themes.push('unreviewed')
      entry.compilation.windowStart = '2026-08-10'
      return original()
    })
    const result = await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])
    expect(result.kind).toBe('prepared_registration')
    if (result.kind === 'prepared_registration') expect(result.packet.intent.reviewed_week).toEqual(reviewedRollingWeek().plan)
  })

  it.each(['effective_from', 'effective_until', 'review_after'])(
    'bounds registration before the next %s transition, including outside-work context', async field => {
      const fixture = database()
      fixture.tables.coach_memories.push({ id: 'outside', user_id: 'athlete', memory_key: 'outside_training',
        version: 1, status: 'confirmed', content: { note: 'Separate conditioning' }, [field]: '2026-09-27T20:01:00Z' })
      const entry = await weekRegistration(fixture)
      const result = await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])
      expect(result.kind).toBe('prepared_registration')
      if (result.kind === 'prepared_registration') expect(result.packet.source.validBefore).toBe('2026-09-27T20:01:00.000Z')
      vi.setSystemTime(new Date('2026-09-27T20:01:00Z'))
      expect((await prepareReviewedWeekProposalRegistration(fixture.db, entry.id, [entry])).kind).toBe('review_required')
    })

  it('uses explicit raw timezone offsets for the next local day boundary', async () => {
    const source = structuredClone(await fetchReviewedDoseContext(database().db, scope))
    source.binding.scope.tzOffset = -330
    source.binding.scope.historyThrough = '2026-09-28'
    expect(reviewedSourceValidBefore(source)).toBe('2026-09-28T18:30:00.000Z')
    source.binding.scope.tzOffset = 0
    source.binding.scope.historyThrough = '2026-09-27'
    expect(reviewedSourceValidBefore(source)).toBe('2026-09-28T00:00:00.000Z')
    source.binding.scope.historyThrough = '2026-09-26'
    expect(() => reviewedSourceValidBefore(source)).toThrow('Source day changed')
  })
})

describe('authenticated complete reviewed week', () => {
  it('preserves the entire dated week, preparation, protocols and spacing through an owned read', async () => {
    const fixture = database(), entry = await weekRegistration(fixture)
    const before = structuredClone(fixture.tables)
    const result = await compileAuthenticatedReviewedWeek(fixture.db, entry.id, [entry])
    expect(result.kind).toBe('reviewed_candidate')
    if (result.kind !== 'reviewed_candidate') throw new Error('Expected candidate')
    expect(result.plan).toEqual(reviewedRollingWeek().plan)
    expect(result.sourceBinding).toMatchObject({ userId: 'athlete', contextHash: entry.contextHash, scope, revision: 5 })
    expect(result.persistable).toBe(false)
    expect(result.numericRuntimeEligible).toBe(false)
    expect(fixture.tables).toEqual(before)
    expect(fixture.rpc).not.toHaveBeenCalled()
  })

  it.each(['correction', 'outside_work', 'goal', 'setup', 'base', 'revision', 'expiry', 'set_report'])(
    'rejects a whole week after %s drift', async change => {
      const fixture = database()
      fixture.tables.coach_memories.push({ id: 'outside', user_id: 'athlete', memory_key: 'outside_training', status: 'confirmed',
        version: 1, content: { note: 'No outside work' }, review_after: '2026-09-27T20:01:00Z' })
      const entry = await weekRegistration(fixture)
      if (change === 'correction') fixture.tables.workouts[0].notes = 'Stopped for pain'
      if (change === 'outside_work') fixture.tables.coach_memories[0].content.note = 'Added running'
      if (change === 'goal') fixture.tables.coach_memories.push({ id: 'goal', user_id: 'athlete', memory_key: 'training_intent', status: 'confirmed', version: 1, content: {} })
      if (change === 'setup') fixture.tables.training_plan_versions[0].intent.reviewed_week.profileSnapshot.sessionAvailability[0].minutes--
      if (change === 'base') fixture.tables.training_programs[0].active_plan_version_id = 'new-plan'
      if (change === 'revision') fixture.tables.coach_context_revisions[0].revision++
      if (change === 'set_report') fixture.tables.coach_reviewed_set_reports.push({ id: 'set-1', user_id: 'athlete', report: { rpe: 8 } })
      if (change === 'expiry') vi.setSystemTime(new Date('2026-09-27T20:02:00Z'))
      expect((await compileAuthenticatedReviewedWeek(fixture.db, entry.id, [entry])).kind).toBe('review_required')
    })

  it.each(['foreign', 'anonymous', 'duplicate', 'unknown', 'truncated', 'race'])(
    'fails closed for %s access or retrieval', async failure => {
      const fixture = database(), entry = await weekRegistration(fixture)
      fixture.queries.length = 0
      if (failure === 'foreign') fixture.state.owner = 'another-athlete'
      if (failure === 'anonymous') fixture.state.owner = ''
      if (failure === 'truncated') fixture.state.serverCap = 0
      if (failure === 'race') fixture.state.raceTable = 'coach_context_revisions'
      const entries = failure === 'duplicate' ? [entry, structuredClone(entry)] : [entry]
      expect((await compileAuthenticatedReviewedWeek(fixture.db, failure === 'unknown' ? 'missing' : entry.id, entries)).kind).toBe('review_required')
      if (['foreign', 'anonymous', 'duplicate', 'unknown'].includes(failure)) expect(fixture.queries).toHaveLength(0)
    })

  it.each(['recipe', 'facts', 'schedule', 'window', 'direction'])(
    'does not bypass the reviewed compiler for changed %s', async change => {
      const fixture = database(), entry = await weekRegistration(fixture)
      if (change === 'recipe') entry.reviewedWeeks[0].recipe.sessions[0].themes.push('unreviewed')
      if (change === 'facts') entry.compilation.context.facts.newFact = true
      if (change === 'schedule') entry.compilation.context.scheduleId = 'unreviewed'
      if (change === 'window') entry.compilation.windowStart = '2026-08-10'
      if (change === 'direction') entry.compilation.direction = {} as typeof entry.compilation.direction
      expect((await compileAuthenticatedReviewedWeek(fixture.db, entry.id, [entry])).kind).toBe('review_required')
    })

  it('detaches complete trusted authority before the first authentication await', async () => {
    const fixture = database(), entry = await weekRegistration(fixture)
    const original = fixture.db.auth.getUser.bind(fixture.db.auth)
    vi.spyOn(fixture.db.auth, 'getUser').mockImplementationOnce(async () => {
      entry.contextHash = 'changed'
      entry.compilation.windowStart = '2026-08-10'
      entry.reviewedWeeks[0].recipe.sessions[0].themes.push('changed')
      return original()
    })
    const result = await compileAuthenticatedReviewedWeek(fixture.db, entry.id, [entry])
    expect(result.kind).toBe('reviewed_candidate')
    if (result.kind === 'reviewed_candidate') expect(result.plan).toEqual(reviewedRollingWeek().plan)
  })
})

describe('authenticated reviewed-dose source binding', () => {
  it.each(['window_start', 'window_end', 'sequence_number'])('rejects a reviewed base with inconsistent %s metadata', async field => {
    const fixture = database(), reviewed = reviewedRollingWeek()
    Object.assign(fixture.tables.training_plan_versions[0], { intent: reviewed.intent,
      window_start: reviewed.plan.windowStart, window_end: reviewed.plan.windowEnd, sequence_number: 1 })
    fixture.tables.training_plan_versions[0][field] = field === 'sequence_number' ? 2 : '2026-08-10'
    await expect(fetchReviewedDoseContext(fixture.db, scope)).rejects.toThrow('Reviewed accepted window changed')
  })
  it('uses auth-owned database sources and compiles offline against an exact trusted registration', async () => {
    const fixture = database(), entry = await registration(fixture)
    const result = await compileAuthenticatedReviewedSession(fixture.db, 'C2-R', [entry])
    expect(result.kind).toBe('compiled')
    if (result.kind !== 'compiled') throw new Error('Expected compiled')
    expect(result.session.persistable).toBe(false)
    expect(result.session.numericRuntimeEligible).toBe(false)
    expect(result.session.working.loadAnchor?.loadRange).toEqual({ min: 170, max: 170, unit: 'lb' })
    expect(fixture.queries.every(query => query.filters.user_id === 'athlete')).toBe(true)
    expect(fixture.queries.find(query => query.table === 'workouts')?.columns).toContain('notes,input_text')
    expect(fixture.rpc).not.toHaveBeenCalled()
  })

  it('keeps unchanged reads stable across time without claiming complete logging', async () => {
    const fixture = database(), first = await fetchReviewedDoseContext(fixture.db, scope)
    vi.setSystemTime(new Date('2026-09-27T20:05:00Z'))
    const next = await fetchReviewedDoseContext(fixture.db, scope)
    expect(next.contextHash).toBe(first.contextHash)
    expect(next.asOf).not.toBe(first.asOf)
    expect(next.performed.coverage.athleteCoverage).toBe('unknown')
  })

  it('does not hide later contradictory work behind an older selected history cutoff', async () => {
    await expect(fetchReviewedDoseContext(database().db, { ...scope, historyThrough: '2026-09-25' })).rejects.toThrow('excludes current training')
  })

  it('rejects a newly saved row beyond the process clock rather than filtering it into empty history', async () => {
    const fixture = database()
    fixture.tables.workouts[0].created_at = '2026-09-27T20:00:02Z'
    fixture.tables.workouts[0].updated_at = '2026-09-27T20:00:02Z'
    await expect(fetchReviewedDoseContext(fixture.db, scope)).rejects.toThrow('timestamps exceed')
  })

  it.each(['notes', 'input_text', 'correction', 'new_workout', 'deletion', 'observation', 'import', 'memory', 'revision'])(
    'invalidates a prior reviewed registration after %s changes', async change => {
      const fixture = database(), entry = await registration(fixture)
      if (change === 'notes') fixture.tables.workouts[0].notes = 'Stopped for pain'
      if (change === 'input_text') fixture.tables.workouts[0].input_text = 'Changed execution'
      if (change === 'correction') fixture.tables.workouts[0].capture_revision++
      if (change === 'new_workout') fixture.tables.workouts.push({ ...fixture.tables.workouts[0], id: 'new-workout', workout_date: '2026-09-26' })
      if (change === 'deletion') fixture.tables.workouts = []
      if (change === 'observation') fixture.tables.performance_observation_values.push({ id: 'new-value', user_id: 'athlete', value_numeric: 8 })
      if (change === 'import') fixture.tables.measurement_imports.push({ id: 'new-import', user_id: 'athlete', status: 'pending' })
      if (change === 'memory') fixture.tables.coach_memories.push({ id: 'outside-1', user_id: 'athlete', memory_key: 'outside_training', status: 'confirmed', version: 1, content: { note: 'Added running' } })
      if (change === 'revision') fixture.tables.coach_context_revisions[0].revision++
      expect((await compileAuthenticatedReviewedSession(fixture.db, 'C2-R', [entry])).kind).toBe('review_required')
    },
  )

  it('invalidates clock-driven memory expiry even without a source write', async () => {
    const fixture = database()
    fixture.tables.coach_memories.push({ id: 'outside-1', user_id: 'athlete', memory_key: 'outside_training', status: 'confirmed', version: 1,
      content: { note: 'No other work' }, review_after: '2026-09-27T20:01:00Z' })
    const entry = await registration(fixture)
    vi.setSystemTime(new Date('2026-09-27T20:02:00Z'))
    expect((await compileAuthenticatedReviewedSession(fixture.db, 'C2-R', [entry])).kind).toBe('review_required')
  })

  it('rejects memory expiry during a single asynchronous read', async () => {
    const fixture = database()
    fixture.tables.coach_memories.push({ id: 'outside-1', user_id: 'athlete', memory_key: 'outside_training', status: 'confirmed', version: 1,
      content: { note: 'No other work' }, review_after: '2026-09-27T20:01:00Z' })
    fixture.state.expireDuringRead = true
    await expect(fetchReviewedDoseContext(fixture.db, scope)).rejects.toThrow('changed during read')
  })

  it.each(['performance_observation_values', 'workouts', 'coach_checkins'])('detects silent server row clamps on %s using exact counts', async table => {
    const fixture = database()
    const seed = fixture.tables[table][0] ?? { user_id: 'athlete' }
    fixture.tables[table] = Array.from({ length: 12 }, (_, i) => ({ ...seed, id: `row-${i}` }))
    fixture.state.serverCap = 10
    await expect(fetchReviewedDoseContext(fixture.db, scope)).rejects.toThrow()
  })

  it.each(['coach_context_revisions', 'training_programs', 'training_plan_versions'])('rejects a read race on %s', async table => {
    const fixture = database(); fixture.state.raceTable = table
    await expect(fetchReviewedDoseContext(fixture.db, scope)).rejects.toThrow()
  })

  it.each(['workouts', 'coach_memories', 'coach_strength_assessments', 'performance_observation_groups', 'performance_observation_values', 'measurement_imports'])(
    'fails closed on %s failure and truncation', async table => {
      const fixture = database()
      fixture.state.errorTable = table
      await expect(fetchReviewedDoseContext(fixture.db, scope)).rejects.toThrow()
      fixture.state.errorTable = ''
      const seed = fixture.tables[table][0] ?? { user_id: 'athlete' }
      fixture.tables[table] = Array.from({ length: 1001 }, (_, i) => ({ ...seed, id: `row-${i}` }))
      await expect(fetchReviewedDoseContext(fixture.db, scope)).rejects.toThrow()
    },
  )

  it.each(['training_programs', 'training_plan_versions', 'workouts', 'coach_context_revisions'])(
    'rejects a cross-owner row from %s even if a client ignores RLS', async table => {
      const fixture = database(); fixture.state.wrongOwnerTable = table
      await expect(fetchReviewedDoseContext(fixture.db, scope)).rejects.toThrow()
    },
  )

  it('cannot select another athlete registration, and anonymous calls do not read tables', async () => {
    const fixture = database(), entry = await registration(fixture)
    entry.userId = 'someone-else'
    expect((await compileAuthenticatedReviewedSession(fixture.db, 'C2-R', [entry])).kind).toBe('review_required')
    fixture.state.owner = ''; fixture.queries.length = 0
    expect((await compileAuthenticatedReviewedSession(fixture.db, 'C2-R', [entry])).kind).toBe('review_required')
    expect(fixture.queries).toEqual([])
  })

  it('does not revive a withdrawn intent over the accepted base or replace missing context with zero work', async () => {
    const fixture = database()
    fixture.tables.coach_context_revisions = []
    expect((await fetchReviewedDoseContext(fixture.db, scope)).binding.revision).toBe(0)
    fixture.tables.coach_memories.push({ id: 'intent-new', user_id: 'athlete', memory_key: 'training_intent', version: 2, status: 'withdrawn', content: {} })
    await expect(fetchReviewedDoseContext(fixture.db, scope)).rejects.toThrow('intent changed')
  })
})
