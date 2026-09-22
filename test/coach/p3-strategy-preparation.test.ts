import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { syntheticStrategy } from '../../docs/verification/programming-quality/p3-strategy-contract'

const manifest = JSON.parse(readFileSync(resolve('docs/verification/programming-quality/p3-strategy-cases.json'), 'utf8')) as {
  synthetic: boolean
  sealedHoldout: boolean
  expectedNumericalGold: boolean
  runtimeActivationAuthorized: boolean
  coachingReviewStatus: string
  engineeringAssertionStatus: string
  cases: Array<{
    id: string; family: string; title: string; synthetic: boolean
    assumptions: string[]; inputFacts: Record<string, unknown>
    expectedEngineeringAssertions: string[]; prohibitedInferences: string[]
    coachingJudgment: { status: string; questions: string[] }
  }>
}

// These are artifact-integrity checks, not executions of a P3 planner.
describe('P3 development scenario preparation', () => {
  it('keeps development specifications separate from coaching results and the holdout', () => {
    expect(manifest).toMatchObject({
      synthetic: true, sealedHoldout: false, expectedNumericalGold: false,
      runtimeActivationAuthorized: false, coachingReviewStatus: 'pending',
      engineeringAssertionStatus: 'specifications_not_executed'
    })
    expect(manifest.cases).toHaveLength(20)
    expect(new Set(manifest.cases.map(item => item.id)).size).toBe(20)
  })

  it.each(manifest.cases)('$id contains inspectable facts and unanswered coaching questions', item => {
    expect(item.id).toMatch(/^p3-dev-\d{2}$/)
    expect(item.synthetic).toBe(true)
    expect(item.family.length).toBeGreaterThan(0)
    expect(item.title.length).toBeGreaterThan(0)
    expect(Object.keys(item.inputFacts).length).toBeGreaterThan(0)
    for (const texts of [item.assumptions, item.expectedEngineeringAssertions, item.prohibitedInferences, item.coachingJudgment.questions]) {
      expect(texts.length).toBeGreaterThan(0)
      expect(texts.every(text => typeof text === 'string' && text.trim().length > 0)).toBe(true)
    }
    expect(item.coachingJudgment.status).toBe('pending')
  })
})

describe('P3 synthetic strategy example consistency', () => {
  it('links every declared outcome and physical exposure without duplicate IDs', () => {
    const { outcomes, exposures } = syntheticStrategy
    expect(new Set(outcomes.map(outcome => outcome.outcomeId)).size).toBe(outcomes.length)
    expect(new Set(exposures.map(exposure => exposure.id)).size).toBe(exposures.length)
    for (const outcome of outcomes) {
      expect(outcome.exposureIds.length).toBeGreaterThan(0)
      for (const exposureId of outcome.exposureIds) {
        const exposure = exposures.find(value => value.id === exposureId)
        expect(exposure?.outcomeCredits.some(credit => credit.outcomeId === outcome.outcomeId)).toBe(true)
      }
    }
    for (const exposure of exposures) {
      for (const credit of exposure.outcomeCredits) {
        expect(outcomes.find(outcome => outcome.outcomeId === credit.outcomeId)?.exposureIds).toContain(exposure.id)
      }
    }
  })

  it('accounts for five complete 60-minute windows using duration upper bounds', () => {
    const sessions = syntheticStrategy.candidates[0].sessions
    expect(sessions).toHaveLength(5)
    expect(new Set(sessions.map(session => session.date)).size).toBe(5)
    for (const session of sessions) {
      expect(session.budgetMinutes).toBe(60)
      if (session.interval.certainty !== 'known') throw new Error('Example requires a confirmed interval')
      expect(session.interval.date).toBe(session.date)
      expect(session.interval.endMinute - session.interval.startMinute).toBe(session.budgetMinutes)
      const totalUpper = session.timeEntries.reduce((sum, entry) => {
        const duration = entry.duration
        if (duration.certainty === 'unknown') throw new Error('Example cannot certify fit with unknown time')
        const upper = duration.certainty === 'known' ? duration.minutes : duration.upper
        expect(Number.isFinite(upper) && upper >= 0).toBe(true)
        if (duration.certainty === 'estimated') expect(duration.lower >= 0 && duration.lower <= upper).toBe(true)
        return sum + upper
      }, 0)
      expect(totalUpper).toBe(session.budgetMinutes)
      expect(session.timeEntries.map(entry => entry.kind)).toEqual(expect.arrayContaining(['preparation', 'ramp', 'work_with_rest', 'transition', 'reserve']))
    }
  })

  it('counts each physical exposure once per candidate and keeps monitoring distinct', () => {
    for (const candidate of syntheticStrategy.candidates) {
      const entries = candidate.sessions.flatMap(session => session.timeEntries)
      expect(new Set(entries.map(entry => entry.id)).size).toBe(entries.length)
      const ids = entries.flatMap(entry => entry.exposureId ? [entry.exposureId] : [])
      expect([...candidate.exposureIds].sort()).toEqual(syntheticStrategy.exposures.map(exposure => exposure.id).sort())
      expect(ids.sort()).toEqual(syntheticStrategy.exposures.map(exposure => exposure.id).sort())
      for (const exposure of syntheticStrategy.exposures.filter(value => value.role === 'monitoring')) {
        expect(exposure.protocolRef).not.toBeNull()
        expect(entries.find(entry => entry.exposureId === exposure.id)?.kind).toBe('monitoring')
      }
    }
  })

  it('selects a declared synthetic candidate without representing product readiness', () => {
    expect(syntheticStrategy.designVersion).toBe('p3-preparation-1')
    expect(syntheticStrategy.basis.ownerId).toBe('synthetic-owner')
    expect(syntheticStrategy.outsideContext.coverage).toBe('confirmed_none')
    expect(syntheticStrategy.outsideContext.adjacentCoverage).toBe('unknown')
    const result = syntheticStrategy.result
    if (result.status !== 'ready') throw new Error('Expected the explicitly hypothetical ready example')
    expect(syntheticStrategy.candidates.some(candidate => candidate.id === result.selectedCandidateId)).toBe(true)
    expect(result.rationale).toContain('not product readiness or coaching quality')
  })
})
