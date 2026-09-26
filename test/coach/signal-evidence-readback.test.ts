import { describe, expect, it } from 'vitest'
import { buildSignalEvidenceContext } from '@/app/lib/coach/signal-evidence-context'
import { decodeSignalEvidenceContext } from '@/app/lib/coach/signal-evidence-readback'
import { buildPerformedWorkContext } from '@/app/lib/coach/performed-work-context'
import { projectCoachingDecisionContext, projectAcceptedCoachingDecisionOrigin, renderCoachingDecisionContext } from '@/app/lib/coach/coaching-decision-context'
import { reasoningEvidencePacket } from '../fixtures/coach-reasoning-evidence'
import { workSnapshot } from '../fixtures/coach-performed-work'
import { coachingDecisionRows } from '../fixtures/coaching-decision-record'

function fixture() {
  const packet = reasoningEvidencePacket('user-1'), work = workSnapshot()
  work.userId = 'user-1'; work.asOf = packet.asOf; work.workouts[0].user_id = 'user-1'; work.workouts[0].rpe = 7
  for (const sample of packet.evidenceSeries[0].samples) {
    sample.workoutId = 'work-1'; sample.comparison.movementId = 'barbell_floor_press'
    sample.valueProvenance = { origin: 'athlete_reported', measurementCoverage: { version: 1, expectedSensorReadings: 3, performedRepetitions: 4 } }
  }
  return { packet, work, context: buildSignalEvidenceContext(packet, 'user-1', buildPerformedWorkContext(work)) }
}

describe('strict saved signal evidence readback', () => {
  it.each(['absent', 'different', 'mixed', 'invalid'])('rejects fabricated counts against %s reading metadata', mutation => {
    const { context } = fixture()
    if (mutation === 'absent') context.observations[0].readings.forEach(reading => { reading.valueProvenance = null })
    else if (mutation === 'mixed') context.observations[0].readings[0].valueProvenance = null
    else context.observations[0].readings[0].valueProvenance = { measurementCoverage: { version: 1,
      expectedSensorReadings: mutation === 'invalid' ? -1 : 9, performedRepetitions: 4 } }
    expect(decodeSignalEvidenceContext(context, 'user-1', context.asOf)).toBeNull()
  })

  it.each(['complete', 'conflicting', 'unknown'])('roundtrips builder-derived %s counts and large valid ordinals', kind => {
    const { packet } = fixture()
    packet.evidenceSeries[0].samples[0].ordinal = 10_001
    for (const sample of packet.evidenceSeries[0].samples) sample.valueProvenance = kind === 'unknown' ? undefined
      : { measurementCoverage: { version: 1, expectedSensorReadings: 2, performedRepetitions: 4 } }
    if (kind === 'conflicting') packet.evidenceSeries[0].samples[0].valueProvenance = undefined
    const context = buildSignalEvidenceContext(packet, 'user-1')
    expect(context.observations[0].sensorCoverage).toBe(kind === 'complete' ? 'reported_complete' : kind)
    expect(decodeSignalEvidenceContext(context, 'user-1', context.asOf)).toEqual(context)
  })

  it('preserves a near-budget saved decision with explicit optional factual omission and unknown historical freshness', () => {
    const rows = coachingDecisionRows(), { context } = fixture()
    rows.review.rationale.messages = Array.from({ length: 11 }, () => 'x'.repeat(1_900))
    const before = projectCoachingDecisionContext(rows)
    expect(before.status).toBe('current')
    const review = { ...rows.review, rationale: { ...rows.review.rationale, signalEvidence: context } }
    const projected = projectCoachingDecisionContext({ ...rows, review })
    expect(projected.status).toBe('current')
    expect(projected.decision?.signalEvidence).toBeUndefined()
    expect(projected.decision?.signalEvidenceOmitted).toBe('record_budget')
    expect(JSON.stringify(projected.decision).length).toBeLessThanOrEqual(24_000)
    const proposal = { ...rows.proposal, status: 'accepted' }
    const acceptedPlan = { id: 'plan-2', user_id: 'user-1', program_id: 'program-1', status: 'accepted', plan_mode: 'rolling_weekly', intent: {} }
    const origin = projectAcceptedCoachingDecisionOrigin({ ...rows, review, proposal, acceptedPlan, acceptedPlanVersionId: 'plan-2' })
    expect(origin).toMatchObject({ sourceStatus: 'unknown', decision: { signalEvidenceOmitted: 'record_budget' } })
  })

  it.each([false, true])('retains factual origin with conservative historical source status, corrected=%s', sourceInvalidated => {
    const rows = coachingDecisionRows(), { context } = fixture()
    const review = { ...rows.review, rationale: { ...rows.review.rationale, signalEvidence: context } }
    const proposal = { ...rows.proposal, status: 'accepted' }
    const acceptedPlan = { id: 'plan-2', user_id: 'user-1', program_id: 'program-1', status: 'accepted', plan_mode: 'rolling_weekly', intent: {} }
    const origin = projectAcceptedCoachingDecisionOrigin({ ...rows, review, proposal, acceptedPlan, acceptedPlanVersionId: 'plan-2', sourceInvalidated })
    expect(origin).toMatchObject({ sourceStatus: sourceInvalidated ? 'corrected' : 'unknown', decision: { signalEvidence: context } })
  })
  it('roundtrips actual readings, separate counts and linked work with uncertainty as factual context', () => {
    const { context } = fixture(), decoded = decodeSignalEvidenceContext(context, 'user-1', context.asOf)
    expect(decoded).toEqual(context)
    expect(decoded?.observations[0]).toMatchObject({ observedReadings: 2, counts: { expectedSensorReadings: 3, performedRepetitions: 4 }, sensorCoverage: 'reported_incomplete',
      readings: [{ value: 0.57 }, { value: 0.52 }], workingEvidence: [{ completionState: 'not_independently_verified', sessionEffort: { scope: 'session', value: 7 } }] })
    decoded!.observations[0].readings[0].value = 999
    expect(context.observations[0].readings[0].value).toBe(0.57)
  })

  it('keeps retrieval truncation separate from sensor completeness and supports duplicate reading conflicts', () => {
    const { packet } = fixture()
    packet.selectionComplete = false
    const partial = buildSignalEvidenceContext(packet, 'user-1')
    expect(partial.observations[0].sensorCoverage).toBe('unknown')
    expect(decodeSignalEvidenceContext(partial, 'user-1', packet.asOf)).toEqual(partial)
    packet.evidenceSeries[0].samples.push(structuredClone(packet.evidenceSeries[0].samples[0]))
    const duplicate = buildSignalEvidenceContext(packet, 'user-1')
    expect(duplicate.observations[0].sensorCoverage).toBe('conflicting')
    expect(decodeSignalEvidenceContext(duplicate, 'user-1', packet.asOf)).toEqual(duplicate)
  })

  it.each(['owner', 'asOf', 'version', 'authority', 'numeric', 'count', 'reading_identity', 'working_identity', 'quantity', 'session_scope', 'oversized', 'projection_count'])(
    'rejects malformed %s without returning partial trusted data', mutation => {
      const { context } = fixture(), observation = context.observations[0], working = observation.workingEvidence[0]
      const variants: Record<string, unknown> = {
        owner: { ...context, userId: 'foreign-private' }, asOf: { ...context, asOf: '2026-09-20T12:00:00.000Z' }, version: { ...context, version: 'unknown' },
        authority: { ...context, authority: 'numerical_policy' }, numeric: { ...context, numericPolicyEligible: true },
        count: { ...context, observations: [{ ...observation, observedReadings: 9 }] },
        reading_identity: { ...context, observations: [{ ...observation, readingIds: ['unrelated'] }] },
        working_identity: { ...context, observations: [{ ...observation, workingEvidence: [{ ...working, workoutId: 'foreign-workout' }] }] },
        quantity: { ...context, observations: [{ ...observation, workingEvidence: [{ ...working, quantities: { ...working.quantities, repetitions: { kind: 'exact', value: -1, sourcePath: 'reps' } } }] }] },
        session_scope: { ...context, observations: [{ ...observation, workingEvidence: [{ ...working, sessionEffort: { ...working.sessionEffort, scope: 'working_set' } }] }] },
        oversized: { ...context, limitations: ['x'.repeat(20_000)] }, projection_count: { ...context, coverage: { ...context.coverage, omittedObservations: 1 } }
      }
      expect(decodeSignalEvidenceContext(variants[mutation], 'user-1', context.asOf)).toBeNull()
    })

  it('projects stored factual evidence into shared chat and keeps old records compatible', () => {
    const rows = coachingDecisionRows(), { context } = fixture()
    expect(projectCoachingDecisionContext(rows).status).toBe('current')
    const review = { ...rows.review, rationale: { ...rows.review.rationale, signalEvidence: context } }
    const projected = projectCoachingDecisionContext({ ...rows, review })
    expect(projected.decision?.signalEvidence).toEqual(context)
    expect(JSON.parse(renderCoachingDecisionContext(projected, rows.userId)).decision.signalEvidence).toEqual(context)
    review.rationale.signalEvidence.userId = 'foreign-private'
    const invalid = projectCoachingDecisionContext({ ...rows, review })
    expect(invalid).toMatchObject({ status: 'invalid', decision: null })
    expect(JSON.stringify(invalid)).not.toContain('foreign-private')
  })
})
