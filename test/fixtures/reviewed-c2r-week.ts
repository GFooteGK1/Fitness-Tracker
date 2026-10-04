/** Exact accepted synthetic reference. Never installed in the production registry. */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { doseContentHash, INITIAL_DOSE_POLICY_VERSION } from '@/app/lib/coach/initial-dose-policy'
import { buildReviewedRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { reviewedPreparationMovementId } from '@/app/lib/coach/reviewed-movement-eligibility'
import type { ReviewedWeekActivity as Activity, ReviewedWeekStep as Step, ReviewedWeekSession as Session,
  ReviewedWeekRecipe, OfflineReviewedWeekContext } from '@/app/lib/coach/offline-reviewed-week'
import type { TrustedDoseWeekReconciliation, ReviewedDoseWeekLink } from '@/app/lib/coach/reviewed-dose-week-reconciliation'
import { reviewedDoseWorkoutHash } from '@/app/lib/coach/reviewed-dose-week-reconciliation'
import type { HistoryWorkoutRow } from '@/app/lib/coach/planning-history'
import { reviewedBenchExample } from './reviewed-bench-session'

const equipment: Record<string, string[]> = {
  barbell_bench_press: ['flat_bench', 'rack_safeties', 'barbell_45lb', 'plates'],
  bike_erg: ['stationary_bike'], band_pull_apart: ['resistance_band'], band_row: ['resistance_band'],
  chest_supported_dumbbell_row: ['flat_bench', 'dumbbells'], dumbbell_goblet_squat: ['dumbbells'],
  dumbbell_romanian_deadlift: ['dumbbells'], lat_pulldown: ['cable_station'],
}
const rpe = (min: number, max = min): Activity['effort'] => ({ kind: 'rpe', min, max })
const selected: Activity['load'] = { kind: 'athlete_selected', instruction: 'Choose a familiar load meeting the stated effort; record actual selection.' }
const external = (value: number): Activity['load'] => ({ kind: 'external', value, unit: 'lb', convention: 'total' })
function rep(id: string, movementId: string, sets: number, reps: number, effort: Activity['effort'],
  rest: number, load: Activity['load'], role: Activity['role'] = 'working', sides: 1 | 2 = 1): Activity {
  return { kind: 'activity', id, movementId, sets, role, requiredEquipment: equipment[movementId] ?? ['bodyweight'],
    work: { kind: 'repetitions', repetitions: { min: reps, max: reps }, sides, secondsPerRep: 3 },
    effort, load, restBetweenSeconds: rest, restAfterSeconds: 0, protocolId: null,
    instructions: [sides === 2 ? 'Repetitions per side.' : 'Repetitions are total.', 'Record actual load, reps, RPE and symptoms.'] }
}
const allowance = (id: string, seconds: number, purpose: 'transition' | 'logging' | 'recovery'): Step => ({ kind: 'allowance', id, seconds, purpose })
const body: Activity['load'] = { kind: 'bodyweight' }
const easy: Activity['effort'] = { kind: 'quality', cue: 'Easy' }
/** Synthetic dated storage representation, before the August 10 next exposure. */
export function reviewedC2rWorkout(owner: string): HistoryWorkoutRow {
  return { id: 'workout-1', user_id: owner, workout_date: '2026-08-07', created_at: '2026-08-07T12:00:00Z',
    updated_at: '2026-08-07T12:00:00Z', capture_revision: 1,
    blocks: [{ role: 'priority_adaptation', movements: [{ name: 'Barbell bench press', sets: 3, reps: 6, load: 165, unit: 'lb', effort: [7, 7, 7] }] }] }
}
function rehearsal(id: string, movement: string, reps: number, load = selected, sides: 1 | 2 = 1) {
  return { ...rep(id, movement, 1, reps, rpe(3, 4), 0, load, 'preparation', sides), restAfterSeconds: 60 }
}
function plank(id: string, sets: number, seconds: number, effort: Activity['effort'], role: Activity['role']): Activity {
  return { ...rep(id, 'side_plank', sets, 1, effort, sets > 1 ? 60 : 0, body, role, 2),
    work: { kind: 'duration', seconds, sides: 2, sideSwitchSeconds: 15 }, restAfterSeconds: role === 'preparation' ? 60 : 0 }
}

export function reviewedC2rWeek() {
  const session = reviewedBenchExample(), sessionRecipe = session.recipes[0].recipe
  const profile = structuredClone(session.profile)
  profile.startDate = '2026-08-10'
  profile.primaryGoal = { id: 'strength', domain: 'strength', role: 'primary', allocation: 'lead', athleteIntent: 'Bench strength with general strength support' }
  profile.secondaryGoals = []; profile.athleteGoalSummary = 'Synthetic C2-R strength reference'
  profile.trainingExperience = 'experienced'; profile.preferences = []; profile.explicitConstraints = []
  profile.sessionAvailability = ['monday', 'wednesday', 'friday'].map(day => ({ day: day as 'monday' | 'wednesday' | 'friday', minutes: 60 }))
  profile.equipment = { resolvedIds: ['bodyweight', ...new Set(Object.values(equipment).flat())], unresolvedAthleteDescription: null }
  const sourcePath = 'docs/verification/programming-quality/c2r-week-context-review-1.md'
  const sourceHash = createHash('sha256').update(readFileSync(sourcePath)).digest('hex')
  if (sourceHash !== 'f724905f21c2f05b21c99ddc365b8ba12fabba643251cfbeb69cd5341c03a107') throw new Error('Accepted C2-R weekly reference changed; review before refreshing its binding')
  const review = { id: 'C2-R-week-context-1', contentHash: sourceHash }
  const preparation = (): Activity[] => sessionRecipe.preparation.map(step => {
    if (step.effort.kind !== 'rpe' && step.effort.kind !== 'quality') throw new Error('Unsupported accepted preparation effort')
    if (step.effort.kind !== 'rpe' && step.effort.kind !== 'quality') throw new Error('Unsupported accepted preparation effort')
    const movement = reviewedPreparationMovementId(step.movement, 'barbell_bench_press')!
    const activity = rep(step.id, movement, 1, step.dose.kind === 'repetitions' ? step.dose.repetitions : 1,
      step.effort.kind === 'rpe' ? rpe(step.effort.range.min, step.effort.range.max) : step.effort,
      0, step.load ? external(step.load.min) : movement === 'scapular_push_up' ? body : { kind: 'not_applicable' }, 'preparation')
    if (step.dose.kind === 'duration') activity.work = { kind: 'duration', seconds: step.dose.seconds, sides: 1, sideSwitchSeconds: 0 }
    activity.restAfterSeconds = step.restAfterSeconds?.min ?? { kind: 'as_needed', estimatedSeconds: 60 }
    return activity
  })
  const work = (load: number, effort = rpe(7, 8)) => ({ ...rep('bench-work', 'barbell_bench_press', 3, 6, effort, 180, external(load)), instructions: [...sessionRecipe.workingInstructions] })
  const common = { conditionalTiming: { kind: 'conditional' as const, whenOverBudget: 'Preserve recovery and priority bench work; omit final accessory blocks as needed and record omissions. Stop and record incomplete work if priority work cannot fit.' },
    instructions: ['Controlled lowering and purposeful concentric movement. Stop affected work for pain or loss of control.'], themes: ['strength'] }
  const row = () => rep('row', 'chest_supported_dumbbell_row', 3, 8, rpe(7), 120, selected)
  const monday: Session = { ...common, id: 'monday-bench', steps: [...preparation(), work(165),
    allowance('bench-row-rest', 120, 'recovery'), rehearsal('row-prep', 'chest_supported_dumbbell_row', 8), row(),
    allowance('row-core-rest', 120, 'recovery'), rehearsal('core-prep', 'dead_bug', 3, body, 2), rep('core', 'dead_bug', 2, 6, rpe(5, 6), 60, body, 'working', 2)] }
  const bike = preparation()[0]; bike.work = { kind: 'duration', seconds: 300, sides: 1, sideSwitchSeconds: 0 }
  bike.restAfterSeconds = { kind: 'as_needed', estimatedSeconds: 30 }
  const wednesday: Session = { ...common, id: 'wednesday-support', steps: [bike,
    ...['bodyweight_squat', 'bodyweight_hinge', 'band_row'].map(movement => ({ ...rehearsal(`easy-${movement}`, movement, 8, movement === 'band_row' ? selected : body), restAfterSeconds: { kind: 'as_needed' as const, estimatedSeconds: 30 } })),
    ...['dumbbell_goblet_squat', 'dumbbell_romanian_deadlift', 'lat_pulldown'].flatMap((movement, index): Step[] => [
      ...(index ? [allowance(`block-rest-${index}`, 120, 'recovery')] : []), rehearsal(`light-${index}`, movement, 8),
      { ...rehearsal(`moderate-${index}`, movement, 5), effort: rpe(4, 5), restAfterSeconds: 90 },
      rep(`work-${index}`, movement, 3, 8, rpe(7), index === 2 ? 120 : 180, selected),
    ])] }
  const friday: Session = { ...common, id: 'friday-bench', steps: [...preparation(), work(165, rpe(7)),
    allowance('bench-row-rest', 120, 'recovery'), rehearsal('row-prep', 'chest_supported_dumbbell_row', 8), row(),
    allowance('row-split-rest', 120, 'recovery'), rehearsal('split-prep', 'bodyweight_split_squat', 5, body, 2),
    rep('split', 'bodyweight_split_squat', 2, 8, rpe(7), 120, body, 'working', 2),
    allowance('split-core-rest', 120, 'recovery'), plank('plank-prep', 1, 10, easy, 'preparation'), plank('plank', 2, 30, rpe(5, 6), 'working')] }
  const sessions = [monday, wednesday, friday]
  sessions.forEach(value => value.steps.push(allowance('setup', 300, 'transition'), allowance('logging', 180, 'logging')))
  const schedule = { monday: monday.id, tuesday: null, wednesday: wednesday.id, thursday: null, friday: friday.id, saturday: null, sunday: null }
  const facts = { synthetic: true, olderHistory: null, previousIntendedEffort: null, sourceHash,
    familiarity: 'all listed movements', symptoms: false, outsideWork: [], historicalExposure: session.input.facts }
  const recipe: ReviewedWeekRecipe = { id: 'C2-R-complete-week', policyVersion: INITIAL_DOSE_POLICY_VERSION, review,
    sources: [{ id: sourcePath, revision: 1, contentHash: sourceHash }], profileHash: doseContentHash(profile), contextHash: doseContentHash(facts),
    sessions, baseSchedule: schedule, schedules: [{ id: 'reviewed', days: schedule, reason: 'Accepted C2-R synthetic complete week.' }],
    protocols: [], instructions: ['Athlete-selected loads are targets, not historical performance.'],
    limitations: ['Synthetic test reference, not Greg’s training plan.', 'Three seconds per rep is a time-accounting estimate, not tempo.'] }
  const context: OfflineReviewedWeekContext = { recipeId: recipe.id, scheduleId: 'reviewed', profile, facts,
    currentSources: recipe.sources, currentReviews: [review], unresolvedReasons: [] }
  const input = { context, windowStart: profile.startDate, sequenceNumber: 1,
    direction: buildRollingTrainingDirection(profile, { hypothesis: 'Trial the accepted next bench exposure within reviewed general strength support.', goalTargetDate: null }) }
  const baseRegistry = [{ recipe: structuredClone(recipe), contentHash: doseContentHash(recipe) }]
  const base = buildReviewedRollingWeeklyPlan(input, baseRegistry)
  const working = recipe.sessions[0].steps.find(step => step.id === 'bench-work') as Activity
  working.load = external(170)
  const registry = [{ recipe, contentHash: doseContentHash(recipe) }]
  const target = buildReviewedRollingWeeklyPlan(input, registry)
  if (base.kind !== 'reviewed_candidate' || target.kind !== 'reviewed_candidate') throw new Error(JSON.stringify({ base, target }))
  const link: ReviewedDoseWeekLink = { review, basePlanHash: doseContentHash(base.plan), targetPlanHash: doseContentHash(target.plan),
    optionHash: session.registry[0].contentHash, sessionRecipeHash: session.recipes[0].contentHash,
    sessionId: monday.id, workingActivityId: working.id, preparationActivityIds: sessionRecipe.preparation.map(step => step.id),
    factualSources: [{ optionSourceId: session.registry[0].option.sources[0].id, workoutId: 'workout-1', workoutDate: '2026-08-07',
      revision: 1, contentHash: reviewedDoseWorkoutHash(reviewedC2rWorkout('athlete')) }],
    identity: { movementId: 'barbell_bench_press', equipmentId: 'fixture-bench-bar-2.5lb-plates', protocolId: 'same-bench-variation', requiredEquipment: equipment.barbell_bench_press } }
  const { profile: _profile, ...compilation } = session; void _profile
  const reconciliation: TrustedDoseWeekReconciliation = { link, linkHash: doseContentHash(link), compilation }
  return { input, registry, base: base.plan, target: target.plan, reconciliation }
}
