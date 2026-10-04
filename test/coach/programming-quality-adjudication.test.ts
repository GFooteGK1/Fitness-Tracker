import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { baselineOutputHash, qualityDimensions, sha256, validateAdjudicationLedger, type AdjudicationLedger, type FrozenBaseline } from '../../scripts/programming-quality-adjudication'

const baselineText = readFileSync('docs/verification/programming-quality/baseline-report.json', 'utf8')
const rubric = readFileSync('docs/verification/programming-quality/baseline-and-rubric.md', 'utf8')
const signals = readFileSync('docs/verification/programming-quality/signal-review-decisions.md', 'utf8')
const baseline: FrozenBaseline = JSON.parse(baselineText)
function pending(): AdjudicationLedger {
  return { schemaVersion: 1, baselineSha256: sha256(baselineText), rubricSha256: sha256(rubric), acceptedSignalsSha256: sha256(signals), calibration: null,
    cases: baseline.cases.map(item => ({ caseId: item.id, inputHash: item.inputHash, outputHash: baselineOutputHash(item), review: null })) }
}
const validate = (ledger: unknown) => validateAdjudicationLedger(baselineText, rubric, signals, ledger)
function syntheticReviewed() {
  const ledger = pending()
  for (const row of ledger.cases) row.review = { reviewer: 'Synthetic validator fixture, not Greg', reviewedAt: '2026-09-26T00:00:00Z', decisionSource: 'synthetic://validator-test', rationale: 'Test data only', expectedDecision: 'Synthetic test expectation', prohibitedInferences: ['Do not treat this test fixture as real coaching approval'], scores: Object.fromEntries(qualityDimensions.map(key => [key, 0])) as NonNullable<typeof row.review>['scores'] }
  ledger.calibration = { reviewer: 'Synthetic validator fixture', decisionSource: 'synthetic://calibration', rationale: 'Test only', caseIds: [ledger.cases[0].caseId] }
  return ledger
}
function syntheticPartial() {
  const ledger = pending()
  ledger.cases[0].review = { ...syntheticReviewed().cases[0].review!, status: 'partial',
    scores: Object.fromEntries(qualityDimensions.map(key => [key, key === 'prescription_suitability' ? 0 : null])) as NonNullable<typeof ledger.cases[0]['review']>['scores'] }
  return ledger
}

describe('development adjudication record integrity', () => {
  it('keeps a complete pending roster unreviewed despite compiled outputs', () => {
    expect(validate(pending())).toMatchObject({ valid: true, reviewedCases: 0, usableCompiledCases: 0, reviewRecordsComplete: false })
  })
  it('binds annotations to exact baseline, rubric and six accepted signal records', () => {
    for (const key of ['baselineSha256', 'rubricSha256', 'acceptedSignalsSha256'] as const) {
      const ledger = pending(); ledger[key] = '0'.repeat(64)
      expect(validate(ledger).issues).toContain(key)
    }
  })
  it('preserves bindings across Windows and Linux text checkouts', () => {
    const crlf = (text: string) => text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
    expect(validateAdjudicationLedger(crlf(baselineText), crlf(rubric), crlf(signals), pending()).valid).toBe(true)
  })
  it('binds the full output rather than only an executable-dose projection', () => {
    const changed = JSON.parse(baselineText)
    changed.cases[0].plan.reviewOnlyNarrative = 'Changed promise to the athlete'
    const text = JSON.stringify(changed)
    const ledger = pending(); ledger.baselineSha256 = sha256(text)
    expect(validateAdjudicationLedger(text, rubric, signals, ledger).issues).toContain(`output:${ledger.cases[0].caseId}`)
  })
  it('rejects omissions, duplicates, extra cases and changed input bindings', () => {
    const removed = pending(); removed.cases.pop(); expect(validate(removed).valid).toBe(false)
    const duplicate = pending(); duplicate.cases[1] = duplicate.cases[0]; expect(validate(duplicate).valid).toBe(false)
    const unknown = pending(); unknown.cases[0].caseId = 'unknown'; expect(validate(unknown).valid).toBe(false)
    const stale = pending(); stale.cases[0].inputHash = 'stale'; expect(validate(stale).valid).toBe(false)
  })
  it('distinguishes complete negative judgments from usable programming', () => {
    expect(validate(syntheticReviewed())).toMatchObject({ valid: true, reviewedCases: 24, usableCompiledCases: 0, calibrationRecorded: true, reviewRecordsComplete: true })
  })
  it('rejects missing dimensions, invalid scores, absent sources and fabricated calibration references', () => {
    const missing = syntheticReviewed(); Reflect.deleteProperty(missing.cases[0].review!.scores, 'athlete_fit')
    expect(validate(missing).valid).toBe(false)
    const invalid = syntheticReviewed(); Object.assign(invalid.cases[0].review!.scores, { athlete_fit: 3 }); expect(validate(invalid).valid).toBe(false)
    const source = syntheticReviewed(); source.cases[0].review!.decisionSource = ''; expect(validate(source).valid).toBe(false)
    const calibration = pending(); calibration.calibration = { reviewer: 'Test', decisionSource: 'test', rationale: 'test', caseIds: [calibration.cases[0].caseId] }; expect(validate(calibration).valid).toBe(false)
  })
  it('allows not-applicable scores only for blocked cases, never as usable weeks', () => {
    const ledger = syntheticReviewed(); const blocked = baseline.cases.findIndex(item => item.status === 'blocked')
    Object.assign(ledger.cases[blocked].review!.scores, { prescription_suitability: null })
    expect(validate(ledger)).toMatchObject({ valid: true, usableCompiledCases: 0 })
    Object.assign(ledger.cases[0].review!.scores, { prescription_suitability: null }); expect(validate(ledger).valid).toBe(false)
  })
  it('retains an explicit failed partial rating without treating unknown dimensions as reviewed or usable', () => {
    const ledger = syntheticPartial()
    expect(validate(ledger)).toMatchObject({ valid: true, partiallyReviewedCases: 1, reviewedCases: 0, usableCompiledCases: 0, calibrationRecorded: false, reviewRecordsComplete: false })
    expect(ledger.cases[0].review!.scores).toMatchObject({ prescription_suitability: 0, athlete_fit: null })
    ledger.calibration = { reviewer: 'Synthetic fixture', decisionSource: 'synthetic://calibration', rationale: 'Test only', caseIds: [ledger.cases[0].caseId] }
    expect(validate(ledger).issues).toContain('calibration')
  })
  it('does not promote a partial record even if all scores are filled; completion must be explicit', () => {
    const ledger = syntheticPartial()
    for (const key of qualityDimensions) ledger.cases[0].review!.scores[key] = 2
    expect(validate(ledger)).toMatchObject({ valid: true, partiallyReviewedCases: 1, reviewedCases: 0, usableCompiledCases: 0 })
    ledger.cases[0].review!.status = 'complete'
    expect(validate(ledger)).toMatchObject({ valid: true, partiallyReviewedCases: 0, reviewedCases: 1, usableCompiledCases: 1, reviewRecordsComplete: false })
  })
  it('rejects empty partial records, invalid states, premature completion and stale partial evidence', () => {
    const empty = syntheticPartial(); for (const key of qualityDimensions) empty.cases[0].review!.scores[key] = null
    expect(validate(empty).issues).toContain(`empty_partial_review:${empty.cases[0].caseId}`)
    const invalid = syntheticPartial(); Object.assign(invalid.cases[0].review!, { status: 'approved' }); expect(validate(invalid).valid).toBe(false)
    const premature = syntheticPartial(); premature.cases[0].review!.status = 'complete'; expect(validate(premature).valid).toBe(false)
    const stale = syntheticPartial(); stale.cases[0].outputHash = 'stale'
    expect(validate(stale)).toMatchObject({ valid: false, partiallyReviewedCases: 0, reviewedCases: 0 })
  })
  it('validates the saved partial human rating without supplying the other five judgments', () => {
    const ledger = JSON.parse(readFileSync('docs/verification/programming-quality/development-adjudication.json', 'utf8'))
    expect(validate(ledger)).toMatchObject({ valid: true, partiallyReviewedCases: 1, reviewedCases: 0, usableCompiledCases: 0, reviewRecordsComplete: false })
    const review = ledger.cases.find((row: { caseId: string }) => row.caseId === 'domain-consistent-full-gym-hypertrophy-3x60').review
    expect(review).toMatchObject({ status: 'partial', reviewer: 'Greg Foote', scores: { prescription_suitability: 0 } })
    expect(qualityDimensions.filter(key => review.scores[key] === null)).toHaveLength(5)
  })
})
