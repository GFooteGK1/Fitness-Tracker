import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn()
}))
vi.mock('@/app/lib/coach/athlete-context', async importOriginal => {
  const actual = await importOriginal<typeof import('@/app/lib/coach/athlete-context')>()
  return { ...actual, fetchCoachRuntimeContext: vi.fn() }
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

describe('POST /api/coach/weekly/reviews/[id]/proposal', () => {
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
})

function request(): Request {
  return new Request(`http://localhost/api/coach/weekly/reviews/${REVIEW_ID}/proposal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: 'proposal-week-2' })
  })
}

function client(action = 'continue') {
  const presentationClass = action === 'pause_review' ? 'safety' : 'same_track'
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
