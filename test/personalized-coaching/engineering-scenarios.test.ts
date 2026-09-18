import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { EngineeringScenarioSet, FixtureValue } from '../fixtures/personalized-coaching/contracts'
import { ENGINEERING_ADAPTER_VERSION, executeEngineeringFacts, type EngineeringActual } from './engineering-adapter'
import { closeEngineeringLifecycle, type EngineeringLifecycleActual } from '../database/engineering-lifecycle'
import type { EngineeringBoundaryActual } from '../database/engineering-boundaries'

// Original heldout was exposed at the first frozen run and is now consumed
// adapter-development evidence. It is never described as unseen on a rerun.
// Replacement holdout needs a separate explicit coordinator-controlled path.
const split = process.env.RUN_PERSONALIZED_REPLACEMENT === '1' ? 'replacement-heldout-engineering'
  : process.env.RUN_PERSONALIZED_HELDOUT === '1' ? 'heldout-engineering' : 'development'
const fixtureText = readFileSync(resolve(`test/fixtures/personalized-coaching/${split}.json`), 'utf8')
const fixtures = JSON.parse(fixtureText) as EngineeringScenarioSet
const results: Array<{ id: string; variant: string; expected: string; actual: EngineeringActual; assertions: string[]; forbidden: string[] }> = []
beforeAll(() => { vi.stubEnv('RECOMMENDATIONS_ENABLED', 'true'); vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED', 'true') })

describe(`frozen ${split} engineering scenarios (not coach validation)`, () => {
  for (const scenario of fixtures.scenarios) {
    for (const variant of ['base', 'counterfactual'] as const) {
      const facts: Record<string, FixtureValue> = variant === 'base' ? scenario.facts : { ...scenario.facts, [scenario.counterfactual.field]: scenario.counterfactual.value }
      const expected = variant === 'base' ? scenario.expected : scenario.counterfactual.expected
      it(`${scenario.id}/${variant}: ${scenario.title}`, async context => {
        const frozenFacts = JSON.stringify(facts)
        const actual = await executeEngineeringFacts(scenario.rule, scenario.athlete, facts)
        expect(JSON.stringify(facts)).toBe(frozenFacts)
        results.push({ id: scenario.id, variant, expected: expected.decision, actual, assertions: expected.assertions, forbidden: expected.forbidden })
        expect(actual.sourceRecordsUnchanged).toBe(actual.predicates.canonicalLifecycle || actual.predicates.canonicalBoundary ? null : true)
        expect(actual.predicates.numericPolicyEligible).toBe(false)
        expect(actual.predicates.retiredNutritionPerformance).toBe(true)
        expect(actual.predicates.retiredHrvTrend).toBe(true)
        expect(actual.sourceQueries.every(query => query.ownerScoped)).toBe(true)
        if (facts.metric === 'session.rpe') {
          expect(actual.predicates.feedbackAccepted).toBe(true)
          expect(actual.predicates.sessionRpeExplicit).toBe(facts.explicitFieldProvenance === 'feedback_v2_athlete_reported')
          expect(actual.predicates.hardestSetEffort).toBeNull()
        }
        if (facts.quantity && typeof facts.quantity === 'object' && !Array.isArray(facts.quantity)) {
          const q = facts.quantity
          expect(actual.predicates.performedQuantity).toMatchObject(q.kind === 'exact' ? { kind: 'exact', value: q.value } : { kind: 'bounded', min: q.minimum, max: q.maximum })
        }
        if (facts.requestedMode === 'historical_replay') {
          const h = actual.predicates.historicalSource as any
          expect(h.inputsUnchanged).toBe(true)
          if (facts.snapshotAvailable) {
            expect(h.resolved.issues).toEqual([])
            expect(h.resolved.workouts).toHaveLength(1)
            expect(h.resolved.workouts[0].capture_revision).toBe(facts.asOfRevision)
            expect(h.resolved.workouts[0].blocks).toEqual(h.archivedBlocks)
            expect(h.resolved.workouts[0].blocks).not.toEqual(h.currentBlocks)
          } else {
            expect(h.resolved.workouts).toEqual([])
            expect(h.resolved.issues).toContainEqual({ sourceId: facts.observationId, reason: 'historical_snapshot_unavailable' })
          }
        }
        if (facts.effortScope) {
          const e = actual.predicates.effortScope as any
          expect(e.session.ok).toBe(true)
          expect(e.sessionExplicit).toBe(facts.effortScope === 'session')
          expect(e.session.value.sessionRpe).toBe(facts.effortScope === 'session' ? facts.value : null)
          if (facts.effortScope === 'hardest_set') expect(e.signal).toMatchObject({ ok: true, value: { ratingScope: 'hardest_set', rpe: facts.value, rpeScale: 'effort_0_10' } })
          else expect(e.signal).toBeNull()
        }
        if (actual.state === 'unsupported_adapter') {
          // Predicate checks above still execute. A skipped decision is a visible
          // coverage gap, never counted as an accepted frozen scenario.
          if (process.env.REQUIRE_ALL_ENGINEERING_CASES === '1') expect(actual.unsupported, 'Unmapped frozen acceptance case blocks complete fixture acceptance').toEqual([])
          context.skip(actual.unsupported.join('; '))
          return
        }
        expect(actual.decision).toBe(expected.decision)
        if (actual.predicates.canonicalBoundary) {
          const boundary = actual.predicates.canonicalBoundary as EngineeringBoundaryActual, p = boundary.predicates
          expect(boundary.fixtureFactsUnchanged).toBe(true)
          if ('workerLeaseToken' in facts) {
            expect(p.sameRevisionTakeover).toBe(true); expect(p.oldToken).not.toBe(p.currentToken)
            if (facts.workerLeaseToken !== facts.currentLeaseToken) { expect(p.publicationError).toContain('lease or authority'); expect(p.retainedLease).toBe(p.currentToken); expect(actual.state).toBe('pending') }
            else if (facts.workerSourceRevision === facts.sourceRevision && facts.workerResponseRevision === facts.responseRevision) { expect(p.publicationError).toBeNull(); expect(actual.recommendation?.planVersionId).toBe(p.storedPlanId) }
            else expect(p.publicationError).not.toBeNull()
          } else if ('currentResponseRevision' in facts) {
            expect(p.publicationError).toBe('Recommendation inputs changed'); expect(p.responseRevision).toBe(facts.currentResponseRevision); expect(p.sourceRevision).toBe(facts.sourceRevision); expect(actual.state).toBe('pending')
          } else if ('capturedCapabilitiesVersion' in facts) {
            expect(p.unchangedSource).toBe(true); expect(p.storedDecisionCount).toBe(1)
            expect(p.capturedFingerprint === p.currentFingerprint).toBe(facts.capturedCapabilitiesVersion === facts.currentCapabilitiesVersion)
          } else if (facts.lifecycle === 'superseded') {
            expect(p.hiddenOld).toBe(true); expect(p.oldLifecycle).toBe('superseded'); expect(p.origin).toBe(p.oldId)
            expect(p.outcome.adherence).toBe(facts.outcomeComparable ? 'observed' : 'unknown'); expect(p.outcome.attributionLimits.join(' ')).toMatch(/overlap/); expect(p.outcome.attributionLimits.join(' ')).toMatch(/caus/)
            expect(p.visibleIds).not.toContain(p.oldId); expect(p.overlapIds).toContain(p.newerId)
          } else if (Array.isArray(facts.authorizedChildIds)) {
            expect(p.authorized).toEqual(facts.authorizedChildIds); expect(p.committed).toEqual(facts.canonicalChildIds)
            expect(p.sameNormalizedPayload).toBe(facts.samePayload); expect(new Set(p.distinctCanonicalIds).size).toBe((facts.canonicalChildIds as string[]).length)
            const calories = Number(facts.otherCalories) + Number(facts.childCalories) * (facts.canonicalChildIds as string[]).length
            expect(p.canonical.calories).toBe(calories); expect(actual.recommendation?.reason).toContain(`${Math.round(Math.max(0, Number(facts.targetCalories) - calories))} remaining in the log`)
            expect(p.retryCalls.some((id: string) => p.committedOperationIds.includes(id))).toBe(false)
            expect(p.retried.unresolved).toHaveLength((facts.authorizedChildIds as string[]).length - (facts.canonicalChildIds as string[]).length)
          } else {
            expect(p.unchangedSource).toBe(true); expect(p.validThroughLocalMidnight).toBe(true)
            expect(p.originalReason).toContain(`${Math.round(Math.max(0, Number(facts.targetCalories) - Number(facts.loggedCalories)))} remaining in the log`)
            if (facts.currentLocalDate !== facts.decisionLocalDate) expect(p.visibleIds).toEqual([])
          }
          return
        }
        if (actual.predicates.canonicalLifecycle) {
          const lifecycle = actual.predicates.canonicalLifecycle as EngineeringLifecycleActual
          expect(lifecycle.fixtureFactsUnchanged).toBe(true)
          if (typeof facts.currentCalculationRevision === 'number') {
            expect(lifecycle.predicates.currentCanonicalRevision).toBe(facts.mealRevision)
            expect(lifecycle.predicates.originalCalculationRevision).toBe(facts.currentCalculationRevision)
            if (facts.mealRevision !== facts.currentCalculationRevision) {
              expect(lifecycle.predicates.currentVisibleIds).toEqual([])
              expect(lifecycle.predicates.coverageValid).toBe(false)
              expect(lifecycle.predicates.sourceChanged).toBe(true)
            } else expect(lifecycle.predicates.coverageValid).toBe(true)
          } else if (facts.photoPersistence === 'save_unconfirmed') {
            const branches = lifecycle.predicates.branches as Array<Record<string, any>>
            expect(branches.map(branch => branch.serverState)).toEqual(['ready', 'pending'])
            for (const branch of branches) {
              expect(branch.decision).toBe('abstain'); expect(branch.needsReconciliation).toBe(true)
              expect(branch.beforeRead).toEqual(branch.afterRead)
              expect(branch.noWriteConfirmed).not.toBe(true)
              expect(branch.recoveredRequestId).toBe(branch.requestId)
              expect(branch.photoRequestCount).toBe(1); expect(branch.exactReceiptReplay).toBe(true)
              expect(branch.afterRecovery).toMatchObject({ count: 2, calories: (Number(facts.canonicalCalories) + Number(facts.queuedEstimatedCalories)).toFixed(2) })
              expect(branch.afterRecoveryDecision).toMatchObject({ decision: 'action', state: 'ready', needsReconciliation: false })
            }
          } else expect(lifecycle.predicates.submittedPhotoRequests).toBe(0)
          if (actual.recommendation) expect(actual.recommendation.reason).toContain(`${Math.round(Math.max(0, Number(facts.targetCalories) - Number(facts.canonicalCalories ?? facts.loggedCalories)))} remaining in the log`)
          return
        }
        if (facts.retrieval === 'failed' || facts.retrieval === 'truncated') expect(actual.state).toBe('unavailable')
        if (scenario.rule === 'accepted_plan' && actual.recommendation) {
          expect(actual.recommendation.planVersionId).toBe(facts.planId)
          if (facts.existingSafetyReview) expect(actual.recommendation.reasonCodes).toContain('existing_pain_review_boundary')
          else if (facts.reviewState === 'proposal_ready') expect(actual.recommendation.destination?.href).toContain(encodeURIComponent(String(facts.reviewId)))
          else expect(actual.recommendation.destination?.href).toContain(encodeURIComponent(String(facts.sessionId)))
        }
        if (scenario.rule === 'missing_signal' && actual.recommendation) {
          expect(actual.recommendation.kind).toBe('collect_signal')
          if (actual.predicates.weeklyReview) {
            const review = actual.predicates.weeklyReview as { doseChange: unknown; missing: string[]; goalReviews: Array<{ attained: boolean; matchingAssignmentIds: string[] }> }
            expect(actual.predicates.acceptedPlanUnchanged).toBe(true)
            expect(review.doseChange).toBeNull()
            expect(actual.recommendation.sources.every(source => source.table === 'coach_weekly_reviews')).toBe(true)
            if (Array.isArray(facts.goalIds)) {
              expect(review.missing).toContain('outcome_priority_unspecified')
              expect(review.goalReviews[0].attained).toBe(facts.firstGoalAttained)
            } else expect(review.goalReviews[0].matchingAssignmentIds).toEqual([])
          } else {
            const missingIds = Array.isArray(facts.goalIds) ? facts.goalIds.filter((_, index) => (index === 0 ? facts.firstGoalBaseline : facts.secondGoalBaseline) === 'missing') : []
            const priorityIds = Array.isArray(facts.goalPriority) ? facts.goalPriority : facts.goalIds
            expect(actual.recommendation.goalId).toBe(Array.isArray(priorityIds) ? priorityIds.find(id => missingIds.includes(id)) : facts.goalId)
            expect(actual.recommendation.sources.every(source => source.table === 'coach_memories')).toBe(true)
            if (actual.predicates.boundBaselines) {
              const bound = actual.predicates.boundBaselines as any
              if (Array.isArray(facts.goalIds)) {
                expect(actual.predicates.missingBaselineGoalIds).toEqual(missingIds)
                for (const [index, outcome] of bound.outcomes.entries()) {
                  const status = index === 0 ? facts.firstGoalBaseline : facts.secondGoalBaseline
                  expect(outcome.goal.status).toBe(status === 'achieved' ? 'achieved' : 'active')
                  expect(outcome.baseline.status).toBe(status === 'missing' ? 'unknown' : 'referenced')
                }
                const selectedIndex = facts.goalIds.indexOf(String(actual.recommendation.goalId))
                expect(actual.recommendation.sources[0].facts.binding).toMatchObject({ distance: { value: ((facts.goalDistancesMeters as number[] | undefined) ?? [400, 5000])[selectedIndex], unit: 'm' } })
              } else expect(facts.observedEquipment).not.toBe(facts.requestedEquipment)
            }
          }
        }
        if ('pain' in facts) {
          expect(actual.predicates.feedbackAccepted).toBe(true)
          expect(actual.predicates.feedback).toMatchObject({ pain: facts.pain, energy: null, sessionRpe: null, explicitPain: facts.pain !== null })
        }
        if (scenario.rule === 'logged_nutrition') {
          if (actual.state === 'ready') expect(actual.predicates.targetPresent).toBe(facts.targetConfirmed)
          if (actual.state === 'ready' && facts.evidenceOwner && facts.evidenceOwner !== (facts.requestOwner ?? scenario.athlete)) expect(actual.predicates.includedMealIds).toEqual([])
          if (actual.recommendation) {
            const logged = Number(facts.canonicalCalories ?? facts.loggedCalories)
            expect(actual.predicates.loggedCalories).toBe(logged)
            expect(actual.recommendation.reason).toContain(`${Math.round(Math.max(0, Number(facts.targetCalories) - logged))} remaining in the log`)
            expect(actual.recommendation.reason).toContain('does not establish your total intake or a fueling deficit')
            expect(actual.recommendation.reasonCodes).toContain('logged_amount_only')
            if (facts.origin === 'model_estimated') expect(actual.recommendation.reasonCodes).toContain('estimated_amounts')
            if (facts.mealOrigin === 'copied_template') {
              expect(actual.recommendation.reasonCodes.includes('estimated_amounts')).toBe(facts.templateCompositionOrigin !== 'athlete_reported')
              expect(actual.predicates.copyProvenance).toMatchObject({ occurrence: { origin: 'athlete_reported', reviewState: facts.occurrenceConfirmed === false ? 'unreviewed' : 'athlete_confirmed' }, fields: { macros: { origin: facts.templateCompositionOrigin, reviewState: facts.compositionReview } } })
              expect((actual.predicates.copyProvenance as any).fields.macros.sourceReferences).toHaveLength(1)
            }
            if (facts.whoopSyncStatus === 'partial') expect(actual.predicates.whoopEligible).toBe(false)
            if (facts.coverage === 'unknown') expect(actual.recommendation.reason).toContain('Logging coverage is unknown')
            expect(actual.recommendation.sources.every(source => ['daily_targets', 'meals', 'logging_coverage_confirmations'].includes(source.table))).toBe(true)
          }
        }
      }, 30000)
    }
  }
})

afterAll(async () => {
  await closeEngineeringLifecycle()
  vi.unstubAllEnvs()
  const folder = resolve('output/app-quality-release/personalized-coaching')
  mkdirSync(folder, { recursive: true })
  writeFileSync(resolve(folder, `${split}-engineering-report.json`), JSON.stringify({
    adapterVersion: ENGINEERING_ADAPTER_VERSION, fixtureHash: createHash('sha256').update(fixtureText).digest('hex'),
    scope: 'Synthetic production readers/rules/W6 review plus actual SQL/client-gate lifecycle for revision and uncertain-photo cases. Remaining concurrency and browser guarantees have separate suites. No numerical or qualified-coach acceptance.',
    split, exposure: split === 'heldout-engineering' ? 'consumed_for_adapter_development_after_first_frozen_run' : split === 'replacement-heldout-engineering' ? 'coordinator_controlled_frozen_candidate_run' : 'implementation_visible', total: results.length, unsupported: results.filter(r => r.actual.state === 'unsupported_adapter').length,
    mismatches: results.filter(r => r.actual.state !== 'unsupported_adapter' && r.actual.decision !== r.expected).map(r => `${r.id}/${r.variant}`),
    results: results.sort((a, b) => `${a.id}/${a.variant}`.localeCompare(`${b.id}/${b.variant}`)),
  }, null, 2) + '\n', 'utf8')
})
