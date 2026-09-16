import { MOVEMENT_CATALOG, getMovementsByAssessmentAlias } from './movement-catalog'
import type { ProgrammingProfile, CompleteProgrammingSessionPrescription, ProgrammingMovementPreference } from './programming-schema'

export const EXERCISE_PREFERENCES_KEY = 'exercise_preferences'
export const EXERCISE_INTEREST_MAPPING_VERSION = '1.0.0'
export const EXERCISE_INTERESTS: Array<{ id: string; label: string; movementIds: string[] }> = [
  { id: 'olympic_lifting', label: 'Olympic lifting', movementIds: [] },
  { id: 'gymnastics', label: 'Gymnastics', movementIds: [] },
  { id: 'handstand_movements', label: 'Handstand movements', movementIds: [] },
  { id: 'squat_variations', label: 'Squat variations', movementIds: ['barbell_back_squat', 'dumbbell_goblet_squat', 'kettlebell_goblet_squat'] },
  { id: 'deadlift_variations', label: 'Deadlift variations', movementIds: ['barbell_deadlift', 'dumbbell_romanian_deadlift', 'barbell_romanian_deadlift', 'kettlebell_deadlift'] }
]

export interface ExercisePreferences {
  schemaVersion: 1
  state: 'none' | 'specified'
  entries: Array<{
    athleteWording: string
    target: { kind: 'movement' | 'interest' | 'unresolved'; id?: string }
  }>
}

export function validateExercisePreferences(value: unknown): value is ExercisePreferences {
  if (!record(value) || !keys(value, ['schemaVersion', 'state', 'entries'])
    || value.schemaVersion !== 1 || !['none', 'specified'].includes(String(value.state))
    || !Array.isArray(value.entries) || value.entries.length > 12
    || (value.state === 'none' ? value.entries.length !== 0 : value.entries.length === 0)) return false
  const seen = new Set<string>()
  return value.entries.every(entry => {
    if (!record(entry) || !keys(entry, ['athleteWording', 'target'])
      || typeof entry.athleteWording !== 'string' || !entry.athleteWording.trim()
      || [...entry.athleteWording].length > 160 || !record(entry.target)
      || !keys(entry.target, ['kind', 'id'])) return false
    const target = entry.target
    const valid = target.kind === 'unresolved' ? target.id === undefined
      : target.kind === 'movement' ? MOVEMENT_CATALOG.some(item => item.id === target.id)
        : target.kind === 'interest' && EXERCISE_INTERESTS.some(item => item.id === target.id)
    const key = `${target.kind}:${target.id ?? entry.athleteWording.trim().toLowerCase()}`
    if (!valid || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function resolveExercisePreferences(value: ExercisePreferences): ProgrammingMovementPreference[] {
  const ids = value.entries.flatMap(entry => entry.target.kind === 'movement' ? [entry.target.id!]
    : entry.target.kind === 'interest' ? EXERCISE_INTERESTS.find(item => item.id === entry.target.id)!.movementIds : [])
  return [...new Set(ids)].map(movementId => ({ movementId, preference: 'prefer', source: 'athlete_confirmed' }))
}

export function preferenceSummary(value: ExercisePreferences): string {
  return value.state === 'none' ? 'No exercise preference' : value.entries.map(entry => entry.athleteWording).join(', ')
}

export function preferenceSupportNotes(value: ExercisePreferences): string[] {
  return value.entries.flatMap(entry => {
    if (entry.target.kind === 'unresolved') return [`${entry.athleteWording}: saved as an interest; a supported movement has not been identified.`]
    if (entry.target.kind === 'interest' && !EXERCISE_INTERESTS.find(item => item.id === entry.target.id)!.movementIds.length) {
      return [`${entry.athleteWording}: saved as an interest; specialist prescriptions are not supported yet.`]
    }
    if (entry.target.kind === 'movement' && MOVEMENT_CATALOG.find(item => item.id === entry.target.id)?.programmingStatus === 'evidence_only') {
      return [`${entry.athleteWording}: recorded for evidence, but unavailable for standard programming.`]
    }
    return []
  })
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function keys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

/** Explain actual omissions without claiming a family member represents an unsupported skill. */
export function explainPreferenceUse(profile: ProgrammingProfile, sessions: CompleteProgrammingSessionPrescription[]): string[] {
  if (!profile.exercisePreferences) return []
  const selected = new Set(sessions.flatMap(session => session.blocks.flatMap(block => block.exercises.map(exercise => exercise.movementId))))
  const notes = preferenceSupportNotes(profile.exercisePreferences)
  for (const preference of resolveExercisePreferences(profile.exercisePreferences)) {
    if (selected.has(preference.movementId)) continue
    const movement = MOVEMENT_CATALOG.find(item => item.id === preference.movementId)!
    if (movement.programmingStatus === 'evidence_only') continue
    const avoided = profile.preferences.some(item => item.movementId === movement.id && item.preference === 'avoid')
    const missingEquipment = movement.equipment.filter(id => id !== 'bodyweight' && !profile.equipment.resolvedIds.includes(id))
    const restricted = (movement.overhead && profile.explicitConstraints.some(item => item.kind === 'no_overhead'))
      || (movement.running && profile.explicitConstraints.some(item => item.kind === 'no_running'))
    const skillRanks = { low: 0, moderate: 1, high: 2 }
    const experienceRanks = { new_or_returning: 0, consistent: 1, experienced: 2 }
    const skillUnsupported = skillRanks[movement.skillLevel] > experienceRanks[profile.trainingExperience]
      && !profile.assessments.some(assessment => getMovementsByAssessmentAlias(assessment.movement).some(item => item.id === movement.id))
    const reason = avoided ? 'your saved avoidance takes precedence'
      : missingEquipment.length ? `required equipment is unavailable (${missingEquipment.join(', ')})`
        : skillUnsupported ? 'current experience and assessment evidence do not support this movement yet'
          : restricted ? 'a confirmed movement restriction takes precedence'
          : 'not selected for this week; selection also depends on capability, goal coverage, familiarity, and time'
    notes.push(`${movement.name}: ${reason}.`)
  }
  return [...new Set(notes)]
}
