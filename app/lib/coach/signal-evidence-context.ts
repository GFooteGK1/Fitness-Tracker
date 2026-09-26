import type { CoachEvidenceContextPacket, CoachEvidenceSample } from './evidence-context'
import type { PerformedWorkContext } from './performed-work-context'
import { signalEvidenceJson } from './signal-evidence-json'

export interface SignalEvidenceContext {
  version: 'signal-evidence-context-1'
  authority: 'factual_review_context_only'
  numericPolicyEligible: false
  userId: string
  asOf: string
  coverage: {
    measurementRetrievalComplete: boolean
    performedWork: 'not_supplied' | 'unavailable' | 'partial' | 'available' | 'no_records'
    projectionComplete: boolean
    omittedObservations: number
  }
  observations: Array<{
    observationId: string
    seriesId: string
    metricId: string
    semanticRole: string
    protocol: { id: string; version: string }
    comparabilityKey: string
    workoutId: string | null
    movementId: string | null
    readingIds: string[]
    readings: Array<{ id: string; value: number; unit: string; ordinal: number; observedAt: string; sourceVerification: string; valueProvenance: Record<string, unknown> | null }>
    observedReadings: number
    counts: { expectedSensorReadings: number | null; performedRepetitions: number | null; status: 'reported' | 'unknown' | 'conflicting_or_invalid'; source: 'value_provenance.measurementCoverage' | null }
    sensorCoverage: 'reported_complete' | 'reported_incomplete' | 'conflicting' | 'unknown'
    workingEvidence: Array<{
      sourceId: string; sourcePath: string; workoutId: string; revision: number | null
      movementId: string; basis: string; origin: string; reviewState: string
      completionState: PerformedWorkContext['records'][number]['completionState']
      limitations: string[]
      equipment: unknown
      unilateralConvention: unknown
      quantities: PerformedWorkContext['records'][number]['quantities']
      quantityProvenance: PerformedWorkContext['records'][number]['quantityProvenance']
      recordedWeight: PerformedWorkContext['records'][number]['recordedWeight']
      protocol: unknown
      effort: unknown
      sessionEffort: PerformedWorkContext['records'][number]['sessionEffort']
      match: 'same_workout_and_movement_context_only'
    }>
    interpretation: 'review_required'
    limitations: string[]
  }>
  limitations: string[]
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 10_000
const BUDGET = 12_000

/** Explicit reported metadata only. Neither prescribed reps nor ordinal gaps prove missing sensor readings. */
export function reportedMeasurementCounts(samples: readonly { valueProvenance?: Record<string, unknown> | null }[]): SignalEvidenceContext['observations'][number]['counts'] {
  const metadata = samples.map(sample => sample.valueProvenance?.measurementCoverage)
  const unknown = { expectedSensorReadings: null, performedRepetitions: null, status: 'unknown', source: null } as const
  if (metadata.every(value => value === undefined)) return unknown
  const valid = metadata.every(value => record(value) && value.version === 1
    && (value.expectedSensorReadings === null || count(value.expectedSensorReadings))
    && (value.performedRepetitions === null || count(value.performedRepetitions)))
  const keys = metadata.map(value => record(value) ? JSON.stringify([value.expectedSensorReadings, value.performedRepetitions]) : null)
  if (!valid || new Set(keys).size !== 1) return { ...unknown, status: 'conflicting_or_invalid' }
  const first = metadata[0] as { expectedSensorReadings: number | null; performedRepetitions: number | null }
  return { expectedSensorReadings: first.expectedSensorReadings, performedRepetitions: first.performedRepetitions,
    status: 'reported', source: 'value_provenance.measurementCoverage' }
}

/** Side-by-side factual evidence, not a new adaptation evaluator or a numerical policy. */
export function buildSignalEvidenceContext(packet: CoachEvidenceContextPacket, userId: string, work?: PerformedWorkContext | null): SignalEvidenceContext {
  if (!userId || packet.scope.userId !== userId || (work && work.userId !== userId)) throw new Error('Signal evidence ownership mismatch')
  if (work && work.asOf !== packet.asOf) throw new Error('Signal evidence snapshot mismatch')
  const result: SignalEvidenceContext = {
    version: 'signal-evidence-context-1', authority: 'factual_review_context_only', numericPolicyEligible: false,
    userId, asOf: packet.asOf,
    coverage: { measurementRetrievalComplete: packet.storageAvailable && packet.selectionComplete,
      performedWork: work?.status ?? 'not_supplied', projectionComplete: true, omittedObservations: 0 },
    observations: [],
    limitations: ['Reported counts are not validated sensor accuracy or a reviewed completeness policy.',
      'No ordinal or prescribed-repetition inference fills a missing count; observations with no selected readings are not represented.',
      'Working evidence is associated by workout and movement only; variation, load, protocol and effort require interpretation.',
      'These facts do not change evaluator trends, dose eligibility or accepted work.']
  }
  let used = 0
  for (const series of packet.evidenceSeries) {
    const groups = new Map<string, CoachEvidenceSample[]>()
    for (const sample of series.samples) groups.set(sample.observationId, [...(groups.get(sample.observationId) ?? []), sample])
    for (const [observationId, samples] of groups) {
      const first = samples[0]
      const readingIds = [...new Set(samples.map(sample => sample.observationValueId))]
      const uniqueIds = readingIds.length === samples.length
      const movementId = typeof first.comparison.movementId === 'string' && first.comparison.movementId.length > 0 ? first.comparison.movementId : null
      const identityConsistent = samples.every(sample => sample.workoutId === first.workoutId
        && sample.comparison.movementId === first.comparison.movementId && sample.metricId === series.metricId
        && sample.protocol.id === series.protocol.id && sample.protocol.version === series.protocol.version
        && sample.comparabilityKey === series.comparabilityKey)
      const counts = reportedMeasurementCounts(samples)
      const expected = counts.expectedSensorReadings
      const sensorCoverage = !uniqueIds || !identityConsistent || counts.status === 'conflicting_or_invalid' || (expected !== null && readingIds.length > expected)
        ? 'conflicting' as const : !result.coverage.measurementRetrievalComplete || expected === null ? 'unknown' as const
          : readingIds.length === expected ? 'reported_complete' as const : 'reported_incomplete' as const
      const workingEvidence = identityConsistent && first.workoutId && movementId ? (work?.records ?? [])
        .filter(row => row.workoutId === first.workoutId && row.movementId === movementId && row.role === 'working'
          && row.completionState !== 'explicitly_not_completed' && row.completionState !== 'uncertain')
        .map(row => ({ sourceId: row.sourceId, sourcePath: row.sourcePath, workoutId: row.workoutId, revision: row.revision,
          movementId, basis: row.basis, origin: row.origin, reviewState: row.reviewState,
          completionState: row.completionState, limitations: [...row.limitations], equipment: structuredClone(row.equipment ?? null),
          unilateralConvention: structuredClone(row.unilateralConvention ?? null),
          quantities: structuredClone(row.quantities), quantityProvenance: structuredClone(row.quantityProvenance),
          recordedWeight: structuredClone(row.recordedWeight), protocol: structuredClone(row.protocol ?? null),
          effort: structuredClone(row.effort ?? null), sessionEffort: structuredClone(row.sessionEffort),
          match: 'same_workout_and_movement_context_only' as const })) : []
      const observation: SignalEvidenceContext['observations'][number] = {
        observationId, seriesId: series.id, metricId: series.metricId, semanticRole: series.semanticRole,
        protocol: { id: series.protocol.id, version: series.protocol.version }, comparabilityKey: series.comparabilityKey, workoutId: first.workoutId, movementId,
        readingIds, readings: samples.map(sample => ({ id: sample.observationValueId, value: sample.value, unit: sample.unit,
          ordinal: sample.ordinal, observedAt: sample.observedAt, sourceVerification: sample.source.verificationStatus,
          valueProvenance: structuredClone(sample.valueProvenance ?? null) })),
        observedReadings: readingIds.length, counts, sensorCoverage, workingEvidence, interpretation: 'review_required',
        limitations: [...(!identityConsistent ? ['conflicting_sample_identity'] : []), ...(!uniqueIds ? ['duplicate_reading_identity'] : []),
          ...(!result.coverage.measurementRetrievalComplete ? ['selected_readings_do_not_establish_sensor_coverage'] : []),
          ...(counts.status !== 'reported' ? ['expected_or_performed_counts_unverified'] : []),
          ...(sensorCoverage === 'reported_incomplete' ? ['missing_readings_do_not_imply_unperformed_repetitions'] : []),
          ...(workingEvidence.length === 0 ? ['no_linked_working_record_does_not_mean_no_work_performed'] : [])]
      }
      const size = JSON.stringify(observation).length
      const identityFits = observation.observationId.length <= 2_000 && observation.seriesId.length <= 4_000
        && observation.metricId.length <= 200 && observation.protocol.id.length <= 200 && observation.protocol.version.length <= 100
        && observation.comparabilityKey.length <= 2_000 && (observation.workoutId?.length ?? 0) <= 2_000
        && (observation.movementId?.length ?? 0) <= 2_000 && observation.readingIds.every(id => id.length <= 2_000)
      if (used + size > BUDGET || result.observations.length >= 160 || !identityFits
        || !signalEvidenceJson({ ...result, observations: [...result.observations, observation] })) {
        result.coverage.projectionComplete = false; result.coverage.omittedObservations += 1; continue
      }
      used += size
      result.observations.push(observation)
    }
  }
  return result
}
