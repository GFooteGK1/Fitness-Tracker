import { describe, expect, it } from 'vitest'
import { buildEightWeekProposal, validateCoachPlanningInput } from '@/app/lib/coach/planner'

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
      policyVersion: '0.1.0'
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
        dose: {
          source: 'validated_policy',
          sessionMinutes: 60
        },
        evidence: {
          doctrineVersion: '0.1.0',
          policyVersion: '0.1.0'
        }
      })
      expect(session.prescription.intent).not.toBe('')
      expect(session.prescription.effort).not.toBe('')
      expect(session.prescription.rest).not.toBe('')
      expect(session.prescription.success_condition).not.toBe('')
      expect(session.prescription.stop_condition).not.toBe('')
      expect(session.prescription.scale_options).toHaveLength(2)
    }
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
