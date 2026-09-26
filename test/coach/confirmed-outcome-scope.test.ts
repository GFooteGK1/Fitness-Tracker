import { describe, expect, it } from 'vitest'
import { assembleCoachEvidenceContext, type CoachEvidenceContextSource, type CoachEvidenceObservationGroupRow } from '@/app/lib/coach/evidence-context'
import { resolveConfirmedOutcomeScope } from '@/app/lib/coach/confirmed-outcome-scope'
import { findAssessmentDefinition } from '@/app/lib/coach/adaptive-programming-contracts'
import { intent, runningOutcome } from '@/test/fixtures/personalized-coaching/intent'
import type { PlanningIntentSnapshot } from '@/app/lib/coach/planning-intent'
import { sampleMatchesOutcome } from '@/app/lib/coach/targeted-review'

const asOf = '2026-09-21T12:00:00.000Z'
const goalId = 'outcome:bench-one-rep'
const definition = findAssessmentDefinition('strength.repetition_max')!

function fixture(): CoachEvidenceContextSource {
  const outcome = runningOutcome(goalId)
  outcome.domain = 'strength'
  outcome.goal.statement = 'Improve bench press one repetition maximum'
  outcome.goal.requiredQualityIds = ['maximal_strength']
  outcome.measurement = { metricId: definition.primaryMetricId, unit: 'kg',
    assessmentDefinition: { id: definition.id, version: definition.version },
    protocol: { id: definition.protocol.id, version: definition.protocol.version } }
  outcome.binding = { movementId: 'barbell_bench_press', variation: 'standard', distance: null, equipmentIds: ['barbell'],
    assessmentContext: { repetitions: 1, externalLoad: null, duration: null, techniqueModifiers: [], environmentModifiers: [] } }
  return {
    programs: [{ id: 'program', user_id: 'owner', status: 'active', active_plan_version_id: 'accepted',
      title: 'Strength', goal_summary: 'Bench strength', start_date: '2026-09-01', end_date: '2027-04-01', created_at: asOf }],
    planVersions: [{ id: 'accepted', user_id: 'owner', program_id: 'program', status: 'accepted', version: 1,
      reference_version: 'test', policy_version: 'test', intent: {
        weekly_plan: { profileSnapshot: { trainingIntent: { schemaVersion: 1, memoryId: 'confirmed-memory', memoryVersion: 1, content: intent(outcome) } } },
        adaptive_programming: { goals: [{ goalId: 'allocation:strength' }],
          hypotheses: [{ id: 'hypothesis', goalId: 'allocation:strength' }],
          expectedSignals: [{ hypothesisId: 'hypothesis', metricId: definition.primaryMetricId, assessmentDefinitionId: definition.id }] }
      } }],
    sessions: [], memories: [], strengthAssessments: [], imports: [],
    observationGroups: [group('exact')],
    observationValues: [{ id: 'value-exact', group_id: 'exact', user_id: 'owner', metric_id: definition.primaryMetricId,
      semantic_role: 'direct_outcome', value_numeric: 100, unit: 'kg', ordinal: 0, status: 'complete', provenance: { source: 'fixture' } }]
  }
}

function group(id: string): CoachEvidenceObservationGroupRow {
  return { id, user_id: 'owner', source_import_id: null, workout_id: null, prescribed_session_id: null,
    observation_kind: 'strength_set', status: 'complete', observed_at: '2026-09-20T12:00:00.000Z', captured_at: '2026-09-20T12:00:00.000Z',
    source_kind: 'manual', source_system: 'manual', source_device: 'none', source_record_id: id,
    assessment_definition_id: definition.id, assessment_catalog_version: 'test', protocol_version: definition.protocol.version,
    verification_status: 'athlete_confirmed', comparability_key: 'exact-bench-manual',
    comparison_modifiers: { movementId: 'barbell_bench_press', variationId: 'standard', distance: null, equipmentIds: ['barbell'],
      repetitions: 1, externalLoad: null, duration: null, techniqueModifiers: [], environmentModifiers: [] },
    metadata: { protocolId: definition.protocol.id, assessmentDefinitionVersion: definition.version } }
}

function assemble(data = fixture(), selector = goalId) {
  return assembleCoachEvidenceContext('owner', { purpose: 'adaptation_review', goalId: selector, asOf, windowDays: 84 }, data)
}

describe('confirmed outcome selectors in the real evidence assembler', () => {
  it('resolves a confirmed outcome distinct from its allocation without changing the accepted snapshot', () => {
    const data = fixture(), original = structuredClone(data)
    const packet = assemble(data)
    expect(packet.evidenceIds).toEqual(['exact'])
    expect(packet.activePlan?.goalIds).toEqual(expect.arrayContaining([goalId, 'allocation:strength']))
    expect(packet.missing).not.toContain('goal_not_in_active_plan')
    expect(packet.evidenceSeries[0].samples[0]).toMatchObject({ value: 100, unit: 'kg' })
    expect(data).toEqual(original)
  })

  it.each([
    ['variation', (g: CoachEvidenceObservationGroupRow) => { (g.comparison_modifiers as Record<string, unknown>).variationId = 'paused' }],
    ['repetitions', (g: CoachEvidenceObservationGroupRow) => { (g.comparison_modifiers as Record<string, unknown>).repetitions = 3 }],
    ['movement', (g: CoachEvidenceObservationGroupRow) => { (g.comparison_modifiers as Record<string, unknown>).movementId = 'barbell_back_squat' }],
    ['equipment', (g: CoachEvidenceObservationGroupRow) => { (g.comparison_modifiers as Record<string, unknown>).equipmentIds = ['dumbbell'] }],
    ['protocol version', (g: CoachEvidenceObservationGroupRow) => { g.protocol_version = '2.0.0' }],
    ['protocol id', (g: CoachEvidenceObservationGroupRow) => { (g.metadata as Record<string, unknown>).protocolId = 'different-protocol' }],
    ['assessment version', (g: CoachEvidenceObservationGroupRow) => { (g.metadata as Record<string, unknown>).assessmentDefinitionVersion = '2.0.0' }],
    ['missing repetitions', (g: CoachEvidenceObservationGroupRow) => { delete (g.comparison_modifiers as Record<string, unknown>).repetitions }],
  ] as const)('excludes incompatible %s', (_name, mutate) => {
    const data = fixture(), incompatible = group('incompatible')
    mutate(incompatible)
    data.observationGroups.push(incompatible)
    data.observationValues.push({ ...data.observationValues[0], id: 'value-incompatible', group_id: 'incompatible' })
    expect(assemble(data).evidenceIds).toEqual(['exact'])
  })

  it.each(['proxy', 'training_signal', 'estimate'])('retains exact %s facts without converting them to direct outcome evidence', semanticRole => {
    const data = fixture()
    data.observationValues[0].semantic_role = semanticRole
    const packet = assemble(data), sample = packet.evidenceSeries[0].samples[0]
    const outcome = resolveConfirmedOutcomeScope(data.planVersions[0].intent, goalId).outcome!
    expect(packet.evidenceIds).toEqual(['exact'])
    expect(sample.semanticRole).toBe(semanticRole)
    expect(sampleMatchesOutcome(sample, outcome)).toBe(false)
  })

  it('does not widen to another metric from the same observation group', () => {
    const data = fixture()
    data.observationValues.push({ ...data.observationValues[0], id: 'value-repetitions', metric_id: 'strength.repetitions',
      value_numeric: 1, unit: 'repetitions' })
    const packet = assemble(data)
    expect(packet.sampleCount).toBe(1)
    expect(packet.evidenceSeries[0].metricId).toBe('strength.load')
  })

  it('requires metric history for VBT that is not the confirmed outcome measurement', () => {
    const data = fixture(), velocity = group('velocity')
    const vbt = findAssessmentDefinition('strength.fixed_load_velocity')!
    velocity.assessment_definition_id = vbt.id
    velocity.protocol_version = vbt.protocol.version
    velocity.metadata = { protocolId: vbt.protocol.id, assessmentDefinitionVersion: vbt.version }
    velocity.comparability_key = 'fixed-load-velocity-sensor-a'
    data.observationGroups.push(velocity)
    data.observationValues.push({ ...data.observationValues[0], id: 'velocity-value', group_id: velocity.id,
      metric_id: vbt.primaryMetricId, value_numeric: 0.7, unit: 'm_per_s', semantic_role: 'training_signal' })
    expect(assemble(data).evidenceIds).toEqual(['exact'])
    const packet = assembleCoachEvidenceContext('owner', { purpose: 'metric_history', metricId: vbt.primaryMetricId, asOf }, data)
    expect(packet.evidenceIds).toEqual(['velocity'])
    expect(packet.evidenceSeries[0].samples[0]).toMatchObject({ value: 0.7, semanticRole: 'training_signal' })
  })

  it.each(['unknown-outcome', 'another-athlete-outcome'])('unknown selector %s does not widen retrieval', selector => {
    const packet = assemble(fixture(), selector)
    expect(packet.evidenceIds).toEqual([])
    expect(packet.missing).toContain('goal_not_in_active_plan')
  })

  it.each(['foreign', 'proposed'])('does not resolve against a %s plan', state => {
    const data = fixture()
    if (state === 'foreign') data.planVersions[0].user_id = 'other'
    else data.planVersions[0].status = 'proposed'
    const packet = assemble(data)
    expect(packet.evidenceIds).toEqual([])
    expect(packet.missing).toContain('goal_not_in_active_plan')
  })

  it('preserves legacy allocation selection and broad retrieval without a selector', () => {
    const data = fixture()
    expect(assemble(data, 'allocation:strength').evidenceIds).toEqual(['exact'])
    expect(assembleCoachEvidenceContext('owner', { purpose: 'new_planning', asOf, windowDays: 84 }, data).evidenceIds).toEqual(['exact'])
  })

  it('withholds legacy strength baselines without a verified outcome binding while preserving broad and allocation reads', () => {
    const data = fixture()
    data.strengthAssessments.push({ id: 'legacy-squat', user_id: 'owner', movement: 'Back Squat', variation: 'standard',
      load: 140, unit: 'kg', reps: 1, estimated_1rm: 140, estimate_kind: 'reported_1rm', athlete_confidence: 1,
      assessed_on: '2026-09-20', calculator_version: 'reported-1rm' })
    for (const [selector, reason] of [[goalId, 'baseline_outcome_binding_unverified'], ['unknown-outcome', 'goal_not_in_active_plan']]) {
      const packet = assemble(data, selector)
      expect(packet.strengthBaselines).toEqual([])
      expect(packet.reproduction.assessmentIds).toEqual([])
      expect(packet.selectionExclusions?.records).toContainEqual({ kind: 'strength_baseline', id: 'legacy-squat', reason })
    }
    const broad = assembleCoachEvidenceContext('owner', { purpose: 'new_planning', asOf, windowDays: 84 }, data)
    expect(broad.strengthBaselines).toHaveLength(1)
    expect(broad.strengthBaselines[0]).toMatchObject({ id: 'legacy-squat', sourceSet: { load: 140, unit: 'kg', reps: 1 } })
    expect(assemble(data, 'allocation:strength').strengthBaselines).toEqual(broad.strengthBaselines)
  })

  it('preserves separate device comparability series without inventing an outcome device binding', () => {
    const data = fixture(), second = group('second-device')
    second.source_device = 'sensor-b'
    second.comparability_key = 'exact-bench-sensor-b'
    data.observationGroups.push(second)
    data.observationValues.push({ ...data.observationValues[0], id: 'value-second', group_id: second.id })
    const packet = assemble(data)
    expect(packet.evidenceIds).toEqual(['exact', 'second-device'])
    expect(packet.evidenceSeries).toHaveLength(2)
    expect(packet.evidenceSeries.map(series => series.sampleCount)).toEqual([1, 1])
  })

  it('retains truncation and retrieval reproduction for a confirmed selector', () => {
    const data = fixture()
    data.sourceTruncated = true
    const packet = assemble(data)
    expect(packet.selectionComplete).toBe(false)
    expect(packet.limits.sourceTruncated).toBe(true)
    expect(packet.reproduction.request.goalId).toBe(goalId)
  })

  it.each(['paused', 'unsupported'])('returns exact historical facts for %s outcomes without granting policy eligibility', state => {
    const data = fixture()
    const stored = data.planVersions[0].intent as { weekly_plan: { profileSnapshot: { trainingIntent: PlanningIntentSnapshot } } }
    const outcome = stored.weekly_plan.profileSnapshot.trainingIntent.content.outcomes[0]
    if (state === 'paused') outcome.goal.status = 'paused'
    else outcome.capability = { status: 'unsupported', reason: 'No numerical adapter is available.' }
    const packet = assemble(data)
    expect(packet.evidenceIds).toEqual(['exact'])
    expect(packet).not.toHaveProperty('proposalRecommendation')
    expect(resolveConfirmedOutcomeScope(stored, goalId).outcome).toEqual(outcome)
  })

  it('returns no measurements for an acknowledged process outcome with no measurement contract', () => {
    const data = fixture()
    const stored = data.planVersions[0].intent as { weekly_plan: { profileSnapshot: { trainingIntent: PlanningIntentSnapshot } } }
    const outcome = stored.weekly_plan.profileSnapshot.trainingIntent.content.outcomes[0]
    outcome.goal.kind = 'process'
    outcome.measurement = null
    const packet = assemble(data)
    expect(packet.evidenceIds).toEqual([])
    expect(packet.missing).toContain('confirmed_outcome_measurement_unavailable')
    expect(packet.missing).not.toContain('goal_not_in_active_plan')
  })

  it('does not recognize malformed confirmation snapshots', () => {
    const data = fixture(), stored = data.planVersions[0].intent as { weekly_plan: { profileSnapshot: { trainingIntent: { memoryVersion: number } } } }
    stored.weekly_plan.profileSnapshot.trainingIntent.memoryVersion = 0
    expect(resolveConfirmedOutcomeScope(stored, goalId)).toEqual({ allGoalIds: [], outcome: null })
    expect(assemble(data).evidenceIds).toEqual([])
  })
})
