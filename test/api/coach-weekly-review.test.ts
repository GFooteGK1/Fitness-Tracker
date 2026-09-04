import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn()
}))
vi.mock('@/app/lib/coach/evidence-context', async importOriginal => {
  const actual = await importOriginal<typeof import('@/app/lib/coach/evidence-context')>()
  return { ...actual, fetchCoachEvidenceContext: vi.fn() }
})
vi.mock('@/app/lib/coach/athlete-context', async importOriginal => {
  const actual = await importOriginal<typeof import('@/app/lib/coach/athlete-context')>()
  return { ...actual, fetchCoachRuntimeContext: vi.fn() }
})
vi.mock('@/app/lib/coach/weekly-review', async importOriginal => {
  const actual = await importOriginal<typeof import('@/app/lib/coach/weekly-review')>()
  return { ...actual, buildRollingWeeklyReview: vi.fn() }
})

import { POST } from '@/app/api/coach/weekly/review/route'
import { buildAdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import { fetchCoachEvidenceContext } from '@/app/lib/coach/evidence-context'
import {
  buildStoredRollingWeeklyIntent,
  profileForDirectionHorizon
} from '@/app/lib/coach/rolling-weekly-api'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import {
  buildRollingWeeklyPlan,
  type RollingWeeklyPlanDraft
} from '@/app/lib/coach/rolling-weekly-plan'
import type { ProgrammingProfile } from '@/app/lib/coach/programming-schema'
import { buildRollingWeeklyReview } from '@/app/lib/coach/weekly-review'
import { GOLDEN_PROGRAMMING_PROFILES } from '@/test/coach/golden-programming-profiles'

const PROGRAM_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const REVIEW_ID = '33333333-3333-4333-8333-333333333333'
const PROPOSAL_ID = '44444444-4444-4444-8444-444444444444'
const NEXT_PLAN_ID = '55555555-5555-4555-8555-555555555555'
const profile = profileForDirectionHorizon(
  withStart(GOLDEN_PROGRAMMING_PROFILES[0].profile, '2026-09-07'),
  '2026-09-07',
  '2026-12-31'
)
const direction = buildRollingTrainingDirection(profile, {
  hypothesis: 'Repeatable standardized strength exposures will improve the direct outcome.',
  goalTargetDate: '2026-12-31'
})
const week = initialWeek()
const adaptivePlan = buildAdaptivePlanContract(profile, [week])
const intent = buildStoredRollingWeeklyIntent(week, adaptivePlan)

describe('POST /api/coach/weekly/review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchCoachEvidenceContext)
      .mockResolvedValueOnce(context('adaptation_review') as never)
      .mockResolvedValueOnce(context('general_coaching') as never)
    vi.mocked(fetchCoachRuntimeContext).mockResolvedValue({
      storageAvailable: true,
      assessments: [],
      activeProgram: { id: PROGRAM_ID, activePlanVersionId: PLAN_ID }
    } as never)
    vi.mocked(buildRollingWeeklyReview).mockReturnValue(readyReview() as never)
  })

  it('stores the review and creates one adjacent continuation proposal', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await POST(reviewRequest())
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      proposalId: PROPOSAL_ID,
      planVersionId: NEXT_PLAN_ID,
      activePlanChanged: false,
      acceptanceRequired: true
    })
    expect(fetchCoachEvidenceContext).toHaveBeenNthCalledWith(1, supabase, 'user-1', {
      purpose: 'adaptation_review',
      goalId: adaptivePlan.goals[0].goalId,
      asOf: '2026-09-14T12:00:00.000Z',
      windowDays: 84
    })
    expect(supabase.from).toHaveBeenCalledWith('coach_checkins')
    expect(buildRollingWeeklyReview).toHaveBeenCalledWith(expect.objectContaining({
      checkins: [expect.objectContaining({
        id: 'checkin-1',
        prescribedSessionId: 'session-1',
        outcome: 'as_planned',
        sessionRpe: 7,
        occurredAt: '2026-09-08T12:00:00.000Z'
      })]
    }))
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      1,
      'record_coach_weekly_review',
      expect.objectContaining({
        p_program_id: PROGRAM_ID,
        p_base_plan_version_id: PLAN_ID,
        p_action: 'continue',
        p_input_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/)
      })
    )
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      2,
      'create_rolling_weekly_replacement_proposal',
      expect.objectContaining({
        p_program_id: PROGRAM_ID,
        p_base_plan_version_id: PLAN_ID,
        p_weekly_review_id: REVIEW_ID,
        p_window_start: '2026-09-14',
        p_intent: expect.objectContaining({ horizon_weeks: 1 }),
        p_input_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/)
      })
    )
    expect(supabase.rpc).not.toHaveBeenCalledWith('accept_adaptation_proposal', expect.anything())
  })

  it('stores a material decision and waits for direction confirmation', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    vi.mocked(buildRollingWeeklyReview).mockReturnValue({
      ...readyReview(),
      action: 'shift_emphasis',
      presentationClass: 'material_change',
      proposal: {
        eligible: true,
        requiresAcceptance: true,
        activePlanUnchanged: true,
        generationReady: false,
        directionConfirmationRequired: true,
        blockingReasons: ['Confirm replacement direction.']
      }
    } as never)

    const response = await POST(reviewRequest())
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.proposal).toBeNull()
    expect(body.nextAction.type).toBe('confirm_replacement_direction')
    expect(body.activePlanChanged).toBe(false)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })

  it('returns a premature review without writing', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    vi.mocked(buildRollingWeeklyReview).mockReturnValue({
      status: 'not_ready',
      schemaVersion: 1,
      algorithmVersion: 'weekly-review-0.1.0',
      programId: PROGRAM_ID,
      basePlanVersionId: PLAN_ID,
      goalId: adaptivePlan.goals[0].goalId,
      windowStart: '2026-09-07',
      windowEnd: '2026-09-13',
      executionSummary: {},
      blockingReasons: ['Week is open.']
    } as never)

    const response = await POST(reviewRequest({
      asOf: '2026-09-08T12:00:00.000Z'
    }))

    expect(response.status).toBe(200)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rejects stale context before either write', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    vi.mocked(fetchCoachEvidenceContext)
      .mockReset()
      .mockResolvedValueOnce({
        ...context('adaptation_review'),
        activePlan: { programId: PROGRAM_ID, planVersionId: 'stale-plan' }
      } as never)
      .mockResolvedValueOnce(context('general_coaching') as never)

    const response = await POST(reviewRequest())

    expect(response.status).toBe(409)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rejects a mismatched response-loss replay', async () => {
    const supabase = client()
    supabase.rpc.mockReset().mockResolvedValueOnce({
      data: null,
      error: { code: '22023' }
    })
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await POST(reviewRequest())

    expect(response.status).toBe(409)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })

  it('rejects unauthenticated access before tenant reads', async () => {
    const supabase = client(null)
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await POST(reviewRequest())

    expect(response.status).toBe(401)
    expect(supabase.from).not.toHaveBeenCalled()
    expect(fetchCoachEvidenceContext).not.toHaveBeenCalled()
  })
})

function reviewRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/api/coach/weekly/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      asOf: '2026-09-14T12:00:00.000Z',
      tzOffset: 300,
      windowDays: 84,
      reviewIdempotencyKey: 'review-week-1',
      proposalIdempotencyKey: 'proposal-week-2',
      ...overrides
    })
  })
}

function client(user: { id: string } | null = { id: 'user-1' }) {
  const results: Record<string, Array<{ data: unknown; error: unknown }>> = {
    training_programs: [{
      data: [{
        id: PROGRAM_ID,
        title: 'Strength week',
        goal_summary: 'Build strength',
        active_plan_version_id: PLAN_ID,
        goal_target_date: '2026-12-31',
        direction
      }],
      error: null
    }],
    training_plan_versions: [{
      data: [{
        id: PLAN_ID,
        intent,
        input_snapshot: { source: 'fixture' },
        window_start: '2026-09-07',
        window_end: '2026-09-13'
      }],
      error: null
    }],
    prescribed_sessions: [{
      data: week.scheduledSessions.map((session, index) => ({
        id: `session-${index + 1}`,
        week_number: 1,
        session_index: index + 1,
        scheduled_date: session.scheduledDate,
        status: 'completed'
      })),
      error: null
    }],
    coach_checkins: [{
      data: [{
        id: 'checkin-1',
        prescribed_session_id: 'session-1',
        responses: {
          schemaVersion: 1,
          outcome: 'as_planned',
          sessionRpe: 7,
          energy: 'okay',
          pain: 'none',
          note: 'Completed as prescribed.'
        },
        occurred_at: '2026-09-08T12:00:00+00:00'
      }],
      error: null
    }]
  }
  const rpc = vi.fn()
    .mockResolvedValueOnce({
      data: [{
        review_id: REVIEW_ID,
        review_action: 'continue',
        review_presentation_class: 'same_track'
      }],
      error: null
    })
    .mockResolvedValueOnce({
      data: [{
        proposal_id: PROPOSAL_ID,
        proposed_program_id: PROGRAM_ID,
        proposed_plan_version_id: NEXT_PLAN_ID
      }],
      error: null
    })
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : { message: 'Unauthorized' }
      })
    },
    from: vi.fn((table: string) => query(results[table].shift()!)),
    rpc
  }
}

function query(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn()
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.in.mockReturnValue(chain)
  chain.order.mockResolvedValue(result)
  chain.limit.mockResolvedValue(result)
  return chain
}

function context(purpose: 'adaptation_review' | 'general_coaching') {
  return {
    purpose,
    asOf: '2026-09-14T12:00:00.000Z',
    window: {
      startsAt: '2026-06-22T12:00:00.000Z',
      endsAt: '2026-09-14T12:00:00.000Z',
      days: 84
    },
    activePlan: purpose === 'adaptation_review'
      ? { programId: PROGRAM_ID, planVersionId: PLAN_ID }
      : null
  }
}

function readyReview() {
  return {
    status: 'ready',
    schemaVersion: 1,
    algorithmVersion: 'weekly-review-0.1.0',
    policyVersion: 'rolling-weekly-0.1.0',
    programId: PROGRAM_ID,
    basePlanVersionId: PLAN_ID,
    goalId: adaptivePlan.goals[0].goalId,
    windowStart: '2026-09-07',
    windowEnd: '2026-09-13',
    reviewedAt: '2026-09-14T12:00:00.000Z',
    reviewReason: 'week_ended',
    action: 'continue',
    presentationClass: 'same_track',
    evidenceStatus: 'sufficient',
    confidence: 0.8,
    rationale: ['Repeated compatible evidence remains stable.'],
    missing: [],
    executionSummary: {
      windowStart: '2026-09-07',
      windowEnd: '2026-09-13',
      athleteLocalDate: '2026-09-14',
      scheduledSessionIds: ['session-1', 'session-2'],
      completedSessionIds: ['session-1', 'session-2'],
      skippedSessionIds: [],
      checkinIds: [],
      completionRate: 1,
      averageSessionRpe: null,
      plannedSessions: 2,
      completedSessions: 2,
      skippedSessions: 0,
      pastDuePlannedSessions: 0,
      modifiedSessions: 0,
      stoppedEarlySessions: 0,
      lowEnergyReports: 0,
      mildPainReports: 0,
      concerningPainReports: 0,
      terminalSessionsWithoutCheckins: []
    },
    evidenceSnapshot: null,
    observationLinks: [],
    safetyOverride: { applied: false, signalIds: [], action: null },
    doseChange: null,
    signalRequest: null,
    safetyBoundary: null,
    proposal: {
      eligible: true,
      requiresAcceptance: true,
      activePlanUnchanged: true,
      generationReady: true,
      directionConfirmationRequired: false,
      blockingReasons: []
    },
    goalMetMaintenance: false,
    evaluatorReview: {}
  }
}

function initialWeek(): RollingWeeklyPlanDraft {
  const result = buildRollingWeeklyPlan({
    source: 'initial',
    windowStart: '2026-09-07',
    profile,
    direction
  })
  if (result.kind !== 'weekly_plan') throw new Error('Expected weekly fixture')
  return result
}

function withStart(value: ProgrammingProfile, startDate: string): ProgrammingProfile {
  return structuredClone({ ...value, startDate })
}
