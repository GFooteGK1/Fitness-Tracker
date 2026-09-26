import { describe, expect, it } from 'vitest'
import { buildSignalEvidenceContext } from '@/app/lib/coach/signal-evidence-context'
import { buildPerformedWorkContext } from '@/app/lib/coach/performed-work-context'
import { decodeSignalEvidenceContext } from '@/app/lib/coach/signal-evidence-readback'
import { workSnapshot } from '../fixtures/coach-performed-work'
import { runSignalReviewTraces } from '../../scripts/programming-quality-signal-traces'

function fixture() {
  const packet = structuredClone(runSignalReviewTraces().cases.find(item => item.id === 'missing-sensor-repetition')!.partial!.context)
  const snapshot = workSnapshot()
  snapshot.userId = packet.scope.userId
  snapshot.asOf = packet.asOf
  snapshot.workouts[0].user_id = packet.scope.userId
  snapshot.workouts[0].id = packet.evidenceSeries[0].samples[0].workoutId!
  snapshot.workouts[0].workout_date = '2026-08-31'
  snapshot.workouts[0].rpe = 7
  return { packet, work: buildPerformedWorkContext(snapshot) }
}
function reportedCounts(packet: ReturnType<typeof fixture>['packet'], expected = 2, performed = 2) {
  for (const sample of packet.evidenceSeries[0].samples) sample.valueProvenance = {
    origin: 'athlete_reported', reviewState: 'athlete_confirmed',
    measurementCoverage: { version: 1, expectedSensorReadings: expected, performedRepetitions: performed }
  }
}

describe('factual signal evidence context', () => {
  it('keeps unknown measurement counts unknown despite prescribed repetitions and ordinal gaps', () => {
    const { packet } = fixture()
    const result = buildSignalEvidenceContext(packet, packet.scope.userId)
    expect(result.observations).toHaveLength(4)
    expect(result.observations[2]).toMatchObject({ observedReadings: 1, counts: { expectedSensorReadings: null, performedRepetitions: null }, sensorCoverage: 'unknown' })
    expect(result.coverage.performedWork).toBe('not_supplied')
    expect(result.numericPolicyEligible).toBe(false)
  })
  it('separates reported performed repetitions from sensor completeness and preserves actual values/provenance', () => {
    const { packet } = fixture()
    reportedCounts(packet)
    const result = buildSignalEvidenceContext(packet, packet.scope.userId)
    expect(result.observations[2]).toMatchObject({ observedReadings: 1, counts: { expectedSensorReadings: 2, performedRepetitions: 2, status: 'reported' }, sensorCoverage: 'reported_incomplete', interpretation: 'review_required' })
    expect(result.observations[2].readings[0]).toMatchObject({ value: 0.50, ordinal: 1, valueProvenance: { origin: 'athlete_reported' } })
    expect(result.observations[2].limitations).toContain('missing_readings_do_not_imply_unperformed_repetitions')
    expect(result.observations[0].sensorCoverage).toBe('reported_complete')
  })
  it.each(['selection', 'storage'] as const)('does not mislabel %s retrieval incompleteness as sensor loss', type => {
    const { packet } = fixture()
    reportedCounts(packet)
    if (type === 'selection') packet.selectionComplete = false
    else packet.storageAvailable = false
    const result = buildSignalEvidenceContext(packet, packet.scope.userId)
    expect(result.coverage.measurementRetrievalComplete).toBe(false)
    expect(result.observations.every(row => row.sensorCoverage === 'unknown')).toBe(true)
    expect(result.observations[2].counts.performedRepetitions).toBe(2)
  })
  it('does not turn conflicting reported counts into a completed protocol', () => {
    const { packet } = fixture()
    reportedCounts(packet)
    packet.evidenceSeries[0].samples[0].valueProvenance!.measurementCoverage = { version: 1, expectedSensorReadings: 3, performedRepetitions: 2 }
    const row = buildSignalEvidenceContext(packet, packet.scope.userId).observations[0]
    expect(row.counts.status).toBe('conflicting_or_invalid')
    expect(row.sensorCoverage).toBe('conflicting')
  })
  it.each([-1, 1.5, Infinity, '2'])('does not coerce invalid count %s', expectedSensorReadings => {
    const { packet } = fixture()
    for (const sample of packet.evidenceSeries[0].samples) sample.valueProvenance = { measurementCoverage: { version: 1, expectedSensorReadings, performedRepetitions: 2 } }
    expect(buildSignalEvidenceContext(packet, packet.scope.userId).observations.every(row => row.counts.status === 'conflicting_or_invalid')).toBe(true)
  })
  it('links same-workout same-movement work without claiming protocol equivalence or set effort from session effort', () => {
    const { packet, work } = fixture()
    const result = buildSignalEvidenceContext(packet, packet.scope.userId, work)
    const linked = result.observations[0].workingEvidence[0]
    expect(linked).toMatchObject({ workoutId: work.records[0].workoutId, match: 'same_workout_and_movement_context_only',
      quantities: { sets: { kind: 'exact', value: 4 }, repetitions: { kind: 'bounded', min: 2, max: 3 } },
      recordedWeight: { value: '175 lb' }, protocol: 'paused', sessionEffort: { value: 7, scope: 'session' } })
    expect(linked.completionState).toBe(work.records[0].completionState)
    expect(linked.limitations).toEqual(work.records[0].limitations)
    expect(result.observations[1].workingEvidence).toEqual([])
    expect(result.observations[0].counts.performedRepetitions).toBeNull()
  })
  it('does not join by movement alone, date alone, or an explicitly unperformed record', () => {
    for (const kind of ['workout', 'movement', 'completion'] as const) {
      const { packet, work } = fixture()
      if (kind === 'workout') work.records[0].workoutId = 'different-workout'
      if (kind === 'movement') work.records[0].movementId = 'barbell_back_squat'
      if (kind === 'completion') work.records[0].completionState = 'explicitly_not_completed'
      expect(buildSignalEvidenceContext(packet, packet.scope.userId, work).observations.every(row => row.workingEvidence.length === 0)).toBe(true)
    }
  })
  it('rejects foreign ownership and mismatched as-of instead of merging snapshots', () => {
    const { packet, work } = fixture()
    expect(() => buildSignalEvidenceContext(packet, 'other')).toThrow('ownership')
    expect(() => buildSignalEvidenceContext(packet, packet.scope.userId, { ...work, userId: 'other' })).toThrow('ownership')
    expect(() => buildSignalEvidenceContext(packet, packet.scope.userId, { ...work, asOf: '2026-09-20T12:00:00Z' })).toThrow('snapshot')
  })
  it('flags duplicate readings and mismatched sample protocol instead of certifying completeness', () => {
    const { packet } = fixture()
    reportedCounts(packet)
    packet.evidenceSeries[0].samples.push(structuredClone(packet.evidenceSeries[0].samples[0]))
    const result = buildSignalEvidenceContext(packet, packet.scope.userId)
    expect(result.observations[0].sensorCoverage).toBe('conflicting')
    expect(result.observations[0].observedReadings).toBe(2)
    expect(result.observations[0].limitations).toContain('duplicate_reading_identity')
    packet.evidenceSeries[0].samples[0].protocol.version = 'changed'
    const modified = buildSignalEvidenceContext(packet, packet.scope.userId)
    expect(modified.observations[0].workingEvidence).toEqual([])
    expect(modified.observations[0].limitations).toContain('conflicting_sample_identity')
  })
  it('omits whole oversized observations explicitly and never modifies inputs', () => {
    const { packet, work } = fixture()
    packet.evidenceSeries[0].samples[0].valueProvenance = { text: 'x'.repeat(13_000) }
    const before = structuredClone({ packet, work })
    const result = buildSignalEvidenceContext(packet, packet.scope.userId, work)
    expect(result.coverage).toMatchObject({ projectionComplete: false, omittedObservations: 1 })
    expect(result.observations).toHaveLength(3)
    expect({ packet, work }).toEqual(before)
  })
  it('omits unsupported deep metadata while retaining a valid saved-review projection', () => {
    const { packet, work } = fixture()
    let nested: Record<string, unknown> = { detail: 'untrusted metadata' }
    for (let level = 0; level < 14; level += 1) nested = { nested }
    packet.evidenceSeries[0].samples[0].valueProvenance = nested
    const result = buildSignalEvidenceContext(packet, packet.scope.userId, work)
    expect(result.coverage).toMatchObject({ projectionComplete: false, omittedObservations: 1 })
    expect(decodeSignalEvidenceContext(result, packet.scope.userId, packet.asOf)).toEqual(result)
  })
  it('keeps a large recorded ordinal without treating it as an expected sensor count', () => {
    const { packet } = fixture()
    packet.evidenceSeries[0].samples[0].ordinal = 20_000
    const result = buildSignalEvidenceContext(packet, packet.scope.userId)
    expect(result.observations[0].readings[0].ordinal).toBe(20_000)
    expect(result.observations[0].counts.expectedSensorReadings).toBeNull()
    expect(decodeSignalEvidenceContext(result, packet.scope.userId, packet.asOf)).toEqual(result)
  })
  it('treats an empty movement identifier as unknown without losing the saved review', () => {
    const { packet, work } = fixture()
    for (const sample of packet.evidenceSeries[0].samples) sample.comparison.movementId = ''
    const result = buildSignalEvidenceContext(packet, packet.scope.userId, work)
    expect(result.observations.every(row => row.movementId === null && row.workingEvidence.length === 0)).toBe(true)
    expect(decodeSignalEvidenceContext(result, packet.scope.userId, packet.asOf)).toEqual(result)
  })
  it('does not apply a sensor-count limit to a working record revision', () => {
    const { packet, work } = fixture()
    work.records[0].revision = 20_000
    const result = buildSignalEvidenceContext(packet, packet.scope.userId, work)
    expect(result.observations[0].workingEvidence[0].revision).toBe(20_000)
    expect(decodeSignalEvidenceContext(result, packet.scope.userId, packet.asOf)).toEqual(result)
  })
})
