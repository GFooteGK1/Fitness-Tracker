import {
  ADAPTIVE_ASSESSMENT_CATALOG_VERSION,
  ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
  METRIC_UNITS,
  buildObservationComparabilityKey,
  validatePerformanceObservation,
  type EvidenceSemanticRole,
  type MetricUnit,
  type PerformanceMetricId,
  type PerformanceObservation,
  type PerformanceObservationKind
} from './adaptive-programming-contracts'
import {
  validateCoachSessionCheckinInput,
  type CoachSessionCheckinInput
} from './execution-feedback'

export const ATOMIC_SESSION_RESULT_CONTRACT_VERSION = 2 as const
export const ATOMIC_SESSION_RESULT_PARSER_VERSION = 'session-result-v2' as const

export interface AtomicPerformedWork {
  mode: 'as_prescribed' | 'modified'
  workoutDate: string
  inputText: string | null
  blocks: Record<string, unknown>[] | null
  totalDurationMinutes: number | null
}

export interface AtomicSessionObservation {
  clientId: string
  kind: PerformanceObservationKind
  semanticRole: EvidenceSemanticRole
  observedAt: string
  assessmentDefinition: { id: string; version: string }
  assessmentCatalogVersion: typeof ADAPTIVE_ASSESSMENT_CATALOG_VERSION
  protocol: { id: string; version: string }
  metric: { metricId: PerformanceMetricId; value: number; unit: MetricUnit }
  sourceDeviceId: string | null
  comparison: PerformanceObservation['comparison']
  comparabilityKey: string
  metadata: Record<string, unknown>
}

export interface AtomicSessionCompletionInput {
  contractVersion: typeof ATOMIC_SESSION_RESULT_CONTRACT_VERSION
  status: 'completed' | 'skipped'
  feedback: CoachSessionCheckinInput
  performedWork: AtomicPerformedWork | null
  observations: AtomicSessionObservation[]
}

export type AtomicSessionCompletionValidation =
  | { ok: true; value: AtomicSessionCompletionInput }
  | { ok: false; errors: string[] }

export function validateAtomicSessionCompletionInput(
  value: unknown
): AtomicSessionCompletionValidation {
  if (!isRecord(value)) {
    return { ok: false, errors: ['Atomic session result must be an object'] }
  }

  const errors: string[] = []
  if (value.contractVersion !== ATOMIC_SESSION_RESULT_CONTRACT_VERSION) {
    errors.push('Atomic session result contract version is unsupported')
  }

  const checkinValidation = validateCoachSessionCheckinInput(value.feedback)
  if (!checkinValidation.ok) {
    errors.push(...checkinValidation.errors)
    return { ok: false, errors: unique(errors) }
  }

  const feedback = checkinValidation.value
  const status = feedback.outcome === 'skipped' ? 'skipped' : 'completed'
  const performedWork = normalizePerformedWork(value.performedWork, feedback, errors)
  const observations = normalizeObservations(value.observations, feedback.occurredAt, errors)

  if (status === 'skipped') {
    if (value.performedWork !== null) {
      errors.push('Skipped sessions cannot include performed work')
    }
    if (observations.length > 0) {
      errors.push('Skipped sessions cannot include performed-session observations')
    }
  } else if (!performedWork) {
    errors.push('Completed sessions need performed work confirmation')
  }

  if (errors.length > 0) return { ok: false, errors: unique(errors) }

  return {
    ok: true,
    value: {
      contractVersion: ATOMIC_SESSION_RESULT_CONTRACT_VERSION,
      status,
      feedback,
      performedWork,
      observations
    }
  }
}

function normalizePerformedWork(
  value: unknown,
  feedback: CoachSessionCheckinInput,
  errors: string[]
): AtomicPerformedWork | null {
  if (feedback.outcome === 'skipped') return null
  if (!isRecord(value)) {
    errors.push('Completed sessions need performed work details')
    return null
  }

  const mode = value.mode === 'as_prescribed' || value.mode === 'modified'
    ? value.mode
    : null
  const workoutDate = typeof value.workoutDate === 'string' ? value.workoutDate : ''
  const inputText = value.inputText === null || value.inputText === undefined
    ? null
    : typeof value.inputText === 'string'
      ? value.inputText.trim() || null
      : undefined
  const totalDurationMinutes = value.totalDurationMinutes === null
    || value.totalDurationMinutes === undefined
    ? null
    : typeof value.totalDurationMinutes === 'number'
      ? value.totalDurationMinutes
      : Number.NaN

  if (!mode) errors.push('Performed work mode must be as_prescribed or modified')
  if (!isIsoDate(workoutDate)) errors.push('Workout date must be YYYY-MM-DD')
  if (
    totalDurationMinutes !== null
    && (
      !Number.isInteger(totalDurationMinutes)
      || totalDurationMinutes < 1
      || totalDurationMinutes > 1440
    )
  ) {
    errors.push('Workout duration must be 1 through 1440 minutes')
  }
  if (inputText === undefined) errors.push('Performed work summary must be text')
  if (typeof inputText === 'string' && inputText.length > 5000) {
    errors.push('Performed work summary must be 5000 characters or fewer')
  }

  if (mode === 'as_prescribed') {
    if (feedback.outcome !== 'as_planned') {
      errors.push('Only an as-planned result can copy the prescribed work')
    }
    if (value.blocks !== null && value.blocks !== undefined) {
      errors.push('As-prescribed completion must not submit replacement blocks')
    }
    if (inputText !== null) {
      errors.push('As-prescribed completion must not reinterpret the workout summary')
    }
  }

  let blocks: Record<string, unknown>[] | null = null
  if (mode === 'modified') {
    if (feedback.outcome !== 'modified' && feedback.outcome !== 'stopped_early') {
      errors.push('Modified work needs a modified or stopped-early result')
    }
    if (!Array.isArray(value.blocks) || value.blocks.some(block => !isRecord(block))) {
      errors.push('Modified work blocks must be an array of objects')
    } else if (jsonSize(value.blocks) > 100_000) {
      errors.push('Modified work blocks are too large')
    } else {
      blocks = value.blocks as Record<string, unknown>[]
    }
    if (!inputText || inputText.length < 3) {
      errors.push('Modified work needs a concise actual-work summary')
    }
  }

  if (!mode || !isIsoDate(workoutDate) || inputText === undefined) return null
  return { mode, workoutDate, inputText, blocks, totalDurationMinutes }
}

function normalizeObservations(
  value: unknown,
  capturedAt: string,
  errors: string[]
): AtomicSessionObservation[] {
  if (!Array.isArray(value)) {
    errors.push('Atomic session observations must be an array')
    return []
  }
  if (value.length > 20) {
    errors.push('A session result can include at most 20 observations')
    return []
  }

  const observations: AtomicSessionObservation[] = []
  const clientIds = new Set<string>()
  for (const [index, candidate] of value.entries()) {
    const normalized = normalizeObservation(candidate, capturedAt, index, errors)
    if (!normalized) continue
    if (clientIds.has(normalized.clientId)) {
      errors.push(`Observation ${index + 1} repeats clientId ${normalized.clientId}`)
      continue
    }
    clientIds.add(normalized.clientId)
    observations.push(normalized)
  }
  return observations
}

function normalizeObservation(
  value: unknown,
  capturedAt: string,
  index: number,
  errors: string[]
): AtomicSessionObservation | null {
  const label = `Observation ${index + 1}`
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`)
    return null
  }

  const assessment = isRecord(value.assessmentDefinition)
    ? value.assessmentDefinition
    : {}
  const protocol = isRecord(value.protocol) ? value.protocol : {}
  const metric = isRecord(value.metric) ? value.metric : {}
  const comparison = normalizeComparison(value.comparison, label, errors)
  const metadata = value.metadata === undefined ? {} : value.metadata
  const clientId = typeof value.clientId === 'string' ? value.clientId.trim() : ''
  const observedAt = typeof value.observedAt === 'string' ? value.observedAt : ''
  const sourceDeviceId = value.sourceDeviceId === null || value.sourceDeviceId === undefined
    ? null
    : typeof value.sourceDeviceId === 'string'
      ? value.sourceDeviceId.trim()
      : ''

  if (!isStableId(clientId) || clientId.length > 80) {
    errors.push(`${label} needs a stable clientId of 80 characters or fewer`)
  }
  if (!isIsoTimestamp(observedAt) || Date.parse(observedAt) > Date.parse(capturedAt)) {
    errors.push(`${label} time must be an ISO timestamp no later than session completion`)
  }
  if (sourceDeviceId !== null && (!isStableId(sourceDeviceId) || sourceDeviceId.length > 120)) {
    errors.push(`${label} source device must be a stable identifier`)
  }
  if (!isRecord(metadata) || jsonSize(metadata) > 10_000) {
    errors.push(`${label} metadata must be a small object`)
  }

  const observation: PerformanceObservation = {
    schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
    id: `session-observation:${clientId || index + 1}`,
    kind: value.kind as PerformanceObservationKind,
    semanticRole: value.semanticRole as EvidenceSemanticRole,
    status: 'complete',
    metric: {
      metricId: metric.metricId as PerformanceMetricId,
      value: metric.value as number,
      unit: metric.unit as MetricUnit
    },
    observedAt,
    capturedAt,
    assessmentDefinition: {
      id: String(assessment.id ?? ''),
      version: String(assessment.version ?? '')
    },
    protocol: {
      id: String(protocol.id ?? ''),
      version: String(protocol.version ?? '')
    },
    source: {
      kind: 'coach_completion',
      system: 'sociusfit',
      recordId: clientId || `observation-${index + 1}`,
      fingerprint: `session-result:${clientId || index + 1}`,
      deviceId: sourceDeviceId
    },
    comparison,
    completion: { missingFields: [] },
    exclusion: null,
    supersededByObservationId: null,
    derivedFromObservationIds: []
  }

  const validation = validatePerformanceObservation(observation)
  if (!validation.ok) errors.push(...validation.errors.map(error => `${label}: ${error}`))
  if (observation.metric?.metricId === 'session.rpe') {
    errors.push(`${label}: Session RPE comes from the session check-in and must not be duplicated`)
  }
  const comparability = buildObservationComparabilityKey(observation)
  if (!comparability.ok) return null
  if (!validation.ok || !clientId || !isRecord(metadata)) return null

  return {
    clientId,
    kind: observation.kind,
    semanticRole: observation.semanticRole as EvidenceSemanticRole,
    observedAt,
    assessmentDefinition: observation.assessmentDefinition,
    assessmentCatalogVersion: ADAPTIVE_ASSESSMENT_CATALOG_VERSION,
    protocol: observation.protocol,
    metric: observation.metric as AtomicSessionObservation['metric'],
    sourceDeviceId,
    comparison,
    comparabilityKey: comparability.key,
    metadata
  }
}

function normalizeComparison(
  value: unknown,
  label: string,
  errors: string[]
): PerformanceObservation['comparison'] {
  const source = isRecord(value) ? value : {}
  if (!isRecord(value)) errors.push(`${label} comparison context must be an object`)

  return {
    movementId: nullableStableId(source.movementId, `${label} movement`, errors),
    variationId: nullableStableId(source.variationId, `${label} variation`, errors),
    repetitions: nullablePositiveInteger(source.repetitions, `${label} repetitions`, errors),
    externalLoad: nullableQuantity(source.externalLoad, `${label} external load`, errors),
    distance: nullableQuantity(source.distance, `${label} distance`, errors),
    duration: nullableQuantity(source.duration, `${label} duration`, errors),
    equipmentIds: stableIdArray(source.equipmentIds, `${label} equipment`, errors),
    techniqueModifiers: stableIdArray(
      source.techniqueModifiers,
      `${label} technique modifiers`,
      errors
    ),
    environmentModifiers: stableIdArray(
      source.environmentModifiers,
      `${label} environment modifiers`,
      errors
    )
  }
}

function nullableStableId(value: unknown, label: string, errors: string[]): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !isStableId(value.trim())) {
    errors.push(`${label} must be a stable identifier`)
    return null
  }
  return value.trim()
}

function nullablePositiveInteger(value: unknown, label: string, errors: string[]): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isInteger(value) || Number(value) <= 0) {
    errors.push(`${label} must be a positive integer`)
    return null
  }
  return Number(value)
}

function nullableQuantity(
  value: unknown,
  label: string,
  errors: string[]
): { value: number; unit: MetricUnit } | null {
  if (value === null || value === undefined) return null
  if (
    !isRecord(value)
    || typeof value.value !== 'number'
    || !Number.isFinite(value.value)
    || value.value < 0
    || !METRIC_UNITS.includes(value.unit as MetricUnit)
  ) {
    errors.push(`${label} must have a non-negative value and supported unit`)
    return null
  }
  return { value: value.value, unit: value.unit as MetricUnit }
}

function stableIdArray(value: unknown, label: string, errors: string[]): string[] {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`)
    return []
  }
  const normalized = value.map(item => typeof item === 'string' ? item.trim() : '')
  if (
    normalized.some(item => !isStableId(item))
    || new Set(normalized).size !== normalized.length
  ) {
    errors.push(`${label} must contain unique stable identifiers`)
  }
  return normalized.filter(isStableId)
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

function isIsoTimestamp(value: string): boolean {
  if (!value || Number.isNaN(Date.parse(value))) return false
  return new Date(value).toISOString() === value
}

function isStableId(value: string): boolean {
  return /^[a-z0-9][a-z0-9._:-]*$/i.test(value)
}

function jsonSize(value: unknown): number {
  try {
    return JSON.stringify(value).length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}
