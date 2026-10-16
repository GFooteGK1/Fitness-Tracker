import { describe, expect, it } from 'vitest'
import { parseReviewedRequestResolution } from '@/app/lib/coach/reviewed-request-resolution'
import { reviewedCompletion } from '../fixtures/reviewed-completion'
const owner = '11111111-1111-4111-8111-111111111111', sessionId = '22222222-2222-4222-8222-222222222222'
const id = '33333333-3333-4333-8333-333333333333'
describe('complete resolution receipts', () => {
  it.each(['completed', 'skipped'] as const)('validates %s receipt against exact original identity and payload', status => {
    const expected = { userId: owner, sessionId, operation: 'complete' as const, requestId: 'saved-completion', payload: reviewedCompletion([], status) }
    const result = { prescribed_session_id: sessionId, session_status: status, checkin_id: id, workout_id: status === 'completed' ? id : null, replayed: true }
    const receipt = status === 'completed' ? { userId: owner, requestKey: 'reviewed-completion:saved-completion', entityId: id } : null
    const value = { schemaVersion: 1, ...expected, disposition: 'saved', result: { result, receipt } }
    expect(parseReviewedRequestResolution(value, expected)).toEqual(value)
    for (const patch of [{ session_status: 'unknown' }, { prescribed_session_id: owner }, { checkin_id: 'bad' }, { replayed: false }, { workout_id: 'bad' }]) {
      expect(parseReviewedRequestResolution({ ...value, result: { result: { ...result, ...patch }, receipt } }, expected)).toBeNull()
    }
    expect(parseReviewedRequestResolution({ ...value, result: { result, receipt: { ...receipt, userId: sessionId } } }, expected)).toBeNull()
  })
})
