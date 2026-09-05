import { fetchWithTimeout } from './fetch-with-timeout'

const pending = new Map<string, { init: RequestInit; requestId: string; submittedAt: string }>()

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

/** Keep the original payload and time after response loss; scope retries to the athlete. */
export async function sendLoggingRequest(url: string, init: RequestInit, userId: string,
  timeoutMs = 60_000, origin?: string): Promise<Response> {
  let signature: string
  if (init.body instanceof FormData) {
    const file = init.body.get('photo')
    if (!(file instanceof Blob)) throw new Error('A photo is required')
    signature = origin ?? await fileFingerprint(file)
  } else {
    const { timestamp: _timestamp, submittedAt: _submittedAt, requestId: _requestId, ...content } = JSON.parse(String(init.body))
    signature = origin ?? JSON.stringify(content)
  }
  const signatureDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature))
  const signatureHash = Array.from(new Uint8Array(signatureDigest), byte => byte.toString(16).padStart(2,'0')).join('')
  const key = `socius-pending:${userId}:${url}:${signatureHash}`
  let submission = pending.get(key)
  if (!submission) {
    let stored: { requestId: string; submittedAt: string; timestamp?: string; json?: string } | null = null
    try { stored = JSON.parse(sessionStorage.getItem(key) ?? 'null') } catch { /* storage may be unavailable */ }
    const requestId = stored?.requestId ?? crypto.randomUUID()
    const submittedAt = stored?.submittedAt ?? new Date().toISOString()
    let body: BodyInit
    if (init.body instanceof FormData) {
      const form = new FormData()
      init.body.forEach((value, name) => form.append(name, value))
      form.set('requestId', requestId)
      if (userId) form.set('expectedUserId', userId)
      if (stored?.timestamp) form.set('timestamp', stored.timestamp)
      body = form
    } else {
      body = stored?.json ?? JSON.stringify({ ...JSON.parse(String(init.body)), requestId, submittedAt, ...(userId ? { expectedUserId: userId } : {}) })
    }
    submission = { init: { ...init, body }, requestId, submittedAt }
    pending.set(key, submission)
    try { sessionStorage.setItem(key, JSON.stringify({ requestId, submittedAt,
      ...(body instanceof FormData ? { timestamp: body.get('timestamp') } : { json: body })
    })) } catch { /* Current-page retries remain safe without browser storage. */ }
  }
  const response = await fetchWithTimeout(url, submission.init, timeoutMs)
  const result = await response.clone().json().catch(() => null)
  if (response.ok && !result) throw new Error('The response was interrupted. Retry the same request or check history before logging again.')
  if (response.ok || (result?.requestStatus === 'complete' && result?.retryAllowed === true)) {
    pending.delete(key)
    try { sessionStorage.removeItem(key) } catch { /* optional browser storage */ }
  }
  return response
}
