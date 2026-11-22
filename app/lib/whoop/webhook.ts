import { createHmac, timingSafeEqual } from 'node:crypto'

const maxBodyBytes = 4096
const maximumPastAgeMs = 75 * 60 * 1000
const maximumFutureAgeMs = 5 * 60 * 1000
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

type WhoopRecord = Record<string, unknown>

type WhoopWebhookEvent = {
  user_id: number
  id: string
  type: string
}

function isRecord(value: unknown): value is WhoopRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isProviderId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function whoopWebhookUserId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return isProviderId(id) ? id : null
}

export async function readWhoopWebhookBody(request: Request): Promise<Buffer | null> {
  if (Number(request.headers.get('content-length')) > maxBodyBytes) return null
  const reader = request.body?.getReader()
  if (!reader) return Buffer.alloc(0)

  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return Buffer.concat(chunks, total)
      total += value.byteLength
      if (total > maxBodyBytes) {
        // The request is rejected regardless of whether the sender closes cleanly.
        void reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
}

/** WHOOP signs the timestamp header followed by the exact request bytes. */
export function verifyWhoopWebhook(headers: Headers, body: Buffer, secret: string): boolean {
  const timestamp = headers.get('x-whoop-signature-timestamp')
  const signature = headers.get('x-whoop-signature')
  if (!timestamp || !/^\d{13}$/.test(timestamp) || !signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) {
    return false
  }
  const age = Date.now() - Number(timestamp)
  if (age > maximumPastAgeMs || age < -maximumFutureAgeMs) return false

  const expected = createHmac('sha256', secret).update(timestamp).update(body).digest()
  const received = Buffer.from(signature, 'base64')
  return received.toString('base64') === signature && timingSafeEqual(expected, received)
}

export function parseWhoopWebhook(body: Buffer): WhoopWebhookEvent | null {
  try {
    const event: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
    if (!isRecord(event) || !isProviderId(event.user_id) || typeof event.id !== 'string' || !uuid.test(event.id)
      || typeof event.type !== 'string' || !event.type || typeof event.trace_id !== 'string' || !event.trace_id) {
      return null
    }
    return { user_id: event.user_id, id: event.id, type: event.type }
  } catch {
    return null
  }
}

/** A verified event points to a record. WHOOP's OAuth API supplies its current contents. */
export async function readWhoopWebhookRecord(
  event: WhoopWebhookEvent & { type: 'sleep.updated' | 'recovery.updated' },
  accessToken: string,
  signal: AbortSignal,
): Promise<WhoopRecord> {
  const sleep = await fetchRecord(`/developer/v2/activity/sleep/${event.id}`, accessToken, signal)
  if (typeof sleep.id !== 'string' || sleep.id.toLowerCase() !== event.id.toLowerCase()
    || sleep.user_id !== event.user_id || !isProviderId(sleep.cycle_id)) {
    throw new Error('WHOOP sleep identity mismatch')
  }
  if (event.type === 'sleep.updated') return sleep

  // v2 recovery notifications identify the related sleep, while the read API needs its cycle.
  const recovery = await fetchRecord(`/developer/v2/cycle/${sleep.cycle_id}/recovery`, accessToken, signal)
  if (recovery.cycle_id !== sleep.cycle_id || typeof recovery.sleep_id !== 'string'
    || recovery.sleep_id.toLowerCase() !== sleep.id.toLowerCase() || recovery.user_id !== event.user_id) {
    throw new Error('WHOOP recovery identity mismatch')
  }
  return recovery
}

export async function readWhoopWebhookCycle(
  cycleId: unknown,
  providerUserId: number,
  accessToken: string,
  signal: AbortSignal,
): Promise<WhoopRecord | null> {
  if (!isProviderId(cycleId)) throw new Error('Invalid WHOOP cycle ID')

  const cycle = await fetchRecord(`/developer/v2/cycle/${cycleId}`, accessToken, signal)
  if (cycle.id !== cycleId || cycle.user_id !== providerUserId) {
    throw new Error('WHOOP cycle identity mismatch')
  }
  if (cycle.score_state === 'UNSCORABLE' && cycle.score == null) return null
  if (cycle.score_state !== 'SCORED') throw new Error('WHOOP cycle score unavailable')
  return cycle
}

async function fetchRecord(path: string, accessToken: string, signal: AbortSignal): Promise<WhoopRecord> {
  const hostname = process.env.WHOOP_API_HOSTNAME || 'https://api.prod.whoop.com'
  const response = await fetch(new URL(path, hostname), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    redirect: 'error',
    signal,
  })
  if (!response.ok) throw new Error('WHOOP record unavailable')
  const record: unknown = await response.json()
  if (!isRecord(record)) throw new Error('Invalid WHOOP record')
  return record
}
