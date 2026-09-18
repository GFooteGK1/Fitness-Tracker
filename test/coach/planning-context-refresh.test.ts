import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { refreshConfirmedPlanningContext } from '@/app/lib/coach/planning-intent-server'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'

afterEach(() => vi.unstubAllEnvs())
function source(error: unknown = null) {
  const from = vi.fn(() => {
    const query: Record<string, unknown> = { then: (resolve: (result: unknown) => unknown) => Promise.resolve(resolve({ data: [], error })) }
    for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'limit']) query[method] = () => query
    return query
  })
  return { client: { from } as unknown as SupabaseClient, from }
}
describe('new-direction history refresh capability', () => {
  it('retains the exact existing profile when capabilities are disabled', async () => {
    vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'false'); vi.stubEnv('COACH_TRAINING_INTENT_ENABLED', 'false'); vi.stubEnv('COACH_EXERCISE_PREFERENCES_ENABLED', 'false')
    const { client, from } = source()
    const profile = GOLDEN_PROGRAMMING_PROFILES[0].profile
    expect(await refreshConfirmedPlanningContext(client, 'athlete', profile)).toBe(profile)
    expect(from).not.toHaveBeenCalled()
  })
  it('refreshes history independently of training intent and discloses a provisional cold start', async () => {
    vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'true'); vi.stubEnv('COACH_TRAINING_INTENT_ENABLED', 'false'); vi.stubEnv('COACH_EXERCISE_PREFERENCES_ENABLED', 'false')
    const { client, from } = source()
    const profile = await refreshConfirmedPlanningContext(client, 'athlete', GOLDEN_PROGRAMMING_PROFILES[0].profile)
    expect(profile.planningContext?.status).toBe('cold_start')
    expect(profile.prescriptionBasis?.numericalBasis).toBe('provisional_existing_policy')
    expect(from.mock.calls.flat()).not.toContain('coach_memories')
  })
  it('fails closed when source retrieval fails instead of generating novice assumptions', async () => {
    vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'true'); vi.stubEnv('COACH_TRAINING_INTENT_ENABLED', 'false'); vi.stubEnv('COACH_EXERCISE_PREFERENCES_ENABLED', 'false')
    await expect(refreshConfirmedPlanningContext(source({ code: '08006', message: 'disconnected' }).client, 'athlete', GOLDEN_PROGRAMMING_PROFILES[0].profile)).rejects.toThrow('unavailable or incomplete')
  })
})
