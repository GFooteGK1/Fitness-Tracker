import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/app/lib/coach/athlete-context', () => ({ fetchCoachRuntimeContext: vi.fn().mockResolvedValue({}) }))
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { POST } from '@/app/api/coach/sessions/[id]/complete/route'
import { POST as saveSignal } from '@/app/api/coach/sessions/[id]/signals/route'

const sessionId = '11111111-1111-4111-8111-111111111111'
const params = { params: Promise.resolve({ id: sessionId }) }
const body = { contractVersion: 2, expectedUserId: 'user-1', idempotencyKey: 'feedback-request-1',
  feedback: { feedbackVersion: 2, outcome: 'as_planned', occurredAt: '2026-09-17T18:00:00.000Z' },
  performedWork: { mode: 'as_prescribed', workoutDate: '2026-09-17', inputText: null, blocks: null, totalDurationMinutes: null }, observations: [] }
const request = (input: unknown) => new Request('http://localhost/api/coach/sessions/1/complete', { method: 'POST', body: JSON.stringify(input) })
const rpc = vi.fn()
beforeEach(() => {
  vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED', 'true')
  rpc.mockReset().mockImplementation(async (name: string) => ({ data: name === 'record_coach_session_capture' ? { result: { prescribed_session_id: sessionId, checkin_id: 'checkin-1' }, receipt: { entityId: 'saved-workout', state: 'saved' } } : [{ prescribed_session_id: sessionId, checkin_id: 'checkin-1' }], error: null }))
  vi.mocked(fetchCoachRuntimeContext).mockResolvedValue({} as never)
  vi.mocked(createServerClient).mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) }, rpc } as never)
})
afterEach(() => vi.unstubAllEnvs())

describe('optional feedback API compatibility', () => {
  it('passes nullable feedback and derived provenance to the compatible atomic RPC', async () => {
    expect((await POST(request(body), params)).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('record_coach_session_capture', expect.objectContaining({ p_feedback: {
      schemaVersion: 2, feedbackVersion: 2, outcome: 'as_planned', sessionRpe: null, energy: null, pain: null, note: null,
      provenance: { sessionRpe: { origin: 'unknown', reviewState: 'unreviewed' }, energy: { origin: 'unknown', reviewState: 'unreviewed' }, pain: { origin: 'unknown', reviewState: 'unreviewed' } }
    } }))
  })
  it('returns the committed receipt even if a later context refresh is unavailable', async () => {
    vi.mocked(fetchCoachRuntimeContext).mockRejectedValueOnce(new Error('read unavailable'))
    const response = await POST(request(body), params)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ result: { checkin_id: 'checkin-1' }, receipts: [{ entityId: 'saved-workout' }], contextUnavailable: true })
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it('rejects v2 when disabled and rejects account changes before any RPC', async () => {
    vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED', 'false')
    expect((await POST(request(body), params)).status).toBe(409)
    vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED', 'true')
    expect((await POST(request({ ...body, expectedUserId: 'previous-user' }), params)).status).toBe(409)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('never downgrades a non-atomic v2 request into legacy feedback', async () => {
    expect((await POST(request({ feedback: body.feedback, idempotencyKey: 'legacy-path' }), params)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('preserves exact legacy feedback payload with no provenance additions', async () => {
    const legacy = { outcome: 'as_planned', sessionRpe: 7.5, energy: 'okay', pain: 'none', note: null, occurredAt: body.feedback.occurredAt }
    expect((await POST(request({ ...body, feedback: legacy }), params)).status).toBe(200)
    expect(rpc.mock.calls[0][1].p_feedback).toEqual({ schemaVersion: 1, outcome: 'as_planned', sessionRpe: 7.5, energy: 'okay', pain: 'none', note: null })
  })
  it('rejects switched-account exercise feedback and derives snapshots only inside RPC', async () => {
    const signal = { schemaVersion: 1, exerciseId: 'block:0', ratingScope: 'hardest_set', workStatus: 'unsure', rpe: 8, rpeScale: 'effort_0_10' }
    expect((await saveSignal(request({ requestId: 'signal-request', expectedUserId: 'previous-user', signal }), params)).status).toBe(409)
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({ data: [{ id: 'signal-1', created_at: body.feedback.occurredAt }], error: null })
    expect((await saveSignal(request({ requestId: 'signal-request', expectedUserId: 'user-1', signal }), params)).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('record_coach_session_signal', { p_session_id: sessionId, p_request_id: 'signal-request', p_signal: signal })
  })
})
