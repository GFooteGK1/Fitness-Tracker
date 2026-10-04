import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchReviewedProposalIndex, fetchReviewedProposalState } from '@/app/lib/coach/reviewed-proposal-state-server'
import type { TrustedReviewedWeekRegistration } from '@/app/lib/coach/reviewed-week-context-server'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { reviewedC2rWeek } from '../fixtures/reviewed-c2r-week'
import { reconcileReviewedDoseWeek } from '@/app/lib/coach/reviewed-dose-week-reconciliation'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildStoredRollingWeeklyIntent } from '@/app/lib/coach/rolling-weekly-api'
import { buildAdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'
const owner = '11111111-1111-4111-8111-111111111111', program = '22222222-2222-4222-8222-222222222222'
const proposal = '33333333-3333-4333-8333-333333333333', registration = '44444444-4444-4444-8444-444444444444'
const target = '55555555-5555-4555-8555-555555555555', base = '66666666-6666-4666-8666-666666666666'
function fixture() {
  const { plan, intent } = reviewedRollingWeek()
  const planRow = { user_id: owner, program_id: program, plan_mode: 'rolling_weekly', window_start: plan.windowStart,
    window_end: plan.windowEnd, sequence_number: plan.sequenceNumber, intent, input_snapshot: { contextRevision: 1, reviewedRegistrationId: 'trusted-review' } }
  const tables: Record<string, any[]> = {
    adaptation_proposals: [{ id: proposal, user_id: owner, program_id: program, base_plan_version_id: base, proposed_plan_version_id: target,
      idempotency_key: 'original-request', status: 'proposed', rationale: { proposal_mode: 'reviewed_rolling_week', reviewedRegistrationId: registration } }],
    training_plan_versions: [{ ...planRow, id: target, status: 'proposed' }, { ...planRow, id: base, status: 'accepted' }],
    training_programs: [{ id: program, user_id: owner, status: 'active', program_mode: 'rolling_weekly', active_plan_version_id: base }],
    coach_context_revisions: [{ user_id: owner, revision: 1 }],
  }
  const metadata = { userId: owner, programId: program, registrationId: registration, proposalId: proposal, planVersionId: target, reviewId: 'trusted-review' }
  const state = { fail: '', change: '', owner, truncated: false }, calls: Record<string, number> = {}
  const db = { auth: { getUser: async () => ({ data: { user: { id: state.owner } }, error: null }) },
    rpc: async () => ({ data: metadata, error: state.fail === 'metadata' ? {} : null }),
    from(table: string) {
      calls[table] = (calls[table] ?? 0) + 1; const call = calls[table], filters: Array<(row: any) => boolean> = []
      const query = { select: () => query, order: () => query,
        eq: (key: string, value: unknown) => { filters.push(row => (key.includes('->>') ? row[key.split('->>')[0]]?.[key.split('->>')[1]] : row[key]) === value); return query },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query },
        limit: async (cap: number) => {
          const all = tables[table].filter(row => filters.every(filter => filter(row))), data = structuredClone(all.slice(0, cap))
          if (state.change === table && call > 1 && data[0]) data[0].changed = true
          return { data, count: all.length + (state.truncated ? 1 : 0), error: state.fail === table ? {} : null }
        } }
      return query
    } } as unknown as SupabaseClient
  const registry = [{ id: 'trusted-review', userId: owner, scope: { programId: program, basePlanVersionId: base }, compilation: { windowStart: plan.windowStart } }] as TrustedReviewedWeekRegistration[]
  return { db, state, tables, metadata, registry }
}
describe('owned reviewed proposal presentation', () => {
  function c2rFixture() {
    const f = fixture(), week = reviewedC2rWeek(), contextHash = 'a'.repeat(64)
    const result = reconcileReviewedDoseWeek({ owner, contextHash, basePlanVersionId: base,
      base: week.base, target: week.target, registration: week.reconciliation })
    if (result.kind !== 'reconciled') throw new Error(result.reasons.join('; '))
    for (const [index, plan] of [week.target, week.base].entries()) Object.assign(f.tables.training_plan_versions[index], {
      intent: { format: 'reviewed_weekly_intent_v0_1', horizon_weeks: 1, reviewed_week: plan },
      window_start: plan.windowStart, window_end: plan.windowEnd, sequence_number: plan.sequenceNumber,
    })
    f.tables.training_plan_versions[0].input_snapshot = { ...f.tables.training_plan_versions[0].input_snapshot,
      reviewedSourceHash: contextHash, reviewedDoseReconciliation: result.receipt }
    return f
  }
  it('reads the verified historical dose separately from the base and proposed week after source drift', async () => {
    const f = c2rFixture()
    f.tables.coach_context_revisions[0].revision = 2
    const value = await fetchReviewedProposalState(f.db, owner, proposal)
    expect(value?.acceptanceAvailable).toBe(false)
    expect(value?.doseDecision?.historical).toContain('prior prescribed RPE unknown')
    expect(value?.doseDecision?.base).toContain('165 lb total')
    expect(value?.doseDecision?.proposed).toContain('170 lb total')
    expect(value?.doseDecision?.timing).toContain('conditional')
  })
  it.each(['owner', 'summary', 'target', 'source'])('rejects damaged stored C2-R %s instead of displaying unverified rationale', async field => {
    const f = c2rFixture(), row = f.tables.training_plan_versions[0]
    if (field === 'owner') row.input_snapshot.reviewedDoseReconciliation.owner = base
    if (field === 'summary') row.input_snapshot.reviewedDoseReconciliation.summary.proposed = 'Increase every week'
    if (field === 'target') row.input_snapshot.reviewedDoseReconciliation.link.targetPlanHash = 'b'.repeat(64)
    if (field === 'source') row.input_snapshot.reviewedSourceHash = 'b'.repeat(64)
    await expect(fetchReviewedProposalState(f.db, owner, proposal)).rejects.toThrow('Stored dose reconciliation changed')
  })
  it('recovers full immutable target/base and original key', async () => {
    const { db } = fixture(), value = await fetchReviewedProposalState(db, owner, proposal)
    expect(value).toMatchObject({ requestId: 'original-request', acceptanceAvailable: true, planVersionId: target, basePlanVersionId: base })
    expect(value?.plan.scheduledSessions).toHaveLength(5); expect(value?.baseWeek.plan.scheduledSessions).toHaveLength(5)
  })
  it('retains accepted historical readback after the active base changes', async () => {
    const { db, tables } = fixture(); tables.adaptation_proposals[0].status = 'accepted'; tables.training_plan_versions[0].status = 'accepted'
    tables.training_plan_versions[1].status = 'superseded'; tables.training_programs[0].active_plan_version_id = target
    expect(await fetchReviewedProposalState(db, owner, proposal)).toMatchObject({ status: 'accepted', acceptanceAvailable: false, activePlanVersionId: target })
  })
  it('retains the full standard base for the first reviewed replacement', async () => {
    const { db, tables } = fixture(), { plan } = reviewedRollingWeek()
    const standard = buildRollingWeeklyPlan({ source: 'initial', windowStart: plan.windowStart, profile: plan.profileSnapshot, direction: plan.directionSnapshot })
    if (standard.kind !== 'weekly_plan') throw new Error('Invalid fixture')
    tables.training_plan_versions[1].intent = buildStoredRollingWeeklyIntent(standard, buildAdaptivePlanContract(standard.profileSnapshot, [standard]))
    const value = await fetchReviewedProposalState(db, owner, proposal)
    expect(value?.baseWeek.kind).toBe('standard'); expect(value?.baseWeek.plan).toEqual(standard)
  })
  it('does not hide stale proposals or grant fresh acceptance', async () => {
    const { db, tables } = fixture(); tables.coach_context_revisions[0].revision = 2
    expect(await fetchReviewedProposalState(db, owner, proposal)).toMatchObject({ status: 'proposed', acceptanceAvailable: false })
  })
  it('hides foreign and missing rows', async () => {
    const { db, registry } = fixture()
    expect(await fetchReviewedProposalState(db, base, proposal)).toBeNull()
    expect(await fetchReviewedProposalIndex(db, base, program, registry)).toBeNull()
  })
  it.each(['metadata', 'training_plan_versions', 'training_programs', 'coach_context_revisions'])('fails closed on unavailable %s', async fail => {
    const { db, state } = fixture(); state.fail = fail
    await expect(fetchReviewedProposalState(db, owner, proposal)).rejects.toThrow()
  })
  it.each(['adaptation_proposals', 'training_programs', 'coach_context_revisions'])('rejects mid-read %s changes', async change => {
    const { db, state, tables } = fixture(); state.change = change
    if (change === 'coach_context_revisions') {
      let calls = 0
      Object.defineProperty(tables.coach_context_revisions[0], 'revision', { enumerable: true, get: () => ++calls })
    }
    await expect(fetchReviewedProposalState(db, owner, proposal)).rejects.toThrow()
  })
  it('rejects forged linkage, malformed plans and changed account', async () => {
    for (const mutate of [(f: ReturnType<typeof fixture>) => { f.metadata.planVersionId = base },
      (f: ReturnType<typeof fixture>) => { f.tables.training_plan_versions[0].intent = {} },
      (f: ReturnType<typeof fixture>) => { f.state.owner = base }]) {
      const f = fixture(); mutate(f); await expect(fetchReviewedProposalState(f.db, owner, proposal)).rejects.toThrow()
    }
  })
  it('discovers only owned current-base registry IDs; persisted proposals survive empty registry', async () => {
    const f = fixture()
    expect(await fetchReviewedProposalIndex(f.db, owner, program, f.registry)).toMatchObject({ reviews: [{ reviewId: 'trusted-review' }], proposals: [{ proposalId: proposal }] })
    expect((await fetchReviewedProposalIndex(f.db, owner, program, []))?.reviews).toEqual([])
    expect((await fetchReviewedProposalIndex(f.db, owner, program, []))?.proposals).toHaveLength(1)
    await expect(fetchReviewedProposalIndex(f.db, owner, program, [...f.registry, ...f.registry])).rejects.toThrow('Ambiguous')
    f.state.truncated = true; await expect(fetchReviewedProposalIndex(f.db, owner, program, [])).rejects.toThrow('Complete proposal list')
  })
})
