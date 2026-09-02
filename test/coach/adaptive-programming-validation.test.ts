import { describe, expect, it } from 'vitest'
import {
  ADAPTIVE_EVIDENCE_POLICY_VERSION,
  ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
  areObservationsComparable,
  validateDerivedTrainingEvidence,
  validatePerformanceObservation,
  validateProgrammingHypothesis,
  type DerivedTrainingEvidence,
  type ObservationSourceKind,
  type ObservationStatus,
  type PerformanceObservation,
  type ProgrammingHypothesis
} from '@/app/lib/coach/adaptive-programming-contracts'

function strengthObservation(id: string): PerformanceObservation {
  return {
    schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
    id,
    kind: 'strength_set',
    semanticRole: 'direct_outcome',
    status: 'complete',
    metric: { metricId: 'strength.repetitions', value: 8, unit: 'repetitions' },
    observedAt: '2026-09-01T14:00:00.000Z',
    capturedAt: '2026-09-01T14:01:00.000Z',
    assessmentDefinition: { id: 'strength.repetition_capacity', version: '1.0.0' },
    protocol: { id: 'strength-repetition-capacity-standard', version: '1.0.0' },
    source: {
      kind: 'manual',
      system: 'sociusfit',
      recordId: id,
      fingerprint: `fingerprint:${id}`,
      deviceId: null
    },
    comparison: {
      movementId: 'trap_bar_deadlift',
      variationId: 'high_handle',
      repetitions: null,
      externalLoad: { value: 180, unit: 'kg' },
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
}

describe('adaptive programming runtime validation', () => {
  it('treats source kind, system, and device as positional comparison fields', () => {
    const first = strengthObservation('observation:source:first')
    first.source = {
      ...first.source,
      kind: 'manual',
      system: 'device',
      deviceId: 'whoop'
    }
    const second = strengthObservation('observation:source:second')
    second.source = {
      ...second.source,
      kind: 'device',
      system: 'manual',
      deviceId: 'whoop'
    }

    expect(areObservationsComparable(first, second)).toBe(false)
  })

  it('rejects malformed runtime status and source values even after an unsafe cast', () => {
    const malformed = strengthObservation('observation:malformed')
    malformed.status = 'unknown' as ObservationStatus
    malformed.source.kind = 'unknown' as ObservationSourceKind

    expect(validatePerformanceObservation(malformed)).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        'Observation status is unsupported',
        'Observation source kind is unsupported'
      ])
    })
  })

  it('rejects a complete timed protocol with zero distance', () => {
    const sprint: PerformanceObservation = {
      ...strengthObservation('observation:sprint:zero-distance'),
      kind: 'sprint_attempt',
      metric: { metricId: 'sprint.time', value: 1.9, unit: 's' },
      assessmentDefinition: { id: 'sprint.time', version: '1.0.0' },
      protocol: { id: 'sprint-time-standard', version: '1.0.0' },
      comparison: {
        movementId: null,
        variationId: null,
        repetitions: null,
        externalLoad: null,
        distance: { value: 0, unit: 'm' },
        duration: null,
        equipmentIds: [],
        techniqueModifiers: ['three_point_start'],
        environmentModifiers: ['indoor_track']
      }
    }

    expect(validatePerformanceObservation(sprint)).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        'Complete observation is missing comparison dimension: distance'
      ])
    })
  })

  it('does not treat one observation as contradicted evidence', () => {
    const evidence: DerivedTrainingEvidence = {
      schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
      id: 'evidence:contradicted:one-sample',
      status: 'contradicted',
      semanticRole: 'direct_outcome',
      metricId: 'sprint.time',
      observationIds: ['observation:sprint:1'],
      comparabilityKey: 'comparison-v1|sprint.time',
      evaluationWindow: {
        startsAt: '2026-09-01T00:00:00.000Z',
        endsAt: '2026-09-28T23:59:59.000Z'
      },
      sampleCount: 1,
      minimumRequiredObservations: 2,
      excludedObservationIds: [],
      algorithmVersion: ADAPTIVE_EVIDENCE_POLICY_VERSION,
      freshness: 'current',
      confidence: 0.6
    }

    expect(validateDerivedTrainingEvidence(evidence)).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        'Contradicted evidence needs the required number of observations'
      ])
    })
  })

  it('rejects an evidence role that its assessment definition does not measure', () => {
    const hypothesis: ProgrammingHypothesis = {
      schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
      id: 'hypothesis:invalid-role',
      goalId: 'goal:sprint',
      status: 'accepted',
      statement: 'Test direct sprint time while monitoring session effort.',
      qualityEmphases: [{ qualityId: 'acceleration', state: 'priority_development' }],
      evidenceRequirements: [
        {
          semanticRole: 'direct_outcome',
          metricId: 'sprint.time',
          assessmentDefinitionId: 'sprint.time',
          minimumComparableObservations: 2,
          evaluationWindowDays: 28
        },
        {
          semanticRole: 'proxy',
          metricId: 'sprint.time',
          assessmentDefinitionId: 'sprint.time',
          minimumComparableObservations: 2,
          evaluationWindowDays: 28
        }
      ],
      allowedActions: ['continue', 'hold_collect_more'],
      reviewWindow: { startsOn: '2026-09-01', endsOn: '2026-09-28' },
      policyVersion: ADAPTIVE_EVIDENCE_POLICY_VERSION
    }

    expect(validateProgrammingHypothesis(hypothesis)).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        'Evidence requirement role does not match its assessment'
      ])
    })
  })
})
