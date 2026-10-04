import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { runGoalDemandTrace } from '@/scripts/programming-goal-demand-trace'

/** These checks document present gaps; passing is NOT acceptance of goal-conditioned programming.
 * Replace limitation assertions with reviewed positive behaviors when P3 is implemented. */
describe('goal-demand to executable-program trace (current limitations)', () => {
  let report: ReturnType<typeof runGoalDemandTrace>
  const network = vi.fn(() => { throw new Error('Offline trace must not access the network') })
  beforeAll(() => { vi.stubGlobal('fetch', network); report = runGoalDemandTrace() })
  afterAll(() => {
    vi.unstubAllGlobals()
    if (process.env.WRITE_GOAL_DEMAND_TRACE_REPORT !== '1' || !report) return
    const files = [
      'app/lib/coach/complete-intake.ts', 'app/lib/coach/planning-intent-server.ts',
      'app/lib/coach/programming-schema.ts', 'app/lib/coach/programming-policy.ts',
      'app/lib/coach/weekly-coverage.ts', 'app/lib/coach/session-composer.ts',
      'app/lib/coach/adaptive-plan.ts', 'app/lib/coach/rolling-weekly-contracts.ts',
      'app/lib/coach/rolling-weekly-plan.ts', 'app/lib/coach/rolling-weekly-api.ts',
      'scripts/programming-goal-demand-trace.ts', 'test/coach/programming-goal-demand-trace.test.ts'
    ]
    const sourceHashes = Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]))
    const directory = resolve('output/programming-quality-review')
    mkdirSync(directory, { recursive: true })
    writeFileSync(resolve(directory, 'goal-demand-trace.json'), JSON.stringify({ ...report, sourceHashes }, null, 2) + '\n')
  })

  it('preserves changed speed demands but produces identical full serialized session payloads', () => {
    const pair = report.cases.speedQuality
    expect(pair.acceleration.declaredOutcomes[0].qualities).toEqual(['acceleration'])
    expect(pair.maximumVelocity.declaredOutcomes[0].qualities).toEqual(['max_velocity'])
    expect(pair.acceleration.storedIntentHash).not.toBe(pair.maximumVelocity.storedIntentHash)
    expect(pair.fullSessionPayloadsEqual).toBe(true)
    expect(pair.maximumVelocity.adaptiveQualities).toEqual(['acceleration'])
  })

  it('shows the same demand-insensitivity for targetless non-event skill goals', () => {
    const pair = report.cases.nonEventQuality
    expect(pair.force.declaredOutcomes[0].qualities).toEqual(['maximal_strength'])
    expect(pair.capacity.declaredOutcomes[0].qualities).toEqual(['strength_endurance'])
    expect(pair.force.storedIntentHash).not.toBe(pair.capacity.storedIntentHash)
    expect(pair.fullSessionPayloadsEqual).toBe(true)
    expect(pair.capacity.adaptiveQualities).toEqual(['maximal_strength'])
  })

  it('drops an explicitly required secondary maximum-velocity quality before coverage accounting', () => {
    const trace = report.cases.secondaryMaximumVelocity
    expect(trace.declaredOutcomes.some(o => o.qualities.includes('max_velocity'))).toBe(true)
    expect(trace.selectedTargets).toContain('locomotor_acceleration')
    expect(trace.selectedTargets).toContain('deceleration_control')
    expect(trace.selectedTargets).not.toContain('maximum_velocity')
    expect(trace.assignedTargets).not.toContain('maximum_velocity')
    expect(trace.gaps.some(g => g.targetId === 'maximum_velocity')).toBe(false)
    // It is an available primary-domain template, not universally absent from the catalog.
    expect(report.cases.speedQuality.maximumVelocity.selectedTargets).toContain('maximum_velocity')
  })

  it('retains same-domain outcome priorities in storage without changing session allocation', () => {
    const pair = report.cases.sameDomainPriority
    expect(pair.shortFirst.declaredOutcomes).toHaveLength(2)
    expect(pair.shortFirst.adaptiveGoalIds).toHaveLength(1)
    expect(pair.shortFirst.storedIntentHash).not.toBe(pair.longFirst.storedIntentHash)
    expect(pair.fullSessionPayloadsEqual).toBe(true)
  })

  it('rejects a valid four-domain event rather than silently claiming full event coverage', () => {
    const trace = report.cases.fourDomainEvent
    expect(trace.validConfirmedIntent).toBe(true)
    expect(trace.outcomeIds).toHaveLength(4)
    expect(trace.error).toContain('at most three distinct areas')
  })

  it('proves the harness detects executable differences when the primary domain changes', () => {
    expect(report.cases.domainControl.fullSessionPayloadsDiffer).toBe(true)
    expect(report.cases.nonEventQuality.force.movementIds).not.toEqual(report.cases.speedQuality.acceleration.movementIds)
  })

  it('round-trips complete stored-format payloads without input mutation or numerical activation', () => {
    const traces = [report.cases.speedQuality.acceleration, report.cases.speedQuality.maximumVelocity,
      report.cases.nonEventQuality.force, report.cases.nonEventQuality.capacity,
      report.cases.secondaryMaximumVelocity, report.cases.sameDomainPriority.shortFirst, report.cases.sameDomainPriority.longFirst]
    for (const trace of traces) {
      expect(trace.sessionCount).toBeGreaterThan(0)
      expect(trace.storedFormatReadback).toBe(true)
      expect(trace.readbackSessionsMatch).toBe(true)
      expect(trace.readbackIntentMatches).toBe(true)
      expect(trace.sourceInputsUnchanged).toBe(true)
    }
    expect(report.initialDosePolicy).toBe(false)
    expect(report.supportedCoachingBehaviorProven).toBe(false)
    expect(network).not.toHaveBeenCalled()
  })
})
