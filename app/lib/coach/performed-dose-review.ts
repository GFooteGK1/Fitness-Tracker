import type { PerformedDoseEvidence, EvidenceQuantity } from './performed-dose-evidence'
import type { RollingWeeklyPlanDraft } from './rolling-weekly-plan'

function comparison(recorded: EvidenceQuantity, proposed: { min: number; max: number }) {
  if (recorded.kind === 'unknown') return { kind: 'unresolved' as const, reason: recorded.reason }
  const min = recorded.kind === 'exact' ? recorded.value : recorded.min
  const max = recorded.kind === 'exact' ? recorded.value : recorded.max
  return { kind: 'structural_quantity_comparison_only' as const,
    relation: min === proposed.min && max === proposed.max ? 'same_bounds' as const : 'different_bounds' as const,
    recorded: { min, max }, proposed: { ...proposed } }
}

/** Opt-in offline review only; never used by active model prompts or dose selection. */
export function projectPerformedDoseShadowReview(ownedPlan: { userId: string; plan: RollingWeeklyPlanDraft }, evidence: PerformedDoseEvidence) {
  if (!ownedPlan.userId || ownedPlan.userId !== evidence.userId) throw new Error('Plan and evidence ownership mismatch')
  const { plan } = ownedPlan
  return {
    version: 'performed-dose-review-0.1.0' as const, mode: 'shadow_only' as const, numericPolicyEligible: false as const,
    userId: evidence.userId, coverage: { ...evidence.coverage }, issues: structuredClone(evidence.issues),
    statement: 'These are field-level differences, not protocol equivalence, recommended doses or demonstrated tolerance.',
    exercises: plan.sessions.flatMap(session => session.blocks.flatMap(block => block.exercises.map(exercise => ({
      sessionId: session.sessionId, blockId: block.id, movementId: exercise.movementId,
      role: exercise.role, proposedDose: structuredClone(exercise.dose),
      records: evidence.exposures.filter(row => row.movementId === exercise.movementId).map(row => ({
        sourceId: row.sourceId, sourcePath: row.sourcePath, date: row.date, basis: row.basis,
        capturedAt: row.capturedAt, revision: row.revision, snapshotId: row.snapshotId,
        quantityProvenance: structuredClone(row.quantityProvenance),
        protocol: structuredClone(row.protocol), equipment: structuredClone(row.equipment),
        unilateralConvention: structuredClone(row.unilateralConvention), effort: structuredClone(row.effort),
        quantities: { sets: { ...row.sets }, repetitions: { ...row.repetitions }, load: { ...row.load }, loadUnit: row.loadUnit },
        comparison: !['confirmed_prescription', 'reported_work'].includes(row.basis) || row.role !== 'working' || exercise.role === 'specific_preparation'
          || row.raw.completed === false || row.raw.workStatus === 'unsure'
          ? { kind: 'unresolved' as const, reason: 'Completion, work role or prescription provenance does not support comparison.' }
          : exercise.dose.kind === 'sets_reps'
            ? { sets: comparison(row.sets, exercise.dose.sets), repetitions: comparison(row.repetitions, exercise.dose.repetitions) }
            : { kind: 'unresolved' as const, reason: 'This shadow comparison currently supports resistance set/rep fields only.' },
        limitations: [...row.limitations],
      })),
    })))),
  }
}
