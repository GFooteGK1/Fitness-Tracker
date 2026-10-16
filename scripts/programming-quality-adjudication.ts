/** Review bookkeeping only: never infers coaching scores or numerical authority. */
import { createHash } from 'node:crypto'

export const qualityDimensions = [
  'evidence_fidelity', 'athlete_fit', 'prescription_suitability',
  'whole_week_feasibility', 'monitoring_judgment', 'executable_consistency',
] as const

export type QualityDimension = typeof qualityDimensions[number]
type BaselineCase = { id: string; inputHash: string; status: 'compiled' | 'blocked'; plan: unknown; error: unknown }
export type FrozenBaseline = { cases: BaselineCase[] }
export type HumanReview = {
  /** Omission preserves legacy complete-review semantics; partial never qualifies. */
  status?: 'partial' | 'complete'
  reviewer: string
  reviewedAt: string
  decisionSource: string
  rationale: string
  expectedDecision: string
  prohibitedInferences: string[]
  scores: Record<QualityDimension, 0 | 1 | 2 | null>
}
export type AdjudicationLedger = {
  schemaVersion: 1
  baselineSha256: string
  rubricSha256: string
  acceptedSignalsSha256: string
  calibration: null | { reviewer: string; decisionSource: string; rationale: string; caseIds: string[] }
  cases: { caseId: string; inputHash: string; outputHash: string; review: HumanReview | null }[]
}

// Git may check these text files out with CRLF. Bind canonical LF text, preserving
// escaped newlines inside JSON values and every other source/output character.
export const sha256 = (value: string) => createHash('sha256').update(value.replace(/\r\n/g, '\n')).digest('hex')
export const baselineOutputHash = (item: BaselineCase) => sha256(JSON.stringify({ status: item.status, plan: item.plan, error: item.error }))
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Bind human records to full frozen output, not the narrower executable projection. */
export function validateAdjudicationLedger(
  baselineText: string, rubricText: string, acceptedSignalsText: string, raw: unknown,
) {
  const baseline = JSON.parse(baselineText) as FrozenBaseline
  if (!Array.isArray(baseline.cases) || baseline.cases.length !== 24
    || new Set(baseline.cases.map(item => item.id)).size !== 24) throw new Error('Expected the frozen 24-case development baseline')
  const issues: string[] = []
  const reviewed = new Set<string>()
  const partiallyReviewed = new Set<string>()
  let usableCompiledCases = 0
  const ledger = record(raw) ? raw : {}
  if (ledger.schemaVersion !== 1) issues.push('schema_version')
  for (const [key, text] of Object.entries({ baselineSha256: baselineText, rubricSha256: rubricText, acceptedSignalsSha256: acceptedSignalsText })) {
    if (ledger[key] !== sha256(text)) issues.push(key)
  }
  const rows = Array.isArray(ledger.cases) ? ledger.cases : []
  if (rows.length !== baseline.cases.length) issues.push('case_count')
  const seen = new Set<string>()
  for (const value of rows) {
    if (!record(value) || !nonempty(value.caseId)) { issues.push('invalid_case'); continue }
    const id = value.caseId
    if (seen.has(id)) issues.push(`duplicate:${id}`)
    seen.add(id)
    const source = baseline.cases.find(item => item.id === id)
    if (!source) { issues.push(`unknown:${id}`); continue }
    if (value.inputHash !== source.inputHash) issues.push(`input:${id}`)
    if (value.outputHash !== baselineOutputHash(source)) issues.push(`output:${id}`)
    if (value.review === null) continue
    const review = value.review
    if (!record(review) || !['reviewer', 'reviewedAt', 'decisionSource', 'rationale', 'expectedDecision'].every(key => nonempty(review[key]))
      || !Number.isFinite(Date.parse(String(review.reviewedAt)))
      || !Array.isArray(review.prohibitedInferences) || review.prohibitedInferences.length === 0
      || !review.prohibitedInferences.every(nonempty) || !record(review.scores)) {
      issues.push(`review:${id}`); continue
    }
    const scores = review.scores
    const partial = review.status === 'partial'
    if (Object.hasOwn(review, 'status') && review.status !== 'partial' && review.status !== 'complete') {
      issues.push(`review_status:${id}`); continue
    }
    if (Object.keys(scores).length !== qualityDimensions.length
      || qualityDimensions.some(key => !Object.hasOwn(scores, key)
        || !(scores[key] === 0 || scores[key] === 1 || scores[key] === 2 || ((partial || source.status === 'blocked') && scores[key] === null)))) {
      issues.push(`scores:${id}`); continue
    }
    if (partial) {
      // Null is unreviewed in a partial record, not a passing or NA judgment.
      if (qualityDimensions.every(key => scores[key] === null)) {
        issues.push(`empty_partial_review:${id}`); continue
      }
      partiallyReviewed.add(id)
      continue
    }
    reviewed.add(id)
    if (source.status === 'compiled' && qualityDimensions.every(key => scores[key] === 2)) usableCompiledCases++
  }
  for (const source of baseline.cases) if (!seen.has(source.id)) issues.push(`missing:${source.id}`)
  const calibration = ledger.calibration
  let calibrationRecorded = false
  if (calibration !== null) {
    if (!record(calibration) || !['reviewer', 'decisionSource', 'rationale'].every(key => nonempty(calibration[key]))
      || !Array.isArray(calibration.caseIds) || calibration.caseIds.length === 0
      || new Set(calibration.caseIds).size !== calibration.caseIds.length
      || calibration.caseIds.some(id => typeof id !== 'string' || !reviewed.has(id))) issues.push('calibration')
    else calibrationRecorded = true
  }
  const valid = issues.length === 0
  return {
    valid, issues, totalCases: baseline.cases.length,
    reviewedCases: valid ? reviewed.size : 0,
    partiallyReviewedCases: valid ? partiallyReviewed.size : 0,
    usableCompiledCases: valid ? usableCompiledCases : 0,
    calibrationRecorded: valid && calibrationRecorded,
    reviewRecordsComplete: valid && reviewed.size === baseline.cases.length && calibrationRecorded,
    limitation: 'Checks record integrity, not reviewer identity, professional qualification, coaching correctness, P0 completion or release authority.',
  }
}
