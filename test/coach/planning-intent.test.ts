import { describe, expect, it } from 'vitest'
import { findAssessmentDefinition } from '@/app/lib/coach/adaptive-programming-contracts'
import { validatePlanningIntent, outcomeBindingKey, stampPlanningIntent, type PlanningIntentV1, type PlanningOutcome } from '@/app/lib/coach/planning-intent'
import { buildStoredRollingWeeklyIntent, parseStoredRollingWeeklyIntent } from '@/app/lib/coach/rolling-weekly-api'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildAdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'

import { runningOutcome, intent } from '../fixtures/personalized-coaching/intent'

describe('confirmed planning intent', () => {
  it('keeps two same-domain outcomes distinct without inventing a numeric target or priority', () => {
    const value = intent(runningOutcome(), runningOutcome('goal:mile', 1609))
    expect(validatePlanningIntent(value).ok).toBe(true)
    expect(outcomeBindingKey(value.outcomes[0])).not.toBe(outcomeBindingKey(value.outcomes[1]))
    expect(value.outcomes[0].goal.target).toBeNull()
    expect(value.priorityOrder).toBeNull()
  })
  it('treats equivalent wording and equivalent distance units as the same measurement binding', () => {
    const a = runningOutcome(), b = structuredClone(a)
    b.goal.statement = 'Run a faster 5 km'
    b.binding.distance = { value: 5, unit: 'km' }
    expect(outcomeBindingKey(a)).toBe(outcomeBindingKey(b))
  })
  it('requires the complete explicitly confirmed priority and owned baseline identity shape', () => {
    const value = intent(runningOutcome(), runningOutcome('goal:mile', 1609))
    value.priorityOrder = ['goal:5k']
    expect(validatePlanningIntent(value).ok).toBe(false)
    value.priorityOrder = ['goal:mile', 'goal:5k']
    expect(validatePlanningIntent(value).ok).toBe(true)
    value.outcomes[0].baseline = { status: 'referenced', observationId: 'client-evidence' }
    expect(validatePlanningIntent(value).ok).toBe(false)
  })
  it('rejects omitted measurement for a supported measurable targetless goal', () => {
    const value = intent(); value.outcomes[0].measurement = null
    expect(validatePlanningIntent(value).ok).toBe(false)
  })
  it('preserves process and unsupported outcomes without inventing measurements', () => {
    const process = runningOutcome(); process.goal.kind = 'process'; process.goal.requiredQualityIds = ['training_adherence']; process.measurement = null
    const unsupported = runningOutcome('goal:sport'); unsupported.domain = null; unsupported.measurement = null; unsupported.capability = { status: 'unsupported', reason: 'Archery programming is unavailable' }
    expect(validatePlanningIntent(intent(process, unsupported)).ok).toBe(true)
  })
  it('rejects a protocol/domain mismatch and target/measurement mismatch', () => {
    const value = intent(); value.outcomes[0].domain = 'strength'
    expect(validatePlanningIntent(value).ok).toBe(false)
    value.outcomes[0].domain = 'aerobic'
    const o = value.outcomes[0]
    o.goal.target = { role: 'target', comparison: 'at_most', metric: { metricId: 'run.time', unit: 'min', value: 20 }, assessmentDefinition: o.measurement!.assessmentDefinition, protocol: o.measurement!.protocol }
    expect(validatePlanningIntent(value).ok).toBe(false)
  })
  it('rejects unknown nested keys, malformed goal values, duplicate IDs and nine outcomes', () => {
    const cases = [
      { ...intent(), ownerId: 'forged' },
      { ...intent(), outcomes: [{ ...runningOutcome(), binding: { ...runningOutcome().binding, confidence: 1 } }] },
      { ...intent(), outcomes: [{ ...runningOutcome(), goal: { ...runningOutcome().goal, statement: null } }] },
      intent(runningOutcome(), runningOutcome()),
      intent(...Array.from({ length: 9 }, (_, i) => runningOutcome(`goal:${i}`))),
    ]
    for (const value of cases) expect(validatePlanningIntent(value).ok).toBe(false)
  })
  it('requires strength variation and repetition context instead of comparing arbitrary rep-max protocols', () => {
    const o = runningOutcome(); const d = findAssessmentDefinition('strength.repetition_max')!
    o.domain = 'strength'; o.measurement = { metricId: 'strength.load', unit: 'kg', assessmentDefinition: { id: d.id, version: d.version }, protocol: { id: d.protocol.id, version: d.protocol.version } }
    o.goal.requiredQualityIds = ['maximal_strength']; o.binding = { movementId: GOLDEN_PROGRAMMING_PROFILES[0].profile.assessments[0]?.movement ?? 'barbell_back_squat', distance: null, equipmentIds: ['barbell'], variation: 'standard' }
    expect(validatePlanningIntent(intent(o)).ok).toBe(false)
  })
  it('stamps all confirmation fields together without changing semantic targets', () => {
    const value = intent(); const stamped = stampPlanningIntent(value, '2026-09-18T12:00:00.000Z')
    expect(validatePlanningIntent(stamped).ok).toBe(true)
    expect(value.confirmedAt).not.toBe(stamped.confirmedAt)
    expect(outcomeBindingKey(value.outcomes[0])).toBe(outcomeBindingKey(stamped.outcomes[0]))
  })
  it('dispatches legacy and additive snapshots without changing existing schema versions or accepted source', () => {
    const profile = structuredClone(GOLDEN_PROGRAMMING_PROFILES[0].profile)
    const build = () => {
      const direction = buildRollingTrainingDirection(profile, { hypothesis: 'Observe repeated compatible direct outcomes.' })
      const plan = buildRollingWeeklyPlan({ source: 'initial', windowStart: profile.startDate, profile, direction })
      if (plan.kind !== 'weekly_plan') throw new Error('Fixture should compile')
      return buildStoredRollingWeeklyIntent(plan, buildAdaptivePlanContract(profile, [plan]))
    }
    const legacy = build()
    expect(parseStoredRollingWeeklyIntent(legacy)).not.toBeNull()
    const frozen = JSON.stringify(legacy)
    profile.trainingIntent = { schemaVersion: 1, memoryId: '11111111-1111-4111-8111-111111111111', memoryVersion: 1, content: intent() }
    const next = build()
    expect(parseStoredRollingWeeklyIntent(next)).not.toBeNull()
    expect(next.adaptive_programming.confirmedOutcomes?.content.outcomes[0].measurement?.metricId).toBe('run.time')
    expect(JSON.stringify(legacy)).toBe(frozen)
    const corrupt = structuredClone(next); corrupt.training_intent!.memoryVersion = 2
    expect(parseStoredRollingWeeklyIntent(corrupt)).toBeNull()
  })
})
