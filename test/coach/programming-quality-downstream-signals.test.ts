import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { runDownstreamSignalChecks } from '../../scripts/programming-quality-downstream-signals'

describe('fresh downstream signal characterization', () => {
  const network = vi.fn(() => { throw new Error('Offline downstream checks cannot use the network') })
  let report: ReturnType<typeof runDownstreamSignalChecks>
  beforeAll(() => { vi.stubGlobal('fetch', network); report = runDownstreamSignalChecks() })
  afterAll(() => vi.unstubAllGlobals())

  it('runs reproducibly without changing accepted input or calling a network', () => {
    expect(runDownstreamSignalChecks()).toEqual(report)
    expect(report.directImprovement.acceptedInputUnchanged).toBe(true)
    expect(report.scheduleReplacement.acceptedInputUnchanged).toBe(true)
    expect(network).not.toHaveBeenCalled()
  })

  it('carries actual improvement through the current weekly mapper without forcing progression', () => {
    expect(report.directImprovement.evaluatorAction).toBe('progress')
    expect(report.directImprovement.review.proposal.activePlanUnchanged).toBe(true)
    expect(report.directImprovement.review.selectedMeasurements.some(item => item.metricId === 'strength.load')).toBe(true)
    expect(report.directImprovement.executionInput).toMatchObject({ recoveryContextSupplied: false, workingSetRecordsSupplied: false, checkins: [] })
    expect(report.directImprovement.executionInput.mainPacketMetrics.some(item => item.metricId === 'session.rpe')).toBe(true)
    expect(report.directImprovement.prescriptionsBefore.length).toBeGreaterThan(0)
  })

  it('compiles a confirmed availability replacement and exposes prescription comparisons', () => {
    const result = report.scheduleReplacement
    expect(result.reconciliation.status).toBe('changed')
    expect(result.review.action).toBe('shift_emphasis')
    expect(result.review.doseChange).toBeNull()
    expect(result.compile.status).toBe('compiled')
    expect([...result.compile.days].sort()).toEqual([...result.confirmedDays].sort())
    expect(typeof result.prescriptionMultisetEqual).toBe('boolean')
    expect(result.compile.prescriptionsAfter.length).toBeGreaterThan(0)
    if (process.env.PROGRAMMING_DOWNSTREAM_REPORT === '1') process.stdout.write(JSON.stringify({ direct: { action: report.directImprovement.review.action,
      doseChange: report.directImprovement.review.doseChange, assignmentCount: report.directImprovement.matchingAssignmentCount,
      compile: report.directImprovement.compile.status }, schedule: { days: result.compile.days,
      prescriptionMultisetEqual: result.prescriptionMultisetEqual } }) + '\n')
  })
})
