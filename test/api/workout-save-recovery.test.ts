import { describe, expect, it, vi } from 'vitest'
import { recoverFailedWorkoutRequest } from '@/app/lib/capture/reconciliation'

const request = { id: 'ledger', request_key: 'workout-text:original', status: 'complete', http_status: 500,
  response: { error: 'Failed to parse workout', retryAllowed: false } }

describe('legacy workout recovery proof', () => {
  it('releases only a database-confirmed no-write outcome and leaves the receipt unchanged', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { retryAllowed: true }, error: null })
    const result = await recoverFailedWorkoutRequest({ rpc } as never, request)
    expect(result).toMatchObject({ state: 'draft', retryAllowed: true, savedEntities: [] })
    expect(result?.error).toContain('not saved')
    expect(request.response.retryAllowed).toBe(false)
    expect(rpc).toHaveBeenCalledWith('confirm_failed_workout_request', { p_id: 'ledger' })
  })
  it.each([{ data: { retryAllowed: false } }, { data: null, error: { code: 'PGRST202' } }, { data: null }])('keeps unavailable or negative proof closed: %j', async result => {
    expect(await recoverFailedWorkoutRequest({ rpc: vi.fn().mockResolvedValue(result) } as never, request)).toBeNull()
  })
  it('keeps a lost proof response closed', async () => {
    expect(await recoverFailedWorkoutRequest({ rpc: vi.fn().mockRejectedValue(new Error('lost')) } as never, request)).toBeNull()
  })
  it.each([{ status: 'processing' }, { http_status: 200 }, { request_key: 'meal-text:original' }])('does not probe unrelated requests: %j', async change => {
    const rpc = vi.fn()
    expect(await recoverFailedWorkoutRequest({ rpc } as never, { ...request, ...change })).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })
})
