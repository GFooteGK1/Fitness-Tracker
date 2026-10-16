/** Offline-qualified, explicitly approved dispatch through the existing injected transport.
 * No default network client, credential loading, token estimate or automatic retry.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { validateJevChoiceResponse } from './jev-choice-contract'
import { jsonBytes, sha256 } from './programming-shadow-packet'
import type { ExistingTransport } from './programming-shadow-runner'

// Separate profile: never consumes either exhausted eight-call allowance.
export const WHOLE_WEEK_LIMITS = {
  model: 'jev-1.13.0', requests: 4, questionsPerRequest: 6, maxRequestBytes: 180_000,
  maxInputTokens: 64_000, maxStatePlusQuestionTokens: 32_000,
  inputUsdPerMillion: 0.042, maxSpendUsd: 0.02, retries: 0,
} as const
export const WHOLE_WEEK_MANIFEST_HASH = '21a3dd4cf35f21ec368ccacd47c5775844c867e411d5032ebd8663ddc6ac81a7'
const verdicts = ['supported', 'contradicted', 'insufficient_evidence']
const questionIds = Array.from({ length: 6 }, (_, i) => `check_${i + 1}`)
const readText = (file: string) => readFileSync(file, 'utf8')
const read = (file: string) => JSON.parse(readText(file))
const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message) }
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0
const digest = (v: unknown) => sha256(jsonBytes(v))

interface ManifestEntry { id: string; file: string; sha256: string; bytes: number; questions: number }
/** Evidence is supplied by a reviewed provider-compatible measurement process.
 * This module cannot turn a byte count or an unrelated tokenizer into that proof.
 * Counts must include provider framing. No current measurement is bundled.
 */
export interface WholeWeekTokenEvidence {
  schemaVersion: 1; model: string; status: 'verified'; method: string
  source: string; includesProviderFraming: true
  entries: Array<{ id: string; requestHash: string; inputTokens: number; statePlusLongestQuestionTokens: number }>
}
export interface WholeWeekApproval {
  approved: boolean; source: string; manifestHash: string; reviewedLabelsHash: string
  tokenEvidenceHash: string; limitsHash: string; model: string; maxRequests: number; maxSpendUsd: number
}

function writeOnce(file: string, contents: string) {
  const fd = openSync(file, 'wx')
  try { writeFileSync(fd, contents); fsyncSync(fd) } finally { closeSync(fd) }
}
const writeJsonOnce = (file: string, value: unknown) => writeOnce(file, jsonBytes(value))

function snapshots(directory: string) {
  const manifestText = readText(join(directory, 'manifest.json'))
  check(sha256(manifestText) === WHOLE_WEEK_MANIFEST_HASH, 'Frozen whole-week manifest mismatch')
  const manifest = JSON.parse(manifestText) as { entries: ManifestEntry[] }
  check(manifest.entries.length === 4, 'Unexpected week count')
  const requests = manifest.entries.map((entry, i) => {
    check(entry.id === `week_${String(i + 1).padStart(2, '0')}` && entry.file === `${entry.id}.request.json`
      && entry.questions === 6, 'Unexpected week catalog')
    const contents = readText(join(directory, entry.file))
    check(sha256(contents) === entry.sha256 && Buffer.byteLength(contents) === entry.bytes
      && entry.bytes <= WHOLE_WEEK_LIMITS.maxRequestBytes, 'Frozen request mismatch')
    const request = JSON.parse(contents)
    check(request.model === WHOLE_WEEK_LIMITS.model && isDeepStrictEqual(Object.keys(request.questions), questionIds), 'Unexpected question catalog')
    for (const q of Object.values(request.questions) as Array<{ type: string; instructions: string; criteria: Record<string, string> }>) {
      check(q.type === 'choice' && nonempty(q.instructions)
        && isDeepStrictEqual(Object.keys(q.criteria).sort(), [...verdicts].sort())
        && Object.values(q.criteria).every(nonempty), 'Invalid Choice question')
    }
    return { entry, contents, request }
  })
  return { manifestText, requests }
}

/** Read-only qualification. Missing or unsuitable token evidence stays unknown, never estimated. */
export function preflightWholeWeek(directory: string, evidence?: WholeWeekTokenEvidence) {
  const { requests } = snapshots(directory)
  const verified = evidence?.schemaVersion === 1 && evidence.model === WHOLE_WEEK_LIMITS.model
    && evidence.status === 'verified' && nonempty(evidence.method) && nonempty(evidence.source)
    && evidence.includesProviderFraming === true && Array.isArray(evidence.entries) && evidence.entries.length === 4
  const entries = requests.map(({ entry, request }, i) => {
    const measured = evidence?.entries?.[i]
    const bound = verified && measured?.id === entry.id && measured.requestHash === entry.sha256
      && positive(measured.inputTokens) && positive(measured.statePlusLongestQuestionTokens)
      && measured.statePlusLongestQuestionTokens <= measured.inputTokens
    const fits = bound && measured.inputTokens <= WHOLE_WEEK_LIMITS.maxInputTokens
      && measured.statePlusLongestQuestionTokens <= WHOLE_WEEK_LIMITS.maxStatePlusQuestionTokens
    return { id: entry.id, requestHash: entry.sha256, bytes: entry.bytes,
      compactRequestBytes: Buffer.byteLength(JSON.stringify(request)),
      status: !bound ? 'unverified_tokens' : fits ? 'fits' : 'over_context_limit',
      inputTokens: bound ? measured.inputTokens : null,
      statePlusLongestQuestionTokens: bound ? measured.statePlusLongestQuestionTokens : null }
  })
  return { qualified: entries.every(e => e.status === 'fits'), manifestHash: WHOLE_WEEK_MANIFEST_HASH,
    limits: WHOLE_WEEK_LIMITS, limitsHash: digest(WHOLE_WEEK_LIMITS),
    maximumReservedUsd: 4 * WHOLE_WEEK_LIMITS.maxInputTokens * WHOLE_WEEK_LIMITS.inputUsdPerMillion / 1e6,
    entries, limitations: ['Byte counts are not provider token counts', 'Qualification is not human review or paid-call approval'] }
}

function reviewedInputs(directory: string) {
  const frozen = snapshots(directory)
  const labelsText = readText(join(directory, 'reviewed-labels.json'))
  const labels = JSON.parse(labelsText)
  check(labels.schemaVersion === 1 && labels.status === 'reviewed' && Array.isArray(labels.cases)
    && labels.cases.length === 4, 'Human-reviewed labels required')
  frozen.requests.forEach(({ entry, request }, i) => {
    const c = labels.cases[i]
    check(c?.id === entry.id && isDeepStrictEqual(c.modelState, request.state)
      && isDeepStrictEqual(c.questions, request.questions) && Array.isArray(c.labels)
      && c.labels.length === 6, 'Review does not match exact model context')
    c.labels.forEach((l: { id: string; claim: string; dimension: string; reviewerVerdict: string; reviewer: string }, j: number) => {
      const hypothesis = request.state.checks[j]
      check(l.id === questionIds[j] && l.id === hypothesis.id && l.claim === hypothesis.claim
        && l.dimension === hypothesis.dimension && verdicts.includes(l.reviewerVerdict)
        && nonempty(l.reviewer), 'Missing or mismatched human judgment')
    })
  })
  const tokenText = readText(join(directory, 'token-evidence.json'))
  const preflight = preflightWholeWeek(directory, JSON.parse(tokenText))
  check(preflight.qualified, 'Provider token preflight not qualified')
  return { ...frozen, labelsText, tokenText, preflight }
}

function verifyApproval(approval: WholeWeekApproval, input: ReturnType<typeof reviewedInputs>) {
  check(approval.approved === true && nonempty(approval.source), 'Explicit new allowance required')
  check(approval.manifestHash === WHOLE_WEEK_MANIFEST_HASH && approval.reviewedLabelsHash === sha256(input.labelsText)
    && approval.tokenEvidenceHash === sha256(input.tokenText) && approval.limitsHash === input.preflight.limitsHash,
  'Approval does not bind reviewed artifacts')
  check(approval.model === WHOLE_WEEK_LIMITS.model && approval.maxRequests === 4
    && approval.maxSpendUsd === WHOLE_WEEK_LIMITS.maxSpendUsd
    && input.preflight.maximumReservedUsd <= approval.maxSpendUsd, 'Approval does not cover this profile')
}

/** Claims the entire manifest once; any interruption forfeits unused allowance.
 * Approval must bind human labels, verified token evidence, and this separate profile.
 */
export async function dispatchWholeWeek(options: {
  directory: string; connection: string; approval: WholeWeekApproval; transport: ExistingTransport
}) {
  const { directory, connection, approval, transport } = options
  const input = reviewedInputs(directory)
  verifyApproval(approval, input)
  writeJsonOnce(join(directory, 'whole-week-run-claim.json'), { approval, maximumReservedUsd: input.preflight.maximumReservedUsd, retries: 0 })
  for (const { entry, contents } of input.requests) {
    // Detect changed review/token files between callbacks before starting another request.
    const prior = recoverWholeWeek(directory)
    const uncertain = prior.cases.find(c => !['ok', 'not_dispatched'].includes(c.status))
    if (uncertain) return { status: 'pending', stoppedAt: uncertain.id, resendAllowed: false }
    const folder = join(directory, entry.id)
    mkdirSync(folder)
    writeOnce(join(folder, 'request.json'), contents)
    writeJsonOnce(join(folder, 'dispatch.json'), { requestHash: entry.sha256, attempt: 1,
      reservedUsd: input.preflight.maximumReservedUsd / 4 })
    try { await transport(connection, join(folder, 'request.json'), join(folder, 'receipt.json')) } catch {
      return { status: 'pending', stoppedAt: entry.id, resendAllowed: false }
    }
    if (!existsSync(join(folder, 'receipt.json'))) return { status: 'pending', stoppedAt: entry.id, resendAllowed: false }
    writeJsonOnce(join(folder, 'result-binding.json'), { requestHash: entry.sha256,
      receiptHash: sha256(readText(join(folder, 'receipt.json'))), manifestHash: approval.manifestHash,
      labelsHash: approval.reviewedLabelsHash, tokenEvidenceHash: approval.tokenEvidenceHash })
    if (recoverWholeWeek(directory).cases.find(c => c.id === entry.id)?.status !== 'ok') {
      return { status: 'pending', stoppedAt: entry.id, resendAllowed: false }
    }
  }
  return recoverWholeWeek(directory)
}

/** No transport or writes. Unbound late receipts cannot be promoted automatically. */
export function recoverWholeWeek(directory: string) {
  const input = reviewedInputs(directory)
  const claim = read(join(directory, 'whole-week-run-claim.json'))
  const approval: WholeWeekApproval = claim.approval
  check(approval.manifestHash === WHOLE_WEEK_MANIFEST_HASH && approval.reviewedLabelsHash === sha256(input.labelsText)
    && approval.tokenEvidenceHash === sha256(input.tokenText) && approval.limitsHash === input.preflight.limitsHash,
  'Artifacts changed after claim')
  verifyApproval(approval, input)
  check(claim.retries === 0 && claim.maximumReservedUsd === input.preflight.maximumReservedUsd, 'Claim accounting mismatch')
  let inputTokens = 0; let outputTokens = 0
  const catalogs = Object.fromEntries(questionIds.map(id => [id, verdicts]))
  const cases = input.requests.map(({ entry }) => {
    const folder = join(directory, entry.id)
    if (!existsSync(join(folder, 'dispatch.json'))) return { id: entry.id,
      status: existsSync(folder) ? 'unverified_attempt' : 'not_dispatched' }
    if (!existsSync(join(folder, 'receipt.json'))) return { id: entry.id, status: 'pending' }
    if (!existsSync(join(folder, 'result-binding.json'))) return { id: entry.id, status: 'unverified_receipt' }
    try {
      const dispatch = read(join(folder, 'dispatch.json'))
      const binding = read(join(folder, 'result-binding.json'))
      const receiptText = readText(join(folder, 'receipt.json'))
      check(dispatch.attempt === 1 && dispatch.reservedUsd === input.preflight.maximumReservedUsd / 4
        && dispatch.requestHash === entry.sha256
        && sha256(readText(join(folder, 'request.json'))) === entry.sha256
        && binding.requestHash === entry.sha256 && binding.receiptHash === sha256(receiptText)
        && binding.manifestHash === approval.manifestHash && binding.labelsHash === approval.reviewedLabelsHash
        && binding.tokenEvidenceHash === approval.tokenEvidenceHash, 'Receipt binding mismatch')
      const receipt = JSON.parse(receiptText)
      if (receipt.status !== 'ok') return { id: entry.id, status: 'unknown' }
      const response = validateJevChoiceResponse(receipt.response, catalogs, WHOLE_WEEK_LIMITS.model)
      check(response.usage.input_tokens <= WHOLE_WEEK_LIMITS.maxInputTokens, 'Usage exceeds reservation')
      inputTokens += response.usage.input_tokens; outputTokens += response.usage.output_tokens
      return { id: entry.id, status: 'ok', response }
    } catch { return { id: entry.id, status: 'invalid_receipt' } }
  })
  return { status: cases.every(c => c.status === 'ok') ? 'complete' : 'incomplete', resendAllowed: false,
    accountingComplete: cases.every(c => c.status === 'ok' || c.status === 'not_dispatched'),
    knownInputTokens: inputTokens, knownOutputTokens: outputTokens,
    knownEstimatedUsd: inputTokens * WHOLE_WEEK_LIMITS.inputUsdPerMillion / 1e6,
    costBasis: 'Published input-token rate; not a provider billing receipt', cases }
}
