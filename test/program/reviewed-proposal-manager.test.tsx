/** @vitest-environment jsdom */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ReviewedProposalManager } from '@/app/program/reviewed-proposal-manager'
import { readReviewedProposalPending } from '@/app/lib/coach/reviewed-proposal-pending'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { reviewedC2rWeek } from '../fixtures/reviewed-c2r-week'
import { reconcileReviewedDoseWeek } from '@/app/lib/coach/reviewed-dose-week-reconciliation'
const owner = '11111111-1111-4111-8111-111111111111', program = '22222222-2222-4222-8222-222222222222'
const proposalId = '33333333-3333-4333-8333-333333333333', planId = '44444444-4444-4444-8444-444444444444'
const baseId = '55555555-5555-4555-8555-555555555555'
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals() })
function fixture() {
  const { plan } = reviewedRollingWeek(), sends: Array<{ url: string; body: any }> = []
  const state = { issued: false, accepted: false, loseIssue: false, loseAccept: false, stale: false, request: null as any, standard: false,
    expired: false, closed: false, historical: false, loseResolve: false }
  const proposalStatus = () => state.accepted ? 'accepted' : state.closed ? 'rejected' : state.expired ? 'expired' : 'proposed'
  const standard = buildRollingWeeklyPlan({ source: 'initial', windowStart: plan.windowStart, profile: plan.profileSnapshot, direction: plan.directionSnapshot })
  if (standard.kind !== 'weekly_plan') throw new Error('Invalid standard fixture')
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') {
      if (url.includes('?programId=')) return new Response(JSON.stringify({ kind: 'proposals', index: { userId: owner, programId: program,
        reviews: [{ reviewId: 'trusted', transition: 'same_week', windowStart: plan.windowStart }],
        proposals: state.issued ? [{ proposalId, status: proposalStatus() }] : [] } }))
      return new Response(JSON.stringify({ kind: 'proposal', proposal: { userId: owner, programId: program, proposalId,
        planVersionId: planId, basePlanVersionId: baseId, activePlanVersionId: state.accepted && !state.historical ? planId : baseId,
        requestId: state.request?.requestId ?? 'saved-request', status: proposalStatus(), acceptanceAvailable: !state.accepted && !state.stale && !state.expired && !state.closed,
        plan, baseWeek: state.standard ? { kind: 'standard', plan: { ...standard, title: 'Original standard week' } } : { kind: 'reviewed', plan } } }))
    }
    const body = JSON.parse(init.body as string); sends.push({ url, body })
    if (url.endsWith('/resolve')) {
      const pending = readReviewedProposalPending(sessionStorage, owner, program)!
      expect(pending.body.requestId).toBe(body.requestId)
      expect(pending.operation).toBe(body.operation)
      if (!state.accepted) state.closed = true
      if (state.loseResolve) throw new Error('Resolution response lost')
      return new Response(JSON.stringify({ kind: 'resolved', resolution: { schemaVersion: 1, userId: owner, programId: program,
        requestId: body.requestId, operation: body.operation, identity: body.identity, proposalId, planVersionId: planId,
        ...(state.accepted ? { disposition: 'saved', activePlanVersionId: state.historical ? baseId : planId }
          : { disposition: 'closed', resolutionId: baseId, resolvedAt: '2026-09-28T00:00:00Z' }) } }))
    }
    expect(readReviewedProposalPending(sessionStorage, owner, program)?.body).toEqual(body)
    if (url.endsWith('/accept')) {
      state.accepted = true
      if (state.loseAccept) throw new Error('Acceptance response lost')
      return new Response(JSON.stringify({ kind: 'accepted', proposalId, requestId: body.requestId,
        accepted: { accepted_program_id: program, active_plan_version_id: planId, proposal_status: 'accepted' } }))
    }
    state.issued = true; state.request = body
    if (state.loseIssue) throw new Error('Proposal response lost')
    const { expectedUserId: _owner, ...request } = body; void _owner
    return new Response(JSON.stringify({ kind: 'issued', request, programId: program, proposalId, planVersionId: planId, replayed: true }))
  })
  vi.stubGlobal('fetch', fetcher)
  return { state, sends, fetcher }
}
describe('reviewed proposal UI lifecycle', () => {
  it('shows historical evidence, prescribed base, exact trial and conditional-fit limits', async () => {
    const week = reviewedC2rWeek()
    const result = reconcileReviewedDoseWeek({ owner, contextHash: 'a'.repeat(64), basePlanVersionId: baseId,
      base: week.base, target: week.target, registration: week.reconciliation })
    if (result.kind !== 'reconciled') throw new Error(result.reasons.join('; '))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('?programId=')
      ? { kind: 'proposals', index: { userId: owner, programId: program, reviews: [], proposals: [{ proposalId, status: 'proposed' }] } }
      : { kind: 'proposal', proposal: { userId: owner, programId: program, proposalId, planVersionId: planId,
        basePlanVersionId: baseId, activePlanVersionId: baseId, requestId: 'saved-request', status: 'proposed', acceptanceAvailable: true,
        plan: week.target, baseWeek: { kind: 'reviewed', plan: week.base }, doseDecision: result.receipt.summary } }))))
    render(<ReviewedProposalManager userId={owner} programId={program} />)
    expect(await screen.findByRole('heading', { name: 'Why this load trial' })).toBeVisible()
    expect(screen.getByText(/prior prescribed RPE unknown/)).toBeVisible()
    expect(screen.getByText('Set 1: 165 lb × 6, actual RPE 7.')).toBeVisible()
    expect(screen.getByText('Time fit is conditional. Preparation recovery estimates are not limits.')).toBeVisible()
    expect(screen.getByText(/not a universal load-increase rule/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Accept this reviewed week' })).toBeEnabled()
  })
  it('closes an expired proposal, preserving the original request across lost response and reload', async () => {
    const f = fixture(); f.state.issued = true; f.state.expired = true; f.state.loseResolve = true
    const mounted = render(<ReviewedProposalManager userId={owner} programId={program} />)
    fireEvent.click(await screen.findByRole('button', { name: /Review saved proposal 1/ }))
    expect(screen.queryByRole('button', { name: 'Accept this reviewed week' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Close unaccepted proposal' }))
    await screen.findByText('Resolution response lost')
    const preserved = readReviewedProposalPending(sessionStorage, owner, program)
    expect(preserved?.operation).toBe('accept')
    expect(screen.getByRole('button', { name: /Prepare replacement week/ })).toBeDisabled()
    mounted.unmount(); f.state.loseResolve = false
    render(<ReviewedProposalManager userId={owner} programId={program} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve original request' }))
    await screen.findByText(/The request is closed/)
    await waitFor(() => expect(screen.getByRole('button', { name: /Prepare replacement week/ })).toBeEnabled())
    expect(f.sends[1]).toEqual(f.sends[0]); expect(f.sends.every(send => send.url.endsWith('/resolve'))).toBe(true)
    expect(readReviewedProposalPending(sessionStorage, owner, program)).toBeNull()
  })
  it('recovers historical acceptance without claiming the earlier week is active', async () => {
    const f = fixture(); f.state.issued = true; f.state.loseAccept = true
    const mounted = render(<ReviewedProposalManager userId={owner} programId={program} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Accept this reviewed week' }))
    await screen.findByText('Acceptance response lost'); mounted.unmount(); f.state.historical = true
    render(<ReviewedProposalManager userId={owner} programId={program} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve original request' }))
    await screen.findByText(/active program has since changed/)
    expect(f.sends).toHaveLength(2); expect(f.sends[1].url).toMatch(/\/resolve$/)
    expect(readReviewedProposalPending(sessionStorage, owner, program)).toBeNull()
  })
  it('requires full reviewed display and explicit acceptance; recovers both lost responses after reload', async () => {
    const f = fixture(); f.state.loseIssue = true
    let mounted = render(<ReviewedProposalManager userId={owner} programId={program} />)
    fireEvent.click(await screen.findByRole('button', { name: /Prepare replacement week/ }))
    await screen.findByText('Proposal response lost')
    expect(f.sends).toHaveLength(1); const original = f.sends[0].body
    mounted.unmount(); f.state.loseIssue = false
    mounted = render(<ReviewedProposalManager userId={owner} programId={program} />)
    expect(await screen.findByRole('button', { name: 'Accept this reviewed week' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Recover original request' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept this reviewed week' })).toBeEnabled())
    expect(f.sends[1].body).toEqual(original)
    expect(screen.getAllByText('4 × 2 reps').length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Open workout log' })).not.toBeInTheDocument()
    f.state.loseAccept = true
    fireEvent.click(screen.getByRole('button', { name: 'Accept this reviewed week' }))
    await screen.findByText('Acceptance response lost'); const acceptBody = f.sends[2].body
    expect(acceptBody.requestId).toBe(original.requestId)
    mounted.unmount(); f.state.loseAccept = false
    render(<ReviewedProposalManager userId={owner} programId={program} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Recover original request' }))
    await screen.findByText('Acceptance confirmed. Your program contains the accepted week.')
    expect(f.sends[3].body).toEqual(acceptBody)
    await screen.findByRole('link', { name: 'Open accepted program' })
    expect(readReviewedProposalPending(sessionStorage, owner, program)).toBeNull()
  })
  it('renders a standard base in full when moving to the reviewed format', async () => {
    const f = fixture(); f.state.issued = true; f.state.standard = true
    render(<ReviewedProposalManager userId={owner} programId={program} />)
    await screen.findByText('Original standard week')
    expect(screen.getByText('Compare the previous accepted week')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accept this reviewed week' })).toBeEnabled()
    expect(f.sends).toEqual([])
  })
  it('shows stale review without permitting a new acceptance', async () => {
    const f = fixture(); f.state.issued = true; f.state.stale = true
    render(<ReviewedProposalManager userId={owner} programId={program} />)
    expect(await screen.findByRole('button', { name: 'Accept this reviewed week' })).toBeDisabled()
    expect(screen.getByText(/needs a fresh review/)).toBeInTheDocument(); expect(f.sends).toEqual([])
  })
  it('preserves corrupt storage and blocks new mutations', async () => {
    fixture(); sessionStorage.setItem(`reviewed-proposal-pending:${owner}:${program}`, '{bad')
    render(<ReviewedProposalManager userId={owner} programId={program} />)
    expect(await screen.findByRole('button', { name: /Prepare replacement week/ })).toBeDisabled()
    expect(sessionStorage.getItem(`reviewed-proposal-pending:${owner}:${program}`)).toBe('{bad')
  })
})
