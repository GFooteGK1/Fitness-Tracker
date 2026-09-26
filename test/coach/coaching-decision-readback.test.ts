import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import { coachingDecisionRows } from '../fixtures/coaching-decision-record'
import { projectCoachingDecisionContext } from '@/app/lib/coach/coaching-decision-context'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { GET } from '@/app/api/coach/weekly/route'

/** In-memory owned-row readback exercises the real runtime and API projections. */
function client(invalidated = false, revision = 7, acceptedReplacement = false) {
  const fixture = coachingDecisionRows()
  const tables: Record<string, Array<Record<string, unknown>>> = {
    training_programs: [{ id: fixture.programId, user_id: fixture.userId, status: 'active',
      program_mode: 'rolling_weekly', active_plan_version_id: fixture.basePlanVersionId,
      title: 'Accepted week', goal_summary: 'Build strength', start_date: '2026-09-14', end_date: '2026-09-20' }],
    training_plan_versions: [{ id: fixture.basePlanVersionId, user_id: fixture.userId, program_id: fixture.programId,
      version: 1, plan_mode: 'rolling_weekly', status: 'accepted', sequence_number: 1,
      reference_version: 'test-reference', policy_version: 'test-policy', intent: { format: 'rolling_weekly_intent_v0_1' } }],
    coach_weekly_reviews: [fixture.review], adaptation_proposals: [fixture.proposal],
    coach_context_revisions: [{ user_id: fixture.userId, revision }],
    coach_review_source_invalidations: invalidated ? [{ user_id: fixture.userId, review_id: fixture.review.id }] : [],
  }
  if (acceptedReplacement) {
    tables.training_programs[0].active_plan_version_id = fixture.proposal.proposed_plan_version_id
    tables.training_plan_versions[0].id = fixture.proposal.proposed_plan_version_id
    tables.training_plan_versions[0].intent = { format: 'rolling_weekly_intent_v0_1',
      weekly_plan: { reviewDecision: { reviewId: fixture.review.id } } }
    tables.adaptation_proposals[0] = { ...fixture.proposal, status: 'accepted' }
  }
  const queries: Array<{ table: string; filters: Array<[string, unknown]> }> = []
  const supabase = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: fixture.userId } }, error: null }) },
    from: vi.fn((table: string) => {
      const filters: Array<[string, unknown]> = []
      queries.push({ table, filters })
      let rows = [...(tables[table] ?? [])]
      const q = { select: (_fields: string) => q,
        eq: (key: string, value: unknown) => { filters.push([key, value]); rows = rows.filter(row => row[key] === value); return q },
        in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return q },
        lte: (_key: string, _value: unknown) => q, order: (_key: string, _options?: unknown) => q,
        limit: async (n: number) => ({ data: rows.slice(0, n), error: null }) }
      return q
    }) }
  return { fixture, supabase: supabase as unknown as SupabaseClient, queries }
}

describe('saved coaching decision readback parity', () => {
  it.each([false, true])('preserves accepted origin in chat and Program after base changes; corrected=%s', async corrected => {
      const { fixture, supabase, queries } = client(corrected, 12, true)
      vi.mocked(createServerClient).mockResolvedValue(supabase as never)
      const context = await fetchCoachRuntimeContext(supabase, fixture.userId, new Date('2026-09-20T20:00:00Z'))
      const response = await GET()
      const state = await response.json()
      expect(response.status).toBe(200)
      expect(state.coachingDecision).toEqual(context.coachingDecision)
      expect(state.coachingDecision).toMatchObject({ status: 'absent', decision: null,
        acceptedOrigin: { acceptedPlanVersionId: fixture.proposal.proposed_plan_version_id,
          reviewedBasePlanVersionId: fixture.basePlanVersionId, currentEligibility: 'not_evaluated',
          sourceStatus: corrected ? 'corrected' : 'unchanged', decision: { contextRevision: 7,
            rationale: fixture.review.rationale.messages, evidence: [{ baselineAverage: 100, recentAverage: 101 }],
            proposal: { state: 'accepted' } } } })
      expect(state.pendingProposal).toBeNull()
      for (const query of queries) expect(query.filters).toContainEqual(['user_id', fixture.userId])
  })
  it('marks new context stale consistently in chat and Program even without an included-source invalidation', async () => {
    const { fixture, supabase } = client(false, 8)
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const context = await fetchCoachRuntimeContext(supabase, fixture.userId, new Date('2026-09-20T20:00:00Z'))
    const response = await GET()
    const state = await response.json()
    expect(response.status).toBe(200)
    expect(state.coachingDecision).toEqual(context.coachingDecision)
    expect(state.coachingDecision).toMatchObject({ status: 'context_changed', decision: null })
    expect(state.pendingProposal).toBeNull()
  })
  it.each([false, true])('gives chat and weekly API the same owned decision with invalidated=%s', async invalidated => {
    const { fixture, supabase, queries } = client(invalidated)
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const context = await fetchCoachRuntimeContext(supabase, fixture.userId, new Date('2026-09-20T20:00:00Z'))
    const response = await GET()
    const state = await response.json()
    expect(response.status).toBe(200)
    const expected = projectCoachingDecisionContext({ ...fixture, sourceInvalidated: invalidated })
    expect(context.coachingDecision).toEqual(expected)
    expect(state.coachingDecision).toEqual(expected)
    expect(context.activeProgram?.activePlanVersionId).toBe(fixture.basePlanVersionId)
    if (invalidated) {
      expect(state.pendingProposal).toBeNull()
      expect(state.coachingDecision.decision).toBeNull()
    } else {
      expect(state.coachingDecision.decision.proposal.state).toBe('proposed')
      expect(state.coachingDecision.latestAthleteContextReconciled).toBe(false)
    }
    for (const query of queries) expect(query.filters).toContainEqual(['user_id', fixture.userId])
  })
})
