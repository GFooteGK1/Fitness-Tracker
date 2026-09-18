import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { EngineeringScenarioSet } from '../fixtures/personalized-coaching/contracts'
import { executeEngineeringBoundaryFacts, ENGINEERING_BOUNDARY_VERSION } from './engineering-boundaries'

// Coordinator explicitly exposed this original holdout after its first failed
// adapter run. This suite is development evidence; replacement holdout is separate.
const file = 'test/fixtures/personalized-coaching/heldout-engineering.json', frozen = readFileSync(file, 'utf8')
const ids = ['heldout-plan-01', 'heldout-plan-02', 'heldout-plan-03', 'heldout-plan-04', 'heldout-nutrition-01', 'heldout-nutrition-03']
const scenarios = (JSON.parse(frozen) as EngineeringScenarioSet).scenarios.filter(s => ids.includes(s.id))
const results: unknown[] = []
beforeAll(() => { vi.stubEnv('RECOMMENDATIONS_ENABLED', 'true'); vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED', 'true') })
afterAll(() => {
  vi.unstubAllEnvs(); expect(readFileSync(file, 'utf8')).toBe(frozen)
  const directory = 'output/app-quality-release/personalized-coaching'; mkdirSync(directory, { recursive: true })
  const suffix = results.length === scenarios.length * 2 ? '' : '-partial'
  writeFileSync(`${directory}/exposed-engineering-boundaries-report${suffix}.json`, JSON.stringify({ adapterVersion: ENGINEERING_BOUNDARY_VERSION, split: 'exposed-original-heldout-development', fixtureHash: createHash('sha256').update(frozen).digest('hex'), results }, null, 2))
})
describe('exposed frozen facts against actual SQL boundaries', () => {
  for (const scenario of scenarios) for (const variant of ['base', 'counterfactual'] as const) {
    const facts = variant === 'base' ? scenario.facts : { ...scenario.facts, [scenario.counterfactual.field]: scenario.counterfactual.value }
    const expected = variant === 'base' ? scenario.expected : scenario.counterfactual.expected
    it(`${scenario.id}/${variant}`, async () => {
      const actual = await executeEngineeringBoundaryFacts(scenario.rule, scenario.athlete, facts), p = actual.predicates
      results.push({ id: scenario.id, variant, expected: expected.decision, actual })
      expect(actual.decision).toBe(expected.decision); expect(actual.fixtureFactsUnchanged).toBe(true); expect(p.numericPolicyEligible).toBe(false)
      if ('workerLeaseToken' in facts) {
        expect(p.sameRevisionTakeover).toBe(true); expect(p.oldToken).not.toBe(p.currentToken)
        if (facts.workerLeaseToken !== facts.currentLeaseToken) { expect(p.publicationError).toContain('lease or authority'); expect(p.retainedLease).toBe(p.currentToken); expect(actual.state).toBe('pending') }
        else { expect(p.publicationError).toBeNull(); expect(actual.recommendation?.planVersionId).toBe(p.storedPlanId) }
      } else if ('currentResponseRevision' in facts) {
        expect(p.publicationError).toBe('Recommendation inputs changed'); expect(p.responseRevision).toBe(facts.currentResponseRevision); expect(p.sourceRevision).toBe(facts.sourceRevision); expect(actual.state).toBe('pending')
      } else if ('capturedCapabilitiesVersion' in facts) {
        expect(p.unchangedSource).toBe(true); expect(p.storedDecisionCount).toBe(1)
        expect(p.capturedFingerprint === p.currentFingerprint).toBe(facts.capturedCapabilitiesVersion === facts.currentCapabilitiesVersion)
      } else if (facts.lifecycle === 'superseded') {
        expect(p.hiddenOld).toBe(true); expect(p.oldLifecycle).toBe('superseded'); expect(p.origin).toBe(p.oldId)
        expect(p.outcome.adherence).toBe(facts.outcomeComparable ? 'observed' : 'unknown'); expect(p.outcome.attributionLimits.join(' ')).toMatch(/overlap/); expect(p.outcome.attributionLimits.join(' ')).toMatch(/caus/)
        expect(p.visibleIds).not.toContain(p.oldId); expect(p.visibleIds).toContain(p.newerId); expect(p.overlapIds).toContain(p.newerId)
      } else if (Array.isArray(facts.authorizedChildIds)) {
        expect(p.authorized).toEqual(facts.authorizedChildIds); expect(p.committed).toEqual(facts.canonicalChildIds)
        expect(p.sameNormalizedPayload).toBe(facts.samePayload); expect(new Set(p.distinctCanonicalIds).size).toBe((facts.canonicalChildIds as string[]).length)
        const calories = Number(facts.otherCalories) + Number(facts.childCalories) * (facts.canonicalChildIds as string[]).length
        expect(p.canonical.calories).toBe(calories); expect(actual.recommendation?.reason).toContain(`${Number(facts.targetCalories) - calories} remaining in the log`)
        expect(p.retryCalls.some((id: string) => p.committedOperationIds.includes(id))).toBe(false)
        expect(p.retried.unresolved).toHaveLength((facts.authorizedChildIds as string[]).length - (facts.canonicalChildIds as string[]).length)
      } else {
        expect(p.unchangedSource).toBe(true); expect(p.validThroughLocalMidnight).toBe(true); expect(p.originalReason).toContain('250 remaining in the log')
        if (facts.currentLocalDate !== facts.decisionLocalDate) expect(p.visibleIds).toEqual([])
      }
    }, 30000)
  }
})
