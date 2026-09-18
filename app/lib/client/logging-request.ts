import { createClient } from '../auth/supabase'
import { fetchWithTimeout } from './fetch-with-timeout'
import { hasConfirmedCapture, recommendationOrigin, refreshAfterCanonicalSave } from './recommendations'
import { markCaptureCertainty } from './capture-uncertainty'
import type { CaptureReceipt } from '../capture/contracts'

type StoredSubmission = { requestId: string; submittedAt: string; timestamp?: string; json?: string; signature?: string; form?: Record<string, string>; photoHash?: string; correctionReceipt?: CaptureReceipt }

type PendingSubmission = { init: RequestInit; requestId: string; submittedAt: string; signature: string; correctionReceipt?: CaptureReceipt }
export async function assertCaptureOwner(userId: string): Promise<void> {
  const { data: { user }, error } = await createClient().auth.getUser()
  if (error || user?.id !== userId) throw new Error('The signed-in account changed. Pending work remains with its original account.')
}
const pending = new Map<string, PendingSubmission>()
if (typeof window !== 'undefined') window.addEventListener('capture-request-resolved', event => pending.delete((event as CustomEvent<string>).detail))
const requestKinds: Record<string, string> = {
  '/api/parse-workout': 'workout-text', '/api/meals/parse-text': 'meal-text', '/api/meals/upload': 'photo',
  '/api/meals/quick-log': 'quick-meal', '/api/foods/log': 'reviewed-food', '/api/agent/process': 'agent'
}
export async function fileFingerprint(file: Blob): Promise<string> {
  const bytes = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** One unresolved occurrence per surface and owner. Editing first reconciles its original save. */
async function sendLoggingRequestInternal(url: string, init: RequestInit, userId: string,
  timeoutMs = 60_000, origin?: string): Promise<Response> {
  if (!userId) throw new Error('Sign in before logging. Pending work remains on this device.')
  await assertCaptureOwner(userId)
  let signature: string
  if (init.body instanceof FormData) {
    const file = init.body.get('photo')
    if (!(file instanceof Blob)) throw new Error('A photo is required')
    signature = origin ?? await fileFingerprint(file)
  } else {
    const { timestamp: _timestamp, submittedAt: _submittedAt, requestId: _requestId, ...content } = JSON.parse(String(init.body))
    signature = origin ?? JSON.stringify(content)
  }
  const key = `socius-pending:${userId}:${url}`
  let submission = pending.get(key)
  let stored: StoredSubmission | null = null
  try {
    // Older clients keyed by content. Never silently start a new occurrence over those records.
    const legacyKeys = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index))
      .filter((candidate): candidate is string => !!candidate && candidate.startsWith(`${key}:`))
    if (legacyKeys.length) throw new Error('An earlier entry needs reconciliation before another save. Open pending saves on this device.')
    stored = JSON.parse(sessionStorage.getItem(key) ?? 'null')
  } catch (error) {
    if (error instanceof Error && error.message.includes('earlier entry')) throw error
    if (!submission) throw new Error('Device storage is unavailable. Enable session storage before saving so an interrupted request can be recovered.')
  }
  let correctionReceipt = submission?.correctionReceipt ?? stored?.correctionReceipt
  let correction: { entityId: string; expectedRevision: number; requestId: string } | undefined
  const oldSignature = submission?.signature ?? stored?.signature
  const oldRequestId = submission?.requestId ?? stored?.requestId
  const frozenBody = submission?.init.body
  const frozenCorrection = frozenBody instanceof FormData ? frozenBody.get('correction')
    : stored?.form?.correction ?? JSON.parse(String(typeof frozenBody === 'string' ? frozenBody : stored?.json ?? '{}')).correction
  if (oldRequestId && oldSignature !== signature) {
    const kind = requestKinds[url]
    if (!kind) throw new Error('Reconcile the earlier entry before editing or starting another save.')
    const statusResponse = await fetchWithTimeout(`/api/logging/requests/${encodeURIComponent(`${kind}:${oldRequestId}`)}?expectedUserId=${encodeURIComponent(userId)}`, { method: 'GET' }, 15_000)
    const status = await statusResponse.json().catch(() => null)
    if (!statusResponse.ok || !status) throw new Error('The original save is still unconfirmed. Retry the original entry before editing.')
    if (status.state === 'saved' || status.retryAllowed === true) markCaptureCertainty(userId, key, true)
    const receipts: CaptureReceipt[] = status.receipts ?? []
    if (frozenCorrection && status.state !== 'saved') return new Response(JSON.stringify({
      error: 'The saved entry still exists. Reopen its receipt to correct it, or explicitly choose Log another occurrence.',
      correctionRequired: true, receipts: correctionReceipt ? [correctionReceipt] : receipts, state: 'correction_pending'
    }), { status: 409, headers: { 'Content-Type': 'application/json' } })
    if (status.state === 'saved' && receipts.length === 1 && url !== '/api/agent/process') {
      correctionReceipt = receipts[0]
      correction = { entityId: receipts[0].entityId, expectedRevision: receipts[0].revision, requestId: crypto.randomUUID() }
    } else if (status.retryAllowed !== true) {
      return new Response(JSON.stringify({ error: 'Review the saved and unresolved entries before editing.', correctionRequired: receipts.length > 0, receipts, state: 'save_unconfirmed' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
    }
    pending.delete(key)
    try { sessionStorage.removeItem(key) } catch { /* optional storage */ }
    submission = undefined; stored = null
  }
  if (!submission) {
    const requestId = stored?.requestId ?? crypto.randomUUID()
    const submittedAt = stored?.submittedAt ?? new Date().toISOString()
    let body: BodyInit
    if (init.body instanceof FormData) {
      const form = new FormData()
      const photo = init.body.get('photo') as Blob
      const photoHash = await fileFingerprint(photo)
      if (stored?.photoHash && photoHash !== stored.photoHash) throw new Error('Reselect the original photo to recover this save.')
      if (stored?.form) Object.entries(stored.form).forEach(([name, value]) => form.set(name, value))
      else init.body.forEach((value, name) => { if (typeof value === 'string') form.set(name, value) })
      if (!stored?.form && !form.has('recommendationId')) { const originId = recommendationOrigin(); if (originId) form.set('recommendationId', originId) }
      form.set('photo', photo)
      form.set('requestId', requestId)
      form.set('expectedUserId', userId)
      if (stored?.timestamp) form.set('timestamp', stored.timestamp)
      if (correction) form.set('correction', JSON.stringify(correction))
      body = form
    } else {
      body = stored?.json ?? JSON.stringify({ recommendationId: recommendationOrigin(), ...JSON.parse(String(init.body)), requestId, submittedAt, expectedUserId: userId, ...(correction ? { correction } : {}) })
    }
    submission = { init: { ...init, body }, requestId, submittedAt, signature, correctionReceipt }
    pending.set(key, submission)
    try { sessionStorage.setItem(key, JSON.stringify({ requestId, submittedAt, signature, correctionReceipt,
      ...(body instanceof FormData ? { timestamp: body.get('timestamp'), photoHash: await fileFingerprint(body.get('photo') as Blob),
        form: Object.fromEntries(Array.from(body.entries()).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) } : { json: body }) })) }
    catch { pending.delete(key); throw new Error('Could not preserve this request on the device. Nothing new was submitted.') }
  }
  await assertCaptureOwner(userId)
  markCaptureCertainty(userId, key, false)
  const response = await fetchWithTimeout(url, submission.init, timeoutMs)
  await assertCaptureOwner(userId)
  const result = await response.clone().json().catch(() => null)
  if (response.ok && !result) throw new Error('The response was interrupted. Retry the same request or check history before logging again.')
  if ((response.ok && result?.state !== 'save_unconfirmed' && result?.state !== 'correction_pending' && result?.receiptBundle?.state !== 'save_unconfirmed') || (result?.requestStatus === 'complete' && result?.retryAllowed === true && !frozenCorrection && !correction)) {
    pending.delete(key)
    markCaptureCertainty(userId, key, true)
    try { sessionStorage.removeItem(key) } catch { /* optional browser storage */ }
  }
  if (response.ok) window.dispatchEvent(new Event('capture-updated'))
  if (hasConfirmedCapture(result, response.ok)) refreshAfterCanonicalSave(userId)
  return response
}

/** Corrections freeze the complete payload; changing an uncertain edit requires reading its outcome first. */
export async function sendCaptureCorrection(url: string, method: 'PUT' | 'PATCH' | 'DELETE' | 'POST', body: Record<string, unknown>, userId: string, recoveryKey?: string): Promise<Response> {
  if (!userId) throw new Error('Sign in before correcting an entry.')
  await assertCaptureOwner(userId)
  const key = recoveryKey?.startsWith(`socius-correction:${userId}:${url}:request:`) ? recoveryKey : `socius-correction:${userId}:${url}`
  const signature = JSON.stringify(body)
  let saved: { signature: string; body: string } | null
  try { saved = JSON.parse(sessionStorage.getItem(key) ?? 'null') } catch { throw new Error('Device storage is unavailable; this correction was not submitted.') }
  if (saved && saved.signature !== signature) throw new Error('Retry the unchanged correction first, then reopen the saved entry before making another edit.')
  const frozen = saved?.body ?? JSON.stringify({ ...body, expectedUserId: userId, requestId: crypto.randomUUID() })
  sessionStorage.setItem(key, JSON.stringify({ signature, body: frozen, method }))
  markCaptureCertainty(userId, key, false)
  const response = await fetchWithTimeout(url, { method, headers: { 'Content-Type': 'application/json' }, body: frozen }, 60_000)
  await assertCaptureOwner(userId)
  const result = await response.clone().json().catch(() => null)
  if (response.ok && !result) throw new Error('The correction response was interrupted. Retry the unchanged correction.')
  if ((response.ok && result?.state !== 'save_unconfirmed' && result?.state !== 'correction_pending') || result?.retryAllowed === true) { markCaptureCertainty(userId, key, true); sessionStorage.removeItem(key) }
  if (response.ok) window.dispatchEvent(new Event('capture-updated'))
  if (hasConfirmedCapture(result, response.ok) || (response.ok && (method === 'DELETE' || url.startsWith('/api/coach/sessions/')))) refreshAfterCanonicalSave(userId)
  return response
}

const inFlight = new Set<string>()
export async function sendLoggingRequest(url: string, init: RequestInit, userId: string, timeoutMs = 60_000, origin?: string): Promise<Response> {
  const key = `${userId}:${url}`
  if (inFlight.has(key)) throw new Error('This save is already in progress. Wait for its receipt before retrying.')
  inFlight.add(key)
  try { return await sendLoggingRequestInternal(url, init, userId, timeoutMs, origin) }
  finally { inFlight.delete(key) }
}
