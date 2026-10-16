import { describe, expect, it } from 'vitest'
import { hasOnlySupervisedReviewFields, parseSupervisedReviewPacket, type SupervisedReviewPacket } from '@/app/lib/coach/supervised-programming-contract'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { effortWorkPlan } from '../fixtures/reviewed-effort-work'
import { intent } from '../fixtures/personalized-coaching/intent'

function packet(): SupervisedReviewPacket {
  const week = effortWorkPlan(), baseWeek = reviewedRollingWeek().plan
  return { schemaVersion: 1, reviewMode: 'manual_complete_week', week, baseWeek, rationale: 'Mechanical contract test only.',
    changes: [{ kind: 'changed', summary: 'Proposed effort-led work.', sessionIds: [week.scheduledSessions[0].prescription.content.id] }],
    evidence: [{ sourceId: 'execution:1', summary: 'No actual athlete result in this fixture.' }],
    evidenceSource: { sourceHash: 'a'.repeat(64), revision: 1, historyThrough: '2026-09-29', historyDays: 28 },
    limitations: ['Requires complete human review; no issuance authority.'] }
}

describe('supervised review packet contract', () => {
  it('retains complete base and proposed executable weeks, independent effort targets, and detached content', () => {
    const input = packet(), parsed = parseSupervisedReviewPacket(input)
    expect(parsed).toEqual(input)
    expect(parsed).not.toBe(input)
    input.week.title = 'Mutated after parsing'
    input.evidence[0].summary = 'Replaced'
    expect(parsed?.week.title).not.toBe(input.week.title)
    expect(parsed?.evidence[0].summary).not.toBe(input.evidence[0].summary)
  })
  it('permits explicit removed work referenced in the accepted base', () => {
    const input = packet()
    input.changes.push({ kind: 'removed', summary: 'Removed base session is explicit.', sessionIds: [input.baseWeek.scheduledSessions[1].prescription.content.id] })
    expect(parseSupervisedReviewPacket(input)).toEqual(input)
    input.changes[1].sessionIds = ['not-in-either-week']
    expect(parseSupervisedReviewPacket(input)).toBeNull()
  })
  it('supports normal optional profile structures without flattening their semantics', () => {
    const profile = structuredClone(packet().week.profileSnapshot)
    Object.assign(profile, {
      trainingIntent: { schemaVersion: 1, memoryId: '00000000-0000-4000-8000-000000000001', memoryVersion: 1, content: intent() },
      exercisePreferences: { schemaVersion: 1, state: 'specified', entries: [{ athleteWording: 'Use a barbell', target: { kind: 'movement', id: 'barbell_bench_press' } }] },
      executionPriority: { goalId: 'strength', movementId: 'barbell_bench_press' },
      planningContext: { version: 'factual', mode: 'factual', userId: 'athlete', asOf: '2026-09-29', startsOn: '2026-09-01', endsOn: '2026-09-29',
        status: 'ready', retrievalComplete: true, loggingCoverage: 'partial', sourceIds: ['workout:1'], movements: [{ movementId: 'barbell_bench_press', workoutId: '1',
          sourcePath: 'blocks[0]', eventDate: '2026-09-28', capturedAt: '2026-09-28T12:00:00Z', revision: 1, snapshotId: '1', origin: 'athlete', reviewState: 'confirmed', completionId: null, familiarityEligible: true }],
        missing: ['outside training unknown'], outsideTraining: { status: 'unknown', sourceIds: [], notes: [] } },
      prescriptionBasis: { version: '1', numericalBasis: 'none', numericPolicyEligible: false, historyAsOf: '2026-09-29', sourceIds: ['workout:1'], familiarityMovementIds: ['barbell_bench_press'], restrictions: [], equipmentIds: ['barbell'], missing: [], statement: 'Manual review required.' },
    })
    // This checks the privacy field boundary, not semantic validation of invented coaching facts.
    expect(hasOnlySupervisedReviewFields(profile, 'profile')).toBe(true)
    Object.assign(profile.trainingIntent!.content.outcomes[0].binding, { rawMemory: { secret: 'hidden' } })
    expect(hasOnlySupervisedReviewFields(profile, 'profile')).toBe(false)
  })
  it('rejects unknown private payloads at every nested reviewer-visible boundary', () => {
    const mutations: Array<(value: SupervisedReviewPacket) => void> = [
      p => { Object.assign(p, { privatePacket: {} }) },
      p => { Object.assign(p.week, { memories: [] }) },
      p => { Object.assign(p.baseWeek.profileSnapshot, { rawWorkouts: [] }) },
      p => { Object.assign(p.week.scheduledSessions[0].prescription.content, { privateSource: {} }) },
      p => { Object.assign(p.week.scheduledSessions[0].prescription.content.steps[0], { rawNotes: [] }) },
      p => { Object.assign(p.evidence[0], { raw: {} }) },
      p => { Object.assign(p.week.profileSnapshot, { athleteGoalSummary: { memories: [] } }) },
      p => { Object.assign(p.week.profileSnapshot.equipment, { resolvedIds: [{ private: true }] }) },
    ]
    for (const mutate of mutations) { const input = packet(); mutate(input); expect(parseSupervisedReviewPacket(input)).toBeNull() }
  })
  it('fails closed on unsupported review modes, missing provenance, duplicates and excessive evidence', () => {
    const mutations: Array<(value: SupervisedReviewPacket) => void> = [
      p => { Object.assign(p, { reviewMode: 'reviewed_load_trial' }) },
      p => { p.evidenceSource.sourceHash = 'unbound' },
      p => { p.evidenceSource.revision = -1 },
      p => { p.changes[0].sessionIds.push(p.changes[0].sessionIds[0]) },
      p => { p.evidence = Array.from({ length: 65 }, () => ({ sourceId: '1', summary: 'Evidence' })) },
      p => { p.evidence[0].summary = 'x'.repeat(4001) },
      p => { p.limitations = [] },
    ]
    for (const mutate of mutations) { const input = packet(); mutate(input); expect(parseSupervisedReviewPacket(input)).toBeNull() }
    const input = packet(); input.evidence[0].summary = 'x'.repeat(4000)
    expect(parseSupervisedReviewPacket(input)).toEqual(input)
  })
})
