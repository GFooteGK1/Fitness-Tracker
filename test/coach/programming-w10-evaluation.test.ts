import { afterEach, describe, expect, it, vi } from 'vitest'
import * as compiler from '@/app/lib/coach/rolling-weekly-plan'
import { buildW10DevelopmentSuite } from '../fixtures/programming-w10-development'
import { runW10DevelopmentSuite, validateW10Suite, w10Hash } from '../../scripts/programming-w10-evaluation'
import { effortWorkInput } from '../fixtures/reviewed-effort-work'

describe('W10 actual compiler development evidence', () => {
  afterEach(() => vi.restoreAllMocks())
  it('accepts optional full-budget overruns only when required work fits and preserves quality as unvalidated', () => {
    const suite = buildW10DevelopmentSuite(), fixture = effortWorkInput()
    suite.cases[0] = { ...suite.cases[0], id: 'schema3-mechanics-only', family: 'effort-representation',
      input: fixture.input, registry: fixture.registry }
    const report = runW10DevelopmentSuite(suite)
    expect(report.cases[0].mechanicalStatus).toBe('passed')
    expect(report.cases[0].violations).toEqual([])
    expect(report.summary).toMatchObject({ coachingQuality: 'unvalidated', qualifiedUsableWeeks: 0, w10Complete: false })
  })

  it.each(['false full total', 'shorter required slot'])('rejects corrupt optional time accounting: %s', change => {
    const suite = buildW10DevelopmentSuite(), fixture = effortWorkInput(), realCompile = compiler.buildReviewedRollingWeeklyPlan
    suite.cases[0] = { ...suite.cases[0], input: fixture.input, registry: fixture.registry }
    vi.spyOn(compiler, 'buildReviewedRollingWeeklyPlan').mockImplementation((...args) => {
      const result = realCompile(...args)
      if (result.kind === 'reviewed_candidate' && result.plan.scheduledSessions[0].prescription.schemaVersion === 3) {
        if (change === 'false full total') result.plan.scheduledSessions[0].prescription.estimatedSeconds = 435
        else result.plan.scheduledSessions[0].prescription.scheduledMinutes = 1
      }
      return result
    })
    const report = runW10DevelopmentSuite(suite)
    expect(report.cases[0].mechanicalStatus).toBe('failed')
    expect(report.cases[0].violations).toContain('estimated_time_budget:monday')
  })
  it('retains complete positive weeks, ten exact-context abstentions and unreviewed quality', () => {
    const suite = buildW10DevelopmentSuite(), before = w10Hash(suite)
    const report = runW10DevelopmentSuite(suite)
    expect(report.summary).toMatchObject({ total: 12, compiled: 2, abstained: 10, failed: 0, exceptions: 0,
      mechanicalStatus: 'passed', coachingQuality: 'unvalidated', unseenCases: 0, qualifiedUsableWeeks: 0,
      numericalActivationAuthorized: false, w10Complete: false })
    expect(w10Hash(suite)).toBe(before)
    expect(report.cases.every(row => row.outputHash === w10Hash(row.output))).toBe(true)
    expect(report.cases.every(row => Object.values(row.review.scores).every(score => score === null))).toBe(true)
    const result = report.cases[0].output.result
    expect(result?.kind).toBe('reviewed_candidate')
    if (result?.kind !== 'reviewed_candidate') throw new Error('Expected full week')
    expect(result.plan.scheduledSessions).toHaveLength(3)
    expect(result.plan.scheduledSessions[0].prescription.content.steps.find(step => step.id === 'bench-work'))
      .toMatchObject({ sets: 3, load: { value: 170 }, effort: { min: 7, max: 8 }, restBetweenSeconds: 180 })
  })

  it('records unexpected abstention as failure, never as unsupported or a usable week', () => {
    const suite = buildW10DevelopmentSuite()
    suite.cases[0].input.context.currentReviews = []
    const report = runW10DevelopmentSuite(suite)
    expect(report.summary).toMatchObject({ mechanicalStatus: 'failed', failed: 1, qualifiedUsableWeeks: 0 })
    expect(report.cases[0].violations).toContain('unexpected_disposition')
    expect(report.cases[0].expected).toBe('reviewed_candidate')
  })

  it('retains the compiler rejection of malformed input and executes the remaining roster', () => {
    const suite = buildW10DevelopmentSuite()
    Object.defineProperty(suite.cases[0].input.context, 'profile', { value: null, enumerable: true })
    const report = runW10DevelopmentSuite(suite)
    expect(report.cases).toHaveLength(12)
    expect(report.cases[0].mechanicalStatus).toBe('failed')
    expect(report.cases[0].output.result?.kind).toBe('review_required') // Actual compiler catches invalid inputs.
    expect(report.summary.failed).toBe(1)
  })

  it.each(['sequence', 'basis', 'schedule', 'spacing', 'instructions', 'limitations', 'date', 'protocol', 'content'])('catches corrupt compiler output: %s', field => {
    const suite = buildW10DevelopmentSuite(), realCompile = compiler.buildReviewedRollingWeeklyPlan
    vi.spyOn(compiler, 'buildReviewedRollingWeeklyPlan').mockImplementation((...args) => {
      const result = realCompile(...args)
      if (result.kind !== 'reviewed_candidate') return result
      const plan = result.plan
      if (field === 'sequence') plan.sequenceNumber = 999
      if (field === 'basis') plan.basis.contextHash = '0'.repeat(64)
      if (field === 'schedule') plan.baseSchedule.monday = null
      if (field === 'spacing') plan.spacing[0].selectedDays++
      if (field === 'instructions') plan.instructions = []
      if (field === 'limitations') plan.limitations = []
      if (field === 'date') plan.scheduledSessions[0].scheduledDate = plan.windowEnd
      if (field === 'protocol') plan.scheduledSessions[0].prescription.protocols.push({ id: 'unapproved',
        sessionId: plan.scheduledSessions[0].prescription.sessionId, activityId: 'bench-work',
        instructions: ['Unapproved measurement'], sensorMetadata: null, actualObservations: [] })
      if (field === 'content') plan.scheduledSessions[0].prescription.content.instructions.push('Unapproved direction')
      return result
    })
    const report = runW10DevelopmentSuite(suite)
    expect(report.summary.failed).toBe(2)
    expect(report.cases.slice(0, 2).every(row => row.violations.length > 0)).toBe(true)
  })

  it('retains thrown exceptions separately from abstentions without dropping cases', () => {
    const suite = buildW10DevelopmentSuite()
    vi.spyOn(compiler, 'buildReviewedRollingWeeklyPlan').mockImplementation(() => { throw new Error('Synthetic compiler failure') })
    const report = runW10DevelopmentSuite(suite)
    expect(report.summary).toMatchObject({ total: 12, exceptions: 12, abstained: 0, failed: 12, qualifiedUsableWeeks: 0 })
    expect(report.cases.every(row => row.violations.includes('compiler_exception'))).toBe(true)
  })

  it.each(['empty', 'duplicate', 'holdout', 'all-abstention', 'unknown-expectation'])('rejects invalid or misrepresented cohorts: %s', kind => {
    const suite = buildW10DevelopmentSuite()
    if (kind === 'empty') suite.cases = []
    if (kind === 'duplicate') suite.cases[1].id = suite.cases[0].id
    if (kind === 'holdout') Object.assign(suite.cases[0], { origin: 'unseen_holdout' })
    if (kind === 'all-abstention') suite.cases.forEach(row => { row.expected = 'review_required' })
    if (kind === 'unknown-expectation') Object.assign(suite.cases[0], { expected: 'anything' })
    expect(() => validateW10Suite(suite)).toThrow()
  })
})
