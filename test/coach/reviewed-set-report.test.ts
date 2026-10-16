import { describe, expect, it } from 'vitest'
import { bindReviewedSetReport, parseReviewedSetReport } from '@/app/lib/coach/reviewed-set-report'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { reviewedSetReport, invalidSetPatches } from '../fixtures/reviewed-set-report'
const session = reviewedRollingWeek().plan.scheduledSessions[1].prescription
const activity = session.content.steps.find(step => step.kind === 'activity' && step.role === 'working')!

describe('reviewed per-set actuals', () => {
  it('preserves independently reported RIR and leaves old reports byte-identical', () => {
    const old = reviewedSetReport(activity.id)
    expect(JSON.stringify(parseReviewedSetReport(old))).toBe(JSON.stringify(old))
    for (const rir of [null, 0, 2.5, 20]) {
      const report = { ...old, schemaVersion: 2, rir }
      expect(bindReviewedSetReport(session, report)?.report).toEqual(report)
      expect(parseReviewedSetReport(report)?.rpe).toEqual(old.rpe)
    }
  })
  it.each([{ schemaVersion: 1, rir: null }, { schemaVersion: 2 }, { schemaVersion: '2', rir: null },
    { schemaVersion: 2, rir: -1 }, { schemaVersion: 2, rir: Infinity }, { schemaVersion: 2, rir: '2' },
    { schemaVersion: 2, rir: 1001 }])('rejects malformed RIR/version %j', patch => {
    expect(parseReviewedSetReport({ ...reviewedSetReport(activity.id), ...patch })).toBeNull()
  })
  it('requires unknown effort for unperformed sets', () => {
    const omitted = { ...reviewedSetReport(activity.id), schemaVersion: 2, rir: null, status: 'not_performed',
      repetitions: null, load: null, rpe: null, restAfterSeconds: null }
    expect(parseReviewedSetReport(omitted)).toEqual(omitted)
    expect(parseReviewedSetReport({ ...omitted, rir: 2 })).toBeNull()
  })
  it('binds exact saved activity, retains unknowns, RPE scale and original prescription', () => {
    const report = reviewedSetReport(activity.id), result = bindReviewedSetReport(session, report)
    expect(result).toMatchObject({ report, activity, prescription: session, exceedsPrescribedSets: false })
    expect(result?.report.velocity).toBeNull()
    result!.report.repetitions = 5
    expect(report.repetitions).toBe(6)
  })
  it('preserves extra actual sets without changing prescribed sets', () => {
    expect(bindReviewedSetReport(session, { ...reviewedSetReport(activity.id), setNumber: 100 })?.exceedsPrescribedSets).toBe(true)
  })
  it('keeps zeros distinct from missing values and retains rep sensor provenance', () => {
    const report = { ...reviewedSetReport(activity.id), load: { value: 0, unit: 'lb', convention: 'total' },
      velocity: { unit: 'm/s', device: 'Qwik', method: 'video mean concentric', repetitions: [{ rep: 1, meanConcentricVelocity: 0 }] } }
    expect(parseReviewedSetReport(report)).toEqual(report)
  })
  it.each(invalidSetPatches)('rejects unsupported or malformed actuals %j', patch => {
    expect(parseReviewedSetReport({ ...reviewedSetReport(activity.id), ...patch })).toBeNull()
  })
  it('requires explicit nulls and rejects wrong identity or side', () => {
    const report: Record<string, unknown> = { ...reviewedSetReport(activity.id) }; delete report.rpe
    expect(parseReviewedSetReport(report)).toBeNull()
    expect(bindReviewedSetReport(session, reviewedSetReport('missing'))).toBeNull()
    expect(bindReviewedSetReport(session, { ...reviewedSetReport(activity.id), side: 'left' })).toBeNull()
  })
})
