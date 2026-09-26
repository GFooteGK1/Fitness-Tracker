import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUSY_COACH_CONTEXT_MESSAGE } from '@/app/lib/coach/proposal-context-revision'
import { fetchDirectionReconciliation } from '@/app/lib/coach/direction-reconciliation-server'
import type { CompleteCoachPlanningInput } from '@/app/lib/coach/complete-intake'

vi.mock('@/app/lib/coach/direction-reconciliation-server', () => ({
  fetchDirectionReconciliation: vi.fn().mockResolvedValue({ status: 'unchanged', reasons: [], changedFields: [] }),
}))

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn()
}))
vi.mock('@/app/lib/coach/athlete-context', async importOriginal => {
  const actual = await importOriginal<typeof import('@/app/lib/coach/athlete-context')>()
  return { ...actual, fetchCoachRuntimeContext: vi.fn() }
})
vi.mock('@/app/lib/coach/planning-intent-server', async importOriginal => {
  const actual = await importOriginal<typeof import('@/app/lib/coach/planning-intent-server')>()
  return { ...actual, refreshConfirmedPlanningContext: vi.fn(actual.refreshConfirmedPlanningContext) }
})

import { POST } from '@/app/api/coach/weekly/reviews/[id]/proposal/route'
import { buildAdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
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
import { GOLDEN_PROGRAMMING_PROFILES } from '@/test/coach/golden-programming-profiles'
import { applyConfirmedIntentToProfile, refreshConfirmedPlanningContext } from '@/app/lib/coach/planning-intent-server'
import { intent as planningIntent, runningOutcome } from '@/test/fixtures/personalized-coaching/intent'

const PROGRAM_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const REVIEW_ID = '33333333-3333-4333-8333-333333333333'
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
const intent = buildStoredRollingWeeklyIntent(week, buildAdaptivePlanContract(profile, [week]))
const replacementInput: CompleteCoachPlanningInput = {
  format: 'complete_programming_intake_v0_3', primaryDomain: 'aerobic', goal: 'Improve running performance',
  experience: 'consistent', trainingDays: ['monday', 'thursday'], sessionMinutes: 60,
  equipment: 'Track', resolvedEquipmentIds: ['bodyweight', 'track'], constraints: '', constraintKinds: [],
  secondaryGoals: [], startDate: '2026-09-14', setupConfirmed: true
}

describe('POST /api/coach/weekly/reviews/[id]/proposal', () => {
  it('returns retryable 409 when rebuilding a stored review meets lock contention', async () => {
    const supabase = client()
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '55P03', message: 'private SQL details' } } as never)
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const response = await POST(request(), { params: Promise.resolve({ id: REVIEW_ID }) })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe(BUSY_COACH_CONTEXT_MESSAGE)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })
  afterEach(() => vi.unstubAllEnvs())
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchCoachRuntimeContext).mockResolvedValue({ assessments: [] } as never)
  })

  it('reconstructs one adjacent proposal from an immutable stored review', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await POST(request(), { params: Promise.resolve({ id: REVIEW_ID }) })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      reviewId: REVIEW_ID,
      activePlanChanged: false,
      acceptanceRequired: true,
      idempotencyKey: 'proposal-week-2'
    })
    expect(body.proposal.windowStart).toBe('2026-09-14')
    expect(supabase.rpc).toHaveBeenCalledWith(
      'create_rolling_weekly_replacement_proposal',
      expect.objectContaining({
        p_weekly_review_id: REVIEW_ID,
        p_input_snapshot: expect.objectContaining({ contextRevision: 7 }),
        p_window_start: '2026-09-14',
        p_input_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/)
      })
    )
  })

  it('rejects a safety review before proposal storage', async () => {
    const supabase = client('pause_review')
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await POST(request(), { params: Promise.resolve({ id: REVIEW_ID }) })

    expect(response.status).toBe(409)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('refuses a saved continuation when current confirmed direction has changed', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    vi.mocked(fetchDirectionReconciliation).mockResolvedValueOnce({ status: 'changed', reasons: ['Schedule changed'], changedFields: ['training_schedule'] })
    const response = await POST(request(), { params: Promise.resolve({ id: REVIEW_ID }) })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('Create a fresh review')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('refuses a stored proposal when current goals require confirmation', async () => {
    const supabase = client('shift_emphasis')
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    vi.mocked(fetchDirectionReconciliation).mockResolvedValueOnce({ status: 'confirmation_required', reasons: ['Confirm current outcomes'], changedFields: [] })
    const response = await POST(request(), { params: Promise.resolve({ id: REVIEW_ID }) })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('Confirm current outcomes')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rejects an unstamped stored review without creating a proposal', async () => {
    const supabase = client('continue', undefined)
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const response = await POST(request(), { params: Promise.resolve({ id: REVIEW_ID }) })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('training information changed')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('retains an old review revision and lets SQL reject it instead of stamping it fresh', async () => {
    const supabase = client('continue', 2)
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '40001' } } as never)
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const response = await POST(request(), { params: Promise.resolve({ id: REVIEW_ID }) })
    expect(response.status).toBe(409)
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('create_rolling_weekly_replacement_proposal',
      expect.objectContaining({ p_input_snapshot: expect.objectContaining({ contextRevision: 2 }) }))
  })

  it('rejects a replacement date conflicting with the refreshed confirmed event before proposal storage', async () => {
    const supabase = client('shift_emphasis')
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const content = planningIntent(runningOutcome())
    content.event = { name: 'Synthetic spring event', date: '2027-04-10', goalIds: [content.outcomes[0].goal.id] }
    vi.mocked(refreshConfirmedPlanningContext).mockImplementationOnce(async (_supabase, _userId, input) =>
      applyConfirmedIntentToProfile(input, { schemaVersion: 1, memoryId: REVIEW_ID, memoryVersion: 1, content }))
    const replacementPlanningInput: CompleteCoachPlanningInput = {
        format: 'complete_programming_intake_v0_3', primaryDomain: 'aerobic', goal: 'Improve running performance',
        experience: 'consistent', trainingDays: ['monday', 'thursday'], sessionMinutes: 60,
        equipment: 'Track', resolvedEquipmentIds: ['bodyweight', 'track'], constraints: '', constraintKinds: [],
        secondaryGoals: [], startDate: '2026-09-14', setupConfirmed: true
      }
    vi.mocked(fetchDirectionReconciliation).mockResolvedValueOnce({ status: 'changed', reasons: ['Event changed'],
      changedFields: ['event'], replacementPlanningInput })
    const response = await POST(request({
      replacementPlanningInput,
      replacementGoalTargetDate: '2026-12-13',
      replacementHypothesis: 'Repeatable running exposures will improve the direct outcome.'
    }), { params: Promise.resolve({ id: REVIEW_ID }) })

    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('confirmed event date (2027-04-10)')
    expect(refreshConfirmedPlanningContext).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('preserves explicit event target removal through the saved-review replacement and proposal RPC', async () => {
    const supabase = client('shift_emphasis'), original = structuredClone(week)
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const currentIntent = { schemaVersion: 1 as const, memoryId: REVIEW_ID, memoryVersion: 2,
      content: planningIntent(runningOutcome()) }
    vi.mocked(fetchDirectionReconciliation).mockResolvedValueOnce({ status: 'changed', reasons: ['The event was removed.'],
      changedFields: ['event'], goalTargetDate: null, replacementPlanningInput: replacementInput, currentIntent })
    const response = await POST(request({ replacementPlanningInput: replacementInput,
      replacementGoalTargetDate: null, replacementHypothesis: 'Continue confirmed aerobic work without an event deadline.'
    }), { params: Promise.resolve({ id: REVIEW_ID }) })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.proposal.directionSnapshot.goalTargetDate).toBeNull()
    expect(body.proposal.profileSnapshot.primaryGoal.outcome.horizon.endsOn).not.toBe(direction.goalTargetDate)
    expect(body.proposal.profileSnapshot.trainingIntent.content.event).toBeNull()
    expect(supabase.rpc).toHaveBeenCalledWith('create_rolling_weekly_replacement_proposal', expect.objectContaining({
      p_goal_target_date: null, p_direction: expect.objectContaining({ goalTargetDate: null }),
      p_intent: expect.objectContaining({ weekly_plan: expect.objectContaining({
        directionSnapshot: expect.objectContaining({ goalTargetDate: null })
      }) })
    }))
    expect(week).toEqual(original)
    expect(direction.goalTargetDate).toBe('2026-12-31')
  })

  it.each([undefined, false])('requires setupConfirmed=true even with training intent disabled (received %s)', async setupConfirmed => {
    vi.stubEnv('COACH_TRAINING_INTENT_ENABLED', 'false')
    const supabase = client('shift_emphasis')
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    vi.mocked(fetchDirectionReconciliation).mockResolvedValueOnce({ status: 'changed', reasons: ['Confirm revised setup.'],
      changedFields: ['training_schedule'], replacementPlanningInput: replacementInput })
    const response = await POST(request({ replacementPlanningInput: { ...replacementInput, setupConfirmed },
      replacementGoalTargetDate: '2026-12-31', replacementHypothesis: 'Confirm current setup before creating this replacement.'
    }), { params: Promise.resolve({ id: REVIEW_ID }) })

    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('Confirm current training days, session duration and equipment')
    expect(refreshConfirmedPlanningContext).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})

function request(overrides: Record<string, unknown> = {}): Request {
  return new Request(`http://localhost/api/coach/weekly/reviews/${REVIEW_ID}/proposal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: 'proposal-week-2', ...overrides })
  })
}

function client(action = 'continue', ...revision: [number | undefined] | []) {
  const presentationClass = action === 'pause_review' ? 'safety' : action === 'shift_emphasis' ? 'material_change' : 'same_track'
  const evidenceStatus = action === 'pause_review' ? 'safety_override' : 'sufficient'
  const results: Record<string, Array<{ data: unknown; error: null }>> = {
    training_programs: [{
      data: [{
        id: PROGRAM_ID,
        active_plan_version_id: PLAN_ID,
        goal_target_date: '2026-12-31',
        direction
      }],
      error: null
    }],
    coach_weekly_reviews: [{
      data: [{
        id: REVIEW_ID,
        base_plan_version_id: PLAN_ID,
        action,
        presentation_class: presentationClass,
        evidence_status: evidenceStatus,
        rationale: {
          contextRevision: revision.length ? revision[0] : 7,
          messages: ['Stored compatible evidence remains stable.'],
          planningDecision: {
            action,
            presentationClass,
            evidenceStatus,
            doseChange: null,
            signalRequest: null,
            safetyBoundary: action === 'pause_review'
              ? { reason: 'Safety review.', prohibitedMovementIds: [week.sessions[0].blocks[1].exercises[0].movementId] }
              : null
          }
        },
        policy_version: 'rolling-weekly-0.1.0',
        algorithm_version: 'weekly-review-0.1.0'
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
    }]
  }
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    },
    from: vi.fn((table: string) => query(results[table].shift()!)),
    rpc: vi.fn().mockResolvedValue({
      data: [{
        proposal_id: '44444444-4444-4444-8444-444444444444',
        proposed_program_id: PROGRAM_ID,
        proposed_plan_version_id: '55555555-5555-4555-8555-555555555555'
      }],
      error: null
    })
  }
}

function query(result: { data: unknown; error: null }) {
  const chain = { select: vi.fn(), eq: vi.fn(), limit: vi.fn() }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.limit.mockResolvedValue(result)
  return chain
}

function initialWeek(): RollingWeeklyPlanDraft {
  const result = buildRollingWeeklyPlan({
    source: 'initial', windowStart: '2026-09-07', profile, direction
  })
  if (result.kind !== 'weekly_plan') throw new Error('Expected weekly fixture')
  return result
}

function withStart(value: ProgrammingProfile, startDate: string): ProgrammingProfile {
  return structuredClone({ ...value, startDate })
}
