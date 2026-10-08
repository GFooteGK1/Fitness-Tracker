import { describe, expect, it } from 'vitest'
import { qualityDimensions, sha256 } from '../../scripts/programming-quality-adjudication'
import { exactTextHash, pendingW10Ledger, validateW10Ledger, type W10Review } from '../../scripts/programming-w10-adjudication'
import { runW10DevelopmentSuite } from '../../scripts/programming-w10-evaluation'
import { buildW10DevelopmentSuite } from '../fixtures/programming-w10-development'

const rubric = 'Synthetic six-dimension rubric fixture; not the real adjudication rubric.'
const manifest = JSON.stringify({ schemaVersion: 1, runId: 'synthetic-validator-fixture', sources: [
  { path: 'docs/verification/programming-quality/baseline-and-rubric.md', sha256: exactTextHash(rubric) },
] })
const report = { ...runW10DevelopmentSuite(buildW10DevelopmentSuite()), runId: 'synthetic-validator-fixture', manifestSha256: exactTextHash(manifest) }
const reportText = JSON.stringify(report), receiptHash = exactTextHash(reportText)
const evidence = { 'synthetic-review': 'Synthetic approval for validator tests only.' }
const source = { id: 'synthetic-review', sha256: sha256(evidence['synthetic-review']), quote: evidence['synthetic-review'] }
const pending = () => pendingW10Ledger(reportText, receiptHash, rubric, manifest)
const validate = (ledger: unknown, sources = evidence) => validateW10Ledger(reportText, receiptHash, rubric, manifest, ledger, sources)
function review(compiled = true): W10Review {
  return { status: 'complete', reviewer: 'Synthetic fixture, not Greg', reviewedAt: '2026-09-28T00:00:00Z',
    decisionSource: 'Synthetic test record', rationale: 'Tests the validator only', expectedDecision: 'Synthetic expected behavior',
    prohibitedInferences: ['No real coaching approval'], source,
    scores: Object.fromEntries(qualityDimensions.map(key => [key, compiled ? 2 : null])) as W10Review['scores'],
    disposition: compiled ? 'usable' : 'appropriate_abstention', criticalErrors: [], unresolvedDisagreements: [] }
}

describe('W10 sourced human-review record integrity', () => {
  it('leaves the real-shaped pending roster unreviewed with no inferred scores or authority', () => {
    expect(validate(pending())).toMatchObject({ valid: true, totalCases: 12, completeReviews: 0, partialReviews: 0,
      recordedUsableCompiledWeeks: 0, calibrationRecorded: false, reviewRecordsComplete: false, w10Complete: false })
  })
  it('separates fully recorded development reviews, usable outputs and correct abstentions', () => {
    const ledger = pending()
    ledger.cases.forEach((row, index) => { row.review = review(index < 2) })
    ledger.calibration = { reviewer: 'Synthetic fixture', rationale: 'Synthetic anchor only', source, caseIds: [ledger.cases[0].caseId] }
    expect(validate(ledger)).toMatchObject({ valid: true, completeReviews: 12, recordedUsableCompiledWeeks: 2,
      recordedAppropriateAbstentions: 10, reviewRecordsComplete: true, unseenCases: 0, w10Complete: false, numericalActivationAuthorized: false })
  })
  it('records a single explicit score without supplying five missing judgments', () => {
    const ledger = pending(), partial = review()
    partial.status = 'partial'; partial.disposition = null
    qualityDimensions.forEach(key => { partial.scores[key] = key === 'prescription_suitability' ? 0 : null })
    ledger.cases[0].review = partial
    expect(validate(ledger)).toMatchObject({ valid: true, partialReviews: 1, completeReviews: 0, recordedUsableCompiledWeeks: 0 })
  })
  it.each(['criticalErrors', 'unresolvedDisagreements'] as const)('preserves %s as a blocking judgment', field => {
    const ledger = pending(); ledger.cases[0].review = review(); ledger.cases[0].review[field] = ['Synthetic unresolved finding']
    expect(validate(ledger)).toMatchObject({ valid: true, completeReviews: 1, unresolvedReviewedCases: 1, recordedUsableCompiledWeeks: 0 })
  })
  it.each(['report', 'rubric', 'input', 'output', 'missing', 'duplicate', 'source', 'quote', 'score', 'null-score', 'disposition', 'calibration', 'conflict'])('rejects stale or contradictory records: %s', field => {
    const ledger = pending(); ledger.cases[0].review = review()
    if (field === 'report') ledger.reportSha256 = '0'.repeat(64)
    if (field === 'rubric') ledger.rubricSha256 = '0'.repeat(64)
    if (field === 'input') ledger.cases[0].inputHash = '0'.repeat(64)
    if (field === 'output') ledger.cases[0].outputHash = '0'.repeat(64)
    if (field === 'missing') ledger.cases.pop()
    if (field === 'duplicate') ledger.cases[1] = structuredClone(ledger.cases[0])
    if (field === 'source') ledger.cases[0].review.source = { ...source, sha256: '0'.repeat(64) }
    if (field === 'quote') ledger.cases[0].review.source = { ...source, quote: 'Fabricated approval' }
    if (field === 'score') Object.assign(ledger.cases[0].review.scores, { evidence_fidelity: '2' })
    if (field === 'null-score') ledger.cases[0].review.scores.evidence_fidelity = null
    if (field === 'disposition') ledger.cases[0].review.disposition = 'appropriate_abstention'
    if (field === 'calibration') ledger.calibration = { reviewer: 'Synthetic', rationale: 'Synthetic', source, caseIds: [ledger.cases[1].caseId] }
    if (field === 'conflict') ledger.cases[0].review.scores.prescription_suitability = 0
    expect(validate(ledger).valid).toBe(false)
    expect(validate(ledger).recordedUsableCompiledWeeks).toBe(0)
  })
  it('rejects report replacement even when a ledger is rebound to it', () => {
    const changed = structuredClone(report); changed.cases[0].output.error = 'Altered'
    expect(validateW10Ledger(JSON.stringify(changed), receiptHash, rubric, manifest, pending(), evidence).valid).toBe(false)
  })
  it('requires the caller to supply the quoted evidence', () => {
    const ledger = pending(); ledger.cases[0].review = review()
    expect(validateW10Ledger(reportText, receiptHash, rubric, manifest, ledger, {}).valid).toBe(false)
  })
  it('retains negative judgments without counting them as usable', () => {
    const ledger = pending(); ledger.cases[0].review = review()
    ledger.cases[0].review.disposition = 'needs_revision'
    ledger.cases[0].review.scores.prescription_suitability = 0
    expect(validate(ledger)).toMatchObject({ valid: true, completeReviews: 1, recordedUsableCompiledWeeks: 0 })
  })
  it('rejects contradictory known scores in partial reviews while preserving unknown dimensions', () => {
    const ledger = pending(); ledger.cases[0].review = review()
    ledger.cases[0].review.status = 'partial'
    ledger.cases[0].review.scores.evidence_fidelity = null
    ledger.cases[0].review.scores.prescription_suitability = 0
    expect(validate(ledger).issues).toContain(`conflicting_usable_scores:${ledger.cases[0].caseId}`)
  })
  it('cannot bind a new rubric to an older report by changing the review ledger', () => {
    const changedRubric = rubric + ' Changed after execution.'
    const ledger = pending(); ledger.rubricSha256 = sha256(changedRubric)
    expect(validateW10Ledger(reportText, receiptHash, changedRubric, manifest, ledger, evidence).issues)
      .toContain('Rubric differs from pre-execution freeze')
    expect(() => pendingW10Ledger(reportText, receiptHash, changedRubric, manifest)).toThrow('Rubric differs from pre-execution freeze')
  })
  it('rejects substitution of the execution manifest', () => {
    expect(validateW10Ledger(reportText, receiptHash, rubric, manifest + '\n', pending(), evidence).issues)
      .toContain('Execution manifest binding mismatch')
  })
})
