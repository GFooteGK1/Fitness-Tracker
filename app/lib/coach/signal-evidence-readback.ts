import { reportedMeasurementCounts, type SignalEvidenceContext } from './signal-evidence-context'
import { signalEvidenceJson as json } from './signal-evidence-json'

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, max = 2_000): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 10_000
const ordinal = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && Number.isFinite(v)
const nullableText = (v: unknown) => v === null || text(v)
const nullableCount = (v: unknown) => v === null || count(v)
const fields = (v: Record<string, unknown>, names: string[]) => Object.keys(v).length === names.length && names.every(name => Object.hasOwn(v, name))
const strings = (v: unknown, max = 20): v is string[] => Array.isArray(v) && v.length <= max && v.every(item => text(item))
const choice = (v: unknown, values: readonly string[]) => typeof v === 'string' && values.includes(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

function quantity(value: unknown, whole = false): boolean {
  if (!object(value) || !text(value.sourcePath)) return false
  const numeric = (v: unknown) => finite(v) && (!whole || Number.isInteger(v))
  if (value.kind === 'exact') return fields(value, ['kind', 'value', 'sourcePath']) && numeric(value.value)
  if (value.kind === 'bounded') return fields(value, ['kind', 'min', 'max', 'sourcePath']) && finite(value.min) && finite(value.max)
    && numeric(value.min) && numeric(value.max) && value.min < value.max
  return value.kind === 'unknown' && fields(value, ['kind', 'reason', 'sourcePath']) && text(value.reason)
}
function provenance(value: unknown): boolean {
  return object(value) && fields(value, ['origin', 'reviewState']) && text(value.origin, 100) && text(value.reviewState, 100)
}
function working(value: unknown, workoutId: unknown, movementId: unknown): boolean {
  if (!object(value) || !fields(value, ['sourceId', 'sourcePath', 'workoutId', 'revision', 'movementId', 'basis', 'origin', 'reviewState',
    'quantities', 'quantityProvenance', 'recordedWeight', 'protocol', 'effort', 'sessionEffort', 'match', 'completionState', 'limitations', 'equipment', 'unilateralConvention'])
    || !text(workoutId) || !text(movementId) || value.workoutId !== workoutId || value.movementId !== movementId
    || value.sourceId !== `workout:${workoutId}` || !text(value.sourcePath) || !(value.revision === null || ordinal(value.revision))
    || !choice(value.basis, ['confirmed_prescription', 'reported_work', 'legacy_unknown', 'estimated_work'])
    || !text(value.origin, 100) || !text(value.reviewState, 100) || value.match !== 'same_workout_and_movement_context_only'
    || value.completionState !== 'not_independently_verified' || !strings(value.limitations) || !json(value.equipment) || !json(value.unilateralConvention)) return false
  const q = value.quantities, p = value.quantityProvenance, effort = value.sessionEffort, weight = value.recordedWeight
  if (!object(q) || !fields(q, ['sets', 'repetitions', 'load', 'loadUnit', 'durationMinutes']) || !quantity(q.sets, true)
    || !quantity(q.repetitions, true) || !quantity(q.load) || !quantity(q.durationMinutes)
    || !(q.loadUnit === null || choice(q.loadUnit, ['kg', 'lb'])) || !object(p)
    || !fields(p, ['sets', 'repetitions', 'load', 'durationMinutes']) || !Object.values(p).every(provenance)) return false
  if (weight !== null && (!object(weight) || !fields(weight, ['value', 'sourcePath', 'origin', 'reviewState'])
    || !json(weight.value) || !text(weight.sourcePath) || !text(weight.origin, 100) || !text(weight.reviewState, 100))) return false
  if (!object(effort) || !fields(effort, ['scale', 'scope', 'sourcePath', 'value', 'recordedValue', 'status', 'origin', 'reviewState'])
    || effort.scale !== 'RPE' || effort.scope !== 'session' || effort.sourcePath !== 'rpe'
    || !choice(effort.status, ['recorded', 'unknown', 'invalid']) || !text(effort.origin, 100) || !text(effort.reviewState, 100) || !json(effort.recordedValue)) return false
  if (effort.status === 'recorded') {
    if (typeof effort.value !== 'number' || !Number.isFinite(effort.value) || effort.value < 1 || effort.value > 10 || effort.recordedValue !== effort.value) return false
  } else if (effort.value !== null || (effort.status === 'unknown' && effort.recordedValue !== null)) return false
  return json(value.protocol) && json(value.effort)
}

function observation(value: unknown, complete: boolean, asOf: string): boolean {
  if (!object(value) || !fields(value, ['observationId', 'seriesId', 'metricId', 'semanticRole', 'protocol', 'comparabilityKey', 'workoutId', 'movementId',
    'readingIds', 'readings', 'observedReadings', 'counts', 'sensorCoverage', 'workingEvidence', 'interpretation', 'limitations'])
    || !text(value.observationId) || !text(value.seriesId, 4_000) || !text(value.metricId, 200)
    || !choice(value.semanticRole, ['estimate', 'proxy', 'training_signal', 'direct_outcome']) || !object(value.protocol)
    || !fields(value.protocol, ['id', 'version']) || !text(value.protocol.id, 200) || !text(value.protocol.version, 100)
    || !text(value.comparabilityKey, 2_000) || !nullableText(value.workoutId) || !nullableText(value.movementId)
    || !strings(value.readingIds, 160) || value.readingIds.length < 1 || new Set(value.readingIds).size !== value.readingIds.length
    || value.observedReadings !== value.readingIds.length || !object(value.counts)
    || !fields(value.counts, ['expectedSensorReadings', 'performedRepetitions', 'status', 'source'])
    || !nullableCount(value.counts.expectedSensorReadings) || !nullableCount(value.counts.performedRepetitions)
    || !choice(value.counts.status, ['reported', 'unknown', 'conflicting_or_invalid'])
    || !choice(value.sensorCoverage, ['reported_complete', 'reported_incomplete', 'conflicting', 'unknown'])
    || !Array.isArray(value.workingEvidence) || value.workingEvidence.length > 160
    || !value.workingEvidence.every(work => working(work, value.workoutId, value.movementId))
    || value.interpretation !== 'review_required' || !strings(value.limitations)) return false
  if (!Array.isArray(value.readings) || value.readings.length < 1 || value.readings.length > 160 || !value.readings.every(reading => object(reading)
    && fields(reading, ['id', 'value', 'unit', 'ordinal', 'observedAt', 'sourceVerification', 'valueProvenance'])
    && text(reading.id) && typeof reading.value === 'number' && Number.isFinite(reading.value) && text(reading.unit, 100) && ordinal(reading.ordinal)
    && typeof reading.observedAt === 'string' && Number.isFinite(Date.parse(reading.observedAt)) && Date.parse(reading.observedAt) <= Date.parse(asOf)
    && choice(reading.sourceVerification, ['athlete_confirmed', 'system_verified'])
    && (reading.valueProvenance === null || (object(reading.valueProvenance) && json(reading.valueProvenance))))) return false
  const readingIds = value.readings.map(reading => object(reading) ? reading.id : null)
  if (JSON.stringify([...new Set(readingIds)]) !== JSON.stringify(value.readingIds)) return false
  if (new Set(readingIds).size !== readingIds.length && value.sensorCoverage !== 'conflicting') return false
  const reported = reportedMeasurementCounts(value.readings.map(reading => ({
    valueProvenance: object(reading) && object(reading.valueProvenance) ? reading.valueProvenance : null
  })))
  if (reported.status !== value.counts.status || reported.source !== value.counts.source
    || reported.expectedSensorReadings !== value.counts.expectedSensorReadings
    || reported.performedRepetitions !== value.counts.performedRepetitions) return false
  const expected = value.counts.expectedSensorReadings
  if (value.counts.status === 'reported') {
    if (value.counts.source !== 'value_provenance.measurementCoverage') return false
  } else if (value.counts.source !== null || expected !== null || value.counts.performedRepetitions !== null) return false
  if (value.sensorCoverage === 'reported_complete' && (!complete || expected !== value.observedReadings)) return false
  if (value.sensorCoverage === 'reported_incomplete' && (!complete || typeof expected !== 'number' || expected <= value.readingIds.length)) return false
  if (value.sensorCoverage === 'unknown' && complete && expected !== null) return false
  if (value.counts.status === 'conflicting_or_invalid' && value.sensorCoverage !== 'conflicting') return false
  return true
}

function valid(value: unknown, userId: string, asOf: string): value is SignalEvidenceContext {
  if (!object(value) || !fields(value, ['version', 'authority', 'numericPolicyEligible', 'userId', 'asOf', 'coverage', 'observations', 'limitations'])
    || value.version !== 'signal-evidence-context-1' || value.authority !== 'factual_review_context_only' || value.numericPolicyEligible !== false
    || !userId || value.userId !== userId || value.asOf !== asOf || !Number.isFinite(Date.parse(asOf)) || !object(value.coverage)
    || !fields(value.coverage, ['measurementRetrievalComplete', 'performedWork', 'projectionComplete', 'omittedObservations'])
    || typeof value.coverage.measurementRetrievalComplete !== 'boolean' || typeof value.coverage.projectionComplete !== 'boolean'
    || !choice(value.coverage.performedWork, ['not_supplied', 'unavailable', 'partial', 'available', 'no_records'])
    || !count(value.coverage.omittedObservations) || value.coverage.projectionComplete !== (value.coverage.omittedObservations === 0)
    || !Array.isArray(value.observations) || value.observations.length > 160
    || !strings(value.limitations)) return false
  const measurementRetrievalComplete = value.coverage.measurementRetrievalComplete
  if (!value.observations.every(item => observation(item, measurementRetrievalComplete, asOf))) return false
  const identities = value.observations.map(item => object(item) ? `${item.seriesId}|${item.observationId}` : '')
  return new Set(identities).size === identities.length && value.observations.reduce((size, item) => size + JSON.stringify(item).length, 0) <= 12_000
}

/** Historical facts only; malformed or foreign records cannot enter shared chat readback. */
export function decodeSignalEvidenceContext(value: unknown, userId: string, asOf: string): SignalEvidenceContext | null {
  try {
    if (JSON.stringify(value).length > 16_000 || !json(value) || !valid(value, userId, asOf)) return null
    return structuredClone(value)
  } catch { return null }
}
