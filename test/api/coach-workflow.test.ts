import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn()
}))
vi.mock('@/app/lib/coach/athlete-context', async importOriginal => {
  const actual = await importOriginal<typeof import('@/app/lib/coach/athlete-context')>()
  return {
    ...actual,
    fetchCoachRuntimeContext: vi.fn()
  }
})

import { GET as getCoachState } from '@/app/api/coach/route'
import { POST as saveCoachIntake } from '@/app/api/coach/intake/route'
import { POST as createCoachProposal } from '@/app/api/coach/proposals/route'
import { POST as acceptCoachProposal } from '@/app/api/coach/proposals/[id]/accept/route'
import { POST as saveStrengthAssessment } from '@/app/api/coach/assessments/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'

const planningInput = {
  primaryDomain: 'strength',
  goal: 'Build useful full-body strength',
  experience: 'consistent',
  trainingDays: ['monday', 'wednesday', 'friday'],
  sessionMinutes: 60,
  equipment: 'Barbell, rack, dumbbells, and a bike',
  constraints: 'Keep Saturday free',
  startDate: '2026-08-03'
}

function request(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function supabaseClient(user: { id: string } | null = { id: 'user-1' }) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : { message: 'Unauthorized' }
      })
    },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null })
  }
}

describe('adaptive coach API workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchCoachRuntimeContext).mockResolvedValue({
      generatedAt: '2026-07-27T00:00:00.000Z',
      storageAvailable: true,
      doctrineVersion: '0.1.0',
      policyVersion: '0.1.0',
      assessments: [],
      memories: [],
      activeProgram: null
    })
  })

  it('protects the canonical coach state', async () => {
    vi.mocked(createServerClient).mockResolvedValue(supabaseClient(null) as never)

    const response = await getCoachState()

    expect(response.status).toBe(401)
    expect(fetchCoachRuntimeContext).not.toHaveBeenCalled()
  })

  it('confirms goal, schedule, equipment, and constraints as versioned memories', async () => {
    const supabase = supabaseClient()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await saveCoachIntake(request('/api/coach/intake', {
      planningInput,
      idempotencyKey: 'coach-intake-request-1'
    }))

    expect(response.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledTimes(4)
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'confirm_coach_memory', expect.objectContaining({
      p_memory_key: 'primary_goal',
      p_kind: 'goal',
      p_content: {
        goal: planningInput.goal,
        primaryDomain: planningInput.primaryDomain
      }
    }))
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'confirm_coach_memory', expect.objectContaining({
      p_memory_key: 'training_schedule',
      p_kind: 'schedule'
    }))
  })

  it('rejects invalid planning input before writing memory', async () => {
    const supabase = supabaseClient()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await saveCoachIntake(request('/api/coach/intake', {
      planningInput: { ...planningInput, trainingDays: ['monday'] },
      idempotencyKey: 'coach-intake-request-1'
    }))

    expect(response.status).toBe(400)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('derives and stores a labeled estimated 1RM from an athlete-confirmed max', async () => {
    const storedRow = {
      id: '44444444-4444-4444-8444-444444444444',
      movement: 'Back Squat',
      variation: null,
      load: '100.00',
      unit: 'kg',
      reps: 5,
      assessed_on: '2026-07-27',
      is_true_rep_max: true,
      rir: '0.0',
      rpe: null,
      athlete_confidence: '0.900',
      estimated_1rm: '116.70',
      estimate_kind: 'estimated_1rm',
      calculator_version: 'epley-general-v1',
      input_fingerprint: 'a'.repeat(64)
    }
    const single = vi.fn().mockResolvedValue({ data: storedRow, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    const supabase = {
      ...supabaseClient(),
      from: vi.fn().mockReturnValue({ insert })
    }
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await saveStrengthAssessment(request('/api/coach/assessments', {
      assessment: {
        movement: 'Back Squat',
        load: 100,
        unit: 'kg',
        reps: 5,
        assessedOn: '2026-07-27',
        isTrueRepMax: true,
        rir: 0,
        athleteConfidence: 0.9
      },
      idempotencyKey: 'coach-assessment-request-1'
    }))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.assessment).toMatchObject({
      id: storedRow.id,
      estimateKind: 'estimated_1rm',
      estimatedOneRepMax: 116.7
    })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      movement: 'Back Squat',
      estimated_1rm: 116.7,
      input_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/)
    }))
  })

  it('stores a deterministic proposal through the atomic database RPC', async () => {
    const supabase = supabaseClient()
    supabase.rpc.mockResolvedValue({
      data: [{
        proposal_id: '11111111-1111-4111-8111-111111111111',
        proposed_program_id: '22222222-2222-4222-8222-222222222222',
        proposed_plan_version_id: '33333333-3333-4333-8333-333333333333'
      }],
      error: null
    })
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await createCoachProposal(request('/api/coach/proposals', {
      planningInput,
      idempotencyKey: 'coach-proposal-request-1'
    }))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.proposal.sessions).toHaveLength(24)
    expect(body.proposalId).toBe('11111111-1111-4111-8111-111111111111')
    expect(supabase.rpc).toHaveBeenCalledWith(
      'create_initial_training_plan_proposal',
      expect.objectContaining({
        p_input_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        p_intent: expect.objectContaining({ horizon_weeks: 8 }),
        p_sessions: expect.arrayContaining([
          expect.objectContaining({
            week_number: 1,
            session_index: 1,
            prescription: expect.objectContaining({
              domain: 'strength',
              dose: expect.objectContaining({ source: 'validated_policy' })
            })
          })
        ])
      })
    )
  })

  it('uses saved assessments and creates a replacement proposal when a plan is active', async () => {
    const supabase = supabaseClient()
    supabase.rpc.mockResolvedValue({
      data: [{
        proposal_id: '11111111-1111-4111-8111-111111111111',
        proposed_program_id: '22222222-2222-4222-8222-222222222222',
        proposed_plan_version_id: '33333333-3333-4333-8333-333333333333'
      }],
      error: null
    })
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    vi.mocked(fetchCoachRuntimeContext).mockResolvedValue({
      generatedAt: '2026-07-27T00:00:00.000Z',
      storageAvailable: true,
      doctrineVersion: '0.1.0',
      policyVersion: '0.2.0',
      assessments: [{
        id: 'assessment-1', movement: 'Back Squat', variation: null,
        load: 225, unit: 'lb', reps: 5, assessedOn: '2026-07-27',
        isTrueRepMax: true, rir: 0, rpe: null, athleteConfidence: 0.9,
        estimatedOneRepMax: 262.5, estimateKind: 'estimated_1rm',
        calculatorVersion: 'epley-general-v1'
      }],
      memories: [],
      activeProgram: {
        id: 'program-active', title: 'Strength · 8 weeks', goalSummary: planningInput.goal,
        startDate: '2026-08-03', endDate: '2026-09-27', activePlanVersionId: 'plan-active',
        planVersion: 1, currentWeek: 1, currentWeekRole: 'establish',
        referenceVersion: '0.1.0', policyVersion: '0.1.0', weeks: [], upcomingSessions: []
      }
    })

    const response = await createCoachProposal(request('/api/coach/proposals', {
      planningInput,
      idempotencyKey: 'coach-replacement-request-1'
    }))

    expect(response.status).toBe(201)
    expect(supabase.rpc).toHaveBeenCalledWith(
      'create_training_plan_replacement_proposal',
      expect.objectContaining({
        p_program_id: 'program-active',
        p_base_plan_version_id: 'plan-active',
        p_rationale: expect.objectContaining({ reason: 'replacement_program' }),
        p_sessions: expect.arrayContaining([
          expect.objectContaining({
            prescription: expect.objectContaining({
              dose: expect.objectContaining({
                blocks: expect.arrayContaining([
                  expect.objectContaining({
                    exercises: expect.arrayContaining([
                      expect.objectContaining({
                        name: 'Barbell back squat',
                        load_guidance: expect.objectContaining({ assessmentId: 'assessment-1' })
                      })
                    ])
                  })
                ])
              })
            })
          })
        ])
      })
    )
  })

  it('accepts only the named proposal and returns refreshed canonical state', async () => {
    const supabase = supabaseClient()
    supabase.rpc.mockResolvedValue({
      data: [{
        accepted_program_id: '22222222-2222-4222-8222-222222222222',
        active_plan_version_id: '33333333-3333-4333-8333-333333333333',
        proposal_status: 'accepted'
      }],
      error: null
    })
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await acceptCoachProposal(
      request('/api/coach/proposals/11111111-1111-4111-8111-111111111111/accept', {
        idempotencyKey: 'coach-proposal-request-1'
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) }
    )

    expect(response.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith('accept_adaptation_proposal', {
      p_proposal_id: '11111111-1111-4111-8111-111111111111',
      p_idempotency_key: 'coach-proposal-request-1'
    })
    expect(fetchCoachRuntimeContext).toHaveBeenCalledWith(supabase, 'user-1')
  })
})
