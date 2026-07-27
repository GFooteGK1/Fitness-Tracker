// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { buildEightWeekProposal } from '@/app/lib/coach/planner'

vi.mock('@/app/components/auth/ProtectedRoute', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

import ProgramPage from '@/app/program/page'

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
          proposal: buildEightWeekProposal(body.planningInput)
        }, true, 201)
      }
      if (url.endsWith('/accept')) {
        const acceptedDraft = buildEightWeekProposal({
          primaryDomain: 'strength',
          goal: 'Build useful full-body strength',
          experience: 'consistent',
          trainingDays: ['monday', 'wednesday', 'friday'],
          sessionMinutes: 60,
          equipment: 'Barbell and rack',
          constraints: '',
          startDate: '2026-08-03'
        })
        return response({
          context: {
            ...emptyContext,
            activeProgram: {
              id: '22222222-2222-4222-8222-222222222222',
              title: 'Strength · 8 weeks',
              goalSummary: 'Build useful full-body strength',
              startDate: '2026-08-03',
              endDate: '2026-09-27',
              activePlanVersionId: '33333333-3333-4333-8333-333333333333',
              planVersion: 1,
              currentWeek: null,
              currentWeekRole: null,
              referenceVersion: '0.1.0',
              policyVersion: '0.1.0',
              weeks: acceptedDraft.weeks,
              upcomingSessions: [{
                id: 'session-1',
                weekNumber: 1,
                sessionIndex: 1,
                scheduledDate: acceptedDraft.sessions[0].scheduledDate,
                status: 'planned',
                prescription: acceptedDraft.sessions[0].prescription
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
    fireEvent.change(screen.getByLabelText('Available equipment'), {
      target: { value: 'Barbell, rack, dumbbells, and a bike' }
    })
    fireEvent.change(screen.getByLabelText('Constraints or preferences'), {
      target: { value: 'Keep Saturday free' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save coach setup' }))

    expect(await screen.findByText('Coach setup saved.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create 8-week proposal' }))

    expect(await screen.findByRole('heading', { name: 'Review your proposal' })).toBeInTheDocument()
    expect(screen.getByText('Week 4')).toBeInTheDocument()
    expect(screen.getByText('Week 8')).toBeInTheDocument()
    expect(screen.getByText('Review-led deload')).toBeInTheDocument()
    expect(screen.getAllByText('Squat + push').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Barbell back squat').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Accept this plan' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Active training plan' })).toBeInTheDocument()
    })
    expect(screen.getByText('Strength · 8 weeks')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Eight-week intent' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Upcoming sessions' })).toBeInTheDocument()
    expect(screen.getByText('Barbell back squat')).toBeInTheDocument()

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
        proposal: buildEightWeekProposal(body.planningInput)
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
    fireEvent.change(screen.getByLabelText('Available equipment'), {
      target: { value: 'Barbell, rack, dumbbells, and a bike' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save coach setup' }))
    expect(await screen.findByText('Coach setup saved.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create replacement proposal' }))

    expect(await screen.findByRole('heading', { name: 'Review your replacement proposal' }))
      .toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Active training plan' })).toBeInTheDocument()
  })
})
