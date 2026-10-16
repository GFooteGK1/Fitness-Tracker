import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDecisionCheck, evaluateDecisionCheck, isDecisionCheckCurrent, type DecisionCheckInput, type Verdict } from '@/scripts/programming-decision-check'
import type { JevChoiceRequest, JevChoiceResult } from '@/scripts/jev-choice-contract'
import { DECISION_CASES, decisionFixture } from '@/test/fixtures/programming-decision-check'
import { demandTraceProfile, snapshot, speedOutcome, traceGeneratedWeek } from '@/scripts/programming-goal-demand-trace'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'

function reply(request: JevChoiceRequest, choice: Verdict = 'supported'): JevChoiceResult {
  return { model: 'jev-1.13.0', usage: { input_tokens: 100, output_tokens: 20 },
    answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {
      type: 'choice', choice, confidence: 0.85,
      probabilities: { supported: choice === 'supported' ? 0.9 : 0.05,
        contradicted: choice === 'contradicted' ? 0.9 : 0.05,
        insufficient_evidence: choice === 'insufficient_evidence' ? 0.9 : 0.05 },
    }])) }
}

describe('offline programming decision checker', () => {
  const network = vi.fn(() => { throw new Error('No live network in offline prototype') })
  beforeEach(() => { vi.stubGlobal('fetch', network) })
  afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.clearAllMocks() })

  it.each(DECISION_CASES.map((c, i) => [c.id, i] as const))('rehearses %s with a scripted judgment, not model accuracy', async (_, index) => {
    const input = decisionFixture(index)
    const before = JSON.stringify(input)
    const transport = vi.fn(async (request: JevChoiceRequest) => {
      expect(JSON.stringify(request)).not.toContain('expected')
      expect(request.questions[DECISION_CASES[index].id].instructions).toContain('state.checks[0]')
      return reply(request, DECISION_CASES[index].expected)
    })
    const result = await evaluateDecisionCheck(input, transport)
    expect(result.status).toBe('evaluated')
    expect(result.response?.answers[DECISION_CASES[index].id].choice).toBe(DECISION_CASES[index].expected)
    expect(result.unchecked[0].dimensions).toHaveLength(3)
    expect(result.checkedClaims).toEqual(input.packet.checks)
    expect(isDecisionCheckCurrent(result, input)).toBe(true)
    expect(transport).toHaveBeenCalledOnce()
    expect(JSON.stringify(input)).toBe(before)
    expect(result).not.toHaveProperty('approved')
  })

  it('allowlists named context and excludes baseline, owner identifiers and extra labels from requests', () => {
    const input = decisionFixture()
    Object.assign(input.packet, { expected: 'contradicted', privateLocalMetadata: 'do not forward' })
    Object.assign(input.packet.evidence[0], { localOnly: 'local-file-path' })
    input.baseline.proposal = { secretLocalOnly: 'never forwarded' }
    const request = JSON.stringify(buildDecisionCheck(input).request)
    for (const excluded of ['expected', 'privateLocalMetadata', 'synthetic-owner', 'localOnly', 'never forwarded']) expect(request).not.toContain(excluded)
    expect(request).toContain('counterevidenceIds')
    expect(request).toContain('missingFacts')
  })

  it('preserves two same-domain outcomes and visibly reports unchecked scope', () => {
    const input = decisionFixture()
    input.packet.confirmedDemands.push({ id: 'demand-2', outcomeId: 'goal-2', quality: 'upright_speed', goal: 'Second speed outcome' })
    input.packet.dispositions.push({ ...input.packet.dispositions[0], demandId: 'demand-2', disposition: 'observe' })
    const built = buildDecisionCheck(input)
    expect(built.unchecked.find(d => d.demandId === 'demand-2')?.dimensions).toHaveLength(4)
    expect(JSON.stringify(built.request.state)).toContain('goal-2')
  })

  const invalidInputs: Array<[string, (input: DecisionCheckInput) => void]> = [
    ['missing demand disposition', i => { i.packet.dispositions = [] }],
    ['invented demand', i => { i.packet.checks[0].demandId = 'invented' }],
    ['duplicate demand', i => { i.packet.confirmedDemands.push(i.packet.confirmedDemands[0]) }],
    ['duplicate check scope', i => { i.packet.checks.push({ ...i.packet.checks[0], id: 'another' }) }],
    ['missing reference', i => { i.packet.checks[0].evidenceIds = ['missing'] }],
    ['missing counterevidence reference', i => { i.packet.context.counterevidenceIds = ['missing'] }],
    ['wrong owner', i => { i.packet.evidence[0].ownerId = 'another-owner' }],
    ['model alias', i => { i.model = 'jev-latest' }],
    ['too many questions', i => { i.packet.checks = Array.from({ length: 9 }, (_, n) => ({ ...i.packet.checks[0], id: `q${n}` })) }],
    ['oversized request', i => { i.packet.context.constraints = Array.from({ length: 50 }, () => 'x'.repeat(4000)) }],
  ]
  it.each(invalidInputs)('refuses %s before evaluation', async (_, mutate) => {
    const input = decisionFixture(); mutate(input)
    const transport = vi.fn()
    expect(await evaluateDecisionCheck(input, transport)).toMatchObject({ status: 'not_evaluated', reason: 'invalid_input', response: null })
    expect(transport).not.toHaveBeenCalled()
  })

  it('does not dispatch without an explicit evaluator or interpret missing evidence as failure', async () => {
    const input = decisionFixture(6)
    input.packet.evidence = []; input.packet.checks[0].evidenceIds = []
    input.packet.dispositions[0].evidenceIds = []; input.packet.context.counterevidenceIds = []
    expect(await evaluateDecisionCheck(input)).toMatchObject({ reason: 'no_evaluator', status: 'not_evaluated' })
    const evaluated = await evaluateDecisionCheck(input, async req => reply(req, 'insufficient_evidence'))
    expect(evaluated.status).toBe('evaluated')
    expect(evaluated.response?.answers.unknown_protocol.choice).toBe('insufficient_evidence')
  })

  const invalidResponses: Array<[string, (r: JevChoiceResult) => void]> = [
    ['wrong model', r => { r.model = 'jev-0.0.0' }],
    ['missing answer', r => { r.answers = {} }],
    ['extra answer', r => { r.answers.extra = r.answers.supported_mapping }],
    ['unknown option', r => { r.answers.supported_mapping.choice = 'approved' }],
    ['invalid distribution', r => { r.answers.supported_mapping.probabilities.supported = 0.7 }],
    ['non-maximum selection', r => { r.answers.supported_mapping.choice = 'contradicted' }],
    ['NaN confidence', r => { r.answers.supported_mapping.confidence = NaN }],
    ['negative usage', r => { r.usage.input_tokens = -1 }],
  ]
  it.each(invalidResponses)('marks %s as unevaluated', async (_, mutate) => {
    const result = await evaluateDecisionCheck(decisionFixture(), async req => { const r = reply(req); mutate(r); return r })
    expect(result).toMatchObject({ status: 'not_evaluated', reason: 'invalid_response', response: null })
  })

  it('records service failure without retrying or leaking provider error text', async () => {
    const transport = vi.fn(async () => { throw new Error('fake-private-credential') })
    const result = await evaluateDecisionCheck(decisionFixture(), transport)
    expect(result).toMatchObject({ status: 'not_evaluated', reason: 'service_failure' })
    expect(transport).toHaveBeenCalledOnce()
    expect(JSON.stringify(result)).not.toContain('fake-private-credential')
  })

  it('protects original state and expected catalogs from callback mutation', async () => {
    const input = decisionFixture(); const before = JSON.stringify(input)
    const result = await evaluateDecisionCheck(input, async req => {
      req.state = { replaced: true }
      req.questions.supported_mapping.criteria = { approved: 'approve it' }
      const r = reply(req); r.answers.supported_mapping.choice = 'approved'; return r
    })
    expect(result.reason).toBe('invalid_response')
    expect(JSON.stringify(input)).toBe(before)
  })

  it.each(['source', 'evidence', 'proposal', 'acceptance', 'model'] as const)('rejects reuse after %s changes', async field => {
    const input = decisionFixture()
    const result = await evaluateDecisionCheck(input, async req => reply(req))
    if (field === 'source') input.packet.basis.sourceRevision++
    if (field === 'evidence') input.packet.evidence[0].statement = 'Corrected evidence'
    if (field === 'proposal') input.baseline.proposal = { changed: true }
    if (field === 'acceptance') input.baseline.acceptance = { state: 'accepted' }
    if (field === 'model') input.model = 'jev-0.0.0'
    expect(isDecisionCheckCurrent(result, input)).toBe(false)
  })

  it('retains stale-response usage without presenting a current evaluation', async () => {
    const input = decisionFixture()
    const result = await evaluateDecisionCheck(input, async req => { input.packet.basis.intentVersion++; return reply(req) })
    expect(result).toMatchObject({ status: 'not_evaluated', reason: 'stale_basis', response: { usage: { input_tokens: 100 } } })
    expect(isDecisionCheckCurrent(result, input)).toBe(false)
  })

  it.each(['supported', 'contradicted', 'insufficient_evidence', 'service_failure'] as const)('leaves an actual compiled/stored development week unchanged for %s', async verdict => {
    const trace = traceGeneratedWeek(demandTraceProfile('speed_agility'), snapshot([speedOutcome('acceleration')]))
    const input = decisionFixture()
    input.baseline = { proposal: { plan: trace.plan, stored: trace.stored, sessions: trace.serializedSessions }, acceptance: { state: 'proposed', acceptedId: null } }
    const before = JSON.stringify(input.baseline)
    const transport = vi.fn(async (req: JevChoiceRequest) => {
      if (verdict === 'service_failure') throw new Error('injected failure')
      return reply(req, verdict)
    })
    const result = await evaluateDecisionCheck(input, transport)
    expect(transport).toHaveBeenCalledOnce()
    expect(result.status).toBe(verdict === 'service_failure' ? 'not_evaluated' : 'evaluated')
    expect(JSON.stringify(input.baseline)).toBe(before)
    expect(result).not.toHaveProperty('proposal')
    expect(personalizedCoachingCapabilities().initialDosePolicy).toBe(false)
  })

  it('leaves accepted history unchanged and preserves conflicting verdicts separately', async () => {
    const input = decisionFixture()
    input.baseline.acceptance = Object.freeze({ state: 'accepted', acceptedId: 'synthetic-accepted-version' })
    input.packet.checks.push({ ...input.packet.checks[0], id: 'emphasis_check', dimension: 'emphasis', claim: 'Increase emphasis now.' })
    const before = JSON.stringify(input)
    const result = await evaluateDecisionCheck(input, async req => {
      const r = reply(req)
      r.answers.emphasis_check = reply({ ...req, questions: { emphasis_check: req.questions.emphasis_check } }, 'contradicted').answers.emphasis_check
      return r
    })
    expect(result.status).toBe('evaluated')
    expect(result.response?.answers.supported_mapping.choice).toBe('supported')
    expect(result.response?.answers.emphasis_check.choice).toBe('contradicted')
    expect(JSON.stringify(input)).toBe(before)
  })
})
