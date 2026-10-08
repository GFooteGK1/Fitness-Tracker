/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewedSessionCard } from '@/app/program/reviewed-session-card'
import { WeeklyProgramView, type WeeklyCoachState } from '@/app/program/weekly-program-view'
import type { ActiveCoachProgramSummary } from '@/app/lib/coach/types'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { conditionalRecoverySession } from '../fixtures/reviewed-conditional-recovery'
import { effortWorkSession } from '../fixtures/reviewed-effort-work'

afterEach(cleanup)

describe('reviewed week in actual program view', () => {
  it('shows effort-led reps, optional preparation/work and both honest time estimates', () => {
    render(<ReviewedSessionCard prescription={effortWorkSession()} />)
    expect(screen.getByText(/Estimated 78:40/)).toBeVisible()
    expect(screen.getByText(/Required work estimate: 7:15/)).toBeVisible()
    expect(screen.getByText('Time fit is conditional. Work and recovery estimates are not limits.')).toBeVisible()
    expect(screen.getAllByText('Optional if time remains')).toHaveLength(3)
    expect(screen.getAllByText(/repetitions to about 2 RIR each set/)).toHaveLength(2)
    expect(screen.getAllByText(/no fixed repetition cap/)).toHaveLength(2)
    expect(screen.getByText('Rest 30 seconds between sides')).toBeVisible()
    expect(screen.getByText('Time estimate allows 1000 seconds per set per side; this is not a set duration limit.')).toBeVisible()
    expect(screen.getByText('logging: 120 seconds')).toBeVisible()
    expect(screen.getByText('logging: 120 seconds').closest('li')).not.toHaveTextContent('Optional')
  })

  it('shows conditional fit beside the total and keeps recovery meaning visible', () => {
    render(<ReviewedSessionCard prescription={conditionalRecoverySession()} />)
    const notice = screen.getByText('Time fit is conditional. Rest as needed; recovery estimates are not limits.')
    expect(notice).toBeVisible()
    expect(notice.closest('details')).toBeNull()
    expect(screen.getByText('Preserve recovery; record any unfinished work.')).toBeVisible()
    expect(screen.getByText('Rest as needed after this work. Time estimate includes 180 seconds; this is not a recovery limit.')).toBeVisible()
  })
  it('renders complete reviewed sessions through the existing weekly entry without legacy acceptance or signal actions', () => {
    const { plan, intent } = reviewedRollingWeek()
    const state: WeeklyCoachState = { mode: 'rolling_weekly', program: null, pendingProposal: null, history: [],
      currentWeek: { id: 'accepted-plan', status: 'accepted', window_start: plan.windowStart, window_end: plan.windowEnd,
        sequence_number: 1, intent } }
    const action = vi.fn()
    render(<WeeklyProgramView state={state} activeProgram={{} as ActiveCoachProgramSummary} review={null} proposal={null}
      reviewing={false} creatingProposal={false} accepting={false} savingSessionId={null} onReview={action}
      onCreateProposal={action} onAccept={action} onRequestDirectionChange={action} onRecordSessionResult={action}
      onEditFailedSessionResult={action} onRefreshPlan={action} />)
    expect(screen.getByText('Estimated 67:09 · 75 minutes available')).toBeInTheDocument()
    expect(screen.getByText('4 × 2 reps')).toBeInTheDocument()
    expect(screen.getByText('3 × 6–8 reps')).toBeInTheDocument()
    expect(screen.getByText('2 × 30 seconds per side; 15 seconds to switch sides')).toBeInTheDocument()
    expect(screen.getAllByText('Target RPE no higher than 7')).toHaveLength(2)
    expect(screen.getAllByText('Target RPE 7–8 each set').length).toBeGreaterThan(4)
    expect(screen.getByRole('link', { name: 'Open workout log' })).toHaveAttribute('href', '/log')
    expect(screen.queryByText('No session needs attention today')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Accept|Review this week|Done|Save/i })).not.toBeInTheDocument()
    expect(action).not.toHaveBeenCalled()
    expect(screen.getByText('Synthetic reviewed case; not the athlete current program or formal testing.')).toBeInTheDocument()
    expect(screen.getByText(/Three seconds per rep\/jump/)).toBeInTheDocument()
  })

  it('keeps malformed reviewed content visible as an error instead of a rest day', () => {
    render(<ReviewedSessionCard prescription={{ format: 'reviewed_programming_v0_1', content: null }} />)
    expect(screen.getByRole('status')).toHaveTextContent('could not be read')
  })

  it('renders source guidance as text and never inserts HTML supplied in an instruction', () => {
    const session = reviewedRollingWeek().plan.scheduledSessions[0].prescription
    session.content.instructions.push('<img src=x onerror=alert(1)>')
    const { container } = render(<ReviewedSessionCard prescription={session} />)
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  it('preserves protocol guidance stored separately from activity instructions', () => {
    const session = reviewedRollingWeek().plan.scheduledSessions[4].prescription
    session.protocols[0].instructions.push('Keep the recorded grip width for this series.')
    render(<ReviewedSessionCard prescription={session} />)
    expect(screen.getByText('Keep the recorded grip width for this series.')).toBeInTheDocument()
  })
})
