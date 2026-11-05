import { buildReviewedRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { reviewedDevelopmentalWeek } from './reviewed-developmental-week'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'

export function reviewedRollingWeek(startDate?: string) {
  const { context, registry } = reviewedDevelopmentalWeek()
  if (startDate !== undefined) {
    context.profile.startDate = startDate
    registry[0].recipe.profileHash = doseContentHash(context.profile)
    registry[0].contentHash = doseContentHash(registry[0].recipe)
  }
  const input = { context, windowStart: context.profile.startDate, sequenceNumber: 1,
    direction: buildRollingTrainingDirection(context.profile, { hypothesis: 'Retain reviewed strength and supporting work while moving bench volume to a reliable slot.', goalTargetDate: null }) }
  const result = buildReviewedRollingWeeklyPlan(input, registry)
  if (result.kind !== 'reviewed_candidate') throw new Error(result.reasons.join('; '))
  return { input, registry, result, plan: result.plan,
    intent: { format: 'reviewed_weekly_intent_v0_1', horizon_weeks: 1, reviewed_week: result.plan } }
}
