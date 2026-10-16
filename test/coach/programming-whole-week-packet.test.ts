import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { checkWholeWeek, prepareWholeWeekPacket, renderWholeWeekReview } from '@/scripts/programming-whole-week-packet'
import { jsonBytes, sha256 } from '@/scripts/programming-shadow-packet'
import { prepareClarifiedShadowPacket } from '@/scripts/programming-shadow-packet-v2'
import { wholeWeekFixtures } from '@/test/fixtures/programming-whole-week'
import { traceGeneratedWeek } from '@/scripts/programming-goal-demand-trace'

describe('offline generated whole-week development packet', () => {
  let packet: ReturnType<typeof prepareWholeWeekPacket>
  const fetch = vi.fn(() => { throw new Error('Offline preparation cannot use transport') })
  beforeAll(() => { vi.stubGlobal('fetch', fetch); packet = prepareWholeWeekPacket() })
  afterAll(() => vi.unstubAllGlobals())

  it('prepares four actual compiler weeks and 24 proposed judgments without authorization or network calls', () => {
    expect(packet.cases).toHaveLength(4)
    expect(packet.cases.flatMap(c => c.review.labels)).toHaveLength(24)
    expect(packet.manifest).toMatchObject({ paidCallsAuthorized: 0, oldRunnerCompatible: false })
    expect(fetch).not.toHaveBeenCalled()
    expect(new Set(packet.cases.flatMap(c => c.review.labels.map(l => l.proposedVerdict))))
      .toEqual(new Set(['supported', 'contradicted', 'insufficient_evidence']))
  })

  it.each([0, 1, 2, 3])('binds the full actual compiler output and exact review context for week %s', index => {
    const c = packet.cases[index]
    const f = wholeWeekFixtures()[index]
    const source = jsonBytes(f)
    const trace = traceGeneratedWeek(f.profile, f.confirmed)
    expect(jsonBytes(f)).toBe(source)
    expect(c.request.state.compiledWeek).toEqual(trace.plan)
    expect(c.request.state.confirmedIntent).toEqual(f.confirmed)
    expect(c.request.state.compiledWeek.sessions.length).toBeGreaterThan(0)
    expect(c.request.state.provenance.compiledWeekHash).toBe(sha256(jsonBytes(trace.plan)))
    expect(c.request.state.provenance.numericalPolicyEnabled).toBe(false)
    expect(c.review.modelState).toEqual(c.request.state)
    expect(c.review.questions).toEqual(c.request.questions)
    expect(c.review.labels.every(l => l.reviewer === null && l.reviewerVerdict === null)).toBe(true)
    expect(c.requestHash).toBe(sha256(jsonBytes(c.request)))
    expect(c.requestBytes).toBeLessThanOrEqual(180_000)
    const bytes = jsonBytes(c.request)
    for (const excluded of ['proposedVerdict', 'reviewerVerdict', 'synthetic-development-owner', 'deterministic', 'matchedBlocks']) {
      expect(bytes).not.toContain(excluded)
    }
    c.review.labels.forEach((l, i) => {
      expect(c.request.questions[l.id].instructions).toContain(`state.checks[${i}]`)
    })
  })

  it('retains a deterministic missing-demand finding even when the legacy dose validator passes', () => {
    const c = packet.cases[1]
    expect(c.deterministic.dose.ok).toBe(true)
    expect(c.deterministic.demandPresence.find(d => d.demandId.endsWith(':max_velocity'))?.status).toBe('missing')
    expect(c.request.state.compiledWeek.schedule.gaps.some(g => g.targetId === 'maximum_velocity')).toBe(false)
    expect(packet.cases[0].deterministic.demandPresence.find(d => d.demandId.endsWith(':max_velocity'))?.status).toBe('present')
  })

  it('keeps same-domain outcomes distinct without presenting shared aerobic work as proof of event specificity', () => {
    const c = packet.cases[2]
    expect(c.request.state.confirmedIntent.content.outcomes).toHaveLength(2)
    expect(c.request.state.confirmedIntent.content.priorityOrder).toEqual(['goal:short-run', 'goal:long-run'])
    expect(c.deterministic.demandPresence).toHaveLength(2)
    expect(c.deterministic.demandPresence.every(d => d.status === 'present')).toBe(true)
    expect(c.deterministic.demandPresence.every(d => d.scope.includes('no claim of event specificity'))).toBe(true)
  })

  it('keeps unresolved review dimensions visible and does not create an overall pass', () => {
    for (const c of packet.cases) {
      expect(c.unchecked).toHaveLength(1)
      expect(c.unchecked[0].dimensions).toEqual(['evidence_fidelity', 'tradeoff'])
      expect(c.deterministic.storedRoundtripMatches).toBe(true)
      expect(c.deterministic.sourceInputsUnchanged).toBe(true)
      expect(c.deterministic.timeAccounting.every(t => t.fits && t.blockSumsMatch)).toBe(true)
      expect(c).not.toHaveProperty('passed')
    }
  })

  it('detects a corrupted time budget and block arithmetic without asking a model', () => {
    const f = wholeWeekFixtures()[0]
    const trace = traceGeneratedWeek(f.profile, f.confirmed)
    trace.plan.sessions[0].scheduledMinutes = 1
    trace.plan.sessions[0].blocks[0].estimatedMinutes += 1
    const checks = checkWholeWeek(trace, f.packet.confirmedDemands)
    expect(checks.timeAccounting[0]).toMatchObject({ fits: false, blockSumsMatch: false })
    expect(checks.dose.ok).toBe(false)
  })

  it('requires priority work, not just warm-up or a coverage assignment, for target presence', () => {
    const f = wholeWeekFixtures()[0]
    const trace = traceGeneratedWeek(f.profile, f.confirmed)
    trace.plan.sessions.forEach(s => { s.blocks = s.blocks.filter(b => b.role !== 'priority_adaptation') })
    expect(checkWholeWeek(trace, f.packet.confirmedDemands).demandPresence.every(d => d.status === 'missing')).toBe(true)
  })

  it('changes exact request identity if compiled dose, confirmed priority or evidence changes', () => {
    const c = packet.cases[2]
    for (const part of ['dose', 'priority', 'evidence']) {
      const request = structuredClone(c.request)
      if (part === 'dose') request.state.compiledWeek.sessions[0].blocks[0].estimatedMinutes += 1
      if (part === 'priority') request.state.confirmedIntent.content.priorityOrder!.reverse()
      if (part === 'evidence') (request.state as unknown as { evidence: Array<{ statement: string }> }).evidence[0].statement = 'Different observation'
      expect(sha256(jsonBytes(request))).not.toBe(c.requestHash)
    }
  })

  it('renders full sessions and questions verbatim and preserves the previous approved v2 manifest', () => {
    const review = renderWholeWeekReview(packet)
    for (const c of packet.cases) {
      expect(review).toContain(JSON.stringify({ state: c.request.state, questions: c.request.questions }, null, 2))
    }
    expect(prepareClarifiedShadowPacket().manifestHash).toBe('c1bbb0cbdab2561ed69f7d1ceb18a5c7f64c6e3b857a0117471ecc048e09a7c3')
    expect(prepareWholeWeekPacket().manifestHash).toBe(packet.manifestHash)
  })

  it('optionally exports a new review directory with exclusive writes', () => {
    if (process.env.WRITE_JEV_WHOLE_WEEK_PACKET !== '1') return
    const directory = resolve('output/programming-quality-review/jev-whole-week-development-v1')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'manifest.json'), jsonBytes(packet.manifest), { flag: 'wx' })
    writeFileSync(join(directory, 'proposed-labels.json'), jsonBytes(packet.labels), { flag: 'wx' })
    writeFileSync(join(directory, 'deterministic-findings.json'), jsonBytes(packet.cases.map(c => ({ id: c.id, checks: c.deterministic, unchecked: c.unchecked }))), { flag: 'wx' })
    writeFileSync(join(directory, 'review.md'), renderWholeWeekReview(packet), { flag: 'wx' })
    for (const c of packet.cases) writeFileSync(join(directory, `${c.id}.request.json`), jsonBytes(c.request), { flag: 'wx' })
  })
})
