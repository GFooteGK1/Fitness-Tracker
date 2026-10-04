/** Browser-side exact-request recovery. Pending work is never discarded on error. */
import { parseReviewedRequestResolution, type ReviewedRequestResolution } from './reviewed-request-resolution'
import { stableStringify } from './rolling-weekly-contracts'
export interface ReviewedPendingSessionRequest {
  schemaVersion: 1
  userId: string
  sessionId: string
  operation: 'set' | 'complete'
  body: { expectedUserId: string; requestId: string; report?: unknown; completion?: unknown }
}
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const key = (owner: string, session: string) => `reviewed-session-pending:${owner}:${session.toLowerCase()}`

function valid(value: unknown, owner: string, sessionId: string): value is ReviewedPendingSessionRequest {
  if (!record(value) || value.schemaVersion !== 1 || value.userId !== owner || value.sessionId !== sessionId.toLowerCase()
    || !uuid.test(owner) || !uuid.test(sessionId) || !['set', 'complete'].includes(String(value.operation)) || !record(value.body)
    || value.body.expectedUserId !== owner || typeof value.body.requestId !== 'string'
    || value.body.requestId.length < 8 || value.body.requestId.length > 175 || value.body.requestId !== value.body.requestId.trim()) return false
  const field = value.operation === 'set' ? 'report' : 'completion'
  return Object.keys(value.body).length === 3 && record(value.body[field])
}

export function readReviewedPending(store: Store, owner: string, sessionId: string): ReviewedPendingSessionRequest | null {
  const raw = store.getItem(key(owner, sessionId))
  if (raw === null) return null
  const value: unknown = JSON.parse(raw)
  if (!valid(value, owner, sessionId)) throw new Error('The stored session request needs review. It has been preserved.')
  return value
}

export function saveReviewedPending(store: Store, value: ReviewedPendingSessionRequest): ReviewedPendingSessionRequest {
  if (!valid(value, value.userId, value.sessionId)) throw new Error('Invalid pending request')
  const saved = readReviewedPending(store, value.userId, value.sessionId)
  if (saved && JSON.stringify(saved) !== JSON.stringify(value)) throw new Error('Resolve the previous session save before starting another.')
  const raw = JSON.stringify(value)
  store.setItem(key(value.userId, value.sessionId), raw)
  if (store.getItem(key(value.userId, value.sessionId)) !== raw) throw new Error('Could not preserve this request before saving.')
  return JSON.parse(raw) as ReviewedPendingSessionRequest
}

export async function sendReviewedPending(store: Store, value: ReviewedPendingSessionRequest, currentOwner: () => string | null,
  fetcher: typeof fetch = fetch): Promise<void> {
  value = structuredClone(value)
  if (currentOwner() !== value.userId) throw new Error('Restore the original account before retrying this save.')
  const saved = readReviewedPending(store, value.userId, value.sessionId)
  if (!saved || JSON.stringify(saved) !== JSON.stringify(value)) throw new Error('The saved request changed. Refresh before retrying.')
  const response = await fetcher(`/api/coach/reviewed/sessions/${value.sessionId}/${value.operation === 'set' ? 'sets' : 'complete'}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value.body),
  })
  const result: unknown = await response.json()
  if (!response.ok || !record(result) || result.kind !== 'saved' || result.requestId !== value.body.requestId) {
    throw new Error(record(result) && typeof result.error === 'string' ? result.error : 'Save is unconfirmed. Retry the original request.')
  }
  if (value.operation === 'set' ? result.sessionId !== value.sessionId || !record(result.setReport)
      || typeof result.setReport.id !== 'string' || !uuid.test(result.setReport.id)
    : !record(result.result) || result.result.prescribed_session_id !== value.sessionId
      || !record(value.body.completion) || result.result.session_status !== value.body.completion.status) {
    throw new Error('The response does not confirm this saved request. Keep it for recovery.')
  }
  if (currentOwner() !== value.userId) throw new Error('Account changed during save. The original request is preserved.')
  const current = readReviewedPending(store, value.userId, value.sessionId)
  if (JSON.stringify(current) !== JSON.stringify(value)) throw new Error('Pending request changed during save; it has been preserved.')
  store.removeItem(key(value.userId, value.sessionId))
  if (store.getItem(key(value.userId, value.sessionId)) !== null) throw new Error('Save confirmed, but local recovery state could not be cleared. Retry safely.')
}

/** Explicit resolution fences late writers before releasing an unsaved request.
 * Archive the original and the verified decision before clearing pending state.
 * Lost responses or local storage errors leave the exact request recoverable.
 */
export async function resolveReviewedPending(store: Store, value: ReviewedPendingSessionRequest, currentOwner: () => string | null,
  fetcher: typeof fetch = fetch): Promise<ReviewedRequestResolution> {
  value = structuredClone(value)
  const unchanged = () => {
    if (currentOwner() !== value.userId) throw new Error('Restore the original account before resolving this save.')
    if (JSON.stringify(readReviewedPending(store, value.userId, value.sessionId)) !== JSON.stringify(value)) {
      throw new Error('The saved request changed. Refresh before resolving it.')
    }
  }
  unchanged()
  const identity = { userId: value.userId, sessionId: value.sessionId, operation: value.operation, requestId: value.body.requestId,
    payload: value.operation === 'set' ? value.body.report : value.body.completion }
  const response = await fetcher(`/api/coach/reviewed/sessions/${value.sessionId}/resolve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedUserId: value.userId, requestId: identity.requestId, operation: identity.operation, payload: identity.payload }),
  })
  const result: unknown = await response.json()
  const resolution = response.ok && record(result) && result.kind === 'resolved' ? parseReviewedRequestResolution(result.resolution, identity) : null
  if (!resolution) throw new Error('Resolution is unconfirmed. The original request is preserved; resolve it again.')
  unchanged()
  const archiveKey = `reviewed-session-resolution:${value.userId}:${value.operation}:${value.body.requestId}`
  const archive = JSON.stringify({ request: value, resolution }), existing = store.getItem(archiveKey)
  if (existing !== null && stableStringify(JSON.parse(existing)) !== stableStringify(JSON.parse(archive))) {
    throw new Error('A conflicting recovery record exists. The pending request is preserved.')
  }
  store.setItem(archiveKey, archive)
  if (store.getItem(archiveKey) !== archive) throw new Error('Could not preserve the resolution. The pending request is retained.')
  unchanged()
  store.removeItem(key(value.userId, value.sessionId))
  if (store.getItem(key(value.userId, value.sessionId)) !== null) throw new Error('Resolution saved; local pending state remains. Resolve again safely.')
  return resolution
}
