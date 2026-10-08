/** Exact identity/eligibility reconciliation after trusted recipe validation.
 * Never converts loads, grants source equivalence or selects substitutions. */
import { MOVEMENT_CATALOG, MOVEMENT_EQUIPMENT_IDS, REVIEWED_MOVEMENT_CATALOG_VERSION, isMovementEligible,
  type MovementEquipmentId } from './movement-catalog'
import type { ProgrammingProfile } from './programming-schema'

export const REVIEWED_EQUIPMENT_ALIASES: Readonly<Record<string, readonly MovementEquipmentId[]>> = {
  stationary_bike: ['bike'], measured_running_area: ['track'], safe_runout: [],
  flat_bench: ['bench'], rack_safeties: ['rack'], barbell_45lb: ['barbell'], plates: [],
  dumbbells: ['dumbbell'], cable_station: ['cable'], resistance_band: ['band'],
  high_handle_trap_bar: ['trap_bar_high_handles'],
}
const movementIds: Readonly<Record<string, string>> = { bike: 'bike_erg', run: 'reviewed_run' }

export function resolveReviewedMovementId(id: string): string | null {
  const canonical = movementIds[id] ?? id
  return MOVEMENT_CATALOG.some(movement => movement.id === canonical) ? canonical : null
}

export function validateReviewedMovementEligibility(movementId: string, profile: ProgrammingProfile,
  requiredEquipment: readonly string[] = []): { ok: boolean; canonicalMovementId: string | null; errors: string[]; catalogVersion: string } {
  const canonicalMovementId = resolveReviewedMovementId(movementId)
  const errors: string[] = []
  const movement = MOVEMENT_CATALOG.find(item => item.id === canonicalMovementId)
  if (!movement) errors.push(`Unknown reviewed movement: ${movementId}`)
  if (profile.unresolvedConstraintNote || profile.equipment.unresolvedAthleteDescription) errors.push('Unresolved movement or equipment constraints')
  // Detailed requirements stay mandatory: a generic rack does not imply safeties,
  // a barbell does not imply a high-handle trap bar, and a track implies no runout.
  if (requiredEquipment.some(id => !profile.equipment.resolvedIds.includes(id))) errors.push(`Reviewed setup unavailable: ${movementId}`)
  const available = profile.equipment.resolvedIds.flatMap(id => REVIEWED_EQUIPMENT_ALIASES[id]
    ?? (MOVEMENT_EQUIPMENT_IDS.includes(id as MovementEquipmentId) ? [id as MovementEquipmentId] : []))
  const avoided = profile.preferences.filter(item => item.preference === 'avoid').map(item => resolveReviewedMovementId(item.movementId) ?? item.movementId)
  // Existing canonical "Run" avoidance must also cover the neutral reviewed
  // running identity. This is a restriction union, never protocol equivalence.
  if (avoided.includes('easy_run')) avoided.push('reviewed_run')
  if (avoided.includes('reviewed_run')) avoided.push('easy_run')
  if (movement && !isMovementEligible({ ...movement, programmingStatus: 'active' }, {
    availableEquipmentIds: [...new Set(available)], avoidedMovementIds: avoided,
    trainingExperience: profile.trainingExperience,
    // A matching name or a generic deadlift assessment cannot waive skill/setup
    // requirements for a reviewed variation. No implicit assessment transfer.
    assessedMovementIds: [],
    noOverhead: profile.explicitConstraints.some(item => item.kind === 'no_overhead'),
    noRunning: profile.explicitConstraints.some(item => item.kind === 'no_running'),
  })) errors.push(`Reviewed movement violates canonical eligibility: ${movementId}`)
  return { ok: errors.length === 0, canonicalMovementId, errors, catalogVersion: REVIEWED_MOVEMENT_CATALOG_VERSION }
}

/** These are exact labels from the accepted C2-R recipe, not a general alias resolver. */
export function reviewedPreparationMovementId(label: string, workingMovementId: string): string | null {
  if (label === 'Same barbell bench variation') return workingMovementId === 'barbell_bench_press' ? workingMovementId : null
  return ({ 'Easy bike': 'bike_erg', 'Band pull-apart': 'band_pull_apart', 'Scapular push-up': 'scapular_push_up' } as Record<string, string>)[label] ?? null
}
