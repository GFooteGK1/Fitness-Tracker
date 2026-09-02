export const ADAPTIVE_PROGRAMMING_SCHEMA_VERSION = 1 as const
export const ADAPTIVE_ASSESSMENT_CATALOG_VERSION = '0.2.0' as const
export const ADAPTIVE_EVIDENCE_POLICY_VERSION = '0.1.0' as const
export const COMPARABILITY_KEY_VERSION = 'comparison-v1' as const

export const OBSERVATION_SEMANTIC_ROLES = [
  'target',
  'estimate',
  'proxy',
  'training_signal',
  'direct_outcome'
] as const

export const TRAINABLE_QUALITY_IDS = [
  'maximal_strength',
  'strength_endurance',
  'explosive_strength',
  'acceleration',
  'max_velocity',
  'change_of_direction',
  'jump_performance',
  'aerobic_endurance',
  'anaerobic_work_capacity',
  'movement_skill',
  'tissue_capacity',
  'recovery_capacity',
  'training_adherence'
] as const

export const TRAINING_EMPHASIS_STATES = [
  'priority_development',
  'development',
  'maintenance',
  'deemphasized',
  'recovery'
] as const

export const ADAPTATION_ACTIONS = [
  'continue',
  'progress',
  'maintain',
  'redirect',
  'recover',
  'hold_collect_more',
  'pause_review'
] as const

export const EVIDENCE_STATUSES = [
  'insufficient',
  'emerging',
  'supported',
  'contradicted',
  'invalidated',
  'excluded'
] as const

export const PERFORMANCE_METRIC_IDS = [
  'strength.load',
  'strength.repetitions',
  'strength.estimated_1rm',
  'bar.mean_velocity',
  'jump.height',
  'sprint.time',
  'run.time',
  'readiness.score',
  'session.rpe',
  'session.duration',
  'recovery.hrv'
] as const

export const METRIC_UNITS = [
  'kg',
  'lb',
  'm',
  'cm',
  'in',
  'km',
  'mi',
  's',
  'ms',
  'min',
  'm_per_s',
  'km_per_h',
  's_per_m',
  'min_per_km',
  'min_per_mile',
  'repetitions',
  'score',
  'percent',
  'watts',
  'bpm'
] as const

export const PERFORMANCE_OBSERVATION_KINDS = [
  'strength_set',
  'jump_attempt',
  'sprint_attempt',
  'run_attempt',
  'readiness_check',
  'session_outcome'
] as const

export const OBSERVATION_STATUSES = [
  'complete',
  'incomplete',
  'excluded',
  'superseded'
] as const

export const OBSERVATION_SOURCE_KINDS = [
  'manual',
  'coach_completion',
  'import',
  'whoop',
  'device',
  'derived'
] as const

export type ObservationSemanticRole = typeof OBSERVATION_SEMANTIC_ROLES[number]
export type EvidenceSemanticRole = Exclude<ObservationSemanticRole, 'target'>
export type TrainableQualityId = typeof TRAINABLE_QUALITY_IDS[number]
export type TrainingEmphasisState = typeof TRAINING_EMPHASIS_STATES[number]
export type AdaptationAction = typeof ADAPTATION_ACTIONS[number]
export type EvidenceStatus = typeof EVIDENCE_STATUSES[number]
export type PerformanceMetricId = typeof PERFORMANCE_METRIC_IDS[number]
export type MetricUnit = typeof METRIC_UNITS[number]

export interface TrainableQualityDefinition {
  id: TrainableQualityId
  label: string
  description: string
}

export const TRAINABLE_QUALITY_DEFINITIONS: readonly TrainableQualityDefinition[] = [
  {
    id: 'maximal_strength',
    label: 'Maximal strength',
    description: 'Produce high force against a heavy external resistance.'
  },
  {
    id: 'strength_endurance',
    label: 'Strength endurance',
    description: 'Repeat force production while preserving useful technique.'
  },
  {
    id: 'explosive_strength',
    label: 'Explosive strength',
    description: 'Produce force quickly while preserving movement quality.'
  },
  {
    id: 'acceleration',
    label: 'Acceleration',
    description: 'Increase locomotor speed efficiently from a low starting speed.'
  },
  {
    id: 'max_velocity',
    label: 'Maximum velocity',
    description: 'Reach and preserve high locomotor speed with controlled mechanics.'
  },
  {
    id: 'change_of_direction',
    label: 'Change of direction',
    description: 'Decelerate, reposition, and accelerate in a new direction.'
  },
  {
    id: 'jump_performance',
    label: 'Jump performance',
    description: 'Express lower-body impulse in a standardized jump task.'
  },
  {
    id: 'aerobic_endurance',
    label: 'Aerobic endurance',
    description: 'Sustain and recover repeated work through aerobic energy supply.'
  },
  {
    id: 'anaerobic_work_capacity',
    label: 'Anaerobic work capacity',
    description: 'Sustain high-output work when rapid energy demand exceeds aerobic supply.'
  },
  {
    id: 'movement_skill',
    label: 'Movement skill',
    description: 'Perform a task consistently with the intended coordination and technique.'
  },
  {
    id: 'tissue_capacity',
    label: 'Tissue capacity',
    description: 'Tolerate the planned exposure to load, impact, and range of motion.'
  },
  {
    id: 'recovery_capacity',
    label: 'Recovery capacity',
    description: 'Recover sufficiently between exposures to preserve training quality.'
  },
  {
    id: 'training_adherence',
    label: 'Training adherence',
    description: 'Complete the intended training pattern consistently over time.'
  }
]

type UnitDimension =
  | 'mass'
  | 'length'
  | 'duration'
  | 'speed'
  | 'pace'
  | 'count'
  | 'scalar'
  | 'power'
  | 'heart_rate'

interface UnitDefinition {
  dimension: UnitDimension
  canonicalUnit: MetricUnit
  toCanonical: (value: number) => number
}

const UNIT_DEFINITIONS: Readonly<Record<MetricUnit, UnitDefinition>> = {
  kg: { dimension: 'mass', canonicalUnit: 'kg', toCanonical: value => value },
  lb: { dimension: 'mass', canonicalUnit: 'kg', toCanonical: value => value * 0.45359237 },
  m: { dimension: 'length', canonicalUnit: 'm', toCanonical: value => value },
  cm: { dimension: 'length', canonicalUnit: 'm', toCanonical: value => value / 100 },
  in: { dimension: 'length', canonicalUnit: 'm', toCanonical: value => value * 0.0254 },
  km: { dimension: 'length', canonicalUnit: 'm', toCanonical: value => value * 1000 },
  mi: { dimension: 'length', canonicalUnit: 'm', toCanonical: value => value * 1609.344 },
  s: { dimension: 'duration', canonicalUnit: 's', toCanonical: value => value },
  ms: { dimension: 'duration', canonicalUnit: 's', toCanonical: value => value / 1000 },
  min: { dimension: 'duration', canonicalUnit: 's', toCanonical: value => value * 60 },
  m_per_s: { dimension: 'speed', canonicalUnit: 'm_per_s', toCanonical: value => value },
  km_per_h: { dimension: 'speed', canonicalUnit: 'm_per_s', toCanonical: value => value / 3.6 },
  s_per_m: { dimension: 'pace', canonicalUnit: 's_per_m', toCanonical: value => value },
  min_per_km: {
    dimension: 'pace',
    canonicalUnit: 's_per_m',
    toCanonical: value => value * 60 / 1000
  },
  min_per_mile: {
    dimension: 'pace',
    canonicalUnit: 's_per_m',
    toCanonical: value => value * 60 / 1609.344
  },
  repetitions: {
    dimension: 'count',
    canonicalUnit: 'repetitions',
    toCanonical: value => value
  },
  score: { dimension: 'scalar', canonicalUnit: 'score', toCanonical: value => value },
  percent: { dimension: 'scalar', canonicalUnit: 'percent', toCanonical: value => value },
  watts: { dimension: 'power', canonicalUnit: 'watts', toCanonical: value => value },
  bpm: { dimension: 'heart_rate', canonicalUnit: 'bpm', toCanonical: value => value }
}

export interface MetricDefinition {
  id: PerformanceMetricId
  dimension: UnitDimension
  canonicalUnit: MetricUnit
  allowedUnits: readonly MetricUnit[]
  direction: 'higher_is_better' | 'lower_is_better' | 'context_only'
  integer: boolean
}

export const METRIC_DEFINITIONS: Readonly<Record<PerformanceMetricId, MetricDefinition>> = {
  'strength.load': metric('strength.load', 'mass', 'kg', ['kg', 'lb'], 'higher_is_better'),
  'strength.repetitions': metric(
    'strength.repetitions',
    'count',
    'repetitions',
    ['repetitions'],
    'higher_is_better',
    true
  ),
  'strength.estimated_1rm': metric(
    'strength.estimated_1rm',
    'mass',
    'kg',
    ['kg', 'lb'],
    'higher_is_better'
  ),
  'bar.mean_velocity': metric(
    'bar.mean_velocity',
    'speed',
    'm_per_s',
    ['m_per_s', 'km_per_h'],
    'higher_is_better'
  ),
  'jump.height': metric('jump.height', 'length', 'm', ['m', 'cm', 'in'], 'higher_is_better'),
  'sprint.time': metric('sprint.time', 'duration', 's', ['s', 'ms'], 'lower_is_better'),
  'run.time': metric('run.time', 'duration', 's', ['s', 'min'], 'lower_is_better'),
  'readiness.score': metric('readiness.score', 'scalar', 'score', ['score'], 'context_only'),
  'session.rpe': metric('session.rpe', 'scalar', 'score', ['score'], 'context_only'),
  'session.duration': metric('session.duration', 'duration', 's', ['s', 'min'], 'context_only'),
  'recovery.hrv': metric('recovery.hrv', 'duration', 's', ['ms'], 'context_only')
}

export type AssessmentFamily = 'strength' | 'jump' | 'sprint' | 'run' | 'readiness' | 'session'
export type PerformanceObservationKind = typeof PERFORMANCE_OBSERVATION_KINDS[number]

export type ComparabilityDimension =
  | 'movement'
  | 'variation'
  | 'repetitions'
  | 'external_load'
  | 'distance'
  | 'duration'
  | 'equipment'
  | 'source'
  | 'technique_modifiers'
  | 'environment_modifiers'

export interface AssessmentDefinition {
  id: string
  version: string
  name: string
  family: AssessmentFamily
  qualityIds: readonly TrainableQualityId[]
  observationKind: PerformanceObservationKind
  primaryMetricId: PerformanceMetricId
  allowedSemanticRoles: readonly EvidenceSemanticRole[]
  allowedUnits: readonly MetricUnit[]
  valueRange: { min: number; max: number | null }
  protocol: {
    id: string
    version: string
    comparabilityDimensions: readonly ComparabilityDimension[]
  }
}

export const ADAPTIVE_ASSESSMENT_DEFINITIONS: readonly AssessmentDefinition[] = [
  assessment({
    id: 'strength.repetition_max',
    name: 'Repetition maximum strength assessment',
    family: 'strength',
    qualityIds: ['maximal_strength'],
    observationKind: 'strength_set',
    primaryMetricId: 'strength.load',
    allowedSemanticRoles: ['direct_outcome'],
    allowedUnits: ['kg', 'lb'],
    valueRange: { min: 0.1, max: null },
    protocolId: 'strength-repetition-max-standard',
    comparabilityDimensions: [
      'movement',
      'variation',
      'repetitions',
      'equipment',
      'source',
      'technique_modifiers'
    ]
  }),
  assessment({
    id: 'strength.repetition_capacity',
    name: 'Fixed-load strength repetition capacity',
    family: 'strength',
    qualityIds: ['strength_endurance'],
    observationKind: 'strength_set',
    primaryMetricId: 'strength.repetitions',
    allowedSemanticRoles: ['direct_outcome', 'training_signal'],
    allowedUnits: ['repetitions'],
    valueRange: { min: 0, max: null },
    protocolId: 'strength-repetition-capacity-standard',
    comparabilityDimensions: [
      'movement',
      'variation',
      'external_load',
      'duration',
      'equipment',
      'source',
      'technique_modifiers'
    ]
  }),
  assessment({
    id: 'strength.fixed_load_velocity',
    name: 'Fixed-load bar velocity assessment',
    family: 'strength',
    qualityIds: ['maximal_strength', 'explosive_strength'],
    observationKind: 'strength_set',
    primaryMetricId: 'bar.mean_velocity',
    allowedSemanticRoles: ['training_signal', 'direct_outcome'],
    allowedUnits: ['m_per_s'],
    valueRange: { min: 0.01, max: 5 },
    protocolId: 'qwik-video-vbt-fixed-load',
    comparabilityDimensions: [
      'movement',
      'variation',
      'external_load',
      'equipment',
      'source',
      'technique_modifiers'
    ]
  }),
  assessment({
    id: 'strength.estimated_one_rep_max',
    name: 'Estimated one-repetition maximum',
    family: 'strength',
    qualityIds: ['maximal_strength'],
    observationKind: 'strength_set',
    primaryMetricId: 'strength.estimated_1rm',
    allowedSemanticRoles: ['estimate'],
    allowedUnits: ['kg', 'lb'],
    valueRange: { min: 0.1, max: null },
    protocolId: 'epley-estimated-one-rep-max',
    comparabilityDimensions: [
      'movement',
      'variation',
      'equipment',
      'source',
      'technique_modifiers'
    ]
  }),
  assessment({
    id: 'jump.height',
    name: 'Jump height assessment',
    family: 'jump',
    qualityIds: ['explosive_strength', 'jump_performance'],
    observationKind: 'jump_attempt',
    primaryMetricId: 'jump.height',
    allowedSemanticRoles: ['direct_outcome'],
    allowedUnits: ['m', 'cm', 'in'],
    valueRange: { min: 0, max: 2 },
    protocolId: 'jump-height-standard',
    comparabilityDimensions: ['movement', 'equipment', 'source', 'technique_modifiers']
  }),
  assessment({
    id: 'sprint.time',
    name: 'Sprint time assessment',
    family: 'sprint',
    qualityIds: ['acceleration', 'max_velocity'],
    observationKind: 'sprint_attempt',
    primaryMetricId: 'sprint.time',
    allowedSemanticRoles: ['direct_outcome'],
    allowedUnits: ['s', 'ms'],
    valueRange: { min: 0.01, max: null },
    protocolId: 'sprint-time-standard',
    comparabilityDimensions: [
      'distance',
      'source',
      'technique_modifiers',
      'environment_modifiers'
    ]
  }),
  assessment({
    id: 'run.time_trial',
    name: 'Run time-trial assessment',
    family: 'run',
    qualityIds: ['aerobic_endurance', 'anaerobic_work_capacity'],
    observationKind: 'run_attempt',
    primaryMetricId: 'run.time',
    allowedSemanticRoles: ['direct_outcome'],
    allowedUnits: ['s', 'min'],
    valueRange: { min: 0.01, max: null },
    protocolId: 'run-time-trial-standard',
    comparabilityDimensions: ['distance', 'equipment', 'source', 'environment_modifiers']
  }),
  assessment({
    id: 'readiness.self_report',
    name: 'Daily readiness self-report',
    family: 'readiness',
    qualityIds: ['recovery_capacity'],
    observationKind: 'readiness_check',
    primaryMetricId: 'readiness.score',
    allowedSemanticRoles: ['proxy', 'training_signal'],
    allowedUnits: ['score'],
    valueRange: { min: 1, max: 5 },
    protocolId: 'daily-readiness-five-point',
    comparabilityDimensions: ['source']
  }),
  assessment({
    id: 'session.rpe',
    name: 'Session rating of perceived exertion',
    family: 'session',
    qualityIds: ['recovery_capacity', 'training_adherence'],
    observationKind: 'session_outcome',
    primaryMetricId: 'session.rpe',
    allowedSemanticRoles: ['training_signal'],
    allowedUnits: ['score'],
    valueRange: { min: 1, max: 10 },
    protocolId: 'session-rpe-ten-point',
    comparabilityDimensions: ['source']
  })
]

export interface MeasurementQuantity {
  value: number
  unit: MetricUnit
}

export interface MetricValue extends MeasurementQuantity {
  metricId: PerformanceMetricId
}

export interface NormalizedMetricValue extends MetricValue {}

export type ObservationStatus = typeof OBSERVATION_STATUSES[number]
export type ObservationSourceKind = typeof OBSERVATION_SOURCE_KINDS[number]
export type ObservationExclusionReason =
  | 'protocol_deviation'
  | 'incomplete_capture'
  | 'device_error'
  | 'duplicate'
  | 'athlete_correction'
  | 'not_comparable'
  | 'other'

export interface PerformanceObservation {
  schemaVersion: typeof ADAPTIVE_PROGRAMMING_SCHEMA_VERSION
  id: string
  kind: PerformanceObservationKind
  semanticRole: ObservationSemanticRole
  status: ObservationStatus
  metric: MetricValue | null
  observedAt: string
  capturedAt: string
  assessmentDefinition: { id: string; version: string }
  protocol: { id: string; version: string }
  source: {
    kind: ObservationSourceKind
    system: string
    recordId: string
    fingerprint: string
    deviceId: string | null
  }
  comparison: {
    movementId: string | null
    variationId: string | null
    repetitions: number | null
    externalLoad: MeasurementQuantity | null
    distance: MeasurementQuantity | null
    duration: MeasurementQuantity | null
    equipmentIds: string[]
    techniqueModifiers: string[]
    environmentModifiers: string[]
  }
  completion: { missingFields: string[] }
  exclusion: { reason: ObservationExclusionReason; note: string | null } | null
  supersededByObservationId: string | null
  derivedFromObservationIds: string[]
}

export type TrainingGoalKind = 'performance_outcome' | 'capacity' | 'skill' | 'process' | 'maintenance'
export type TrainingGoalPriority = 'primary' | 'secondary'

export interface TrainingGoal {
  schemaVersion: typeof ADAPTIVE_PROGRAMMING_SCHEMA_VERSION
  id: string
  kind: TrainingGoalKind
  statement: string
  priority: TrainingGoalPriority
  status: 'active' | 'achieved' | 'paused' | 'superseded'
  target: {
    role: 'target'
    comparison: 'at_least' | 'at_most' | 'range'
    metric: MetricValue
    upperMetric?: MetricValue
    assessmentDefinition: { id: string; version: string }
    protocol: { id: string; version: string }
  } | null
  targetDate: string | null
  requiredQualityIds: TrainableQualityId[]
  source: { kind: 'athlete_confirmed'; confirmedAt: string }
}

export interface ProgrammingHypothesis {
  schemaVersion: typeof ADAPTIVE_PROGRAMMING_SCHEMA_VERSION
  id: string
  goalId: string
  status: 'proposed' | 'accepted' | 'superseded'
  statement: string
  qualityEmphases: Array<{
    qualityId: TrainableQualityId
    state: TrainingEmphasisState
  }>
  evidenceRequirements: Array<{
    semanticRole: EvidenceSemanticRole
    metricId: PerformanceMetricId
    assessmentDefinitionId: string | null
    minimumComparableObservations: number
    evaluationWindowDays: number
  }>
  allowedActions: AdaptationAction[]
  reviewWindow: { startsOn: string; endsOn: string }
  policyVersion: string
}

export interface DerivedTrainingEvidence {
  schemaVersion: typeof ADAPTIVE_PROGRAMMING_SCHEMA_VERSION
  id: string
  status: EvidenceStatus
  semanticRole: EvidenceSemanticRole
  metricId: PerformanceMetricId
  observationIds: string[]
  comparabilityKey: string | null
  evaluationWindow: { startsAt: string; endsAt: string }
  sampleCount: number
  minimumRequiredObservations: number
  excludedObservationIds: string[]
  algorithmVersion: string
  freshness: 'current' | 'stale' | 'expired'
  confidence: number
}

export interface ContractValidation {
  ok: boolean
  errors: string[]
}

export type ComparabilityKeyResult =
  | { ok: true; key: string }
  | { ok: false; errors: string[] }

export function findAssessmentDefinition(
  id: string,
  version?: string
): AssessmentDefinition | null {
  return ADAPTIVE_ASSESSMENT_DEFINITIONS.find(definition => (
    definition.id === id && (version === undefined || definition.version === version)
  )) ?? null
}

export function validateAssessmentDefinitions(
  definitions: readonly AssessmentDefinition[] = ADAPTIVE_ASSESSMENT_DEFINITIONS
): ContractValidation {
  const errors: string[] = []
  const seen = new Set<string>()

  for (const definition of definitions) {
    const key = `${definition.id}@${definition.version}`
    if (seen.has(key)) errors.push(`Duplicate assessment definition: ${key}`)
    seen.add(key)

    if (!isStableId(definition.id) || !isSemanticVersion(definition.version)) {
      errors.push(`Assessment ${definition.id} needs stable versioned identity`)
    }
    if (!definition.name.trim()) {
      errors.push(`Assessment ${definition.id} needs a name`)
    }
    if (
      definition.qualityIds.length === 0
      || new Set(definition.qualityIds).size !== definition.qualityIds.length
      || definition.qualityIds.some(id => !TRAINABLE_QUALITY_IDS.includes(id))
    ) {
      errors.push(`Assessment ${definition.id} has invalid quality IDs`)
    }
    if (
      definition.allowedSemanticRoles.length === 0
      || new Set(definition.allowedSemanticRoles).size !== definition.allowedSemanticRoles.length
      || definition.allowedSemanticRoles.some(role => (
        !OBSERVATION_SEMANTIC_ROLES.includes(role as ObservationSemanticRole)
        || (role as ObservationSemanticRole) === 'target'
      ))
    ) {
      errors.push(`Assessment ${definition.id} has invalid evidence roles`)
    }

    const metricDefinition = METRIC_DEFINITIONS[definition.primaryMetricId]
    if (
      !metricDefinition
      || definition.allowedUnits.length === 0
      || new Set(definition.allowedUnits).size !== definition.allowedUnits.length
      || definition.allowedUnits.some(unit => !metricDefinition.allowedUnits.includes(unit))
    ) {
      errors.push(`Assessment ${definition.id} uses a unit outside its metric contract`)
    }
    if (
      !Number.isFinite(definition.valueRange.min)
      || definition.valueRange.min < 0
      || (
        definition.valueRange.max !== null
        && (
          !Number.isFinite(definition.valueRange.max)
          || definition.valueRange.max < definition.valueRange.min
        )
      )
    ) {
      errors.push(`Assessment ${definition.id} has an invalid value range`)
    }
    if (
      !isStableId(definition.protocol.id)
      || !isSemanticVersion(definition.protocol.version)
    ) {
      errors.push(`Assessment ${definition.id} has invalid protocol identity`)
    }
    if (
      definition.protocol.comparabilityDimensions.length === 0
      || new Set(definition.protocol.comparabilityDimensions).size
        !== definition.protocol.comparabilityDimensions.length
    ) {
      errors.push(`Assessment ${definition.id} has duplicate comparison dimensions`)
    }
  }

  return { ok: errors.length === 0, errors: unique(errors) }
}

export function normalizeMetricValue(value: MetricValue): NormalizedMetricValue | null {
  const definition = METRIC_DEFINITIONS[value.metricId]
  if (!definition || !definition.allowedUnits.includes(value.unit)) return null
  const normalized = normalizeQuantity(value, definition.dimension)
  if (!normalized || (definition.integer && !Number.isInteger(normalized.value))) return null
  return {
    metricId: value.metricId,
    value: normalized.value,
    unit: normalized.unit
  }
}

export function validatePerformanceObservation(
  observation: PerformanceObservation
): ContractValidation {
  const errors: string[] = []
  const definition = findAssessmentDefinition(
    observation.assessmentDefinition.id,
    observation.assessmentDefinition.version
  )

  if (observation.schemaVersion !== ADAPTIVE_PROGRAMMING_SCHEMA_VERSION) {
    errors.push('Adaptive programming schema version is unsupported')
  }
  if (!isStableId(observation.id)) errors.push('Observation needs a stable ID')
  if (!PERFORMANCE_OBSERVATION_KINDS.includes(observation.kind)) {
    errors.push('Observation kind is unsupported')
  }
  if (!OBSERVATION_SEMANTIC_ROLES.includes(observation.semanticRole)) {
    errors.push('Observation role is unsupported')
  }
  if (!OBSERVATION_STATUSES.includes(observation.status)) {
    errors.push('Observation status is unsupported')
  }
  if (!OBSERVATION_SOURCE_KINDS.includes(observation.source.kind)) {
    errors.push('Observation source kind is unsupported')
  }
  if (!definition) errors.push('Assessment definition is unsupported')
  if (!isIsoTimestamp(observation.observedAt) || !isIsoTimestamp(observation.capturedAt)) {
    errors.push('Observation times must be ISO timestamps')
  } else if (Date.parse(observation.capturedAt) < Date.parse(observation.observedAt)) {
    errors.push('Capture time cannot precede observation time')
  }
  if (
    !isStableId(observation.source.system)
    || !observation.source.recordId.trim()
    || !observation.source.fingerprint.trim()
    || (
      observation.source.deviceId !== null
      && !isStableId(observation.source.deviceId)
    )
  ) {
    errors.push('Observation source needs system, record, fingerprint, and valid device identifiers')
  }
  if (!hasUniqueStableValues(observation.derivedFromObservationIds)) {
    errors.push('Derived observation references must be unique stable IDs')
  }

  if (definition) {
    if (observation.kind !== definition.observationKind) {
      errors.push('Observation kind does not match its assessment definition')
    }
    if (!definition.allowedSemanticRoles.includes(observation.semanticRole as EvidenceSemanticRole)) {
      errors.push('Observation role does not match its assessment definition')
    }
    if (
      observation.protocol.id !== definition.protocol.id
      || observation.protocol.version !== definition.protocol.version
    ) {
      errors.push('Observation protocol does not match its assessment definition')
    }
  }

  if (observation.metric) {
    const normalizedMetric = normalizeMetricValue(observation.metric)
    if (!normalizedMetric) {
      errors.push('Observation metric has an incompatible or invalid unit')
    } else if (definition) {
      if (
        observation.metric.metricId !== definition.primaryMetricId
        || !definition.allowedUnits.includes(observation.metric.unit)
      ) {
        errors.push('Observation metric does not match its assessment definition')
      }
      if (
        normalizedMetric.value < definition.valueRange.min
        || (
          definition.valueRange.max !== null
          && normalizedMetric.value > definition.valueRange.max
        )
      ) {
        errors.push('Observation metric is outside the assessment range')
      }
    }
  }

  if (observation.semanticRole === 'estimate' && observation.derivedFromObservationIds.length === 0) {
    errors.push('Estimated observations need source observation IDs')
  }

  validateObservationLifecycle(observation, errors)
  validateComparisonContext(observation, definition, errors)

  return { ok: errors.length === 0, errors: unique(errors) }
}

export function buildObservationComparabilityKey(
  observation: PerformanceObservation
): ComparabilityKeyResult {
  if (observation.status !== 'complete') {
    return { ok: false, errors: ['Only complete active observations are comparable'] }
  }

  const validation = validatePerformanceObservation(observation)
  if (!validation.ok) return { ok: false, errors: validation.errors }

  const definition = findAssessmentDefinition(
    observation.assessmentDefinition.id,
    observation.assessmentDefinition.version
  )
  if (!definition) return { ok: false, errors: ['Assessment definition is unsupported'] }

  const segments = [
    COMPARABILITY_KEY_VERSION,
    part('metric', definition.primaryMetricId),
    part('definition', `${definition.id}@${definition.version}`),
    part('protocol', `${observation.protocol.id}@${observation.protocol.version}`)
  ]

  for (const dimension of definition.protocol.comparabilityDimensions) {
    segments.push(part(dimension, comparisonDimensionValue(dimension, observation)))
  }

  return { ok: true, key: segments.join('|') }
}

export function areObservationsComparable(
  first: PerformanceObservation,
  second: PerformanceObservation
): boolean {
  const firstKey = buildObservationComparabilityKey(first)
  const secondKey = buildObservationComparabilityKey(second)
  return firstKey.ok && secondKey.ok && firstKey.key === secondKey.key
}

export function validateTrainingGoal(goal: TrainingGoal): ContractValidation {
  const errors: string[] = []

  if (goal.schemaVersion !== ADAPTIVE_PROGRAMMING_SCHEMA_VERSION) {
    errors.push('Adaptive programming schema version is unsupported')
  }
  if (!isStableId(goal.id)) errors.push('Training goal needs a stable ID')
  if (goal.statement.trim().length < 5 || goal.statement.length > 500) {
    errors.push('Training goal statement must be between 5 and 500 characters')
  }
  if (
    goal.requiredQualityIds.length === 0
    || new Set(goal.requiredQualityIds).size !== goal.requiredQualityIds.length
    || goal.requiredQualityIds.some(id => !TRAINABLE_QUALITY_IDS.includes(id))
  ) {
    errors.push('Training goal needs unique supported quality IDs')
  }
  if (!isIsoTimestamp(goal.source.confirmedAt)) {
    errors.push('Training goal confirmation time must be an ISO timestamp')
  }
  if (goal.targetDate !== null && !isIsoDate(goal.targetDate)) {
    errors.push('Training goal target date must be YYYY-MM-DD')
  }
  if (goal.target) validateGoalTarget(goal.target, errors)

  return { ok: errors.length === 0, errors: unique(errors) }
}

export function validateProgrammingHypothesis(
  hypothesis: ProgrammingHypothesis
): ContractValidation {
  const errors: string[] = []

  if (hypothesis.schemaVersion !== ADAPTIVE_PROGRAMMING_SCHEMA_VERSION) {
    errors.push('Adaptive programming schema version is unsupported')
  }
  if (!isStableId(hypothesis.id) || !isStableId(hypothesis.goalId)) {
    errors.push('Programming hypothesis needs stable hypothesis and goal IDs')
  }
  if (hypothesis.statement.trim().length < 10 || hypothesis.statement.length > 1000) {
    errors.push('Programming hypothesis statement must be between 10 and 1000 characters')
  }
  if (
    hypothesis.qualityEmphases.length === 0
    || new Set(hypothesis.qualityEmphases.map(item => item.qualityId)).size
      !== hypothesis.qualityEmphases.length
    || hypothesis.qualityEmphases.some(item => (
      !TRAINABLE_QUALITY_IDS.includes(item.qualityId)
      || !TRAINING_EMPHASIS_STATES.includes(item.state)
    ))
  ) {
    errors.push('Programming hypothesis needs unique supported quality emphases')
  }
  if (hypothesis.evidenceRequirements.length === 0) {
    errors.push('Programming hypothesis needs evidence requirements')
  }
  const hasDirectOutcome = hypothesis.evidenceRequirements.some(
    item => item.semanticRole === 'direct_outcome'
  )
  const hasRecoveryEvidencePair = ['proxy', 'training_signal'].every(role => (
    hypothesis.evidenceRequirements.some(item => item.semanticRole === role)
  ))
  if (!hasDirectOutcome && !hasRecoveryEvidencePair) {
    errors.push('Programming hypothesis needs a direct outcome or recovery evidence pair')
  }
  for (const requirement of hypothesis.evidenceRequirements) {
    if (
      !PERFORMANCE_METRIC_IDS.includes(requirement.metricId)
      || (requirement.semanticRole as ObservationSemanticRole) === 'target'
    ) {
      errors.push('Evidence requirement role or metric is unsupported')
    }
    if (
      !Number.isInteger(requirement.minimumComparableObservations)
      || requirement.minimumComparableObservations < 2
    ) {
      errors.push('Evidence requirements need at least two comparable observations')
    }
    if (
      !Number.isInteger(requirement.evaluationWindowDays)
      || requirement.evaluationWindowDays < 1
      || requirement.evaluationWindowDays > 365
    ) {
      errors.push('Evidence evaluation window must be 1 through 365 days')
    }
    if (requirement.assessmentDefinitionId !== null) {
      const definition = findAssessmentDefinition(requirement.assessmentDefinitionId)
      if (!definition || definition.primaryMetricId !== requirement.metricId) {
        errors.push('Evidence requirement assessment does not match its metric')
      } else if (!definition.allowedSemanticRoles.includes(requirement.semanticRole)) {
        errors.push('Evidence requirement role does not match its assessment')
      }
    }
  }
  if (
    hypothesis.allowedActions.length === 0
    || new Set(hypothesis.allowedActions).size !== hypothesis.allowedActions.length
    || hypothesis.allowedActions.some(action => !ADAPTATION_ACTIONS.includes(action))
  ) {
    errors.push('Programming hypothesis needs unique supported adaptation actions')
  }
  if (!hypothesis.allowedActions.includes('hold_collect_more')) {
    errors.push('Programming hypothesis must allow holding for more evidence')
  }
  if (
    !isIsoDate(hypothesis.reviewWindow.startsOn)
    || !isIsoDate(hypothesis.reviewWindow.endsOn)
    || hypothesis.reviewWindow.endsOn < hypothesis.reviewWindow.startsOn
  ) {
    errors.push('Programming hypothesis needs an ordered YYYY-MM-DD review window')
  }
  if (!hypothesis.policyVersion.trim()) {
    errors.push('Programming hypothesis needs a policy version')
  }

  return { ok: errors.length === 0, errors: unique(errors) }
}

export function validateDerivedTrainingEvidence(
  evidence: DerivedTrainingEvidence
): ContractValidation {
  const errors: string[] = []

  if (evidence.schemaVersion !== ADAPTIVE_PROGRAMMING_SCHEMA_VERSION) {
    errors.push('Adaptive programming schema version is unsupported')
  }
  if (!isStableId(evidence.id)) errors.push('Derived evidence needs a stable ID')
  if (!EVIDENCE_STATUSES.includes(evidence.status)) {
    errors.push('Derived evidence status is unsupported')
  }
  if (
    !OBSERVATION_SEMANTIC_ROLES.includes(evidence.semanticRole as ObservationSemanticRole)
    || (evidence.semanticRole as ObservationSemanticRole) === 'target'
  ) {
    errors.push('Derived evidence role is unsupported')
  }
  if (!PERFORMANCE_METRIC_IDS.includes(evidence.metricId)) {
    errors.push('Derived evidence metric is unsupported')
  }
  if (!hasUniqueStableValues(evidence.observationIds)) {
    errors.push('Derived evidence observation IDs must be unique and stable')
  }
  if (!hasUniqueStableValues(evidence.excludedObservationIds)) {
    errors.push('Excluded observation IDs must be unique and stable')
  }
  if (evidence.observationIds.some(id => evidence.excludedObservationIds.includes(id))) {
    errors.push('An observation cannot be both included and excluded')
  }
  if (!Number.isInteger(evidence.sampleCount) || evidence.sampleCount !== evidence.observationIds.length) {
    errors.push('Derived evidence sample count must match included observations')
  }
  if (
    !Number.isInteger(evidence.minimumRequiredObservations)
    || evidence.minimumRequiredObservations < 2
  ) {
    errors.push('Derived evidence requires a minimum of two observations')
  }
  if (
    evidence.status === 'supported'
    && evidence.sampleCount < evidence.minimumRequiredObservations
  ) {
    errors.push('Supported evidence needs the required number of observations')
  }
  if (
    evidence.status === 'contradicted'
    && evidence.sampleCount < evidence.minimumRequiredObservations
  ) {
    errors.push('Contradicted evidence needs the required number of observations')
  }
  if (
    evidence.status === 'supported'
    && !evidence.comparabilityKey?.startsWith(COMPARABILITY_KEY_VERSION)
  ) {
    errors.push('Supported evidence needs a versioned comparability key')
  }
  if (
    !isIsoTimestamp(evidence.evaluationWindow.startsAt)
    || !isIsoTimestamp(evidence.evaluationWindow.endsAt)
    || evidence.evaluationWindow.endsAt < evidence.evaluationWindow.startsAt
  ) {
    errors.push('Derived evidence needs an ordered ISO evaluation window')
  }
  if (!evidence.algorithmVersion.trim()) {
    errors.push('Derived evidence needs an algorithm version')
  }
  if (!Number.isFinite(evidence.confidence) || evidence.confidence < 0 || evidence.confidence > 1) {
    errors.push('Derived evidence confidence must be from 0 through 1')
  }

  return { ok: errors.length === 0, errors: unique(errors) }
}

function metric(
  id: PerformanceMetricId,
  dimension: UnitDimension,
  canonicalUnit: MetricUnit,
  allowedUnits: readonly MetricUnit[],
  direction: MetricDefinition['direction'],
  integer = false
): MetricDefinition {
  return { id, dimension, canonicalUnit, allowedUnits, direction, integer }
}

function assessment(input: {
  id: string
  name: string
  family: AssessmentFamily
  qualityIds: readonly TrainableQualityId[]
  observationKind: PerformanceObservationKind
  primaryMetricId: PerformanceMetricId
  allowedSemanticRoles: readonly EvidenceSemanticRole[]
  allowedUnits: readonly MetricUnit[]
  valueRange: { min: number; max: number | null }
  protocolId: string
  comparabilityDimensions: readonly ComparabilityDimension[]
}): AssessmentDefinition {
  return {
    id: input.id,
    version: '1.0.0',
    name: input.name,
    family: input.family,
    qualityIds: input.qualityIds,
    observationKind: input.observationKind,
    primaryMetricId: input.primaryMetricId,
    allowedSemanticRoles: input.allowedSemanticRoles,
    allowedUnits: input.allowedUnits,
    valueRange: input.valueRange,
    protocol: {
      id: input.protocolId,
      version: '1.0.0',
      comparabilityDimensions: input.comparabilityDimensions
    }
  }
}

function validateObservationLifecycle(
  observation: PerformanceObservation,
  errors: string[]
): void {
  if (observation.status === 'complete') {
    if (!observation.metric) errors.push('Complete observations need a metric')
    if (observation.completion.missingFields.length > 0) {
      errors.push('Complete observations cannot list missing fields')
    }
    if (observation.exclusion) errors.push('Complete observations cannot have an exclusion')
    if (observation.supersededByObservationId) {
      errors.push('Complete observations cannot have a superseding record')
    }
  }
  if (observation.status === 'incomplete') {
    if (observation.completion.missingFields.length === 0) {
      errors.push('Incomplete observations need missing fields')
    }
    if (observation.exclusion) errors.push('Incomplete observations cannot have an exclusion')
  }
  if (observation.status === 'excluded' && !observation.exclusion) {
    errors.push('Excluded observations need an exclusion reason')
  }
  if (
    observation.status === 'superseded'
    && !isStableId(observation.supersededByObservationId ?? '')
  ) {
    errors.push('Superseded observations need a superseding observation ID')
  }
  if (!hasUniqueStableValues(observation.completion.missingFields)) {
    errors.push('Observation missing fields must be unique stable identifiers')
  }
}

function validateComparisonContext(
  observation: PerformanceObservation,
  definition: AssessmentDefinition | null,
  errors: string[]
): void {
  const context = observation.comparison
  for (const values of [
    context.equipmentIds,
    context.techniqueModifiers,
    context.environmentModifiers
  ]) {
    if (!hasUniqueStableValues(values)) {
      errors.push('Comparison identifiers must be unique and stable')
      break
    }
  }
  if (context.repetitions !== null && (
    !Number.isInteger(context.repetitions) || context.repetitions <= 0
  )) {
    errors.push('Comparison repetitions must be a positive integer')
  }
  if (context.externalLoad && !normalizeQuantity(context.externalLoad, 'mass')) {
    errors.push('Comparison load needs a non-negative mass unit')
  }
  if (context.distance && !normalizeQuantity(context.distance, 'length')) {
    errors.push('Comparison distance needs a non-negative length unit')
  }
  if (context.duration && !normalizeQuantity(context.duration, 'duration')) {
    errors.push('Comparison duration needs a non-negative duration unit')
  }

  if (!definition || observation.status !== 'complete') return
  for (const dimension of definition.protocol.comparabilityDimensions) {
    if (!hasComparisonDimension(dimension, observation)) {
      errors.push(`Complete observation is missing comparison dimension: ${dimension}`)
    }
  }
}

function hasComparisonDimension(
  dimension: ComparabilityDimension,
  observation: PerformanceObservation
): boolean {
  const context = observation.comparison
  switch (dimension) {
    case 'movement': return isStableId(context.movementId ?? '')
    case 'variation': return isStableId(context.variationId ?? '')
    case 'repetitions': return context.repetitions !== null
    case 'external_load': return normalizePositiveQuantity(context.externalLoad, 'mass') !== null
    case 'distance': return normalizePositiveQuantity(context.distance, 'length') !== null
    case 'duration': return normalizePositiveQuantity(context.duration, 'duration') !== null
    case 'equipment': return context.equipmentIds.length > 0
    case 'source': return isStableId(observation.source.system)
    case 'technique_modifiers': return true
    case 'environment_modifiers': return true
  }
}

function comparisonDimensionValue(
  dimension: ComparabilityDimension,
  observation: PerformanceObservation
): string {
  const context = observation.comparison
  switch (dimension) {
    case 'movement': return context.movementId as string
    case 'variation': return context.variationId as string
    case 'repetitions': return String(context.repetitions)
    case 'external_load': return normalizedQuantityKey(context.externalLoad, 'mass')
    case 'distance': return normalizedQuantityKey(context.distance, 'length')
    case 'duration': return normalizedQuantityKey(context.duration, 'duration')
    case 'equipment': return normalizedSetKey(context.equipmentIds)
    case 'source': return [
      `kind:${observation.source.kind}`,
      `system:${observation.source.system}`,
      `device:${observation.source.deviceId ?? 'no_device'}`
    ].join(';')
    case 'technique_modifiers': return normalizedSetKey(context.techniqueModifiers)
    case 'environment_modifiers': return normalizedSetKey(context.environmentModifiers)
  }
}

function validateGoalTarget(target: NonNullable<TrainingGoal['target']>, errors: string[]): void {
  const normalized = normalizeMetricValue(target.metric)
  if (!normalized) errors.push('Training goal target has an invalid metric or unit')
  if (target.upperMetric) {
    const upper = normalizeMetricValue(target.upperMetric)
    if (
      target.comparison !== 'range'
      || !normalized
      || !upper
      || upper.metricId !== normalized.metricId
      || upper.unit !== normalized.unit
      || upper.value < normalized.value
    ) {
      errors.push('Training goal range needs an ordered matching upper metric')
    }
  } else if (target.comparison === 'range') {
    errors.push('Training goal range needs an upper metric')
  }

  const definition = findAssessmentDefinition(
    target.assessmentDefinition.id,
    target.assessmentDefinition.version
  )
  if (
    !definition
    || definition.primaryMetricId !== target.metric.metricId
    || definition.protocol.id !== target.protocol.id
    || definition.protocol.version !== target.protocol.version
  ) {
    errors.push('Training goal target protocol does not match its assessment')
  }
}

function normalizeQuantity(
  quantity: MeasurementQuantity | null,
  expectedDimension?: UnitDimension
): MeasurementQuantity | null {
  if (!quantity || !Number.isFinite(quantity.value) || quantity.value < 0) return null
  const unit = UNIT_DEFINITIONS[quantity.unit]
  if (!unit || (expectedDimension && unit.dimension !== expectedDimension)) return null
  const value = roundCanonical(unit.toCanonical(quantity.value))
  if (!Number.isFinite(value)) return null
  return { value, unit: unit.canonicalUnit }
}

function normalizePositiveQuantity(
  quantity: MeasurementQuantity | null,
  dimension: UnitDimension
): MeasurementQuantity | null {
  const normalized = normalizeQuantity(quantity, dimension)
  return normalized && normalized.value > 0 ? normalized : null
}

function normalizedQuantityKey(
  quantity: MeasurementQuantity | null,
  dimension: UnitDimension
): string {
  const normalized = normalizeQuantity(quantity, dimension)
  return normalized ? `${normalized.value}:${normalized.unit}` : 'missing'
}

function normalizedSetKey(values: readonly string[]): string {
  return values.length === 0 ? 'none' : [...values].sort().join(',')
}

function part(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}`
}

function roundCanonical(value: number): number {
  return Number(value.toFixed(6))
}

function isSemanticVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(value)
}

function isStableId(value: string): boolean {
  return /^[a-z0-9][a-z0-9._:-]*$/i.test(value)
}

function hasUniqueStableValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length && values.every(isStableId)
}

function isIsoTimestamp(value: string): boolean {
  if (!value || Number.isNaN(Date.parse(value))) return false
  return new Date(value).toISOString() === value
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}
