import { captureProvenance } from '@/app/lib/capture/contracts'
import type { PlanningHistorySnapshot } from '@/app/lib/coach/planning-context'

export function workSnapshot(): PlanningHistorySnapshot {
  return { userId: 'athlete', asOf: '2026-09-21T01:00:00Z', startsOn: '2026-08-24', endsOn: '2026-09-20',
    mode: 'current', available: true, complete: true, completions: [], workouts: [{
      id: 'work-1', user_id: 'athlete', workout_date: '2026-09-18', created_at: '2026-09-18T12:00:00Z',
      updated_at: '2026-09-18T12:00:00Z', capture_revision: 1,
      capture_provenance: captureProvenance('workout', 'athlete_reported', 'athlete_confirmed'),
      blocks: [{ role: 'priority_adaptation', movements: [{ name: 'Barbell floor press', sets: 4,
        reps: { min: 2, max: 3 }, weight: '175 lb', effort: { scale: 'RPE', scope: 'hardest_set', value: 7 }, protocol: 'paused' }] }],
    }] }
}
