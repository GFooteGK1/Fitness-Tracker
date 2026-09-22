import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { coachContextConflictMessage, fetchCoachContextRevision, parseCoachContextRevision } from '@/app/lib/coach/proposal-context-revision'

describe('proposal context revision', () => {
  it('distinguishes changed intent from a retryable source revision and never exposes arbitrary database text', () => {
    expect(coachContextConflictMessage({ message: 'Confirmed training intent changed or needs review; refresh the direction' })).toContain('refreshing the old review is not enough')
    expect(coachContextConflictMessage({ message: 'private database detail' })).toBe('Your training information changed; refresh and create a new proposal')
  })
  it.each([0, 1, Number.MAX_SAFE_INTEGER])('accepts the numeric revision %s', value => {
    expect(parseCoachContextRevision(value)).toBe(value)
  })
  it.each([null, undefined, '1', -1, 1.1, Number.MAX_SAFE_INTEGER + 1, NaN, {}, []])('rejects an invalid token %j', value => {
    expect(parseCoachContextRevision(value)).toBeNull()
  })
  it('uses the authenticated owner RPC without a caller-supplied identity', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 4, error: null })
    expect(await fetchCoachContextRevision({ rpc } as unknown as SupabaseClient)).toBe(4)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('get_coach_context_revision')
  })
  it.each([{ data: 4, error: { code: '42501' } }, { data: null, error: null }])('fails closed when storage cannot supply a revision', async result => {
    const rpc = vi.fn().mockResolvedValue(result)
    await expect(fetchCoachContextRevision({ rpc } as unknown as SupabaseClient)).rejects.toThrow('Unable to verify current training information')
  })
})
