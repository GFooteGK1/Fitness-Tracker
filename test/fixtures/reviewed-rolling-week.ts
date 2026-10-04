import { buildReviewedRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { reviewedDevelopmentalWeek } from './reviewed-developmental-week'

export function reviewedRollingWeek() {
  const { context, registry } = reviewedDevelopmentalWeek()
  const input = { context, windowStart: context.profile.startDate, sequenceNumber: 1,
    direction: buildRollingTrainingDirection(context.profile, { hypothesis: 'Retain reviewed strength and supporting work while moving bench volume to a reliable slot.', goalTargetDate: null }) }
  const result = buildReviewedRollingWeeklyPlan(input, registry)
  if (result.kind !== 'reviewed_candidate') throw new Error(result.reasons.join('; '))
  return { input, registry, result, plan: result.plan,
    intent: { format: 'reviewed_weekly_intent_v0_1', horizon_weeks: 1, reviewed_week: result.plan } }
}
