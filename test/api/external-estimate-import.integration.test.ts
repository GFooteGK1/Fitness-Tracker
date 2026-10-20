import { randomUUID, createHash } from 'node:crypto'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { photoDraftDatabase, photoDraftActor } from '../helpers/photo-draft-database'
import { sqlFile } from '../database/fixture'
import { POST, GET } from '@/app/api/capture/external-estimates/route'
import { createServiceRoleClient } from '@/app/lib/auth/supabase-server'
import { EXTERNAL_ESTIMATE_MAX_BYTES, EXTERNAL_ESTIMATE_RECEIPT_MAX_BYTES, externalEstimateFingerprint, validateExternalEstimate } from '@/app/lib/nutrition/external-estimate'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServiceRoleClient: vi.fn() }))
let db: PGlite, owner: string, other: string, token: string, device: string
const hash = (v: string) => createHash('sha256').update(v).digest('hex')
function transport() {
  return { rpc: async (name: string, args: Record<string, unknown>) => {
    if (name !== 'external_estimate_request') throw Error('Unexpected RPC')
    try {
      await db.exec('SET ROLE service_role')
      const values = ['p_hash', 'p_action', 'p_id', 'p_payload', 'p_fingerprint'].map(k => args[k] ?? null)
      const result = await db.query<{ result: unknown }>('SELECT public.external_estimate_request($1,$2,$3,$4,$5) result', values)
      return { data: result.rows[0].result, error: null }
    } catch (error) { return { data: null, error: { code: (error as { code: string }).code } } }
  } }
}
function fixture(id = randomUUID()) {
  return { schemaVersion: 1, capture: { requestId: id, capturedAt: new Date().toISOString(), contentHash: hash(id) },
    estimate: { items: [{ food: 'Synthetic fixture', portion: '1 unit', protein: 12.125, carbs: 30, fat: 2, calories: 180 }],
      totals: { protein: 12.125, carbs: 30, fat: 2, calories: 180 }, estimatedAt: new Date().toISOString(), model: 'unverified synthetic label' } }
}
function request(payload = fixture(), bearer = token, raw?: string) {
  return new Request('https://localhost/api/capture/external-estimates', { method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify({ schemaVersion: payload.schemaVersion, capture: payload.capture, estimateJSON: JSON.stringify(payload.estimate) }) })
}
function status(id: string, bearer = token) { return GET(new Request(`https://localhost/api/capture/external-estimates?requestId=${id}`, { headers: { Authorization: `Bearer ${bearer}` } })) }
async function count(table: string) {
  if (!['meals', 'activity_drafts', 'external_estimate_requests'].includes(table)) throw Error('Unexpected test table')
  await db.exec('RESET ROLE')
  return (await db.query<{ n: number }>(`SELECT count(*)::int n FROM ${table} WHERE user_id=$1`, [owner])).rows[0].n
}
async function provision(user: string) {
  // Synthetic fixture only: no production issuer exists in this slice.
  const id = randomUUID(), bearer = `external-estimate-v1.${id}.${'1'.repeat(64)}`
  await db.exec('RESET ROLE')
  await db.query("INSERT INTO external_estimate_devices(id,user_id,token_hash,scope,admitted_at,expires_at) VALUES($1,$2,$3,'external-estimate-v1',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 day')", [id, user, hash(bearer)])
  return { id, bearer }
}
beforeAll(async () => {
  db = await photoDraftDatabase()
  await db.exec(sqlFile('docs/migrations/external-estimate-import.sql'))
  await db.exec(sqlFile('docs/migrations/external-estimate-import.sql'))
}, 30000)
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubEnv('EXTERNAL_ESTIMATE_IMPORT_ENABLED', 'true')
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('No network permitted') }))
  owner = randomUUID(); other = randomUUID()
  await db.exec('RESET ROLE'); await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [owner, other])
  const grant = await provision(owner); token = grant.bearer; device = grant.id
  vi.mocked(createServiceRoleClient).mockReturnValue(transport() as never)
})
afterAll(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await db?.close() })

describe('inactive external estimate HTTP -> real PostgreSQL boundary', () => {
  it('atomically saves one unreviewed estimate draft and returns readable original evidence, never a meal', async () => {
    const payload = fixture(), first = await POST(request(payload)), receipt = await first.json()
    expect(first.status).toBe(200)
    expect(receipt).toMatchObject({ requestId: payload.capture.requestId, state: 'estimated_unreviewed', consumption: 'unknown', canonicalChanged: false,
      eventTimeMeaning: 'photo_capture_only', sourceModelVerified: false, record: { needs_review: true, total_protein: 12.125 },
      provenance: { occurrence: { origin: 'model_estimated', reviewState: 'unreviewed' }, fields: { macros: { origin: 'model_estimated', reviewState: 'unreviewed' } } } })
    expect(await count('activity_drafts')).toBe(1); expect(await count('external_estimate_requests')).toBe(1); expect(await count('meals')).toBe(0)
    expect(await (await POST(request(payload))).json()).toEqual(receipt)
    expect(await (await status(payload.capture.requestId)).json()).toEqual(receipt)
    expect(first.headers.get('Cache-Control')).toContain('no-store')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('replays equivalent JSON formatting and rejects changed estimate, hash, time and identity replacements', async () => {
    const payload = fixture(), receipt = await (await POST(request(payload))).json()
    const reordered = { ...payload, estimate: { model: payload.estimate.model, estimatedAt: payload.estimate.estimatedAt, totals: payload.estimate.totals, items: payload.estimate.items } }
    expect(await (await POST(request(reordered))).json()).toEqual(receipt)
    const changed = [structuredClone(payload), structuredClone(payload), structuredClone(payload)]
    changed[0].estimate.model = 'changed'; changed[1].capture.contentHash = 'f'.repeat(64); changed[2].capture.capturedAt = new Date(Date.parse(payload.capture.capturedAt) - 1000).toISOString()
    for (const value of changed) expect((await POST(request(value))).status).toBe(409)
    expect((await POST(request({ ...payload, capture: { ...payload.capture, requestId: randomUUID() } }))).status).toBe(409)
    expect(await (await status(payload.capture.requestId)).json()).toEqual(receipt)
    expect(await count('activity_drafts')).toBe(1)
  })
  it('round-trips maximum item/text/macro bounds with worst-case JSON escaping through SQL and readback', async () => {
    const payload = fixture()
    payload.estimate.items = Array.from({ length: 20 }, () => ({ food: '\u0001'.repeat(256), portion: '\u0001'.repeat(128), protein: 50, carbs: 100, fat: 50, calories: 1000 }))
    payload.estimate.totals = { protein: 1000, carbs: 2000, fat: 1000, calories: 20000 }
    payload.estimate.model = '\u0001'.repeat(128)
    const submission = request(payload)
    expect(Buffer.byteLength(await submission.clone().text())).toBeLessThanOrEqual(EXTERNAL_ESTIMATE_MAX_BYTES)
    const imported = await POST(submission), text = await imported.text(), receipt = JSON.parse(text)
    expect(imported.status).toBe(200)
    expect(Buffer.byteLength(text)).toBeGreaterThan(32 * 1024)
    expect(Buffer.byteLength(text)).toBeLessThan(EXTERNAL_ESTIMATE_RECEIPT_MAX_BYTES)
    expect(receipt.originalEstimate).toEqual(payload.estimate)
    expect(receipt.record.items).toEqual(payload.estimate.items)
    const readback = await status(payload.capture.requestId)
    expect(readback.status).toBe(200); expect(await readback.json()).toEqual(receipt)
    expect(await count('activity_drafts')).toBe(1); expect(await count('external_estimate_requests')).toBe(1); expect(await count('meals')).toBe(0)
  })
  it('bounds serialized import and readback receipts at the same native contract', async () => {
    const payload = fixture()
    const receipt = { requestId: payload.capture.requestId, state: 'estimated_unreviewed', canonicalChanged: false, padding: '' }
    receipt.padding = 'x'.repeat(EXTERNAL_ESTIMATE_RECEIPT_MAX_BYTES - Buffer.byteLength(JSON.stringify(receipt)))
    vi.mocked(createServiceRoleClient).mockReturnValue({ rpc: async (_n: string, a: Record<string, unknown>) => ({
      data: a.p_action === 'check' ? { deviceId: device, scope: 'external-estimate-v1' } : receipt, error: null,
    }) } as never)
    for (const response of [await POST(request(payload)), await status(payload.capture.requestId)]) {
      expect(response.status).toBe(200); expect(Buffer.byteLength(await response.text())).toBe(EXTERNAL_ESTIMATE_RECEIPT_MAX_BYTES)
    }
    receipt.padding += 'x'
    for (const response of [await POST(request(payload)), await status(payload.capture.requestId)]) {
      expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ state: 'save_unconfirmed' })
    }
  })
  it('concurrent same-input submissions share exactly one draft and receipt', async () => {
    const payload = fixture()
    const results = await Promise.all([POST(request(payload)), POST(request(payload)), POST(request(payload))])
    const receipts = await Promise.all(results.map(r => r.json()))
    expect(results.map(r => r.status)).toEqual([200, 200, 200]); expect(new Set(receipts.map(r => r.draftId)).size).toBe(1)
    expect(await count('activity_drafts')).toBe(1); expect(await count('external_estimate_requests')).toBe(1)
  })
  it('lost post-commit response remains unconfirmed and original-ID readback resolves it without another write', async () => {
    const real = transport(); let lose = true
    vi.mocked(createServiceRoleClient).mockReturnValue({ rpc: async (n: string, a: Record<string, unknown>) => {
      const result = await real.rpc(n, a)
      if (a.p_action === 'import' && lose) { lose = false; throw Error('Synthetic lost transport') }
      return result
    } } as never)
    const payload = fixture(); expect((await POST(request(payload))).status).toBe(503)
    const readback = await (await status(payload.capture.requestId)).json(); expect(readback.state).toBe('estimated_unreviewed')
    expect(await count('activity_drafts')).toBe(1); expect(await count('external_estimate_requests')).toBe(1)
    expect(await (await POST(request(payload))).json()).toEqual(readback)
  })
  it('rolls back a draft if the atomic request ledger write fails', async () => {
    await db.exec('RESET ROLE')
    await db.exec("CREATE FUNCTION external_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER external_fixture_fail BEFORE INSERT ON external_estimate_requests FOR EACH ROW EXECUTE FUNCTION external_fixture_fail();")
    const payload = fixture()
    try {
      expect((await POST(request(payload))).status).toBe(503)
      expect(await count('activity_drafts')).toBe(0); expect(await count('external_estimate_requests')).toBe(0)
      expect((await (await status(payload.capture.requestId)).json()).state).toBe('not_found')
    } finally { await db.exec('RESET ROLE'); await db.exec('DROP TRIGGER external_fixture_fail ON external_estimate_requests; DROP FUNCTION external_fixture_fail();') }
  })
  it('does not accept existing camera-only tokens or malformed/missing authority before DB access', async () => {
    const photoOnly = `${randomUUID()}.${'1'.repeat(64)}`
    for (const bearer of ['', 'invalid', photoOnly]) expect((await POST(request(fixture(), bearer))).status).toBe(401)
    expect(createServiceRoleClient).not.toHaveBeenCalled()
  })
  it('rejects revoked, expired and unregistered authority for both import and readback', async () => {
    for (const change of ["revoked_at=clock_timestamp()", "revoked_at=NULL,expires_at=clock_timestamp()-interval '1 second'"]) {
      await db.exec('RESET ROLE'); await db.query(`UPDATE external_estimate_devices SET ${change} WHERE id=$1`, [device])
      expect((await POST(request())).status).toBe(401); expect((await status(randomUUID())).status).toBe(401)
    }
    expect((await status(randomUUID(), `external-estimate-v1.${randomUUID()}.${'2'.repeat(64)}`)).status).toBe(401)
    expect(await count('activity_drafts')).toBe(0)
  })
  it('does not disclose or reuse another device/owner capture and rejects owner fields in bodies', async () => {
    const payload = fixture(), original = await (await POST(request(payload))).json()
    const second = await provision(other)
    expect((await (await status(payload.capture.requestId, second.bearer)).json()).state).toBe('not_found')
    expect((await POST(request(payload, second.bearer))).status).toBe(409)
    expect((await POST(request(payload, token, JSON.stringify({ schemaVersion: 1, capture: payload.capture, estimateJSON: JSON.stringify(payload.estimate), userId: other })))).status).toBe(422)
    expect(await (await status(payload.capture.requestId)).json()).toEqual(original)
  })
  it('direct database clients cannot write grant/request tables or call the privileged import RPC', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.exec(`SET ROLE ${role}`)
      await expect(db.query('SELECT token_hash FROM external_estimate_devices')).rejects.toMatchObject({ code: '42501' })
      await expect(db.query('SELECT payload FROM external_estimate_requests')).rejects.toMatchObject({ code: '42501' })
      await expect(db.query('INSERT INTO external_estimate_devices DEFAULT VALUES')).rejects.toMatchObject({ code: '42501' })
      if (role !== 'service_role') await expect(db.query("SELECT external_estimate_request($1,'check')", [hash(token)])).rejects.toMatchObject({ code: '42501' })
    }
    await photoDraftActor(db, other)
    expect((await db.query('SELECT * FROM activity_drafts WHERE user_id=$1', [owner])).rows).toHaveLength(0)
  })
  it('validates numeric/provenance shape again inside the SQL privilege boundary', async () => {
    const real = transport(), payload = validateExternalEstimate(fixture())
    for (const mutation of [
      { ...payload, provenance: { reviewState: 'athlete_confirmed' } },
      { ...payload, estimate: { ...payload.estimate, totals: { ...payload.estimate.totals, protein: 1 } } },
      { ...payload, estimate: { ...payload.estimate, items: [{ ...payload.estimate.items[0], calories: -1 }] } },
    ]) {
      const result = await real.rpc('external_estimate_request', { p_hash: hash(token), p_action: 'import', p_id: payload.capture.requestId, p_payload: mutation, p_fingerprint: externalEstimateFingerprint(payload) })
      expect(result.error?.code).toBe('22023')
    }
    expect(await count('activity_drafts')).toBe(0)
  })
  it('inactive or absent gate prevents even authorization lookup and all writes', async () => {
    vi.stubEnv('EXTERNAL_ESTIMATE_IMPORT_ENABLED', '')
    expect((await POST(request())).status).toBe(409); expect((await status(randomUUID())).status).toBe(409)
    expect(createServiceRoleClient).not.toHaveBeenCalled(); expect(await count('activity_drafts')).toBe(0)
  })
  it('unknown status is a read; malformed/multiple IDs and malformed JSON cannot save a draft', async () => {
    expect((await (await status(randomUUID())).json()).state).toBe('not_found')
    expect((await GET(new Request('https://localhost/api/capture/external-estimates?requestId=wrong', { headers: { Authorization: `Bearer ${token}` } }))).status).toBe(422)
    expect((await POST(request(fixture(), token, '{"schemaVersion":1,"schemaVersion":1}'))).status).toBe(422)
    expect(await count('activity_drafts')).toBe(0)
  })
  it('bounds actual stream bytes, rejects malformed UTF-8 and requires the exact JSON media type', async () => {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': '1' }
    expect((await POST(new Request('https://localhost/api/capture/external-estimates', { method: 'POST', headers, body: ' '.repeat(65537) }))).status).toBe(413)
    expect((await POST(new Request('https://localhost/api/capture/external-estimates', { method: 'POST', headers, body: new Uint8Array([255, 254]) }))).status).toBe(422)
    const malformedMedia = request(); malformedMedia.headers.set('Content-Type', 'application/jsonp')
    expect((await POST(malformedMedia)).status).toBe(415)
    expect(await count('activity_drafts')).toBe(0)
  })
  it('does not accept a valid JSON prefix when a stream stalls until its deadline', async () => {
    const text = await request().text(), rpc = vi.fn(async () => ({ data: { deviceId: device, scope: 'external-estimate-v1' }, error: null }))
    vi.mocked(createServiceRoleClient).mockReturnValue({ rpc } as never)
    vi.useFakeTimers()
    try {
      const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(text)) } })
      const pending = POST(new Request('https://localhost/api/capture/external-estimates', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body, duplex: 'half' } as RequestInit))
      await vi.advanceTimersByTimeAsync(10001)
      expect((await pending).status).toBe(408)
      expect(rpc.mock.calls).toHaveLength(1)
    } finally { vi.useRealTimers() }
  })
})
