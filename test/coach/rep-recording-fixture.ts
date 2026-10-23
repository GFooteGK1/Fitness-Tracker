import { measurementBlocks } from './activity-measurement-fixture'

/** Hand-authored synthetic export shape; no athlete/source IDs or private file bytes. */
export function qwikArrayFixture() {
  const means = [[0.41, 0.59], [0.32, 0.46, 0.48, 0.51], [0.45, 0.57, 0.58], [0.42, 0.43, 0.54]]
  return means.map((values, s) => ({ id: `synthetic-set-${s}`, type: 'powerlifting', date: '2026-01-10T12:01:00Z',
    date_performed: '2026-01-10T12:00:00Z', weight: s === 0 ? 155 : 185, weight_unit: 'lbs', plate_diameter: 45,
    rpe: s === 0 ? '<6' : '6.5', notes: null, exercise_sets_tags: ['Paused'], is_archived: false, exercise_name: 'Synthetic deadlift',
    ignored_vendor_metadata: { retainedOnlyInOriginal: true }, bar_path: [0.1, 0.3, 0.4, 0.7],
    exercise_repetitions: values.map((mean, i) => ({
      concentricRepetition: { id: `synthetic-c-${s}-${i}`, rep_number: i + 4, average_velocity: mean, peak_velocity: mean + 0.4,
        peak_velocity_frame: 35 + i * 100, range_of_motion_meters: 0.53, start_frame: s === 1 && i === 0 ? 1 : 20 + i * 100,
        end_frame: 80 + i * 100, duration_millis: 720 + i * 30, is_concentric: true,
        exercise_repetition_pauses: [{ pause_number: 0, start_frame: 45 + i * 100, end_frame: 49 + i * 100 }] },
      eccentricRepetition: { id: `synthetic-e-${s}-${i}`, rep_number: i + 7, average_velocity: -0.7, peak_velocity: -1.12,
        peak_velocity_frame: 94 + i * 100, range_of_motion_meters: -0.52, start_frame: 81 + i * 100,
        end_frame: 99 + i * 100, duration_millis: 410, is_concentric: false, exercise_repetition_pauses: [] },
    })),
  }))
}

export const recordingOptions = { fileName: 'synthetic-qwik.json', reference: 'synthetic:retained-file',
  sourceSetIds: ['synthetic-set-0', 'synthetic-set-1', 'synthetic-set-2', 'synthetic-set-3'] }
export const recordingProvenance = () => ({ origin: 'imported_unverified', reviewState: 'unreviewed', sourceReferences: ['synthetic:retained-file'] })
export function recordingBlocks() {
  const blocks = measurementBlocks(), performed = blocks[2].segments[0].events[0].performed
  performed.sets = [10, 8, 6, 2, 4, 3, 3, 15].map((reps, i) => ({ reps, load: { value: [50, 90, 120, 155, 185, 185, 185, 135][i], unit: 'lb' },
    ...(i === 3 ? { vbt: true } : i === 2 ? { vbt: false } : {}) }))
  performed.sets[4].velocity = { value: 0.25, unit: 'm/s', metric: 'mean_concentric', device: null, measuredAt: null, vendorNote: 'keep me' }
  performed.sets[5].velocity = null
  blocks[2].segments[0].events[0].prescribed.sets = structuredClone(performed.sets)
  return blocks
}

export const recordingPatches = (recordings: unknown[]) => recordings.map((recording, i) => ({ blockIndex: 2, segmentIndex: 0,
  eventIndex: 0, collection: 'sets', setIndex: i + 3, recording, expectedRecording: null, provenance: recordingProvenance() }))
