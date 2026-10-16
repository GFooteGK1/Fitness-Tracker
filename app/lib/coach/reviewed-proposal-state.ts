import type { ReviewedRollingWeekPlan } from './reviewed-week-plan-contract'
import type { RollingWeeklyPlanDraft } from './rolling-weekly-plan'
import type { ReviewedDoseWeekSummary } from './reviewed-dose-week-summary'

export interface ReviewedProposalState {
  userId: string; programId: string; proposalId: string; planVersionId: string; basePlanVersionId: string
  requestId: string; status: 'proposed' | 'accepted' | 'rejected' | 'expired'
  activePlanVersionId: string | null; acceptanceAvailable: boolean
  plan: ReviewedRollingWeekPlan
  doseDecision?: ReviewedDoseWeekSummary
  baseWeek: { kind: 'reviewed'; plan: ReviewedRollingWeekPlan } | { kind: 'standard'; plan: RollingWeeklyPlanDraft }
}
export interface ReviewedProposalIndex {
  userId: string; programId: string
  reviews: Array<{ reviewId: string; windowStart: string; transition: 'same_week' | 'next_week' }>
  proposals: Array<{ proposalId: string; status: string }>
}
