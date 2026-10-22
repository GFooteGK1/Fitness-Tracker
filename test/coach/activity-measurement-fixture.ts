/** Synthetic values only; shape matches an owner-authorized legacy capture read. */
export const measurementField = (origin = 'athlete_reported', reviewState = 'athlete_confirmed') =>
  ({ origin, reviewState, sourceReferences: ['synthetic:measurement'] })
export const measurement = () => ({ blockIndex: 2, segmentIndex: 0, eventIndex: 0, collection: 'sets', setIndex: 3,
  velocity: { value: 0.47, unit: 'm/s', metric: 'mean_concentric', device: 'Synthetic sensor', measuredAt: '2026-10-20T12:00:00Z' },
  provenance: Object.fromEntries(['value', 'unit', 'metric', 'device', 'measuredAt'].map(key => [key, measurementField()])) })
export function measurementBlocks(): any[] {
  return [
    { block_type: 'CARDIO', title: 'Synthetic warmup', time_cap_s: 300, score_model: { scoring: 'TIME' }, block_score: { time_s: null },
      retained: { explicitNull: null, order: ['second', 'first'] }, segments: [{ rounds: 1, events: [{ movement_name: 'Synthetic preparation',
        performed: { time: { value: 120, unit: 's' } }, prescribed: { time: { value: 120, unit: 's' } } }] }] },
    { block_type: 'CARDIO', title: 'Synthetic speed', time_cap_s: 300, score_model: { scoring: 'REPS' }, block_score: { time_s: null },
      segments: [{ rounds: 1, events: [{ movement_name: 'Synthetic deadlift', performed: { reps: 3, load: { value: 10, unit: 'lb' } }, prescribed: { reps: 3 } }] }] },
    { block_type: 'STRENGTH', title: 'Synthetic trap-bar', time_cap_s: 600, score_model: { scoring: 'LOAD' }, block_score: { total_reps: null },
      segments: [{ rounds: 1, events: [{ movement_name: 'Synthetic deadlift',
        performed: { sets: Array.from({ length: 8 }, (_, i) => ({ ...(i === 3 ? { vbt: true } : i === 2 ? { vbt: false } : {}),
          reps: i + 2, load: { value: 31 + i * 3, unit: 'kg' } })) }, prescribed: { sets: [{ reps: 3, load: { value: 50, unit: 'kg' } }] } }] }] },
  ]
}
