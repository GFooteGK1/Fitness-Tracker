import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCoachingContext, selectOnlyClient } from '@/app/lib/coach/coaching-context-server'
import { contextClient, contextNow, contextOwner, contextRows } from '../fixtures/coaching-context'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'

const params = () => new URLSearchParams({ tzOffset: '0', days: '28' })

describe('authenticated coaching context: requirements established before implementation', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(contextNow); vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'true') })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it('returns exact saved programming, dated recovery and goal provenance without writes', async () => {
    const { db, traces, writes } = contextClient()
    const result = await readCoachingContext(db, params())
    expect(result).toMatchObject({ schemaVersion: 1, purpose: 'today_training', authority: 'factual_context_only',
      localDate: '2026-10-18', acceptedProgramming: { plan: { id: 'accepted-one', status: 'accepted' },
        todaySessions: [{ id: 'session-one', prescription: { exactSavedLoad: 17.5 } }] },
      requirements: { training_intent: { status: 'current', source: { id: 'memory-training_intent', version: 1 } } },
      recovery: { metrics: { recovery: { status: 'current', sourceDateBasis: 'UTC', record: { recovery_score: 71 } } } } })
    expect(result.performedWork?.coverage.athleteCoverage).toBe('unknown')
    expect(writes).not.toHaveBeenCalled()
    for (const trace of traces) expect(trace.filters).toContainEqual(['user_id', contextOwner])
    expect(JSON.stringify(result)).not.toContain('token-id-only')
  })

  it('rejects unauthenticated requests before any data reads', async () => {
    const { db } = contextClient(undefined, { authenticated: false })
    await expect(readCoachingContext(db, params())).rejects.toMatchObject({ status: 401 })
    expect(db.from).not.toHaveBeenCalled()
  })

  it.each(['user_id=other', 'asOf=2030-01-01', 'tzOffset=1.5', 'tzOffset=9999', 'tzOffset=', 'days=0', 'days=91', 'days=1.5', 'days=abc', 'tzOffset=0&tzOffset=10'])('rejects invalid/overriding selectors: %s', async query => {
    const { db } = contextClient()
    const input = new URLSearchParams(query)
    if (!input.has('tzOffset')) input.set('tzOffset', '0')
    await expect(readCoachingContext(db, input)).rejects.toMatchObject({ status: 400 })
    expect(db.from).not.toHaveBeenCalled()
  })

  it('rejects a foreign record even when a database adapter fails to apply ownership filters', async () => {
    const rows = contextRows(); rows.user_profiles[0].user_id = 'foreign-owner'; rows.user_profiles[0].fitness_goals = ['private-goal']
    const { db } = contextClient(rows, { foreignRows: true })
    await expect(readCoachingContext(db, params())).rejects.toMatchObject({ status: 503, message: 'Coaching context is unavailable' })
  })

  it('does not initialize missing profile/revision rows or invent missing plans/requirements', async () => {
    const rows = contextRows()
    for (const key of ['user_profiles', 'coach_context_revisions', 'coach_memories', 'training_programs']) rows[key] = []
    const { db, writes } = contextClient(rows)
    const result = await readCoachingContext(db, params())
    expect(result.acceptedProgramming).toBeNull()
    expect(result.requirements.training_intent.status).toBe('missing')
    expect(result.gaps).toEqual(expect.arrayContaining(['profile_missing', 'context_revision_missing', 'accepted_plan_missing', 'training_intent_missing']))
    expect(rows.user_profiles).toEqual([]); expect(rows.coach_context_revisions).toEqual([])
    expect(writes).not.toHaveBeenCalled()
  })

  it('never substitutes an unaccepted proposal for the saved session', async () => {
    const rows = contextRows()
    rows.adaptation_proposals = [{ id: 'proposal-new', user_id: contextOwner, program_id: 'program-one', status: 'proposed', base_plan_version_id: 'accepted-one', proposed_plan_version_id: 'unaccepted-new', rationale: { why: 'Not yet accepted' }, created_at: contextNow }]
    const result = await readCoachingContext(contextClient(rows).db, params())
    expect(result.acceptedProgramming?.todaySessions[0].id).toBe('session-one')
    expect(result.proposals.items[0]).toMatchObject({ id: 'proposal-new', status: 'proposed', canReplaceAcceptedPlan: false, sourceValidity: 'unverified' })
  })

  it.each(['stale', 'partial', 'missing'])('preserves %s WHOOP as an explicit gap', async state => {
    const rows = contextRows()
    if (state === 'stale') rows.whoop_recovery[0].date = '2026-10-16'
    if (state === 'partial') rows.whoop_sync_status[0].status = 'syncing'
    if (state === 'missing') rows.whoop_sleep = []
    const result = await readCoachingContext(contextClient(rows).db, params())
    expect(result.status).toBe('partial')
    if (state === 'stale') expect(result.recovery.metrics.recovery).toMatchObject({ status: 'stale', usableAsCurrent: false })
    if (state === 'partial') expect(result.recovery.metrics.recovery.usableAsCurrent).toBe(false)
    if (state === 'missing') expect(result.recovery.metrics.sleep.status).toBe('missing')
  })

  it('does not revive a withdrawn latest requirement', async () => {
    const rows = contextRows(); rows.coach_memories.push({ ...rows.coach_memories[2], id: 'withdrawn', version: 2, status: 'withdrawn' })
    const result = await readCoachingContext(contextClient(rows).db, params())
    expect(result.requirements.training_schedule).toMatchObject({ status: 'withdrawn', value: null })
    expect(result.evidence?.memories.some(memory => memory.memoryKey === 'training_schedule')).toBe(false)
    expect(result.evidence?.requirementMemoryExclusions).toEqual(expect.arrayContaining([
      expect.objectContaining({ memoryKey: 'training_schedule', reason: 'not_current_requirement' }),
    ]))
  })

  it('returns a retryable conflict for changed sources during assembly', async () => {
    const rows = contextRows()
    const { db } = contextClient(rows, { onRead: (table, read) => { if (table === 'coach_context_revisions' && read === 2) rows.coach_context_revisions[0].revision = 4 } })
    await expect(readCoachingContext(db, params())).rejects.toMatchObject({ status: 409 })
  })

  it('keeps unavailable WHOOP distinct while factual history is readable with planning disabled', async () => {
    vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'false')
    const result = await readCoachingContext(contextClient(undefined, { failTable: 'whoop_sleep' }).db, params())
    expect(result.recovery.metrics.sleep.status).toBe('unavailable')
    expect(result.performedWork).toMatchObject({ status: 'no_records', coverage: { complete: true, athleteCoverage: 'unknown' } })
    expect(result.gaps).not.toContain('performed_work_disabled')
    expect(JSON.stringify(result)).not.toContain('private provider detail')
  })

  it('uses raw timezone offsets and marks UTC WHOOP calendar alignment as unverified near midnight', async () => {
    vi.setSystemTime('2026-10-18T01:00:00.000Z')
    const result = await readCoachingContext(contextClient().db, new URLSearchParams({ tzOffset: '300' }))
    expect(result.localDate).toBe('2026-10-17')
    expect(result.recovery.localDayAlignment).toBe('unverified')
  })

  it('blocks hidden mutations and RPCs in reused readers', () => {
    const { db, writes } = contextClient(); const guarded = selectOnlyClient(db)
    expect(() => guarded.from('user_profiles').insert({})).toThrow('SELECT-only')
    expect(() => guarded.rpc('get_coach_context_revision')).toThrow('SELECT-only')
    expect(writes).not.toHaveBeenCalled()
  })

  it('keeps a plan read outage distinct from an absent plan', async () => {
    const result = await readCoachingContext(contextClient(undefined, { failTable: 'training_plan_versions' }).db, params())
    expect(result.acceptedProgramming).toBeNull()
    expect(result.gaps).toContain('accepted_plan_unavailable')
    expect(result.gaps).not.toContain('accepted_plan_missing')
  })

  it.each(['missing_value', 'future_value', 'future_sync', 'disconnected'])('does not advertise %s recovery as current', async state => {
    const rows = contextRows()
    if (state === 'missing_value') rows.whoop_recovery[0].recovery_score = null
    if (state === 'future_value') rows.whoop_recovery[0].created_at = '2026-10-19T00:00:00.000Z'
    if (state === 'future_sync') rows.whoop_sync_status[0].last_sync_at = '2026-10-19T00:00:00.000Z'
    if (state === 'disconnected') rows.whoop_tokens = []
    const result = await readCoachingContext(contextClient(rows).db, params())
    expect(result.recovery.metrics.recovery.usableAsCurrent).toBe(false)
  })

  it('labels a source-capped session read unavailable instead of returning an incomplete week', async () => {
    const rows = contextRows()
    rows.prescribed_sessions = Array.from({ length: 65 }, (_, i) => ({ ...rows.prescribed_sessions[0], id: `session-${i}`, session_index: i + 1 }))
    const result = await readCoachingContext(contextClient(rows).db, params())
    expect(result.acceptedProgramming).toBeNull()
    expect(result.gaps).toContain('accepted_plan_unavailable')
  })

  it('preserves exact reviewed prescriptions and their effective execution identity', async () => {
    const rows = contextRows(), reviewed = reviewedRollingWeek()
    const plan = reviewed.plan
    rows.training_plan_versions[0].intent = reviewed.intent
    rows.training_plan_versions[0].input_snapshot = { reviewedExecutionStorage: 'reviewed_execution_slots_v1' }
    rows.coach_effective_prescribed_sessions = plan.scheduledSessions.map((session, index) => ({
      id: `effective-${index}`, user_id: contextOwner, program_id: 'program-one', plan_version_id: 'accepted-one',
      execution_plan_version_id: 'execution-plan', week_number: 1, session_index: index + 1,
      scheduled_date: session.scheduledDate, prescription: session.prescription, status: 'planned',
      completed_workout_id: null, completion_contract_version: null, has_reports: false,
    }))
    const date = plan.scheduledSessions[0].scheduledDate
    vi.setSystemTime(`${date}T12:00:00.000Z`)
    const result = await readCoachingContext(contextClient(rows).db, params())
    expect(result.acceptedProgramming?.todaySessions[0]).toMatchObject({ id: 'effective-0', execution_plan_version_id: 'execution-plan' })
    expect(result.acceptedProgramming?.todaySessions[0].prescription).toEqual(plan.scheduledSessions[0].prescription)
  })

  it('does not export private plan storage even when it is large, retaining the exact saved session', async () => {
    const rows = contextRows(); rows.training_plan_versions[0].input_snapshot = { old: 'x'.repeat(33_000) }
    const result = await readCoachingContext(contextClient(rows).db, params())
    expect(result.acceptedProgramming?.plan?.input_snapshot).toBeNull()
    expect(result.acceptedProgramming?.todaySessions[0].prescription).toEqual(rows.prescribed_sessions[0].prescription)
    expect(result.acceptedProgramming?.plan?.inputSnapshotStatus).toBe('private_storage_not_exported')
  })

  it('minimizes nested storage metadata while preserving saved coaching rationale', async () => {
    const rows = contextRows()
    rows.training_plan_versions[0].input_snapshot = {
      firstReviewDesignation: { reviewerId: 'internal-reviewer', id: 'internal-designation' },
      reviewedRegistrationId: 'internal-registration', firstReviewProfileConfirmationRequestId: 'internal-confirmation',
      firstReviewedDraft: { privateNote: 'private-preparation-draft' },
    }
    rows.training_plan_versions[0].intent = { rationale: 'Saved coaching explanation',
      privateMetadata: 'internal-intent-metadata', weekly_plan: { title: 'Saved week',
        directionSnapshot: { hypothesis: 'Train consistently', privateMetadata: 'internal-direction-metadata' },
        profileSnapshot: { privateMetadata: 'internal-profile-snapshot' } } }
    rows.training_programs[0].direction = { hypothesis: 'Train consistently', reviewerId: 'internal-program-reviewer' }
    rows.adaptation_proposals = [{ id: 'accepted-origin', user_id: contextOwner, program_id: 'program-one',
      status: 'accepted', proposed_plan_version_id: 'accepted-one', created_at: contextNow,
      rationale: { explanation: 'Keep the accepted progression', reviewerId: 'internal-origin-reviewer' } }]
    const result = await readCoachingContext(contextClient(rows).db, params())
    const serialized = JSON.stringify(result)
    for (const privateValue of ['internal-reviewer', 'internal-designation', 'internal-registration', 'internal-confirmation',
      'private-preparation-draft', 'internal-intent-metadata', 'internal-direction-metadata', 'internal-profile-snapshot',
      'internal-program-reviewer', 'internal-origin-reviewer']) expect(serialized).not.toContain(privateValue)
    expect(result.acceptedProgramming?.plan?.intent).toMatchObject({ rationale: 'Saved coaching explanation' })
    expect(result.acceptedProgramming?.savedRationale?.rationale).toEqual({ explanation: 'Keep the accepted progression' })
    expect(result.acceptedProgramming?.todaySessions[0].prescription).toEqual(rows.prescribed_sessions[0].prescription)
  })

  it('never invokes network/model calls while composing a fixture package', async () => {
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'))
    await readCoachingContext(contextClient().db, params())
    expect(network).not.toHaveBeenCalled()
  })

  it('reports expired goals and rest days without generating a replacement session', async () => {
    const rows = contextRows(); rows.coach_memories[0].effective_until = '2026-10-18T00:00:00.000Z'
    rows.prescribed_sessions[0].scheduled_date = '2026-10-19'
    const result = await readCoachingContext(contextClient(rows).db, params())
    expect(result.requirements.training_intent).toMatchObject({ status: 'expired', value: null })
    expect(result.acceptedProgramming?.todaySessions).toEqual([])
    expect(result.gaps).toContain('no_saved_session_for_local_date')
  })
})
