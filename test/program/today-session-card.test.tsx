// @vitest-environment jsdom
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import {
  buildProgrammingProfile,
  validateCompleteCoachPlanningInput
} from '@/app/lib/coach/complete-intake'
import { buildCompleteEightWeekPlan } from '@/app/lib/coach/complete-program'
import { findAssessmentDefinition } from '@/app/lib/coach/adaptive-programming-contracts'
import { TodaySessionCard } from '@/app/program/today-session-card'
import type { ActiveCoachProgramSummary } from '@/app/lib/coach/types'

const sessionId = '11111111-1111-4111-8111-111111111111'

describe('TodaySessionCard', () => {
  it('retries the exact frozen completion payload after an interrupted response', async () => {
    const onSubmit = vi.fn()
      .mockResolvedValueOnce('The save response was interrupted. Your entry is still here.')
      .mockResolvedValueOnce(null)
    const onEdit = vi.fn()

    render(
      <TodaySessionCard
        session={session()}
        prescription={prescription()}
        saving={false}
        onSubmit={onSubmit}
        onEditFailedEntry={onEdit}
        onRefreshPlan={vi.fn()}
      >
        <p>Full accepted work</p>
      </TodaySessionCard>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Readiness 4' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish or skip session' }))
    fireEvent.click(screen.getByLabelText('Confirm completed prescribed work'))
    fireEvent.click(screen.getByRole('button', { name: 'Save session once' }))

    expect(await screen.findByRole('button', { name: 'Retry same entry' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry same entry' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    expect(onSubmit.mock.calls[1]).toEqual(onSubmit.mock.calls[0])
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('discards the pending retry key only when the athlete chooses to edit', async () => {
    const onEdit = vi.fn()
    render(
      <TodaySessionCard
        session={session()}
        prescription={prescription()}
        saving={false}
        onSubmit={vi.fn().mockResolvedValue('The active plan changed; refresh and try again')}
        onEditFailedEntry={onEdit}
        onRefreshPlan={vi.fn()}
      >
        <p>Full accepted work</p>
      </TodaySessionCard>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Finish or skip session' }))
    fireEvent.click(screen.getByLabelText('Confirm completed prescribed work'))
    fireEvent.click(screen.getByRole('button', { name: 'Save session once' }))
    expect(await screen.findByRole('button', { name: 'Refresh active plan' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit entry' }))
    expect(onEdit).toHaveBeenCalledWith(sessionId)
    expect(screen.queryByRole('button', { name: 'Retry same entry' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Session RPE')).toBeEnabled()
  })

  it('shows a measurement card only when the accepted session schedule requires it', () => {
    const definition = findAssessmentDefinition('jump.height')
    if (!definition) throw new Error('Missing jump definition')
    const scheduledSession = session({
      scheduledMeasurements: [{
        id: 'scheduled:jump:week-1',
        weekNumber: 1,
        scheduledOn: '2026-08-31',
        assessmentDefinition: { id: definition.id, version: definition.version },
        protocol: { id: definition.protocol.id, version: definition.protocol.version },
        metricId: definition.primaryMetricId,
        semanticRole: 'direct_outcome'
      }]
    })

    const { unmount } = render(
      <TodaySessionCard
        session={scheduledSession}
        prescription={prescription()}
        saving={false}
        onSubmit={vi.fn()}
        onEditFailedEntry={vi.fn()}
        onRefreshPlan={vi.fn()}
      >
        <p>Full accepted work</p>
      </TodaySessionCard>
    )
    expect(screen.getByRole('heading', { name: 'Measure today' })).toBeInTheDocument()
    expect(screen.getByLabelText('Jump height')).toBeInTheDocument()

    unmount()
    render(
      <TodaySessionCard
        session={session()}
        prescription={prescription()}
        saving={false}
        onSubmit={vi.fn()}
        onEditFailedEntry={vi.fn()}
        onRefreshPlan={vi.fn()}
      >
        <p>Full accepted work</p>
      </TodaySessionCard>
    )
    expect(screen.queryByRole('heading', { name: 'Measure today' })).not.toBeInTheDocument()
  })
})

function session(overrides: Partial<ActiveCoachProgramSummary['upcomingSessions'][number]> = {}) {
  return {
    id: sessionId,
    weekNumber: 1,
    sessionIndex: 1,
    scheduledDate: '2026-08-31',
    prescription: prescription() as unknown as Record<string, unknown>,
    status: 'planned' as const,
    completionContractVersion: null,
    completedWorkoutId: null,
    scheduledMeasurements: [],
    ...overrides
  }
}

function prescription() {
  const validation = validateCompleteCoachPlanningInput({
    format: 'complete_programming_intake_v0_3',
    primaryDomain: 'strength',
    goal: 'Build repeatable strength',
    experience: 'consistent',
    trainingDays: ['monday', 'wednesday', 'friday'],
    sessionMinutes: 60,
    equipment: 'Bodyweight, barbell, rack',
    resolvedEquipmentIds: ['bodyweight', 'barbell', 'rack'],
    constraints: '',
    constraintKinds: [],
    secondaryGoals: [],
    startDate: '2026-08-31'
  })
  if (!validation.ok) throw new Error(validation.errors.join('; '))
  return buildCompleteEightWeekPlan(buildProgrammingProfile(validation.value, []))
    .weeks[0].sessions[0]
}
