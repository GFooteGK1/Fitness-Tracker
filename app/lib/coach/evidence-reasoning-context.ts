import type { CoachEvidenceContextPacket } from './evidence-context'

export const EVIDENCE_REASONING_CONTEXT_VERSION = 'evidence-reasoning-context-1' as const
const DEFAULT_RECORD_BUDGET = 32_000

/**
 * Read-only projection of already selected, owned evidence. Whole records survive
 * intact or are explicitly omitted. This grants no numerical policy authority.
 * The budget covers record JSON, not the small audit envelope around it.
 */
export function projectEvidenceReasoningContext(
  packet: CoachEvidenceContextPacket,
  userId: string,
  recordBudgetCharacters = DEFAULT_RECORD_BUDGET
) {
  if (!userId || packet.scope.userId !== userId) throw new Error('Evidence ownership mismatch')
  if (!Number.isInteger(recordBudgetCharacters) || recordBudgetCharacters < 1 || recordBudgetCharacters > 64_000) {
    throw new Error('Evidence record budget must be an integer between 1 and 64000')
  }

  let usedCharacters = 0
  const omitted: Array<{ kind: 'memory' | 'strength_baseline' | 'evidence_series'; id: string; reason: 'record_budget' }> = []
  function retain<T extends { id: string }>(kind: typeof omitted[number]['kind'], records: T[]): T[] {
    return records.flatMap(record => {
      const size = JSON.stringify(record).length
      if (usedCharacters + size > recordBudgetCharacters) {
        omitted.push({ kind, id: record.id, reason: 'record_budget' })
        return []
      }
      usedCharacters += size
      return [structuredClone(record)]
    })
  }

  // Preserve selector order and protocol-series boundaries. Never retain just
  // part of a series and let that appear to be the complete observed trend.
  const memories = retain('memory', packet.memories)
  const strengthBaselines = retain('strength_baseline', packet.strengthBaselines)
  const evidenceSeries = retain('evidence_series', packet.evidenceSeries)
  const includedSamples = evidenceSeries.reduce((sum, series) => sum + series.samples.length, 0)

  return {
    version: EVIDENCE_REASONING_CONTEXT_VERSION,
    authority: 'factual_context_only' as const,
    purpose: packet.purpose,
    asOf: packet.asOf,
    window: { ...packet.window },
    algorithmVersion: packet.algorithmVersion,
    evidencePolicyVersion: packet.evidencePolicyVersion,
    scope: structuredClone(packet.scope),
    activePlan: structuredClone(packet.activePlan),
    coverage: {
      storageAvailable: packet.storageAvailable,
      selectionComplete: packet.selectionComplete,
      projectionComplete: omitted.length === 0,
      complete: packet.storageAvailable && packet.selectionComplete && omitted.length === 0,
      selected: { memories: packet.memories.length, strengthBaselines: packet.strengthBaselines.length,
        series: packet.evidenceSeries.length, samples: packet.sampleCount },
      included: { memories: memories.length, strengthBaselines: strengthBaselines.length,
        series: evidenceSeries.length, samples: includedSamples },
      sourceLimits: { ...packet.limits },
      recordBudgetCharacters,
      usedRecordCharacters: usedCharacters,
      missing: [...packet.missing],
      omitted,
      executionExclusions: structuredClone(packet.executionExclusions ?? []),
      selectionExclusions: packet.selectionExclusions ? structuredClone(packet.selectionExclusions) : null,
    },
    memories,
    strengthBaselines,
    evidenceSeries,
  }
}
