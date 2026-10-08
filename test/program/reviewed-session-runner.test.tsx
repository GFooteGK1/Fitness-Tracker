/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewedActualSetForm, ReviewedCompletionForm, ReviewedSessionRunner } from '@/app/program/reviewed-session-runner'
import type { ReviewedSessionState } from '@/app/lib/coach/reviewed-session-state'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { reviewedSetReport } from '../fixtures/reviewed-set-report'
import { reviewedCompletion } from '../fixtures/reviewed-completion'
import { readReviewedPending, saveReviewedPending } from '@/app/lib/coach/reviewed-session-pending'
import { reviewedSessionActivities } from '@/app/lib/coach/reviewed-session-contract'
const owner = '11111111-1111-4111-8111-111111111111', sessionId = '22222222-2222-4222-8222-222222222222', reportId = '33333333-3333-4333-8333-333333333333'
function state(): ReviewedSessionState {
  const slot = reviewedRollingWeek().plan.scheduledSessions[0]
  return { userId: owner, sessionId, programId: owner, executionPlanVersionId: owner, activePlanVersionId: owner,
    scheduledDate: slot.scheduledDate, status: 'planned', writable: true, prescription: slot.prescription, reports: [], latestReportIds: [] }
}
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks() })
describe('reviewed session actual-entry UI', () => {
  it.each([
    { label: 'legacy missing RIR', patch: {}, expected: 'unknown' },
    { label: 'unreported RIR', patch: { schemaVersion: 2 as const, rir: null }, expected: 'unknown' },
    { label: 'zero RIR', patch: { schemaVersion: 2 as const, rir: 0 }, expected: '0' },
    { label: 'independent fractional RIR', patch: { schemaVersion: 2 as const, rir: 2.5 }, expected: '2.5' },
  ])('shows $label in the saved summary without deriving it from RPE', ({ patch, expected }) => {
    const current = state(), activity = reviewedSessionActivities(current.prescription.content)[0]
    const report = { ...reviewedSetReport(activity.id), repetitions: 24, restAfterSeconds: null, ...patch }
    current.reports = [{ id: reportId, requestId: 'saved-request', createdAt: report.performedAt, report }]
    current.latestReportIds = [reportId]
    render(<ReviewedActualSetForm state={current} disabled={false} onSave={vi.fn()} />)
    expect(screen.getByText(`24 reps · RPE 7 · RIR ${expected} · rest unknown seconds`)).toBeVisible()
  })

  it('captures RIR independently, never prefills it from RPE, and clears it for skipped work', () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<ReviewedActualSetForm state={state()} disabled={false} onSave={save} />)
    fireEvent.change(screen.getByLabelText('Actual set RPE'), { target: { value: '7' } })
    expect(screen.getByLabelText('Actual set RIR (estimated)')).toHaveValue(null)
    fireEvent.change(screen.getByLabelText('Actual set RIR (estimated)'), { target: { value: '2.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save actual set' }))
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ schemaVersion: 2, rir: 2.5, rpe: { value: 7, scale: 'effort_0_10' } }))
    fireEvent.change(screen.getByLabelText('Set outcome'), { target: { value: 'not_performed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save actual set' }))
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ schemaVersion: 2, rir: null, rpe: null, status: 'not_performed' }))
  })

  it('starts actuals unknown and requires explicit measured velocity', () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<ReviewedActualSetForm state={state()} disabled={false} onSave={save} />)
    for (const label of ['Actual reps', 'Actual load', 'Actual set RPE', 'Rest after set (seconds)']) expect(screen.getByLabelText(label)).toHaveValue(null)
    fireEvent.click(screen.getByRole('button', { name: 'Add measured rep' }))
    expect(screen.getByLabelText('Mean velocity (m/s)')).toHaveValue(null)
    fireEvent.click(screen.getByRole('button', { name: 'Save actual set' }))
    expect(save).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('Check the actual values')
  })
  it('corrections copy actuals, preserve timestamp/velocity and advance only the revision', () => {
    const current = state(), activity = current.prescription.content.steps.find(step => step.kind === 'activity')!
    const report = { ...reviewedSetReport(activity.id), repetitions: 2,
      velocity: { unit: 'm/s' as const, device: 'Qwik', method: 'video', repetitions: [{ rep: 1, meanConcentricVelocity: 0.4 }] } }
    current.reports = [{ id: reportId, requestId: 'prior-request', createdAt: report.performedAt, report }]; current.latestReportIds = [reportId]
    const save = vi.fn().mockResolvedValue(undefined)
    render(<ReviewedActualSetForm state={current} disabled={false} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: 'Correct this set' }))
    expect(screen.getByLabelText('Actual reps')).toHaveValue(2); expect(screen.getByLabelText('Device')).toHaveValue('Qwik')
    fireEvent.change(screen.getByLabelText('Actual reps'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save actual set' }))
    expect(save).toHaveBeenCalledWith({ ...report, repetitions: 3, revision: 2 })
    expect(current.reports[0].report.repetitions).toBe(2)
  })
  it('completed sessions expose complete actual details and prior revisions without correction access', () => {
    const current = state(), activity = current.prescription.content.steps.find(step => step.kind === 'activity')!
    const report = { ...reviewedSetReport(activity.id), durationSeconds: 30, distanceMetres: 20, symptoms: 'No change', note: 'Used different grip',
      velocity: { unit: 'm/s' as const, device: 'Qwik', method: 'video', repetitions: [{ rep: 1, meanConcentricVelocity: 0.4 }] } }
    current.status = 'completed'; current.writable = false
    current.reports = [{ id: 'old', requestId: 'old-request', createdAt: report.performedAt, report },
      { id: reportId, requestId: 'new-request', createdAt: report.performedAt, report: { ...report, revision: 2, repetitions: 3 } }]
    current.latestReportIds = [reportId]
    render(<ReviewedActualSetForm state={current} disabled={true} onSave={vi.fn()} />)
    for (const text of ['175 lb · total', '30 seconds', '20 metres', 'Used different grip', 'No change', 'Rep 1: 0.4 m/s']) expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    expect(screen.getByText('Earlier report · revision 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Correct this set' })).toBeDisabled()
  })
  it('suggests the next set number independently for each side', () => {
    const current = state(), activity = reviewedSessionActivities(current.prescription.content).find(value => value.work.kind !== 'distance' && value.work.sides === 2)!
    const report = { ...reviewedSetReport(activity.id), side: 'left' as const }
    current.reports = [{ id: reportId, requestId: 'prior-left', createdAt: report.performedAt, report }]; current.latestReportIds = [reportId]
    render(<ReviewedActualSetForm state={current} disabled={false} onSave={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Movement'), { target: { value: activity.id } })
    expect(screen.getByLabelText('Set number')).toHaveValue(2)
    fireEvent.change(screen.getByLabelText('Side'), { target: { value: 'right' } })
    expect(screen.getByLabelText('Set number')).toHaveValue(1)
  })
  it('persists before POST and recovers the identical request after reload', async () => {
    const current = state(), sent: string[] = []; let fail = true
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (init?.method !== 'POST') return new Response(JSON.stringify({ kind: 'session', session: current }))
      sent.push(init.body)
      expect(readReviewedPending(sessionStorage, owner, sessionId)?.body).toEqual(JSON.parse(init.body))
      if (fail) throw new Error('Network response lost')
      const body = JSON.parse(init.body)
      return new Response(JSON.stringify({ kind: 'saved', sessionId, requestId: body.requestId, setReport: { id: reportId } }))
    }))
    const mounted = render(<ReviewedSessionRunner userId={owner} sessionId={sessionId} />)
    await screen.findByRole('button', { name: 'Save actual set' })
    fireEvent.change(screen.getByLabelText('Actual reps'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('Actual set RPE'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save actual set' }))
    await screen.findByText('Network response lost')
    expect(screen.getByRole('button', { name: 'Save actual set' })).toBeDisabled()
    mounted.unmount(); fail = false
    render(<ReviewedSessionRunner userId={owner} sessionId={sessionId} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry original save' }))
    await waitFor(() => expect(readReviewedPending(sessionStorage, owner, sessionId)).toBeNull())
    expect(sent).toHaveLength(2); expect(sent[1]).toBe(sent[0])
  })
  it('completion submits only latest report IDs and does not infer unanswered feedback', async () => {
    const current = state(), activity = current.prescription.content.steps.find(step => step.kind === 'activity')!
    const report = { ...reviewedSetReport(activity.id), performedAt: new Date().toISOString() }
    current.reports = [{ id: reportId, requestId: 'prior-request', createdAt: report.performedAt, report }]; current.latestReportIds = [reportId]
    let sent: Record<string, any> | null = null
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (init?.method !== 'POST') return new Response(JSON.stringify({ kind: 'session', session: current }))
      sent = JSON.parse(init.body)
      return new Response(JSON.stringify({ kind: 'saved', requestId: sent!.requestId,
        result: { prescribed_session_id: sessionId, session_status: 'completed' } }))
    }))
    render(<ReviewedSessionRunner userId={owner} sessionId={sessionId} />)
    fireEvent.change(await screen.findByLabelText('Session outcome'), { target: { value: 'modified' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save session outcome' }))
    await waitFor(() => expect(sent).not.toBeNull())
    expect(sent!.completion).toMatchObject({ contractVersion: 3, setReportIds: [reportId], status: 'completed', totalDurationMinutes: null,
      feedback: { outcome: 'modified', sessionRpe: null, energy: null, pain: null,
        provenance: { pain: { origin: 'unknown', reviewState: 'unreviewed' } } } })
  })
  it('leaves corrupt pending storage intact and disables new saves', async () => {
    sessionStorage.setItem(`reviewed-session-pending:${owner}:${sessionId}`, '{bad')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kind: 'session', session: state() }))))
    render(<ReviewedSessionRunner userId={owner} sessionId={sessionId} />)
    expect(await screen.findByRole('button', { name: 'Save actual set' })).toBeDisabled()
    expect(sessionStorage.getItem(`reviewed-session-pending:${owner}:${sessionId}`)).toBe('{bad')
  })
  it('explicit no-write resolution restores actuals for editing and uses a fresh key only on deliberate save', async () => {
    const current = state(), activity = current.prescription.content.steps.find(step => step.kind === 'activity')!
    const report = { ...reviewedSetReport(activity.id), repetitions: 6, rpe: { value: 7, scale: 'rir_based' as const } }
    const pending = saveReviewedPending(sessionStorage, { schemaVersion: 1, userId: owner, sessionId, operation: 'set',
      body: { expectedUserId: owner, requestId: 'original-rejected-key', report } })
    const writes: Record<string, any>[] = []
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (init?.method !== 'POST') return new Response(JSON.stringify({ kind: 'session', session: current }))
      const body = JSON.parse(init.body)
      if (String(url).endsWith('/resolve')) return new Response(JSON.stringify({ kind: 'resolved', resolution: {
        schemaVersion: 1, userId: owner, sessionId, operation: 'set', requestId: body.requestId, payload: body.payload,
        disposition: 'no_write', resolutionId: reportId, resolvedAt: '2026-09-28T00:00:00Z',
      } }))
      writes.push(body)
      return new Response(JSON.stringify({ kind: 'saved', sessionId, requestId: body.requestId, setReport: { id: reportId } }))
    }))
    render(<ReviewedSessionRunner userId={owner} sessionId={sessionId} />)
    expect(await screen.findByRole('button', { name: 'Save actual set' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Resolve previous save' }))
    await screen.findByText(/original request did not save/)
    await waitFor(() => expect(screen.getByLabelText('Actual reps')).toHaveValue(6))
    expect(writes).toHaveLength(0); expect(screen.getByLabelText('Actual set RPE')).toHaveValue(7)
    fireEvent.change(screen.getByLabelText('Actual reps'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save actual set' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].requestId).not.toBe(pending.body.requestId); expect(writes[0].report.repetitions).toBe(8)
    expect(JSON.parse(sessionStorage.getItem(`reviewed-session-resolution:${owner}:set:${pending.body.requestId}`)!)).toMatchObject({ request: pending })
  })
  it('lost resolution response preserves the original and keeps editing disabled', async () => {
    const current = state(), activity = current.prescription.content.steps.find(step => step.kind === 'activity')!
    const pending = saveReviewedPending(sessionStorage, { schemaVersion: 1, userId: owner, sessionId, operation: 'set',
      body: { expectedUserId: owner, requestId: 'original-rejected-key', report: reviewedSetReport(activity.id) } })
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (init?.method === 'POST') throw new Error('Resolution response lost')
      return new Response(JSON.stringify({ kind: 'session', session: current }))
    }))
    render(<ReviewedSessionRunner userId={owner} sessionId={sessionId} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve previous save' }))
    await screen.findByText('Resolution response lost')
    expect(readReviewedPending(sessionStorage, owner, sessionId)).toEqual(pending)
    expect(screen.getByRole('button', { name: 'Save actual set' })).toBeDisabled()
  })
  it('restores unsaved completion feedback and occurrence while rebuilding the latest manifest', async () => {
    const current = state(), activity = current.prescription.content.steps.find(step => step.kind === 'activity')!
    const report = { ...reviewedSetReport(activity.id), performedAt: '2026-08-04T17:00:00Z' }
    current.reports = [{ id: reportId, requestId: 'latest-report', createdAt: report.performedAt, report }]; current.latestReportIds = [reportId]
    const completion = { ...reviewedCompletion([owner]), totalDurationMinutes: 45,
      feedback: { ...reviewedCompletion().feedback, outcome: 'modified', sessionRpe: 7.5, energy: 'okay', pain: 'none', note: 'Shortened for time' } }
    saveReviewedPending(sessionStorage, { schemaVersion: 1, userId: owner, sessionId, operation: 'complete',
      body: { expectedUserId: owner, requestId: 'old-completion', completion } })
    let saved: any = null
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (init?.method !== 'POST') return new Response(JSON.stringify({ kind: 'session', session: current }))
      const body = JSON.parse(init.body)
      if (String(url).endsWith('/resolve')) return new Response(JSON.stringify({ kind: 'resolved', resolution: {
        schemaVersion: 1, userId: owner, sessionId, operation: 'complete', requestId: body.requestId, payload: body.payload,
        disposition: 'no_write', resolutionId: reportId, resolvedAt: '2026-09-28T00:00:00Z',
      } }))
      saved = body
      return new Response(JSON.stringify({ kind: 'saved', requestId: body.requestId, result: { prescribed_session_id: sessionId, session_status: 'completed' } }))
    }))
    render(<ReviewedSessionRunner userId={owner} sessionId={sessionId} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve previous save' }))
    await waitFor(() => expect(screen.getByLabelText('Overall session RPE')).toHaveValue(7.5))
    expect(screen.getByLabelText('Session outcome')).toHaveValue('modified')
    expect(screen.getByLabelText('Actual duration (minutes)')).toHaveValue(45)
    expect(screen.getByLabelText('Energy')).toHaveValue('okay'); expect(screen.getByLabelText('Pain')).toHaveValue('none')
    expect(screen.getByLabelText('Session note')).toHaveValue('Shortened for time'); expect(saved).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save session outcome' }))
    await waitFor(() => expect(saved).not.toBeNull())
    expect(saved.completion.setReportIds).toEqual([reportId]); expect(saved.completion.occurredAt).toBe(completion.occurredAt)
    expect(saved.requestId).not.toBe('old-completion'); expect(saved.completion.feedback.sessionRpe).toBe(7.5)
  })
  it.each([
    ['backdated work', '2026-08-10T12:00', '2026-08-10T12:12'],
    ['overnight work', '2026-08-10T23:55', '2026-08-11T00:12'],
  ])('keeps %s on its first set date and uses the athlete-entered finish time', (_label, start, finish) => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-15T12:00'))
    const current = state(), report = { ...reviewedSetReport('required-work'), performedAt: new Date(start).toISOString() }
    current.reports = [{ id: reportId, requestId: 'saved-report', createdAt: new Date().toISOString(), report }]; current.latestReportIds = [reportId]
    const save = vi.fn().mockResolvedValue(undefined)
    render(<ReviewedCompletionForm state={current} disabled={false} onSave={save} />)
    fireEvent.change(screen.getByLabelText('Session outcome'), { target: { value: 'modified' } })
    fireEvent.change(screen.getByLabelText(/Finished at/), { target: { value: finish } })
    fireEvent.click(screen.getByRole('button', { name: 'Save session outcome' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ occurredAt: new Date(finish).toISOString(), workoutDate: '2026-08-10',
      tzOffset: new Date(finish).getTimezoneOffset(), setReportIds: [reportId] }))
  })
  it('uses current finish time for an untouched default after later sets arrive', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-08-10T12:00'))
    const current = state(), save = vi.fn().mockResolvedValue(undefined)
    const mounted = render(<ReviewedCompletionForm state={current} disabled={false} onSave={save} />)
    vi.setSystemTime(new Date('2026-08-10T12:30'))
    const report = { ...reviewedSetReport('required-work'), performedAt: new Date().toISOString() }
    current.reports = [{ id: reportId, requestId: 'later-set', createdAt: report.performedAt, report }]; current.latestReportIds = [reportId]
    mounted.rerender(<ReviewedCompletionForm state={current} disabled={false} onSave={save} />)
    fireEvent.change(screen.getByLabelText('Session outcome'), { target: { value: 'modified' } })
    vi.setSystemTime(new Date('2026-08-10T12:35'))
    fireEvent.click(screen.getByRole('button', { name: 'Save session outcome' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ occurredAt: new Date().toISOString(), workoutDate: '2026-08-10' }))
  })
  it.runIf(new Date('2026-03-08T01:30').getTimezoneOffset() !== new Date('2026-03-08T03:30').getTimezoneOffset())('rejects a nonexistent spring-forward finish time without silently changing the hour', () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<ReviewedCompletionForm state={state()} disabled={false} onSave={save} />)
    fireEvent.change(screen.getByLabelText('Session outcome'), { target: { value: 'skipped' } })
    fireEvent.change(screen.getByLabelText(/Finished at/), { target: { value: '2026-03-08T02:30' } })
    expect(screen.getByRole('alert')).toHaveTextContent('valid local date and time')
    expect(screen.getByLabelText(/Finished at/)).toHaveValue('')
    expect(save).not.toHaveBeenCalled()
  })
  it.each([
    ['2026-08-10T11:59', 'at or after every reported set'],
    ['2026-08-12T12:00', 'first set’s day or the following day'],
    ['2026-11-16T12:00', 'cannot be in the future'],
    ['', 'Choose when this session finished'],
  ])('rejects an invalid finish time %s before creating a save request', (finish, error) => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-15T12:00'))
    const current = state(), report = { ...reviewedSetReport('required-work'), performedAt: new Date('2026-08-10T12:00').toISOString() }
    current.reports = [{ id: reportId, requestId: 'saved-report', createdAt: report.performedAt, report }]; current.latestReportIds = [reportId]
    const save = vi.fn().mockResolvedValue(undefined)
    const mounted = render(<ReviewedCompletionForm state={current} disabled={false} onSave={save} />)
    fireEvent.change(screen.getByLabelText('Session outcome'), { target: { value: 'modified' } })
    fireEvent.change(screen.getByLabelText(/Finished at/), { target: { value: finish } })
    fireEvent.submit(mounted.container.querySelector('form')!)
    expect(save).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent(error)
  })
  it('checks explicitly omitted set timestamps too and allows a backdated skipped session', () => {
    const current = state(), report = { ...reviewedSetReport('optional-work'), status: 'not_performed' as const, performedAt: new Date('2026-08-10T12:05').toISOString() }
    current.reports = [{ id: reportId, requestId: 'omitted-report', createdAt: report.performedAt, report }]; current.latestReportIds = [reportId]
    const save = vi.fn().mockResolvedValue(undefined)
    render(<ReviewedCompletionForm state={current} disabled={false} onSave={save} />)
    fireEvent.change(screen.getByLabelText('Session outcome'), { target: { value: 'skipped' } })
    fireEvent.change(screen.getByLabelText(/Finished at/), { target: { value: '2026-08-10T12:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save session outcome' }))
    expect(save).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('every reported set')
    fireEvent.change(screen.getByLabelText(/Finished at/), { target: { value: '2026-08-10T12:12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save session outcome' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped', workoutDate: '2026-08-10', totalDurationMinutes: null }))
  })
  it('retains the exact rejected completion across reload until explicit resolution', async () => {
    const current = state(), sent: string[] = [], completion = reviewedCompletion([reportId])
    const pending = saveReviewedPending(sessionStorage, { schemaVersion: 1, userId: owner, sessionId, operation: 'complete',
      body: { expectedUserId: owner, requestId: 'rejected-completion', completion } })
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (init?.method !== 'POST') return new Response(JSON.stringify({ kind: 'session', session: current }))
      sent.push(init.body); return new Response(JSON.stringify({ kind: 'review_required' }), { status: 409 })
    }))
    const mounted = render(<ReviewedSessionRunner userId={owner} sessionId={sessionId} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry original save' }))
    await screen.findByRole('alert')
    expect(readReviewedPending(sessionStorage, owner, sessionId)).toEqual(pending)
    expect(screen.getByLabelText(/Finished at/)).toBeDisabled()
    mounted.unmount(); render(<ReviewedSessionRunner userId={owner} sessionId={sessionId} />)
    await screen.findByRole('button', { name: 'Resolve previous save' })
    expect(readReviewedPending(sessionStorage, owner, sessionId)).toEqual(pending)
    expect(sent).toEqual([JSON.stringify(pending.body)])
  })
})
