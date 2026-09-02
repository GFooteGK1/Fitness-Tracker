import { describe, expect, it } from 'vitest'
import {
  ADAPTATION_ACTIONS,
  ADAPTIVE_ASSESSMENT_DEFINITIONS,
  ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
  OBSERVATION_SEMANTIC_ROLES,
  TRAINABLE_QUALITY_IDS,
  areObservationsComparable,
  buildObservationComparabilityKey,
  findAssessmentDefinition,
  normalizeMetricValue,
  validateDerivedTrainingEvidence,
  validatePerformanceObservation,
  validateProgrammingHypothesis,
  validateTrainingGoal,
  type DerivedTrainingEvidence,
  type PerformanceObservation,
  type ProgrammingHypothesis,
  type TrainingGoal
} from '@/app/lib/coach/adaptive-programming-contracts'

function strengthCapacityObservation(
  overrides: Partial<PerformanceObservation> = {}
): PerformanceObservation {
  const base: PerformanceObservation = {
    schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
    id: 'observation:strength:1',
    kind: 'strength_set',
    semanticRole: 'direct_outcome',
    status: 'complete',
    metric: {
      metricId: 'strength.repetitions',
      value: 8,
      unit: 'repetitions'
    },
    observedAt: '2026-08-31T15:00:00.000Z',
    capturedAt: '2026-08-31T15:01:00.000Z',
    assessmentDefinition: {
      id: 'strength.repetition_capacity',
      version: '1.0.0'
    },
    protocol: {
      id: 'strength-repetition-capacity-standard',
      version: '1.0.0'
    },
    source: {
      kind: 'manual',
      system: 'sociusfit',
      recordId: 'workout:1:set:1',
      fingerprint: 'fingerprint-strength-1',
      deviceId: null
    },
    comparison: {
      movementId: 'trap_bar_deadlift',
      variationId: 'high_handle',
      repetitions: null,
      externalLoad: { value: 405, unit: 'lb' },
      distance: null,
      duration: { value: 60, unit: 's' },
      equipmentIds: ['trap_bar'],
      techniqueModifiers: ['continuous_repetitions'],
      environmentModifiers: []
    },
    completion: { missingFields: [] },
    exclusion: null,
    supersededByObservationId: null,
    derivedFromObservationIds: []
  }

  return {
    ...base,
    ...overrides,
    metric: overrides.metric === undefined ? base.metric : overrides.metric,
    assessmentDefinition: overrides.assessmentDefinition ?? base.assessmentDefinition,
    protocol: overrides.protocol ?? base.protocol,
    source: overrides.source ?? base.source,
    comparison: overrides.comparison ?? base.comparison,
    completion: overrides.completion ?? base.completion
  }
}

function observationForDefinition(
  definitionId: string,
  observation: Omit<PerformanceObservation, 'schemaVersion' | 'assessmentDefinition'>
): PerformanceObservation {
  const definition = findAssessmentDefinition(definitionId)
  if (!definition) throw new Error(`Missing assessment definition ${definitionId}`)
  return {
    schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
    ...observation,
    assessmentDefinition: { id: definition.id, version: definition.version }
  }
}

describe('adaptive programming contracts', () => {
  it('keeps evidence roles and adaptation actions explicit and distinct', () => {
    expect(OBSERVATION_SEMANTIC_ROLES).toEqual([
      'target',
      'estimate',
      'proxy',
      'training_signal',
      'direct_outcome'
    ])
    expect(new Set(OBSERVATION_SEMANTIC_ROLES).size).toBe(5)
    expect(ADAPTATION_ACTIONS).toEqual([
      'continue',
      'progress',
      'maintain',
      'redirect',
      'recover',
      'hold_collect_more',
      'pause_review'
    ])
  })

  it('provides generic versioned definitions for strength, jump, sprint, run, readiness, and session outcomes', () => {
    expect(new Set(ADAPTIVE_ASSESSMENT_DEFINITIONS.map(definition => definition.family)))
      .toEqual(new Set(['strength', 'jump', 'sprint', 'run', 'readiness', 'session']))
    expect(ADAPTIVE_ASSESSMENT_DEFINITIONS.every(definition => (
      definition.version === '1.0.0'
      && definition.protocol.version === '1.0.0'
      && definition.qualityIds.every(qualityId => TRAINABLE_QUALITY_IDS.includes(qualityId))
    ))).toBe(true)
    expect(ADAPTIVE_ASSESSMENT_DEFINITIONS.some(definition => (
      definition.id.includes('apex') || definition.name.toLowerCase().includes('apex')
    ))).toBe(false)
  })

  it('validates representative direct, estimate, proxy, and incomplete observations', () => {
    const directStrength = strengthCapacityObservation()
    const estimatedStrength = observationForDefinition('strength.estimated_one_rep_max', {
      ...strengthCapacityObservation(),
      id: 'observation:strength:estimate',
      semanticRole: 'estimate',
      metric: { metricId: 'strength.estimated_1rm', value: 181.4, unit: 'kg' },
      protocol: { id: 'epley-estimated-one-rep-max', version: '1.0.0' },
      comparison: {
        ...strengthCapacityObservation().comparison,
        externalLoad: null,
        duration: null
      },
      derivedFromObservationIds: ['observation:strength:set:source']
    })
    const readiness = observationForDefinition('readiness.self_report', {
      ...strengthCapacityObservation(),
      id: 'observation:readiness:1',
      kind: 'readiness_check',
      semanticRole: 'proxy',
      metric: { metricId: 'readiness.score', value: 4, unit: 'score' },
      protocol: { id: 'daily-readiness-five-point', version: '1.0.0' },
      comparison: {
        movementId: null,
        variationId: null,
        repetitions: null,
        externalLoad: null,
        distance: null,
        duration: null,
        equipmentIds: [],
        techniqueModifiers: [],
        environmentModifiers: []
      }
    })
    const incompleteSprint = observationForDefinition('sprint.time', {
      ...strengthCapacityObservation(),
      id: 'observation:sprint:incomplete',
      kind: 'sprint_attempt',
      semanticRole: 'direct_outcome',
      status: 'incomplete',
      metric: null,
      protocol: { id: 'sprint-time-standard', version: '1.0.0' },
      comparison: {
        movementId: null,
        variationId: null,
        repetitions: null,
        externalLoad: null,
        distance: { value: 10, unit: 'm' },
        duration: null,
        equipmentIds: [],
        techniqueModifiers: ['three_point_start'],
        environmentModifiers: ['indoor_track']
      },
      completion: { missingFields: ['metric'] }
    })

    for (const observation of [directStrength, estimatedStrength, readiness, incompleteSprint]) {
      expect(validatePerformanceObservation(observation)).toEqual({ ok: true, errors: [] })
    }
    expect(buildObservationComparabilityKey(incompleteSprint)).toEqual({
      ok: false,
      errors: ['Only complete active observations are comparable']
    })
  })

  it('keeps excluded observations auditable but outside comparison and evidence', () => {
    const excluded = strengthCapacityObservation({
      status: 'excluded',
      exclusion: {
        reason: 'protocol_deviation',
        note: 'Tempo changed after the first repetition'
      }
    })

    expect(validatePerformanceObservation(excluded)).toEqual({ ok: true, errors: [] })
    expect(buildObservationComparabilityKey(excluded)).toEqual({
      ok: false,
      errors: ['Only complete active observations are comparable']
    })
  })

  it('normalizes equivalent units but rejects incompatible metric units', () => {
    expect(normalizeMetricValue({
      metricId: 'strength.load',
      value: 220.462262,
      unit: 'lb'
    })).toEqual({
      metricId: 'strength.load',
      value: 100,
      unit: 'kg'
    })
    expect(normalizeMetricValue({
      metricId: 'sprint.time',
      value: 5,
      unit: 'kg'
    })).toBeNull()
  })

  it('requires protocol, load, equipment, source, and technique compatibility', () => {
    const baseline = strengthCapacityObservation()
    const same = strengthCapacityObservation({
      id: 'observation:strength:2',
      metric: { metricId: 'strength.repetitions', value: 9, unit: 'repetitions' },
      source: { ...baseline.source, recordId: 'workout:2:set:1', fingerprint: 'fingerprint-strength-2' }
    })
    const changedProtocol = strengthCapacityObservation({
      id: 'observation:strength:3',
      protocol: { ...baseline.protocol, version: '1.1.0' }
    })
    const changedLoad = strengthCapacityObservation({
      id: 'observation:strength:4',
      comparison: { ...baseline.comparison, externalLoad: { value: 400, unit: 'lb' } }
    })
    const changedTechnique = strengthCapacityObservation({
      id: 'observation:strength:5',
      comparison: { ...baseline.comparison, techniqueModifiers: ['paused_each_repetition'] }
    })
    const changedSource = strengthCapacityObservation({
      id: 'observation:strength:6',
      source: { ...baseline.source, system: 'qwik-vbt' }
    })

    expect(areObservationsComparable(baseline, same)).toBe(true)
    for (const incompatible of [changedProtocol, changedLoad, changedTechnique, changedSource]) {
      expect(areObservationsComparable(baseline, incompatible)).toBe(false)
    }
  })

  it('validates goals, programming hypotheses, and multi-observation evidence gates', () => {
    const goal: TrainingGoal = {
      schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
      id: 'goal:ten-meter-sprint',
      kind: 'performance_outcome',
      statement: 'Improve ten-meter acceleration time',
      priority: 'primary',
      status: 'active',
      target: {
        role: 'target',
        comparison: 'at_most',
        metric: { metricId: 'sprint.time', value: 1.8, unit: 's' },
        assessmentDefinition: { id: 'sprint.time', version: '1.0.0' },
        protocol: { id: 'sprint-time-standard', version: '1.0.0' }
      },
      targetDate: '2026-11-30',
      requiredQualityIds: ['acceleration', 'explosive_strength'],
      source: {
        kind: 'athlete_confirmed',
        confirmedAt: '2026-09-01T12:00:00.000Z'
      }
    }
    const hypothesis: ProgrammingHypothesis = {
      schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
      id: 'hypothesis:acceleration:1',
      goalId: goal.id,
      status: 'accepted',
      statement: 'Prioritize acceleration and explosive strength while maintaining aerobic work.',
      qualityEmphases: [
        { qualityId: 'acceleration', state: 'priority_development' },
        { qualityId: 'explosive_strength', state: 'development' },
        { qualityId: 'aerobic_endurance', state: 'maintenance' }
      ],
      evidenceRequirements: [
        {
          semanticRole: 'direct_outcome',
          metricId: 'sprint.time',
          assessmentDefinitionId: 'sprint.time',
          minimumComparableObservations: 2,
          evaluationWindowDays: 28
        },
        {
          semanticRole: 'training_signal',
          metricId: 'session.rpe',
          assessmentDefinitionId: null,
          minimumComparableObservations: 2,
          evaluationWindowDays: 14
        }
      ],
      allowedActions: ['continue', 'progress', 'maintain', 'redirect', 'recover', 'hold_collect_more'],
      reviewWindow: { startsOn: '2026-09-01', endsOn: '2026-09-28' },
      policyVersion: 'adaptive-evidence-0.1.0'
    }
    const evidence: DerivedTrainingEvidence = {
      schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
      id: 'evidence:sprint:1',
      status: 'supported',
      semanticRole: 'direct_outcome',
      metricId: 'sprint.time',
      observationIds: ['observation:sprint:1', 'observation:sprint:2'],
      comparabilityKey: 'comparison-v1|sprint.time',
      evaluationWindow: {
        startsAt: '2026-09-01T00:00:00.000Z',
        endsAt: '2026-09-28T23:59:59.000Z'
      },
      sampleCount: 2,
      minimumRequiredObservations: 2,
      excludedObservationIds: [],
      algorithmVersion: 'adaptive-evidence-0.1.0',
      freshness: 'current',
      confidence: 0.8
    }

    expect(validateTrainingGoal(goal)).toEqual({ ok: true, errors: [] })
    expect(validateProgrammingHypothesis(hypothesis)).toEqual({ ok: true, errors: [] })
    expect(validateDerivedTrainingEvidence(evidence)).toEqual({ ok: true, errors: [] })

    expect(validateDerivedTrainingEvidence({
      ...evidence,
      observationIds: ['observation:sprint:1'],
      sampleCount: 1
    })).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        'Supported evidence needs the required number of observations'
      ])
    })
  })
})
