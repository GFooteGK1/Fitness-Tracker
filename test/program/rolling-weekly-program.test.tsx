/** @vitest-environment jsdom */
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildProgrammingProfile } from '@/app/lib/coach/complete-intake'
import { profileForDirectionHorizon } from '@/app/lib/coach/rolling-weekly-api'
import {
  buildRollingTrainingDirection,
  type RollingWeeklyPlanningDecision
} from '@/app/lib/coach/rolling-weekly-contracts'
import {
  buildRollingWeeklyPlan,
  type RollingWeeklyPlanDraft
} from '@/app/lib/coach/rolling-weekly-plan'
import type { ActiveCoachProgramSummary } from '@/app/lib/coach/types'
import type { RollingWeeklyReview } from '@/app/lib/coach/weekly-review'

vi.mock('@/app/components/auth/ProtectedRoute', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

import ProgramPage from '@/app/program/page'
import {
  WeeklyProgramView,
  type WeeklyCoachState,
  type WeeklyProposalView
} from '@/app/program/weekly-program-view'

describe('rolling weekly Program experience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates only a first-week proposal and keeps acceptance separate', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      calls.push({ url, init })
      if (url === '/api/coach' && !init) return response({ context: emptyContext })
      if (url === '/api/coach/weekly' && !init) {
        return response({ mode: 'rolling_weekly', program: null, currentWeek: null, history: [] })
      }
      if (url === '/api/coach/intake') return response({ saved: true })
      if (url === '/api/coach/weekly' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        const plan = weeklyPlan(body.planningInput.startDate, body.goalTargetDate)
        return response({
          proposalId: 'proposal-first',
          idempotencyKey: body.idempotencyKey,
          proposal: plan,
          activePlanChanged: false,
          acceptanceRequired: true
        }, true, 201)
      }
      return response({ error: 'Unexpected request' }, false, 500)
    }))

    await act(async () => render(<ProgramPage />))

    expect(await screen.findByRole('heading', { name: 'Set your training direction' })).toBeInTheDocument()
    expect(screen.queryByText('Week 4')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Goal'), {
      target: { value: 'Build useful full-body strength' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create first week' }))

    expect(await screen.findByText('First week proposal')).toBeInTheDocument()
    expect(screen.getByText('Nothing changes until you accept this week.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accept first week' })).toBeInTheDocument()
    expect(screen.getByText('Inspect proposed sessions')).toBeInTheDocument()
    expect(calls.some(call => call.url.includes('/accept'))).toBe(false)
  })

  it('recovers a pending weekly replacement without hiding the active legacy plan', async () => {
    const current = weeklyPlan('2026-08-31', '2026-12-31')
    const legacyProgram = activeProgram(current)
    const pendingState: WeeklyCoachState = {
      mode: 'rolling_weekly',
      program: null,
      currentWeek: null,
      pendingProposal: {
        id: 'proposal-conversion',
        proposed_plan_version_id: 'plan-conversion',
        idempotency_key: 'legacy-conversion-key',
        weekly_review_id: null,
        status: 'proposed'
      },
      history: {
        plans: [{
          id: 'plan-conversion',
          status: 'proposed',
          window_start: current.windowStart,
          window_end: current.windowEnd,
          sequence_number: 1,
          intent: { weekly_plan: current }
        }],
        reviews: []
      }
    }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/api/coach' && !init) {
        return response({ context: { ...emptyContext, activeProgram: legacyProgram } })
      }
      if (url === '/api/coach/weekly' && !init) return response(pendingState)
      if (url === '/api/coach/trust' && !init) {
        return response({ trust: { available: false, memories: [], imports: [], proposals: [] } })
      }
      return response({ error: 'Unexpected request' }, false, 500)
    }))

    await act(async () => render(<ProgramPage />))

    expect(await screen.findByText('Legacy plan preserved')).toBeInTheDocument()
    expect(screen.getByText('Weekly replacement proposal')).toBeInTheDocument()
    expect(screen.getByText('Nothing changes until you accept this week.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accept weekly replacement' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Active training plan' })).toBeInTheDocument()
  })

  it('uses a stored non-shift review to recover proposal generation after refresh', async () => {
    const current = weeklyPlan('2026-08-31', '2026-12-31')
    const state = weeklyState(current)
    const next = current
    const calls: Array<{ url: string; body: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      calls.push({ url, body })
      if (url === '/api/coach' && !init) {
        return response({ context: { ...emptyContext, activeProgram: activeProgram(current) } })
      }
      if (url === '/api/coach/weekly' && !init) return response(state)
      if (url === '/api/coach/trust' && !init) {
        return response({ trust: { available: false, memories: [], imports: [], proposals: [] } })
      }
      if (url === '/api/coach/weekly/reviews/review-1/proposal') {
        return response({
          proposalId: 'proposal-recovered',
          idempotencyKey: body.idempotencyKey,
          proposal: next,
          activePlanChanged: false,
          acceptanceRequired: true
        }, true, 201)
      }
      return response({ error: 'Unexpected request' }, false, 500)
    }))

    await act(async () => render(<ProgramPage />))
    fireEvent.click(await screen.findByRole('button', {
      name: 'Build next week from saved review'
    }))

    expect(await screen.findByText('Next week proposal')).toBeInTheDocument()
    const recoveryCall = calls.find(call => call.url.endsWith('/reviews/review-1/proposal'))
    expect(recoveryCall?.body).toEqual({
      idempotencyKey: expect.stringMatching(/^weekly-proposal:/)
    })
  })

  it('shows one accepted week, the next proposal, and explicit acceptance', () => {
    const current = weeklyPlan('2026-08-31', '2026-12-31')
    const decision: RollingWeeklyPlanningDecision = {
      reviewId: 'review-1',
      action: 'continue',
      presentationClass: 'same_track',
      evidenceStatus: 'sufficient',
      rationale: 'The repeated compatible evidence supports another similar dose.'
    }
    const next = buildRollingWeeklyPlan({
      source: 'weekly_review',
      windowStart: '2026-09-07',
      profile: profileForDirectionHorizon(current.profileSnapshot, '2026-09-07', '2026-12-31'),
      direction: current.directionSnapshot,
      priorWeek: current,
      decision
    }) as RollingWeeklyPlanDraft
    const onAccept = vi.fn().mockResolvedValue(undefined)

    render(
      <WeeklyProgramView
        state={weeklyState(current)}
        activeProgram={activeProgram(current)}
        review={null}
        proposal={{ proposalId: 'proposal-next', idempotencyKey: 'proposal-next-key', proposal: next }}
        reviewing={false}
        creatingProposal={false}
        accepting={false}
        savingSessionId={null}
        onReview={vi.fn().mockResolvedValue(undefined)}
        onCreateProposal={vi.fn().mockResolvedValue(undefined)}
        onAccept={onAccept}
        onRequestDirectionChange={vi.fn()}
        onRecordSessionResult={vi.fn().mockResolvedValue(null)}
        onEditFailedSessionResult={vi.fn()}
        onRefreshPlan={vi.fn().mockResolvedValue(undefined)}
      />
    )

    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(screen.getByText('Continue on the same track')).toBeInTheDocument()
    expect(screen.getByText('Next week proposal')).toBeInTheDocument()
    expect(screen.queryByText('Week 3')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Accept next week' }))
    expect(onAccept).toHaveBeenCalledOnce()
  })

  it('can rebuild a next-week proposal from the saved immutable review', () => {
    const current = weeklyPlan('2026-08-31', '2026-12-31')
    const onCreateProposal = vi.fn().mockResolvedValue(undefined)

    render(
      <WeeklyProgramView
        state={weeklyState(current)}
        activeProgram={activeProgram(current)}
        review={null}
        proposal={null}
        reviewing={false}
        creatingProposal={false}
        accepting={false}
        savingSessionId={null}
        onReview={vi.fn().mockResolvedValue(undefined)}
        onCreateProposal={onCreateProposal}
        onAccept={vi.fn().mockResolvedValue(undefined)}
        onRequestDirectionChange={vi.fn()}
        onRecordSessionResult={vi.fn().mockResolvedValue(null)}
        onEditFailedSessionResult={vi.fn()}
        onRefreshPlan={vi.fn().mockResolvedValue(undefined)}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Build next week from saved review' }))
    expect(onCreateProposal).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Review this week' })).not.toBeInTheDocument()
  })

  it('does not reuse a review from a superseded week', () => {
    const current = weeklyPlan('2026-09-07', '2026-12-31')
    const state = weeklyState(current)
    if (!Array.isArray(state.history)) {
      state.history.reviews = [{
        id: 'review-previous',
        base_plan_version_id: 'plan-previous',
        review_window_start: '2026-08-31',
        action: 'continue',
        presentation_class: 'same_track',
        evidence_status: 'sufficient',
        confidence: 0.8,
        execution_summary: {},
        rationale: {},
        idempotency_key: 'review-previous-key',
        created_at: '2026-09-07T00:00:00.000Z'
      }]
    }

    render(
      <WeeklyProgramView
        state={state}
        activeProgram={activeProgram(current)}
        review={null}
        proposal={null}
        reviewing={false}
        creatingProposal={false}
        accepting={false}
        savingSessionId={null}
        onReview={vi.fn().mockResolvedValue(undefined)}
        onCreateProposal={vi.fn().mockResolvedValue(undefined)}
        onAccept={vi.fn().mockResolvedValue(undefined)}
        onRequestDirectionChange={vi.fn()}
        onRecordSessionResult={vi.fn().mockResolvedValue(null)}
        onEditFailedSessionResult={vi.fn()}
        onRefreshPlan={vi.fn().mockResolvedValue(undefined)}
      />
    )

    expect(screen.getByRole('button', { name: 'Review this week' })).toBeInTheDocument()
    expect(screen.queryByRole('button', {
      name: 'Build next week from saved review'
    })).not.toBeInTheDocument()
  })

  it('asks for direction confirmation before a material emphasis change', () => {
    const current = weeklyPlan('2026-08-31', '2026-12-31')
    const onRequestDirectionChange = vi.fn()
    const review = {
      status: 'ready',
      action: 'shift_emphasis',
      presentationClass: 'material_change',
      executionSummary: {
        completedSessions: 2,
        plannedSessions: 2,
        skippedSessions: 0,
        pastDuePlannedSessions: 0,
        averageSessionRpe: 7
      },
      rationale: ['Repeated compatible evidence supports changing the weekly emphasis.']
    } as unknown as RollingWeeklyReview

    render(
      <WeeklyProgramView
        state={weeklyState(current)}
        activeProgram={activeProgram(current)}
        review={review}
        proposal={null}
        reviewing={false}
        creatingProposal={false}
        accepting={false}
        savingSessionId={null}
        onReview={vi.fn().mockResolvedValue(undefined)}
        onCreateProposal={vi.fn().mockResolvedValue(undefined)}
        onAccept={vi.fn().mockResolvedValue(undefined)}
        onRequestDirectionChange={onRequestDirectionChange}
        onRecordSessionResult={vi.fn().mockResolvedValue(null)}
        onEditFailedSessionResult={vi.fn()}
        onRefreshPlan={vi.fn().mockResolvedValue(undefined)}
      />
    )

    expect(screen.getByText('The evidence supports a new emphasis')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm replacement direction' }))
    expect(onRequestDirectionChange).toHaveBeenCalledOnce()
  })

  it('blocks generation and points to Coach when a safety signal is present', () => {
    const current = weeklyPlan('2026-08-31', '2026-12-31')
    const review = {
      status: 'ready',
      action: 'pause_review',
      presentationClass: 'safety',
      executionSummary: {
        completedSessions: 1,
        plannedSessions: 3,
        skippedSessions: 0,
        pastDuePlannedSessions: 1,
        averageSessionRpe: 8
      },
      rationale: ['A concerning pain signal requires review before another dose.']
    } as unknown as RollingWeeklyReview

    render(
      <WeeklyProgramView
        state={weeklyState(current)}
        activeProgram={activeProgram(current)}
        review={review}
        proposal={null}
        reviewing={false}
        creatingProposal={false}
        accepting={false}
        savingSessionId={null}
        onReview={vi.fn().mockResolvedValue(undefined)}
        onCreateProposal={vi.fn().mockResolvedValue(undefined)}
        onAccept={vi.fn().mockResolvedValue(undefined)}
        onRequestDirectionChange={vi.fn()}
        onRecordSessionResult={vi.fn().mockResolvedValue(null)}
        onEditFailedSessionResult={vi.fn()}
        onRefreshPlan={vi.fn().mockResolvedValue(undefined)}
      />
    )

    expect(screen.getByText('Pause and review the safety signal')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Discuss the safety signal' })).toHaveAttribute('href', '/coach')
    expect(screen.queryByRole('button', { name: 'Accept next week' })).not.toBeInTheDocument()
  })
})

const emptyContext = {
  generatedAt: '2026-09-03T12:00:00.000Z',
  storageAvailable: true,
  doctrineVersion: '0.1.0',
  policyVersion: '0.1.0',
  assessments: [],
  memories: [],
  activeProgram: null
}

function weeklyPlan(startDate: string, targetDate: string): RollingWeeklyPlanDraft {
  const profile = profileForDirectionHorizon(buildProgrammingProfile({
    format: 'complete_programming_intake_v0_3',
    primaryDomain: 'strength',
    goal: 'Build useful full-body strength',
    experience: 'consistent',
    trainingDays: ['monday', 'wednesday', 'friday'],
    sessionMinutes: 60,
    equipment: 'Bodyweight',
    resolvedEquipmentIds: ['bodyweight'],
    constraints: '',
    constraintKinds: [],
    secondaryGoals: [],
    startDate
  }, []), startDate, targetDate)
  const direction = buildRollingTrainingDirection(profile, {
    hypothesis: 'Repeatable weekly strength doses will support the athlete goal.',
    goalTargetDate: targetDate
  })
  return buildRollingWeeklyPlan({ source: 'initial', windowStart: startDate, profile, direction }) as RollingWeeklyPlanDraft
}

function weeklyState(plan: RollingWeeklyPlanDraft): WeeklyCoachState {
  return {
    mode: 'rolling_weekly',
    program: {
      id: 'program-1',
      title: plan.title,
      goal_summary: plan.profileSnapshot.athleteGoalSummary,
      start_date: plan.windowStart,
      end_date: plan.windowEnd,
      goal_target_date: plan.directionSnapshot.goalTargetDate,
      direction: plan.directionSnapshot,
      active_plan_version_id: 'plan-1'
    },
    currentWeek: {
      id: 'plan-1',
      status: 'accepted',
      window_start: plan.windowStart,
      window_end: plan.windowEnd,
      sequence_number: 1,
      intent: { weekly_plan: plan }
    },
    pendingProposal: null,
    history: {
      plans: [{
        id: 'plan-1',
        status: 'accepted',
        window_start: plan.windowStart,
        window_end: plan.windowEnd,
        sequence_number: 1,
        intent: { weekly_plan: plan }
      }],
      reviews: [{
        id: 'review-1',
        base_plan_version_id: 'plan-1',
        review_window_start: plan.windowStart,
        action: 'continue',
        presentation_class: 'same_track',
        evidence_status: 'sufficient',
        confidence: 0.8,
        execution_summary: {},
        rationale: {},
        idempotency_key: 'review-key',
        created_at: '2026-09-06T23:00:00.000Z'
      }]
    }
  }
}

function activeProgram(plan: RollingWeeklyPlanDraft): ActiveCoachProgramSummary {
  return {
    id: 'program-1',
    title: plan.title,
    goalSummary: plan.profileSnapshot.athleteGoalSummary,
    startDate: plan.windowStart,
    endDate: plan.windowEnd,
    activePlanVersionId: 'plan-1',
    planVersion: 1,
    currentWeek: 1,
    currentWeekRole: null,
    referenceVersion: plan.evidenceReferenceVersion,
    policyVersion: plan.policyVersion,
    weeks: [],
    upcomingSessions: plan.scheduledSessions.map((session, index) => ({
      id: `session-${index + 1}`,
      weekNumber: 1,
      sessionIndex: index + 1,
      scheduledDate: session.scheduledDate,
      prescription: session.prescription as unknown as Record<string, unknown>,
      status: index === 0 ? 'skipped' : 'planned',
      completionContractVersion: index === 0 ? 2 : null,
      completedWorkoutId: null
    })),
    sessionCheckins: [],
    currentWeekReview: null
  }
}

function response(body: unknown, ok = true, status = ok ? 200 : 400): Promise<Response> {
  return Promise.resolve({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body)
  } as unknown as Response)
}
