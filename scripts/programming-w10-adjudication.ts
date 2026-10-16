/** Human-review record integrity only. No generated scores or runtime authority. */
import { createHash } from 'node:crypto'
import { qualityDimensions, sha256, type HumanReview } from './programming-quality-adjudication'
import { w10Hash, type runW10DevelopmentSuite } from './programming-w10-evaluation'

type Report = ReturnType<typeof runW10DevelopmentSuite> & { runId: string; manifestSha256: string }
type Source = { id: string; sha256: string; quote: string }
export type W10Review = HumanReview & {
  status: 'partial' | 'complete'
  source: Source
  disposition: 'usable' | 'needs_revision' | 'appropriate_abstention' | 'inappropriate_abstention' | 'execution_failure' | null
  criticalErrors: string[]
  unresolvedDisagreements: string[]
}
export interface W10Ledger {
  schemaVersion: 1
  runId: string
  reportSha256: string
  rubricSha256: string
  cases: { caseId: string; inputHash: string; outputHash: string; review: W10Review | null }[]
  calibration: null | { reviewer: string; rationale: string; source: Source; caseIds: string[] }
}
export const exactTextHash = (text: string) => createHash('sha256').update(text).digest('hex')
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const texts = (value: unknown): value is string[] => Array.isArray(value) && value.every(nonempty)

/** The caller supplies a digest from the separately retained execution receipt. */
function verifiedReport(text: string, expectedReportHash: string, rubricText: string, executionManifestText: string): Report {
  if (exactTextHash(text) !== expectedReportHash) throw new Error('Frozen report receipt mismatch')
  const report = JSON.parse(text) as Report
  if (report.manifestSha256 !== exactTextHash(executionManifestText)) throw new Error('Execution manifest binding mismatch')
  const manifest = JSON.parse(executionManifestText)
  if (manifest.schemaVersion !== 1 || manifest.runId !== report.runId || !Array.isArray(manifest.sources)) throw new Error('Invalid execution manifest')
  const rubricEntries = manifest.sources.filter((source: { path?: unknown }) => source.path === 'docs/verification/programming-quality/baseline-and-rubric.md')
  if (rubricEntries.length !== 1 || rubricEntries[0].sha256 !== exactTextHash(rubricText)) throw new Error('Rubric differs from pre-execution freeze')
  if (report.schemaVersion !== 1 || !nonempty(report.runId)
    || report.purpose !== 'development_harness_verification' || !Array.isArray(report.cases)
    || report.cases.length === 0 || new Set(report.cases.map(row => row.caseId)).size !== report.cases.length) throw new Error('Invalid development report')
  for (const row of report.cases) {
    if (!nonempty(row.caseId) || row.origin !== 'exposed_development'
      || !row.input || row.input.id !== row.caseId || row.inputHash !== w10Hash(row.input)
      || !row.output || row.outputHash !== w10Hash(row.output)
      || !['passed', 'failed'].includes(row.mechanicalStatus) || !texts(row.violations)
      || (row.mechanicalStatus === 'passed') !== (row.violations.length === 0)) throw new Error('Invalid report case binding')
  }
  return report
}

export function pendingW10Ledger(reportText: string, expectedReportHash: string, rubricText: string, executionManifestText: string): W10Ledger {
  const report = verifiedReport(reportText, expectedReportHash, rubricText, executionManifestText)
  return { schemaVersion: 1, runId: report.runId, reportSha256: expectedReportHash, rubricSha256: sha256(rubricText),
    cases: report.cases.map(row => ({ caseId: row.caseId, inputHash: row.inputHash, outputHash: row.outputHash, review: null })), calibration: null }
}

/** Evidence is an explicit caller-supplied map; ledger text never opens arbitrary paths. */
export function validateW10Ledger(reportText: string, expectedReportHash: string, rubricText: string, executionManifestText: string,
  raw: unknown, evidence: Readonly<Record<string, string>>) {
  const issues: string[] = []
  let report: Report | null = null
  try { report = verifiedReport(reportText, expectedReportHash, rubricText, executionManifestText) }
  catch (error) { issues.push(error instanceof Error ? error.message : 'Invalid report') }
  const ledger = record(raw) ? raw : {}
  if (ledger.schemaVersion !== 1 || ledger.runId !== report?.runId) issues.push('ledger_identity')
  if (ledger.reportSha256 !== expectedReportHash) issues.push('report_binding')
  if (ledger.rubricSha256 !== sha256(rubricText)) issues.push('rubric_binding')
  const sourceValid = (value: unknown): boolean => record(value) && nonempty(value.id)
    && Object.hasOwn(evidence, value.id) && typeof evidence[value.id] === 'string'
    && value.sha256 === sha256(evidence[value.id]) && nonempty(value.quote)
    && evidence[value.id].replace(/\r\n/g, '\n').includes(value.quote.replace(/\r\n/g, '\n'))
  const rows = Array.isArray(ledger.cases) ? ledger.cases : []
  if (rows.length !== report?.cases.length) issues.push('case_count')
  const seen = new Set<string>(), complete = new Set<string>(), partial = new Set<string>()
  let recordedUsable = 0, recordedAppropriateAbstentions = 0, unresolved = 0
  for (const row of rows) {
    if (!record(row) || !nonempty(row.caseId)) { issues.push('invalid_case'); continue }
    const id = row.caseId
    if (seen.has(id)) issues.push(`duplicate:${id}`)
    seen.add(id)
    const actual = report?.cases.find(item => item.caseId === id)
    if (!actual) { issues.push(`unknown:${id}`); continue }
    if (row.inputHash !== actual.inputHash || row.outputHash !== actual.outputHash) issues.push(`case_binding:${id}`)
    if (row.review === null) continue
    const review = row.review
    if (!record(review) || !['partial', 'complete'].includes(String(review.status))
      || !['reviewer', 'reviewedAt', 'decisionSource', 'rationale', 'expectedDecision'].every(key => nonempty(review[key]))
      || !Number.isFinite(Date.parse(String(review.reviewedAt))) || !sourceValid(review.source)
      || !texts(review.prohibitedInferences) || review.prohibitedInferences.length === 0
      || !texts(review.criticalErrors) || !texts(review.unresolvedDisagreements) || !record(review.scores)) {
      issues.push(`review:${id}`); continue
    }
    const scores = review.scores, compiled = actual.output.result?.kind === 'reviewed_candidate'
    const isPartial = review.status === 'partial'
    if (Object.keys(scores).length !== qualityDimensions.length || qualityDimensions.some(dimension => {
      const score = scores[dimension]
      return !Object.hasOwn(scores, dimension) || !(score === 0 || score === 1 || score === 2
        || (score === null && (isPartial || !compiled)))
    })) { issues.push(`scores:${id}`); continue }
    const disposition = review.disposition
    const permitted = compiled ? ['usable', 'needs_revision'] : actual.output.result?.kind === 'review_required'
      ? ['appropriate_abstention', 'inappropriate_abstention'] : ['execution_failure']
    if (!(isPartial && disposition === null) && !permitted.includes(String(disposition))) { issues.push(`disposition:${id}`); continue }
    const hasIssues = review.criticalErrors.length > 0 || review.unresolvedDisagreements.length > 0
    if (hasIssues) unresolved++
    if (disposition === 'usable' && qualityDimensions.some(dimension => scores[dimension] !== null && scores[dimension] !== 2)) {
      issues.push(`conflicting_usable_scores:${id}`); continue
    }
    if (isPartial) {
      if (qualityDimensions.every(dimension => scores[dimension] === null) && disposition === null) { issues.push(`empty_partial:${id}`); continue }
      partial.add(id); continue
    }
    complete.add(id)
    const allUsable = qualityDimensions.every(dimension => scores[dimension] === 2)
    if (!hasIssues && actual.mechanicalStatus === 'passed') {
      if (compiled && disposition === 'usable' && allUsable) recordedUsable++
      if (!compiled && actual.output.result?.kind === 'review_required' && disposition === 'appropriate_abstention') recordedAppropriateAbstentions++
    }
  }
  for (const row of report?.cases ?? []) if (!seen.has(row.caseId)) issues.push(`missing:${row.caseId}`)
  let calibrationRecorded = false
  if (ledger.calibration !== null) {
    const calibration = ledger.calibration
    if (!record(calibration) || !nonempty(calibration.reviewer) || !nonempty(calibration.rationale)
      || !sourceValid(calibration.source) || !texts(calibration.caseIds) || calibration.caseIds.length === 0
      || new Set(calibration.caseIds).size !== calibration.caseIds.length || calibration.caseIds.some(id => !complete.has(id))) issues.push('calibration')
    else calibrationRecorded = true
  }
  const valid = issues.length === 0
  return { valid, issues, totalCases: report?.cases.length ?? 0,
    completeReviews: valid ? complete.size : 0, partialReviews: valid ? partial.size : 0,
    recordedUsableCompiledWeeks: valid ? recordedUsable : 0,
    recordedAppropriateAbstentions: valid ? recordedAppropriateAbstentions : 0,
    unresolvedReviewedCases: valid ? unresolved : 0, calibrationRecorded: valid && calibrationRecorded,
    reviewRecordsComplete: valid && calibrationRecorded && complete.size === report?.cases.length,
    unseenCases: 0, numericalActivationAuthorized: false, w10Complete: false,
    limitation: 'Verifies sourced record bindings, not reviewer identity, qualification, semantic accuracy, coaching effectiveness or W10 acceptance. This report is exposed development.',
  }
}
