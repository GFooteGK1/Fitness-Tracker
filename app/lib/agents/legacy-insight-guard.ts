/** Permanent truthfulness boundary, independent of recommendation rollout flags.
 * These legacy contracts lack measured transfer, HRV series, or reviewed complete-day
 * intake/target provenance. Model confidence cannot supply missing evidence.
 */
export const RETIRED_LEGACY_INSIGHT_PATTERNS = ['NUT_PERF', 'HRV_TREND', 'CAL_DEF', 'STRAIN_NUT', 'PRO_REC'] as const
const retired = new Set<string>(RETIRED_LEGACY_INSIGHT_PATTERNS)
const retiredFitnessTypes = new Set(['nutrition_performance', 'nutrition_strain', 'recovery_nutrition'])

export function canSurfaceLegacyInsight(value: { pattern_id?: unknown; type?: unknown }): boolean {
  return !(typeof value.pattern_id === 'string' && retired.has(value.pattern_id.trim().toUpperCase()))
    && !(typeof value.type === 'string' && retiredFitnessTypes.has(value.type.trim().toLowerCase()))
}

export const UNSUPPORTED_INSIGHT_RESPONSE = 'The available records do not establish that conclusion. Review the source data before making a training or nutrition change.'


/** Old unlinked analyst prose has no verifiable assertion/source contract. Keep it
 * in the user's history, but do not recycle it as evidence in model context. */
export function filterModelConversation<T extends { role?: string; related_entity_type?: string | null }>(messages: T[]): T[] {
  return messages.filter(message => message.role !== 'socius' || message.related_entity_type === 'insight')
}
