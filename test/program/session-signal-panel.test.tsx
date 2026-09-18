// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SessionSignalPanel } from '@/app/program/session-signal-panel'
import { TodaySessionCard } from '@/app/program/today-session-card'
import { buildCompleteEightWeekPlan } from '@/app/lib/coach/complete-program'
import { GOLDEN_PROGRAMMING_PROFILES } from '../coach/golden-programming-profiles'

const prescription = buildCompleteEightWeekPlan(GOLDEN_PROGRAMMING_PROFILES[0].profile).weeks[0].sessions[0]
const exerciseId = `${prescription.blocks[0].id}:0`
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const fetch = vi.fn()
beforeEach(() => { fetch.mockReset(); vi.stubGlobal('fetch', fetch) })
afterEach(() => vi.unstubAllGlobals())

describe('exercise feedback capture and completion reuse', () => {
  it('offers a working retry when saved feedback is unavailable', async () => {
    fetch.mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce(response({ signals: [], userId: 'athlete-1' }))
    const onEvidence = vi.fn()
    render(<SessionSignalPanel sessionId="session-1" prescription={prescription} disabled={false} onEvidence={onEvidence} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry loading exercise feedback', hidden: true }))
    await waitFor(() => expect(onEvidence).toHaveBeenLastCalledWith(true, '', false))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('retries the frozen report and original owner after a lost response', async () => {
    fetch.mockResolvedValueOnce(response({ signals: [], userId: 'athlete-1' }))
      .mockRejectedValueOnce(new Error('synthetic lost response'))
      .mockImplementationOnce(async (_url, init) => response({ id: 'signal-1', prescribedSessionId: 'session-1',
        signal: JSON.parse(init.body).signal, createdAt: '2026-09-17T18:00:00Z', policyVersion: 'session-capture-1' }))
    const onEvidence = vi.fn()
    render(<SessionSignalPanel sessionId="session-1" prescription={prescription} disabled={false} onEvidence={onEvidence} />)
    fireEvent.click(screen.getByText('Exercise feedback (optional)'))
    await waitFor(() => expect(onEvidence).toHaveBeenLastCalledWith(true, '', false))
    fireEvent.change(screen.getByLabelText('Feedback exercise'), { target: { value: exerciseId } })
    fireEvent.change(screen.getByLabelText('Exercise effort'), { target: { value: '7.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save exercise feedback' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Retry same feedback' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(fetch.mock.calls[2][1].body).toBe(fetch.mock.calls[1][1].body)
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ expectedUserId: 'athlete-1', signal: { ratingScope: 'hardest_set', rpe: 7.5 } })
    await waitFor(() => expect(onEvidence).toHaveBeenLastCalledWith(true, '', false))
  })

  it('prefills reported actual work and merges only added details after an athlete edit', async () => {
    const first = { id: 'signal-1', prescribedSessionId: 'session-1', createdAt: '2026-09-17T17:00:00Z', policyVersion: 'session-capture-1',
      signal: { schemaVersion: 1, exerciseId, ratingScope: 'hardest_set', workStatus: 'changed', actualReps: 5 } }
    fetch.mockResolvedValueOnce(response({ signals: [first], userId: 'athlete-1' }))
      .mockImplementationOnce(async (_url, init) => response({ id: 'signal-2', prescribedSessionId: 'session-1',
        signal: JSON.parse(init.body).signal, createdAt: '2026-09-17T18:00:00Z', policyVersion: 'session-capture-1' }))
    const onSubmit = vi.fn().mockResolvedValue(null)
    render(<TodaySessionCard feedbackV2 exerciseSignalsEnabled prescription={prescription} saving={false} onSubmit={onSubmit}
      onEditFailedEntry={vi.fn()} onRefreshPlan={vi.fn()} session={{ id: 'session-1', weekNumber: 1, sessionIndex: 1,
        scheduledDate: '2026-09-17', prescription: prescription as unknown as Record<string, unknown>, status: 'planned',
        completionContractVersion: null, completedWorkoutId: null }}><p>Accepted work</p></TodaySessionCard>)
    await waitFor(() => expect(screen.queryByText('Loading saved exercise feedback…')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Finish or skip session' }))
    const summary = screen.getByLabelText('Actual work summary')
    expect((summary as HTMLTextAreaElement).value).toContain('Hardest set: 5 reps')
    fireEvent.change(summary, { target: { value: 'My correction: first effort was four reps.' } })
    fireEvent.click(screen.getByText('Exercise feedback (optional)'))
    fireEvent.change(screen.getByLabelText('Feedback exercise'), { target: { value: exerciseId } })
    fireEvent.change(screen.getByLabelText('Reported reps'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save exercise feedback' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add saved details to my summary' }))
    expect((summary as HTMLTextAreaElement).value).toContain('My correction: first effort was four reps.')
    expect((summary as HTMLTextAreaElement).value).toContain('Hardest set: 6 reps')
    expect((summary as HTMLTextAreaElement).value).not.toContain('Hardest set: 5 reps')
    fireEvent.click(screen.getByRole('button', { name: 'Save workout' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    expect(onSubmit.mock.calls[0][1].feedback).toMatchObject({ outcome: 'modified', sessionRpe: null })
  })
})
