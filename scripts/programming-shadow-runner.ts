/** Project-local durable wrapper. Existing shared dispatcher cannot represent quality checks.
 * The caller must inject the existing jev_transport.mjs run function; no default or new HTTP client.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateJevChoiceResponse } from './jev-choice-contract'
import { SHADOW_LIMITS, jsonBytes, sha256 } from './programming-shadow-packet'

export interface ShadowManifest {
  schemaVersion: number
  purpose: string
  limits: typeof SHADOW_LIMITS
  entries: Array<{ id: string; file: string; sha256: string; bytes: number }>
}
export interface ShadowApproval {
  approved: boolean; source: string; manifestHash: string; reviewedLabelsHash: string
  maxRequests: number; maxSpendUsd: number; model: string
}
export type ExistingTransport = (connection: string, request: string, receipt: string) => Promise<unknown>

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
const requireCheck = (condition: boolean, message: string) => { if (!condition) throw new Error(message) }
function writeOnce(file: string, value: unknown) {
  writeBytesOnce(file, jsonBytes(value))
}
function writeBytesOnce(file: string, contents: string) {
  const fd = openSync(file, 'wx')
  try { writeFileSync(fd, contents); fsyncSync(fd) } finally { closeSync(fd) }
}

/** Exclusive manifest claim precedes all requests. If interrupted, only receipt recovery is allowed.
 * No automatic continuation/new calls after interruption: unused allowance is deliberately forfeited.
 */
export async function dispatchProgrammingShadow(options: {
  directory: string; connection: string; approval: ShadowApproval; transport: ExistingTransport
}) {
  const { directory, approval, transport, connection } = options
  const manifestText = readFileSync(join(directory, 'manifest.json'), 'utf8')
  const labelsText = readFileSync(join(directory, 'reviewed-labels.json'), 'utf8')
  const manifest: ShadowManifest = JSON.parse(manifestText)
  const labels = JSON.parse(labelsText)
  requireCheck(approval.approved === true && typeof approval.source === 'string' && approval.source.trim().length > 0,
    'Explicit reviewed approval required')
  requireCheck(sha256(manifestText) === approval.manifestHash && sha256(labelsText) === approval.reviewedLabelsHash,
    'Approval does not match frozen artifacts')
  requireCheck(manifest.schemaVersion === 1 && manifest.purpose === 'programming_decision_quality'
    && JSON.stringify(manifest.limits) === JSON.stringify(SHADOW_LIMITS), 'Unexpected model or limits')
  requireCheck(approval.model === SHADOW_LIMITS.model && approval.maxRequests === SHADOW_LIMITS.maxRequests
    && approval.maxSpendUsd === SHADOW_LIMITS.maxSpendUsd, 'Approval does not cover frozen budget')
  requireCheck(manifest.entries.length === 8 && new Set(manifest.entries.map(e => e.id)).size === 8
    && manifest.entries.every((e, i) => e.id === `case_${String(i + 1).padStart(2, '0')}` && e.file === `${e.id}.request.json`), 'Unexpected case catalog')
  requireCheck(labels.status === 'reviewed' && Array.isArray(labels.cases) && labels.cases.length === 8
    && labels.cases.every((c: { id: string; reviewerVerdict: string; reviewer: string }, i: number) =>
      c.id === manifest.entries[i].id && ['supported', 'contradicted', 'insufficient_evidence'].includes(c.reviewerVerdict)
      && typeof c.reviewer === 'string' && c.reviewer.trim().length > 0), 'Human-reviewed labels required')

  // Read and check every immutable request before claiming the run; later source edits cannot alter dispatch.
  const requests = manifest.entries.map(entry => {
    const contents = readFileSync(join(directory, entry.file), 'utf8')
    requireCheck(sha256(contents) === entry.sha256 && Buffer.byteLength(contents) === entry.bytes
      && entry.bytes <= SHADOW_LIMITS.maxRequestBytes, 'Request snapshot mismatch')
    const request = JSON.parse(contents)
    requireCheck(request.model === SHADOW_LIMITS.model && Object.keys(request.questions).join() === 'check_1'
      && request.questions.check_1.type === 'choice'
      && Object.keys(request.questions.check_1.criteria).sort().join() === 'contradicted,insufficient_evidence,supported', 'Invalid question catalog')
    return { entry, contents }
  })
  const maximumUsd = 8 * SHADOW_LIMITS.maxInputTokensPerRequest * SHADOW_LIMITS.inputUsdPerMillion / 1e6
  requireCheck(maximumUsd <= approval.maxSpendUsd, 'Insufficient spend reservation')
  // wx is an atomic single-writer boundary; a partial claim after a crash still prevents a resend.
  writeOnce(join(directory, 'run-claim.json'), { manifestHash: approval.manifestHash,
    labelsHash: approval.reviewedLabelsHash, approvalSource: approval.source, maximumUsd, retries: 0 })
  for (const { entry, contents } of requests) {
    const folder = join(directory, entry.id)
    mkdirSync(folder) // Existing attempt folders are never reused.
    const requestPath = join(folder, 'request.json')
    writeBytesOnce(requestPath, contents)
    writeOnce(join(folder, 'dispatch.json'), { requestHash: entry.sha256, attempt: 1, reservedUsd: maximumUsd / 8 })
    try { await transport(connection, requestPath, join(folder, 'receipt.json')) } catch {
      // No provider error details or secrets. Unknown attempts stop all subsequent calls.
      return { status: 'pending', stoppedAt: entry.id, resendAllowed: false }
    }
    // The shared receipt format lacks request identity. Bind its exact bytes locally
    // after a completed callback; a crash before this step needs manual reconciliation.
    if (!existsSync(join(folder, 'receipt.json'))) return { status: 'pending', stoppedAt: entry.id, resendAllowed: false }
    writeOnce(join(folder, 'result-binding.json'), { requestHash: entry.sha256,
      receiptHash: sha256(readFileSync(join(folder, 'receipt.json'), 'utf8')),
      manifestHash: approval.manifestHash, labelsHash: approval.reviewedLabelsHash })
    const recovered = recoverProgrammingShadow(directory)
    const latest = recovered.cases.find(c => c.id === entry.id)
    if (latest?.status !== 'ok') return { status: 'pending', stoppedAt: entry.id, resendAllowed: false }
  }
  return recoverProgrammingShadow(directory)
}

/** Read-only recovery. It never calls transport, recreates a claim or retries a request. */
export function recoverProgrammingShadow(directory: string) {
  const manifest: ShadowManifest = read(join(directory, 'manifest.json'))
  const claim = read(join(directory, 'run-claim.json'))
  requireCheck(sha256(readFileSync(join(directory, 'manifest.json'), 'utf8')) === claim.manifestHash, 'Manifest changed after claim')
  requireCheck(sha256(readFileSync(join(directory, 'reviewed-labels.json'), 'utf8')) === claim.labelsHash, 'Labels changed after claim')
  let inputTokens = 0; let outputTokens = 0
  const cases = manifest.entries.map(entry => {
    const folder = join(directory, entry.id)
    if (!existsSync(join(folder, 'dispatch.json'))) return { id: entry.id, status: 'not_dispatched' }
    if (!existsSync(join(folder, 'receipt.json'))) return { id: entry.id, status: 'pending' }
    if (!existsSync(join(folder, 'result-binding.json'))) return { id: entry.id, status: 'unverified_receipt' }
    try {
      const dispatch = read(join(folder, 'dispatch.json'))
      const binding = read(join(folder, 'result-binding.json'))
      const receiptText = readFileSync(join(folder, 'receipt.json'), 'utf8')
      requireCheck(dispatch.requestHash === entry.sha256 && dispatch.attempt === 1
        && sha256(readFileSync(join(folder, 'request.json'), 'utf8')) === entry.sha256
        && binding.requestHash === entry.sha256 && binding.manifestHash === claim.manifestHash
        && binding.labelsHash === claim.labelsHash && binding.receiptHash === sha256(receiptText), 'Receipt binding mismatch')
      const receipt = JSON.parse(receiptText)
      if (receipt.status !== 'ok') return { id: entry.id, status: 'unknown' }
      const response = validateJevChoiceResponse(receipt.response,
        { check_1: ['supported', 'contradicted', 'insufficient_evidence'] }, SHADOW_LIMITS.model)
      requireCheck(response.usage.input_tokens <= SHADOW_LIMITS.maxInputTokensPerRequest, 'Usage exceeds reserved model maximum')
      inputTokens += response.usage.input_tokens; outputTokens += response.usage.output_tokens
      return { id: entry.id, status: 'ok', response }
    } catch { return { id: entry.id, status: 'invalid_receipt' } }
  })
  return { status: cases.every(c => c.status === 'ok') ? 'complete' : 'incomplete', resendAllowed: false,
    accountingComplete: cases.every(c => c.status === 'ok' || c.status === 'not_dispatched'),
    knownInputTokens: inputTokens, knownOutputTokens: outputTokens, knownEstimatedUsd: inputTokens * SHADOW_LIMITS.inputUsdPerMillion / 1e6,
    costBasis: 'published input-token rate; not a provider billing receipt', cases }
}
