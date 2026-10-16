import { stableStringify } from './rolling-weekly-contracts'

const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
export interface ReviewedResolutionIdentity {
  userId: string; sessionId: string; operation: 'set' | 'complete'; requestId: string; payload: unknown
}
export type ReviewedRequestResolution = ReviewedResolutionIdentity & { schemaVersion: 1 } & (
  { disposition: 'no_write'; resolutionId: string; resolvedAt: string }
  | { disposition: 'saved'; result: Record<string, unknown> }
)

/** Shared response validation; JSONB key ordering is not request identity. */
export function parseReviewedRequestResolution(value: unknown, expected: ReviewedResolutionIdentity): ReviewedRequestResolution | null {
  if (!record(value) || value.schemaVersion !== 1 || value.userId !== expected.userId || value.sessionId !== expected.sessionId
    || value.operation !== expected.operation || value.requestId !== expected.requestId
    || stableStringify(value.payload) !== stableStringify(expected.payload)) return null
  if (value.disposition === 'no_write') {
    return typeof value.resolutionId === 'string' && uuid.test(value.resolutionId) && date(value.resolvedAt)
      ? { ...expected, schemaVersion: 1, disposition: 'no_write', resolutionId: value.resolutionId, resolvedAt: value.resolvedAt } : null
  }
  if (value.disposition !== 'saved' || !record(value.result)) return null
  if (expected.operation === 'set') {
    return typeof value.result.id === 'string' && uuid.test(value.result.id) && date(value.result.created_at) && value.result.replayed === true
      ? { ...expected, schemaVersion: 1, disposition: 'saved', result: value.result } : null
  }
  const result = value.result.result, receipt = value.result.receipt
  if (!record(result) || !record(expected.payload) || result.prescribed_session_id !== expected.sessionId
    || !['completed', 'skipped'].includes(String(result.session_status)) || result.session_status !== expected.payload.status
    || typeof result.checkin_id !== 'string' || !uuid.test(result.checkin_id) || result.replayed !== true) return null
  if (result.session_status === 'completed' ? !record(receipt) || receipt.userId !== expected.userId
      || receipt.requestKey !== `reviewed-completion:${expected.requestId}` || typeof result.workout_id !== 'string'
      || !uuid.test(result.workout_id) || receipt.entityId !== result.workout_id
    : result.workout_id !== null || receipt !== null) return null
  return { ...expected, schemaVersion: 1, disposition: 'saved', result: value.result }
}
