import { findAssessmentDefinition } from '@/app/lib/coach/adaptive-programming-contracts'
import type { RollingWeeklyPlanDraft } from '@/app/lib/coach/rolling-weekly-plan'
import { decodeTargetedGoalReviews } from '@/app/lib/coach/targeted-review-contracts'

export function GoalReviewDetails({ value }: { value: unknown }) {
  const goals = decodeTargetedGoalReviews(value)
  if (!goals) return null
  return <details className="mt-4 rounded-xl border border-[var(--app-line)] p-3">
    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Review each outcome</summary>
    <ul className="space-y-3 py-2 text-sm">{goals.map(goal => <li key={goal.goalId}>
      <p className="font-semibold">{goal.binding?.goal?.statement ?? goal.goalId}</p>
      <p>{goal.attained ? 'This outcome is attained.' : 'This outcome is not established as attained.'} {goal.disposition === 'selected' ? 'Selected for this review.' : goal.disposition === 'held' ? 'Held for review of shared demands.' : 'Recorded separately; no change selected.'}</p>
      <p>{goal.includedSourceIds.length} matching source observations. {goal.missing.length ? 'More comparable evidence or a supported assignment is needed.' : 'The existing evidence rule was applied.'}</p>
      {goal.binding?.measurement && <p>Use the {findAssessmentDefinition(goal.binding.measurement.assessmentDefinition.id)?.name.toLowerCase() ?? 'confirmed assessment'} with the same movement, distance, equipment and test conditions.</p>}
    </li>)}</ul>
  </details>
}

export function ExecutionPriorityDetails({plan}:{plan:RollingWeeklyPlanDraft}) {
  const realization=plan.executionPriority
  if(!realization || realization.version!=='execution-priority-1')return null
  const goal=plan.profileSnapshot.trainingIntent?.content.outcomes.find(o=>o.goal.id===realization.intent.goalId)
  return <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
    {realization.status==='achieved'?'Priority work comes first after preparation.':realization.status==='blocked'?'Mandatory session sequencing comes before the requested priority.':'The exact requested priority movement is unavailable in these sessions.'}
    {goal ? ` ${goal.goal.statement}.` : ''}
  </p>
}
