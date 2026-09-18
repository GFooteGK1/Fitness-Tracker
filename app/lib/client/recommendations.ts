import { createClient } from '../auth/supabase'
import { getLocalDate, getTimezoneOffset } from '../timezone-utils'
import { fetchWithTimeout } from './fetch-with-timeout'
import type { RecommendationSnapshot } from '../recommendations/contracts'

export type RecommendationView = Pick<RecommendationSnapshot, 'recommendations' | 'outcomes' | 'coverage'> & {
  status: 'ready' | 'pending' | 'disabled' | 'unavailable'
  refreshState: RecommendationSnapshot['refreshState'] | null
}
export const recommendationScopeKey = () => `${getLocalDate()}:${getTimezoneOffset()}`
export function recommendationOrigin(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const value = new URLSearchParams(window.location.search).get('recommendationId')
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : undefined
}
async function checkOwner(owner: string) {
  const { data: { user }, error } = await createClient().auth.getUser()
  if (error || user?.id !== owner) throw new Error('The signed-in account changed.')
}
const refreshes = new Map<string, Promise<RecommendationView>>()
const trailingRefreshes = new Map<string, Promise<RecommendationView>>()
const revisions = new Map<string, number>()
export class RecommendationRefreshSuperseded extends Error {}
export function refreshRecommendations(owner: string, afterSave = false): Promise<RecommendationView> {
  const scope = recommendationScopeKey()
  const key = `${owner}:${scope}`
  const existing = refreshes.get(key)
  if (afterSave) revisions.set(key, (revisions.get(key) ?? 0) + 1)
  const trailing = trailingRefreshes.get(key)
  if (trailing) return trailing
  if (existing && !afterSave) return existing
  if (existing) {
    const next = existing.catch(() => undefined).then(() => {
      trailingRefreshes.delete(key)
      return refreshRecommendations(owner)
    })
    trailingRefreshes.set(key, next)
    return next
  }
  const revision = revisions.get(key) ?? 0
  const request = (async () => {
    await checkOwner(owner)
    const response = await fetchWithTimeout(`/api/recommendations/refresh?tzOffset=${getTimezoneOffset()}&expectedUserId=${encodeURIComponent(owner)}`, { method: 'POST', cache: 'no-store' }, 20_000)
    const view = await response.json()
    await checkOwner(owner)
    if (scope !== recommendationScopeKey()) throw new Error('Your local day changed. Refresh your next action.')
    if (revision !== (revisions.get(key) ?? 0)) throw new RecommendationRefreshSuperseded('Your records changed during this check.')
    if (!response.ok) throw new Error(view.error ?? 'Your next action is unavailable.')
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('recommendations-updated', { detail: { owner, scope, view } }))
    return view as RecommendationView
  })().finally(() => { if (refreshes.get(key) === request) refreshes.delete(key) })
  refreshes.set(key, request)
  return request
}
/** Independent of save success: failures cannot turn a confirmed capture into a failed save. */
export function refreshAfterCanonicalSave(owner: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('recommendations-pending', { detail: { owner } }))
  void refreshRecommendations(owner, true).catch(error => {
    if (error instanceof RecommendationRefreshSuperseded) return
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('recommendations-unavailable', { detail: { owner } }))
  })
}
export function hasConfirmedCapture(result: any, allowLegacy = true): boolean {
  const receipts = [result?.receipt, ...(result?.receipts ?? []), ...(result?.receiptBundle?.receipts ?? [])]
  return receipts.some(receipt => receipt?.state === 'saved' && receipt.entityId)
    || Boolean(allowLegacy && (result?.mealId || result?.workoutId || result?.workout_id || result?.workout?.id || result?.meal?.id))
}
/** Frozen event survives a lost response/reload. A different response waits for reconciliation. */
export async function sendRecommendationEvent(owner: string, id: string, kind: 'shown' | 'response' | 'coverage', payload: Record<string, unknown>) {
  await checkOwner(owner)
  const key = `socius-recommendation:${owner}:${kind}:${id}`
  const signature = JSON.stringify(payload)
  const stored = JSON.parse(sessionStorage.getItem(key) ?? 'null') as { signature: string; body: string } | null
  if (stored && stored.signature !== signature) throw new Error('Retry the unchanged response before choosing another response.')
  const body = stored?.body ?? JSON.stringify({ ...payload, requestId: crypto.randomUUID(), expectedUserId: owner, tzOffset: getTimezoneOffset() })
  sessionStorage.setItem(key, JSON.stringify({ signature, body }))
  const url = kind === 'coverage' ? '/api/recommendations/coverage' : `/api/recommendations/${id}/${kind}`
  const response = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, 20_000)
  const data = await response.json()
  await checkOwner(owner)
  if (!response.ok) {
    if (data.noWriteConfirmed === true && data.refreshRequired === true) { sessionStorage.removeItem(key); throw new RecommendationNeedsReview(data.error ?? 'Your records changed. Review the current action before responding again.') }
    throw new Error(data.error ?? 'The response is unconfirmed. Retry the same response.')
  }
  if (kind !== 'shown') sessionStorage.removeItem(key)
  return data
}
export class RecommendationNeedsReview extends Error {}
export function pendingRecommendationEvents(owner: string): Array<{ id: string; kind: 'response' | 'coverage'; payload: Record<string, unknown> }> {
  try {
    const prefix = `socius-recommendation:${owner}:`
    return Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index)).flatMap(key => {
      if (!key?.startsWith(prefix)) return []
      const [kind, ...parts] = key.slice(prefix.length).split(':')
      if (kind !== 'response' && kind !== 'coverage') return []
      const stored = JSON.parse(sessionStorage.getItem(key) ?? 'null')
      return stored ? [{ id: parts.join(':'), kind, payload: JSON.parse(stored.signature) }] : []
    })
  } catch { return [] }
}

export function pendingRecommendationEvent(owner: string, id: string, kind: 'response' | 'coverage'): Record<string, unknown> | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(`socius-recommendation:${owner}:${kind}:${id}`) ?? 'null')
    return stored ? JSON.parse(stored.signature) : null
  } catch { return null }
}
