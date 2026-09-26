/** Offline characterization only. No model, database, or physiological quality grader. */
import { createHash } from 'node:crypto'
import { captureProvenance } from '../app/lib/capture/contracts'
import { buildFactualPlanningContext, applyFactualPlanningContext, type FactualPlanningContext } from '../app/lib/coach/planning-context'
import type { HistoryWorkoutRow } from '../app/lib/coach/planning-history'
import { buildRollingTrainingDirection, type RollingWeeklyPlanningDecision } from '../app/lib/coach/rolling-weekly-contracts'
import { buildRollingWeeklyPlan, type RollingWeeklyPlanDraft } from '../app/lib/coach/rolling-weekly-plan'
import type { ProgrammingProfile } from '../app/lib/coach/programming-schema'
import { GOLDEN_PROGRAMMING_PROFILES } from '../test/coach/golden-programming-profiles'

export const BASELINE_VERSION = 'programming-quality-characterization-1'
const asOf = '2026-09-20T18:00:00.000Z'

export interface BaselineCase {
  id: string
  family: string
  question: string
  profile: ProgrammingProfile
  history?: { workouts: HistoryWorkoutRow[]; complete: boolean; outsideTraining?: FactualPlanningContext['outsideTraining'] }
  review?: 'collect_velocity' | 'change_availability'
}

function profile(index: number): ProgrammingProfile {
  return structuredClone({ ...GOLDEN_PROGRAMMING_PROFILES[index].profile, startDate: '2026-09-21' })
}

function workout(sets: number, reps: number, weight: number): HistoryWorkoutRow {
  return {
    id: 'synthetic-floor-press-1', user_id: 'synthetic-athlete', workout_date: '2026-09-14',
    created_at: '2026-09-14T18:00:00.000Z', updated_at: '2026-09-14T18:00:00.000Z',
    capture_revision: 1, capture_provenance: captureProvenance('workout', 'athlete_reported', 'athlete_confirmed'),
    blocks: [{ movements: [{ name: 'Barbell floor press', sets, reps, weight, unit: 'lb' }] }],
  }
}

/** Visible synthetic development cases. These are neither Greg's records nor a sealed holdout. */
export function developmentCases(): BaselineCase[] {
  const cases: BaselineCase[] = GOLDEN_PROGRAMMING_PROFILES.map((item, index) => ({
    id: `domain-${item.id}`, family: `domain-${item.profile.primaryGoal.domain}`,
    question: 'What complete week does the current compiler produce for this supported profile?', profile: profile(index),
  }))
  cases.push(
    { id: 'history-volume', family: 'performed-dose', question: 'Does reported working dose reach the numerical prescription?', profile: profile(1), history: { workouts: [workout(3, 8, 135)], complete: true } },
    { id: 'history-heavy', family: 'performed-dose', question: 'Does changing only performed sets/reps/load change the prescription?', profile: profile(1), history: { workouts: [workout(4, 2, 205)], complete: true } },
    { id: 'history-empty', family: 'history-coverage', question: 'Is empty retrieval distinguished from verified absence of training?', profile: profile(1), history: { workouts: [], complete: true } },
    { id: 'history-partial', family: 'history-coverage', question: 'Does partial retrieval get silently treated as a cold start?', profile: profile(1), history: { workouts: [workout(3, 8, 135)], complete: false } },
    { id: 'outside-unknown', family: 'outside-training', question: 'What happens when outside training is unknown?', profile: profile(1), history: { workouts: [], complete: true } },
    { id: 'outside-practice', family: 'outside-training', question: 'Does reported outside training affect the compiled week?', profile: profile(1), history: { workouts: [], complete: true, outsideTraining: { status: 'reported', sourceIds: ['synthetic-practice-note'], notes: ['Athlete reports Tuesday and Thursday 75-minute field practices.'] } } },
    { id: 'velocity-monitoring-request', family: 'monitoring', question: 'Does collect_signal create dedicated fixed-load monitoring sets or annotate existing work?', profile: profile(1), review: 'collect_velocity' },
    { id: 'availability-correction', family: 'schedule', question: 'Can ordinary continuation honor a confirmed move to different available days?', profile: profile(1), review: 'change_availability' },
  )
  const multi = profile(2)
  multi.sessionAvailability = ['monday', 'tuesday', 'wednesday', 'friday', 'saturday'].map(day => ({ day: day as ProgrammingProfile['sessionAvailability'][number]['day'], minutes: 60 }))
  multi.secondaryGoals = ['strength', 'speed_agility', 'aerobic'].map(domain => ({
    id: `synthetic-secondary-${domain}`, domain: domain as ProgrammingProfile['primaryGoal']['domain'], role: 'secondary', allocation: 'development', athleteIntent: `Develop ${domain}`,
  }))
  cases.push({ id: 'four-domain-event', family: 'outcome-breadth', question: 'Can four training areas be represented without silently dropping one?', profile: multi })
  const short = profile(0)
  short.sessionAvailability = short.sessionAvailability.map(item => ({ ...item, minutes: 20 }))
  cases.push({ id: 'twenty-minute-budget', family: 'time-budget', question: 'Is an unsupported time budget preserved as a limitation?', profile: short })

  const corrected = { ...workout(4, 2, 205), capture_revision: 2, updated_at: '2026-09-18T18:00:00.000Z',
    capture_provenance: captureProvenance('workout', 'athlete_reported', 'corrected', ['synthetic-rep-correction']) }
  cases.push({ id: 'history-corrected-revision', family: 'history-correction', question: 'Does a corrected source revision survive retrieval, and does its quantity reach prescription?', profile: profile(1), history: { workouts: [corrected], complete: true } })
  const estimated = { ...workout(3, 8, 135), capture_provenance: captureProvenance('workout', 'model_estimated', 'athlete_confirmed') }
  cases.push({ id: 'history-confirmed-estimate', family: 'quantity-provenance', question: 'Does confirmation preserve estimated origin rather than establish reported familiarity?', profile: profile(1), history: { workouts: [estimated], complete: true } })
  const imported = { ...workout(3, 8, 135), capture_provenance: captureProvenance('workout', 'imported_unverified', 'unreviewed') }
  cases.push({ id: 'history-unreviewed-import', family: 'quantity-provenance', question: 'Can an unreviewed imported template establish performed familiarity?', profile: profile(1), history: { workouts: [imported], complete: true } })
  const second = { ...workout(2, 6, 155), id: 'synthetic-floor-press-2', created_at: '2026-09-14T21:00:00.000Z', updated_at: '2026-09-14T21:00:00.000Z' }
  cases.push({ id: 'history-two-same-day-sessions', family: 'session-identity', question: 'Are distinct same-day sessions preserved without aggregating dose or inventing a maximum?', profile: profile(1), history: { workouts: [workout(3, 8, 135), second], complete: true } })
  const unknownLoad = { ...workout(3, 8, 135), blocks: [{ movements: [{ name: 'Barbell floor press', sets: 3, reps: 8 }] }] }
  cases.push({ id: 'history-unknown-load', family: 'quantity-missingness', question: 'Does missing load remain unknown rather than create a numerical anchor?', profile: profile(1), history: { workouts: [unknownLoad], complete: true } })

  const assessed = profile(1)
  assessed.primaryGoal = { id: 'synthetic-strength', domain: 'strength', role: 'primary', allocation: 'lead', athleteIntent: 'Develop squat strength' }
  assessed.athleteGoalSummary = 'Develop squat strength with recorded assessment evidence'
  assessed.assessments = [{ id: 'synthetic-assessment-squat', movement: 'Back Squat', variation: null, load: 225,
    unit: 'lb', reps: 5, assessedOn: '2026-09-14', isTrueRepMax: true, rir: 0, rpe: null,
    athleteConfidence: 0.9, estimatedOneRepMax: 262.5, estimateKind: 'estimated_1rm', calculatorVersion: 'epley-general-v1' }]
  cases.push({ id: 'assessment-matched', family: 'assessment-variation', question: 'Does the existing saved-assessment path produce a traceable load anchor?', profile: assessed })
  const variation = structuredClone(assessed)
  variation.assessments[0].variation = 'Box squat to parallel'
  cases.push({ id: 'assessment-variation-changed', family: 'assessment-variation', question: 'Does changing the assessment variation alter its eligibility for the same prescribed movement?', profile: variation })
  const fiveDays = profile(1)
  fiveDays.sessionAvailability = ['monday', 'tuesday', 'wednesday', 'friday', 'saturday'].map(day => ({ day: day as ProgrammingProfile['sessionAvailability'][number]['day'], minutes: 60 }))
  cases.push({ id: 'five-sixty-minute-opportunities', family: 'schedule-opportunities', question: 'How does the same goal use five confirmed 60-minute opportunities rather than three?', profile: fiveDays })
  return cases
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function executableProjection(plan: RollingWeeklyPlanDraft) {
  return plan.sessions.map(session => ({
    day: session.day,
    blocks: session.blocks.map(block => ({
      exercises: block.exercises.map(exercise => ({
        movementId: exercise.movementId, role: exercise.role, dose: exercise.dose,
        executionTarget: exercise.executionTarget, loadAnchor: exercise.loadAnchor ?? null,
      })),
    })),
  }))
}

function requirePlan(result: ReturnType<typeof buildRollingWeeklyPlan>): RollingWeeklyPlanDraft {
  if (result.kind !== 'weekly_plan') throw new Error(`Unexpected compiler result: ${result.kind}`)
  return result
}

export function runBaselineCase(testCase: BaselineCase) {
  const input = structuredClone(testCase)
  let context: FactualPlanningContext | null = null
  let preparedProfile = structuredClone(input.profile)
  let prior: RollingWeeklyPlanDraft | null = null
  let reviewDecision: RollingWeeklyPlanningDecision | null = null
  let plan: RollingWeeklyPlanDraft | null = null
  let error: string | null = null
  try {
    if (input.history) {
      context = buildFactualPlanningContext({ userId: 'synthetic-athlete', asOf, startsOn: '2026-08-24', endsOn: '2026-09-20',
        mode: 'current', available: true, ...input.history })
      preparedProfile = applyFactualPlanningContext(preparedProfile, context)
    }
    const direction = buildRollingTrainingDirection(preparedProfile, { hypothesis: 'Synthetic characterization, coaching quality unreviewed.' })
    const initial = requirePlan(buildRollingWeeklyPlan({ source: 'initial', windowStart: preparedProfile.startDate, profile: preparedProfile, direction }))
    if (!input.review) plan = initial
    else {
      prior = initial
      preparedProfile.startDate = '2026-09-28'
      reviewDecision = { reviewId: 'synthetic-review', action: 'continue', presentationClass: 'same_track', evidenceStatus: 'sufficient', rationale: 'Synthetic request tests compiler behavior, not physiological eligibility.' }
      if (input.review === 'collect_velocity') {
        const exercise = prior.sessions.flatMap(session => session.blocks.flatMap(block => block.exercises))
          .find(item => item.movementId === 'barbell_floor_press')
        if (!exercise) throw new Error('Synthetic monitoring case requires a compiled barbell floor press')
        reviewDecision = { ...reviewDecision, action: 'collect_signal', presentationClass: 'needs_signal', evidenceStatus: 'insufficient', signalRequest: {
          coverageRequirementId: exercise.coverageRequirementIds[0], movementId: exercise.movementId,
          metricId: 'bar.mean_velocity', protocolId: 'strength.fixed_load_velocity.v1',
        } }
      } else preparedProfile.sessionAvailability = ['thursday', 'friday', 'saturday'].map(day => ({ day: day as ProgrammingProfile['sessionAvailability'][number]['day'], minutes: 60 }))
      plan = requirePlan(buildRollingWeeklyPlan({ source: 'weekly_review', windowStart: preparedProfile.startDate, profile: preparedProfile, direction, priorWeek: prior, decision: reviewDecision }))
    }
  } catch (caught) { error = caught instanceof Error ? caught.message : String(caught) }
  return {
    id: input.id, family: input.family, question: input.question, input, inputHash: hash(input),
    status: plan ? 'compiled' as const : 'blocked' as const,
    context, preparedProfile, prior, reviewDecision, plan, error,
    executableHash: plan ? hash(executableProjection(plan)) : null,
    quality: { status: 'pending_qualified_review' as const, reviewer: null, scores: null, rationale: null },
  }
}

export function runDevelopmentBaseline() {
  const cases = developmentCases().map(runBaselineCase)
  return {
    version: BASELINE_VERSION, purpose: 'Current compiler characterization; not a quality pass or launch decision',
    dataset: 'visible_synthetic_development', asOf, modelCalls: 0, databaseCalls: 0,
    qualifiedReview: { owner: null, status: 'unassigned', calibration: 'not_started' },
    holdout: { reservedCaseCount: 16, fixturesCreated: false, status: 'future_independent_authoring_required', splitUnit: 'athlete_trajectory_and_failure_family' },
    counts: { total: cases.length, compiled: cases.filter(item => item.status === 'compiled').length, blocked: cases.filter(item => item.status === 'blocked').length, qualityPassed: 0 },
    cases,
  }
}
