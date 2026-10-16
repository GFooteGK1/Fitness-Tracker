/** @vitest-environment jsdom */
import React from 'react'
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SupervisedWorkspace } from '@/app/program/supervised-workspace'
import { readSupervisedPending, saveSupervisedPending } from '@/app/lib/coach/supervised-pending'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { seedSupervisedWeek } from '@/app/lib/coach/supervised-draft-editor'
vi.mock('@/app/program/supervised-week-editor', () => ({ SupervisedWeekEditor: () => <p>Complete editable week</p> }))
vi.mock('@/app/program/reviewed-session-card', () => ({ ReviewedWeekView: () => <p>Complete week details</p> }))
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const userId = id(1), programId = id(2), enrollmentId = id(3), basePlanVersionId = id(4)
function fixture(reviewerOnly = false) {
  const program = { programId, title: 'Reviewed program', role: reviewerOnly ? 'reviewer' : 'athlete', athleteId: reviewerOnly ? id(10) : userId,
    acceptedBaseId: reviewerOnly ? null : basePlanVersionId, latestEnrollment: { enrollmentId, version: 1, reviewerId: userId, enabled: true,
      expiresAt: '2999-01-01T00:00:00Z', operations: ['same_week', 'next_week'] } }
  const week = reviewedRollingWeek().plan, seed = seedSupervisedWeek(week, 'next_week')!
  const candidate = { candidateId: id(5), enrollmentId, enrollmentVersion: 1, programId, userId: program.athleteId, reviewerId: userId,
    basePlanVersionId, transition: 'next_week', contentHash: 'a'.repeat(64), sourceHash: 'b'.repeat(64), createdAt: '2026-09-29T12:00:00Z',
    reviewPacket: { schemaVersion: 1, reviewMode: 'manual_complete_week', week, baseWeek: structuredClone(week), rationale: 'Retain high quality work.',
      changes: [{ kind: 'preserved', sessionIds: [week.scheduledSessions[0].prescription.sessionId], summary: 'All current work retained.' }],
      evidence: [], evidenceSource: { sourceHash: 'b'.repeat(64), revision: 1, historyDays: 90, historyThrough: '2026-09-29' }, limitations: ['No real athlete evidence in this test.'] } }
  const state = { decision: 'pending', issued: false, enabled: true, loseSubmission: false, hasCandidate: true, rejectPreview: false, revoked: false, loseClosure: false }
  const posts: Array<{ url: string; body: any }> = []
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (state.revoked && !init?.method) {
      if (url.endsWith('/programs')) return Response.json({ kind: 'programs', writesEnabled: false, page: { schemaVersion: 1, actorId: userId, programs: [], nextAfterProgramId: null } })
      if (url.includes('/decisions/')) return Response.json({ kind: 'decided', receipt: { requestId: id(30), candidateId: candidate.candidateId,
        decisionId: id(6), enrollmentVersion: 1, decidedAt: '2026-09-29T13:00:00Z',
        enrollmentId, reviewerId: userId, decision: 'approve', contentHash: candidate.contentHash, sourceHash: candidate.sourceHash, replayed: true } })
      return Response.json({ kind: 'not_found' }, { status: 404 })
    }
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body as string); posts.push({ url, body })
      if (url.endsWith('/resolve') || url.endsWith('/resolution')) {
        if (state.loseClosure && url.endsWith('/resolve')) throw new Error('Lost closure response')
        return Response.json({ kind: 'resolved', resolution: { schemaVersion: 1, request: body.pending, disposition: 'no_write',
          resolutionId: id(40), resolvedAt: '2026-10-03T13:50:00Z' } })
      }
      if (url.endsWith('/draft')) return Response.json({ kind: 'draft', userId, programId, enrollmentId, basePlanVersionId, seed })
      if (url.endsWith('/preview')) {
        if (state.rejectPreview) return Response.json({ kind: 'review_required', reasons: ['Keep a complete logging allowance.'] }, { status: 409 })
        const draftHash = doseContentHash(body.draft), reviewPacket = structuredClone(candidate.reviewPacket)
        reviewPacket.week.scheduledSessions.forEach(s => { s.prescription.source.review.contentHash = draftHash })
        return Response.json({ kind: 'preview', identity: { candidateId: body.draft.candidateId, enrollmentId, expectedUserId: userId, draftHash }, reviewPacket })
      }
      if (url.endsWith('/candidates')) {
        state.hasCandidate = true; candidate.candidateId = body.draft.candidateId
        candidate.reviewPacket.week.scheduledSessions.forEach(s => { s.prescription.source.review.contentHash = doseContentHash(body.draft) })
        if (state.loseSubmission) throw new Error('Lost response')
        return Response.json({ kind: 'saved', candidate })
      }
      if (url.endsWith('/decisions')) {
        state.decision = body.decision
        return Response.json({ kind: 'decided', receipt: { ...body, expectedUserId: undefined, decisionId: id(6), reviewerId: userId,
          enrollmentVersion: 1, decidedAt: '2026-09-29T13:00:00Z', replayed: false } })
      }
      if (url.endsWith('/issue')) { state.issued = true; return Response.json({ kind: 'issued', request: body, programId, proposalId: id(7), planVersionId: id(8), replayed: false }) }
      throw new Error('Unexpected mutation')
    }
    if (url.endsWith('/programs')) return Response.json({ kind: 'programs', writesEnabled: state.enabled,
      page: { schemaVersion: 1, actorId: userId, programs: [program], nextAfterProgramId: null } })
    if (url.endsWith(`/programs/${programId}`)) return Response.json({ kind: 'workspace', writesEnabled: state.enabled,
      page: { schemaVersion: 1, actorId: userId, program, nextAfterCandidateId: null, candidates: state.hasCandidate ? [{
        candidateId: candidate.candidateId, enrollmentId, enrollmentVersion: 1, reviewerId: userId, transition: 'next_week', createdAt: candidate.createdAt,
        decision: state.decision, proposalId: state.issued ? id(7) : null, proposalStatus: state.issued ? 'proposed' : null, planVersionId: state.issued ? id(8) : null,
      }] : [] } })
    if (url.includes('/candidates/')) return Response.json({ kind: 'candidate', candidate })
    throw new Error('Unexpected read')
  })
  vi.stubGlobal('fetch', fetcher)
  return { state, posts, fetcher, candidate, program, seed }
}
beforeEach(() => { localStorage.clear(); vi.stubGlobal('crypto', webcrypto) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('supervised workspace flow', () => {
  it('preserves a lost closure then releases an obsolete request only after exact closure readback', async () => {
    const h = fixture(); h.state.enabled = false; h.state.loseClosure = true
    const pending = saveSupervisedPending(localStorage, { schemaVersion: 1, userId, programId, operation: 'issue',
      body: { expectedUserId: userId, programId, candidateId: h.candidate.candidateId, requestId: id(30) } })
    render(<SupervisedWorkspace userId={userId} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Recover result or close unsaved request' }))
    await screen.findByText('Lost closure response')
    expect(readSupervisedPending(localStorage,userId,programId)).toEqual(pending)
    fireEvent.click(screen.getByRole('button', { name: 'Verify closure receipt' }))
    await screen.findByText(/confirmed unsaved and permanently closed/)
    expect(readSupervisedPending(localStorage,userId,programId)).toBeNull()
    expect(h.posts.map(p => p.url)).toEqual(['/api/coach/supervised/resolve','/api/coach/supervised/resolution'])
    expect(screen.queryByRole('button',{ name:'Retry original request' })).toBeNull()
  })
  it('recovers a revoked reviewer decision with no discoverable programs and no mutation', async () => {
    const h = fixture(true); h.state.revoked = true
    saveSupervisedPending(localStorage, { schemaVersion: 1, userId, programId, operation: 'decide', body: {
      expectedUserId: userId, candidateId: h.candidate.candidateId, requestId: id(30), decision: 'approve', enrollmentId,
      contentHash: h.candidate.contentHash, sourceHash: h.candidate.sourceHash,
    } })
    render(<SupervisedWorkspace userId={userId} />)
    await screen.findByText('No supervised programs are assigned to this account.')
    fireEvent.click(await screen.findByRole('button', { name: 'Verify saved request' }))
    expect(await screen.findByText('Your review decision is confirmed.')).toBeTruthy()
    expect(readSupervisedPending(localStorage, userId, programId)).toBeNull()
    expect(h.posts).toHaveLength(0)
    expect(h.fetcher.mock.calls.some(([url]) => String(url).includes('/decisions/'))).toBe(true)
  })
  it('keeps a rejected preview editable and never persists or submits it', async () => {
    const h = fixture(); h.state.rejectPreview = true
    render(<SupervisedWorkspace userId={userId} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare next week' }))
    fireEvent.change(await screen.findByLabelText('Why this week fits the goal and recent response'), { target: { value: 'Corrected week.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check and preview full week' }))
    expect(await screen.findByText('Keep a complete logging allowance.')).toBeTruthy()
    expect(readSupervisedPending(localStorage, userId, programId)).toBeNull()
    expect(h.posts.filter(p => p.url.endsWith('/candidates'))).toHaveLength(0)
    expect((screen.getByLabelText('Why this week fits the goal and recent response') as HTMLTextAreaElement).disabled).toBe(false)
    h.state.rejectPreview = false
    fireEvent.click(screen.getByRole('button', { name: 'Check and preview full week' }))
    await screen.findByRole('button', { name: 'Save candidate and review full week' })
    fireEvent.change(screen.getByLabelText('Why this week fits the goal and recent response'), { target: { value: 'Further correction.' } })
    expect(screen.queryByRole('button', { name: 'Save candidate and review full week' })).toBeNull()
  })
  it('requires complete-review confirmation, supports designated self-review, then creates a separate athlete proposal', async () => {
    const h = fixture(); render(<SupervisedWorkspace userId={userId} />)
    fireEvent.click(await screen.findByRole('button', { name: /Next week · Awaiting review/ }))
    const approve = await screen.findByRole('button', { name: 'Approve this exact week' }) as HTMLButtonElement
    expect(approve.disabled).toBe(true)
    expect(screen.getByText(/Do not assume older training was absent/)).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed the complete week/ }))
    fireEvent.click(approve)
    fireEvent.click(await screen.findByRole('button', { name: 'Create athlete proposal' }))
    expect(await screen.findByRole('link', { name: /Review athlete proposal/ })).toBeTruthy()
    expect(h.posts.map(p => p.url.split('/').at(-1))).toEqual(['decisions', 'issue'])
    expect(readSupervisedPending(localStorage, userId, programId)).toBeNull()
  })
  it('preserves a lost candidate submission and verifies it by GET without resending', async () => {
    const h = fixture(); h.state.hasCandidate = false; h.state.loseSubmission = true
    render(<SupervisedWorkspace userId={userId} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare next week' }))
    fireEvent.change(await screen.findByLabelText('Why this week fits the goal and recent response'), { target: { value: 'Keep the reviewed dose.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check and preview full week' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save candidate and review full week' }))
    expect(await screen.findByText('Lost response')).toBeTruthy()
    expect(readSupervisedPending(localStorage, userId, programId)?.operation).toBe('submit')
    fireEvent.click(screen.getByRole('button', { name: 'Verify saved request' }))
    expect(await screen.findByText('Candidate saved. Review the complete week below.')).toBeTruthy()
    expect(h.posts.filter(p => p.url.endsWith('/candidates'))).toHaveLength(1)
    expect(readSupervisedPending(localStorage, userId, programId)).toBeNull()
  })
  it('keeps saved-request verification available when writes are disabled', async () => {
    const h = fixture(); h.state.enabled = false
    const draft = { ...h.seed, candidateId: h.candidate.candidateId, enrollmentId, programId, basePlanVersionId,
      historyDays: 90, tzOffset: 300, rationale: 'Keep the reviewed dose.' }
    h.candidate.reviewPacket.week.scheduledSessions.forEach(s => { s.prescription.source.review.contentHash = doseContentHash(draft) })
    saveSupervisedPending(localStorage, { schemaVersion: 1, userId, programId, operation: 'submit', body: { expectedUserId: userId, draft } })
    render(<SupervisedWorkspace userId={userId} />)
    const verify = await screen.findByRole('button', { name: 'Verify saved request' })
    fireEvent.click(verify)
    expect(await screen.findByText('Candidate saved. Review the complete week below.')).toBeTruthy()
    expect(h.posts).toHaveLength(0)
    expect((screen.getByRole('button', { name: 'Prepare next week' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('does not expose athlete draft or proposal controls to a separate reviewer', async () => {
    fixture(true); render(<SupervisedWorkspace userId={userId} />)
    fireEvent.click(await screen.findByRole('button', { name: /Next week · Awaiting review/ }))
    expect(await screen.findByRole('button', { name: 'Approve this exact week' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Prepare next week' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create athlete proposal' })).toBeNull()
  })
  it('never sends a restored pending request on mount', async () => {
    const h = fixture()
    saveSupervisedPending(localStorage, { schemaVersion: 1, userId, programId, operation: 'issue',
      body: { expectedUserId: userId, programId, candidateId: h.candidate.candidateId, requestId: id(20) } })
    render(<SupervisedWorkspace userId={userId} />)
    await screen.findByRole('button', { name: 'Verify saved request' })
    await waitFor(() => expect(h.posts).toHaveLength(0))
  })

  it('retains a lost submission across a closed tab and restores verification without resending', async () => {
    const h = fixture(); h.state.hasCandidate = false; h.state.loseSubmission = true
    const view = render(<SupervisedWorkspace userId={userId} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare next week' }))
    fireEvent.change(await screen.findByLabelText('Why this week fits the goal and recent response'), { target: { value: 'Keep the reviewed dose.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check and preview full week' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save candidate and review full week' }))
    await screen.findByText('Lost response')
    const original = readSupervisedPending(localStorage, userId, programId)
    view.unmount(); sessionStorage.clear()
    render(<SupervisedWorkspace userId={userId} />)
    await screen.findByRole('button', { name: 'Verify saved request' })
    expect(readSupervisedPending(localStorage, userId, programId)).toEqual(original)
    expect(h.posts.filter(p => p.url.endsWith('/candidates'))).toHaveLength(1)
  })
})
