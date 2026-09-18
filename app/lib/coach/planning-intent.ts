import {
  ADAPTIVE_PROGRAMMING_SCHEMA_VERSION, METRIC_DEFINITIONS, findAssessmentDefinition,
  validateTrainingGoal, type TrainingGoal, type MetricUnit, type PerformanceMetricId,
} from './adaptive-programming-contracts'
import { MOVEMENT_CATALOG, MOVEMENT_EQUIPMENT_IDS, type MovementEquipmentId } from './movement-catalog'
import { COACH_PROGRAM_DOMAIN_IDS, type CoachProgramDomainId } from './types'

export const PLANNING_INTENT_VERSION = 1 as const
export interface PlanningOutcome {
  goal: TrainingGoal
  domain: CoachProgramDomainId | null
  measurement: {
    metricId: PerformanceMetricId; unit: MetricUnit
    assessmentDefinition: { id: string; version: string }
    protocol: { id: string; version: string }
  } | null
  binding: {
    movementId: string | null
    distance: { value: number; unit: 'm' | 'km' | 'mi' } | null
    equipmentIds: MovementEquipmentId[]
    variation: string | null
    assessmentContext?: {
      repetitions: number | null
      externalLoad: { value: number; unit: 'kg' | 'lb' } | null
      duration: { value: number; unit: 's' | 'min' } | null
      techniqueModifiers: string[]
      environmentModifiers: string[]
    }
  }
  baseline: { status: 'unknown' } | { status: 'referenced'; observationId: string }
  capability: { status: 'supported' } | { status: 'unsupported'; reason: string }
}
export interface PlanningIntentV1 {
  schemaVersion: 1
  outcomes: PlanningOutcome[]
  priorityOrder: string[] | null
  event: { name: string; goalIds: string[]; date: string | null } | null
  confirmedAt: string
}
export interface PlanningIntentSnapshot {
  schemaVersion: 1; memoryId: string; memoryVersion: number; content: PlanningIntentV1
}

const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k))
const text = (v: unknown, min = 1, max = 160): v is string => typeof v === 'string' && v.trim().length >= min && v.length <= max
const list = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string') && new Set(v).size === v.length
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v)
const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v
const pair = (v: unknown) => object(v) && keys(v, ['id', 'version']) && text(v.id) && text(v.version)

/** Strict untrusted-input boundary. Confirmation/ownership are verified by the authenticated persistence transition. */
export function validatePlanningIntent(value: unknown): { ok: true; value: PlanningIntentV1 } | { ok: false; errors: string[] } {
  const errors: string[] = []
  try {
    if (!object(value) || !keys(value, ['schemaVersion', 'outcomes', 'priorityOrder', 'event', 'confirmedAt'])
      || value.schemaVersion !== 1 || !timestamp(value.confirmedAt) || !Array.isArray(value.outcomes)
      || value.outcomes.length < 1 || value.outcomes.length > 8 || JSON.stringify(value).length > 10000) {
      return { ok: false, errors: ['Training intent needs version 1 and one to eight bounded outcomes'] }
    }
    const ids: string[] = []
    for (const raw of value.outcomes) {
      if (!object(raw) || !keys(raw, ['goal', 'domain', 'measurement', 'binding', 'baseline', 'capability'])
        || !object(raw.goal) || !object(raw.binding) || !object(raw.baseline) || !object(raw.capability)) {
        errors.push('Outcome fields are invalid'); continue
      }
      const g = raw.goal
      if (!keys(g, ['schemaVersion', 'id', 'kind', 'statement', 'priority', 'status', 'target', 'targetDate', 'requiredQualityIds', 'source'])
        || !text(g.id, 3) || !text(g.statement, 5, 500) || !['performance_outcome', 'capacity', 'skill', 'process', 'maintenance'].includes(String(g.kind))
        || !['primary', 'secondary'].includes(String(g.priority)) || !['active', 'achieved', 'paused', 'superseded'].includes(String(g.status))
        || !Object.hasOwn(g, 'target') || !Object.hasOwn(g, 'targetDate')
        || !Array.isArray(g.requiredQualityIds) || !object(g.source) || !keys(g.source, ['kind', 'confirmedAt'])
        || g.source.kind !== 'athlete_confirmed' || g.source.confirmedAt !== value.confirmedAt
        || (g.target !== null && !validTargetShape(g.target))) {
        errors.push('Goal fields or confirmation provenance are invalid'); continue
      }
      ids.push(g.id)
      const validation = validateTrainingGoal(g as unknown as TrainingGoal)
      errors.push(...validation.errors)
      if (raw.domain !== null && !COACH_PROGRAM_DOMAIN_IDS.includes(raw.domain as CoachProgramDomainId)) errors.push('Unsupported domain identifier')
      const b = raw.binding
      if (!keys(b, ['movementId', 'distance', 'equipmentIds', 'variation', 'assessmentContext'])
        || !(b.movementId === null || MOVEMENT_CATALOG.some(m => m.id === b.movementId))
        || !list(b.equipmentIds) || b.equipmentIds.some(id => !MOVEMENT_EQUIPMENT_IDS.includes(id as MovementEquipmentId))
        || !(b.variation === null || text(b.variation))
        || !(b.distance === null || (object(b.distance) && keys(b.distance, ['value', 'unit'])
          && typeof b.distance.value === 'number' && Number.isFinite(b.distance.value) && b.distance.value > 0
          && ['m', 'km', 'mi'].includes(String(b.distance.unit))))) errors.push('Outcome movement, distance, equipment or variation binding is invalid')
      if (b.assessmentContext !== undefined && !validAssessmentContext(b.assessmentContext)) errors.push('Assessment comparison context is invalid')
      const baseline = raw.baseline
      if (!(baseline.status === 'unknown' && keys(baseline, ['status']))
        && !(baseline.status === 'referenced' && keys(baseline, ['status', 'observationId'])
          && typeof baseline.observationId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(baseline.observationId))) errors.push('Baseline must be unknown or reference an owned observation')
      const cap = raw.capability
      if (!(cap.status === 'supported' && keys(cap, ['status']))
        && !(cap.status === 'unsupported' && keys(cap, ['status', 'reason']) && text(cap.reason, 1, 500))) errors.push('Capability status is invalid')
      if (raw.measurement !== null && !validMeasurement(raw.measurement)) errors.push('Measurement must use a compatible catalog metric, unit and protocol')
      if (cap.status === 'supported') {
        if (raw.domain === null) errors.push('A supported outcome needs an executable domain')
        if (b.movementId !== null && !MOVEMENT_CATALOG.find(m => m.id === b.movementId)?.domains.includes(raw.domain as CoachProgramDomainId)) errors.push('The measured movement is not supported in this training domain')
        if (!['process', 'skill'].includes(String(g.kind)) && raw.measurement === null) errors.push('A measurable outcome needs its own measurement protocol even without a numeric target')
        if (object(raw.measurement)) {
          const definition = findAssessmentDefinition(String((raw.measurement.assessmentDefinition as Record<string, unknown>)?.id))
          const allowed: Record<string, string[]> = {
            strength: ['strength'], hypertrophy: ['strength'], power_explosiveness: ['jump'],
            speed_agility: ['sprint'], aerobic: ['run'], resilience: ['readiness'],
          }
          if (!definition || !allowed[String(raw.domain)]?.includes(definition.family)) errors.push('The selected measurement is not supported for this training domain')
          if (definition?.protocol.comparabilityDimensions.includes('movement') && b.movementId === null) errors.push('This assessment requires a named movement')
          if (definition?.protocol.comparabilityDimensions.includes('distance') && b.distance === null) errors.push('This assessment requires an explicit distance')
          if (definition?.protocol.comparabilityDimensions.includes('variation') && b.variation === null) errors.push('This assessment requires an explicit variation')
          if (definition?.protocol.comparabilityDimensions.includes('equipment') && Array.isArray(b.equipmentIds) && b.equipmentIds.length === 0) errors.push('This assessment requires explicit equipment')
          const c = object(b.assessmentContext) ? b.assessmentContext : null
          if (definition?.protocol.comparabilityDimensions.includes('repetitions') && c?.repetitions == null) errors.push('This assessment requires an explicit repetition protocol')
          if (definition?.protocol.comparabilityDimensions.includes('external_load') && c?.externalLoad == null) errors.push('This assessment requires explicit external load')
          if (definition?.protocol.comparabilityDimensions.includes('duration') && c?.duration == null) errors.push('This assessment requires an explicit duration')
        }
      }
      if (g.target && object(g.target) && object(g.target.metric)) {
        const m = raw.measurement
        if (!object(m) || g.target.metric.metricId !== m.metricId || g.target.metric.unit !== m.unit
          || (g.target.assessmentDefinition as Record<string, unknown>).id !== (m.assessmentDefinition as Record<string, unknown>).id || (g.target.assessmentDefinition as Record<string, unknown>).version !== (m.assessmentDefinition as Record<string, unknown>).version
          || (g.target.protocol as Record<string, unknown>).id !== (m.protocol as Record<string, unknown>).id || (g.target.protocol as Record<string, unknown>).version !== (m.protocol as Record<string, unknown>).version) errors.push('Target and measurement protocol must agree')
      }
    }
    if (new Set(ids).size !== ids.length) errors.push('Outcome IDs must be unique')
    if (value.priorityOrder !== null && (!list(value.priorityOrder) || value.priorityOrder.length !== ids.length
      || value.priorityOrder.some(id => !ids.includes(id)))) errors.push('Confirmed priority must contain every outcome exactly once')
    if (value.event !== null && (!object(value.event) || !keys(value.event, ['name', 'goalIds', 'date'])
      || !text(value.event.name) || !list(value.event.goalIds) || value.event.goalIds.length === 0
      || value.event.goalIds.some(id => !ids.includes(id)) || !(value.event.date === null || date(value.event.date)))) errors.push('Event must reference unique outcome IDs and a valid optional date')
    return errors.length ? { ok: false, errors: [...new Set(errors)] } : { ok: true, value: structuredClone(value) as unknown as PlanningIntentV1 }
  } catch { return { ok: false, errors: ['Training intent contains malformed fields'] } }
}

function validMeasurement(v: unknown): boolean {
  if (!object(v) || !keys(v, ['metricId', 'unit', 'assessmentDefinition', 'protocol']) || !pair(v.assessmentDefinition) || !pair(v.protocol)) return false
  const d = findAssessmentDefinition(String((v.assessmentDefinition as Record<string, unknown>).id))
  const m = METRIC_DEFINITIONS[v.metricId as PerformanceMetricId]
  return Boolean(d && m && d.primaryMetricId === v.metricId && m.allowedUnits.includes(v.unit as MetricUnit) && d.allowedUnits.includes(v.unit as MetricUnit)
    && d.version === (v.assessmentDefinition as Record<string, unknown>).version
    && d.protocol.id === (v.protocol as Record<string, unknown>).id && d.protocol.version === (v.protocol as Record<string, unknown>).version)
}
function validTargetShape(v: unknown): boolean {
  if (!object(v) || !keys(v, ['role', 'comparison', 'metric', 'upperMetric', 'assessmentDefinition', 'protocol'])
    || v.role !== 'target' || !['at_least', 'at_most', 'range'].includes(String(v.comparison))
    || !object(v.metric) || !pair(v.assessmentDefinition) || !pair(v.protocol)) return false
  const metric = (m: Record<string, unknown>) => keys(m, ['metricId', 'value', 'unit']) && typeof m.value === 'number' && Number.isFinite(m.value)
  return metric(v.metric) && (v.upperMetric === undefined || (object(v.upperMetric) && metric(v.upperMetric)))
}
function validAssessmentContext(v: unknown): boolean {
  if (!object(v) || !keys(v, ['repetitions', 'externalLoad', 'duration', 'techniqueModifiers', 'environmentModifiers'])
    || !(v.repetitions === null || (Number.isInteger(v.repetitions) && Number(v.repetitions) > 0 && Number(v.repetitions) <= 1000))
    || !list(v.techniqueModifiers) || !list(v.environmentModifiers)
    || [...v.techniqueModifiers, ...v.environmentModifiers].some(s => !text(s, 1, 80))) return false
  for (const [field, units] of [['externalLoad', ['kg', 'lb']], ['duration', ['s', 'min']]] as const) {
    const q = v[field]
    if (q !== null && (!object(q) || !keys(q, ['value', 'unit']) || typeof q.value !== 'number'
      || !Number.isFinite(q.value) || q.value <= 0 || !units.includes(q.unit as never))) return false
  }
  return true
}

/** Stable semantic comparison intentionally ignores prose and confirmation timestamps. */
export function outcomeBindingKey(outcome: PlanningOutcome): string {
  const b = outcome.binding
  const meters = b.distance === null ? null : b.distance.value * ({ m: 1, km: 1000, mi: 1609.344 }[b.distance.unit])
  return JSON.stringify([outcome.domain, outcome.goal.kind, outcome.measurement, b.movementId, meters,
    [...b.equipmentIds].sort(), b.variation, b.assessmentContext ?? null, outcome.goal.target], (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)
}

export function validatePlanningIntentSnapshot(value: unknown): value is PlanningIntentSnapshot {
  return object(value) && keys(value, ['schemaVersion', 'memoryId', 'memoryVersion', 'content']) && value.schemaVersion === 1
    && text(value.memoryId, 3) && Number.isInteger(value.memoryVersion) && Number(value.memoryVersion) > 0 && validatePlanningIntent(value.content).ok
}

/** The persisted immutable memory supplies confirmation time; client values never establish it. */
export function stampPlanningIntent(value: PlanningIntentV1, confirmedAt: string): PlanningIntentV1 {
  return { ...structuredClone(value), confirmedAt, outcomes: value.outcomes.map(o => ({ ...structuredClone(o), goal: {
    ...structuredClone(o.goal), source: { kind: 'athlete_confirmed', confirmedAt },
  } })) }
}

export { ADAPTIVE_PROGRAMMING_SCHEMA_VERSION }
