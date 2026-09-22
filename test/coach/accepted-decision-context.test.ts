import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchCoachingDecisionContext } from '@/app/lib/coach/coaching-decision-context-server'
import { projectAcceptedCoachingDecisionOrigin } from '@/app/lib/coach/coaching-decision-context'
import { coachingDecisionRows } from '../fixtures/coaching-decision-record'

function fixture() {
  const original = coachingDecisionRows()
  const proposal = { ...original.proposal, status: 'accepted' }
  const acceptedPlan = { id: proposal.proposed_plan_version_id, user_id: original.userId,
    program_id: original.programId, status: 'accepted', plan_mode: 'rolling_weekly',
    intent: { weekly_plan: { reviewDecision: { reviewId: original.review.id } } } }
  return { ...original, acceptedPlanVersionId: acceptedPlan.id, acceptedPlan, proposal }
}

function database(options: { corrected?: boolean; currentReview?: boolean; invalidationUnavailable?: boolean } = {}) {
  const f = fixture()
  const currentReview = { ...structuredClone(f.review), id: 'review-current', base_plan_version_id: f.acceptedPlanVersionId,
    rationale: { ...structuredClone(f.review.rationale), contextRevision: 8 },
    evidence_snapshot: { ...structuredClone(f.review.evidence_snapshot), activePlanVersionId: f.acceptedPlanVersionId } }
  const currentProposal = { ...f.proposal, id: 'proposal-current', status: 'proposed',
    base_plan_version_id: f.acceptedPlanVersionId, proposed_plan_version_id: 'plan-3', weekly_review_id: currentReview.id }
  const tables: Record<string, Record<string, unknown>[]> = {
    training_programs: [{ id: f.programId, user_id: f.userId, active_plan_version_id: f.acceptedPlanVersionId, status: 'active' }],
    training_plan_versions: [f.acceptedPlan],
    coach_weekly_reviews: [f.review, ...(options.currentReview ? [currentReview] : [])],
    adaptation_proposals: [f.proposal, ...(options.currentReview ? [currentProposal] : [])],
    coach_context_revisions: [{ user_id: f.userId, revision: 8 }],
    coach_review_source_invalidations: options.corrected ? [{ user_id: f.userId, review_id: f.review.id }] : [],
  }
  const queries: Array<{ table: string; filters: Array<[string, unknown]> }> = []
  const write = vi.fn()
  const db = { rpc: write, from: (table: string) => {
    let rows = [...(tables[table] ?? [])]
    const filters: Array<[string, unknown]> = []
    queries.push({ table, filters })
    const q = { select: (_fields: string) => q,
      eq: (key: string, value: unknown) => { filters.push([key, value]); rows = rows.filter(row => row[key] === value); return q },
      order: (_key: string, _options?: unknown) => q,
      limit: async (n: number) => ({ data: rows.slice(0, n), error: options.invalidationUnavailable && table === 'coach_review_source_invalidations' ? { code: '08006' } : null }),
      insert: write, update: write, delete: write }
    return q
  } }
  return { f, tables, queries, write, db: db as unknown as SupabaseClient }
}

describe('accepted plan historical decision origin', () => {
  it.each([false, true])('retains origin values and exclusions after acceptance with corrected sources=%s', async corrected => {
    const { f, db, queries, write } = database({ corrected }), before = structuredClone(f)
    const context = await fetchCoachingDecisionContext(db, f.userId, f.programId, f.acceptedPlanVersionId)
    expect(context).toMatchObject({ status: 'absent', decision: null, acceptedOrigin: {
      authority: 'accepted_plan_origin', acceptedPlanVersionId: 'plan-2', reviewedBasePlanVersionId: 'plan-1',
      validity: 'historical_accepted_snapshot', currentEligibility: 'not_evaluated', sourceStatus: corrected ? 'corrected' : 'unchanged',
      decision: { reviewId: 'review-1', contextRevision: 7, action: 'continue',
        evidence: [{ baselineAverage: 100, recentAverage: 101 }],
        evidenceSnapshot: { activePlanVersionId: 'plan-1', excludedObservations: [{ observationId: 'incompatible-1' }] },
        proposal: { state: 'accepted', proposedPlanVersionId: 'plan-2' } }
    } })
    expect(context.missing).toContain('stored_review_absent')
    expect(f).toEqual(before)
    context.acceptedOrigin!.decision.rationale[0] = 'Projection-only edit'
    expect(f).toEqual(before)
    for (const query of queries) expect(query.filters).toContainEqual(['user_id', f.userId])
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps the next current review distinct from the accepted origin', async () => {
    const { f, db } = database({ corrected: true, currentReview: true })
    const context = await fetchCoachingDecisionContext(db, f.userId, f.programId, f.acceptedPlanVersionId)
    expect(context).toMatchObject({ status: 'current', decision: { reviewId: 'review-current', contextRevision: 8,
      proposal: { state: 'proposed', proposedPlanVersionId: 'plan-3' } },
    acceptedOrigin: { sourceStatus: 'corrected', decision: { reviewId: 'review-1', contextRevision: 7, proposal: { state: 'accepted' } } } })
  })

  it('retains historical origin with explicit unknown source status when invalidation lookup fails', async () => {
    const { f, db } = database({ invalidationUnavailable: true })
    const context = await fetchCoachingDecisionContext(db, f.userId, f.programId, f.acceptedPlanVersionId)
    expect(context.acceptedOrigin).toMatchObject({ sourceStatus: 'unknown', currentEligibility: 'not_evaluated' })
    expect(context.missing).toContain('accepted_origin_source_validity_unknown')
  })

  it.each(['plan_owner', 'proposal_owner', 'review_owner', 'proposal_target', 'review_base', 'embedded_review', 'not_accepted'] as const)(
    'rejects an invalid accepted chain: %s', mutation => {
      const f = fixture()
      if (mutation === 'plan_owner') f.acceptedPlan.user_id = 'foreign'
      if (mutation === 'proposal_owner') f.proposal.user_id = 'foreign'
      if (mutation === 'review_owner') f.review.user_id = 'foreign'
      if (mutation === 'proposal_target') f.proposal.proposed_plan_version_id = 'foreign-plan'
      if (mutation === 'review_base') f.review.base_plan_version_id = 'different-base'
      if (mutation === 'embedded_review') f.acceptedPlan.intent.weekly_plan.reviewDecision.reviewId = 'different-review'
      if (mutation === 'not_accepted') f.acceptedPlan.status = 'proposed'
      expect(projectAcceptedCoachingDecisionOrigin(f)).toBeNull()
    })

  it('withholds an oversized origin without suppressing a valid current review', async () => {
    const { f, db } = database({ currentReview: true })
    f.review.rationale.messages = ['x'.repeat(2_001)]
    const context = await fetchCoachingDecisionContext(db, f.userId, f.programId, f.acceptedPlanVersionId)
    expect(context.status).toBe('current')
    expect(context.decision?.reviewId).toBe('review-current')
    expect(context.acceptedOrigin).toBeUndefined()
    expect(context.missing).toContain('accepted_origin_invalid_or_oversized')
  })

  it('cannot expose another owner or an accepted plan which is no longer active', async () => {
    const { f, db, tables } = database()
    expect((await fetchCoachingDecisionContext(db, 'foreign', f.programId, f.acceptedPlanVersionId)).acceptedOrigin).toBeUndefined()
    tables.training_programs[0].active_plan_version_id = 'newer-plan'
    const context = await fetchCoachingDecisionContext(db, f.userId, f.programId, f.acceptedPlanVersionId)
    expect(context.acceptedOrigin).toBeUndefined()
    expect(context.missing).toContain('accepted_origin_binding_changed')
  })
})
