import type { TargetedGoalReview } from './targeted-review'
export const TARGETED_REVIEW_VERSION = 'targeted-review-1' as const

/** Browser-safe version dispatch. Legacy review records omit this additive field. */
export function decodeTargetedGoalReviews(value: unknown): TargetedGoalReview[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return null
  const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(item => typeof item === 'string')
  if (new Set(value.map(v => object(v) ? v.goalId : null)).size !== value.length) return null
  return value.every(v => object(v) && v.version === TARGETED_REVIEW_VERSION && typeof v.goalId === 'string'
    && typeof v.attained === 'boolean' && ['selected', 'deferred', 'held'].includes(String(v.disposition))
    && ['continue','progress','maintain','redirect','recover','hold_collect_more','pause_review'].includes(String(v.actionCandidate)) && strings(v.includedSourceIds) && Array.isArray(v.excludedSources) && v.excludedSources.every(item => object(item) && typeof item.observationId === 'string' && typeof item.reason === 'string')
    && strings(v.matchingAssignmentIds) && strings(v.missing) && object(v.evaluator)
    && (v.binding === null || (object(v.binding) && object(v.binding.goal) && typeof v.binding.goal.statement === 'string'
      && (v.binding.measurement === null || (object(v.binding.measurement) && typeof v.binding.measurement.metricId === 'string'
        && object(v.binding.measurement.assessmentDefinition) && typeof v.binding.measurement.assessmentDefinition.id === 'string'
        && object(v.binding.measurement.protocol) && typeof v.binding.measurement.protocol.id === 'string'))))) ? value as TargetedGoalReview[] : null
}
