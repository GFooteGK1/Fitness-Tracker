import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureSetupMemoryBindings, parseSetupMemoryBindings, setupMemoryBindingsCurrent } from '@/app/lib/coach/setup-memory-bindings'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'
import { buildProgrammingProfile, validateCompleteCoachPlanningInput } from '@/app/lib/coach/complete-intake'
import { applyConfirmedIntentToProfile } from '@/app/lib/coach/planning-intent-server'
import { intent, runningOutcome } from '../fixtures/personalized-coaching/intent'
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { POST as saveIntake } from '@/app/api/coach/intake/route'

const profile = GOLDEN_PROGRAMMING_PROFILES[0].profile
const schedule = { experience: profile.trainingExperience, trainingDays: profile.sessionAvailability.map(slot => slot.day), sessionMinutes: profile.sessionAvailability[0].minutes }
const row = (changes = {}) => ({ id: 'memory-1', user_id: 'user-1', memory_key: 'training_schedule', kind: 'schedule', version: 1,
  content: schedule, status: 'confirmed', effective_from: null, effective_until: null, review_after: null, ...changes })
function client(rows: Record<string, unknown> = {}, error: unknown = null) {
  const queries: Record<string, unknown>[] = []
  return { queries, from: vi.fn(() => {
    const filters: Record<string, unknown> = {}; queries.push(filters)
    const chain = { select: () => chain, eq: (key: string, value: unknown) => { filters[key] = value; return chain },
      order: () => chain, limit: async () => ({ data: rows[String(filters.memory_key)] ? [rows[String(filters.memory_key)]] : [], error }) }
    return chain
  }) }
}
afterEach(() => vi.unstubAllEnvs())

describe('explicit planning setup dependencies', () => {
  it('binds every actual complete-intake memory write with allocations, equipment and nonempty constraints', async () => {
    const planningInput = { format: 'complete_programming_intake_v0_3', primaryDomain: 'aerobic', goal: 'Complete a quicker run',
      secondaryGoals: [{ domain: 'strength', allocation: 'maintenance', athleteIntent: 'Maintain useful strength' }],
      experience: 'consistent', trainingDays: ['monday', 'thursday'], sessionMinutes: 60, startDate: '2026-09-07',
      equipment: '  Rack, barbell and track  ', resolvedEquipmentIds: ['bodyweight', 'barbell', 'rack', 'track'],
      constraints: '  No overhead training  ', constraintKinds: ['no_overhead'], setupConfirmed: true }
    const rows: Record<string, unknown> = {}
    const db = { ...client(rows), auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      rpc: vi.fn(async (_name: string, args: Record<string, any>) => {
        rows[args.p_memory_key] = row({ id: args.p_memory_key, memory_key: args.p_memory_key, kind: args.p_kind, content: args.p_content })
        return { error: null }
      }) }
    vi.mocked(createServerClient).mockResolvedValue(db as never)
    expect((await saveIntake(new Request('http://localhost/api/coach/intake', { method: 'POST', body: JSON.stringify({ planningInput, idempotencyKey: 'setup-binding-fixture' }) }))).status).toBe(200)
    const validated = validateCompleteCoachPlanningInput(planningInput)
    if (!validated.ok) throw Error(validated.errors.join('; '))
    const built = buildProgrammingProfile(validated.value, [])
    const first = await captureSetupMemoryBindings(db as never, 'user-1', built)
    expect(Object.values(first.memories).every(memory => memory !== null && memory.currentAtRead)).toBe(true)
    expect(db.rpc).toHaveBeenCalledTimes(4)
    // Canonical intent owns outcome wording; convenience goal memory retains allocations.
    const strength = { ...runningOutcome('goal:strength'), domain: 'strength' as const,
      goal: { ...runningOutcome('goal:strength').goal, statement: 'Retain confirmed strength', priority: 'secondary' as const } }
    const confirmed = applyConfirmedIntentToProfile(built, { schemaVersion: 1, memoryId: 'canonical-intent', memoryVersion: 1, content: intent(runningOutcome(), strength) })
    expect(await captureSetupMemoryBindings(db as never, 'user-1', confirmed)).toEqual(first)
  })
  it('records owned source identity/content and verified empty reads after matching the supplied profile', async () => {
    const db = client({ training_schedule: row() })
    const bindings = await captureSetupMemoryBindings(db as never, 'user-1', profile)
    expect(bindings.memories.training_schedule).toMatchObject({ memoryId: 'memory-1', memoryVersion: 1, content: schedule })
    expect(bindings.memories.available_equipment).toBeNull()
    expect(db.queries.every(query => query.user_id === 'user-1')).toBe(true)
    expect(parseSetupMemoryBindings(bindings)).toEqual(bindings)
    expect(parseSetupMemoryBindings(undefined)).toBeNull()
    expect(parseSetupMemoryBindings({ schemaVersion: 1, memories: {} })).toBeNull()
  })
  it.each([
    { status: 'withdrawn' }, { effective_until: '2020-01-01T00:00:00Z' }, { review_after: '2020-01-01T00:00:00Z' },
    { effective_from: '2099-01-01T00:00:00Z' }, { content: { ...schedule, sessionMinutes: 15 } },
  ])('blocks new directions using stale or conflicting saved setup %j', async changes => {
    await expect(captureSetupMemoryBindings(client({ training_schedule: row(changes) }) as never, 'user-1', profile)).rejects.toThrow('needs confirmation')
  })
  it('captures review decision dependencies without renewing or silently replacing their authority', async () => {
    const future = row({ effective_from: '2099-01-01T00:00:00Z' })
    const bindings = await captureSetupMemoryBindings(client({ training_schedule: future }) as never, 'user-1', profile, { review: true })
    expect(bindings.memories.training_schedule?.memoryId).toBe(future.id)
    // The proposal transaction decides current authority; a future row is never represented as absent.
    expect(bindings.memories.training_schedule).not.toBeNull()
  })
  it('never treats a failed or foreign-owner read as an empty dependency', async () => {
    await expect(captureSetupMemoryBindings(client({}, { code: 'unavailable' }) as never, 'user-1', profile)).rejects.toThrow('Unable to verify')
    await expect(captureSetupMemoryBindings(client({ training_schedule: row({ user_id: 'other' }) }) as never, 'user-1', profile)).rejects.toThrow('Unable to verify')
  })
  it('binds canonical preferences only when used by the profile or enabled for planning', async () => {
    const off = client()
    await captureSetupMemoryBindings(off as never, 'user-1', profile)
    expect(off.queries.some(query => query.memory_key === 'exercise_preferences')).toBe(false)
    vi.stubEnv('COACH_EXERCISE_PREFERENCES_ENABLED', 'true')
    const bindings = await captureSetupMemoryBindings(client() as never, 'user-1', profile)
    expect(bindings.memories.exercise_preferences).toBeNull()
  })
  it('readback withdraws eligibility after expiry and never treats legacy omission as verified empty', async () => {
    const live = row(), db = client({ training_schedule: live })
    const bindings = await captureSetupMemoryBindings(db as never, 'user-1', profile)
    expect(await setupMemoryBindingsCurrent(db as never, 'user-1', bindings)).toBe(true)
    live.review_after = '2020-01-01T00:00:00Z' as never
    expect(await setupMemoryBindingsCurrent(db as never, 'user-1', bindings)).toBe(false)
    expect(await setupMemoryBindingsCurrent(db as never, 'user-1', undefined)).toBe(false)
  })
})
