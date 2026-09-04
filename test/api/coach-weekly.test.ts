import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn()
}))
vi.mock('@/app/lib/coach/athlete-context', async importOriginal => {
  const actual = await importOriginal<typeof import('@/app/lib/coach/athlete-context')>()
  return { ...actual, fetchCoachRuntimeContext: vi.fn() }
})

import { GET, POST } from '@/app/api/coach/weekly/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'

const planningInput = {
  format: 'complete_programming_intake_v0_3',
  primaryDomain: 'strength',
  goal: 'Build useful full-body strength',
  experience: 'consistent',
  trainingDays: ['monday', 'thursday'],
  sessionMinutes: 60,
  equipment: 'Barbell, rack, and dumbbells',
  resolvedEquipmentIds: ['bodyweight', 'barbell', 'rack', 'dumbbell'],
  constraints: '',
  constraintKinds: [],
  secondaryGoals: [],
  startDate: '2026-09-07'
}

describe('/api/coach/weekly', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchCoachRuntimeContext).mockResolvedValue({
      storageAvailable: true,
      assessments: []
    } as never)
  })

  it('creates exactly one Monday-through-Sunday proposal without activating it', async () => {
    const supabase = postClient()
    supabase.rpc.mockResolvedValue({
      data: [{
        proposal_id: '11111111-1111-4111-8111-111111111111',
        proposed_program_id: '22222222-2222-4222-8222-222222222222',
        proposed_plan_version_id: '33333333-3333-4333-8333-333333333333'
      }],
      error: null
    })
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await POST(postRequest({
      planningInput,
      goalTargetDate: '2026-12-31',
      idempotencyKey: 'initial-week-1'
    }))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({ activePlanChanged: false, acceptanceRequired: true })
    expect(body.proposal.windowStart).toBe('2026-09-07')
    expect(body.proposal.windowEnd).toBe('2026-09-13')
    expect(supabase.rpc).toHaveBeenCalledWith(
      'create_initial_rolling_weekly_proposal',
      expect.objectContaining({
        p_window_start: '2026-09-07',
        p_goal_target_date: '2026-12-31',
        p_intent: expect.objectContaining({ horizon_weeks: 1 }),
        p_sessions: expect.arrayContaining([
          expect.objectContaining({ week_number: 1, scheduled_date: expect.stringMatching(/^2026-09-/) })
        ]),
        p_input_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/)
      })
    )
    expect(supabase.rpc).not.toHaveBeenCalledWith('accept_adaptation_proposal', expect.anything())
  })

  it('rejects a non-Monday week before storage', async () => {
    const supabase = postClient()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await POST(postRequest({
      planningInput: { ...planningInput, startDate: '2026-09-08' },
      goalTargetDate: '2026-12-31',
      idempotencyKey: 'initial-week-1'
    }))

    expect(response.status).toBe(400)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated creation before loading athlete context', async () => {
    const supabase = postClient(null)
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await POST(postRequest({
      planningInput,
      goalTargetDate: '2026-12-31',
      idempotencyKey: 'initial-week-1'
    }))

    expect(response.status).toBe(401)
    expect(fetchCoachRuntimeContext).not.toHaveBeenCalled()
  })

  it('returns current weekly history and a pending proposal', async () => {
    const program = {
      id: 'program-1', active_plan_version_id: 'plan-2', program_mode: 'rolling_weekly'
    }
    const tableResults: Record<string, Array<{ data: unknown; error: null }>> = {
      training_programs: [{ data: [program], error: null }],
      training_plan_versions: [{
        data: [
          { id: 'plan-2', sequence_number: 2, status: 'accepted' },
          { id: 'plan-1', sequence_number: 1, status: 'superseded' }
        ],
        error: null
      }],
      coach_weekly_reviews: [{ data: [{ id: 'review-1', action: 'continue' }], error: null }],
      adaptation_proposals: [{ data: [{ id: 'proposal-3', status: 'proposed' }], error: null }]
    }
    const supabase = historyClient(tableResults)
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.currentWeek.id).toBe('plan-2')
    expect(body.pendingProposal.id).toBe('proposal-3')
    expect(body.history.plans).toHaveLength(2)
    expect(body.history.reviews[0].action).toBe('continue')
  })

  it('recovers a pending weekly conversion while the legacy plan remains active', async () => {
    const tableResults: Record<string, Array<{ data: unknown; error: null }>> = {
      training_programs: [{
        data: [{
          id: 'program-legacy',
          active_plan_version_id: 'plan-legacy',
          program_mode: 'legacy_eight_week'
        }],
        error: null
      }],
      training_plan_versions: [{
        data: [{
          id: 'plan-weekly-proposed',
          sequence_number: 1,
          status: 'proposed',
          intent: { weekly_plan: { kind: 'weekly_plan' } }
        }],
        error: null
      }],
      coach_weekly_reviews: [{ data: [], error: null }],
      adaptation_proposals: [{
        data: [{
          id: 'proposal-weekly',
          proposed_plan_version_id: 'plan-weekly-proposed',
          status: 'proposed'
        }],
        error: null
      }]
    }
    vi.mocked(createServerClient).mockResolvedValue(historyClient(tableResults) as never)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.program).toBeNull()
    expect(body.currentWeek).toBeNull()
    expect(body.pendingProposal.id).toBe('proposal-weekly')
    expect(body.history.plans[0].id).toBe('plan-weekly-proposed')
  })
})

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/coach/weekly', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function postClient(user: { id: string } | null = { id: 'user-1' }) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : { message: 'Unauthorized' }
      })
    },
    rpc: vi.fn()
  }
}

function historyClient(results: Record<string, Array<{ data: unknown; error: null }>>) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    },
    from: vi.fn((table: string) => query(results[table].shift()!))
  }
}

function query(result: { data: unknown; error: null }) {
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
  chain.order.mockReturnValue(chain)
  chain.limit.mockResolvedValue(result)
  return chain
}
