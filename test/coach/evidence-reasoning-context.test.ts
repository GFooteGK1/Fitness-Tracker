import { describe, expect, it } from 'vitest'
import { projectEvidenceReasoningContext } from '@/app/lib/coach/evidence-reasoning-context'
import { reasoningEvidencePacket } from '../fixtures/coach-reasoning-evidence'

describe('evidence reasoning projection', () => {
  it('retains complete goal content and individual measurements with source and protocol provenance', () => {
    const packet = reasoningEvidencePacket()
    const result = projectEvidenceReasoningContext(packet, 'test-user-123')
    expect(result.memories[0].content).toEqual(packet.memories[0].content)
    expect(result.evidenceSeries[0].samples).toEqual(packet.evidenceSeries[0].samples)
    expect(result.evidenceSeries[0].samples.map(sample => sample.value)).toEqual([0.57, 0.52])
    expect(result.coverage.included.samples).toBe(2)
    expect(result.authority).toBe('factual_context_only')
  })

  it('changes the reasoning input when a measured value is corrected without creating a prescription', () => {
    const packet = reasoningEvidencePacket()
    const before = projectEvidenceReasoningContext(packet, 'test-user-123')
    packet.evidenceSeries[0].samples[1].value = 0.48
    packet.evidenceSeries[0].samples[1].originalMeasurement.value = 0.48
    const after = projectEvidenceReasoningContext(packet, 'test-user-123')
    expect(after.evidenceSeries[0].samples[1].value).toBe(0.48)
    expect(before.evidenceSeries[0].samples[1].value).toBe(0.52)
    expect(after).not.toHaveProperty('prescription')
  })

  it('omits a whole series when the record budget cannot fit it and reports incomplete coverage', () => {
    const packet = reasoningEvidencePacket()
    const memorySize = JSON.stringify(packet.memories[0]).length
    const result = projectEvidenceReasoningContext(packet, 'test-user-123', memorySize + 1)
    expect(result.memories).toHaveLength(1)
    expect(result.evidenceSeries).toEqual([])
    expect(result.coverage.omitted).toEqual([{ kind: 'evidence_series', id: 'velocity-series-v1', reason: 'record_budget' }])
    expect(result.coverage.selected.samples).toBe(2)
    expect(result.coverage.included.samples).toBe(0)
    expect(result.coverage.complete).toBe(false)
  })

  it('does not merge changed protocols or fill missing sensor reps', () => {
    const packet = reasoningEvidencePacket()
    const changed = structuredClone(packet.evidenceSeries[0])
    changed.id = 'velocity-series-v2'
    changed.protocol.version = '2.0.0'
    changed.comparabilityKey = 'comparison-v1|synthetic-bench-70kg-triple'
    changed.samples = changed.samples.slice(0, 1).map(sample => ({ ...sample,
      protocol: { ...changed.protocol }, comparabilityKey: changed.comparabilityKey,
      comparison: { ...sample.comparison, repetitions: 3 },
    }))
    changed.sampleCount = 1
    packet.evidenceSeries.push(changed)
    packet.sampleCount = 3
    const result = projectEvidenceReasoningContext(packet, 'test-user-123')
    expect(result.evidenceSeries.map(series => series.samples.length)).toEqual([2, 1])
    expect(result.evidenceSeries.map(series => series.protocol.version)).toEqual(['1.0.0', '2.0.0'])
    expect(result.evidenceSeries[1].samples[0].comparison.repetitions).toBe(3)
  })

  it('retains normalized and original measurement units independently', () => {
    const packet = reasoningEvidencePacket()
    const sample = packet.evidenceSeries[0].samples[0]
    sample.metricId = 'jump.height'
    sample.value = 50.8
    sample.unit = 'cm'
    sample.originalMeasurement = { value: 20, unit: 'in' }
    const projected = projectEvidenceReasoningContext(packet, 'test-user-123').evidenceSeries[0].samples[0]
    expect(projected.value).toBe(50.8)
    expect(projected.originalMeasurement).toEqual({ value: 20, unit: 'in' })
  })

  it('preserves source truncation, errors and correction exclusions rather than claiming full history', () => {
    const packet = reasoningEvidencePacket()
    packet.selectionComplete = false
    packet.storageAvailable = false
    packet.limits.sourceTruncated = true
    packet.missing = ['observation_values_unavailable']
    packet.executionExclusions = [{ observationId: 'old-observation', workoutId: 'workout-amended', reason: 'execution_amended_or_deleted' }]
    const result = projectEvidenceReasoningContext(packet, 'test-user-123')
    expect(result.coverage.complete).toBe(false)
    expect(result.coverage.projectionComplete).toBe(true)
    expect(result.coverage.missing).toContain('observation_values_unavailable')
    expect(result.coverage.executionExclusions).toEqual(packet.executionExclusions)
    expect(result.coverage.sourceLimits.sourceTruncated).toBe(true)
  })

  it('rejects another athlete packet before projecting private values', () => {
    expect(() => projectEvidenceReasoningContext(reasoningEvidencePacket(), 'someone-else')).toThrow('ownership mismatch')
  })

  it('passes value provenance and the bounded source exclusion ledger to chat coverage', () => {
    const packet = reasoningEvidencePacket()
    packet.evidenceSeries[0].samples[0].valueProvenance = { origin: 'athlete_reported', reviewState: 'corrected' }
    packet.selectionExclusions = { records: [{ kind: 'observation_value', id: 'value-1', reason: 'value_provenance_invalid_or_oversized' }],
      countsByReason: { value_provenance_invalid_or_oversized: 130 }, omittedCount: 129, complete: false }
    packet.selectionComplete = false
    const context = projectEvidenceReasoningContext(packet, 'test-user-123')
    expect(context.coverage.selectionExclusions).toEqual(packet.selectionExclusions)
    expect(context.coverage.complete).toBe(false)
    expect(context.evidenceSeries[0].samples[0].valueProvenance).toEqual({ origin: 'athlete_reported', reviewState: 'corrected' })
    context.coverage.selectionExclusions!.records[0].reason = 'projection-only edit'
    expect(packet.selectionExclusions.records[0].reason).toBe('value_provenance_invalid_or_oversized')
  })

  it.each([0, -1, 1.5, NaN, Infinity, 64_001])('rejects invalid record budget %s', budget => {
    expect(() => projectEvidenceReasoningContext(reasoningEvidencePacket(), 'test-user-123', budget)).toThrow('record budget')
  })
})
