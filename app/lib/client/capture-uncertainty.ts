type ReadableStorage = Pick<Storage, 'length' | 'key' | 'getItem'>
const markerPrefix = (owner: string) => `socius-capture-certainty:${owner}:`
function markerState(raw: string | null): string | undefined {
  if (raw === 'confirmed' || raw === 'uncertain') return raw
  try { return raw ? JSON.parse(raw).state : undefined } catch { return 'uncertain' }
}
function requestIdentity(raw: string | null): string | undefined {
  try {
    const entry = JSON.parse(raw ?? 'null')
    return entry?.requestId ?? (entry?.body ? JSON.parse(entry.body).requestId : undefined)
  } catch { return undefined }
}
function baseIdentity(owner: string, identity: string): string {
  for (const kind of ['pending', 'correction']) {
    const prefix = `socius-${kind}:${owner}:`
    if (identity.startsWith(prefix)) return prefix + identity.slice(prefix.length).split(':')[0]
  }
  return identity
}
function markerKey(owner: string, identity: string, requestId?: string) {
  return `${markerPrefix(owner)}${baseIdentity(owner, identity)}${requestId ? `:request:${requestId}` : ''}`
}
export function mayPublishRecommendation(input: { captureNeedsReconciliation: boolean; serverStatus: string }): boolean {
  return !input.captureNeedsReconciliation && input.serverStatus === 'ready'
}
/** Replay identity and proof of completion are separate: a retained saved receipt is not uncertain. */
export function hasUnreconciledCapture(owner: string, pendingStorage?: ReadableStorage, markerStorage?: ReadableStorage): boolean {
  if (typeof window === 'undefined' && !pendingStorage) return false
  try {
    const pending = pendingStorage ?? sessionStorage
    const markers = markerStorage ?? localStorage
    const prefix = markerPrefix(owner)
    const keys = Array.from({ length: pending.length }, (_, index) => pending.key(index)).filter((key): key is string => !!key)
    if (keys.some(key => (key.startsWith(`socius-pending:${owner}:`) || key.startsWith(`socius-correction:${owner}:`))
      && markerState(markers.getItem(markerKey(owner, key, requestIdentity(pending.getItem(key))))) !== 'confirmed')) return true
    return Array.from({ length: markers.length }, (_, index) => markers.key(index)).some(key => key?.startsWith(prefix) && markerState(markers.getItem(key)) === 'uncertain')
  } catch { return true }
}
export function markCaptureCertainty(owner: string, identity: string, confirmed: boolean): void {
  if (typeof window === 'undefined') return
  try {
    let recovery: { storageKey: string; value: string } | undefined
    const raw = sessionStorage.getItem(identity)
    const requestId = requestIdentity(raw)
    if (!confirmed && raw) {
      const parsed = JSON.parse(raw)
      // Canonical children are replayable from the owned request ledger. No photo bytes
      // or raw text are needed to recover a create. Corrections retain their frozen values.
      recovery = { storageKey: baseIdentity(owner, identity), value: identity.startsWith(`socius-pending:${owner}:`)
        ? JSON.stringify({ requestId: parsed.requestId, correctionReceipt: parsed.correctionReceipt }) : raw }
    }
    if (confirmed && identity.startsWith('photo:')) localStorage.removeItem(markerKey(owner, identity))
    else localStorage.setItem(markerKey(owner, identity, requestId), JSON.stringify({ state: confirmed ? 'confirmed' : 'uncertain', requestId, recovery }))
  } catch { /* Readers fail closed when device storage is unavailable. */ }
  window.dispatchEvent(new CustomEvent('capture-certainty-changed', { detail: { owner } }))
}
/** Reopen an owned request after closing its original tab; retain the same identity. */
export function recoverPendingCaptures(owner: string): void {
  try {
    const prefix = markerPrefix(owner)
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith(prefix)) continue
      let record: any
      try { record = JSON.parse(localStorage.getItem(key) ?? 'null') } catch { continue }
      const recovery = record?.recovery
      if (record?.state !== 'uncertain' || !recovery || typeof recovery.value !== 'string') continue
      if (!recovery.storageKey.startsWith(`socius-pending:${owner}:`) && !recovery.storageKey.startsWith(`socius-correction:${owner}:`)) continue
      const existing = sessionStorage.getItem(recovery.storageKey)
      if (!existing) sessionStorage.setItem(recovery.storageKey, recovery.value)
      else if (requestIdentity(existing) !== record.requestId && record.requestId) {
        const alternate = `${recovery.storageKey}:request:${record.requestId}`
        if (!sessionStorage.getItem(alternate)) sessionStorage.setItem(alternate, recovery.value)
      }
    }
  } catch { /* Keep the uncertainty visible when durable proof is unreadable. */ }
}
