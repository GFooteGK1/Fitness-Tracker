// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import {
  buildProgrammingProfile,
  validateCompleteCoachPlanningInput
} from '@/app/lib/coach/complete-intake'
import { buildCompleteEightWeekPlan } from '@/app/lib/coach/complete-program'
import type {
  ActiveCoachProgramSummary,
  CoachSessionPrescription
} from '@/app/lib/coach/types'

vi.mock('@/app/components/auth/ProtectedRoute', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

import ProgramPage from '@/app/program/page'
import { ActiveProgramView } from '@/app/program/coach-program-components'

const emptyContext = {
  generatedAt: '2026-07-28T00:00:00.000Z',
  storageAvailable: true,
  doctrineVersion: '0.1.0',
  policyVersion: '0.1.0',
  assessments: [],
  memories: [],
  activeProgram: null
}

function response(body: unknown, ok = true, status = ok ? 200 : 400): Promise<Response> {
  return Promise.resolve({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body)
  } as unknown as Response)
}

function completeProposal(value: unknown) {
  const validation = validateCompleteCoachPlanningInput(value)
  if (!validation.ok) throw new Error(validation.errors.join('; '))
  return buildCompleteEightWeekPlan(buildProgrammingProfile(validation.value, []))
}

describe('ProgramPage adaptive coach workflow', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/api/coach' && !init) return response({ context: emptyContext })

      const body = init?.body ? JSON.parse(String(init.body)) : {}
      if (url === '/api/coach/intake') return response({ saved: true })
      if (url === '/api/coach/proposals') {
        return response({
          proposalId: '11111111-1111-4111-8111-111111111111',
          idempotencyKey: body.idempotencyKey,
          proposal: completeProposal(body.planningInput)
        }, true, 201)
      }
      if (url.endsWith('/accept')) {
        const acceptedDraft = completeProposal({
          format: 'complete_programming_intake_v0_3',
          primaryDomain: 'strength',
          goal: 'Build useful full-body strength',
          experience: 'consistent',
          trainingDays: ['monday', 'wednesday', 'friday'],
          sessionMinutes: 60,
          equipment: 'Barbell and rack',
          resolvedEquipmentIds: ['bodyweight', 'barbell', 'rack'],
          constraints: '',
          constraintKinds: [],
          secondaryGoals: [],
          startDate: '2026-08-03'
        })
        return response({
          context: {
            ...emptyContext,
            activeProgram: {
              id: '22222222-2222-4222-8222-222222222222',
              title: acceptedDraft.title,
              goalSummary: 'Build useful full-body strength',
              startDate: '2026-08-03',
              endDate: '2026-09-27',
              activePlanVersionId: '33333333-3333-4333-8333-333333333333',
              planVersion: 1,
              currentWeek: null,
              currentWeekRole: null,
              referenceVersion: '0.1.0',
              policyVersion: '0.1.0',
              weeks: acceptedDraft.weeks.map(week => ({
                week: week.weekNumber,
                role: week.role,
                intent: week.intent,
                reviewRequired: week.review.status === 'pending_athlete_review'
              })),
              upcomingSessions: [{
                id: 'session-1',
                weekNumber: 1,
                sessionIndex: 1,
                scheduledDate: '2026-08-03',
                status: 'planned',
                prescription: acceptedDraft.weeks[0].sessions[0]
              }]
            }
          }
        })
      }
      return response({ error: 'Unexpected request' }, false, 500)
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('moves from confirmed setup to an eight-week preview and explicit acceptance', async () => {
    await act(async () => {
      render(<ProgramPage />)
    })

    expect(await screen.findByRole('heading', { name: 'Build your 8-week plan' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Known strength baselines' })).toBeInTheDocument()
    expect((screen.getByLabelText('Week one starts') as HTMLInputElement).value)
      .toMatch(/^\d{4}-\d{2}-\d{2}$/)

    fireEvent.change(screen.getByLabelText('Goal'), {
      target: { value: 'Build useful full-body strength' }
    })
    fireEvent.click(screen.getByLabelText('Barbell'))
    fireEvent.click(screen.getByLabelText('Rack'))
    fireEvent.click(screen.getByLabelText('Dumbbells'))
    fireEvent.click(screen.getByLabelText('Bike'))
    fireEvent.change(screen.getByLabelText('Constraints or preferences'), {
      target: { value: 'Keep Saturday free' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save coach setup' }))

    expect(await screen.findByText('Coach setup saved.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create 8-week proposal' }))

    expect(await screen.findByRole('heading', { name: 'Review your proposal' })).toBeInTheDocument()
    expect(screen.getByText('Week 4')).toBeInTheDocument()
    expect(screen.getByText('Week 8')).toBeInTheDocument()
    expect(screen.getByText('Review before deload')).toBeInTheDocument()
    expect(screen.getAllByText(/Weekly coverage/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Specific preparation/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Success:/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Accept this plan' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Active training plan' })).toBeInTheDocument()
    })
    expect(screen.getByText('Strength · 8 weeks')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Eight-week intent' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Upcoming sessions' })).toBeInTheDocument()
    expect(screen.getAllByText(/Specific preparation/).length).toBeGreaterThan(0)

    const initialProposalCall = vi.mocked(fetch).mock.calls.find(([requested]) => (
      (typeof requested === 'string' ? requested : requested.toString()) === '/api/coach/proposals'
    ))
    const initialProposalKey = JSON.parse(String(initialProposalCall?.[1]?.body)).idempotencyKey

    fireEvent.click(screen.getByRole('button', { name: 'Build a replacement proposal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save coach setup' }))
    expect(await screen.findByText('Coach setup saved.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create replacement proposal' }))
    expect(await screen.findByRole('heading', { name: 'Review your replacement proposal' }))
      .toBeInTheDocument()

    const proposalKeys = vi.mocked(fetch).mock.calls
      .filter(([requested]) => (
        (typeof requested === 'string' ? requested : requested.toString()) === '/api/coach/proposals'
      ))
      .map(([, init]) => JSON.parse(String(init?.body)).idempotencyKey)
    expect(proposalKeys).toHaveLength(2)
    expect(proposalKeys[1]).not.toBe(initialProposalKey)
  })

  it('lets an athlete preview a replacement without silently changing the active plan', async () => {
    const activeContext = {
      ...emptyContext,
      activeProgram: {
        id: 'program-active', title: 'Strength · 8 weeks',
        goalSummary: 'Build useful full-body strength', startDate: '2026-08-03',
        endDate: '2026-09-27', activePlanVersionId: 'plan-active', planVersion: 1,
        currentWeek: 1, currentWeekRole: 'establish', referenceVersion: '0.1.0',
        policyVersion: '0.1.0', weeks: [], upcomingSessions: []
      }
    }
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/api/coach' && !init) return response({ context: activeContext })
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      if (url === '/api/coach/intake') return response({ saved: true })
      if (url === '/api/coach/proposals') return response({
        proposalId: 'replacement-proposal', idempotencyKey: body.idempotencyKey,
        proposal: completeProposal(body.planningInput)
      }, true, 201)
      return response({ error: 'Unexpected request' }, false, 500)
    })

    await act(async () => render(<ProgramPage />))
    expect(await screen.findByRole('heading', { name: 'Active training plan' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Build a replacement proposal' }))
    expect(screen.getByRole('heading', { name: 'Build your 8-week plan' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Goal'), {
      target: { value: 'Build useful full-body strength' }
    })
    fireEvent.click(screen.getByLabelText('Barbell'))
    fireEvent.click(screen.getByLabelText('Rack'))
    fireEvent.click(screen.getByLabelText('Dumbbells'))
    fireEvent.click(screen.getByLabelText('Bike'))
    fireEvent.click(screen.getByRole('button', { name: 'Save coach setup' }))
    expect(await screen.findByText('Coach setup saved.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create replacement proposal' }))

    expect(await screen.findByRole('heading', { name: 'Review your replacement proposal' }))
      .toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Active training plan' })).toBeInTheDocument()
  })

  it('keeps accepted legacy session prescriptions fully readable', () => {
    const legacyPrescription: CoachSessionPrescription = {
      domain: 'strength',
      session_role: 'lead strength session',
      session_title: 'Legacy full-body strength',
      intent: 'Practice repeatable full-body strength without grinding repetitions.',
      dose: {
        source: 'validated_policy',
        sessionMinutes: 60,
        structure: 'Preparation, primary work, assistance',
        volume_level: 'moderate',
        blocks: [{
          label: 'Primary',
          minutes: 25,
          exercises: [{
            name: 'Back squat',
            purpose: 'Build knee-dominant strength',
            prescription: '3 sets of 5 controlled repetitions',
            effort: 'Keep 2 repetitions in reserve',
            rest: 'Rest 3 minutes',
            substitutions: ['Goblet squat']
          }]
        }]
      },
      effort: 'Repeatable strength, not a max effort',
      rest: 'Recover fully between work sets',
      success_condition: 'Every repetition looks the same',
      stop_condition: 'Stop if position or speed materially changes',
      scale_options: ['Reduce load'],
      constraint_notes: ['Keep the accepted legacy prescription unchanged.'],
      progression: {
        next_session: 'Repeat before progressing',
        next_week: 'Add only one progression variable'
      },
      evidence: {
        doctrineVersion: '0.1.0',
        policyVersion: '0.2.0'
      }
    }
    const program: ActiveCoachProgramSummary = {
      id: 'legacy-program',
      title: 'Legacy accepted plan',
      goalSummary: 'Build useful strength',
      startDate: '2026-07-27',
      endDate: '2026-09-20',
      activePlanVersionId: 'legacy-plan-version',
      planVersion: 1,
      currentWeek: 1,
      currentWeekRole: 'establish',
      referenceVersion: '0.1.0',
      policyVersion: '0.2.0',
      weeks: [],
      upcomingSessions: [{
        id: 'legacy-session',
        weekNumber: 1,
        sessionIndex: 1,
        scheduledDate: '2026-07-27',
        status: 'planned',
        prescription: legacyPrescription as unknown as Record<string, unknown>
      }]
    }

    render(<ActiveProgramView program={program} />)

    expect(screen.getByRole('heading', { name: 'Legacy full-body strength' })).toBeInTheDocument()
    expect(screen.getByText('3 sets of 5 controlled repetitions')).toBeInTheDocument()
    expect(screen.getByText('Feel:').closest('p'))
      .toHaveTextContent('Repeatable strength, not a max effort')
    expect(screen.getByText('Stop:').closest('p'))
      .toHaveTextContent('Stop if position or speed materially changes')
    expect(screen.getByText('Keep the accepted legacy prescription unchanged.')).toBeInTheDocument()
  })
})
