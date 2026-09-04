import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn()
}))
vi.mock('@/app/lib/coach/athlete-context', async importOriginal => {
  const actual = await importOriginal<typeof import('@/app/lib/coach/athlete-context')>()
  return { ...actual, fetchCoachRuntimeContext: vi.fn() }
})

import { POST } from '@/app/api/coach/weekly/convert/route'
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

describe('/api/coach/weekly/convert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchCoachRuntimeContext).mockResolvedValue({
      storageAvailable: true,
      assessments: []
    } as never)
  })

  it('creates an inactive weekly replacement from an accepted legacy plan', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await POST(request({
      planningInput,
      goalTargetDate: '2026-12-31',
      hypothesis: 'Use repeatable weekly strength doses and review the response.',
      idempotencyKey: 'legacy-conversion-1'
    }))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({ activePlanChanged: false, acceptanceRequired: true })
    expect(body.proposal).toMatchObject({
      source: 'legacy_conversion',
      windowStart: '2026-09-07',
      windowEnd: '2026-09-13'
    })
    expect(supabase.rpc).toHaveBeenCalledWith(
      'create_rolling_weekly_replacement_proposal',
      expect.objectContaining({
        p_program_id: 'program-legacy',
        p_base_plan_version_id: 'plan-legacy',
        p_weekly_review_id: null,
        p_window_start: '2026-09-07',
        p_intent: expect.objectContaining({ horizon_weeks: 1 }),
        p_input_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/)
      })
    )
    expect(supabase.rpc).not.toHaveBeenCalledWith('accept_adaptation_proposal', expect.anything())
  })

  it('does not accept a conversion without an active accepted legacy plan', async () => {
    const supabase = client({ activePlan: null })
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await POST(request({
      planningInput,
      goalTargetDate: '2026-12-31',
      hypothesis: 'Use repeatable weekly strength doses and review the response.',
      idempotencyKey: 'legacy-conversion-1'
    }))

    expect(response.status).toBe(409)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})

function request(body: unknown): Request {
  return new Request('http://localhost/api/coach/weekly/convert', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function client(options: { activePlan?: string | null } = {}) {
  const activePlan = options.activePlan === undefined ? 'plan-legacy' : options.activePlan
  const results: Record<string, Array<{ data: unknown; error: null }>> = {
    training_programs: [{
      data: activePlan ? [{ id: 'program-legacy', active_plan_version_id: activePlan }] : [],
      error: null
    }],
    training_plan_versions: [{
      data: activePlan ? [{ id: activePlan, status: 'accepted', plan_mode: 'legacy_eight_week' }] : [],
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
        proposal_id: 'proposal-weekly',
        proposed_program_id: 'program-legacy',
        proposed_plan_version_id: 'plan-weekly'
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
