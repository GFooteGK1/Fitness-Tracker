import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServiceRoleClient } from '@/app/lib/auth/supabase-server'
import { storeCycleData, storeRecoveryData, storeSleepData } from '@/app/lib/whoop/sync-service'
import { getOwnerCronAccessToken } from '@/app/lib/whoop/token-service'
import { POST } from '@/app/api/whoop/webhook/route'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/app/lib/whoop/sync-service', () => ({
  storeCycleData: vi.fn(),
  storeRecoveryData: vi.fn(),
  storeSleepData: vi.fn(),
}))
vi.mock('@/app/lib/whoop/token-service', () => ({ getOwnerCronAccessToken: vi.fn() }))
vi.mock('@/app/lib/whoop/timing-owner', () => ({
  isWhoopTimingOwner: (value: unknown) => value === '11111111-1111-4111-8111-111111111111',
}))

const owner = '11111111-1111-4111-8111-111111111111'
const otherOwner = '22222222-2222-4222-8222-222222222222'
const secret = 'synthetic-secret'
const sourceId = 456
const sleepId = '33333333-3333-4333-8333-333333333333'
const event = { user_id: sourceId, id: sleepId, type: 'sleep.updated', trace_id: 'synthetic-trace' }
const sleep = { user_id: sourceId, id: sleepId, cycle_id: 789, score_state: 'SCORED' }
const recovery = { user_id: sourceId, sleep_id: sleepId, cycle_id: 789, score_state: 'SCORED' }
const cycle = {
  user_id: sourceId,
  id: recovery.cycle_id,
  created_at: '2025-11-22T08:00:00Z',
  updated_at: '2025-11-22T08:05:00Z',
  start: '2025-11-22T08:00:00Z',
  end: null,
  timezone_offset: '-06:00',
  score_state: 'SCORED',
  score: { strain: 12.34 },
}
const hostname = 'https://whoop.example.invalid'
const endpoint = 'https://socius.example.invalid/api/whoop/webhook'
const providerFetch = vi.fn<typeof fetch>()

function signedRequest(
  body = JSON.stringify(event),
  options: { timestamp?: string; signingKey?: string; signedBody?: string; endpoint?: string } = {},
) {
  const timestamp = options.timestamp ?? String(Date.now())
  const signature = createHmac('sha256', options.signingKey ?? secret)
    .update(timestamp).update(options.signedBody ?? body).digest('base64')
  return new Request(options.endpoint ?? endpoint, {
    method: 'POST',
    headers: {
      'X-WHOOP-Signature': signature,
      'X-WHOOP-Signature-Timestamp': timestamp,
    },
    body,
  })
}

function serviceClient() {
  const client = {} as ReturnType<typeof createServiceRoleClient>
  vi.mocked(createServiceRoleClient).mockReturnValue(client)
  return client
}

function signedRecoveryRequest() {
  return signedRequest(JSON.stringify({ ...event, type: 'recovery.updated' }))
}

function mockRecoveryReads() {
  return providerFetch.mockResolvedValueOnce(Response.json(sleep)).mockResolvedValueOnce(Response.json(recovery))
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('WHOOP_WEBHOOK_USER_ID', String(sourceId))
  vi.stubEnv('WHOOP_WEBHOOK_OWNER_ID', owner)
  vi.stubEnv('WHOOP_CLIENT_SECRET', secret)
  vi.stubEnv('WHOOP_API_HOSTNAME', hostname)
  vi.stubGlobal('fetch', providerFetch)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(getOwnerCronAccessToken).mockResolvedValue('synthetic-token')
  vi.mocked(storeSleepData).mockResolvedValue(1)
  vi.mocked(storeRecoveryData).mockResolvedValue(1)
  vi.mocked(storeCycleData).mockResolvedValue(1)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('WHOOP owner webhook', () => {
  it.each(['WHOOP_WEBHOOK_USER_ID', 'WHOOP_WEBHOOK_OWNER_ID'])('defaults to disabled when %s is absent', async key => {
    vi.stubEnv(key, undefined)
    expect((await POST(signedRequest())).status).toBe(404)
    expect(createServiceRoleClient).not.toHaveBeenCalled()
  })

  it('keeps the webhook scoped to the fixed owner even under misconfiguration', async () => {
    vi.stubEnv('WHOOP_WEBHOOK_OWNER_ID', otherOwner)
    expect((await POST(signedRequest())).status).toBe(503)
    expect(createServiceRoleClient).not.toHaveBeenCalled()
    expect(getOwnerCronAccessToken).not.toHaveBeenCalled()
  })

  it.each(['+456', '1e3', '9007199254740992'])('rejects invalid configured source ID %s', async id => {
    vi.stubEnv('WHOOP_WEBHOOK_USER_ID', id)
    expect((await POST(signedRequest())).status).toBe(503)
    expect(createServiceRoleClient).not.toHaveBeenCalled()
  })

  it('fails safely when the signature secret is missing', async () => {
    vi.stubEnv('WHOOP_CLIENT_SECRET', undefined)
    expect((await POST(signedRequest())).status).toBe(503)
    expect(createServiceRoleClient).not.toHaveBeenCalled()
  })

  it('rejects missing signatures, incorrect signatures and tampered raw bytes before privileged work', async () => {
    const unsigned = new Request(endpoint, { method: 'POST', body: JSON.stringify(event) })
    const wrong = signedRequest(JSON.stringify(event), { signingKey: 'wrong' })
    const tampered = signedRequest(JSON.stringify(event), { signedBody: JSON.stringify(event, null, 2) })
    for (const request of [unsigned, wrong, tampered]) {
      const response = await POST(request)
      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.text()).toBe('')
    }
    expect(createServiceRoleClient).not.toHaveBeenCalled()
    expect(providerFetch).not.toHaveBeenCalled()
  })

  it.each([-76, 6])('rejects a signed timestamp outside the retry window (%d minutes)', async offset => {
    const timestamp = String(Date.now() + offset * 60_000)
    expect((await POST(signedRequest(JSON.stringify(event), { timestamp }))).status).toBe(401)
    expect(createServiceRoleClient).not.toHaveBeenCalled()
  })

  it('enforces the raw-body limit with and without Content-Length', async () => {
    const advertised = signedRequest()
    advertised.headers.set('content-length', '4097')
    const oversized = signedRequest('x'.repeat(4097))
    expect((await POST(advertised)).status).toBe(413)
    expect((await POST(oversized)).status).toBe(413)
    expect(createServiceRoleClient).not.toHaveBeenCalled()
  })

  it.each(['{', JSON.stringify({ ...event, id: 33 }), JSON.stringify({ ...event, user_id: '456' }),
    JSON.stringify({ ...event, trace_id: '' })])('rejects malformed signed v2 events', async body => {
    expect((await POST(signedRequest(body))).status).toBe(400)
    expect(createServiceRoleClient).not.toHaveBeenCalled()
  })

  it.each([
    { ...event, user_id: 891 },
    { ...event, type: 'sleep.deleted' },
    { ...event, type: 'recovery.deleted' },
    { ...event, type: 'workout.updated' },
  ])('acknowledges events outside the configured update scope', async input => {
    expect((await POST(signedRequest(JSON.stringify(input)))).status).toBe(204)
    expect(createServiceRoleClient).not.toHaveBeenCalled()
    expect(providerFetch).not.toHaveBeenCalled()
  })

  it('reads canonical sleep for the fixed connected owner and persists only that metric', async () => {
    const client = serviceClient()
    providerFetch.mockResolvedValueOnce(Response.json(sleep))
    const signedBody = JSON.stringify({ ...event, ignored: 'café', owner: otherOwner }, null, 2)
    const request = signedRequest(signedBody, {
      timestamp: String(Date.now() - 65 * 60_000),
      endpoint: `${endpoint}?user_id=${otherOwner}`,
    })
    request.headers.set('x-owner-id', otherOwner)

    expect((await POST(request)).status).toBe(204)
    expect(createServiceRoleClient).toHaveBeenCalledExactlyOnceWith()
    expect(getOwnerCronAccessToken).toHaveBeenCalledExactlyOnceWith(owner, client)
    expect(providerFetch).toHaveBeenCalledExactlyOnceWith(new URL(`/developer/v2/activity/sleep/${sleepId}`, hostname), {
      headers: { Authorization: 'Bearer synthetic-token' },
      cache: 'no-store',
      redirect: 'error',
      signal: expect.any(AbortSignal),
    })
    expect(storeSleepData).toHaveBeenCalledExactlyOnceWith(owner, [sleep], client, true)
    expect(storeRecoveryData).not.toHaveBeenCalled()
    expect(storeCycleData).not.toHaveBeenCalled()
  })

  it('persists v2 recovery then fetches and persists strain for the same cycle', async () => {
    const client = serviceClient()
    mockRecoveryReads().mockResolvedValueOnce(Response.json(cycle))
    const response = await POST(signedRecoveryRequest())

    expect(response.status).toBe(204)
    expect(providerFetch.mock.calls.map(([url]) => String(url))).toEqual([
      `${hostname}/developer/v2/activity/sleep/${sleepId}`,
      `${hostname}/developer/v2/cycle/789/recovery`,
      `${hostname}/developer/v2/cycle/789`,
    ])
    expect(providerFetch.mock.calls[0][1]?.signal).toBe(providerFetch.mock.calls[1][1]?.signal)
    expect(providerFetch).toHaveBeenNthCalledWith(3, new URL('/developer/v2/cycle/789', hostname), {
      headers: { Authorization: 'Bearer synthetic-token' },
      cache: 'no-store',
      redirect: 'error',
      signal: expect.any(AbortSignal),
    })
    expect(providerFetch.mock.calls[2][1]?.signal).toBe(providerFetch.mock.calls[0][1]?.signal)
    expect(storeRecoveryData).toHaveBeenCalledExactlyOnceWith(owner, [recovery], client, true)
    expect(vi.mocked(storeRecoveryData).mock.invocationCallOrder[0])
      .toBeLessThan(providerFetch.mock.invocationCallOrder[2])
    expect(storeCycleData).toHaveBeenCalledExactlyOnceWith(owner, [cycle], client, true)
    expect(storeSleepData).not.toHaveBeenCalled()
  })

  it('does not request strain if the recovery write fails', async () => {
    const client = serviceClient()
    mockRecoveryReads()
    vi.mocked(storeRecoveryData).mockRejectedValueOnce(new Error('synthetic recovery write failure'))

    expect((await POST(signedRecoveryRequest())).status).toBe(503)
    expect(storeRecoveryData).toHaveBeenCalledExactlyOnceWith(owner, [recovery], client, true)
    expect(providerFetch).toHaveBeenCalledTimes(2)
    expect(storeCycleData).not.toHaveBeenCalled()
  })

  it.each([
    { ...cycle, user_id: 891 },
    { ...cycle, id: 790 },
    { ...cycle, score_state: 'UNKNOWN' },
    { ...cycle, score_state: 'PENDING_SCORE', score: undefined },
    { ...cycle, score_state: 'UNSCORABLE' },
  ])('requests retry after storing recovery when the cycle cannot supply verified strain', async record => {
    const client = serviceClient()
    mockRecoveryReads().mockResolvedValueOnce(Response.json(record))

    expect((await POST(signedRecoveryRequest())).status).toBe(503)
    expect(storeRecoveryData).toHaveBeenCalledExactlyOnceWith(owner, [recovery], client, true)
    expect(storeCycleData).not.toHaveBeenCalled()
  })

  it('acknowledges an unscorable cycle without replacing strain', async () => {
    const client = serviceClient()
    const unscorable = { ...cycle, score_state: 'UNSCORABLE', score: undefined }
    mockRecoveryReads().mockResolvedValueOnce(Response.json(unscorable))

    expect((await POST(signedRecoveryRequest())).status).toBe(204)
    expect(storeRecoveryData).toHaveBeenCalledExactlyOnceWith(owner, [recovery], client, true)
    expect(storeCycleData).not.toHaveBeenCalled()
  })

  it('requests retry when the cycle fetch fails after recovery is stored', async () => {
    const client = serviceClient()
    mockRecoveryReads().mockResolvedValueOnce(new Response(null, { status: 429 }))

    expect((await POST(signedRecoveryRequest())).status).toBe(503)
    expect(storeRecoveryData).toHaveBeenCalledExactlyOnceWith(owner, [recovery], client, true)
    expect(storeCycleData).not.toHaveBeenCalled()
  })

  it('allows delivery retry after the strict strain writer rejects a cycle', async () => {
    const client = serviceClient()
    mockRecoveryReads().mockResolvedValueOnce(Response.json(cycle))
    mockRecoveryReads().mockResolvedValueOnce(Response.json(cycle))
    vi.mocked(storeCycleData).mockRejectedValueOnce(new Error('synthetic cycle write failure'))
    const request = signedRecoveryRequest()
    const retry = request.clone()

    expect((await POST(request)).status).toBe(503)
    expect((await POST(retry)).status).toBe(204)
    expect(storeRecoveryData).toHaveBeenCalledTimes(2)
    expect(storeCycleData).toHaveBeenCalledTimes(2)
    expect(storeCycleData).toHaveBeenLastCalledWith(owner, [cycle], client, true)
  })

  it.each([
    { ...sleep, id: otherOwner },
    { ...sleep, user_id: 891 },
    { ...sleep, cycle_id: '789' },
  ])('requires the exact authorized sleep from the provider', async record => {
    serviceClient()
    providerFetch.mockResolvedValueOnce(Response.json(record))
    expect((await POST(signedRequest())).status).toBe(503)
    expect(storeSleepData).not.toHaveBeenCalled()
  })

  it.each([
    { ...recovery, user_id: 891 },
    { ...recovery, cycle_id: 790 },
    { ...recovery, sleep_id: otherOwner },
  ])('requires a recovery response consistent with the event and resolved sleep', async record => {
    serviceClient()
    providerFetch.mockResolvedValueOnce(Response.json(sleep)).mockResolvedValueOnce(Response.json(record))
    expect((await POST(signedRecoveryRequest())).status).toBe(503)
    expect(storeRecoveryData).not.toHaveBeenCalled()
    expect(storeCycleData).not.toHaveBeenCalled()
    expect(providerFetch).toHaveBeenCalledTimes(2)
  })

  it.each([404, 429, 500])('requests retry for an unavailable provider record (%d)', async status => {
    serviceClient()
    providerFetch.mockResolvedValueOnce(new Response(null, { status }))
    expect((await POST(signedRequest())).status).toBe(503)
    expect(storeSleepData).not.toHaveBeenCalled()
  })

  it('requests retry on an unavailable or revoked token without exposing its error', async () => {
    const client = serviceClient()
    vi.mocked(getOwnerCronAccessToken).mockRejectedValueOnce(new Error('synthetic sensitive response'))
    const response = await POST(signedRequest())
    expect(response.status).toBe(503)
    expect(await response.text()).toBe('')
    expect(getOwnerCronAccessToken).toHaveBeenCalledExactlyOnceWith(owner, client)
    expect(providerFetch).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[WHOOP Webhook] Owner update could not be processed')
  })

  it('acknowledges a retry only after the canonical record has been stored', async () => {
    const client = serviceClient()
    providerFetch.mockImplementation(async () => Response.json(sleep))
    vi.mocked(storeSleepData).mockRejectedValueOnce(new Error('synthetic write failure'))
    const request = signedRequest()
    const retry = request.clone()
    expect((await POST(request)).status).toBe(503)
    expect((await POST(retry)).status).toBe(204)
    expect(storeSleepData).toHaveBeenCalledTimes(2)
    expect(storeSleepData).toHaveBeenNthCalledWith(1, owner, [sleep], client, true)
    expect(storeSleepData).toHaveBeenNthCalledWith(2, owner, [sleep], client, true)
  })
})
