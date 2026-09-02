// @vitest-environment jsdom

import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CoachTrustCenter } from '@/app/program/coach-trust-center'
import type { CoachTrustCenter as CoachTrustCenterModel } from '@/app/lib/coach/trust-center'

describe('CoachTrustCenter', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the four trust layers and reuses an idempotency key after interruption', async () => {
    const calls: RequestInit[] = []
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init) return response({ trust: trustFixture() })
      calls.push(init)
      if (calls.length === 1) return response({ error: 'Write interrupted' }, 503)
      return response({ saved: true, trust: trustFixture() })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CoachTrustCenter />)

    expect(await screen.findByRole('heading', { name: 'What Coach Knows' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Needs Review' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Quality Progress' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Why This Changed' })).not.toBeNull()
    expect(screen.getByText('Normalized measurements only. Original file stays with you and was not uploaded.')).not.toBeNull()
    expect(screen.getByText('Direct outcomes')).not.toBeNull()
    expect(screen.getByText(/No numeric target supplied/)).not.toBeNull()
    expect(screen.getByText('Repeated compatible direct outcomes improved.')).not.toBeNull()
    expect(screen.getByText(/Excluded because: Incompatible Comparability Series/)).not.toBeNull()

    const button = screen.getByRole('button', { name: 'Still correct' })
    expect(button.className).toContain('min-h-11')
    await act(async () => fireEvent.click(button))
    expect((await screen.findByRole('alert')).textContent).toContain('Write interrupted')
    await act(async () => fireEvent.click(button))
    expect((await screen.findByRole('status')).textContent).toContain('Coach memory reaffirmed')

    const first = JSON.parse(String(calls[0].body))
    const second = JSON.parse(String(calls[1].body))
    expect(first.idempotencyKey).toBe(second.idempotencyKey)
    expect(first.action).toBe('reaffirm_memory')
  })

  it('requires an explicit ambiguous movement selection before confirming Qwik evidence', async () => {
    const requests: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init) return response({ trust: trustFixture() })
      requests.push(JSON.parse(String(init.body)))
      return response({ saved: true, trust: { ...trustFixture(), imports: [] } })
    }))

    render(<CoachTrustCenter />)
    const confirm = await screen.findByRole('button', { name: 'Confirm import' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    const select = screen.getByRole('combobox', { name: 'Choose the movement' })
    expect(select.className).toContain('min-h-11')
    expect(select.className).toContain('text-base')
    fireEvent.change(select, { target: { value: 'barbell_back_squat' } })
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
    await act(async () => fireEvent.click(confirm))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]).toMatchObject({
      action: 'confirm_import',
      mappings: [{
        groupId: '71111111-1111-4111-8111-111111111111',
        movementId: 'barbell_back_squat'
      }]
    })
    expect(JSON.stringify(requests[0])).not.toMatch(/rawText|bar_path|barPath/)
  })

  it('requires a reason and second submit before rejecting a proposal', async () => {
    const requests: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init) return response({ trust: trustFixture() })
      requests.push(JSON.parse(String(init.body)))
      return response({ saved: true, trust: { ...trustFixture(), proposals: [] } })
    }))
    render(<CoachTrustCenter />)

    fireEvent.click(await screen.findByRole('button', { name: 'Reject proposal' }))
    const submit = screen.getByRole('button', { name: 'Confirm rejection' })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Why are you rejecting this change?' }), {
      target: { value: 'Keep the current emphasis for now' }
    })
    expect((submit as HTMLButtonElement).disabled).toBe(false)
    await act(async () => fireEvent.click(submit))

    await waitFor(() => expect(requests[0]).toMatchObject({
      action: 'reject_proposal',
      reason: 'Keep the current emphasis for now'
    }))
  })
})

function trustFixture(): CoachTrustCenterModel {
  return {
    generatedAt: '2026-09-01T18:00:00.000Z',
    available: true,
    unavailableReason: null,
    memories: [{
      id: '21111111-1111-4111-8111-111111111111', memoryKey: 'primary_goal', kind: 'goal',
      version: 1, summary: 'Build useful strength',
      content: { goal: 'Build useful strength', primaryDomain: 'strength', secondaryGoals: [] },
      source: 'Confirmed in Program setup', confidence: 1,
      confirmedAt: '2026-08-01T12:00:00.000Z', lastReviewedAt: null,
      reviewAfter: '2026-11-01T12:00:00.000Z', freshness: 'current'
    }],
    imports: [{
      id: '31111111-1111-4111-8111-111111111111', sourceSystem: 'qwik_vbt', fileName: 'qwik.json',
      fileHashPrefix: 'aaaaaaaaaaaa', parserVersion: 'qwik-import-0.1.0',
      capturedAt: '2026-08-31T12:01:00.000Z', sourceExportedAt: '2026-08-31T12:00:00.000Z',
      warningCount: 1, rawStoragePolicy: 'user_retained_not_uploaded', canConfirm: true, blockingReason: null,
      groups: [{
        id: '71111111-1111-4111-8111-111111111111', status: 'incomplete', sourceRecordId: 'set-1',
        sourceExercise: 'Squat', observedAt: '2026-08-31T12:00:00.000Z', mappingStatus: 'ambiguous',
        canonicalMovementId: null, canonicalMovementName: null,
        candidates: [{ id: 'barbell_back_squat', name: 'Barbell back squat' }],
        protocol: 'qwik-video-vbt-fixed-load', comparabilityKey: null, comparison: {},
        values: [
          { metricId: 'strength.load', semanticRole: 'training_signal', value: 100, unit: 'kg', ordinal: 0 },
          { metricId: 'strength.repetitions', semanticRole: 'training_signal', value: 3, unit: 'repetitions', ordinal: 0 },
          { metricId: 'bar.mean_velocity', semanticRole: 'direct_outcome', value: 0.58, unit: 'm_per_s', ordinal: 0 }
        ]
      }]
    }],
    goals: [{ id: 'goal-1', statement: 'Build useful strength', priority: 'primary', target: null, startsOn: '2026-08-01', endsOn: '2026-09-25' }],
    qualities: [{ id: 'quality-1', goalId: 'goal-1', qualityId: 'maximal_strength', state: 'development' }],
    signalSummary: [{ semanticRole: 'direct_outcome', count: 2, latestObservedAt: '2026-08-31T12:00:00.000Z' }],
    proposals: [{
      id: '41111111-1111-4111-8111-111111111111', createdAt: '2026-09-01T12:00:00.000Z',
      action: 'reallocate_emphasis', trend: 'stable', evidenceStatus: 'supported', confidence: 0.82,
      includedCount: 2, excludedCount: 1, explanation: ['Repeated compatible direct outcomes improved.'],
      excludedReasons: ['incompatible_comparability_series'], automaticActivation: false
    }]
  }
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
