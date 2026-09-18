import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getRecommendationView } from '@/app/lib/recommendations/service'
import { recommendationScope, fetchRecommendationContext, runtimeFingerprint } from '@/app/lib/recommendations/context'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'
import { claimRefresh, failRefresh, publishRecommendation, readRecommendations, recommendationRPC } from '@/app/lib/recommendations/store'
import { evaluateRecommendationOutcome } from '@/app/lib/recommendations/outcomes'
import { context, stored } from './fixtures'
import { evaluateRules } from '@/app/lib/recommendations/rules'
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/app/lib/recommendations/context', () => ({ recommendationScope: vi.fn(), fetchRecommendationContext: vi.fn(), runtimeFingerprint: vi.fn() }))
vi.mock('@/app/lib/personalized-coaching-capabilities', () => ({ personalizedCoachingCapabilities: vi.fn() }))
vi.mock('@/app/lib/recommendations/store', () => ({ claimRefresh: vi.fn(), failRefresh: vi.fn(), publishRecommendation: vi.fn(), readRecommendations: vi.fn(), recommendationRPC: vi.fn() }))
vi.mock('@/app/lib/recommendations/outcomes', () => ({ evaluateRecommendationOutcome: vi.fn() }))
const db = {} as SupabaseClient
const snapshot = () => ({ recommendations: [], refreshState: { pending: false, sourceRevision: 7, responseRevision: 2 }, suppressions: [], dueOutcomes: [] })
beforeEach(() => {
  vi.resetAllMocks(); const c = context()
  vi.mocked(personalizedCoachingCapabilities).mockReturnValue({ recommendations: true } as never)
  vi.mocked(recommendationScope).mockReturnValue({ now: c.now, localDate: c.localDate, tzOffset: c.tzOffset, validUntil: c.validUntil, runtimeFingerprint: c.runtimeFingerprint })
  vi.mocked(runtimeFingerprint).mockReturnValue(c.runtimeFingerprint)
  vi.mocked(fetchRecommendationContext).mockResolvedValue(c)
  vi.mocked(readRecommendations).mockResolvedValue(snapshot())
  vi.mocked(claimRefresh).mockResolvedValue(c.claim)
  vi.mocked(publishRecommendation).mockResolvedValue({})
  vi.mocked(failRefresh).mockResolvedValue({})
  vi.mocked(recommendationRPC).mockResolvedValue([])
  vi.mocked(evaluateRecommendationOutcome).mockResolvedValue({ schemaVersion: 1, adherence: 'unknown', evidence: [], summary: 'No follow-up.', attributionLimits: ['Causation unknown.'] })
})
describe('bounded recommendation service', () => {
  it('disables reads and analysis when server capability is off', async () => {
    vi.mocked(personalizedCoachingCapabilities).mockReturnValue({ recommendations: false } as never)
    expect(await getRecommendationView(db, 'user-1', 300, true, db)).toMatchObject({ status: 'disabled' })
    expect(readRecommendations).not.toHaveBeenCalled(); expect(claimRefresh).not.toHaveBeenCalled()
  })
  it('performs only one deterministic evaluation for a successful claim', async () => {
    await getRecommendationView(db, 'user-1', 300, true, db)
    expect(claimRefresh).toHaveBeenCalledTimes(1); expect(fetchRecommendationContext).toHaveBeenCalledTimes(1)
    expect(publishRecommendation).toHaveBeenCalledTimes(1)
    expect(vi.mocked(publishRecommendation).mock.calls[0][4]).toMatchObject({ kind: 'abstain', ruleId: 'no_eligible_action' })
  })
  it('does not evaluate when another worker owns the lease', async () => {
    vi.mocked(claimRefresh).mockResolvedValue(null)
    await getRecommendationView(db, 'user-1', 300, true, db)
    expect(fetchRecommendationContext).not.toHaveBeenCalled(); expect(publishRecommendation).not.toHaveBeenCalled()
  })
  it('leaves source failures pending and never publishes a fabricated cold-start decision', async () => {
    vi.mocked(fetchRecommendationContext).mockRejectedValue(new Error('source outage'))
    vi.mocked(readRecommendations).mockResolvedValue({ ...snapshot(), refreshState: { ...snapshot().refreshState, pending: true } })
    expect(await getRecommendationView(db, 'user-1', 300, true, db)).toMatchObject({ status: 'pending' })
    expect(publishRecommendation).not.toHaveBeenCalled(); expect(failRefresh).toHaveBeenCalledTimes(1); expect(claimRefresh).toHaveBeenCalledTimes(1)
  })
  it('distinguishes a recorded evaluation outage from a worker still in progress', async () => {
    vi.mocked(readRecommendations).mockResolvedValue({ ...snapshot(), refreshState: { ...snapshot().refreshState, pending: true, lastError: 'evaluation_unavailable' } })
    expect(await getRecommendationView(db, 'user-1', 300, false, db)).toMatchObject({ status: 'unavailable', refreshState: { pending: true, lastError: 'evaluation_unavailable' } })
    vi.mocked(readRecommendations).mockResolvedValue({ ...snapshot(), refreshState: { ...snapshot().refreshState, pending: true, lastError: null } })
    expect(await getRecommendationView(db, 'user-1', 300, false, db)).toMatchObject({ status: 'pending' })
  })
  it('does not publish if capabilities or local-date scope change during evaluation', async () => {
    vi.mocked(runtimeFingerprint).mockReturnValue('new-runtime')
    await getRecommendationView(db, 'user-1', 300, true, db)
    expect(publishRecommendation).not.toHaveBeenCalled(); expect(failRefresh).toHaveBeenCalledTimes(1)
  })
  it('uses fresh suppression and coverage after the claim and fences changed response revision', async () => {
    const c = context(); c.nutrition.target = { protein: 120, carbs: 200, fat: 60, calories: 1820, updatedAt: c.now }
    c.nutrition.meals = [{ id: 'meal', at: c.now, revision: 1, protein: 30, carbs: 20, fat: 10, calories: 290, estimated: true }]
    vi.mocked(fetchRecommendationContext).mockResolvedValue(c)
    vi.mocked(readRecommendations).mockResolvedValueOnce(snapshot()).mockResolvedValueOnce({ ...snapshot(), coverage: { id: 'coverage-1', coverage_through: c.now, status: 'partial', nutrition_revision: 3, coverageValid: true } }).mockResolvedValue(snapshot())
    await getRecommendationView(db, 'user-1', 300, true, db)
    expect(vi.mocked(publishRecommendation).mock.calls[0][4].sources).toContainEqual(expect.objectContaining({ table: 'logging_coverage_confirmations', id: 'coverage-1' }))
    vi.mocked(publishRecommendation).mockClear(); vi.mocked(fetchRecommendationContext).mockClear()
    vi.mocked(readRecommendations).mockResolvedValue({ ...snapshot(), refreshState: { ...snapshot().refreshState, responseRevision: 3, pending: true } })
    await getRecommendationView(db, 'user-1', 300, true, db)
    expect(fetchRecommendationContext).not.toHaveBeenCalled(); expect(publishRecommendation).not.toHaveBeenCalled()
  })
  it('filters suppressed decisions before publishing the calm abstention', async () => {
    const c = context(); c.missingBaselines = c.intent!.content.outcomes; const d = evaluateRules(c)[0].decision
    vi.mocked(fetchRecommendationContext).mockResolvedValue(c)
    vi.mocked(recommendationRPC).mockResolvedValue([{ scope_key: d.scopeKey, evidence_fingerprint: d.evidenceFingerprint, response: 'done_reported', defer_until: null }])
    await getRecommendationView(db, 'user-1', 300, true, db)
    expect(vi.mocked(publishRecommendation).mock.calls[0][4].kind).toBe('abstain')
  })
  it('bounds follow-up to eight and keeps unavailable follow-up retryable without refresh recursion', async () => {
    vi.mocked(readRecommendations).mockResolvedValue({ ...snapshot(), dueOutcomes: Array.from({ length: 12 }, (_, i) => ({ ...stored(), id: `recommendation-${i}` })) })
    vi.mocked(evaluateRecommendationOutcome).mockRejectedValueOnce(new Error('source unavailable'))
    expect(await getRecommendationView(db, 'user-1', 300, false, db)).toMatchObject({ status: 'ready' })
    expect(evaluateRecommendationOutcome).toHaveBeenCalledTimes(8); expect(recommendationRPC).toHaveBeenCalledTimes(7)
    expect(claimRefresh).not.toHaveBeenCalled(); expect(publishRecommendation).not.toHaveBeenCalled()
  })
  it('returns freshly committed outcome summaries while preserving explicit invalidation state', async () => {
    const outcome = { id: 'event-1', recommendationId: 'recommendation-1', title: 'Prior action', lifecycle: 'superseded', payload: { adherence: 'observed' as const, summary: 'Prior recorded measurement', attributionLimits: ['Causation unknown'] }, createdAt: context().now, invalidated: true }
    vi.mocked(readRecommendations).mockResolvedValueOnce({ ...snapshot(), dueOutcomes: [stored()] }).mockResolvedValue({ ...snapshot(), outcomes: [outcome] })
    const view = await getRecommendationView(db, 'user-1', 300, false, db)
    expect(view.outcomes).toEqual([outcome]); expect(readRecommendations).toHaveBeenCalledTimes(2)
    expect(claimRefresh).not.toHaveBeenCalled()
  })
  it('exposes the latest coverage report with its invalidity instead of silently treating it as complete', async () => {
    const coverage = { id: 'coverage-1', coverage_through: context().now, status: 'complete_through', nutrition_revision: 3, coverageValid: false }
    vi.mocked(readRecommendations).mockResolvedValue({ ...snapshot(), coverage })
    expect(await getRecommendationView(db, 'user-1', 300, false, db)).toMatchObject({ coverage, refreshState: { sourceRevision: 7 } })
  })
})
