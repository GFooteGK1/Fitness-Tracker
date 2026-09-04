import { describe, expect, it } from 'vitest'
import {
  COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION,
  assembleCoachEvidenceContext,
  validateCoachEvidenceContextRequest,
  type CoachEvidenceContextSource,
  type CoachEvidenceObservationGroupRow,
  type CoachEvidenceObservationValueRow
} from '@/app/lib/coach/evidence-context'

const asOf = '2026-09-01T18:00:00.000Z'
const sessionOne = '11111111-1111-4111-8111-111111111111'
const sessionTwo = '22222222-2222-4222-8222-222222222222'
const staleSession = '33333333-3333-4333-8333-333333333333'

function source(): CoachEvidenceContextSource {
  const groups = [
    group('strength-1', {
      prescribedSessionId: sessionOne,
      assessmentDefinitionId: 'strength.repetition_capacity',
      protocolId: 'strength-repetition-capacity-standard',
      comparabilityKey: strengthKey('trap_bar'),
      observedAt: '2026-08-10T15:00:00.000Z'
    }),
    group('strength-2', {
      prescribedSessionId: sessionTwo,
      assessmentDefinitionId: 'strength.repetition_capacity',
      protocolId: 'strength-repetition-capacity-standard',
      comparabilityKey: strengthKey('trap_bar'),
      observedAt: '2026-08-17T15:00:00.000Z'
    }),
    group('strength-incompatible', {
      prescribedSessionId: sessionTwo,
      assessmentDefinitionId: 'strength.repetition_capacity',
      protocolId: 'strength-repetition-capacity-standard',
      comparabilityKey: strengthKey('barbell'),
      observedAt: '2026-08-24T15:00:00.000Z'
    }),
    group('session-rpe-active', {
      prescribedSessionId: sessionOne,
      assessmentDefinitionId: 'session.rpe',
      protocolId: 'session-rpe-ten-point',
      comparabilityKey: sessionRpeKey(),
      kind: 'session_outcome',
      observedAt: '2026-08-31T17:00:00.000Z'
    }),
    group('session-rpe-stale-plan', {
      prescribedSessionId: staleSession,
      assessmentDefinitionId: 'session.rpe',
      protocolId: 'session-rpe-ten-point',
      comparabilityKey: sessionRpeKey(),
      kind: 'session_outcome',
      observedAt: '2026-08-31T16:00:00.000Z'
    }),
    group('readiness-current', {
      prescribedSessionId: null,
      assessmentDefinitionId: 'readiness.self_report',
      protocolId: 'daily-readiness-five-point',
      comparabilityKey: readinessKey(),
      kind: 'readiness_check',
      observedAt: '2026-09-01T12:00:00.000Z'
    }),
    group('sprint-current', {
      prescribedSessionId: sessionTwo,
      assessmentDefinitionId: 'sprint.time',
      protocolId: 'sprint-time-standard',
      comparabilityKey: sprintKey(),
      kind: 'sprint_attempt',
      observedAt: '2026-08-20T15:00:00.000Z'
    }),
    group('import-confirmed', {
      prescribedSessionId: null,
      assessmentDefinitionId: 'jump.height',
      protocolId: 'jump-height-standard',
      comparabilityKey: jumpKey(),
      kind: 'jump_attempt',
      sourceKind: 'import',
      sourceImportId: 'import-confirmed',
      observedAt: '2026-08-18T15:00:00.000Z'
    }),
    group('import-superseded', {
      prescribedSessionId: null,
      assessmentDefinitionId: 'jump.height',
      protocolId: 'jump-height-standard',
      comparabilityKey: jumpKey(),
      kind: 'jump_attempt',
      sourceKind: 'import',
      sourceImportId: 'import-superseded',
      observedAt: '2026-08-19T15:00:00.000Z'
    })
  ]

  return {
    programs: [{
      id: 'program-active',
      user_id: 'user-1',
      title: 'Current strength block',
      goal_summary: 'Build useful strength',
      start_date: '2026-08-03',
      end_date: '2026-09-27',
      status: 'active',
      active_plan_version_id: 'plan-current',
      created_at: '2026-08-01T12:00:00.000Z'
    }, {
      id: 'program-archived',
      user_id: 'user-1',
      title: 'Old block',
      goal_summary: 'Old goal',
      start_date: '2026-05-01',
      end_date: '2026-06-30',
      status: 'archived',
      active_plan_version_id: 'plan-old',
      created_at: '2026-04-01T12:00:00.000Z'
    }],
    planVersions: [{
      id: 'plan-current',
      user_id: 'user-1',
      program_id: 'program-active',
      version: 2,
      status: 'accepted',
      reference_version: '0.1.0',
      policy_version: '0.3.0',
      intent: adaptiveIntent()
    }, {
      id: 'plan-old',
      user_id: 'user-1',
      program_id: 'program-archived',
      version: 1,
      status: 'accepted',
      reference_version: '0.1.0',
      policy_version: '0.2.0',
      intent: adaptiveIntent()
    }],
    sessions: [
      session(sessionOne, 'program-active', 'plan-current', 1, 1),
      session(sessionTwo, 'program-active', 'plan-current', 2, 1),
      session(staleSession, 'program-archived', 'plan-old', 1, 1)
    ],
    memories: [{
      id: 'memory-goal', user_id: 'user-1', memory_key: 'primary_goal', kind: 'goal',
      content: { goal: 'Build useful strength' }, provenance: { source: 'athlete' },
      confidence: 1, confirmed_at: '2026-08-01T12:00:00.000Z', version: 2,
      status: 'confirmed', effective_from: null, effective_until: null,
      review_after: null, last_reviewed_at: null
    }, {
      id: 'memory-equipment', user_id: 'user-1', memory_key: 'equipment', kind: 'equipment',
      content: { items: ['trap_bar'] }, provenance: { source: 'athlete' },
      confidence: 1, confirmed_at: '2026-08-01T12:00:00.000Z', version: 1,
      status: 'confirmed', effective_from: null, effective_until: null,
      review_after: null, last_reviewed_at: null
    }, {
      id: 'memory-expired', user_id: 'user-1', memory_key: 'temporary_constraint', kind: 'constraint',
      content: { note: 'No overhead work' }, provenance: {}, confidence: 1,
      confirmed_at: '2026-08-01T12:00:00.000Z', version: 1, status: 'confirmed',
      effective_from: null, effective_until: '2026-08-20T00:00:00.000Z',
      review_after: null, last_reviewed_at: null
    }, {
      id: 'memory-overdue', user_id: 'user-1', memory_key: 'old_limitation', kind: 'limitation',
      content: { note: 'Knee sensitivity' }, provenance: {}, confidence: 0.8,
      confirmed_at: '2026-07-01T12:00:00.000Z', version: 1, status: 'confirmed',
      effective_from: null, effective_until: null,
      review_after: '2026-08-15T00:00:00.000Z', last_reviewed_at: null
    }, {
      id: 'memory-withdrawn', user_id: 'user-1', memory_key: 'withdrawn_preference', kind: 'preference',
      content: { note: 'Morning only' }, provenance: {}, confidence: 1,
      confirmed_at: '2026-07-01T12:00:00.000Z', version: 1, status: 'withdrawn',
      effective_from: null, effective_until: null, review_after: null, last_reviewed_at: null
    }, {
      id: 'memory-future', user_id: 'user-1', memory_key: 'future_schedule', kind: 'schedule',
      content: { days: ['monday'] }, provenance: {}, confidence: 1,
      confirmed_at: '2026-09-02T12:00:00.000Z', version: 1, status: 'confirmed',
      effective_from: null, effective_until: null, review_after: null, last_reviewed_at: null
    }],
    strengthAssessments: [{
      id: 'assessment-strength', user_id: 'user-1', movement: 'Trap Bar Deadlift',
      variation: 'high handle', load: 315, unit: 'lb', reps: 5,
      assessed_on: '2026-08-01', estimated_1rm: 367.5,
      estimate_kind: 'estimated_1rm', athlete_confidence: 0.9,
      calculator_version: 'epley-general-v1'
    }],
    imports: [{
      id: 'import-confirmed', user_id: 'user-1', status: 'confirmed',
      verification_status: 'athlete_confirmed'
    }, {
      id: 'import-superseded', user_id: 'user-1', status: 'superseded',
      verification_status: 'athlete_confirmed'
    }],
    observationGroups: groups,
    observationValues: [
      value('strength-1', 'strength.repetitions', 8, 'repetitions', 'training_signal'),
      value('strength-2', 'strength.repetitions', 9, 'repetitions', 'training_signal'),
      value('strength-incompatible', 'strength.repetitions', 10, 'repetitions', 'training_signal'),
      value('session-rpe-active', 'session.rpe', 7.5, 'score', 'training_signal'),
      value('session-rpe-stale-plan', 'session.rpe', 9, 'score', 'training_signal'),
      value('readiness-current', 'readiness.score', 4, 'score', 'proxy'),
      value('sprint-current', 'sprint.time', 4.8, 's', 'direct_outcome'),
      value('import-confirmed', 'jump.height', 0.48, 'm', 'direct_outcome'),
      value('import-superseded', 'jump.height', 0.5, 'm', 'direct_outcome')
    ]
  }
}

describe('purpose-specific coach evidence context', () => {
  it('validates purpose requirements and bounded windows', () => {
    expect(validateCoachEvidenceContextRequest({
      purpose: 'metric_history', asOf, windowDays: 900
    })).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        'Context window is outside the purpose limit',
        'Metric-history context requires a metric'
      ])
    })
    expect(validateCoachEvidenceContextRequest({
      purpose: 'today_session', asOf
    })).toEqual({
      ok: false,
      errors: ['Today-session context requires a prescribed session']
    })
  })

  it('builds today context from the active session plus current readiness only', () => {
    const context = assembleCoachEvidenceContext('user-1', {
      purpose: 'today_session', asOf, prescribedSessionId: sessionOne
    }, source())

    expect(context.session).toMatchObject({ id: sessionOne, status: 'planned' })
    expect(context.evidenceIds).toEqual(expect.arrayContaining([
      'session-rpe-active', 'readiness-current'
    ]))
    expect(context.evidenceIds).not.toContain('session-rpe-stale-plan')
    expect(context.scope.activePlanVersionId).toBe('plan-current')
  })

  it('keeps weekly review evidence inside the current active plan', () => {
    const context = assembleCoachEvidenceContext('user-1', {
      purpose: 'weekly_review', asOf, windowDays: 35
    }, source())

    expect(context.evidenceIds).toEqual(expect.arrayContaining([
      'strength-1', 'strength-2', 'strength-incompatible', 'session-rpe-active', 'sprint-current'
    ]))
    expect(context.evidenceIds).not.toContain('session-rpe-stale-plan')
    expect(context.evidenceIds).not.toContain('readiness-current')
  })

  it('scopes adaptation evidence to the goal and never mixes comparability keys', () => {
    const context = assembleCoachEvidenceContext('user-1', {
      purpose: 'adaptation_review', asOf, goalId: 'goal-strength'
    }, source())

    expect(context.evidenceIds).toEqual([
      'strength-1', 'strength-2', 'strength-incompatible'
    ])
    expect(context.evidenceSeries).toHaveLength(2)
    expect(context.evidenceSeries.map(series => series.sampleCount).sort()).toEqual([1, 2])
    expect(context.evidenceSeries.every(series => (
      series.algorithmVersion === COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION
      && series.metricId === 'strength.repetitions'
    ))).toBe(true)
    expect(context.evidenceIds).not.toContain('sprint-current')
    expect(context.activePlan?.goalIds).toEqual(['goal-strength', 'goal-speed'])
    expect(context.missing).not.toContain('goal_not_in_active_plan')
  })

  it('normalizes values to canonical units while retaining the original measurement and ordinal', () => {
    const fixture = source()
    fixture.observationGroups.push(group('strength-load-lb', {
      prescribedSessionId: sessionTwo,
      assessmentDefinitionId: 'strength.repetition_max',
      protocolId: 'strength-repetition-max-standard',
      comparabilityKey: 'comparison-v1|metric=strength.load|movement=back_squat|repetitions=1',
      observedAt: '2026-08-26T15:00:00.000Z'
    }))
    const load = value('strength-load-lb', 'strength.load', 220.462262, 'lb', 'direct_outcome')
    load.ordinal = 2
    fixture.observationValues.push(load)

    const context = assembleCoachEvidenceContext('user-1', {
      purpose: 'metric_history', asOf, metricId: 'strength.load'
    }, fixture)

    expect(context.evidenceSeries).toHaveLength(1)
    expect(context.evidenceSeries[0].samples[0]).toMatchObject({
      value: expect.closeTo(100, 4),
      unit: 'kg',
      originalMeasurement: {
        value: 220.462262,
        unit: 'lb'
      },
      ordinal: 2
    })
  })


  it('never mixes incompatible protocol versions into one evidence series', () => {
    const fixture = source()
    const protocolGroup = group('strength-protocol-v2', {
      prescribedSessionId: sessionTwo,
      assessmentDefinitionId: 'strength.repetition_capacity',
      protocolId: 'strength-repetition-capacity-standard',
      comparabilityKey: strengthKey('trap_bar'),
      observedAt: '2026-08-25T15:00:00.000Z'
    })
    protocolGroup.protocol_version = '2.0.0'
    fixture.observationGroups.push(protocolGroup)
    fixture.observationValues.push(value('strength-protocol-v2', 'strength.repetitions', 10, 'repetitions', 'training_signal'))

    const context = assembleCoachEvidenceContext('user-1', {
      purpose: 'adaptation_review', asOf, goalId: 'goal-strength'
    }, fixture)

    const sameKeySeries = context.evidenceSeries
      .filter(series => series.comparabilityKey === strengthKey('trap_bar'))
    expect(sameKeySeries).toHaveLength(2)
    expect(sameKeySeries.map(series => series.protocol.version).sort()).toEqual(['1.0.0', '2.0.0'])
    expect(sameKeySeries.map(series => series.sampleCount).sort()).toEqual([1, 2])
  })
  it('uses exact metric, protocol, comparability, and as-of selectors for history', () => {
    const context = assembleCoachEvidenceContext('user-1', {
      purpose: 'metric_history',
      asOf,
      metricId: 'strength.repetitions',
      protocol: { id: 'strength-repetition-capacity-standard', version: '1.0.0' },
      comparabilityKey: strengthKey('trap_bar')
    }, source())

    expect(context.evidenceIds).toEqual(['strength-1', 'strength-2'])
    expect(context.evidenceSeries).toHaveLength(1)
    expect(context.evidenceSeries[0]).toMatchObject({
      sampleCount: 2,
      protocol: { id: 'strength-repetition-capacity-standard', version: '1.0.0' }
    })
    expect(context.reproduction.observationIds).toEqual(context.evidenceIds)
  })

  it('excludes withdrawn, expired, future, and overdue memories from new planning', () => {
    const context = assembleCoachEvidenceContext('user-1', {
      purpose: 'new_planning', asOf
    }, source())

    expect(context.memories.map(memory => memory.id)).toEqual([
      'memory-goal', 'memory-equipment'
    ])
    expect(context.strengthBaselines).toEqual([
      expect.objectContaining({ id: 'assessment-strength', estimateKind: 'estimated_1rm' })
    ])
    expect(context.memories.every(memory => memory.provenance.source === 'athlete')).toBe(true)
  })

  it('accepts only observations backed by an active confirmed import', () => {
    const context = assembleCoachEvidenceContext('user-1', {
      purpose: 'metric_history', asOf, metricId: 'jump.height'
    }, source())

    expect(context.evidenceIds).toEqual(['import-confirmed'])
    expect(context.evidenceIds).not.toContain('import-superseded')
  })

  it('selects the newest active program deterministically when source state conflicts', () => {
    const fixture = source()
    fixture.programs.push({
      id: 'program-newer', user_id: 'user-1', title: 'Newer active block',
      goal_summary: 'Newer goal', start_date: '2026-08-15', end_date: '2026-10-10',
      status: 'active', active_plan_version_id: 'plan-newer',
      created_at: '2026-08-14T12:00:00.000Z'
    })
    fixture.planVersions.push({
      id: 'plan-newer', user_id: 'user-1', program_id: 'program-newer', version: 1,
      status: 'accepted', reference_version: '0.1.0', policy_version: '0.3.0',
      intent: adaptiveIntent()
    })
    fixture.sessions.push(session(
      '44444444-4444-4444-8444-444444444444', 'program-newer', 'plan-newer', 1, 1
    ))

    const context = assembleCoachEvidenceContext('user-1', {
      purpose: 'weekly_review', asOf, windowDays: 35
    }, fixture)

    expect(context.activePlan?.planVersionId).toBe('plan-newer')
    expect(context.missing).toContain('conflicting_active_programs')
    expect(context.evidenceIds).toEqual([])
  })

  it('marks bounded selections incomplete instead of hiding truncation', () => {
    const fixture = source()
    for (let index = 0; index < 30; index += 1) {
      const id = `bounded-${index.toString().padStart(2, '0')}`
      fixture.observationGroups.push(group(id, {
        prescribedSessionId: null,
        assessmentDefinitionId: 'readiness.self_report',
        protocolId: 'daily-readiness-five-point',
        comparabilityKey: readinessKey(),
        kind: 'readiness_check',
        observedAt: `2026-08-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`
      }))
      fixture.observationValues.push(value(id, 'readiness.score', 3, 'score', 'proxy'))
    }

    const context = assembleCoachEvidenceContext('user-1', {
      purpose: 'general_coaching', asOf
    }, fixture)

    expect(context.sampleCount).toBe(24)
    expect(context.selectionComplete).toBe(false)
    expect(context.limits.selectionTruncated).toBe(true)
    expect(context.missing).toContain('context_selection_truncated')
  })

  it('returns explicit missingness for empty but available storage', () => {
    const context = assembleCoachEvidenceContext('user-1', {
      purpose: 'metric_history', asOf, metricId: 'run.time'
    }, {
      programs: [], planVersions: [], sessions: [], memories: [], strengthAssessments: [],
      imports: [], observationGroups: [], observationValues: []
    })

    expect(context.storageAvailable).toBe(true)
    expect(context.selectionComplete).toBe(true)
    expect(context.evidenceSeries).toEqual([])
    expect(context.missing).toEqual(expect.arrayContaining([
      'authoritative_memories_missing', 'compatible_evidence_missing'
    ]))
  })

  it('fails storage availability closed when any authoritative read fails', () => {
    const fixture = source()
    fixture.errors = ['performance_observations_unavailable']
    const context = assembleCoachEvidenceContext('user-1', {
      purpose: 'general_coaching', asOf
    }, fixture)

    expect(context.storageAvailable).toBe(false)
    expect(context.selectionComplete).toBe(false)
    expect(context.missing).toContain('performance_observations_unavailable')
  })
})

function adaptiveIntent() {
  return {
    adaptive_programming: {
      goals: [
        { goalId: 'goal-strength' },
        { goalId: 'goal-speed' }
      ],
      hypotheses: [
        { id: 'hypothesis-strength', goalId: 'goal-strength' },
        { id: 'hypothesis-speed', goalId: 'goal-speed' }
      ],
      expectedSignals: [{
        hypothesisId: 'hypothesis-strength',
        metricId: 'strength.repetitions',
        assessmentDefinitionId: 'strength.repetition_capacity'
      }, {
        hypothesisId: 'hypothesis-speed',
        metricId: 'sprint.time',
        assessmentDefinitionId: 'sprint.time'
      }],
      scheduledAssessments: [{
        goalId: 'goal-strength', metricId: 'strength.repetitions',
        assessmentDefinition: { id: 'strength.repetition_capacity' }
      }, {
        goalId: 'goal-speed', metricId: 'sprint.time',
        assessmentDefinition: { id: 'sprint.time' }
      }]
    }
  }
}

function session(id: string, programId: string, planVersionId: string, week: number, index: number) {
  return {
    id,
    user_id: 'user-1',
    program_id: programId,
    plan_version_id: planVersionId,
    week_number: week,
    session_index: index,
    scheduled_date: '2026-08-10',
    prescription: { title: 'Session', blocks: [{ role: 'priority' }] },
    status: 'planned',
    completed_workout_id: null
  }
}

function group(
  id: string,
  options: {
    prescribedSessionId: string | null
    assessmentDefinitionId: string
    protocolId: string
    comparabilityKey: string
    observedAt: string
    kind?: string
    sourceKind?: string
    sourceImportId?: string | null
  }
): CoachEvidenceObservationGroupRow {
  return {
    id,
    user_id: 'user-1',
    source_import_id: options.sourceImportId ?? null,
    workout_id: options.prescribedSessionId ? `workout-${id}` : null,
    prescribed_session_id: options.prescribedSessionId,
    observation_kind: options.kind ?? 'strength_set',
    status: 'complete',
    observed_at: options.observedAt,
    captured_at: options.observedAt,
    source_kind: options.sourceKind ?? 'coach_completion',
    source_system: options.sourceKind === 'import' ? 'qwik' : 'sociusfit',
    source_device: 'none',
    source_record_id: `record-${id}`,
    assessment_definition_id: options.assessmentDefinitionId,
    assessment_catalog_version: '0.2.0',
    protocol_version: '1.0.0',
    verification_status: 'athlete_confirmed',
    comparability_key: options.comparabilityKey,
    comparison_modifiers: { equipmentIds: [] },
    metadata: { protocolId: options.protocolId }
  }
}

function value(
  groupId: string,
  metricId: string,
  number: number,
  unit: string,
  semanticRole: string
): CoachEvidenceObservationValueRow {
  return {
    id: `value-${groupId}`,
    group_id: groupId,
    user_id: 'user-1',
    metric_id: metricId,
    semantic_role: semanticRole,
    value_numeric: number,
    unit,
    ordinal: 0,
    status: 'complete',
    provenance: { source: 'fixture' }
  }
}

function strengthKey(equipment: string) {
  return `comparison-v1|metric=strength.repetitions|definition=strength.repetition_capacity%401.0.0|protocol=strength-repetition-capacity-standard%401.0.0|equipment=${equipment}`
}

function sessionRpeKey() {
  return 'comparison-v1|metric=session.rpe|definition=session.rpe%401.0.0|protocol=session-rpe-ten-point%401.0.0|source=sociusfit'
}

function readinessKey() {
  return 'comparison-v1|metric=readiness.score|definition=readiness.self_report%401.0.0|protocol=daily-readiness-five-point%401.0.0|source=manual'
}

function sprintKey() {
  return 'comparison-v1|metric=sprint.time|definition=sprint.time%401.0.0|protocol=sprint-time-standard%401.0.0|distance=10m'
}

function jumpKey() {
  return 'comparison-v1|metric=jump.height|definition=jump.height%401.0.0|protocol=jump-height-standard%401.0.0|source=qwik'
}
