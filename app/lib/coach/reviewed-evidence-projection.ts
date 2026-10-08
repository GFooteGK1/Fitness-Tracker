/** Shared bounded review projection; never include raw source tables or notes. */
import type { fetchReviewedDoseContext } from './reviewed-dose-context-server'
type Records = Awaited<ReturnType<typeof fetchReviewedDoseContext>>['performed']['records']
export function projectReviewedEvidence(records: Records) {
  return records.map(row => ({ sourceId: row.sourceId,
    summary: JSON.stringify({ date: row.date, movement: row.movementId ?? row.recordedName,
      role: row.role, basis: row.basis, completionState: row.completionState,
      quantities: row.quantities, quantityProvenance: row.quantityProvenance,
      recordedWeight: row.recordedWeight, equipment: row.equipment, protocol: row.protocol,
      unilateralConvention: row.unilateralConvention, effort: row.effort,
      setEvidence: row.setEvidence ? { reportId: row.setEvidence.reportId, revision: row.setEvidence.revision,
        setNumber: row.setEvidence.setNumber, performedAt: row.setEvidence.performedAt,
        durationSeconds: row.setEvidence.durationSeconds, distanceMetres: row.setEvidence.distanceMetres,
        restAfterSeconds: row.setEvidence.restAfterSeconds, velocity: row.setEvidence.velocity,
        rir: row.setEvidence.rir, stopped: row.setEvidence.stopped, symptoms: row.setEvidence.symptoms,
        hasAdditionalNote: Boolean(row.setEvidence.note) } : null,
      sessionEffort: { value: row.sessionEffort.value, status: row.sessionEffort.status },
      limitations: row.limitations }) }))
}
