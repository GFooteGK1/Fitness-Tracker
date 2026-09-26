import { writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { runSignalReviewTraces } from '../../scripts/programming-quality-signal-traces'

describe('synthetic evidence-to-action signal traces', () => {
  let report: ReturnType<typeof runSignalReviewTraces>
  const network = vi.fn(() => { throw new Error('Offline signal review must not call the network') })
  beforeAll(() => { vi.stubGlobal('fetch', network); report = runSignalReviewTraces() })
  afterAll(() => {
    vi.unstubAllGlobals()
    if (process.env.PROGRAMMING_SIGNAL_REPORT === '1') writeFileSync('docs/verification/programming-quality/signal-traces.json', JSON.stringify(report, null, 2) + '\n')
  })

  it('retains six reproducible worked cases with measurements, reviewer questions and pending labels', () => {
    expect(report.cases).toHaveLength(6)
    expect(report.cases.every(item => item.synthetic && item.review.decision === null && item.question.length > 20)).toBe(true)
    expect(runSignalReviewTraces()).toEqual(report)
    expect(network).not.toHaveBeenCalled()
  })

  it('calculates stable/noisy velocity summaries without inventing product numerical eligibility', () => {
    const item = report.cases.find(item => item.id === 'stable-and-noisy-vbt')!
    expect(item.stable!.diagnostic.evidenceSnapshot?.series[0].trend).toBe('stable')
    expect(item.noisy!.diagnostic.evidenceSnapshot?.series[0].trend).toBe('stable')
    expect(item.noisy!.diagnostic.evidenceSnapshot?.series[0].supportingExposureCount).toBe(1)
    expect(item.stable!.productTargeted.evaluator.missing).toContain('outcome_policy_adapter_unavailable')
    expect(item.noisy!.productTargeted.evaluator.proposalRecommendation.eligible).toBe(false)
  })

  it('reports repeated direct improvement as a review action without generating a numerical dose', () => {
    const item = report.cases.find(item => item.id === 'repeated-direct-improvement')!
    expect(item.trace!.result.action).toBe('progress')
    expect(item.trace!.result.proposalRecommendation.numericChangeStatus).toBe('athlete_input_required')
    expect(item.trace!.result.proposalRecommendation.activePlanUnchanged).toBe(true)
  })

  it('keeps contradictory working-performance facts outside unsupported automatic VBT decisions', () => {
    const item = report.cases.find(item => item.id === 'mixed-vbt-working-performance')!
    expect(item.velocity!.diagnostic.evidenceSnapshot?.series[0].trend).toBe('worsening')
    expect(item.velocity!.productTargeted.evaluator.missing).toContain('outcome_policy_adapter_unavailable')
    expect(item.measurements.reportedWork).toHaveLength(4)
    expect(item.velocity!.context.evidenceSeries.every(series => series.metricId === 'bar.mean_velocity')).toBe(true)
  })

  it('does not pool changed protocol observations to create a four-exposure direct trend', () => {
    const item = report.cases.find(item => item.id === 'changed-protocol')!
    const direct = item.trace!.result.evidenceSnapshot?.series.filter(series => series.semanticRole === 'direct_outcome') ?? []
    expect(direct).toHaveLength(1)
    expect(direct[0].exposureCount).toBe(2)
    expect(item.trace!.result.action).not.toBe('progress')
    expect(item.trace!.result.evidenceSnapshot?.excludedObservations.some(item => item.reason === 'incompatible_comparability_series')).toBe(true)
    expect(item.trace!.productTargeted!.context.evidenceSeries.every(series => series.protocol.version === '1.0.0')).toBe(true)
    expect(item.trace!.productTargeted!.context.evidenceIds).toEqual(['standard-exposure-1', 'standard-exposure-2'])
    expect(item.trace!.productTargeted!.excludedSources.some(source => source.observationId.startsWith('changed-'))).toBe(true)
  })

  it('preserves missing sensor data and exposes the generic evaluator lack of expected-repetition completeness', () => {
    const item = report.cases.find(item => item.id === 'missing-sensor-repetition')!
    expect(item.complete!.diagnostic.evidenceSnapshot?.series[0].sampleCount).toBe(8)
    expect(item.partial!.diagnostic.evidenceSnapshot?.series[0].sampleCount).toBe(7)
    expect(item.partial!.diagnostic.evidenceSnapshot?.series[0].exposureCount).toBe(4)
    expect(item.measurements.knownPerformedRepsPerExposure).toEqual([2, 2, 2, 2])
    expect(item.partial!.context.evidenceSeries[0].samples.every(sample => sample.value !== 0)).toBe(true)
  })

  it('preserves the schedule-only compiler blocker rather than falsely classifying it as physiological decline', () => {
    const item = report.cases.find(item => item.id === 'schedule-only-correction')!
    expect(item.compiler!.status).toBe('blocked')
    expect(item.compiler!.error).toContain('cannot silently change schedule')
    expect(item.compiler!.reviewDecision?.action).toBe('continue')
  })
})
