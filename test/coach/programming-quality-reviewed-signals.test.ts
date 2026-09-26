import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { evaluateReviewedSignalTraces, reviewedSignalCriteria, type SignalCaseId } from '../../scripts/programming-quality-reviewed-signals'
import { runSignalReviewTraces } from '../../scripts/programming-quality-signal-traces'
import { runDownstreamSignalChecks } from '../../scripts/programming-quality-downstream-signals'

describe('reviewed signal response evaluation', () => {
  let traces: ReturnType<typeof runSignalReviewTraces>
  let report: ReturnType<typeof evaluateReviewedSignalTraces>
  const network = vi.fn(() => { throw new Error('Reviewed signal evaluation is offline') })
  const frozenFiles = ['docs/verification/programming-quality/baseline-report.json', 'docs/verification/programming-quality/signal-traces.json']
  let frozenHashes: string[]
  const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')
  beforeAll(() => {
    vi.stubGlobal('fetch', network)
    frozenHashes = frozenFiles.map(hash)
    traces = runSignalReviewTraces()
    report = evaluateReviewedSignalTraces(traces)
  })
  afterAll(() => {
    try {
      if (process.env.PROGRAMMING_REVIEWED_SIGNALS_REPORT !== '1') return
      const sources = ['scripts/programming-quality-reviewed-signals.ts', 'scripts/programming-quality-downstream-signals.ts', 'scripts/programming-quality-signal-traces.ts', 'scripts/programming-quality-baseline.ts', 'app/lib/coach/adaptation-evaluator.ts', 'app/lib/coach/adaptive-programming-contracts.ts', 'app/lib/coach/targeted-review.ts', 'app/lib/coach/weekly-review.ts', 'app/lib/coach/direction-reconciliation.ts', 'app/lib/coach/rolling-weekly-plan.ts', 'app/lib/coach/weekly-coverage.ts', 'app/lib/coach/session-composer.ts', 'docs/verification/programming-quality/signal-review-decisions.md']
      const downstreamObservations = runDownstreamSignalChecks()
      expect(network).not.toHaveBeenCalled()
      expect(frozenFiles.map(hash)).toEqual(frozenHashes)
      writeFileSync('docs/verification/programming-quality/reviewed-signals-report.json', JSON.stringify({ ...report, downstreamObservations, sourceFingerprintScope: 'Selected evaluation inputs and implementation files, not a complete dependency graph or deployment identity.', sourceHashes: Object.fromEntries(sources.map(file => [file, hash(file)])), frozenArtifactHashes: Object.fromEntries(frozenFiles.map((file, index) => [file, frozenHashes[index]])) }, null, 2) + '\n')
    } finally {
      vi.unstubAllGlobals()
    }
  })
  const status = (result: typeof report, caseId: SignalCaseId, checkId: string) => result.cases.find(item => item.id === caseId)?.checks.find(item => item.id === checkId)?.status

  it('evaluates six agreed criteria without turning agreement or abstention into coaching passes', () => {
    expect(report.counts).toEqual({ cases: 6, checks: 18, pass: 9, fail: 2, notObserved: 7, coachingAssessed: 0 })
    expect(report.cases.every(item => item.agreement.status === 'agreed_qualitative_response' && item.coachingAssessment === 'not_assessed')).toBe(true)
    expect(reviewedSignalCriteria.every(item => item.forbidden.length > 0 && item.pending.length > 0 && item.humanCheck.length > 0)).toBe(true)
    expect(report.holdout).toBe(false)
  })
  it('runs reproducibly offline and preserves historical artifacts and trace labels', () => {
    const before = structuredClone(traces)
    expect(evaluateReviewedSignalTraces(traces)).toEqual(report)
    expect(traces).toEqual(before)
    expect(traces.cases.every(item => item.review.decision === null)).toBe(true)
    expect(frozenFiles.map(hash)).toEqual(frozenHashes)
    expect(network).not.toHaveBeenCalled()
  })
  it('rejects missing or duplicate cases rather than improving scores by shrinking the roster', () => {
    const missing = structuredClone(traces)
    missing.cases.pop()
    expect(() => evaluateReviewedSignalTraces(missing)).toThrow('exactly one trace')
    const duplicate = structuredClone(traces)
    duplicate.cases[1] = duplicate.cases[0]
    expect(() => evaluateReviewedSignalTraces(duplicate)).toThrow('exactly one trace')
  })
  it('detects a diagnostic spike action regression', () => {
    const changed = structuredClone(traces)
    changed.cases.find(item => item.id === 'stable-and-noisy-vbt')!.noisy!.diagnostic.action = 'progress'
    expect(status(evaluateReviewedSignalTraces(changed), 'stable-and-noisy-vbt', 'isolated-spike-does-not-trigger-diagnostic-change')).toBe('fail')
  })
  it('does not claim effort integration merely because effort is present in the input packet', () => {
    expect(traces.cases.find(item => item.id === 'repeated-direct-improvement')!.trace!.context.evidenceSeries.some(series => series.metricId === 'session.rpe')).toBe(true)
    expect(status(report, 'repeated-direct-improvement', 'supplied-effort-reaches-selected-evidence')).toBe('fail')
  })
  it('rejects contamination by a changed protocol and omission of its exclusion record', () => {
    const changed = structuredClone(traces)
    const trace = changed.cases.find(item => item.id === 'changed-protocol')!.trace!.productTargeted!
    trace.context.evidenceIds.push('changed-exposure-1')
    trace.excludedSources = []
    const result = evaluateReviewedSignalTraces(changed)
    expect(status(result, 'changed-protocol', 'exact-confirmed-protocol-evidence')).toBe('fail')
    expect(status(result, 'changed-protocol', 'changed-observations-explicitly-excluded')).toBe('fail')
  })
  it('does not mistake an injected strength series for a performed-work integration', () => {
    const changed = structuredClone(traces)
    const strength = changed.cases.find(item => item.id === 'repeated-direct-improvement')!.trace!
    const mixed = changed.cases.find(item => item.id === 'mixed-vbt-working-performance')!.velocity!
    mixed.context.evidenceSeries.push(structuredClone(strength.context.evidenceSeries[0]))
    mixed.diagnostic.evidenceSnapshot!.series.push(structuredClone(strength.result.evidenceSnapshot!.series[0]))
    expect(status(evaluateReviewedSignalTraces(changed), 'mixed-vbt-working-performance', 'working-performance-reaches-evaluator')).toBe('not_observed')
  })
  it('detects a wrong protocol identifier or contaminated sample despite unchanged observation IDs', () => {
    const changedProtocol = structuredClone(traces)
    changedProtocol.cases.find(item => item.id === 'changed-protocol')!.trace!.productTargeted!.context.evidenceSeries[0].protocol.id = 'unrelated-protocol'
    expect(status(evaluateReviewedSignalTraces(changedProtocol), 'changed-protocol', 'exact-confirmed-protocol-evidence')).toBe('fail')
    const changedSample = structuredClone(traces)
    changedSample.cases.find(item => item.id === 'changed-protocol')!.trace!.productTargeted!.context.evidenceSeries[0].samples[0].comparison.repetitions = 9
    expect(status(evaluateReviewedSignalTraces(changedSample), 'changed-protocol', 'exact-confirmed-protocol-evidence')).toBe('fail')
  })
  it('detects lost performed repetitions and fabricated zero readings', () => {
    const changed = structuredClone(traces)
    const item = changed.cases.find(value => value.id === 'missing-sensor-repetition')!
    item.measurements.knownPerformedRepsPerExposure = [2, 2, 1, 2]
    item.partial!.context.evidenceSeries[0].samples[0].value = 0
    const result = evaluateReviewedSignalTraces(changed)
    expect(status(result, item.id, 'known-performed-work-preserved-in-fixture')).toBe('fail')
    expect(status(result, item.id, 'missing-reading-not-zero-filled')).toBe('fail')
  })
  it('never infers saved-program compliance from an evaluator or pure compiler result', () => {
    expect(status(report, 'schedule-only-correction', 'saved-week-matches-reviewed-reschedule')).toBe('not_observed')
    expect(status(report, 'mixed-vbt-working-performance', 'mixed-evidence-reconciliation')).toBe('not_observed')
  })
  it('rejects a nominally compiled candidate on the wrong or incomplete days', () => {
    const changed = structuredClone(traces)
    const compiler = changed.cases.find(item => item.id === 'schedule-only-correction')!.compiler!
    // Deliberately corrupt the output to a nominally compiled, incomplete week.
    compiler.status = 'compiled'
    compiler.plan = { sessions: [{ day: 'thursday' }] } as NonNullable<typeof compiler.plan>
    expect(status(evaluateReviewedSignalTraces(changed), 'schedule-only-correction', 'ordinary-continuation-produces-reschedule')).toBe('fail')
  })
})
