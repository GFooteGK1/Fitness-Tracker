import type { ReviewedSetReport } from '@/app/lib/coach/reviewed-set-report'
export function reviewedSetReport(activityId: string): ReviewedSetReport {
  return { schemaVersion: 1, activityId, setNumber: 1, side: 'both', revision: 1,
    status: 'performed', performedAt: '2026-08-04T17:00:00Z', repetitions: 6,
    durationSeconds: null, distanceMetres: null, load: { value: 175, unit: 'lb', convention: 'total' },
    rpe: { value: 7, scale: 'rir_based' }, restAfterSeconds: 180, stopped: false, symptoms: null, note: null, velocity: null }
}
export const invalidSetPatches: Record<string, unknown>[] = [
  { side: ['both'] }, { status: ['performed'] }, { load: { value: 175, unit: ['lb'], convention: 'total' } },
  { load: { value: 175, unit: 'lb', convention: ['total'] } }, { rpe: { value: 7, scale: ['rir_based'] } },
  { performedAt: '2026-02-30T17:00:00Z' }, { performedAt: '2026-08-04T24:00:00Z' },
  { rpe: { value: 11, scale: 'rir_based' } }, { rpe: { value: 8, scale: 'session' } },
  { repetitions: 1.5 }, { repetitions: '6' }, { setNumber: 0 }, { revision: 1.5 },
  { load: { value: 175, unit: 'lb' } }, { load: { value: 1, unit: 'stone', convention: 'total' } },
  { performedAt: 'yesterday' }, { performedAt: '2026-09-27' }, { extra: 'unknown' }, { note: '' }, { symptoms: 2 },
  { stopped: 'false' }, { restAfterSeconds: -1 }, { status: 'not_performed' },
  { velocity: { unit: 'm/s', device: 'Qwik', method: 'video', repetitions: [{ rep: 7, meanConcentricVelocity: 0.4 }] } },
  { velocity: { unit: 'm/s', device: 'Qwik', method: 'video', repetitions: [{ rep: 1, meanConcentricVelocity: 0.4 }, { rep: 1, meanConcentricVelocity: 0.5 }] } },
]
