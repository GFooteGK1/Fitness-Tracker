import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchCoachEvidenceContext, type CoachEvidenceContextPacket } from './evidence-context'
import { exercisePreferencesEnabled } from './exercise-preferences-server'
import { validateExercisePreferences, resolveExercisePreferences, preferenceSupportNotes } from './exercise-preferences'
import { MOVEMENT_CATALOG } from './movement-catalog'
import type { ProgrammingProfile } from './programming-schema'

export function applyExercisePreferenceContext(profile: ProgrammingProfile, evidence: CoachEvidenceContextPacket): ProgrammingProfile {
  if (!exercisePreferencesEnabled()) return profile
  if (!evidence.storageAvailable || !evidence.selectionComplete) throw new Error('Exercise preference context is unavailable or incomplete')
  const memory = evidence.memories.find(item => item.memoryKey === 'exercise_preferences')
  const seen = evidence.exercisePreferenceSnapshotSeen || Boolean(memory)
  const snapshot = memory && validateExercisePreferences(memory.content) ? memory.content : undefined
  if (memory && !snapshot) throw new Error('Exercise preferences need correction before planning')
  const preferences = profile.preferences.filter(item => !seen || item.preference === 'avoid').map(item => ({...item}))
  for (const legacy of evidence.memories.filter(item => item.kind === 'preference' && item.memoryKey !== 'exercise_preferences')) {
    const { movementId, preference } = legacy.content
    if (seen && preference === 'prefer') continue
    if (typeof movementId !== 'string' || !MOVEMENT_CATALOG.some(item => item.id === movementId)
      || (preference !== 'prefer' && preference !== 'avoid')) continue
    const prior = preferences.find(item => item.movementId === movementId)
    if (prior) { if (preference === 'avoid') prior.preference = 'avoid' }
    else preferences.push({movementId,preference,source:'athlete_confirmed'})
  }
  const notes = snapshot ? preferenceSupportNotes(snapshot) : []
  if (snapshot) for (const favorite of resolveExercisePreferences(snapshot)) {
    const prior = preferences.find(item => item.movementId === favorite.movementId)
    if (!prior) preferences.push(favorite)
    else if (prior.preference === 'avoid') notes.push(`${favorite.movementId}: your avoidance takes precedence over this favorite.`)
  }
  return {...profile, preferences, ...(seen ? {exercisePreferences:snapshot,preferenceNotes:notes} : {})}
}

export async function refreshExercisePreferencesForDraft(supabase: SupabaseClient, userId: string, profile: ProgrammingProfile): Promise<ProgrammingProfile> {
  if (!exercisePreferencesEnabled()) return profile
  const evidence = await fetchCoachEvidenceContext(supabase,userId,{purpose:'new_planning',asOf:new Date().toISOString()})
  return applyExercisePreferenceContext(profile,evidence)
}
