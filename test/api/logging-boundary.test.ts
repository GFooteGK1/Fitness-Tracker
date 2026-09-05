import { describe, it, expect, vi } from 'vitest'
import { saveActivity, ActivitySaveError } from '@/app/lib/logging/server'

describe('uncertain activity writes', () => {
  it('classifies a lost RPC response as a save uncertainty', async () => {
    const supabase = { rpc: vi.fn().mockRejectedValue(new TypeError('connection lost')) }
    await expect(saveActivity(supabase as any,'meal',{})).rejects.toBeInstanceOf(ActivitySaveError)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })
})
