import { reviewedSessionActivities, type ReviewedSessionPrescription } from '@/app/lib/coach/reviewed-session-contract'
import type { ReviewedSetReport } from '@/app/lib/coach/reviewed-set-report'

/** Synthetic transport evidence, not athlete performance or a prescription.
 * Values deliberately differ from targets; only activity/set/side coverage uses the plan. */
export function syntheticReviewedSessionActuals(session: ReviewedSessionPrescription, performedAt: string): ReviewedSetReport[] {
  return reviewedSessionActivities(session.content).flatMap((activity, index) => {
    const sides: ReviewedSetReport['side'][] = activity.work.kind !== 'distance' && activity.work.sides === 2 ? ['left', 'right'] : ['both']
    return Array.from({ length: activity.sets }, (_, set) => sides.map(side => ({
      schemaVersion: 1 as const, activityId: activity.id, setNumber: set + 1, side, revision: 1,
      status: 'performed' as const, performedAt,
      repetitions: activity.work.kind === 'repetitions' ? 3 : null,
      durationSeconds: activity.work.kind === 'duration' ? 43 : null,
      distanceMetres: activity.work.kind === 'distance' ? 61 : null,
      load: activity.load.kind === 'external' ? { value: 20, unit: 'kg' as const, convention: activity.load.convention } : null,
      rpe: index % 3 === 0 ? null : { value: 6.5, scale: 'effort_0_10' as const },
      restAfterSeconds: 97, stopped: false, symptoms: null, note: 'Synthetic actual; independent of prescribed targets.',
      velocity: activity.work.kind === 'repetitions' && activity.load.kind === 'external'
        ? { unit: 'm/s' as const, device: 'Synthetic Qwik fixture', method: 'video mean concentric',
          repetitions: [{ rep: 1, meanConcentricVelocity: 0.43 }, { rep: 2, meanConcentricVelocity: 0.39 }] } : null,
    }))).flat()
  })
}
