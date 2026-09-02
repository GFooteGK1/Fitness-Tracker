import { describe, expect, it } from 'vitest'
import {
  buildProgrammingProfile,
  validateCompleteCoachPlanningInput
} from '@/app/lib/coach/complete-intake'

const input = {
  format: 'complete_programming_intake_v0_3',
  primaryDomain: 'strength',
  goal: 'Build useful full-body strength',
  experience: 'consistent',
  trainingDays: ['monday', 'wednesday', 'friday'],
  sessionMinutes: 60,
  equipment: 'Bodyweight, barbell, rack, and dumbbells',
  resolvedEquipmentIds: ['bodyweight', 'barbell', 'rack', 'dumbbell'],
  constraints: 'Keep Saturday free',
  constraintKinds: [],
  secondaryGoals: [{
    domain: 'aerobic',
    allocation: 'maintenance',
    athleteIntent: 'Keep an aerobic base'
  }],
  startDate: '2026-08-03'
}

describe('complete programming intake', () => {
  it('normalizes explicit equipment, constraints, and goal allocation without inferring from notes', () => {
    const validation = validateCompleteCoachPlanningInput({
      ...input,
      constraintKinds: ['no_running']
    })
    expect(validation.ok).toBe(true)
    if (!validation.ok) return

    const profile = buildProgrammingProfile(validation.value, [])
    expect(profile.equipment).toEqual({
      resolvedIds: ['bodyweight', 'barbell', 'rack', 'dumbbell'],
      unresolvedAthleteDescription: 'Bodyweight, barbell, rack, and dumbbells'
    })
    expect(profile.explicitConstraints).toEqual([expect.objectContaining({
      kind: 'no_running',
      source: 'athlete_confirmed'
    })])
    expect(profile.secondaryGoals).toEqual([expect.objectContaining({
      domain: 'aerobic',
      allocation: 'maintenance'
    })])
    expect(profile.primaryGoal.outcome).toEqual({
      statement: 'Build useful full-body strength',
      kind: 'performance_outcome',
      horizon: { startsOn: '2026-08-03', endsOn: '2026-09-27' },
      target: null
    })
    expect(profile.secondaryGoals[0].outcome).toEqual({
      statement: 'Keep an aerobic base',
      kind: 'performance_outcome',
      horizon: { startsOn: '2026-08-03', endsOn: '2026-09-27' },
      target: null
    })
  })

  it('requires resolved equipment and rejects duplicate or conflicting goals', () => {
    expect(validateCompleteCoachPlanningInput({
      ...input,
      resolvedEquipmentIds: []
    })).toMatchObject({ ok: false, errors: expect.arrayContaining([
      'Choose at least one recognized equipment option'
    ]) })
    expect(validateCompleteCoachPlanningInput({
      ...input,
      secondaryGoals: [{
        domain: 'strength', allocation: 'maintenance', athleteIntent: 'Duplicate'
      }]
    })).toMatchObject({ ok: false, errors: expect.arrayContaining([
      'Primary and secondary goal domains must be different'
    ]) })
  })
})
