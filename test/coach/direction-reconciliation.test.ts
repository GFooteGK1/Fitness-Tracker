import { afterEach, describe, expect, it, vi } from 'vitest'
import { DIRECTION_MEMORY_KEYS, decodeDirectionReconciliation, reconcileTrainingDirection, replacementSetupMatches, type DirectionMemoryKey, type DirectionMemoryRow } from '@/app/lib/coach/direction-reconciliation'
import { fetchDirectionReconciliation } from '@/app/lib/coach/direction-reconciliation-server'
import { buildRollingWeeklyPlan, type RollingWeeklyPlanDraft } from '@/app/lib/coach/rolling-weekly-plan'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'
import { intent, runningOutcome } from '../fixtures/personalized-coaching/intent'
import type { PlanningIntentSnapshot } from '@/app/lib/coach/planning-intent'

const owner = 'athlete-1', asOf = '2026-09-21T12:00:00.000Z', nextWindowStart = '2026-09-28'
function week() {
  const profile = structuredClone(GOLDEN_PROGRAMMING_PROFILES[0].profile)
  profile.startDate = '2026-09-21'
  const result = buildRollingWeeklyPlan({ source: 'initial', profile, windowStart: profile.startDate,
    direction: buildRollingTrainingDirection(profile, { hypothesis: 'Develop repeatable quality in the priority movement patterns', goalTargetDate: '2027-04-01' }) })
  return result as RollingWeeklyPlanDraft
}
function snapshot(): PlanningIntentSnapshot { return { schemaVersion: 1, memoryId: 'intent-1', memoryVersion: 1, content: intent() } }
function row(key: DirectionMemoryKey, content: unknown, changes: Partial<DirectionMemoryRow> = {}): DirectionMemoryRow {
  return { id: `memory:${key}`, user_id: owner, memory_key: key,
    kind: ({ primary_goal: 'goal', training_schedule: 'schedule', available_equipment: 'equipment', training_constraints: 'constraint', training_intent: 'goal' })[key],
    status: 'confirmed', version: 1, content, effective_from: null, effective_until: null, review_after: null, ...changes }
}
function intentRow(value = snapshot()) { return row('training_intent', value.content, { id: value.memoryId, version: value.memoryVersion }) }
function run(memories: Partial<Record<DirectionMemoryKey, DirectionMemoryRow | null>> = {}, acceptedWeek = week(), intentRequired = false) {
  return reconcileTrainingDirection({ userId: owner, acceptedWeek, nextWindowStart, memories, intentRequired, asOf })
}
function boundWeek() {
  const accepted = week()
  accepted.profileSnapshot.trainingIntent = snapshot()
  accepted.profileSnapshot.primaryGoal.domain = 'aerobic'
  accepted.profileSnapshot.primaryGoal.athleteIntent = snapshot().content.outcomes[0].goal.statement
  return accepted
}
function db(memories: Partial<Record<DirectionMemoryKey, DirectionMemoryRow | null>>, failKey?: string) {
  const calls: Array<[string, string, unknown]> = []
  const from = vi.fn((table: string) => {
    let key = ''
    const chain = { select: vi.fn(() => chain), eq: vi.fn((field: string, value: unknown) => { calls.push([table, field, value]); if (field === 'memory_key') key = String(value); return chain }),
      order: vi.fn(() => chain), limit: vi.fn(async () => ({ data: table === 'coach_memories' && memories[key as DirectionMemoryKey] ? [memories[key as DirectionMemoryKey]] : [], error: key === failKey ? { message: 'private failure detail' } : null })) }
    return chain
  })
  return { client: { from } as never, calls, from }
}
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

describe('current confirmed direction reconciliation', () => {
  it('keeps legacy accepted setup when memories are absent without confirming a new form', () => {
    const accepted = week(), before = structuredClone(accepted)
    const result = run({}, accepted)
    expect(result.status).toBe('unchanged')
    expect(result.replacementPlanningInput).toMatchObject({ setupConfirmed: false, startDate: nextWindowStart, trainingDays: ['monday', 'tuesday'], sessionMinutes: 30 })
    expect(accepted).toEqual(before)
  })
  it('hydrates current schedule, equipment and selected constraints without changing accepted JSON', () => {
    const accepted = week(), before = structuredClone(accepted)
    const result = run({ training_schedule: row('training_schedule', { experience: 'consistent', trainingDays: ['monday', 'wednesday', 'friday'], sessionMinutes: 60 }),
      available_equipment: row('available_equipment', { equipment: 'Gym access', resolvedEquipmentIds: ['bodyweight', 'barbell'] }),
      training_constraints: row('training_constraints', { constraints: '', constraintKinds: ['no_overhead'] }) }, accepted)
    expect(result.status).toBe('changed')
    expect(result.changedFields).toEqual(['training_schedule', 'available_equipment', 'training_constraints'])
    expect(result.replacementPlanningInput).toMatchObject({ setupConfirmed: false, sessionMinutes: 60, constraintKinds: ['no_overhead'] })
    expect(accepted).toEqual(before)
  })
  it('ignores setup identity, start date and ordering when its meaningful fields match', () => {
    const result = run({ training_schedule: row('training_schedule', { experience: 'new_or_returning', trainingDays: ['tuesday', 'monday'], sessionMinutes: 30, startDate: '2030-01-01' }, { version: 7 }) })
    expect(result.status).toBe('unchanged')
  })
  it.each(['withdrawn', 'proposed', 'superseded'])('does not use a latest %s setup as confirmed', status => {
    expect(run({ training_schedule: row('training_schedule', {}, { status }) }).status).toBe('confirmation_required')
  })
  it.each([{ effective_from: '2026-09-22T00:00:00Z' }, { effective_until: asOf }, { review_after: asOf }, { review_after: 'invalid' }])('blocks ineligible setup lifecycle %j', changes => {
    expect(run({ training_schedule: row('training_schedule', {}, changes) }).status).toBe('confirmation_required')
  })
  it.each([{ trainingDays: ['monday', 'wednesday'], experience: 'consistent' }, { trainingDays: ['monday', 'wednesday'], experience: 'consistent', sessionMinutes: 20 }])('never fills malformed saved setup through accepted defaults %j', content => {
    expect(run({ training_schedule: row('training_schedule', content) }).status).toBe('confirmation_required')
  })
  it('blocks malformed constraints and leaves changed free text unresolved', () => {
    expect(run({ training_constraints: row('training_constraints', { constraints: 123, constraintKinds: [] }) }).status).toBe('confirmation_required')
    const result = run({ training_constraints: row('training_constraints', { constraints: 'New knee pain during squats', constraintKinds: [] }) })
    expect(result.status).toBe('confirmation_required')
    expect(result.replacementPlanningInput?.constraints).toBe('New knee pain during squats')
    expect(result.reasons.join(' ')).toContain('only selected constraint kinds are enforced')
  })
  it('fails closed for wrong owner, kind or malformed intent', () => {
    expect(run({ available_equipment: row('available_equipment', {}, { user_id: 'other' }) }).status).toBe('unavailable')
    expect(run({ available_equipment: row('available_equipment', {}, { kind: 'goal' }) }).status).toBe('confirmation_required')
    expect(run({ training_intent: row('training_intent', {}) }, week(), true).status).toBe('confirmation_required')
  })
  it('requires intent for an already bound accepted plan even with the capability off', () => {
    expect(run({}, boundWeek(), false).status).toBe('confirmation_required')
    expect(run({}, week(), true).status).toBe('confirmation_required')
  })
  it('preserves a non-event target horizon with the same current intent', () => {
    const result = run({ training_intent: intentRow() }, boundWeek())
    expect(result.status).toBe('unchanged')
    expect(result.goalTargetDate).toBe('2027-04-01')
  })
  it('counts a new exact intent identity as changed because acceptance binds its version', () => {
    const current = snapshot(); current.memoryVersion = 2; current.memoryId = 'intent-2'
    expect(run({ training_intent: intentRow(current) }, boundWeek()).changedFields).toEqual(['training_intent'])
  })
  it('canonical intent wins over a conflicting convenience goal memory', () => {
    const result = run({ training_intent: intentRow(), primary_goal: row('primary_goal', { primaryDomain: 'strength', goal: 'Legacy saved goal', secondaryGoals: [] }) }, boundWeek())
    expect(result.status).toBe('unchanged')
    expect(result.replacementPlanningInput?.primaryDomain).toBe('aerobic')
  })
  it('maps explicit priority and keeps existing secondary allocations when still relevant', () => {
    const accepted = boundWeek(), current = snapshot()
    const strength = runningOutcome('goal:strength'); strength.domain = 'strength'; strength.goal.kind = 'process'; strength.measurement = null
    current.content.outcomes.push(strength); current.content.priorityOrder = ['goal:strength', 'goal:5k']
    accepted.profileSnapshot.secondaryGoals = [{ id: 'secondary:aerobic', domain: 'aerobic', role: 'secondary', allocation: 'maintenance', athleteIntent: 'Maintain running' }]
    const result = run({ training_intent: intentRow(current) }, accepted)
    expect(result.status).toBe('changed')
    expect(result.replacementPlanningInput).toMatchObject({ primaryDomain: 'strength', secondaryGoals: [{ domain: 'aerobic', allocation: 'maintenance' }] })
  })
  it('honors current matching allocation choices without giving convenience goal prose authority', () => {
    const accepted = boundWeek(), current = snapshot()
    const strength = runningOutcome('goal:strength'); strength.domain = 'strength'; strength.goal.kind = 'process'; strength.measurement = null
    current.content.outcomes.push(strength); current.content.priorityOrder = ['goal:5k', 'goal:strength']
    accepted.profileSnapshot.trainingIntent = current
    accepted.profileSnapshot.secondaryGoals = [{ id: 'secondary:strength', domain: 'strength', role: 'secondary', allocation: 'development', athleteIntent: strength.goal.statement }]
    const result = run({ training_intent: intentRow(current), primary_goal: row('primary_goal', {
      primaryDomain: 'aerobic', goal: 'Legacy goal text must not replace canonical outcomes',
      secondaryGoals: [{ domain: 'strength', allocation: 'maintenance', athleteIntent: 'Another old summary' }]
    }) }, accepted)
    expect(result.status).toBe('changed')
    expect(result.changedFields).toContain('goal_allocations')
    expect(result.replacementPlanningInput).toMatchObject({ primaryDomain: 'aerobic', goal: current.content.outcomes[0].goal.statement,
      secondaryGoals: [{ domain: 'strength', allocation: 'maintenance', athleteIntent: strength.goal.statement }] })
  })
  it('bounds only the secondary form summary while preserving full canonical statements', () => {
    const current = snapshot(), secondary = runningOutcome('goal:strength')
    secondary.domain = 'strength'; secondary.goal.kind = 'process'; secondary.measurement = null; secondary.goal.statement = 'Long outcome '.repeat(35)
    current.content.outcomes.push(secondary)
    const result = run({ training_intent: intentRow(current) }, boundWeek())
    expect(result.status).toBe('changed')
    expect(result.replacementPlanningInput?.secondaryGoals[0].athleteIntent).toHaveLength(300)
    expect(result.currentIntent?.content.outcomes[1].goal.statement).toBe(secondary.goal.statement)
  })
  it('blocks any unsupported active outcome instead of silently dropping it', () => {
    const current = snapshot(); current.content.outcomes[0].capability = { status: 'unsupported', reason: 'Requires sport adapter' }
    expect(run({ training_intent: intentRow(current) }, boundWeek()).status).toBe('unsupported')
  })
  it('rejects more than three distinct active domains', () => {
    const current = snapshot()
    current.content.outcomes = (['strength', 'aerobic', 'resilience', 'hypertrophy'] as const).map((domain, i) => {
      const outcome = runningOutcome(`goal:${i}`); outcome.domain = domain; outcome.goal.kind = 'process'; outcome.measurement = null; return outcome
    })
    expect(run({ training_intent: intentRow(current) }, boundWeek()).status).toBe('unsupported')
  })
  it('uses the latest event date and clears the deadline when that bound event is removed', () => {
    const accepted = boundWeek(), current = snapshot()
    current.content.event = { name: 'Race', date: '2027-05-01', goalIds: ['goal:5k'] }
    expect(run({ training_intent: intentRow(current) }, accepted).goalTargetDate).toBe('2027-05-01')
    accepted.profileSnapshot.trainingIntent = current
    const removed = run({ training_intent: intentRow() }, accepted)
    expect(removed.goalTargetDate).toBeNull(); expect(removed.changedFields).toContain('event')
  })
  it('rejects a stale replacement payload but accepts equivalent set ordering and a fresh date', () => {
    const result = run({ training_schedule: row('training_schedule', { experience: 'consistent', trainingDays: ['monday', 'wednesday'], sessionMinutes: 60 }) })
    const candidate = result.replacementPlanningInput!
    expect(replacementSetupMatches({ ...candidate, trainingDays: [...candidate.trainingDays].reverse() }, result)).toBe(true)
    expect(replacementSetupMatches({ ...candidate, sessionMinutes: 30 }, result)).toBe(false)
    expect(replacementSetupMatches({ ...candidate, resolvedEquipmentIds: ['barbell'] }, result)).toBe(false)
  })
  it('decodes only safe bounded metadata and never grants confirmation through persisted JSON', () => {
    const result = run({ training_intent: intentRow() }, boundWeek())
    const decoded = decodeDirectionReconciliation({ ...result, currentIntent: { private: 'omitted' }, replacementPlanningInput: { ...result.replacementPlanningInput, setupConfirmed: true } })
    expect(decoded?.currentIntent).toBeUndefined(); expect(decoded?.replacementPlanningInput?.setupConfirmed).toBe(false)
    expect(decodeDirectionReconciliation({ ...result, reasons: ['x'.repeat(501)] })).toBeNull()
    expect(decodeDirectionReconciliation({ ...result, goalTargetDate: '2026-02-30' })).toBeNull()
  })
})

describe('owned latest direction memory reads', () => {
  it('queries every canonical key with the trusted owner, latest version, and no confirmed-only filter or writes', async () => {
    vi.stubEnv('COACH_TRAINING_INTENT_ENABLED', 'false')
    const mock = db({ training_schedule: row('training_schedule', {}, { status: 'withdrawn', version: 2 }) })
    const result = await fetchDirectionReconciliation(mock.client, owner, week(), nextWindowStart)
    expect(result.status).toBe('confirmation_required')
    expect(mock.from).toHaveBeenCalledTimes(DIRECTION_MEMORY_KEYS.length)
    for (const key of DIRECTION_MEMORY_KEYS) expect(mock.calls).toContainEqual(['coach_memories', 'memory_key', key])
    expect(mock.calls.filter(call => call[1] === 'user_id')).toHaveLength(DIRECTION_MEMORY_KEYS.length)
    expect(mock.calls.some(call => call[1] === 'status')).toBe(false)
  })
  it('returns unavailable on a provider failure without disclosing private error details', async () => {
    const mock = db({}, 'available_equipment')
    const result = await fetchDirectionReconciliation(mock.client, owner, week(), nextWindowStart)
    expect(result.status).toBe('unavailable'); expect(JSON.stringify(result)).not.toContain('private failure detail')
  })
  it('validates referenced current intent baselines and blocks missing owned observations', async () => {
    const current = snapshot(); current.content.outcomes[0].baseline = { status: 'referenced', observationId: '11111111-1111-4111-8111-111111111111' }
    const mock = db({ training_intent: intentRow(current) })
    const result = await fetchDirectionReconciliation(mock.client, owner, boundWeek(), nextWindowStart)
    expect(result.status).toBe('confirmation_required')
    expect(mock.calls).toContainEqual(['performance_observation_groups', 'user_id', owner])
  })
})
