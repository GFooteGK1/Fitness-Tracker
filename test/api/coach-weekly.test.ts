import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUSY_COACH_CONTEXT_MESSAGE, CoachContextRevisionConflictError, CoachContextRevisionUnavailableError, fetchCoachContextRevision } from '@/app/lib/coach/proposal-context-revision'

vi.mock('@/app/lib/coach/proposal-context-revision', async importOriginal => ({
  ...await importOriginal<typeof import('@/app/lib/coach/proposal-context-revision')>(),
  fetchCoachContextRevision: vi.fn().mockResolvedValue(7),
}))

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
import * as planningContext from '@/app/lib/coach/planning-intent-server'
import { intent } from '../fixtures/personalized-coaching/intent'

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
  it.each(['revision', 'proposal'])('returns retryable 409 for %s lock contention', async stage => {
    const supabase = postClient()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    if (stage === 'revision') vi.mocked(fetchCoachContextRevision).mockRejectedValueOnce(new CoachContextRevisionConflictError(BUSY_COACH_CONTEXT_MESSAGE))
    else supabase.rpc.mockResolvedValue({ data: null, error: { code: '55P03', message: 'private SQL details' } })
    const response = await POST(postRequest({ planningInput, goalTargetDate: '2026-12-31', idempotencyKey: 'lock-contention-key' }))
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe(BUSY_COACH_CONTEXT_MESSAGE)
    if (stage === 'revision') { expect(fetchCoachRuntimeContext).not.toHaveBeenCalled(); expect(supabase.rpc).not.toHaveBeenCalled() }
    else expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })
  it('returns an actionable conflict before saving a draft with a stale event date', async () => {
    const supabase = postClient()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const content = intent()
    content.event = { name: 'Synthetic spring event', date: '2027-04-10', goalIds: [content.outcomes[0].goal.id] }
    const refresh = vi.spyOn(planningContext, 'refreshConfirmedPlanningContext').mockImplementation(async (_db, _user, profile) => ({
      ...profile, trainingIntent: { schemaVersion: 1, memoryId: '11111111-1111-4111-8111-111111111111', memoryVersion: 1, content },
    }))
    try {
      const response = await POST(postRequest({ planningInput, goalTargetDate: '2026-12-31', idempotencyKey: 'event-conflict-key' }))
      expect(response.status).toBe(409)
      expect((await response.json()).error).toContain('confirmed event date (2027-04-10)')
      expect(supabase.rpc).not.toHaveBeenCalled()
    } finally { refresh.mockRestore() }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchCoachContextRevision).mockResolvedValue(7)
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
        p_input_snapshot: expect.objectContaining({ contextRevision: 7 }),
        p_intent: expect.objectContaining({ horizon_weeks: 1 }),
        p_sessions: expect.arrayContaining([
          expect.objectContaining({ week_number: 1, scheduled_date: expect.stringMatching(/^2026-09-/) })
        ]),
        p_input_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/)
      })
    )
    expect(supabase.rpc).not.toHaveBeenCalledWith('accept_adaptation_proposal', expect.anything())
    expect(vi.mocked(fetchCoachContextRevision).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(fetchCoachRuntimeContext).mock.invocationCallOrder[0])
  })

  it('fails closed before reading planning inputs when the revision is unavailable', async () => {
    const supabase = postClient()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    vi.mocked(fetchCoachContextRevision).mockRejectedValueOnce(new CoachContextRevisionUnavailableError())
    const response = await POST(postRequest({ planningInput, goalTargetDate: '2026-12-31', idempotencyKey: 'revision-missing' }))
    expect(response.status).toBe(503)
    expect(fetchCoachRuntimeContext).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('asks for a refreshed proposal when SQL rejects changed context', async () => {
    const supabase = postClient()
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '40001' } })
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const response = await POST(postRequest({ planningInput, goalTargetDate: '2026-12-31', idempotencyKey: 'revision-stale' }))
    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('training information changed')
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
          { id: 'plan-2', sequence_number: 2, status: 'accepted', input_snapshot: { contextRevision: 7 } },
          { id: 'plan-1', sequence_number: 1, status: 'superseded' }
        ],
        error: null
      }],
      coach_weekly_reviews: [{ data: [{ id: 'review-1', action: 'continue' }], error: null }],
      coach_review_source_invalidations: [{ data: [], error: null }],
      adaptation_proposals: [{ data: [{ id: 'proposal-3', proposed_plan_version_id: 'plan-2', status: 'proposed' }], error: null }],
      coach_context_revisions: [{ data: [{ revision: 7 }], error: null }]
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

  it('keeps invalidation visible with the feature flag off and checks pending reviews outside the displayed history',async()=>{
    vi.stubEnv('COACH_TARGETED_REVIEW_ENABLED','false')
    const results={training_programs:[{data:[{id:'program',active_plan_version_id:'plan',program_mode:'rolling_weekly'}],error:null}],training_plan_versions:[{data:[{id:'plan'}],error:null}],coach_weekly_reviews:[{data:[{id:'current-review'}],error:null}],adaptation_proposals:[{data:[{id:'pending',weekly_review_id:'older-review',status:'proposed'}],error:null}],coach_review_source_invalidations:[{data:[{review_id:'current-review'}],error:null},{data:[{review_id:'older-review'}],error:null}],coach_context_revisions:[{data:[{revision:7}],error:null}]}
    const supabase=historyClient(results);vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const response=await GET(),body=await response.json()
    expect(response.status).toBe(200);expect(body.pendingProposal).toBeNull();expect(body.history.reviews[0].sourceInvalidated).toBe(true)
    expect(supabase.from.mock.calls.filter(([table])=>table==='coach_review_source_invalidations')).toHaveLength(2)
    vi.unstubAllEnvs()
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
          input_snapshot: { contextRevision: 7 },
          intent: { weekly_plan: { kind: 'weekly_plan' } }
        }],
        error: null
      }],
      coach_weekly_reviews: [{ data: [], error: null }],
      coach_context_revisions: [{ data: [{ revision: 7 }], error: null }],
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

  it.each([undefined, 6])('hides an initial pending draft with an unverified or older revision %s', async contextRevision => {
    const supabase = historyClient({
      training_programs: [{ data: [{ id: 'program', active_plan_version_id: null, program_mode: 'rolling_weekly' }], error: null }],
      training_plan_versions: [{ data: [{ id: 'draft', input_snapshot: { contextRevision } }], error: null }],
      coach_weekly_reviews: [{ data: [], error: null }],
      adaptation_proposals: [{ data: [{ id: 'proposal', proposed_plan_version_id: 'draft', status: 'proposed' }], error: null }],
      coach_context_revisions: [{ data: [{ revision: 7 }], error: null }],
    })
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const response = await GET()
    expect(response.status).toBe(200)
    expect((await response.json()).pendingProposal).toBeNull()
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
