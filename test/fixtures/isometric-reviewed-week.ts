/** Synthetic mechanical authoring case only. These doses are test inputs,
 * not Greg's prescription, clinical advice or an approved registry entry. */
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { proposeIsometricHold } from '@/app/lib/coach/isometric-guidance'
import type { ReviewedWeekActivity } from '@/app/lib/coach/offline-reviewed-week'
import { reviewedDevelopmentalWeek } from './reviewed-developmental-week'
import { buildReviewedRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'

export function isometricReviewedWeek() {
  const fixture = reviewedDevelopmentalWeek()
  const recipe = fixture.registry[0].recipe
  fixture.context.profile.exercisePreferences = { schemaVersion: 1, state: 'specified', entries: [
    { athleteWording: 'Isometrics in warm-ups or accessories', target: { kind: 'interest', id: 'isometric_training' } }
  ] }
  recipe.profileHash = doseContentHash(fixture.context.profile)
  recipe.id = 'synthetic-isometric-authoring'
  recipe.review = { id: 'synthetic-isometric-review', contentHash: doseContentHash('Mechanical test authority only') }
  fixture.context.recipeId = recipe.id
  fixture.context.currentReviews = [structuredClone(recipe.review)]
  recipe.limitations.push('Synthetic isometric test doses only; not athlete-approved programming or a validated dose policy.')
  const lower = recipe.sessions.find(session => session.id === 'upright-trap-bar')!
  const preparation = lower.steps.find(step => step.kind === 'preparation_window')!
  if (preparation.kind !== 'preparation_window') throw new Error('Expected preparation window')
  const activity: ReviewedWeekActivity = { kind: 'activity', id: 'soleus-preparation', movementId: 'bent_knee_calf_raise',
    role: 'preparation', requiredEquipment: ['bodyweight'], sets: 1,
    work: { kind: 'repetitions', repetitions: { min: 3, max: 3 }, sides: 2, secondsPerRep: 3 },
    load: { kind: 'bodyweight' }, effort: { kind: 'quality', cue: 'Low-fatigue hold; stop for pain or loss of position.' },
    restBetweenSeconds: 0, restAfterSeconds: 20, protocolId: null, instructions: ['Old repetition cue must not survive conversion.'] }
  const warmup = proposeIsometricHold(activity)
  warmup.work = { kind: 'duration', seconds: 10, sides: 2, sideSwitchSeconds: 5 }
  // General preparation first; the hold precedes drills and progressive work.
  preparation.activities.splice(1, 0, warmup)
  // Changed preparation is a new synthetic monitoring context, never a
  // comparable observation in the original dev-high-handle-pull-v1 series.
  const monitoring = lower.steps.find(step => step.kind === 'activity' && step.role === 'monitoring')
  const protocol = recipe.protocols.find(protocol => protocol.sessionId === lower.id)!
  if (!monitoring || monitoring.kind !== 'activity') throw new Error('Expected monitoring activity')
  protocol.id = 'synthetic-isometric-pull-protocol'
  protocol.instructions = ['Synthetic monitoring context includes the added soleus hold. No equivalence to the original monitoring series; no actual sensor observations.']
  monitoring.protocolId = protocol.id
  monitoring.instructions = [...protocol.instructions]
  const accessory = proposeIsometricHold({ ...structuredClone(activity), id: 'split-squat-accessory',
    movementId: 'bodyweight_split_squat', role: 'working', sets: 2,
    effort: { kind: 'rpe', min: 6, max: 7 }, restBetweenSeconds: 30, restAfterSeconds: 15 })
  accessory.work = { kind: 'duration', seconds: 20, sides: 2, sideSwitchSeconds: 5 }
  const cooldown = lower.steps.findIndex(step => step.kind === 'activity' && step.role === 'cooldown')
  lower.steps.splice(cooldown, 0, accessory)
  fixture.registry[0].contentHash = doseContentHash(recipe)
  return { ...fixture, warmup, accessory }
}

export function isometricReviewedPlan() {
  const fixture = isometricReviewedWeek()
  const result = buildReviewedRollingWeeklyPlan({ context: fixture.context,
    windowStart: fixture.context.profile.startDate, sequenceNumber: 1,
    direction: buildRollingTrainingDirection(fixture.context.profile, {
      hypothesis: 'Synthetic authoring check of held positions without changing the priority work.'
    }) }, fixture.registry)
  if (result.kind !== 'reviewed_candidate') throw new Error(result.reasons.join('; '))
  return { ...fixture, plan: result.plan }
}
