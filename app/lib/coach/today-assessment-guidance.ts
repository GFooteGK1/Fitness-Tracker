import { getLocalDate, parseDateString } from '../timezone-utils'
import { contextObject } from './coaching-context'
import type { readCoachingContext } from './coaching-context-server'
import type { DailyCheckIn } from './daily-check-in'
import { validatePlanningIntent } from './planning-intent'
import type { TodayWorkoutRecommendation } from './today-workout-recommendation'
import type { CoachProgramDomainId } from './types'
import type { LastCompletedWorkout, TodayWorkoutEvidence } from './workout-today-app'

const strainChoices = ['lower', 'usual', 'higher'] as const
const sleepChoices = ['worse', 'usual', 'better'] as const

export const todayCheckInSchema = {
  type: 'object',
  properties: {
    stress: { type: 'string', enum: strainChoices },
    fatigue: { type: 'string', enum: strainChoices },
    sleep: { type: 'string', enum: sleepChoices },
  },
  required: ['stress', 'fatigue', 'sleep'],
  additionalProperties: false,
} as const

function isChoice<const T extends string>(choices: readonly T[], value: unknown): value is T {
  return choices.some(choice => choice === value)
}

export function parseTodayCheckIn(input: unknown) {
  if (!contextObject(input) || Object.keys(input).length !== 3 || !isChoice(strainChoices, input.stress)
    || !isChoice(strainChoices, input.fatigue) || !isChoice(sleepChoices, input.sleep)) return null
  return { stress: input.stress, fatigue: input.fatigue, sleep: input.sleep }
}

type CheckIn = NonNullable<ReturnType<typeof parseTodayCheckIn>> & Partial<Pick<DailyCheckIn, 'soreness' | 'motivation'>>
type CoachingContext = Awaited<ReturnType<typeof readCoachingContext>>

const goalPractice: Record<CoachProgramDomainId, string> = {
  strength: 'Practice a familiar lift with controlled reps and plenty in reserve.',
  hypertrophy: 'Choose familiar resistance exercises and finish your sets with reps in reserve.',
  power_explosiveness: 'Rehearse a familiar power movement with crisp technique and full recovery between efforts.',
  speed_agility: 'Practice familiar movement or sprint mechanics at a controlled pace.',
  aerobic: 'Choose a familiar aerobic activity at a pace where you can hold a conversation.',
  resilience: 'Use familiar, comfortable range-of-motion or stability work.',
}

function confirmedGoal(requirements: CoachingContext['requirements']) {
  const intent = requirements.training_intent.status === 'current' && validatePlanningIntent(requirements.training_intent.value)
  if (intent && intent.ok) {
    const active = intent.value.outcomes.filter(outcome => outcome.goal.status === 'active')
    const primary = active.length === 1 ? active[0]
      : intent.value.priorityOrder?.map(id => active.find(outcome => outcome.goal.id === id)).find(Boolean)
    if (primary) return { statement: primary.goal.statement, domain: primary.capability.status === 'supported' ? primary.domain : null }
  }
  const primary = requirements.primary_goal.status === 'current' ? requirements.primary_goal.value : null
  const statement = contextObject(primary) ? primary.statement ?? primary.goal : null
  return { statement: typeof statement === 'string' ? statement.trim().slice(0, 180) : null, domain: null }
}

// A high self-reported session effort can support an easy option. It does not
// establish a load adjustment, a trend, or an athlete's current readiness.
function highReportedEffort(value: number | null, origin: string, reviewState: string): value is number {
  return value !== null && value >= 8.5 && value <= 10 && origin === 'athlete_reported'
    && (reviewState === 'athlete_confirmed' || reviewState === 'corrected')
}

/** One-day advice only. The chosen LLM and the athlete retain programming authority. */
export function deriveTodayAssessmentGuidance(
  checkIn: CheckIn, context: CoachingContext,
  workout: { lastWorkout: LastCompletedWorkout; workoutEvidence: TodayWorkoutEvidence | null; workoutRecommendation: TodayWorkoutRecommendation },
) {
  const { lastWorkout, workoutEvidence, workoutRecommendation } = workout
  const { localDate, performedWork } = context
  const previousDay = parseDateString(localDate)
  previousDay.setDate(previousDay.getDate() - 1)
  const yesterday = getLocalDate(previousDay)
  const isRecent = (date: string | null) => date === localDate || date === yesterday
  const recentRecords = performedWork?.records.filter(record => isRecent(record.date)) ?? []
  const alreadyTrained = lastWorkout.date === localDate || recentRecords.some(record => record.date === localDate)
    || workoutRecommendation.sessions.some(session => session.status === 'completed')
  const hardWork = recentRecords.find(record => 'sessionEffort' in record
    && highReportedEffort(record.sessionEffort.value, record.sessionEffort.origin, record.sessionEffort.reviewState))
  const hardEffort = hardWork && 'sessionEffort' in hardWork ? hardWork.sessionEffort.value
    : workoutEvidence && isRecent(lastWorkout.date)
      && highReportedEffort(workoutEvidence.sessionRpe, workoutEvidence.rpeOrigin, workoutEvidence.rpeReviewState)
      ? workoutEvidence.sessionRpe : null

  const checkInConcerns = [checkIn.stress === 'higher' ? 'higher stress' : null,
    checkIn.fatigue === 'higher' ? 'higher fatigue' : null, checkIn.sleep === 'worse' ? 'worse sleep' : null,
    checkIn.soreness === 'higher' ? 'higher soreness' : null].filter(Boolean)
  const reasons = [checkInConcerns.length ? `You reported ${checkInConcerns.join(', ')} compared with usual.`
    : 'Your check-in put the reported recovery signals at or better than usual.']
  if (checkIn.motivation === 'lower') reasons.push('You reported lower motivation than usual.')
  if (hardEffort !== null) reasons.push(`You confirmed a recent session effort of ${hardEffort}/10.`)
  else if (alreadyTrained) reasons.push('You have training logged for today.')
  else if (isRecent(lastWorkout.date) || recentRecords.length) reasons.push('You have recent training logged.')
  else reasons.push('There is limited recent workout evidence to guide today’s effort.')
  const goal = confirmedGoal(context.requirements)
  if (goal.statement) reasons.push(`Current goal · ${goal.statement}`)

  if (workoutRecommendation.reviewBeforeTraining) {
    return { title: workoutRecommendation.title, summary: workoutRecommendation.reason ?? 'Your saved guidance calls for a review before training.',
      reasons, actions: ['Review the saved guidance before choosing today’s training.'] }
  }
  const planned = workoutRecommendation.sessions.filter(session => session.status === 'planned')
  if (hardEffort !== null || checkInConcerns.length > 1 || alreadyTrained) {
    return { title: 'Make today an easy day', summary: 'Prioritize recovery. If you want to move, choose easy, familiar work.', reasons,
      actions: ['Try gentle movement or easy aerobic work if it feels comfortable.', 'Leave hard efforts for another day.'] }
  }
  if (checkInConcerns.length) {
    return { title: 'Start easy and reassess', summary: 'Start below your usual effort and see how the warm-up feels.', reasons,
      actions: [planned.length ? 'Use the warm-up from your saved session. Keep the main work lighter if you still feel off.'
        : 'Start with familiar, comfortable movement. Keep the session easy if you still feel off.'] }
  }
  if (planned.length) {
    return { title: planned.length === 1 ? `Start with ${planned[0].title}` : 'Start with your saved session',
      summary: 'Use the planned work as a starting point and let your warm-up confirm the effort.', reasons,
      actions: ['Use the warm-up and main work from your accepted plan below.',
        'Keep the intended effort if movement feels good. Scale the work if the warm-up feels harder than usual.'] }
  }
  return { title: goal.domain ? 'Do a manageable session for your goal' : 'Keep training simple today',
    summary: 'Choose familiar work that fits how you feel today.', reasons,
    actions: ['Warm up with easy movement. Build effort gradually as you feel ready.',
      goal.domain ? goalPractice[goal.domain] : 'Choose easy aerobic work or practice a familiar movement at a comfortable effort.',
      'Stay within your saved training constraints. Finish with easy movement, or ease off sooner if the work feels harder than usual.'] }
}
