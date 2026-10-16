import { existsSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareWholeWeekPacket } from '@/scripts/programming-whole-week-packet'
import { jsonBytes, sha256 } from '@/scripts/programming-shadow-packet'
import { dispatchWholeWeek, preflightWholeWeek, recoverWholeWeek, WHOLE_WEEK_LIMITS, WHOLE_WEEK_MANIFEST_HASH,
  type WholeWeekApproval, type WholeWeekTokenEvidence } from '@/scripts/programming-whole-week-runner'

// Frozen runner inputs are separate from the current-generator test suite.
const fixtureDirectory = 'test/fixtures/frozen-whole-week-development-v1'
const manifestText = readFileSync(join(fixtureDirectory, 'manifest.json'), 'utf8')
if (sha256(manifestText) !== WHOLE_WEEK_MANIFEST_HASH) throw new Error('Frozen fixture manifest changed')
const manifest: ReturnType<typeof prepareWholeWeekPacket>['manifest'] = JSON.parse(manifestText)
const labelsText = readFileSync(join(fixtureDirectory, 'proposed-labels.json'), 'utf8')
if (sha256(labelsText) !== '7fd855a89823344ce24862632069e108d1a3a62eec5f2fbcf1c0068c4e3e08d8') throw new Error('Frozen fixture labels changed')
const packet = {
  manifest, manifestHash: sha256(manifestText),
  labels: JSON.parse(labelsText) as ReturnType<typeof prepareWholeWeekPacket>['labels'],
  cases: manifest.entries.map(entry => ({ id: entry.id, requestHash: entry.sha256 })),
}
const save = (file: string, value: unknown) => writeFileSync(file, jsonBytes(value))
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'socius-whole-week-test-'))
  writeFileSync(join(directory, 'manifest.json'), manifestText)
  for (const entry of manifest.entries) writeFileSync(join(directory, entry.file), readFileSync(join(fixtureDirectory, entry.file)))
  const labels = structuredClone(packet.labels)
  labels.status = 'reviewed'
  // Test-only labels/counts; no human or provider evidence is manufactured for the actual packet.
  for (const c of labels.cases) for (const l of c.labels) {
    Object.assign(l, { reviewerVerdict: l.proposedVerdict, reviewer: 'simulated test reviewer' })
  }
  const evidence: WholeWeekTokenEvidence = { schemaVersion: 1, model: 'jev-1.13.0', status: 'verified',
    method: 'simulated counter for injected transport', source: 'synthetic test only', includesProviderFraming: true,
    entries: packet.cases.map(c => ({ id: c.id, requestHash: c.requestHash, inputTokens: 25_000, statePlusLongestQuestionTokens: 24_000 })) }
  save(join(directory, 'reviewed-labels.json'), labels)
  save(join(directory, 'token-evidence.json'), evidence)
  const approval: WholeWeekApproval = { approved: true, source: 'Injected test only, no live authority',
    manifestHash: packet.manifestHash, reviewedLabelsHash: sha256(jsonBytes(labels)),
    tokenEvidenceHash: sha256(jsonBytes(evidence)), limitsHash: sha256(jsonBytes(WHOLE_WEEK_LIMITS)),
    model: 'jev-1.13.0', maxRequests: 4, maxSpendUsd: 0.02 }
  return { directory, labels, evidence, approval, connection: 'unused-test-connection' }
}
async function transport(_connection: string, requestFile: string, receiptFile: string) {
  const request = JSON.parse(readFileSync(requestFile, 'utf8'))
  save(receiptFile, { status: 'ok', source: 'injected test only', response: {
    model: request.model, usage: { input_tokens: 25_000, output_tokens: 200 },
    answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, { type: 'choice', choice: 'supported',
      confidence: 0.9, probabilities: { supported: 0.9, contradicted: 0.05, insufficient_evidence: 0.05 } }])) } })
}

describe('whole-week bounded comparison runner', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('rejects the evolving generator before dispatch without changing the frozen binding', async () => {
    const options = setup(), current = prepareWholeWeekPacket(), send = vi.fn()
    save(join(options.directory, 'manifest.json'), current.manifest)
    for (const c of current.cases) save(join(options.directory, `${c.id}.request.json`), c.request)
    expect(current.manifestHash).not.toBe(WHOLE_WEEK_MANIFEST_HASH)
    await expect(dispatchWholeWeek({ ...options, transport: send })).rejects.toThrow('Frozen whole-week manifest mismatch')
    expect(send).not.toHaveBeenCalled()
    expect(existsSync(join(options.directory, 'whole-week-run-claim.json'))).toBe(false)
  })
  it('keeps actual unmeasured packets unqualified and does not turn bytes into tokens', () => {
    const { directory } = setup()
    const result = preflightWholeWeek(directory)
    expect(result.qualified).toBe(false)
    expect(result.entries.every(e => e.status === 'unverified_tokens' && e.inputTokens === null)).toBe(true)
    expect(result.entries.map(e => e.bytes)).toEqual([107487, 141252, 92524, 124106])
    expect(result.maximumReservedUsd).toBeCloseTo(0.010752)
    expect(existsSync(join(directory, 'whole-week-run-claim.json'))).toBe(false)
  })

  it.each(['longest', 'total', 'unbound', 'wrong_model', 'no_framing'] as const)('rejects %s token evidence', kind => {
    const { directory, evidence } = setup()
    if (kind === 'longest') { evidence.entries[0].inputTokens = 40_000; evidence.entries[0].statePlusLongestQuestionTokens = 32_001 }
    if (kind === 'total') evidence.entries[0].inputTokens = 64_001
    if (kind === 'unbound') evidence.entries[0].requestHash = 'wrong'
    if (kind === 'wrong_model') evidence.model = 'jev-latest'
    if (kind === 'no_framing') Object.assign(evidence, { includesProviderFraming: false })
    expect(preflightWholeWeek(directory, evidence).qualified).toBe(false)
  })

  it('journals before each of four six-question calls and recovers all24 answers without transport', async () => {
    const network = vi.fn(); vi.stubGlobal('fetch', network)
    const options = setup()
    const send = vi.fn(async (c: string, q: string, r: string) => {
      expect(existsSync(join(options.directory, 'whole-week-run-claim.json'))).toBe(true)
      expect(existsSync(join(dirname(q), 'dispatch.json'))).toBe(true)
      expect(Object.keys(JSON.parse(readFileSync(q, 'utf8')).questions)).toHaveLength(6)
      await transport(c, q, r)
    })
    expect((await dispatchWholeWeek({ ...options, transport: send })).status).toBe('complete')
    expect(send).toHaveBeenCalledTimes(4)
    expect(recoverWholeWeek(options.directory)).toMatchObject({ status: 'complete', resendAllowed: false,
      accountingComplete: true, knownInputTokens: 100_000, knownOutputTokens: 800, knownEstimatedUsd: 0.0042 })
    await expect(dispatchWholeWeek({ ...options, transport: send })).rejects.toThrow()
    expect(send).toHaveBeenCalledTimes(4)
    expect(network).not.toHaveBeenCalled()
  })

  it.each(['unapproved', 'old_allowance', 'unreviewed', 'claim_changed', 'context_changed', 'question_changed',
    'tokens_changed', 'token_hash', 'missing_token_file', 'manifest', 'request'] as const)('refuses %s before claim or calls', async kind => {
    const options = setup(); const send = vi.fn()
    if (kind === 'unapproved') options.approval.approved = false
    if (kind === 'old_allowance') options.approval.maxRequests = 8
    if (kind === 'unreviewed') options.labels.status = 'awaiting_review'
    if (kind === 'claim_changed') options.labels.cases[0].labels[0].claim = 'A different hypothesis'
    if (kind === 'context_changed') options.labels.cases[0].modelState.scope = 'Different context'
    if (kind === 'question_changed') options.labels.cases[0].questions.check_1.instructions = 'Different question'
    if (kind === 'tokens_changed') options.evidence.entries[0].statePlusLongestQuestionTokens = 33_000
    if (kind === 'token_hash') options.approval.tokenEvidenceHash = 'wrong'
    save(join(options.directory, 'reviewed-labels.json'), options.labels)
    options.approval.reviewedLabelsHash = sha256(jsonBytes(options.labels))
    save(join(options.directory, 'token-evidence.json'), kind === 'missing_token_file' ? {} : options.evidence)
    if (kind === 'manifest') save(join(options.directory, 'manifest.json'), {})
    if (kind === 'request') save(join(options.directory, 'week_01.request.json'), {})
    await expect(dispatchWholeWeek({ ...options, transport: send })).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
    expect(existsSync(join(options.directory, 'whole-week-run-claim.json'))).toBe(false)
  })

  it('stops on uncertainty, forfeits unused allowance and leaves late unbound receipts unverified', async () => {
    const options = setup()
    const send = vi.fn(async () => { throw Error('private provider details') })
    const result = await dispatchWholeWeek({ ...options, transport: send })
    expect(result).toMatchObject({ status: 'pending', stoppedAt: 'week_01', resendAllowed: false })
    expect(JSON.stringify(result)).not.toContain('private')
    const folder = join(options.directory, 'week_01')
    await transport('', join(folder, 'request.json'), join(folder, 'receipt.json'))
    const recovered = recoverWholeWeek(options.directory)
    expect(recovered.accountingComplete).toBe(false)
    expect(recovered.cases.map(c => c.status)).toEqual(['unverified_receipt', 'not_dispatched', 'not_dispatched', 'not_dispatched'])
    await expect(dispatchWholeWeek({ ...options, transport: send })).rejects.toThrow()
    expect(send).toHaveBeenCalledOnce()
  })

  it.each(['missing_answer', 'extra_answer', 'unknown', 'over_budget'] as const)('stops after %s reply', async kind => {
    const options = setup()
    const send = vi.fn(async (c: string, q: string, r: string) => {
      await transport(c, q, r)
      const receipt = JSON.parse(readFileSync(r, 'utf8'))
      if (kind === 'missing_answer') delete receipt.response.answers.check_6
      if (kind === 'extra_answer') receipt.response.answers.check_7 = receipt.response.answers.check_1
      if (kind === 'unknown') receipt.status = 'unknown'
      if (kind === 'over_budget') receipt.response.usage.input_tokens = 64_001
      save(r, receipt)
    })
    expect(await dispatchWholeWeek({ ...options, transport: send })).toMatchObject({ status: 'pending', stoppedAt: 'week_01' })
    expect(send).toHaveBeenCalledOnce()
    expect(recoverWholeWeek(options.directory).accountingComplete).toBe(false)
  })

  it('admits only one concurrent dispatcher', async () => {
    const options = setup()
    let release!: () => void
    const waiting = new Promise<void>(r => { release = r })
    const send = vi.fn(async (c: string, q: string, r: string) => { await waiting; await transport(c, q, r) })
    const first = dispatchWholeWeek({ ...options, transport: send })
    await expect(dispatchWholeWeek({ ...options, transport: send })).rejects.toThrow()
    release()
    expect((await first).status).toBe('complete')
    expect(send).toHaveBeenCalledTimes(4)
  })

  it.each(['receipt', 'request', 'dispatch', 'result-binding'] as const)('detects replaced %s after a completed run', async kind => {
    const options = setup()
    await dispatchWholeWeek({ ...options, transport })
    save(join(options.directory, 'week_01', `${kind}.json`), {})
    expect(recoverWholeWeek(options.directory).cases[0].status).toBe('invalid_receipt')
  })

  it('binds token evidence and human labels during recovery', async () => {
    const options = setup()
    await dispatchWholeWeek({ ...options, transport })
    options.evidence.method = 'changed method'
    save(join(options.directory, 'token-evidence.json'), options.evidence)
    expect(() => recoverWholeWeek(options.directory)).toThrow('Artifacts changed')
  })

  it('halts before week3 when a prior receipt becomes corrupt during week2', async () => {
    const options = setup()
    const send = vi.fn(async (c: string, q: string, r: string) => {
      await transport(c, q, r)
      if (dirname(q) === join(options.directory, 'week_02')) save(join(options.directory, 'week_01', 'receipt.json'), {})
    })
    expect(await dispatchWholeWeek({ ...options, transport: send })).toMatchObject({ status: 'pending', stoppedAt: 'week_01' })
    expect(send).toHaveBeenCalledTimes(2)
    expect(recoverWholeWeek(options.directory).accountingComplete).toBe(false)
    expect(existsSync(join(options.directory, 'week_03'))).toBe(false)
  })

  it('treats a lost journal with surviving paid receipt as uncertain accounting', async () => {
    const options = setup()
    await dispatchWholeWeek({ ...options, transport })
    const folder = join(options.directory, 'week_01')
    renameSync(join(folder, 'dispatch.json'), join(folder, 'lost-dispatch.json'))
    const recovered = recoverWholeWeek(options.directory)
    expect(recovered.cases[0].status).toBe('unverified_attempt')
    expect(recovered.accountingComplete).toBe(false)
    expect(recovered.status).toBe('incomplete')
  })

  it('rejects changed claim budget during recovery', async () => {
    const options = setup()
    await dispatchWholeWeek({ ...options, transport })
    const path = join(options.directory, 'whole-week-run-claim.json')
    const claim = JSON.parse(readFileSync(path, 'utf8'))
    claim.approval.maxRequests = 8
    save(path, claim)
    expect(() => recoverWholeWeek(options.directory)).toThrow('Approval does not cover')
  })
})
