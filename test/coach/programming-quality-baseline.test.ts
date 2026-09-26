import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { developmentCases, executableProjection, runBaselineCase, runDevelopmentBaseline } from '../../scripts/programming-quality-baseline'

// A passing characterization suite does not imply any prescription is appropriate.
describe('programming quality: current offline compiler characterization', () => {
  let report: ReturnType<typeof runDevelopmentBaseline>
  const network = vi.fn(() => { throw new Error('Network is prohibited in the offline baseline') })
  beforeAll(() => {
    vi.stubGlobal('fetch', network)
    report = runDevelopmentBaseline()
  })
  afterAll(() => {
    vi.unstubAllGlobals()
    if (process.env.PROGRAMMING_QUALITY_REPORT !== '1') return
    const files = [
      'scripts/programming-quality-baseline.ts', 'test/coach/golden-programming-profiles.ts',
      'app/lib/coach/planning-context.ts', 'app/lib/coach/planning-history.ts',
      'app/lib/coach/rolling-weekly-plan.ts', 'app/lib/coach/rolling-weekly-contracts.ts',
      'app/lib/coach/programming-schema.ts', 'app/lib/coach/programming-policy.ts',
      'app/lib/coach/session-composer.ts', 'app/lib/coach/weekly-coverage.ts',
    ]
    const sourceHashes = Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]))
    const directory = resolve('docs/verification/programming-quality')
    mkdirSync(directory, { recursive: true })
    writeFileSync(resolve(directory, 'baseline-report.json'), JSON.stringify({ ...report, sourceHashes }, null, 2) + '\n')
  })
  const result = (id: string) => report.cases.find(item => item.id === id)!

  it('runs twenty-four visible, reproducible cases across nineteen failure/domain families without quality labels', () => {
    expect(report.cases).toHaveLength(24)
    expect(new Set(report.cases.map(item => item.id)).size).toBe(24)
    expect(new Set(report.cases.map(item => item.family)).size).toBe(19)
    expect(runDevelopmentBaseline()).toEqual(report)
    expect(report.counts.qualityPassed).toBe(0)
    expect(report.cases.every(item => item.quality.scores === null)).toBe(true)
    expect(report.qualifiedReview.owner).toBeNull()
    expect(report.holdout.fixturesCreated).toBe(false)
    expect(network).not.toHaveBeenCalled()
  })

  it('retains complete executable weeks for the six existing supported domain profiles', () => {
    for (const item of report.cases.filter(candidate => candidate.id.startsWith('domain-'))) {
      expect(item.error, item.id).toBeNull()
      expect(item.plan?.sessions.length, item.id).toBeGreaterThan(0)
      expect(item.plan?.scheduledSessions.length, item.id).toBe(item.plan?.sessions.length)
    }
  })

  it('characterizes the performed-dose gap using different actual input quantities and identical final prescriptions', () => {
    const volume = result('history-volume')
    const heavy = result('history-heavy')
    expect(volume.input.history?.workouts[0].blocks).not.toEqual(heavy.input.history?.workouts[0].blocks)
    expect(volume.context?.movements.length).toBeGreaterThan(0)
    expect(volume.preparedProfile.recentTraining.performedMovementIds).toContain('barbell_floor_press')
    expect(volume.preparedProfile.recentTraining.doseByCoverageTarget).toEqual([])
    expect(heavy.preparedProfile.recentTraining.doseByCoverageTarget).toEqual([])
    expect(volume.status).toBe('compiled')
    expect(heavy.status).toBe('compiled')
    expect(volume.executableHash).toBe(heavy.executableHash)
  })

  it('keeps partial history blocked and empty logging coverage unknown', () => {
    expect(result('history-partial').status).toBe('blocked')
    expect(result('history-partial').error).toContain('unavailable or incomplete')
    expect(result('history-empty').context).toMatchObject({ status: 'cold_start', loggingCoverage: 'unknown' })
  })

  it('records outside training while exposing unchanged compiled work', () => {
    const unknown = result('outside-unknown')
    const practice = result('outside-practice')
    expect(practice.context?.outsideTraining.status).toBe('reported')
    expect(unknown.status).toBe('compiled')
    expect(practice.status).toBe('compiled')
    expect(unknown.executableHash).toBe(practice.executableHash)
  })

  it('exposes annotation-only velocity monitoring without new sets or numeric execution changes', () => {
    const item = result('velocity-monitoring-request')
    expect(item.status).toBe('compiled')
    expect(item.plan?.changeSummary.assessmentSignal?.protocolId).toBe('strength.fixed_load_velocity.v1')
    expect(item.plan?.changeSummary.assessmentSignal?.movementId).toBe('barbell_floor_press')
    expect(executableProjection(item.plan!)).toEqual(executableProjection(item.prior!))
    const instructions = item.plan!.sessions.flatMap(session => session.blocks.flatMap(block => block.exercises.map(exercise => exercise.intent)))
    expect(instructions.some(text => text.includes('bar.mean_velocity'))).toBe(true)
  })

  it('retains real unsupported profile and ordinary-continuation errors', () => {
    expect(result('availability-correction').status).toBe('blocked')
    expect(result('availability-correction').error).toContain('cannot silently change schedule')
    expect(result('four-domain-event').status).toBe('blocked')
    expect(result('four-domain-event').error).toContain('two secondary')
    expect(result('twenty-minute-budget').status).toBe('blocked')
    expect(result('twenty-minute-budget').error).toContain('30 through 90')
  })

  it('does not mutate development inputs or the prior week while compiling a review', () => {
    const inputs = developmentCases()
    const before = structuredClone(inputs)
    inputs.map(runBaselineCase)
    expect(inputs).toEqual(before)
    const item = result('velocity-monitoring-request')
    expect(item.prior?.changeSummary.assessmentSignal).toBeNull()
    expect(item.prior?.windowStart).toBe('2026-09-21')
  })

  it('preserves corrected revisions and distinct same-day sessions without producing numerical training sums', () => {
    const corrected = result('history-corrected-revision')
    expect(corrected.status).toBe('compiled')
    expect(corrected.context?.movements[0]).toMatchObject({ revision: 2, reviewState: 'corrected', capturedAt: '2026-09-18T18:00:00.000Z' })
    expect(corrected.executableHash).toBe(result('history-heavy').executableHash)
    const sessions = result('history-two-same-day-sessions')
    expect(sessions.status).toBe('compiled')
    expect(sessions.context?.sourceIds).toHaveLength(2)
    expect(sessions.preparedProfile.recentTraining.completedSessionCount).toBe(2)
    expect(sessions.preparedProfile.recentTraining.doseByCoverageTarget).toEqual([])
  })

  it('keeps confirmed estimates, unreviewed imports and unknown working loads distinguishable', () => {
    const estimate = result('history-confirmed-estimate')
    expect(estimate.status).toBe('compiled')
    expect(estimate.context?.movements[0]).toMatchObject({ origin: 'model_estimated', reviewState: 'athlete_confirmed', familiarityEligible: false })
    expect(estimate.preparedProfile.recentTraining.performedMovementIds).toEqual([])
    const imported = result('history-unreviewed-import')
    expect(imported.status).toBe('compiled')
    expect(imported.context?.movements).toEqual([])
    const unknown = result('history-unknown-load')
    expect(unknown.status).toBe('compiled')
    expect(unknown.input.history?.workouts[0].blocks).toEqual([{ movements: [{ name: 'Barbell floor press', sets: 3, reps: 8 }] }])
    expect(unknown.plan?.sessions.flatMap(session => session.blocks.flatMap(block => block.exercises)).every(exercise => exercise.loadAnchor === undefined)).toBe(true)
  })

  it('characterizes saved assessment anchoring and the ignored assessment variation', () => {
    const matched = result('assessment-matched')
    const variation = result('assessment-variation-changed')
    expect(matched.status).toBe('compiled')
    expect(variation.status).toBe('compiled')
    const anchors = matched.plan!.sessions.flatMap(session => session.blocks.flatMap(block => block.exercises))
      .filter(exercise => exercise.loadAnchor?.source === 'saved_assessment')
    expect(anchors.length).toBeGreaterThan(0)
    expect(anchors.every(exercise => exercise.movementId === 'barbell_back_squat')).toBe(true)
    expect(matched.input.profile.assessments[0].variation).toBeNull()
    expect(variation.input.profile.assessments[0].variation).toBe('Box squat to parallel')
    expect(matched.executableHash).toBe(variation.executableHash)
  })

  it('retains every confirmed five-day opportunity while recording actual composed and unused days', () => {
    const item = result('five-sixty-minute-opportunities')
    expect(item.status).toBe('compiled')
    expect(item.plan?.profileSnapshot.sessionAvailability).toHaveLength(5)
    const available = new Set(item.input.profile.sessionAvailability.map(day => day.day))
    expect(item.plan!.sessions.every(session => available.has(session.day))).toBe(true)
    const represented = new Set([...item.plan!.sessions.map(session => session.day), ...item.plan!.uncomposedAvailableDays.map(item => item.day)])
    expect(represented).toEqual(available)
    expect(item.input.profile.sessionAvailability.every(day => day.minutes === 60)).toBe(true)
  })
})
