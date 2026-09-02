import {
  ADAPTIVE_ASSESSMENT_CATALOG_VERSION,
  findAssessmentDefinition,
  type MetricUnit
} from './adaptive-programming-contracts'
import {
  validateAtomicSessionCompletionInput,
  type AtomicSessionCompletionValidation
} from './session-completion'
import {
  MOVEMENT_CATALOG,
  type MovementDefinition
} from './movement-catalog'
import type { CoachScheduledMeasurementSummary } from './types'
import type { CoachSessionCheckinInput } from './execution-feedback'
import type { CompleteProgrammingSessionPrescription } from './programming-schema'

export interface TodayScheduledMeasurementDraft {
  schedule: CoachScheduledMeasurementSummary
  value: number | null
  unit: MetricUnit
  repetitions: number | null
  externalLoadValue: number | null
  externalLoadUnit: 'lb' | 'kg'
  distanceValue: number | null
  distanceUnit: 'm' | 'km' | 'mi'
  durationValue: number | null
  durationUnit: 's' | 'min'
}

export interface TodaySessionCompletionDraft {
  sessionId: string
  prescription: CompleteProgrammingSessionPrescription
  workoutDate: string
  outcome: CoachSessionCheckinInput['outcome']
  sessionRpe: number | null
  energy: CoachSessionCheckinInput['energy']
  pain: CoachSessionCheckinInput['pain']
  note: string | null
  actualWorkSummary: string | null
  totalDurationMinutes: number | null
  occurredAt: string
  readiness: number | null
  readinessObservedAt: string | null
  measurements: TodayScheduledMeasurementDraft[]
}

export function buildTodaySessionCompletion(
  draft: TodaySessionCompletionDraft
): AtomicSessionCompletionValidation {
  const feedback = {
    outcome: draft.outcome,
    sessionRpe: draft.outcome === 'skipped' ? null : draft.sessionRpe,
    energy: draft.energy,
    pain: draft.pain,
    note: draft.note,
    occurredAt: draft.occurredAt
  }
  const performedWork = draft.outcome === 'skipped'
    ? null
    : draft.outcome === 'as_planned'
      ? {
        mode: 'as_prescribed',
        workoutDate: draft.workoutDate,
        inputText: null,
        blocks: null,
        totalDurationMinutes: draft.totalDurationMinutes
      }
      : {
        mode: 'modified',
        workoutDate: draft.workoutDate,
        inputText: draft.actualWorkSummary,
        blocks: [{
          kind: 'athlete_reported_modification',
          summary: draft.actualWorkSummary
        }],
        totalDurationMinutes: draft.totalDurationMinutes
      }

  const observations = draft.outcome === 'skipped'
    ? []
    : buildTodayObservations(draft)

  return validateAtomicSessionCompletionInput({
    contractVersion: 2,
    feedback,
    performedWork,
    observations
  })
}

function buildTodayObservations(draft: TodaySessionCompletionDraft): unknown[] {
  const observations: unknown[] = []
  const scheduledReadiness = draft.measurements.find(item => (
    item.schedule.assessmentDefinition.id === 'readiness.self_report'
  ))

  if (draft.readiness !== null && draft.readinessObservedAt) {
    observations.push(buildReadinessObservation(
      draft,
      scheduledReadiness?.schedule ?? null
    ))
  }

  draft.measurements.forEach((measurement, index) => {
    if (measurement.schedule.assessmentDefinition.id === 'readiness.self_report') return
    if (measurement.value === null) return
    observations.push(buildScheduledObservation(draft, measurement, index))
  })

  return observations
}

function buildReadinessObservation(
  draft: TodaySessionCompletionDraft,
  schedule: CoachScheduledMeasurementSummary | null
): unknown {
  const definition = findAssessmentDefinition('readiness.self_report')
  return {
    clientId: `readiness:${draft.sessionId}`,
    kind: definition?.observationKind ?? 'readiness_check',
    semanticRole: schedule?.semanticRole ?? 'proxy',
    observedAt: draft.readinessObservedAt,
    assessmentDefinition: schedule?.assessmentDefinition ?? {
      id: 'readiness.self_report',
      version: definition?.version ?? '1.0.0'
    },
    assessmentCatalogVersion: ADAPTIVE_ASSESSMENT_CATALOG_VERSION,
    protocol: schedule?.protocol ?? {
      id: definition?.protocol.id ?? 'daily-readiness-five-point',
      version: definition?.protocol.version ?? '1.0.0'
    },
    metric: { metricId: 'readiness.score', value: draft.readiness, unit: 'score' },
    sourceDeviceId: null,
    comparison: emptyComparison(),
    metadata: {
      context: 'pre_session',
      prescribedSessionId: draft.sessionId,
      scheduledAssessmentId: schedule?.id ?? null
    }
  }
}

function buildScheduledObservation(
  draft: TodaySessionCompletionDraft,
  measurement: TodayScheduledMeasurementDraft,
  index: number
): unknown {
  const definition = findAssessmentDefinition(
    measurement.schedule.assessmentDefinition.id,
    measurement.schedule.assessmentDefinition.version
  )
  const movement = selectMeasurementMovement(
    draft.prescription,
    definition?.family ?? null
  )
  const comparison = emptyComparison()
  comparison.movementId = movement?.id ?? null
  comparison.variationId = movement?.progressionFamily ?? null
  comparison.equipmentIds = movement?.equipment ? [...movement.equipment] : []

  if (definition?.id === 'strength.repetition_max') {
    comparison.repetitions = measurement.repetitions
  } else if (definition?.id === 'strength.repetition_capacity') {
    comparison.externalLoad = measurement.externalLoadValue === null
      ? null
      : { value: measurement.externalLoadValue, unit: measurement.externalLoadUnit }
    comparison.duration = measurement.durationValue === null
      ? null
      : { value: measurement.durationValue, unit: measurement.durationUnit }
  } else if (definition?.id === 'sprint.time' || definition?.id === 'run.time_trial') {
    comparison.distance = measurement.distanceValue === null
      ? null
      : { value: measurement.distanceValue, unit: measurement.distanceUnit }
  }

  return {
    clientId: `measure:${index}:${draft.sessionId}`,
    kind: definition?.observationKind,
    semanticRole: measurement.schedule.semanticRole,
    observedAt: draft.occurredAt,
    assessmentDefinition: measurement.schedule.assessmentDefinition,
    assessmentCatalogVersion: ADAPTIVE_ASSESSMENT_CATALOG_VERSION,
    protocol: measurement.schedule.protocol,
    metric: {
      metricId: measurement.schedule.metricId,
      value: measurement.value,
      unit: measurement.unit
    },
    sourceDeviceId: null,
    comparison,
    metadata: {
      scheduledAssessmentId: measurement.schedule.id,
      scheduledOn: measurement.schedule.scheduledOn,
      movementName: movement?.name ?? null
    }
  }
}

function selectMeasurementMovement(
  prescription: CompleteProgrammingSessionPrescription,
  family: string | null
): MovementDefinition | null {
  const movements = prescription.blocks
    .flatMap(block => block.exercises)
    .map(exercise => MOVEMENT_CATALOG.find(item => item.id === exercise.movementId) ?? null)
    .filter((movement): movement is MovementDefinition => movement !== null)

  if (family === 'strength') {
    return movements.find(movement => (
      movement.patterns.some(pattern => ['squat', 'hinge', 'horizontal_push', 'vertical_push'].includes(pattern))
    )) ?? movements[0] ?? null
  }
  if (family === 'jump') {
    return movements.find(movement => movement.patterns.includes('jump')) ?? null
  }
  if (family === 'sprint') {
    return movements.find(movement => movement.patterns.includes('sprint')) ?? null
  }
  if (family === 'run') {
    return movements.find(movement => movement.running) ?? null
  }
  return movements[0] ?? null
}

function emptyComparison() {
  return {
    movementId: null as string | null,
    variationId: null as string | null,
    repetitions: null as number | null,
    externalLoad: null as { value: number; unit: MetricUnit } | null,
    distance: null as { value: number; unit: MetricUnit } | null,
    duration: null as { value: number; unit: MetricUnit } | null,
    equipmentIds: [] as string[],
    techniqueModifiers: [] as string[],
    environmentModifiers: [] as string[]
  }
}
