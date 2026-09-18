import type { FactualPlanningContext } from './planning-context'
import type { ProgrammingProfile } from './programming-schema'

export interface PrescriptionBasis {
  version: 'prescription-basis-1'
  numericalBasis: 'provisional_existing_policy'
  numericPolicyEligible: false
  historyAsOf: string
  sourceIds: string[]
  familiarityMovementIds: string[]
  restrictions: string[]
  equipmentIds: string[]
  missing: string[]
  statement: string
}

/** Factual movement familiarity never establishes numerical tolerance or proficiency. */
export function buildPrescriptionBasis(profile: ProgrammingProfile, history: FactualPlanningContext): PrescriptionBasis {
  return { version: 'prescription-basis-1', numericalBasis: 'provisional_existing_policy', numericPolicyEligible: false,
    historyAsOf: history.asOf, sourceIds: [...history.sourceIds],
    familiarityMovementIds: [...profile.recentTraining.performedMovementIds],
    restrictions: profile.explicitConstraints.map(item => item.description), equipmentIds: [...profile.equipment.resolvedIds],
    missing: [...history.missing, 'complete_training_coverage_unknown', 'history_derived_numerical_policy_unavailable',
      ...(history.outsideTraining.status === 'unknown' ? ['outside_training_unknown'] : [])],
    statement: history.sourceIds.length
      ? 'Recorded movement familiarity can inform eligible exercise choices. Sets, repetitions and effort use the existing provisional policy; history does not establish tolerance.'
      : 'No usable movement history is available. This is a provisional starting plan from the existing policy; unlogged training remains unknown.' }
}

export function validatePrescriptionBasis(value: unknown, history?: FactualPlanningContext): value is PrescriptionBasis {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  const strings = (a: unknown): a is string[] => Array.isArray(a) && a.length <= 5000 && a.every(s => typeof s === 'string' && s.length <= 2000)
  return v.version === 'prescription-basis-1' && v.numericalBasis === 'provisional_existing_policy' && v.numericPolicyEligible === false
    && typeof v.historyAsOf === 'string' && Number.isFinite(Date.parse(v.historyAsOf))
    && strings(v.sourceIds) && strings(v.familiarityMovementIds) && strings(v.restrictions) && strings(v.equipmentIds) && strings(v.missing)
    && typeof v.statement === 'string' && v.statement.length <= 2000
    && Boolean(history && v.historyAsOf === history.asOf && JSON.stringify(v.sourceIds) === JSON.stringify(history.sourceIds))
}
