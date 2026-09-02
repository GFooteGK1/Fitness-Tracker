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
vi.mock('@/app/lib/coach/adaptation-evaluator', async importOriginal => {
  const actual = await importOriginal<typeof import('@/app/lib/coach/adaptation-evaluator')>()
  return { ...actual, evaluateAdaptation: vi.fn() }
})

import { POST } from '@/app/api/coach/adaptation-reviews/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import {
  ADAPTATION_EVALUATOR_ALGORITHM_VERSION,
  evaluateAdaptation,
  type AdaptationReview
} from '@/app/lib/coach/adaptation-evaluator'
import { fetchCoachEvidenceContext } from '@/app/lib/coach/evidence-context'

const asOf = '2026-09-01T12:00:00.000Z'
const planningInput = {
  format: 'complete_programming_intake_v0_3',
  primaryDomain: 'strength',
  goal: 'Build useful full-body strength',
  experience: 'consistent',
  trainingDays: ['monday', 'wednesday', 'friday'],
  sessionMinutes: 60,
  equipment: 'Barbell, rack, dumbbells, and a bike',
  resolvedEquipmentIds: ['bodyweight', 'barbell', 'rack', 'dumbbell', 'bike'],
  constraints: 'Keep Saturday free',
  constraintKinds: [],
  secondaryGoals: [],
  startDate: '2026-09-07'
}

describe('POST /api/coach/adaptation-reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchCoachEvidenceContext)
      .mockResolvedValueOnce(evidenceContext('adaptation_review') as never)
      .mockResolvedValueOnce(evidenceContext('general_coaching') as never)
    vi.mocked(fetchCoachRuntimeContext).mockResolvedValue(runtimeContext() as never)
    vi.mocked(evaluateAdaptation).mockReturnValue(progressReview())
  })

  it('returns a deterministic review without writing a proposal', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await POST(request({ goalId: 'goal-strength', asOf }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.review.action).toBe('progress')
    expect(fetchCoachEvidenceContext).toHaveBeenNthCalledWith(1, supabase, 'user-1', {
      purpose: 'adaptation_review', goalId: 'goal-strength', asOf, windowDays: 84
    })
    expect(fetchCoachEvidenceContext).toHaveBeenNthCalledWith(2, supabase, 'user-1', {
      purpose: 'general_coaching', asOf, windowDays: 84
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('stores an immutable replacement draft with the exact evidence snapshot', async () => {
    const supabase = client()
    supabase.rpc.mockResolvedValue({
      data: [{
        proposal_id: '11111111-1111-4111-8111-111111111111',
        proposed_program_id: 'program-active',
        proposed_plan_version_id: '33333333-3333-4333-8333-333333333333'
      }],
      error: null
    })
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await POST(request({
      goalId: 'goal-strength',
      asOf,
      replacementPlanningInput: planningInput,
      idempotencyKey: 'adaptation-proposal-1'
    }))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      proposalId: '11111111-1111-4111-8111-111111111111',
      activePlanChanged: false,
      acceptanceRequired: true
    })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith(
      'create_training_plan_replacement_proposal',
      expect.objectContaining({
        p_program_id: 'program-active',
        p_base_plan_version_id: 'plan-active',
        p_input_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        p_rationale: expect.objectContaining({
          reason: 'evidence_derived_adaptation',
          action: 'progress',
          confidence: 0.75,
          explanation: ['Repeated direct evidence improved.'],
          automaticPlanActivation: false,
          athleteReviewRequired: true,
          evidenceSnapshot: expect.objectContaining({
            id: 'adaptation-evidence:fixture',
            includedObservationIds: ['observation-1', 'observation-2']
          })
        }),
        p_intent: expect.objectContaining({
          adaptation_source: {
            evidenceSnapshotId: 'adaptation-evidence:fixture',
            action: 'progress',
            algorithmVersion: ADAPTATION_EVALUATOR_ALGORITHM_VERSION,
            basePlanVersionId: 'plan-active'
          }
        }),
        p_sessions: expect.arrayContaining([
          expect.objectContaining({ week_number: 1, session_index: 1 })
        ])
      })
    )
    expect(supabase.rpc).not.toHaveBeenCalledWith('accept_adaptation_proposal', expect.anything())
  })

  it('rejects proposal creation when the evidence decision is hold', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    vi.mocked(evaluateAdaptation).mockReturnValue({
      ...progressReview(),
      action: 'hold_collect_more',
      evidenceSnapshot: null,
      proposalRecommendation: {
        eligible: false,
        requiresAcceptance: false,
        activePlanUnchanged: true,
        numericChangeStatus: 'not_generated',
        suggestedChanges: ['Collect more data.']
      }
    })

    const response = await POST(request({
      goalId: 'goal-strength',
      asOf,
      replacementPlanningInput: planningInput,
      idempotencyKey: 'adaptation-proposal-1'
    }))

    expect(response.status).toBe(409)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated review before reading evidence', async () => {
    const supabase = client(null)
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await POST(request({ goalId: 'goal-strength', asOf }))

    expect(response.status).toBe(401)
    expect(fetchCoachEvidenceContext).not.toHaveBeenCalled()
  })
})

function request(body: unknown): Request {
  return new Request('http://localhost/api/coach/adaptation-reviews', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function client(user: { id: string } | null = { id: 'user-1' }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn()
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.limit.mockResolvedValue({
    data: [{
      id: 'plan-active',
      intent: { adaptive_programming: { contractVersion: 'adaptive-plan-0.1.0' } },
      input_snapshot: { planningInput: { goal: 'Build strength' } }
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
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null })
  }
}

function evidenceContext(purpose: 'adaptation_review' | 'general_coaching') {
  return {
    purpose,
    asOf,
    window: { startsAt: '2026-06-09T12:00:00.000Z', endsAt: asOf, days: 84 },
    activePlan: {
      programId: 'program-active',
      planVersionId: 'plan-active'
    }
  }
}

function runtimeContext() {
  return {
    generatedAt: asOf,
    storageAvailable: true,
    doctrineVersion: '0.1.0',
    policyVersion: '0.3.0',
    assessments: [],
    memories: [],
    activeProgram: {
      id: 'program-active',
      activePlanVersionId: 'plan-active',
      upcomingSessions: [],
      sessionCheckins: []
    }
  }
}

function progressReview(): AdaptationReview {
  return {
    schemaVersion: 1,
    algorithmVersion: ADAPTATION_EVALUATOR_ALGORITHM_VERSION,
    asOf,
    goalId: 'goal-strength',
    hypothesisId: 'hypothesis-strength',
    action: 'progress',
    evidenceStatus: 'supported',
    trend: 'improving',
    confidence: 0.75,
    rationale: ['Repeated direct evidence improved.'],
    missing: [],
    nextMeasurement: null,
    safetyOverride: { applied: false, signalIds: [], action: null },
    evidenceSnapshot: {
      schemaVersion: 1,
      id: 'adaptation-evidence:fixture',
      contentHash: 'a'.repeat(64),
      createdAt: asOf,
      evaluationWindow: { startsAt: '2026-06-09T12:00:00.000Z', endsAt: asOf },
      activePlanVersionId: 'plan-active',
      goalId: 'goal-strength',
      hypothesisId: 'hypothesis-strength',
      evaluationPolicyId: 'policy-strength',
      includedObservationIds: ['observation-1', 'observation-2'],
      excludedObservations: [],
      safetySignalIds: [],
      executionEvidence: null,
      protocolSignatures: ['strength.repetition_max|strength-standard@1.0.0|comparison-v1'],
      sampleCount: 2,
      exposureCount: 2,
      contextAlgorithmVersion: 'coach-context-selection-0.1.0',
      algorithmVersion: ADAPTATION_EVALUATOR_ALGORITHM_VERSION,
      policyVersion: 'adaptive-plan-evaluation-0.1.0',
      series: [],
      confidence: 0.75,
      provisionalVariability: true
    },
    proposalRecommendation: {
      eligible: true,
      requiresAcceptance: true,
      activePlanUnchanged: true,
      numericChangeStatus: 'athlete_input_required',
      suggestedChanges: ['Create a reviewed replacement.']
    }
  }
}
