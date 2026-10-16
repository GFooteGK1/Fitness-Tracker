/** Mechanical contract fixture only; this is not a newly accepted coaching week. */
import { reviewedRollingWeek } from './reviewed-rolling-week'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { buildReviewedRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'

export function conditionalRecoveryInput() {
  const { input, registry } = reviewedRollingWeek()
  const recipe = registry[0].recipe
  const session = recipe.sessions[0]
  const preparation = session.steps[0]
  if (preparation.kind !== 'preparation_window') throw new Error('Fixture preparation changed')
  // A bounded preparation window must not absorb or cap qualitative recovery.
  session.steps.splice(0, 1, ...structuredClone(preparation.activities))
  const activity = session.steps[0]
  if (activity.kind !== 'activity') throw new Error('Fixture activity missing')
  activity.restAfterSeconds = { kind: 'as_needed', estimatedSeconds: 180 }
  session.conditionalTiming = { kind: 'conditional', whenOverBudget: 'Preserve recovery; record any unfinished work.' }
  registry[0].contentHash = doseContentHash(recipe)
  return { input, registry }
}

export function conditionalRecoveryPlan() {
  const { input, registry } = conditionalRecoveryInput()
  const result = buildReviewedRollingWeeklyPlan(input, registry)
  if (result.kind !== 'reviewed_candidate') throw new Error(result.reasons.join('; '))
  return result.plan
}

export function conditionalRecoverySession() {
  return conditionalRecoveryPlan().scheduledSessions[0].prescription
}
