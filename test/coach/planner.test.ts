import { describe, expect, it } from 'vitest'
import { buildEightWeekProposal, validateCoachPlanningInput } from '@/app/lib/coach/planner'
import type { CoachStrengthAssessmentSummary } from '@/app/lib/coach/types'

const input = {
  primaryDomain: 'strength' as const,
  goal: 'Build useful full-body strength',
  experience: 'consistent' as const,
  trainingDays: ['monday', 'wednesday', 'friday'] as const,
  sessionMinutes: 60,
  equipment: 'Barbell, rack, dumbbells, and a bike',
  constraints: 'Keep Saturday free',
  startDate: '2026-08-03'
}

describe('deterministic eight-week coach planner', () => {
  it('builds a complete eight-week intent with review-led deloads', () => {
    const proposal = buildEightWeekProposal(input)

    expect(proposal).toMatchObject({
      title: 'Strength · 8 weeks',
      goalSummary: input.goal,
      startDate: '2026-08-03',
      endDate: '2026-09-27',
      referenceVersion: '0.1.0',
      policyVersion: '0.2.0'
    })
    expect(proposal.weeks).toHaveLength(8)
    expect(proposal.weeks[3]).toMatchObject({
      week: 4,
      role: 'deload_review',
      reviewRequired: true
    })
    expect(proposal.weeks[7]).toMatchObject({
      week: 8,
      role: 'deload_assess',
      reviewRequired: true
    })
  })

  it('schedules the athlete-selected days and emits the complete prescription contract', () => {
    const proposal = buildEightWeekProposal(input)

    expect(proposal.sessions).toHaveLength(24)
    expect(proposal.sessions.slice(0, 6).map(session => session.scheduledDate)).toEqual([
      '2026-08-03',
      '2026-08-05',
      '2026-08-07',
      '2026-08-10',
      '2026-08-12',
      '2026-08-14'
    ])

    for (const session of proposal.sessions) {
      expect(session.prescription).toMatchObject({
        domain: 'strength',
        session_role: expect.any(String),
        session_title: expect.any(String),
        dose: {
          source: 'validated_policy',
          sessionMinutes: 60,
          blocks: expect.any(Array)
        },
        progression: expect.objectContaining({
          next_session: expect.any(String),
          next_week: expect.any(String)
        }),
        evidence: {
          doctrineVersion: '0.1.0',
          policyVersion: '0.2.0'
        }
      })
      expect(session.prescription.intent).not.toBe('')
      expect(session.prescription.effort).not.toBe('')
      expect(session.prescription.rest).not.toBe('')
      expect(session.prescription.success_condition).not.toBe('')
      expect(session.prescription.stop_condition).not.toBe('')
      expect(session.prescription.scale_options).toHaveLength(2)
      expect(session.prescription.dose.blocks.length).toBeGreaterThanOrEqual(3)
      expect(session.prescription.dose.blocks.reduce(
        (total, block) => total + block.minutes,
        0
      )).toBeLessThanOrEqual(60)
    }

    expect(new Set(
      proposal.sessions
        .filter(session => session.weekNumber === 1)
        .map(session => session.prescription.session_role)
    ).size).toBe(3)
  })

  it('uses available equipment, honors explicit exclusions, and supplies substitutions', () => {
    const proposal = buildEightWeekProposal({
      ...input,
      equipment: 'Dumbbells, a bench, bands, and a bike',
      constraints: 'No overhead pressing and avoid running'
    })
    const movements = proposal.sessions.flatMap(session => (
      session.prescription.dose.blocks.flatMap(block => block.exercises.map(exercise => exercise.name))
    ))

    expect(movements).not.toContain('Barbell back squat')
    expect(movements.every(movement => !movement.toLowerCase().includes('overhead'))).toBe(true)
    expect(movements.every(movement => !movement.toLowerCase().includes('run'))).toBe(true)
    expect(proposal.sessions[0].prescription.dose.blocks[1].exercises[0].substitutions.length)
      .toBeGreaterThan(0)
    expect(proposal.sessions[0].prescription.constraint_notes).toEqual([
      'No overhead work selected.',
      'No running selected.',
      'Athlete note to review: No overhead pressing and avoid running'
    ])
  })

  it('uses a non-running modality when running is explicitly excluded', () => {
    const proposal = buildEightWeekProposal({
      ...input,
      primaryDomain: 'speed_agility',
      equipment: 'Dumbbells, a bike, and an outdoor track',
      constraints: 'No running'
    })
    const primaryMovements = proposal.sessions
      .filter(session => session.weekNumber === 1)
      .map(session => session.prescription.dose.blocks[1].exercises[0].name)

    expect(primaryMovements).toContain('Bike acceleration')
    expect(primaryMovements).toContain('Bike cadence sprint')
    expect(primaryMovements.every(name => !name.toLowerCase().includes('sprint'))).toBe(false)
    expect(primaryMovements.every(name => !name.toLowerCase().includes('run'))).toBe(true)
  })

  it('does not treat ordinary gym access as access to a track or hill', () => {
    const proposal = buildEightWeekProposal({
      ...input,
      primaryDomain: 'speed_agility',
      equipment: 'Commercial gym access'
    })
    const primaryMovements = proposal.sessions
      .filter(session => session.weekNumber === 1)
      .map(session => session.prescription.dose.blocks[1].exercises[0].name)

    expect(primaryMovements).toEqual([
      'Bike acceleration',
      'Bike cadence sprint',
      'Lateral shuffle to stick'
    ])
  })

  it('starts new or returning athletes with less work than consistent athletes', () => {
    const consistent = buildEightWeekProposal(input)
    const returning = buildEightWeekProposal({ ...input, experience: 'new_or_returning' })

    expect(consistent.sessions[0].prescription.dose.blocks[1].exercises[0].prescription)
      .toBe('3 sets × 5-6 reps.')
    expect(returning.sessions[0].prescription.dose.blocks[1].exercises[0].prescription)
      .toBe('2 sets × 5-6 reps.')
    expect(returning.sessions[0].prescription.effort).toContain('additional good rep')
  })

  it('anchors matching strength work to a labeled saved max without inventing other loads', () => {
    const assessment: CoachStrengthAssessmentSummary = {
      id: 'assessment-1',
      movement: 'Back Squat',
      variation: null,
      load: 225,
      unit: 'lb',
      reps: 5,
      assessedOn: '2026-07-27',
      isTrueRepMax: true,
      rir: 0,
      rpe: null,
      athleteConfidence: 0.9,
      estimatedOneRepMax: 262.5,
      estimateKind: 'estimated_1rm',
      calculatorVersion: 'epley-general-v1'
    }
    const supportAssessment: CoachStrengthAssessmentSummary = {
      ...assessment,
      id: 'assessment-2',
      movement: 'Floor Press'
    }
    const proposal = buildEightWeekProposal(input, {
      assessments: [assessment, supportAssessment]
    })
    const firstSession = proposal.sessions[0].prescription
    const squat = firstSession.dose.blocks[1].exercises[0]
    const support = firstSession.dose.blocks[2].exercises[0]

    expect(squat?.load_guidance).toMatchObject({
      source: 'saved_assessment',
      assessmentId: 'assessment-1',
      basis: 'Estimated 1RM from saved 5RM',
      percentRange: [65, 72],
      loadRange: { min: 170, max: 190, unit: 'lb' }
    })
    expect(support.name).toBe('Dumbbell floor press')
    expect(support.load_guidance).toBeUndefined()
  })

  it.each([
    'strength',
    'hypertrophy',
    'power_explosiveness',
    'speed_agility',
    'aerobic',
    'resilience'
  ] as const)('keeps a bodyweight fallback for every %s session role', primaryDomain => {
    expect(() => buildEightWeekProposal({
      ...input,
      primaryDomain,
      equipment: 'Bodyweight only'
    })).not.toThrow()
  })

  it.each([
    ['hypertrophy', '1-2 reps in reserve'],
    ['power_explosiveness', 'speed drops'],
    ['speed_agility', 'speed drops'],
    ['aerobic', 'conversational'],
    ['resilience', 'smooth control']
  ] as const)('builds domain-specific actionable sessions for %s', (primaryDomain, cue) => {
    const proposal = buildEightWeekProposal({ ...input, primaryDomain })
    const first = proposal.sessions[0].prescription

    expect(first.dose.blocks.flatMap(block => block.exercises)).not.toHaveLength(0)
    expect(JSON.stringify(first).toLowerCase()).toContain(cue)
  })

  it('reduces volume in weeks four and eight while preserving useful practice', () => {
    const proposal = buildEightWeekProposal(input)
    const weekThree = proposal.sessions.find(session => session.weekNumber === 3)?.prescription
    const weekFour = proposal.sessions.find(session => session.weekNumber === 4)?.prescription
    const weekEight = proposal.sessions.find(session => session.weekNumber === 8)?.prescription

    expect(weekThree?.dose.volume_level).toBe('high')
    expect(weekFour?.dose.volume_level).toBe('low')
    expect(weekEight?.dose.volume_level).toBe('low')
    expect(weekFour?.session_title).toContain('Deload')
    expect(weekEight?.session_title).toContain('Assess')
  })

  it('keeps power work fast and stops before failure-level fatigue', () => {
    const proposal = buildEightWeekProposal({
      ...input,
      primaryDomain: 'power_explosiveness'
    })

    expect(proposal.title).toBe('Power and explosiveness · 8 weeks')
    expect(proposal.sessions[0].prescription.effort).toContain('Fast, crisp')
    expect(proposal.sessions[0].prescription.stop_condition).toContain('never chase muscular failure')
  })

  it('rejects invalid horizons, schedules, and unsupported program domains', () => {
    expect(validateCoachPlanningInput({
      ...input,
      trainingDays: ['monday', 'monday']
    })).toMatchObject({ ok: false })

    expect(validateCoachPlanningInput({
      ...input,
      startDate: '2026-08-04'
    })).toMatchObject({ ok: false })

    expect(validateCoachPlanningInput({
      ...input,
      primaryDomain: 'nutrition'
    })).toMatchObject({ ok: false })
  })
})
