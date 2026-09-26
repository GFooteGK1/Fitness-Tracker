import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/app/lib/coach/proposal-context-revision', async original => ({ ...await original<typeof import('@/app/lib/coach/proposal-context-revision')>(), fetchCoachContextRevision: vi.fn().mockResolvedValue(7) }))
vi.mock('@/app/lib/coach/direction-reconciliation-server', () => ({ fetchDirectionReconciliation: vi.fn().mockResolvedValue({ version: 'direction-reconciliation-1', status: 'unchanged', reasons: [], changedFields: [] }) }))
vi.mock('@/app/lib/coach/evidence-context', async original => ({ ...await original<typeof import('@/app/lib/coach/evidence-context')>(), fetchCoachEvidenceContext: vi.fn() }))
vi.mock('@/app/lib/coach/athlete-context', () => ({ fetchCoachRuntimeContext: vi.fn() }))
vi.mock('@/app/lib/coach/performed-work-context', async original => ({ ...await original<typeof import('@/app/lib/coach/performed-work-context')>(), fetchPerformedWorkContextForCoaching: vi.fn() }))
vi.mock('@/app/lib/coach/weekly-review', async original => ({ ...await original<typeof import('@/app/lib/coach/weekly-review')>(), buildRollingWeeklyReview: vi.fn() }))

import { POST } from '@/app/api/coach/weekly/review/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachEvidenceContext } from '@/app/lib/coach/evidence-context'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import { buildPerformedWorkContext, fetchPerformedWorkContextForCoaching } from '@/app/lib/coach/performed-work-context'
import { buildSignalEvidenceContext } from '@/app/lib/coach/signal-evidence-context'
import { buildRollingWeeklyReview } from '@/app/lib/coach/weekly-review'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { buildStoredRollingWeeklyIntent } from '@/app/lib/coach/rolling-weekly-api'
import { buildAdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'
import { GOLDEN_PROGRAMMING_PROFILES } from '../coach/golden-programming-profiles'
import { reasoningEvidencePacket } from '../fixtures/coach-reasoning-evidence'
import { workSnapshot } from '../fixtures/coach-performed-work'

const profile = { ...structuredClone(GOLDEN_PROGRAMMING_PROFILES[0].profile), startDate: '2026-09-07' }
const direction = buildRollingTrainingDirection(profile, { hypothesis: 'Synthetic weekly context fixture.', goalTargetDate: null })
const week = buildRollingWeeklyPlan({ source: 'initial', windowStart: profile.startDate, profile, direction })
if (week.kind !== 'weekly_plan') throw new Error('Expected synthetic week')
const stored = buildStoredRollingWeeklyIntent(week, buildAdaptivePlanContract(profile, [week]))

function fixture() {
  const packet = reasoningEvidencePacket('user-1'), work = workSnapshot()
  packet.activePlan = { ...packet.activePlan!, programId: 'program-1', planVersionId: 'plan-1' }
  work.userId = 'user-1'; work.asOf = packet.asOf; work.workouts[0].user_id = 'user-1'; work.workouts[0].rpe = 7
  for (const sample of packet.evidenceSeries[0].samples) {
    sample.workoutId = 'work-1'; sample.comparison.movementId = 'barbell_floor_press'
    sample.valueProvenance = { measurementCoverage: { version: 1, expectedSensorReadings: 3, performedRepetitions: 4 } }
  }
  return { packet, performed: buildPerformedWorkContext(work) }
}
function client() {
  const tables: Record<string, unknown[]> = {
    training_programs: [{ id: 'program-1', active_plan_version_id: 'plan-1', direction }],
    training_plan_versions: [{ id: 'plan-1', intent: stored, input_snapshot: {}, window_start: week.windowStart, window_end: week.windowEnd }],
    prescribed_sessions: [], coach_checkins: []
  }
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    rpc: vi.fn().mockResolvedValue({ data: [{ review_id: 'review-1' }], error: null }),
    from: vi.fn((table: string) => {
      const q = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn() }
      q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.in.mockReturnValue(q)
      q.order.mockResolvedValue({ data: tables[table], error: null }); q.limit.mockResolvedValue({ data: tables[table], error: null })
      return q
    }) }
}
function request() {
  return new Request('http://localhost/api/coach/weekly/review', { method: 'POST', body: JSON.stringify({
    asOf: '2026-09-21T12:00:00.000Z', tzOffset: 300, windowDays: 84, reviewIdempotencyKey: 'synthetic-review-1'
  }) })
}
function configure() {
  const f = fixture(), db = client()
  vi.mocked(createServerClient).mockResolvedValue(db as never)
  vi.mocked(fetchCoachEvidenceContext).mockResolvedValue(f.packet)
  vi.mocked(fetchCoachRuntimeContext).mockResolvedValue({ activeProgram: { id: 'program-1', activePlanVersionId: 'plan-1' }, assessments: [] } as never)
  vi.mocked(fetchPerformedWorkContextForCoaching).mockResolvedValue(f.performed)
  vi.mocked(buildRollingWeeklyReview).mockReturnValue({ status: 'ready', reviewedAt: f.packet.asOf, action: 'collect_signal',
    presentationClass: 'needs_signal', evidenceStatus: 'insufficient', rationale: ['Collect comparable observations.'], missing: [],
    windowStart: week.windowStart, reviewReason: 'week_ended', evidenceSnapshot: null, observationLinks: [], observationSources: [], executionSources: [],
    doseChange: null, signalRequest: null, safetyBoundary: null, proposal: { eligible: false },
    algorithmVersion: 'weekly-review-0.3.0', policyVersion: 'rolling-weekly-0.1.0' } as never)
  return { ...f, db }
}

describe('weekly review factual signal attachment', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persists and returns real readings beside actual work under the same owned snapshot and timezone', async () => {
    const { packet, performed, db } = configure()
    const response = await POST(request()), body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(201)
    expect(fetchPerformedWorkContextForCoaching).toHaveBeenCalledWith(db, 'user-1', {
      includeCoachContext: true, agentTzOffset: -300, asOf: packet.asOf, windowDays: 84
    })
    const expected = buildSignalEvidenceContext(packet, 'user-1', performed)
    expect(body.review.signalEvidence).toEqual(expected)
    expect(body.review.signalEvidence.observations[0]).toMatchObject({ observedReadings: 2,
      readings: [{ value: 0.57 }, { value: 0.52 }], counts: { expectedSensorReadings: 3, performedRepetitions: 4 },
      workingEvidence: [{ completionState: 'not_independently_verified', sessionEffort: { scope: 'session', value: 7 } }] })
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith('record_coach_weekly_review', expect.objectContaining({
      p_rationale: expect.objectContaining({ signalEvidence: expected, contextRevision: 7 })
    }))
    expect(body.review.action).toBe('collect_signal'); expect(body.review.doseChange).toBeNull()
    expect(body.activePlanChanged).toBe(false)
  })

  it('includes changes in factual readings in the review fingerprint without changing policy', async () => {
    const { packet, db } = configure()
    await POST(request())
    const first = db.rpc.mock.calls[0][1].p_input_fingerprint
    packet.evidenceSeries[0].samples[0].value = 0.61
    const response = await POST(request()), body = await response.json()
    expect(response.status).toBe(201)
    expect(db.rpc.mock.calls[1][1].p_input_fingerprint).not.toBe(first)
    expect(body.review.action).toBe('collect_signal'); expect(body.review.doseChange).toBeNull()
  })

  it.each(['foreign_owner', 'different_snapshot'])('rejects %s performed context before persistence', mutation => {
    return (async () => {
      const { performed, db } = configure(), log = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        if (mutation === 'foreign_owner') performed.userId = 'foreign-private'
        else performed.asOf = '2026-09-20T12:00:00.000Z'
        const response = await POST(request()), body = await response.json()
        expect(response.status).toBe(500); expect(db.rpc).not.toHaveBeenCalled()
        expect(JSON.stringify(body)).not.toContain('foreign-private')
      } finally { log.mockRestore() }
    })()
  })

  it('keeps an unavailable work source explicit without fabricating performed quantities', async () => {
    const { performed } = configure()
    performed.status = 'unavailable'; performed.records = []
    const response = await POST(request()), body = await response.json()
    expect(response.status).toBe(201)
    expect(body.review.signalEvidence.coverage.performedWork).toBe('unavailable')
    expect(body.review.signalEvidence.observations[0].workingEvidence).toEqual([])
  })
})
