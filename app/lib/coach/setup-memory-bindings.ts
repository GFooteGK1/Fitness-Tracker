import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProgrammingProfile } from './programming-schema'
import { exercisePreferencesEnabled } from './exercise-preferences-server'
import { CoachContextRevisionConflictError, CoachContextRevisionUnavailableError } from './proposal-context-revision'
import { stableStringify } from './rolling-weekly-contracts'

export const SETUP_MEMORY_KEYS = ['primary_goal', 'training_schedule', 'available_equipment', 'training_constraints'] as const
type SetupKey = typeof SETUP_MEMORY_KEYS[number] | 'exercise_preferences'
export interface SetupMemoryBindings {
  schemaVersion: 1
  memories: Record<string, { memoryId: string; memoryVersion: number; currentAtRead: boolean; lifecycle: { status: string; effectiveFrom: string | null; effectiveUntil: string | null; reviewAfter: string | null }; content: Record<string, unknown> } | null>
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const kinds: Record<SetupKey, string> = { primary_goal: 'goal', training_schedule: 'schedule', available_equipment: 'equipment', training_constraints: 'constraint', exercise_preferences: 'preference' }
const sorted = (value: unknown): unknown => Array.isArray(value) ? [...value].sort() : value

/** Explicit dependency read, after the revision read. Null means verified absent, never unknown legacy provenance.
 * Reviews capture their current decision inputs; new directions also require saved setup to agree with the form/profile.
 * Canonical training_intent keeps its separate content binding and SQL guard.
 */
export async function captureSetupMemoryBindings(db: SupabaseClient, userId: string, profile: ProgrammingProfile,
  options: { review?: boolean } = {}): Promise<SetupMemoryBindings> {
  const keys: SetupKey[] = [...SETUP_MEMORY_KEYS]
  if (exercisePreferencesEnabled() || profile.exercisePreferences !== undefined) keys.push('exercise_preferences')
  const entries = await Promise.all(keys.map(async key => {
    const result = await db.from('coach_memories').select('id,user_id,memory_key,kind,version,content,status,effective_from,effective_until,review_after')
      .eq('user_id', userId).eq('memory_key', key).order('version', { ascending: false }).limit(1)
    if (result.error) throw new CoachContextRevisionUnavailableError()
    const row = result.data?.[0]
    if (!row) return [key, null] as const
    if (row.user_id !== userId || row.memory_key !== key || row.kind !== kinds[key] || typeof row.id !== 'string'
      || !Number.isSafeInteger(row.version) || row.version < 1 || !record(row.content)) throw new CoachContextRevisionUnavailableError()
    const now = Date.now()
    const timeValid = (value: unknown, from = false) => value === null || value === undefined
      || (typeof value === 'string' && Number.isFinite(Date.parse(value)) && (from ? Date.parse(value) <= now : Date.parse(value) > now))
    const currentAtRead = row.status === 'confirmed' && timeValid(row.effective_from, true) && timeValid(row.effective_until) && timeValid(row.review_after)
    if (!options.review) {
      if (!currentAtRead || !setupMatchesProfile(key, row.content, profile)) {
        throw new CoachContextRevisionConflictError('Your saved training setup needs confirmation. Save the current setup and create a new proposal.')
      }
    }
    return [key, { memoryId: row.id, memoryVersion: row.version, currentAtRead, lifecycle: { status: row.status, effectiveFrom: row.effective_from ?? null, effectiveUntil: row.effective_until ?? null, reviewAfter: row.review_after ?? null }, content: structuredClone(row.content) }] as const
  }))
  return { schemaVersion: 1, memories: Object.fromEntries(entries) }
}

export function parseSetupMemoryBindings(value: unknown): SetupMemoryBindings | null {
  if (!record(value) || value.schemaVersion !== 1 || !record(value.memories)
    || SETUP_MEMORY_KEYS.some(key => !Object.hasOwn(value.memories as object, key))) return null
  for (const [key, snapshot] of Object.entries(value.memories)) {
    if (!Object.hasOwn(kinds, key)) return null
    if (snapshot !== null && (!record(snapshot) || typeof snapshot.memoryId !== 'string'
      || typeof snapshot.currentAtRead !== 'boolean' || !record(snapshot.lifecycle) || !Number.isSafeInteger(snapshot.memoryVersion) || Number(snapshot.memoryVersion) < 1 || !record(snapshot.content))) return null
  }
  return value as unknown as SetupMemoryBindings
}

/** Readback only: SQL remains the acceptance authority. A failed read is unavailable, not current. */
export async function setupMemoryBindingsCurrent(db: SupabaseClient, userId: string, value: unknown,
  cache = new Map<string, Promise<Record<string, any> | null>>()): Promise<boolean> {
  const bindings = parseSetupMemoryBindings(value)
  if (!bindings) return false
  const results = await Promise.all(Object.entries(bindings.memories).map(async ([key, snapshot]) => {
    if (!cache.has(key)) cache.set(key, (async () => {
      const result = await db.from('coach_memories').select('id,user_id,memory_key,kind,version,content,status,effective_from,effective_until,review_after')
        .eq('user_id', userId).eq('memory_key', key).order('version', { ascending: false }).limit(1)
      if (result.error) throw new CoachContextRevisionUnavailableError()
      return result.data?.[0] ?? null
    })())
    const row = await cache.get(key)!
    if (!snapshot) return row === null
    if (!row || !snapshot.currentAtRead) return false
    const now = Date.now()
    const timeValid = (date: unknown, from = false) => date === null || date === undefined
      || (typeof date === 'string' && Number.isFinite(Date.parse(date)) && (from ? Date.parse(date) <= now : Date.parse(date) > now))
    return row.user_id === userId && row.memory_key === key && row.kind === kinds[key as SetupKey]
      && row.id === snapshot.memoryId && row.version === snapshot.memoryVersion && row.status === 'confirmed'
      && stableStringify(row.content) === stableStringify(snapshot.content)
      && timeValid(row.effective_from, true) && timeValid(row.effective_until) && timeValid(row.review_after)
  }))
  return results.every(Boolean)
}

function setupMatchesProfile(key: SetupKey, content: Record<string, unknown>, profile: ProgrammingProfile): boolean {
  let actual: unknown, expected: unknown
  if (key === 'training_schedule') {
    actual = [content.experience, sorted(content.trainingDays), content.sessionMinutes]
    expected = [profile.trainingExperience, sorted(profile.sessionAvailability.map(slot => slot.day)), profile.sessionAvailability[0]?.minutes]
    if (new Set(profile.sessionAvailability.map(slot => slot.minutes)).size !== 1) return false
  } else if (key === 'available_equipment') {
    actual = [typeof content.equipment === 'string' ? content.equipment.trim() : content.equipment, sorted(content.resolvedEquipmentIds)]
    expected = [profile.equipment.unresolvedAthleteDescription ?? '', sorted(profile.equipment.resolvedIds)]
  } else if (key === 'training_constraints') {
    actual = [typeof content.constraints === 'string' ? content.constraints.trim() : content.constraints, sorted(content.constraintKinds)]
    expected = [profile.unresolvedConstraintNote ?? '', sorted(profile.explicitConstraints.map(item => item.kind))]
  } else if (key === 'exercise_preferences') {
    actual = content; expected = profile.exercisePreferences
  } else {
    // Canonical intent owns wording/outcomes. This memory still owns setup allocations.
    const allocations = (goals: unknown) => Array.isArray(goals) ? goals.map(goal => record(goal)
      ? [goal.domain, goal.allocation, ...(profile.trainingIntent ? [] : [goal.athleteIntent])] : goal).sort() : goals
    actual = [content.primaryDomain, allocations(content.secondaryGoals), ...(profile.trainingIntent ? [] : [content.goal])]
    expected = [profile.primaryGoal.domain, allocations(profile.secondaryGoals), ...(profile.trainingIntent ? [] : [profile.primaryGoal.athleteIntent])]
  }
  return stableStringify(actual) === stableStringify(expected)
}
