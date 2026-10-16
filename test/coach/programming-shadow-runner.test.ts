import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareProgrammingShadowPacket, jsonBytes, sha256, SHADOW_LIMITS } from '@/scripts/programming-shadow-packet'
import { dispatchProgrammingShadow, recoverProgrammingShadow, type ShadowApproval } from '@/scripts/programming-shadow-runner'

function setup() {
  const packet = prepareProgrammingShadowPacket()
  const directory = mkdtempSync(join(tmpdir(), 'socius-jev-test-'))
  writeFileSync(join(directory, 'manifest.json'), jsonBytes(packet.manifest))
  for (const c of packet.cases) writeFileSync(join(directory, `${c.id}.request.json`), jsonBytes(c.request))
  const reviewed = { ...packet.labels, status: 'reviewed', cases: packet.labels.cases.map(c => ({ ...c, reviewerVerdict: c.proposedVerdict, reviewer: 'synthetic-test-harness' })) }
  writeFileSync(join(directory, 'reviewed-labels.json'), jsonBytes(reviewed))
  const approval: ShadowApproval = { approved: true, source: 'Injected test only; no live authorization',
    manifestHash: packet.manifestHash, reviewedLabelsHash: sha256(jsonBytes(reviewed)),
    model: SHADOW_LIMITS.model, maxRequests: 8, maxSpendUsd: 0.10 }
  return { directory, approval, connection: 'injected-connection-path', packet }
}
async function transport(_connection: string, _request: string, receipt: string) {
  writeFileSync(receipt, jsonBytes({ status: 'ok', source: 'injected-only', response: {
    model: SHADOW_LIMITS.model, usage: { input_tokens: 100, output_tokens: 10 },
    answers: { check_1: { type: 'choice', choice: 'supported', confidence: 0.9,
      probabilities: { supported: 0.9, contradicted: 0.05, insufficient_evidence: 0.05 } } },
  } }), { flag: 'wx' })
}

describe('bounded programming shadow preparation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('exports neutral requests without expected verdicts, case labels or owner IDs', () => {
    const packet = prepareProgrammingShadowPacket()
    for (const c of packet.cases) {
      const request = jsonBytes(c.request)
      expect(Object.keys(c.request.questions)).toEqual(['check_1'])
      for (const text of ['supported_mapping', 'proxy_overreach', 'uncertain_introduction', 'proposedVerdict', 'reviewerVerdict', 'synthetic-owner']) expect(request).not.toContain(text)
      expect(c.requestBytes).toBeLessThanOrEqual(8192)
      expect(sha256(request)).toBe(c.requestHash)
    }
    expect(packet.labels.status).toBe('awaiting_review')
    expect(packet.labels.cases.every(c => c.reviewerVerdict === null)).toBe(true)
  })

  it('journals before dispatch, calls each request once and recovers without resending', async () => {
    const network = vi.fn(); vi.stubGlobal('fetch', network)
    const options = setup()
    const send = vi.fn(async (connection: string, request: string, receipt: string) => {
      expect(existsSync(join(options.directory, 'run-claim.json'))).toBe(true)
      expect(existsSync(join(resolve(request, '..'), 'dispatch.json'))).toBe(true)
      expect(connection).toBe('injected-connection-path')
      await transport(connection, request, receipt)
    })
    const result = await dispatchProgrammingShadow({ ...options, transport: send })
    expect(result.status).toBe('complete')
    expect(send).toHaveBeenCalledTimes(8)
    expect(recoverProgrammingShadow(options.directory)).toMatchObject({ status: 'complete', knownInputTokens: 800, knownOutputTokens: 80, accountingComplete: true, resendAllowed: false })
    await expect(dispatchProgrammingShadow({ ...options, transport: send })).rejects.toThrow()
    expect(send).toHaveBeenCalledTimes(8)
    expect(network).not.toHaveBeenCalled()
  })

  it.each(['absent', 'budget', 'model', 'hash', 'unreviewed', 'request_tamper'] as const)('refuses %s before creating a claim or sending', async kind => {
    const options = setup(); const send = vi.fn()
    if (kind === 'absent') options.approval.approved = false
    if (kind === 'budget') options.approval.maxSpendUsd = 0.01
    if (kind === 'model') options.approval.model = 'jev-latest'
    if (kind === 'hash') options.approval.manifestHash = 'changed'
    if (kind === 'unreviewed') {
      const content = jsonBytes(options.packet.labels)
      writeFileSync(join(options.directory, 'reviewed-labels.json'), content)
      options.approval.reviewedLabelsHash = sha256(content)
    }
    if (kind === 'request_tamper') writeFileSync(join(options.directory, 'case_01.request.json'), '{}')
    await expect(dispatchProgrammingShadow({ ...options, transport: send })).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
    expect(existsSync(join(options.directory, 'run-claim.json'))).toBe(false)
  })

  it('stops an interrupted run, refuses restart and recovers a late receipt without a new call', async () => {
    const options = setup()
    const send = vi.fn(async () => { throw new Error('private-provider-error') })
    const result = await dispatchProgrammingShadow({ ...options, transport: send })
    expect(result).toMatchObject({ status: 'pending', stoppedAt: 'case_01', resendAllowed: false })
    expect(JSON.stringify(result)).not.toContain('private-provider-error')
    await expect(dispatchProgrammingShadow({ ...options, transport: send })).rejects.toThrow()
    expect(send).toHaveBeenCalledOnce()
    await transport('', '', join(options.directory, 'case_01', 'receipt.json'))
    const recovered = recoverProgrammingShadow(options.directory)
    expect(recovered.cases[0].status).toBe('unverified_receipt')
    expect(recovered.accountingComplete).toBe(false)
    expect(recovered.cases.slice(1).every(c => c.status === 'not_dispatched')).toBe(true)
    expect(recovered.status).toBe('incomplete')
    expect(send).toHaveBeenCalledOnce()
  })

  it.each(['malformed', 'unknown', 'over_reservation'] as const)('halts remaining dispatches for %s usage/receipt', async kind => {
    const options = setup()
    const send = vi.fn(async (_connection: string, _request: string, receipt: string) => {
      await transport('', '', receipt)
      const value = JSON.parse(readFileSync(receipt, 'utf8'))
      if (kind === 'unknown') value.status = 'unknown'
      if (kind === 'malformed') value.response.answers = {}
      if (kind === 'over_reservation') value.response.usage.input_tokens = 64001
      writeFileSync(receipt, jsonBytes(value))
    })
    expect(await dispatchProgrammingShadow({ ...options, transport: send })).toMatchObject({ status: 'pending', stoppedAt: 'case_01' })
    expect(send).toHaveBeenCalledOnce()
  })

  it('permits only one concurrent dispatcher', async () => {
    const options = setup()
    let release!: () => void
    const waiting = new Promise<void>(r => { release = r })
    const send = vi.fn(async (c: string, q: string, r: string) => { await waiting; await transport(c, q, r) })
    const first = dispatchProgrammingShadow({ ...options, transport: send })
    await expect(dispatchProgrammingShadow({ ...options, transport: send })).rejects.toThrow()
    release(); expect((await first).status).toBe('complete')
    expect(send).toHaveBeenCalledTimes(8)
  })

  it.each(['receipt', 'request', 'dispatch'] as const)('detects a replaced %s during recovery', async kind => {
    const options = setup()
    await dispatchProgrammingShadow({ ...options, transport })
    const folder = join(options.directory, 'case_01')
    const file = join(folder, `${kind}.json`)
    const content = readFileSync(file, 'utf8')
    if (kind === 'receipt') {
      const value = JSON.parse(content)
      value.response.usage.input_tokens++
      writeFileSync(file, jsonBytes(value))
    } else writeFileSync(file, '{}')
    const recovered = recoverProgrammingShadow(options.directory)
    expect(recovered.cases[0].status).toBe('invalid_receipt')
    expect(recovered.accountingComplete).toBe(false)
  })

  it('refuses changed review labels during recovery', async () => {
    const options = setup()
    await dispatchProgrammingShadow({ ...options, transport })
    writeFileSync(join(options.directory, 'reviewed-labels.json'), '{}')
    expect(() => recoverProgrammingShadow(options.directory)).toThrow('Labels changed')
  })

  it('can write a review packet with no live approval or reviewed labels', () => {
    if (process.env.WRITE_JEV_SHADOW_PACKET !== '1') return
    const packet = prepareProgrammingShadowPacket()
    const directory = resolve('output/programming-quality-review/jev-shadow-development-v1')
    mkdirSync(directory, { recursive: true })
    // Preparation never overwrites a frozen package, review or dispatched run.
    writeFileSync(join(directory, 'manifest.json'), jsonBytes(packet.manifest), { flag: 'wx' })
    writeFileSync(join(directory, 'proposed-labels.json'), jsonBytes(packet.labels), { flag: 'wx' })
    for (const c of packet.cases) writeFileSync(join(directory, `${c.id}.request.json`), jsonBytes(c.request), { flag: 'wx' })
  })
})
