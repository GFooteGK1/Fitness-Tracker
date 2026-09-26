import type { CoachEvidenceSample } from './evidence-context'
import { validatePlanningIntent, type PlanningOutcome } from './planning-intent'
import { sampleMatchesOutcomeMeasurement } from './targeted-review'

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))

/** Resolve against the owned accepted plan's snapshot, never current memory or a
 * request-supplied outcome. The caller establishes plan ownership and acceptance.
 * Legacy allocation IDs remain the caller's independent selector contract.
 */
export function resolveConfirmedOutcomeScope(storedIntent: unknown, goalId?: string): {
  allGoalIds: string[]; outcome: PlanningOutcome | null
} {
  const none = { allGoalIds: [], outcome: null }
  if (!record(storedIntent) || !record(storedIntent.weekly_plan)
    || !record(storedIntent.weekly_plan.profileSnapshot)) return none
  const snapshot = storedIntent.weekly_plan.profileSnapshot.trainingIntent
  if (!record(snapshot) || snapshot.schemaVersion !== 1 || typeof snapshot.memoryId !== 'string' || !snapshot.memoryId.trim()
    || !Number.isSafeInteger(snapshot.memoryVersion) || Number(snapshot.memoryVersion) < 1) return none
  const validated = validatePlanningIntent(snapshot.content)
  if (!validated.ok) return none
  return { allGoalIds: validated.value.outcomes.map(outcome => outcome.goal.id),
    outcome: validated.value.outcomes.find(outcome => outcome.goal.id === goalId) ?? null }
}

/** Retrieval eligibility only; matching a confirmed outcome does not authorize
 * a numerical prescription. Existing evaluator policies retain that authority.
 * Source devices remain distinct through their stored comparability keys; the
 * confirmed outcome contract has no device selector to infer here.
 */
export function confirmedOutcomeSampleMatches(sample: CoachEvidenceSample, outcome: PlanningOutcome): boolean {
  return sampleMatchesOutcomeMeasurement(sample, outcome)
}
