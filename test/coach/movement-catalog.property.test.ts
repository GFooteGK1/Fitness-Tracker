import { fc, test } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'
import {
  MOVEMENT_CATALOG,
  MOVEMENT_CATALOG_VERSION,
  MOVEMENT_EQUIPMENT_IDS,
  findEligibleMovements,
  findMovementSubstitutions,
  getMovementsByAssessmentAlias,
  isMovementEligible,
  validateMovementCatalog,
  type MovementEligibilityContext
} from '@/app/lib/coach/movement-catalog'
import { COMPLETE_PROGRAMMING_POLICY } from '@/app/lib/coach/programming-policy'
import { COACH_PROGRAM_DOMAIN_IDS, type TrainingExperience } from '@/app/lib/coach/types'

const bodyweightContext: MovementEligibilityContext = {
  availableEquipmentIds: [],
  trainingExperience: 'new_or_returning',
  noOverhead: false,
  noRunning: false
}

describe('versioned movement catalog', () => {
  it('has valid, connected definitions and a bodyweight fallback for every supported domain', () => {
    expect(MOVEMENT_CATALOG_VERSION).toBe('complete-movements-0.1.0')
    expect(MOVEMENT_CATALOG.length).toBeGreaterThanOrEqual(35)
    expect(validateMovementCatalog()).toEqual({ ok: true, errors: [] })

    for (const domain of COACH_PROGRAM_DOMAIN_IDS) {
      expect(findEligibleMovements({
        domain,
        eligibility: bodyweightContext
      }).length).toBeGreaterThan(0)
    }
  })


  it('maps evidence-only bench imports without changing program movement selection', () => {
    const aliasMatches = getMovementsByAssessmentAlias('bench press')
    const bench = aliasMatches.find(movement => movement.id === 'barbell_bench_press')
    const fullGymContext: MovementEligibilityContext = {
      availableEquipmentIds: ['barbell', 'bench', 'rack'],
      trainingExperience: 'experienced',
      noOverhead: false,
      noRunning: false
    }

    expect(bench).toMatchObject({
      id: 'barbell_bench_press',
      programmingStatus: 'evidence_only'
    })
    expect(bench && isMovementEligible(bench, fullGymContext)).toBe(false)
    expect(findEligibleMovements({
      domain: 'strength',
      requiredCoverage: [{ kind: 'movement_pattern', targetId: 'horizontal_push' }],
      eligibility: fullGymContext
    }).map(movement => movement.id)).not.toContain('barbell_bench_press')
  })
  it('returns substitutions only when they preserve the domain and requested coverage target', () => {
    const substitutions = findMovementSubstitutions({
      movementId: 'barbell_back_squat',
      domain: 'strength',
      requiredCoverage: [{ kind: 'movement_pattern', targetId: 'knee_dominant' }],
      eligibility: {
        ...bodyweightContext,
        availableEquipmentIds: ['dumbbell']
      }
    })

    expect(substitutions.map(movement => movement.id)).toEqual(expect.arrayContaining([
      'dumbbell_goblet_squat',
      'tempo_split_squat'
    ]))
    expect(substitutions.map(movement => movement.id)).not.toContain('push_up')
    expect(substitutions.every(movement => movement.coverage.some(tag => (
      tag.kind === 'movement_pattern' && tag.targetId === 'knee_dominant'
    )))).toBe(true)

    expect(findMovementSubstitutions({
      movementId: 'box_jump',
      domain: 'power_explosiveness',
      requiredCoverage: [{ kind: 'performance_quality', targetId: 'hip_extension_power' }],
      eligibility: bodyweightContext
    })).toEqual([])
  })

  it('provides eligible catalog candidates for every deterministic dose-anchor domain and coverage kind', () => {
    for (const anchor of COMPLETE_PROGRAMMING_POLICY.doseAnchors) {
      const candidates = MOVEMENT_CATALOG.filter(movement => (
        movement.domains.includes(anchor.domain)
        && movement.coverage.some(tag => tag.kind === anchor.coverageKind)
      ))
      expect(candidates.length).toBeGreaterThan(0)
    }
  })

  it('uses non-running aerobic modalities but does not relabel drills as sprint substitutes', () => {
    const aerobic = findMovementSubstitutions({
      movementId: 'easy_run',
      domain: 'aerobic',
      requiredCoverage: [{ kind: 'energy_system', targetId: 'aerobic_easy' }],
      eligibility: {
        ...bodyweightContext,
        availableEquipmentIds: ['bike', 'rower'],
        trainingExperience: 'consistent',
        noRunning: true
      }
    })
    const sprint = findMovementSubstitutions({
      movementId: 'flat_acceleration_sprint',
      domain: 'speed_agility',
      requiredCoverage: [{ kind: 'performance_quality', targetId: 'locomotor_acceleration' }],
      eligibility: {
        ...bodyweightContext,
        availableEquipmentIds: ['bike'],
        noRunning: true
      }
    })

    expect(aerobic.map(movement => movement.id)).toEqual(expect.arrayContaining([
      'bike_erg',
      'row_erg',
      'brisk_walk'
    ]))
    expect(aerobic.every(movement => movement.running === false)).toBe(true)
    expect(sprint).toEqual([])
  })

  it('keeps assessment aliases inspectable instead of guessing one movement', () => {
    expect(getMovementsByAssessmentAlias('Back Squat').map(movement => movement.id))
      .toEqual(['barbell_back_squat'])
    expect(getMovementsByAssessmentAlias('RDL').map(movement => movement.id))
      .toEqual(expect.arrayContaining(['barbell_romanian_deadlift', 'dumbbell_romanian_deadlift']))
    expect(getMovementsByAssessmentAlias('unknown lift')).toEqual([])
  })

  it('reports duplicate IDs and disconnected substitution definitions', () => {
    const duplicate = { ...MOVEMENT_CATALOG[0] }
    const disconnected = {
      ...MOVEMENT_CATALOG[1],
      id: 'disconnected_movement',
      substitutionGroup: 'disconnected:only'
    }
    const result = validateMovementCatalog([
      ...MOVEMENT_CATALOG,
      duplicate,
      disconnected
    ])

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      `Duplicate movement ID: ${duplicate.id}`,
      'Movement disconnected_movement has no compatible substitution'
    ]))
  })
})

const propertyConfig = { numRuns: 100 }

test.prop([
  fc.subarray([...MOVEMENT_EQUIPMENT_IDS]),
  fc.constantFrom<TrainingExperience>('new_or_returning', 'consistent', 'experienced'),
  fc.boolean(),
  fc.boolean()
], propertyConfig)('eligibility always honors equipment, experience, overhead, and running constraints', (
  availableEquipmentIds,
  trainingExperience,
  noOverhead,
  noRunning
) => {
  const context: MovementEligibilityContext = {
    availableEquipmentIds,
    trainingExperience,
    noOverhead,
    noRunning
  }
  const available = new Set([...availableEquipmentIds, 'bodyweight'])
  const skillRank = { low: 0, moderate: 1, high: 2 }
  const experienceRank = {
    new_or_returning: 0,
    consistent: 1,
    experienced: 2
  }

  for (const movement of MOVEMENT_CATALOG) {
    if (!isMovementEligible(movement, context)) continue

    expect(movement.equipment.every(equipment => available.has(equipment))).toBe(true)
    expect(skillRank[movement.skillLevel]).toBeLessThanOrEqual(experienceRank[trainingExperience])
    if (noOverhead) expect(movement.overhead).toBe(false)
    if (noRunning) expect(movement.running).toBe(false)
  }
})
