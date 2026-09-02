import { describe, expect, it } from 'vitest'
import {
  ADAPTIVE_ASSESSMENT_CATALOG_VERSION,
  ADAPTIVE_ASSESSMENT_DEFINITIONS,
  ADAPTIVE_EVIDENCE_POLICY_VERSION,
  OBSERVATION_SOURCE_KINDS,
  OBSERVATION_STATUSES,
  PERFORMANCE_OBSERVATION_KINDS,
  TRAINABLE_QUALITY_DEFINITIONS,
  TRAINABLE_QUALITY_IDS,
  validateAssessmentDefinitions,
  type AssessmentDefinition
} from '@/app/lib/coach/adaptive-programming-contracts'

describe('adaptive programming catalogs', () => {
  it('versions the assessment catalog and evidence policy independently', () => {
    expect(ADAPTIVE_ASSESSMENT_CATALOG_VERSION).toBe('0.2.0')
    expect(ADAPTIVE_EVIDENCE_POLICY_VERSION).toBe('0.1.0')
  })

  it('defines every trainable quality once with plain-language intent', () => {
    expect(TRAINABLE_QUALITY_DEFINITIONS.map(definition => definition.id))
      .toEqual(TRAINABLE_QUALITY_IDS)
    expect(new Set(TRAINABLE_QUALITY_DEFINITIONS.map(definition => definition.id)).size)
      .toBe(TRAINABLE_QUALITY_IDS.length)
    expect(TRAINABLE_QUALITY_DEFINITIONS.every(definition => (
      definition.label.trim().length > 0 && definition.description.trim().length >= 10
    ))).toBe(true)
  })

  it('exports bounded observation kinds, statuses, and source kinds', () => {
    expect(PERFORMANCE_OBSERVATION_KINDS).toContain('strength_set')
    expect(PERFORMANCE_OBSERVATION_KINDS).toContain('readiness_check')
    expect(OBSERVATION_STATUSES).toEqual([
      'complete',
      'incomplete',
      'excluded',
      'superseded'
    ])
    expect(OBSERVATION_SOURCE_KINDS).toContain('import')
    expect(OBSERVATION_SOURCE_KINDS).toContain('whoop')
  })

  it('defines session RPE as a training signal with a versioned protocol', () => {
    expect(ADAPTIVE_ASSESSMENT_DEFINITIONS).toContainEqual(expect.objectContaining({
      id: 'session.rpe', observationKind: 'session_outcome', allowedSemanticRoles: ['training_signal']
    }))
  })

  it('validates the version-controlled assessment definitions as one coherent catalog', () => {
    expect(validateAssessmentDefinitions()).toEqual({ ok: true, errors: [] })
  })

  it('rejects duplicate IDs, incompatible units, and duplicate comparison dimensions', () => {
    const original = ADAPTIVE_ASSESSMENT_DEFINITIONS[0]
    const invalid: AssessmentDefinition = {
      ...original,
      allowedUnits: ['s'],
      protocol: {
        ...original.protocol,
        comparabilityDimensions: [
          ...original.protocol.comparabilityDimensions,
          original.protocol.comparabilityDimensions[0]
        ]
      }
    }

    expect(validateAssessmentDefinitions([
      ...ADAPTIVE_ASSESSMENT_DEFINITIONS,
      invalid
    ])).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        `Duplicate assessment definition: ${original.id}@${original.version}`,
        `Assessment ${original.id} uses a unit outside its metric contract`,
        `Assessment ${original.id} has duplicate comparison dimensions`
      ])
    })
  })
})
