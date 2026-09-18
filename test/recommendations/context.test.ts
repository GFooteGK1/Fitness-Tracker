import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRecommendationContext, recommendationScope, runtimeFingerprint } from '@/app/lib/recommendations/context'
import { context, database, ok, OWNER } from './fixtures'

function sources() {
  return { training_programs: [ok([])], coach_memories: [ok([])], daily_targets: [ok([])], meals: [ok([])], adaptation_proposals: [ok([])] }
}
afterEach(() => vi.unstubAllEnvs())
describe('owned recommendation context', () => {
  it('uses athlete-local dates and rejects invalid timezone input', () => {
    const scope = recommendationScope(300, '2026-09-18T02:00:00.000Z')
    expect(scope.localDate).toBe('2026-09-17'); expect(scope.validUntil).toBe('2026-09-18T04:59:59.999Z')
    expect(recommendationScope(-600, '2026-09-17T18:00:00.000Z').localDate).toBe('2026-09-18')
    for (const value of [NaN, Infinity, 1.5, 5000]) expect(() => recommendationScope(value)).toThrow()
  })
  it('includes current feature capability state in the runtime fingerprint', () => {
    vi.stubEnv('RECOMMENDATIONS_ENABLED', 'false'); const before = runtimeFingerprint()
    vi.stubEnv('RECOMMENDATIONS_ENABLED', 'true'); expect(runtimeFingerprint()).not.toBe(before)
  })
  it('keeps absent targets and coverage absent and fences every source query by owner', async () => {
    const c = context(), claim = { ...c.claim, intentMemoryId: null, intentVersion: null }, { db, calls } = database(sources())
    const result = await fetchRecommendationContext(db, OWNER, claim, recommendationScope(300, c.now))
    expect(result.nutrition).toEqual({ target: null, meals: [], coverage: null }); expect(result.intent).toBeNull()
    for (const query of calls) expect(query.operations).toContainEqual(['eq', 'user_id', OWNER])
    const mealQuery = calls.find(q => q.table === 'meals')!
    expect(mealQuery.operations).toContainEqual(['gte', 'meal_timestamp', '2026-09-17T05:00:00.000Z'])
    expect(mealQuery.operations).toContainEqual(['lte', 'meal_timestamp', c.now])
  })
  it.each(['training_programs', 'coach_memories', 'daily_targets', 'meals', 'adaptation_proposals'])('fails closed on %s outage', async table => {
    const input: Record<string, any> = sources(); input[table] = [{ data: null, error: { code: 'timeout' } }]
    const c = context()
    await expect(fetchRecommendationContext(database(input).db, OWNER, { ...c.claim, intentMemoryId: null, intentVersion: null }, recommendationScope(300, c.now))).rejects.toThrow('unavailable or incomplete')
  })
  it('rejects truncated meals and missing macro quantities', async () => {
    const c = context(), claim = { ...c.claim, intentMemoryId: null, intentVersion: null }
    for (const meals of [Array.from({ length: 201 }, () => ({})), [{ id: 'meal', total_protein: null, total_carbs: 20, total_fat: 10, total_calories: 290 }]]) {
      await expect(fetchRecommendationContext(database({ ...sources(), meals: [ok(meals)] }).db, OWNER, claim, recommendationScope(300, c.now))).rejects.toThrow()
    }
  })
  it('requires the current confirmed intent version and treats an unknown baseline as a defined gap', async () => {
    const c = context(), memory = { id: c.intent!.memoryId, version: 1, status: 'confirmed', content: c.intent!.content }
    const result = await fetchRecommendationContext(database({ ...sources(), coach_memories: [ok([memory])] }).db, OWNER, c.claim, recommendationScope(300, c.now))
    expect(result.missingBaselines).toEqual(c.intent!.content.outcomes)
    await expect(fetchRecommendationContext(database({ ...sources(), coach_memories: [ok([{ ...memory, version: 2 }])] }).db, OWNER, c.claim, recommendationScope(300, c.now))).rejects.toThrow('intent changed')
  })
  it('does not turn a referenced baseline read failure into a new missing-baseline action', async () => {
    const c = context(); c.intent!.content.outcomes[0].baseline = { status: 'referenced', observationId: '11111111-1111-4111-8111-111111111111' }
    const memory = { id: c.intent!.memoryId, version: 1, status: 'confirmed', content: c.intent!.content }
    const input = { ...sources(), coach_memories: [ok([memory])], performance_observation_groups: [{ data: null, error: { code: 'timeout' } }] }
    await expect(fetchRecommendationContext(database(input).db, OWNER, c.claim, recommendationScope(300, c.now))).rejects.toThrow('Baseline observations are unavailable')
  })
  it('uses the accepted plan only, distinguishes omitted feedback from concerning pain, and preserves old safety reports', async () => {
    const c = context(), claim = { ...c.claim, activePlanId: 'plan-1', intentMemoryId: null, intentVersion: null }
    const checkin = { id: 'checkin-1', occurred_at: c.now, responses: { schemaVersion: 1, outcome: 'as_planned', sessionRpe: 7, energy: 'okay', pain: 'concerning', note: null } }
    const input = (checkins: unknown[]) => ({ ...sources(), training_programs: [ok([{ id: 'program-1', active_plan_version_id: 'plan-1', status: 'active' }])], training_plan_versions: [ok([{ id: 'plan-1', status: 'accepted', policy_version: 'existing' }])], prescribed_sessions: [ok([])], coach_weekly_reviews: [ok([])], coach_checkins: [ok(checkins)] })
    const empty = await fetchRecommendationContext(database(input([])).db, OWNER, claim, recommendationScope(300, c.now))
    expect(empty.safetySignal).toBeNull()
    const { db, calls } = database(input([checkin])), result = await fetchRecommendationContext(db, OWNER, claim, recommendationScope(300, c.now))
    expect(result.safetySignal).toEqual({ id: checkin.id, occurredAt: checkin.occurred_at })
    for (const query of calls) expect(query.operations).toContainEqual(['eq', 'user_id', OWNER])
    expect(calls.find(q => q.table === 'coach_checkins')!.operations).toContainEqual(['eq', 'plan_version_id', 'plan-1'])
  })
})

