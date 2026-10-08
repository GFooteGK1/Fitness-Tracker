import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareClarifiedShadowPacket, renderClarifiedReview } from '@/scripts/programming-shadow-packet-v2'
import { prepareProgrammingShadowPacket, jsonBytes, sha256 } from '@/scripts/programming-shadow-packet'
import { buildDecisionCheck, evaluateDecisionCheck, isDecisionCheckCurrent } from '@/scripts/programming-decision-check'
import { clarifiedDecisionFixture } from '@/test/fixtures/programming-decision-check-v2'

describe('clarified JEV development packet', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('preserves the exact approved first-trial request manifest', () => {
    expect(prepareProgrammingShadowPacket().manifestHash).toBe('01b90fd957476b93a98d47077fb10933204e2bbae0eb8c12f06cbbac8fb395c6')
  })

  it('uses exactly the same claim, context and question for human and model review', () => {
    const packet = prepareClarifiedShadowPacket()
    const review = renderClarifiedReview(packet)
    for (const c of packet.cases) {
      const state = c.request.state as { checks: Array<{ claim: string }> }
      expect(c.review.claim).toBe(state.checks[0].claim)
      expect(c.review.modelState).toEqual(c.request.state)
      expect(c.review.question).toEqual(c.request.questions.check_1)
      expect(review).toContain(`Exact claim: ${state.checks[0].claim}`)
      expect(c.requestBytes).toBeLessThanOrEqual(8192)
      expect(sha256(jsonBytes(c.request))).toBe(c.requestHash)
      expect(c.basis.questionVersion).toBe('programming-decision-check-2')
      expect(c.review.reviewerVerdict).toBeNull()
      const serialized = jsonBytes(c.request)
      for (const excluded of ['proposedVerdict', 'reviewerVerdict', 'reviewer', 'synthetic-owner']) expect(serialized).not.toContain(excluded)
    }
    expect(packet.labels.status).toBe('awaiting_review')
  })

  it('keeps the event claim identical while varying only the establishing evidence and context', () => {
    const cases = prepareClarifiedShadowPacket().cases.slice(3, 6)
    expect(new Set(cases.map(c => c.review.claim)).size).toBe(1)
    expect(cases.map(c => c.review.proposedVerdict)).toEqual(['insufficient_evidence', 'contradicted', 'supported'])
    expect(new Set(cases.map(c => jsonBytes(c.review.modelState))).size).toBe(3)
  })

  it('separates relevance, emphasis and retention without turning a quality judgment into dose authority', () => {
    const inputs = [0, 1, 2].map(clarifiedDecisionFixture)
    expect(inputs.map(i => i.packet.checks[0].dimension)).toEqual(['demand_mapping', 'emphasis', 'tradeoff'])
    const relevance = buildDecisionCheck(inputs[0]).request.questions.check_1.instructions
    expect(relevance).toContain('Do not require athlete-specific proof that its training should increase')
    const emphasis = buildDecisionCheck(inputs[1]).request.questions.check_1.instructions
    expect(emphasis).toContain('Goal relevance alone does not justify more volume')
    expect(inputs.every(i => i.packet.context.missingFacts.length > 0)).toBe(true)
  })

  it.each([6, 7])('retains multiple goal demands and visibly partial review in context case %s', index => {
    const input = clarifiedDecisionFixture(index)
    const result = buildDecisionCheck(input)
    expect(input.packet.confirmedDemands).toHaveLength(3)
    expect(input.packet.dispositions).toHaveLength(3)
    expect(result.unchecked).toHaveLength(3)
    expect(result.unchecked.filter(d => d.dimensions.length === 4)).toHaveLength(2)
  })

  it('invalidates an earlier receipt when the question version changes', async () => {
    const input = clarifiedDecisionFixture(0)
    input.questionVersion = 'programming-decision-check-1'
    const result = await evaluateDecisionCheck(input, async () => ({ model: input.model,
      usage: { input_tokens: 1, output_tokens: 1 }, answers: { check_1: { type: 'choice', choice: 'supported',
        confidence: 1, probabilities: { supported: 1, contradicted: 0, insufficient_evidence: 0 } } } }))
    expect(isDecisionCheckCurrent(result, input)).toBe(true)
    input.questionVersion = 'programming-decision-check-2'
    expect(isDecisionCheckCurrent(result, input)).toBe(false)
  })

  it.each([0, 1, 2, 3, 4, 5, 6, 7])('prepares case %s without transport or baseline mutation', async index => {
    const network = vi.fn(); vi.stubGlobal('fetch', network)
    const input = clarifiedDecisionFixture(index)
    const before = jsonBytes(input)
    expect(await evaluateDecisionCheck(input)).toMatchObject({ status: 'not_evaluated', reason: 'no_evaluator' })
    expect(jsonBytes(input)).toBe(before)
    expect(network).not.toHaveBeenCalled()
  })

  it('can export a separate v2 packet without overwriting a prior trial', () => {
    if (process.env.WRITE_JEV_SHADOW_PACKET_V2 !== '1') return
    const packet = prepareClarifiedShadowPacket()
    const directory = resolve('output/programming-quality-review/jev-shadow-development-v2')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'manifest.json'), jsonBytes(packet.manifest), { flag: 'wx' })
    writeFileSync(join(directory, 'proposed-labels.json'), jsonBytes(packet.labels), { flag: 'wx' })
    writeFileSync(join(directory, 'review.md'), renderClarifiedReview(packet), { flag: 'wx' })
    for (const c of packet.cases) writeFileSync(join(directory, `${c.id}.request.json`), jsonBytes(c.request), { flag: 'wx' })
  })
})
