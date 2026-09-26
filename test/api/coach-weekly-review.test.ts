import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUSY_COACH_CONTEXT_MESSAGE, CoachContextRevisionConflictError, fetchCoachContextRevision } from '@/app/lib/coach/proposal-context-revision'
import type { CompleteCoachPlanningInput } from '@/app/lib/coach/complete-intake'
import { fetchDirectionReconciliation } from '@/app/lib/coach/direction-reconciliation-server'
import { reconcileTrainingDirection } from '@/app/lib/coach/direction-reconciliation'

vi.mock('@/app/lib/coach/direction-reconciliation-server', () => ({
  fetchDirectionReconciliation: vi.fn().mockResolvedValue({ version: 'direction-reconciliation-1', status: 'unchanged', reasons: [], changedFields: [] }),
}))

vi.mock('@/app/lib/coach/proposal-context-revision', async importOriginal => ({
  ...await importOriginal<typeof import('@/app/lib/coach/proposal-context-revision')>(),
  fetchCoachContextRevision: vi.fn().mockResolvedValue(7),
}))

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
vi.mock('@/app/lib/coach/planning-intent-server', async importOriginal => {
  const actual = await importOriginal<typeof import('@/app/lib/coach/planning-intent-server')>()
  return { ...actual, refreshConfirmedPlanningContext: vi.fn(actual.refreshConfirmedPlanningContext) }
})

import { POST } from '@/app/api/coach/weekly/review/route'
import { buildAdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import { assembleCoachEvidenceContext, fetchCoachEvidenceContext } from '@/app/lib/coach/evidence-context'
import { findAssessmentDefinition } from '@/app/lib/coach/adaptive-programming-contracts'
import { evaluateConfirmedOutcome } from '@/app/lib/coach/targeted-review'
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
import { applyConfirmedIntentToProfile, refreshConfirmedPlanningContext } from '@/app/lib/coach/planning-intent-server'
import { intent as planningIntent, runningOutcome } from '@/test/fixtures/personalized-coaching/intent'

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
const replacementInput: CompleteCoachPlanningInput = {
  format: 'complete_programming_intake_v0_3', primaryDomain: 'aerobic', goal: 'Improve running performance',
  experience: 'consistent', trainingDays: ['monday', 'thursday'], sessionMinutes: 60,
  equipment: 'Track', resolvedEquipmentIds: ['bodyweight', 'track'], constraints: '', constraintKinds: [],
  secondaryGoals: [], startDate: '2026-09-14', setupConfirmed: true
}

describe('POST /api/coach/weekly/review', () => {
  it.each(['revision', 'review', 'proposal'])('returns retryable 409 for review flow %s contention', async stage => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    if (stage === 'revision') vi.mocked(fetchCoachContextRevision).mockRejectedValueOnce(new CoachContextRevisionConflictError(BUSY_COACH_CONTEXT_MESSAGE))
    else {
      supabase.rpc.mockReset()
      if (stage === 'proposal') supabase.rpc.mockResolvedValueOnce({ data: [{ review_id: REVIEW_ID, review_action: 'continue', review_presentation_class: 'same_track' }], error: null })
      supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: '55P03', message: 'private SQL details' } })
    }
    const response = await POST(reviewRequest())
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe(BUSY_COACH_CONTEXT_MESSAGE)
    expect(supabase.rpc).toHaveBeenCalledTimes(stage === 'revision' ? 0 : stage === 'review' ? 1 : 2)
  })
  afterEach(() => vi.unstubAllEnvs())
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

  it('uses a real validated broad retrieval then exact outcome scope when targeted review is enabled', async () => {
    vi.stubEnv('COACH_TARGETED_REVIEW_ENABLED', 'true')
    const outcome = runningOutcome('goal:strength'), definition = findAssessmentDefinition('strength.repetition_max')!
    outcome.domain = 'strength'; outcome.goal.requiredQualityIds = ['maximal_strength']; outcome.goal.statement = 'Improve bench strength'
    outcome.measurement = { metricId: definition.primaryMetricId, unit: 'kg', assessmentDefinition: { id: definition.id, version: definition.version }, protocol: { id: definition.protocol.id, version: definition.protocol.version } }
    outcome.binding = { movementId: 'barbell_bench_press', variation: 'standard', distance: null, equipmentIds: ['barbell'],
      assessmentContext: { repetitions: 1, externalLoad: null, duration: null, techniqueModifiers: [], environmentModifiers: [] } }
    const boundWeek = structuredClone(week)
    boundWeek.profileSnapshot.trainingIntent = { schemaVersion: 1, memoryId: 'intent-1', memoryVersion: 1, content: planningIntent(outcome) }
    boundWeek.directionSnapshot = buildRollingTrainingDirection(boundWeek.profileSnapshot, { hypothesis: direction.hypothesis, goalTargetDate: direction.goalTargetDate })
    const boundAdaptive = buildAdaptivePlanContract(boundWeek.profileSnapshot, [boundWeek])
    const stored = buildStoredRollingWeeklyIntent(boundWeek, boundAdaptive)
    const supabase = client({ id: 'user-1' }, stored)
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const packets: ReturnType<typeof assembleCoachEvidenceContext>[] = []
    vi.mocked(fetchCoachEvidenceContext).mockReset().mockImplementation(async (_db, userId, request) => {
      // The actual assembler invokes the actual request validator. A goal-less
      // adaptation request fails here instead of being hidden by a canned mock.
      const packet = assembleCoachEvidenceContext(userId, request, {
        programs: [{ id: PROGRAM_ID, user_id: 'user-1', title: 'Strength', goal_summary: 'Strength', start_date: '2026-09-07', end_date: '2026-12-31',
          status: 'active', active_plan_version_id: PLAN_ID, created_at: '2026-09-07T00:00:00.000Z' }],
        planVersions: [{ id: PLAN_ID, user_id: 'user-1', program_id: PROGRAM_ID, status: 'accepted', version: 1, intent: stored, reference_version: 'test', policy_version: 'test' }],
        sessions: [], memories: [], strengthAssessments: [], observationGroups: [], observationValues: [], imports: []
      })
      packets.push(packet)
      return packet
    })
    const real = await vi.importActual<typeof import('@/app/lib/coach/weekly-review')>('@/app/lib/coach/weekly-review')
    vi.mocked(buildRollingWeeklyReview).mockImplementationOnce(real.buildRollingWeeklyReview)
    const response = await POST(reviewRequest()), body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(201)
    expect(fetchCoachEvidenceContext).toHaveBeenNthCalledWith(1, supabase, 'user-1', {
      purpose: 'new_planning', asOf: '2026-09-14T12:00:00.000Z', windowDays: 84
    })
    expect(packets[0]).toMatchObject({ purpose: 'new_planning', limits: { maxObservationSamples: 80 }, activePlan: { programId: PROGRAM_ID, planVersionId: PLAN_ID } })
    expect(body.review.goalReviews).toHaveLength(1)
    expect(body.review.goalReviews[0].missing).not.toContain('adaptation_context_required')
    expect(body.review.doseChange).toBeNull()
    const scoped = evaluateConfirmedOutcome({ plan: boundWeek, outcome, goalId: outcome.goal.id, adaptivePlan: boundAdaptive,
      context: { ...packets[0], selectionComplete: false } })
    expect(scoped.context).toMatchObject({ purpose: 'adaptation_review', scope: { goalId: outcome.goal.id, activePlanVersionId: PLAN_ID },
      selectionComplete: false, limits: { maxObservationSamples: 80 }, reproduction: { request: { purpose: 'new_planning' } } })
    expect(scoped.evaluator.missing).toContain('evidence_selection_incomplete')
    expect(scoped.evaluator.proposalRecommendation.eligible).toBe(false)
  })

  it('retains scoped legacy retrieval when the targeted flag is on but accepted outcomes are absent', async () => {
    vi.stubEnv('COACH_TARGETED_REVIEW_ENABLED', 'true')
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    expect((await POST(reviewRequest())).status).toBe(201)
    expect(fetchCoachEvidenceContext).toHaveBeenNthCalledWith(1, supabase, 'user-1', expect.objectContaining({ purpose: 'adaptation_review', goalId: adaptivePlan.goals[0].goalId }))
    expect(buildRollingWeeklyReview).toHaveBeenCalledWith(expect.objectContaining({ targetedReview: false }))
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
        p_rationale: expect.objectContaining({ contextRevision: 7 }),
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
        p_input_snapshot: expect.objectContaining({ contextRevision: 7 }),
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

  it('uses the real evaluator and compiler to replace a changed schedule after confirmation', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const { buildRollingWeeklyReview: actualReview } = await vi.importActual<typeof import('@/app/lib/coach/weekly-review')>('@/app/lib/coach/weekly-review')
    vi.mocked(buildRollingWeeklyReview).mockImplementationOnce(actualReview)
    const original = structuredClone(week)
    const reconciliation = reconcileTrainingDirection({ userId: 'user-1', acceptedWeek: week, nextWindowStart: '2026-09-14',
      intentRequired: false, asOf: '2026-09-14T12:00:00.000Z', memories: { training_schedule: {
        id: 'schedule-new', user_id: 'user-1', memory_key: 'training_schedule', kind: 'schedule', version: 2,
        status: 'confirmed', effective_from: null, effective_until: null, review_after: null,
        content: { experience: profile.trainingExperience, trainingDays: ['tuesday', 'friday'], sessionMinutes: 60 },
      } } })
    expect(reconciliation.status).toBe('changed')
    vi.mocked(fetchDirectionReconciliation).mockResolvedValueOnce(reconciliation)
    const response = await POST(reviewRequest({ athleteRequestedReview: true,
      replacementPlanningInput: { ...reconciliation.replacementPlanningInput, setupConfirmed: true },
      replacementGoalTargetDate: '2026-12-31', replacementHypothesis: 'Confirmed availability supports the revised weekly schedule.' }))
    const body = await response.json()
    expect(response.status).toBe(201)
    expect(body.review.action).toBe('shift_emphasis')
    expect(body.proposal.profileSnapshot.sessionAvailability.map((slot: { day: string }) => slot.day)).toEqual(['tuesday', 'friday'])
    expect(body.activePlanChanged).toBe(false)
    expect(week).toEqual(original)
    expect(supabase.rpc).toHaveBeenCalledWith('record_coach_weekly_review', expect.objectContaining({
      p_rationale: expect.objectContaining({ directionReconciliation: reconciliation, contextRevision: 7 }),
    }))
  })

  it('persists the current-direction blocker without writing a proposal', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const { buildRollingWeeklyReview: actualReview } = await vi.importActual<typeof import('@/app/lib/coach/weekly-review')>('@/app/lib/coach/weekly-review')
    vi.mocked(buildRollingWeeklyReview).mockImplementationOnce(actualReview)
    vi.mocked(fetchDirectionReconciliation).mockResolvedValueOnce({ status: 'confirmation_required', reasons: ['Confirm current outcomes'], changedFields: [] })
    const response = await POST(reviewRequest())
    const body = await response.json()
    expect(response.status).toBe(201)
    expect(body.review.proposal.eligible).toBe(false)
    expect(body.review.directionReconciliation.status).toBe('confirmation_required')
    expect(body.proposal).toBeNull()
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })

  it('rejects a replacement date conflicting with the refreshed confirmed event before saving a proposal', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    vi.mocked(buildRollingWeeklyReview).mockReturnValue({
      ...readyReview(), action: 'shift_emphasis', presentationClass: 'material_change'
    } as never)
    const content = planningIntent(runningOutcome())
    content.event = { name: 'Synthetic spring event', date: '2027-04-10', goalIds: [content.outcomes[0].goal.id] }
    vi.mocked(refreshConfirmedPlanningContext).mockImplementationOnce(async (_supabase, _userId, input) =>
      applyConfirmedIntentToProfile(input, { schemaVersion: 1, memoryId: REVIEW_ID, memoryVersion: 1, content }))

    const response = await POST(reviewRequest({
      replacementPlanningInput: {
        format: 'complete_programming_intake_v0_3', primaryDomain: 'aerobic', goal: 'Improve running performance',
        experience: 'consistent', trainingDays: ['monday', 'thursday'], sessionMinutes: 60,
        equipment: 'Track', resolvedEquipmentIds: ['bodyweight', 'track'], constraints: '', constraintKinds: [],
        secondaryGoals: [], startDate: '2026-09-14', setupConfirmed: true
      },
      replacementGoalTargetDate: '2026-12-13',
      replacementHypothesis: 'Repeatable running exposures will improve the direct outcome.'
    }))

    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('confirmed event date (2027-04-10)')
    expect(refreshConfirmedPlanningContext).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('record_coach_weekly_review', expect.anything())
    expect(supabase.rpc).not.toHaveBeenCalledWith('create_rolling_weekly_replacement_proposal', expect.anything())
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

  it('preserves explicit event target removal through the replacement direction and proposal RPC', async () => {
    const supabase = client(), original = structuredClone(week)
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const currentIntent = { schemaVersion: 1 as const, memoryId: REVIEW_ID, memoryVersion: 2,
      content: planningIntent(runningOutcome()) }
    const directionReconciliation = { status: 'changed' as const, reasons: ['The event was removed.'],
      changedFields: ['event'], goalTargetDate: null, replacementPlanningInput: replacementInput, currentIntent }
    vi.mocked(buildRollingWeeklyReview).mockReturnValue({ ...readyReview(), action: 'shift_emphasis',
      presentationClass: 'material_change', directionReconciliation } as never)
    const response = await POST(reviewRequest({ replacementPlanningInput: replacementInput,
      replacementGoalTargetDate: null, replacementHypothesis: 'Continue confirmed aerobic work without an event deadline.' }))
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
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    vi.mocked(buildRollingWeeklyReview).mockReturnValue({ ...readyReview(), action: 'shift_emphasis', presentationClass: 'material_change' } as never)
    const response = await POST(reviewRequest({ replacementPlanningInput: { ...replacementInput, setupConfirmed },
      replacementGoalTargetDate: '2026-12-31', replacementHypothesis: 'Confirm current setup before creating this replacement.' }))

    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('Confirm current training days, session duration and equipment')
    expect(refreshConfirmedPlanningContext).not.toHaveBeenCalled()
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('record_coach_weekly_review', expect.anything())
    expect(supabase.rpc).not.toHaveBeenCalledWith('create_rolling_weekly_replacement_proposal', expect.anything())
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

function client(user: { id: string } | null = { id: 'user-1' }, stored = intent) {
  const results: Record<string, Array<{ data: unknown; error: unknown }>> = {
    training_programs: [{
      data: [{
        id: PROGRAM_ID,
        title: 'Strength week',
        goal_summary: 'Build strength',
        active_plan_version_id: PLAN_ID,
        goal_target_date: '2026-12-31',
        direction: stored.weekly_plan.directionSnapshot
      }],
      error: null
    }],
    training_plan_versions: [{
      data: [{
        id: PLAN_ID,
        intent: stored,
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
    schemaVersion: 1, algorithmVersion: 'coach-context-selection-0.4.0', evidencePolicyVersion: 'adaptive-evidence-0.1.0',
    storageAvailable: true, selectionComplete: true, session: null,
    scope: { userId: 'user-1', activeProgramId: PROGRAM_ID, activePlanVersionId: PLAN_ID,
      goalId: adaptivePlan.goals[0].goalId, prescribedSessionId: null, metricId: null, protocol: null, comparabilityKey: null },
    memories: [], strengthBaselines: [], evidenceSeries: [], evidenceIds: [], sampleCount: 0, missing: [],
    limits: { maxMemories: 16, maxAssessments: 12, maxObservationSamples: 160, sourceTruncated: false, selectionTruncated: false },
    reproduction: { request: { purpose, asOf: '2026-09-14T12:00:00.000Z', windowDays: 84 },
      activePlanVersionId: PLAN_ID, memoryIds: [], assessmentIds: [], observationIds: [] },
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
