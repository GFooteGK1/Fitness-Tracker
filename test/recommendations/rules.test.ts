import { describe, expect, it } from 'vitest'
import { abstain, evaluateRules } from '@/app/lib/recommendations/rules'
import { rankCandidates } from '@/app/lib/recommendations/rank'
import { context } from './fixtures'
import { runningOutcome } from '../fixtures/personalized-coaching/intent'

describe('bounded recommendation rules', () => {
  it('abstains on absent/default evidence without inventing a target, decline, or action', () => {
    const c = context(); c.intent = null
    expect(evaluateRules(c)).toEqual([])
    expect(abstain(c)).toMatchObject({ kind: 'abstain', missing: ['confirmed_goal'], outcome: null })
  })
  it('permits accepted-plan navigation without confirmed goal memory', () => {
    const c = context(); c.intent = null; c.plan = { id: 'plan-1', programId: 'program-1', policyVersion: 'existing', status: 'active' }
    c.sessions = [{ id: 'session-1', scheduled_date: c.localDate, status: 'planned', completed_workout_id: null, updated_at: c.now }]
    expect(evaluateRules(c)[0].decision).toMatchObject({ ruleId: 'accepted_plan.session', planVersionId: 'plan-1' })
    c.sessions[0].scheduled_date = '2026-09-16'; expect(evaluateRules(c)).toEqual([])
    c.sessions[0].scheduled_date = c.localDate; c.sessions[0].status = 'completed'; expect(evaluateRules(c)).toEqual([])
  })
  it('ranks the authoritative safety boundary ahead of all other actions', () => {
    const c = context(); c.review = { id: 'review-1', action: 'pause_review', created_at: c.now, invalidated: false }; c.missingBaselines = c.intent!.content.outcomes
    const rows = evaluateRules(c); expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ rank: 0, decision: { ruleId: 'accepted_plan.review' } })
  })
  it('surfaces the existing review evidence request without inventing a prescription or a new measurement', () => {
    const c = context(); c.review = { id: 'review-evidence', action: 'collect_signal', created_at: c.now, invalidated: false }
    const selected = rankCandidates(evaluateRules(c), [], c.now)[0]
    expect(selected).toMatchObject({ rank: 2, decision: { kind: 'collect_signal', ruleId: 'accepted_plan.review', destination: { type: 'review', href: '/program' }, outcome: null } })
    expect(selected.decision.sources).toEqual([{ table: 'coach_weekly_reviews', id: 'review-evidence', at: c.now, revision: null, facts: { action: 'collect_signal', invalidated: false } }])
    expect(selected.decision.reason).toContain('accepted plan stays unchanged')
    c.review.invalidated = true
    expect(rankCandidates(evaluateRules(c), [], c.now)[0]).toMatchObject({ rank: 0, decision: { reasonCodes: ['review_source_changed'] } })
  })
  it('uses confirmed priority and keeps full same-metric distance bindings separate', () => {
    const c = context(), mile = runningOutcome('goal:mile', 1609), fiveK = runningOutcome('goal:5k', 5000)
    c.intent!.content.outcomes = [fiveK, mile]; c.intent!.content.priorityOrder = [mile.goal.id, fiveK.goal.id]; c.missingBaselines = [fiveK, mile]
    const rows = rankCandidates(evaluateRules(c), [], c.now)
    expect(rows.map(r => r.decision.goalId)).toEqual([mile.goal.id, fiveK.goal.id])
    expect(rows[0].decision.outcome?.binding?.binding.distance?.value).toBe(1609)
    expect(rows[0].decision.evidenceFingerprint).not.toBe(rows[1].decision.evidenceFingerprint)
    mile.capability = { status: 'unsupported', reason: 'No adapter' }; expect(evaluateRules(c)).toHaveLength(1)
  })
  it('labels only logged estimated nutrition with unknown coverage and never diagnoses a deficit', () => {
    const c = context(); c.nutrition.target = { protein: 120, carbs: 200, fat: 60, calories: 1820, updatedAt: c.now }
    expect(evaluateRules(c)).toEqual([])
    c.nutrition.meals = [{ id: 'meal-1', at: c.now, revision: 1, protein: 30, carbs: 20, fat: 10, calories: 290, estimated: true }]
    const d = evaluateRules(c)[0].decision
    expect(d.reason).toContain('90 g remaining in the log'); expect(d.reason).toContain('Some amounts are estimates'); expect(d.reason).toContain('coverage is unknown')
    expect(d.reason).toContain('290 calories are logged against your 1820 calorie target (1530 remaining in the log)')
    expect(d.reason).toContain('does not establish your total intake or a fueling deficit'); expect(d.missing).toContain('logging_coverage')
    c.intent = null; expect(evaluateRules(c)[0].decision.ruleId).toBe('logged_nutrition.remaining')
    c.nutrition.target = null; expect(evaluateRules(c)).toEqual([])
  })
  it('never turns above-target logged calories into a negative remaining amount or a prescription', () => {
    const c = context(); c.nutrition.target = { protein: 120, carbs: 200, fat: 60, calories: 1820, updatedAt: c.now }
    c.nutrition.meals = [{ id: 'meal-1', at: c.now, revision: 1, protein: 150, carbs: 200, fat: 70, calories: 2030, estimated: true }]
    const d = evaluateRules(c)[0].decision
    expect(d.reason).toContain('2030 calories are logged against your 1820 calorie target (0 remaining in the log)')
    expect(d.reason).toContain('Some amounts are estimates'); expect(d.reason).toContain('does not establish your total intake')
  })
  it('invalidates coverage after a later source revision', () => {
    const c = context(); c.nutrition.target = { protein: 120, carbs: 200, fat: 60, calories: 1820, updatedAt: c.now }
    c.nutrition.meals = [{ id: 'meal-1', at: c.now, revision: 1, protein: 30, carbs: 20, fat: 10, calories: 290, estimated: false }]
    c.nutrition.coverage = { through: c.now, status: 'complete_through', sourceRevision: c.claim.sourceRevision - 1 }
    expect(evaluateRules(c)[0].decision.missing).toContain('logging_coverage')
  })
  it('states partial and unknown coverage explicitly with its time bound', () => {
    const c = context(); c.nutrition.target = { protein: 120, carbs: 200, fat: 60, calories: 1820, updatedAt: c.now }
    c.nutrition.meals = [{ id: 'meal-1', at: c.now, revision: 1, protein: 30, carbs: 20, fat: 10, calories: 290, estimated: false }]
    c.nutrition.coverage = { through: c.now, status: 'partial', sourceRevision: 3, valid: true }
    let d = evaluateRules(c)[0].decision; expect(d.reason.toLowerCase()).toContain('partial'); expect(d.reason).toContain(c.now)
    c.nutrition.coverage.status = 'unknown'; d = evaluateRules(c)[0].decision
    expect(d.reason.toLowerCase()).toContain('unknown'); expect(d.missing).toContain('logging_coverage')
  })
  it('does not resurrect a dismissed duplicate on clock/source noise; meaningful baseline changes can resurface', () => {
    const c = context(); c.missingBaselines = c.intent!.content.outcomes
    const first = evaluateRules(c)[0].decision, suppression = { scope_key: first.scopeKey, evidence_fingerprint: first.evidenceFingerprint, response: 'not_applicable' as const, defer_until: null }
    c.now = '2026-09-17T18:00:01.000Z'; c.claim.sourceRevision += 1
    expect(rankCandidates(evaluateRules(c), [suppression], c.now)).toEqual([])
    c.missingBaselines[0].binding.distance!.value = 10000
    expect(rankCandidates(evaluateRules(c), [suppression], c.now)).toHaveLength(1)
  })
  it('honors defer deadlines without source writes', () => {
    const c = context(); c.missingBaselines = c.intent!.content.outcomes; const d = evaluateRules(c)[0].decision
    const suppression = { scope_key: d.scopeKey, evidence_fingerprint: d.evidenceFingerprint, response: 'deferred' as const, defer_until: '2026-09-17T18:01:00.000Z' }
    expect(rankCandidates(evaluateRules(c), [suppression], c.now)).toEqual([])
    expect(rankCandidates(evaluateRules(c), [suppression], suppression.defer_until)).toHaveLength(1)
  })
  it('keeps nutrition suppression for timestamp-only target updates and notes-only meal revisions', () => {
    const c = context(); c.nutrition.target = { protein: 120, carbs: 200, fat: 60, calories: 1820, updatedAt: c.now }
    c.nutrition.meals = [{ id: 'meal-1', at: c.now, revision: 1, protein: 30, carbs: 20, fat: 10, calories: 290, estimated: true }]
    const first = evaluateRules(c)[0].decision
    const suppression = { scope_key: first.scopeKey, evidence_fingerprint: first.evidenceFingerprint, response: 'not_applicable' as const, defer_until: null }
    c.nutrition.target.updatedAt = '2026-09-17T18:02:00.000Z'; c.nutrition.meals[0].revision = 2; c.claim.sourceRevision += 1
    expect(rankCandidates(evaluateRules(c), [suppression], c.now)).toEqual([])
    c.nutrition.meals[0].protein = 50
    expect(rankCandidates(evaluateRules(c), [suppression], c.now)).toHaveLength(1)
  })
  it('keeps the same evidence identity when equal-time meal rows arrive in a different order', () => {
    const c = context(); c.nutrition.target = { protein: 120, carbs: 200, fat: 60, calories: 1820, updatedAt: c.now }
    c.nutrition.meals = ['meal-a', 'meal-b'].map(id => ({ id, at: c.now, revision: 1, protein: 30, carbs: 20, fat: 10, calories: 290, estimated: true }))
    const first = evaluateRules(c)[0].decision.evidenceFingerprint; c.nutrition.meals.reverse()
    expect(evaluateRules(c)[0].decision.evidenceFingerprint).toBe(first)
  })
})
