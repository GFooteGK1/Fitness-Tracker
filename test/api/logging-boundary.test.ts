import { describe, it, expect, vi, afterEach } from 'vitest'
import { saveActivity, ActivitySaveError, loggingContext, type LoggingContext } from '@/app/lib/logging/server'

afterEach(() => vi.unstubAllEnvs())

describe('uncertain activity writes', () => {
  it('classifies a lost RPC response as a save uncertainty', async () => {
    vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED', 'false')
    const supabase = { rpc: vi.fn().mockRejectedValue(new TypeError('connection lost')) }
    await expect(saveActivity(supabase as any,'meal',{})).rejects.toBeInstanceOf(ActivitySaveError)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })
  it.each(['22P02', '22023', '23514', '23502'])('classifies SQL rejection %s as a confirmed rollback', async code => {
    vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED', 'false')
    const context: LoggingContext = { id: 'request-one' }
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code } }) }
    await expect(loggingContext.run(context, () => saveActivity(db as never, 'workout', {}))).rejects.toThrow('not saved')
    expect(context.canonicalNoWriteConfirmed).toBe(true)
  })
  it.each(['', 'PGRST000', '08006', '57014'])('keeps unavailable or ambiguous error %s uncertain', async code => {
    vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED', 'false')
    const context: LoggingContext = { id: 'request-one' }
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code } }) }
    await expect(loggingContext.run(context, () => saveActivity(db as never, 'workout', {}))).rejects.toBeInstanceOf(ActivitySaveError)
    expect(context.canonicalNoWriteConfirmed).not.toBe(true)
  })
})
