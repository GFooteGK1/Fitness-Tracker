import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { developmentCases, runBaselineCase, type BaselineCase } from '../../scripts/programming-quality-baseline'
import { compareReviewedWeek, verifyReviewedWeek, type ReviewedWeek } from '../../scripts/programming-quality-reviewed-week'

const reference: ReviewedWeek = JSON.parse(readFileSync('test/fixtures/reviewed-hypertrophy-week.json', 'utf8'))
const source = readFileSync(reference.source.path, 'utf8')
// Accepted review binds the original input, not the evolving full-gym catalog.
const baseline = JSON.parse(readFileSync('docs/verification/programming-quality/baseline-report.json', 'utf8'))
const testCase: BaselineCase = baseline.cases.find((item: { id: string }) => item.id === reference.source.baselineCaseId).input
const inputHash = createHash('sha256').update(JSON.stringify(testCase)).digest('hex')
if (inputHash !== reference.source.inputHash) throw new Error('Frozen reviewed input changed')
const current = runBaselineCase(testCase)
const compare = () => compareReviewedWeek(reference, source, current)

describe('accepted hypertrophy week: mechanical compiler gap reference', () => {
  afterAll(() => {
    // Optional ignored diagnostic artifact; never replaces the frozen baseline.
    if (process.env.PROGRAMMING_REVIEWED_WEEK_REPORT !== '1') return
    mkdirSync('output/programming-quality-review', { recursive: true })
    writeFileSync('output/programming-quality-review/reviewed-hypertrophy-compiler-gaps.json', JSON.stringify(compare(), null, 2) + '\n')
  })

  it('binds the accepted source and preserves per-side work, rest and set-level RPE without inventing actuals', () => {
    expect(verifyReviewedWeek(reference, source)).toEqual([
      { day: 'monday', workingSetsOrRounds: 11, estimatedSeconds: 2790, marginSeconds: 810 },
      { day: 'tuesday', workingSetsOrRounds: 12, estimatedSeconds: 3036, marginSeconds: 564 },
      { day: 'wednesday', workingSetsOrRounds: 12, estimatedSeconds: 3006, marginSeconds: 594 },
    ])
    expect(reference.sessions.flatMap(session => session.exercises).every(exercise => exercise.actualRpe === null && exercise.load === null)).toBe(true)
    expect(verifyReviewedWeek(reference, source.replace(/\r?\n/g, '\r\n'))).toHaveLength(3)
  })

  it.each(['sets', 'rpe', 'side_count', 'actual_effort', 'load'] as const)('rejects unreviewed %s drift despite an unchanged source hash', field => {
    const changed = structuredClone(reference)
    if (field === 'sets') changed.sessions[0].exercises[0].sets++
    if (field === 'rpe') changed.sessions[0].exercises[0].targetRpe.max = 10
    if (field === 'side_count') changed.sessions[1].exercises[4].sides = 1
    if (field === 'actual_effort') Object.assign(changed.sessions[0].exercises[0], { actualRpe: 8 })
    if (field === 'load') Object.assign(changed.sessions[0].exercises[0], { load: 100 })
    expect(() => verifyReviewedWeek(changed, source)).toThrow('Reviewed prescription changed')
  })

  it('rejects stale source, changed input and inflated review authority', () => {
    expect(() => verifyReviewedWeek(reference, source + 'extra')).toThrow('Reviewed source changed')
    expect(() => compareReviewedWeek(reference, source, { ...current, inputHash: 'different' })).toThrow('Case input changed')
    const changed = structuredClone(reference)
    Object.assign(changed.source, { runtimeAuthority: true })
    expect(() => verifyReviewedWeek(changed, source)).toThrow('Review authority drift')
  })

  it('keeps evolving development input separate from the accepted comparison', () => {
    const evolving = developmentCases().find(item => item.id === reference.source.baselineCaseId)!
    expect(evolving.profile.equipment.resolvedIds).toContain('trap_bar_high_handles')
    expect(testCase.profile.equipment.resolvedIds).not.toContain('trap_bar_high_handles')
    expect(() => compareReviewedWeek(reference, source, runBaselineCase(evolving))).toThrow('Case input changed')
  })

  it('reports the real current compiler and catalog gaps without scoring an alternative as physiologically wrong', () => {
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('No network permitted') })
    try {
      const actual = runBaselineCase(testCase)
      const report = compareReviewedWeek(reference, source, actual)
      expect(report.currentStatus).toBe('compiled')
      // Current characterization only: update this evidence when the real implementation changes.
      expect(report.currentWorkingExercises).toBe(6)
      expect(report.currentWorkingRpeTargets).toBe(0)
      expect(report.missingWorkingRpeTargets).toHaveLength(6)
      expect(report.missingPreparationRpeTargets).toHaveLength(3)
      expect(report.catalogGaps).toHaveLength(14)
      expect(report.catalogGaps.some(gap => gap.name === 'Lat pulldown')).toBe(true)
      expect(report.qualityScores).toBeNull()
      expect(report.runtimeAuthority).toBe(false)
      expect(report.equipmentConfirmation).toContain('unconfirmed')
      expect(network).not.toHaveBeenCalled()
    } finally { network.mockRestore() }
  })

  it('detects dose and RPE differences even when a prescription has the reviewed movement name', () => {
    const changed = structuredClone(current)
    const wednesday = changed.plan!.sessions.find(session => session.day === 'wednesday')!
    const working = wednesday.blocks.flatMap(block => block.exercises).find(exercise => exercise.role !== 'specific_preparation')!
    working.movementName = 'Dumbbell Romanian deadlift'
    working.movementId = 'dumbbell_romanian_deadlift'
    working.dose = { kind: 'sets_reps', sets: { min: 2, max: 2 }, repetitions: { min: 6, max: 15 } }
    working.executionTarget = { kind: 'rir', range: { min: 2, max: 3 } }
    const differences = compareReviewedWeek(reference, source, changed).prescriptionDifferences
    expect(differences).toContainEqual(expect.objectContaining({
      name: 'Dumbbell Romanian deadlift', fields: expect.arrayContaining(['sets_or_repetitions', 'explicit_rpe_target']),
    }))
  })

  it('does not treat a blocked compiler as a successful empty week', () => {
    const report = compareReviewedWeek(reference, source, { ...current, plan: null, error: 'unsupported' })
    expect(report.currentStatus).toBe('blocked')
    expect(report.compilerError).toBe('unsupported')
    expect(report.missingNamedPrescriptions).toHaveLength(15)
    expect(report.qualityScores).toBeNull()
  })
})
