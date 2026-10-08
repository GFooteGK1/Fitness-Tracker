import { describe, expect, it } from 'vitest'
import { projectFirstReviewedProfileFacts, currentFirstReviewedIntent, type FirstReviewedFactsSource } from '@/app/lib/coach/first-reviewed-profile-facts'
import { validateProgrammingProfile, validateReviewedProgrammingProfile } from '@/app/lib/coach/programming-schema'
import { applyConfirmedIntentToProfile } from '@/app/lib/coach/planning-intent-server'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { buildReviewedRollingWeeklyPlan, buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { parseReviewedRollingWeek } from '@/app/lib/coach/reviewed-week-plan-contract'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { runningOutcome, intent } from '../fixtures/personalized-coaching/intent'
import type { PlanningOutcome } from '@/app/lib/coach/planning-intent'
import { seedSupervisedWeek } from '@/app/lib/coach/supervised-draft-editor'

const owner = '00000000-0000-4000-8000-000000000001', cutoff = '2026-10-05T12:00:00.000Z'
function fixture() {
  const target = structuredClone(reviewedRollingWeek().input.context.profile)
  target.startDate = '2026-10-05'
  const source: FirstReviewedFactsSource = { userId: owner, asOf: cutoff, contextHash: 'a'.repeat(64), profile: structuredClone(target),
    binding: { userId: owner, scope: { historyDays: 90, historyThrough: '2026-10-05', tzOffset: 0 },
      history: { userId: owner, startsOn: '2026-07-08', endsOn: '2026-10-05', mode: 'current', available: true, complete: true,
        workouts: [], completions: [], revisions: [], missing: [] },
      memories: [], memoryStates: [], assessments: [], observationGroups: [], observationValues: [], intentBaselineWorkouts: [] } }
  return { source, target }
}
function saveIntent(source: FirstReviewedFactsSource, content = intent(), version = 2, id = 'intent-current') {
  source.binding.memories.push({ id, user_id: owner, memory_key: 'training_intent', kind: 'goal', version,
    status: 'confirmed', content, created_at: '2026-09-17T12:00:00.000Z' })
  source.binding.memoryStates.push({ id, state: 'current' })
}
function assessment() {
  return { id: 'assessment-current', user_id: owner, movement: 'barbell_bench_press', variation: 'standard',
    load: '185', unit: 'lb', reps: '3', assessed_on: '2026-09-29', is_true_rep_max: false, rir: '2', rpe: '8',
    athlete_confidence: '0.9', estimated_1rm: '203.5', estimate_kind: 'estimated_1rm', calculator_version: 'confirmed-existing-calculator' }
}
function baseline(source: FirstReviewedFactsSource, outcome: PlanningOutcome) {
  const id = '00000000-0000-4000-8000-000000000099', m = outcome.measurement!, b = outcome.binding
  outcome.baseline = { status: 'referenced', observationId: id }
  const group = { id, user_id: owner, status: 'complete', verification_status: 'athlete_confirmed', verified_by: owner,
    source_kind: 'manual', source_system: 'sociusfit_training_baseline', observed_at: '2026-09-18T12:00:00.000Z',
    assessment_definition_id: m.assessmentDefinition.id, protocol_version: m.protocol.version,
    metadata: { origin: 'athlete_reported', assessmentDefinitionVersion: m.assessmentDefinition.version, protocolId: m.protocol.id },
    comparison_modifiers: { movementId: b.movementId, variationId: b.variation, distance: b.distance, equipmentIds: b.equipmentIds,
      repetitions: null, externalLoad: null, duration: null, techniqueModifiers: [], environmentModifiers: [] } }
  source.binding.observationGroups.push(group)
  source.binding.observationValues.push({ id: 'value-current', user_id: owner, group_id: id, status: 'complete', semantic_role: 'direct_outcome',
    metric_id: m.metricId, unit: m.unit, value_numeric: '95.2', ordinal: 0 })
  return group
}
describe('first reviewed fresh factual projection', () => {
  it('replaces stale factual snapshots, preserves intake provenance and unknown coverage, and uses the actual 90-day scope', () => {
    const { source, target } = fixture(), old = structuredClone(source.profile)
    source.binding.assessments.push(assessment())
    target.assessments = []; target.recentTraining.completedSessionCount = 500
    target.equipment.resolvedIds = ['bodyweight', 'barbell']
    target.explicitConstraints = [{ id: 'no-running', kind: 'no_running', source: 'athlete_confirmed', description: 'Current confirmed restriction' }]
    const result = projectFirstReviewedProfileFacts(source, target)
    expect(result.profile.assessments).toMatchObject([{ id: 'assessment-current', load: 185, rir: 2, rpe: 8 }])
    expect(result.profile.recentTraining).toMatchObject({ completedSessionCount: 0, lookbackDays: 90 })
    expect(result.profile.planningContext).toMatchObject({ loggingCoverage: 'unknown', outsideTraining: { status: 'unknown' } })
    expect(result.profile.prescriptionBasis).toMatchObject({ equipmentIds: ['bodyweight','barbell'], restrictions: ['Current confirmed restriction'], numericPolicyEligible: false })
    expect(result.profile.inputSource).toEqual(old.inputSource)
    expect(source.profile).toEqual(old); expect(target.recentTraining.completedSessionCount).toBe(500)
  })
  it('selects the latest current confirmed intent instead of the legacy accepted one', () => {
    const { source, target } = fixture()
    const fresh = intent(runningOutcome('goal:mile', 1609)); saveIntent(source, fresh)
    target.primaryGoal.domain = 'aerobic'; target.secondaryGoals = []
    source.profile.trainingIntent = { schemaVersion: 1, memoryId: 'old', memoryVersion: 1, content: intent() }
    const result = projectFirstReviewedProfileFacts(source, target)
    expect(result.profile.trainingIntent?.memoryId).toBe('intent-current')
    expect(result.profile.primaryGoal.athleteIntent).toContain('1609')
    expect(source.profile.trainingIntent.memoryId).toBe('old')
  })
  it.each(['unconfirmed','expired','review_due','future'])('rejects latest intent state %s without resurrecting an older confirmed row', state => {
    const { source } = fixture(); saveIntent(source, intent(), 1, 'old'); saveIntent(source)
    source.binding.memoryStates[1].state = state
    expect(() => currentFirstReviewedIntent(source)).toThrow()
  })
  it('rejects duplicate latest versions, foreign ownership and malformed current intent', () => {
    for (const change of ['duplicate','foreign','malformed']) {
      const { source } = fixture(); saveIntent(source)
      if (change === 'duplicate') saveIntent(source, intent(), 2, 'duplicate')
      if (change === 'foreign') source.binding.memories[0].user_id = 'foreign'
      if (change === 'malformed') source.binding.memories[0].content = { schemaVersion: 9 }
      expect(() => currentFirstReviewedIntent(source)).toThrow()
    }
  })
  it('preserves all comparable referenced baseline values and protocols without raw metadata', () => {
    const { source, target } = fixture(), outcome = runningOutcome(); baseline(source, outcome); saveIntent(source, intent(outcome))
    target.primaryGoal.domain = 'aerobic'; target.secondaryGoals = []
    const result = projectFirstReviewedProfileFacts(source, target)
    expect(result.baselines).toMatchObject([{ goalId: 'goal:5k', source: 'manual', measurement: outcome.measurement,
      values: [{ id: 'value-current', value: 95.2, unit: 's' }] }])
    expect(result.baselines[0]).not.toHaveProperty('metadata')
  })
  it.each(['foreign','proxy','protocol','missing_value','amended_execution'])('rejects invalid referenced baseline %s', kind => {
    const { source, target } = fixture(), outcome = runningOutcome(), group = baseline(source, outcome)
    saveIntent(source, intent(outcome)); target.primaryGoal.domain = 'aerobic'; target.secondaryGoals = []
    if (kind === 'foreign') group.user_id = 'foreign'
    if (kind === 'proxy') source.binding.observationValues[0].semantic_role = 'proxy'
    if (kind === 'protocol') group.protocol_version = 'different'
    if (kind === 'missing_value') source.binding.observationValues = []
    if (kind === 'amended_execution') {
      Object.assign(group, { source_kind: 'coach_completion', source_system: 'sociusfit', workout_id: 'outside-history', prescribed_session_id: 'session',
        metadata: { ...group.metadata, completionContractVersion: 2 } })
      source.binding.intentBaselineWorkouts = [{ id: 'outside-history', user_id: owner, capture_revision: 2, execution_revision: 0 }]
    }
    expect(() => projectFirstReviewedProfileFacts(source, target)).toThrow()
  })
  it('preserves ordered multiple baseline attempts and rejects ambiguous duplicate ordinals', () => {
    const { source, target } = fixture(), outcome = runningOutcome(); baseline(source, outcome); saveIntent(source, intent(outcome))
    target.primaryGoal.domain = 'aerobic'; target.secondaryGoals = []
    source.binding.observationValues.unshift({ ...source.binding.observationValues[0], id: 'value-before-by-id', ordinal: 1, value_numeric: 94 })
    const projected = projectFirstReviewedProfileFacts(source, target)
    expect(projected.baselines[0].values).toEqual([{ id: 'value-current', ordinal: 0, value: 95.2, unit: 's' },
      { id: 'value-before-by-id', ordinal: 1, value: 94, unit: 's' }])
    source.binding.observationValues[0].ordinal = 0
    expect(() => projectFirstReviewedProfileFacts(source, target)).toThrow('baseline values')
  })
  it.each(['unit','future','missing','invalid_rpe','foreign'])('fails a malformed assessment %s rather than silently dropping it', kind => {
    const { source, target } = fixture(), row = assessment(); source.binding.assessments.push(row)
    if (kind === 'unit') row.unit = 'unknown'
    if (kind === 'future') row.assessed_on = '2026-10-06'
    if (kind === 'missing') row.estimated_1rm = ''
    if (kind === 'invalid_rpe') row.rpe = '99'
    if (kind === 'foreign') row.user_id = 'foreign'
    expect(() => projectFirstReviewedProfileFacts(source, target)).toThrow(/Assessment/)
  })
  it('pins projection time across unchanged rereads and rejects newly captured evidence behind that cutoff', () => {
    const { source, target } = fixture(), first = projectFirstReviewedProfileFacts(source, target)
    source.asOf = '2026-10-05T12:05:00.000Z'
    expect(projectFirstReviewedProfileFacts(source, target, cutoff).factsHash).toBe(first.factsHash)
    source.binding.history.workouts.push({ id: 'new', user_id: owner, workout_date: '2026-10-05', blocks: [],
      created_at: '2026-10-05T12:01:00.000Z', updated_at: '2026-10-05T12:01:00.000Z' })
    expect(() => projectFirstReviewedProfileFacts(source, target, cutoff)).toThrow(/history/)
  })
  it('rejects execution priority referencing an obsolete goal after fresh intent replaces legacy facts', () => {
    const { source, target } = fixture(); saveIntent(source)
    target.primaryGoal.domain = 'aerobic'; target.secondaryGoals = []
    target.executionPriority = { goalId: 'old-bench-goal', movementId: 'barbell_bench_press' }
    expect(() => projectFirstReviewedProfileFacts(source, target)).toThrow('execution priority')
  })
  it('retains confirmed movement familiarity with actual source identities and no inferred tolerance', () => {
    const { source, target } = fixture()
    source.binding.history.workouts.push({ id: 'performed', user_id: owner, workout_date: '2026-09-29',
      created_at: '2026-09-29T12:00:00.000Z', blocks: [{ movements: [{ name: 'barbell_bench_press' }] }],
      capture_provenance: { schemaVersion: 1, fields: { blocks: { origin: 'athlete_reported', reviewState: 'athlete_confirmed' } } } })
    const result = projectFirstReviewedProfileFacts(source, target)
    expect(result.profile.recentTraining).toMatchObject({ completedSessionCount: 1, lookbackDays: 90, performedMovementIds: ['barbell_bench_press'] })
    expect(result.profile.prescriptionBasis?.sourceIds).toEqual(['performed'])
    expect(result.profile.prescriptionBasis?.numericPolicyEligible).toBe(false)
  })
  it('supports four complete manually reviewed domains while automatic planning retains its limit', () => {
    const { source, target } = fixture()
    const domains = ['strength','power_explosiveness','speed_agility','aerobic'] as const
    const outcomes = domains.map((domain, i): PlanningOutcome => ({ ...runningOutcome(`goal:${domain}`), domain, measurement: null,
      binding: { movementId: null, distance: null, equipmentIds: [], variation: null },
      goal: { ...runningOutcome(`goal:${domain}`).goal, kind: 'process', statement: `Develop ${domain} training quality`,
        priority: i === 0 ? 'primary' : 'secondary', requiredQualityIds: ['training_adherence'] } }))
    const content = intent(...outcomes); content.priorityOrder = outcomes.map(o => o.goal.id)
    content.event = { name: 'Synthetic four-domain event representation', goalIds: content.priorityOrder, date: '2027-04-05' }
    saveIntent(source, content)
    target.primaryGoal.domain = 'strength'
    target.secondaryGoals = domains.slice(1).map(domain => ({ id: `allocation:${domain}`, domain, role: 'secondary', allocation: 'development', athleteIntent: `Develop ${domain}` }))
    const projected = projectFirstReviewedProfileFacts(source, target).profile
    expect(projected.trainingIntent?.content.outcomes).toHaveLength(4)
    expect(validateReviewedProgrammingProfile(projected).ok).toBe(true)
    expect(validateProgrammingProfile(projected).ok).toBe(false)
    expect(() => applyConfirmedIntentToProfile(projected, projected.trainingIntent!)).toThrow()
    const { input, registry } = reviewedRollingWeek()
    input.context.profile = projected; input.windowStart = projected.startDate
    input.direction = buildRollingTrainingDirection(projected, { hypothesis: 'Exact manual four-domain representation; no automatic policy.',
      goalTargetDate: projected.trainingIntent!.content.event!.date })
    registry[0].recipe.profileHash = doseContentHash(projected); registry[0].contentHash = doseContentHash(registry[0].recipe)
    const plan = buildReviewedRollingWeeklyPlan(input, registry)
    expect(plan.kind).toBe('reviewed_candidate')
    if (plan.kind !== 'reviewed_candidate') throw new Error(JSON.stringify(plan))
    expect(parseReviewedRollingWeek(plan.plan)?.profileSnapshot.secondaryGoals).toHaveLength(3)
    expect(seedSupervisedWeek(plan.plan, 'next_week')).toMatchObject({ windowStart: '2026-10-12', sequenceNumber: input.sequenceNumber + 1 })
    expect(() => buildRollingWeeklyPlan({ source: 'initial', windowStart: projected.startDate, profile: projected,
      direction: input.direction })).toThrow('Choose no more than two secondary goals')
  })
})
