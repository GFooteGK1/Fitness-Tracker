/** Mechanical representation fixture, not an approved new athlete prescription. */
import { reviewedRollingWeek } from './reviewed-rolling-week'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { buildReviewedRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { reviewedSessionActivities } from '@/app/lib/coach/reviewed-session-contract'
import type { ReviewedWeekActivity } from '@/app/lib/coach/offline-reviewed-week'

export function effortWorkInput() {
  const { input, registry } = reviewedRollingWeek()
  const session = registry[0].recipe.sessions[0]
  const source = reviewedSessionActivities(session).find(activity => activity.role === 'working' && activity.load.kind === 'external')!
  const working: ReviewedWeekActivity = { ...structuredClone(source), id: 'required-work', sets: 2,
    work: { kind: 'effort_repetitions', targetRir: 2, sides: 1, estimatedSecondsPerSet: 60, sideSwitchSeconds: 0 },
    effort: { kind: 'rpe', min: 8, max: 8 }, restBetweenSeconds: 120, restAfterSeconds: 0,
    protocolId: null, instructions: ['Preserve controlled movement. Record actual reps and effort.'] }
  const prep: ReviewedWeekActivity = { ...structuredClone(working), id: 'required-prep', role: 'preparation', sets: 1,
    work: { kind: 'repetitions', repetitions: { min: 5, max: 5 }, sides: 1, secondsPerRep: 3 },
    effort: { kind: 'rpe', min: 3, max: 4 }, restBetweenSeconds: 0, restAfterSeconds: 60 }
  session.steps = [prep, working,
    { kind: 'allowance', id: 'optional-transition', purpose: 'transition', seconds: 30 },
    { ...structuredClone(prep), id: 'optional-prep' },
    { ...structuredClone(working), id: 'optional-work', sets: 2,
      work: { kind: 'effort_repetitions', targetRir: 2, sides: 2, estimatedSecondsPerSet: 1000, sideSwitchSeconds: 30 } },
    { kind: 'allowance', id: 'logging', purpose: 'logging', seconds: 120 }]
  session.optionalTail = { fromStepId: 'optional-transition', reason: 'Keep priority work and recovery; record skipped secondary work.' }
  session.conditionalTiming = { kind: 'conditional', whenOverBudget: 'Omit the optional tail if time is insufficient; record incomplete priority work if needed.' }
  registry[0].contentHash = doseContentHash(registry[0].recipe)
  return { input, registry }
}

export function effortWorkPlan() {
  const { input, registry } = effortWorkInput()
  const result = buildReviewedRollingWeeklyPlan(input, registry)
  if (result.kind !== 'reviewed_candidate') throw new Error(result.reasons.join('; '))
  return result.plan
}

export function effortWorkSession() {
  return effortWorkPlan().scheduledSessions[0].prescription
}
