import { workSnapshot } from './coach-performed-work'
import { captureProvenance } from '@/app/lib/capture/contracts'

// Synthetic names, amounts and IDs. Shapes/counts represent the authorized
// shape-only inspection: five sources, eight blocks/segments and 31 events.
// No athlete names, stored quantities, source IDs or raw input were copied.
export function segmentedSnapshot() {
  const input = workSnapshot()
  input.asOf = '2026-10-19T01:39:44.491Z'; input.startsOn = '2026-10-12'; input.endsOn = '2026-10-18'
  const variants = [
    { reps: 5, load: { value: 40, unit: 'lb' } },
    { reps: null, distance: { value: 250, unit: 'm' }, load: { value: 0, unit: 'lb' } },
    { distance: { value: 500, unit: 'm' } },
    { time_s: 45 },
    { sets: 2, set_details: [{ reps: 3, load: { value: 20, unit: 'kg' } }, { reps: 4, load: { value: 22, unit: 'kg' } }], load: { value: 20, unit: 'kg' } },
    { set_details: [{ legs: 2, reps_per_leg: 4, load: { value: 10, unit: 'lb' } }], load: { value: 10, unit: 'lb' } },
    { reps: null, rep_range: { min: 3, max: 6 }, load: { value: 30, unit: 'lb' } },
    { reps: 4, subreps: { value: 8, unit: 'alternating' }, load: { value: 15, unit: 'lb' } },
    { reps: 8, distance: { value: 10, unit: 'm' } },
  ]
  let eventIndex = 0
  const blockEvents = [[6], [4, 3, 3], [7], [3, 2], [3]]
  input.workouts = blockEvents.map((counts, wi) => {
    const day = `2026-10-${12 + wi}`
    const row = { ...structuredClone(input.workouts[0]), id: `synthetic-work-${wi}`, workout_date: day,
      created_at: `${day}T12:00:00Z`, updated_at: `${day}T12:00:00Z`, execution_source: 'manual_text', execution_status: 'completed',
      capture_provenance: wi < 2 ? captureProvenance('workout', 'model_estimated', 'unreviewed') : undefined,
      blocks: counts.map((count, bi) => ({ title: `Fixture block ${bi}`, block_type: 'STRENGTH', time_cap_s: 600,
        score_model: { scoring: 'LOAD', round_rep_bundle: 10 },
        block_score: { is_pr: true, time_s: null, rx_status: 'RX', extra_reps: null, tonnage_lb: 800, total_reps: null, rounds_completed: null },
        segments: [{ rounds: 2, events: Array.from({ length: count }, () => {
          const index = eventIndex++, performed = structuredClone(variants[index % variants.length])
          return { movement_name: `Synthetic movement ${index}`, performed, prescribed: { reps: 9, load: { value: 99, unit: 'lb' } } }
        }) }] })) }
    return row
  })
  return input
}
