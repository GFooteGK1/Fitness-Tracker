import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { photoDraftActor, photoDraftClient, photoDraftDatabase } from '../helpers/photo-draft-database'
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/app/lib/llm/client', () => ({ complete: vi.fn() }))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { complete } from '@/app/lib/llm/client'
import { POST as analyze } from '@/app/api/meals/photo-drafts/route'
import { PATCH as edit } from '@/app/api/meals/photo-drafts/[id]/route'
import { GET as list, POST as decide } from '@/app/api/capture/drafts/route'
import { GET as check } from '@/app/api/logging/requests/[id]/route'

let db: PGlite, owner: string | null, client: ReturnType<typeof photoDraftClient>
const food = { food: 'Egg', portion: '1 egg', protein: 6, carbs: 0, fat: 5, calories: 69 }
const model = { items: [food], total_protein: 6, total_carbs: 0, total_fat: 5, total_calories: 69, confidence: 0.8, notes: 'Estimate portion size.' }
function upload(id = randomUUID(), changes: Record<string, string> = {}) {
  const form = new FormData()
  form.set('photo', new File([new Uint8Array(2048)], 'egg.jpg', { type: 'image/jpeg' }))
  for (const [key, value] of Object.entries({ requestId: id, expectedUserId: owner!, timestamp: '2026-10-06T12:00:00Z', approved: 'true', ...changes })) form.set(key, value)
  return new Request('http://localhost/api/meals/photo-drafts', { method: 'POST', body: form })
}
function json(body: object, method = 'POST') { return new Request('http://localhost/api/capture/drafts', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedUserId: owner, requestId: randomUUID(), ...body }) }) }
async function meals() { return (await db.query('SELECT * FROM meals')).rows }
async function draft() { return (await (await analyze(upload())).json()).draft }
beforeAll(async () => { db = await photoDraftDatabase() }, 30000)
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED', 'true')
  owner = randomUUID(); await db.exec('RESET ROLE'); await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner]); await photoDraftActor(db, owner)
  client = photoDraftClient(db, () => owner); vi.mocked(createServerClient).mockResolvedValue(client as never)
  vi.mocked(complete).mockResolvedValue({ text: JSON.stringify(model), toolCalls: [], usage: { input: 0, output: 0 }, stopReason: 'stop', provider: 'anthropic', model: 'test-only' })
})
afterEach(() => { vi.unstubAllEnvs() })
afterAll(async () => { await db?.close() })

describe('selected photo to reviewed nutrition draft (PostgreSQL integration)', () => {
  it('analyzes once, reloads the owned draft, corrects it, accepts once, and preserves estimated origins', async () => {
    const id = randomUUID(), first = await analyze(upload(id)), data = await first.json()
    expect(first.status).toBe(200); expect(data.canonicalChanged).toBe(false); expect(await meals()).toHaveLength(0)
    expect(data.draft.normalized.provenance.occurrence.reviewState).toBe('unreviewed')
    expect((await (await analyze(upload(id))).json()).draft.id).toBe(data.draft.id)
    expect(complete).toHaveBeenCalledTimes(1)
    const listed = await (await list()).json(); expect(listed.drafts.map((d: { id: string }) => d.id)).toContain(data.draft.id)
    const editId = randomUUID(), payload = { requestId: editId, expectedRevision: 1, items: [{ ...food, protein: 12, portion: '2 eggs' }] }
    const changed = await (await edit(json(payload, 'PATCH'), { params: Promise.resolve({ id: data.draft.id }) })).json()
    expect(changed.draft.revision).toBe(2); expect(changed.draft.normalized.record.total_protein).toBe(12); expect(await meals()).toHaveLength(0)
    expect((await (await edit(json(payload, 'PATCH'), { params: Promise.resolve({ id: data.draft.id }) })).json()).draft.revision).toBe(2)
    const decision = { action: 'commit', draftId: data.draft.id, expectedRevision: 2, requestId: randomUUID() }
    const saved = await (await decide(json(decision))).json(), replay = await (await decide(json(decision))).json()
    expect(replay.receipt).toEqual(saved.receipt); expect(await meals()).toHaveLength(1)
    expect(saved.receipt.provenance.occurrence.reviewState).toBe('athlete_confirmed')
    expect(saved.receipt.provenance.fields.macros).toMatchObject({ origin: 'model_estimated', reviewState: 'corrected' })
    expect((await meals())[0]).toMatchObject({ total_protein: '12.00', photo_url: null })
    expect((await decide(json({ ...decision, requestId: randomUUID() }))).status).toBe(409)
    expect(await meals()).toHaveLength(1)
    expect(JSON.stringify(listed)).not.toContain(Buffer.from(new Uint8Array(2048)).toString('base64'))
  })
  it('dismisses without logging and rejects an acceptance of the dismissed revision', async () => {
    const d = await draft()
    const response = await decide(json({ action: 'discard', draftId: d.id, expectedRevision: 1 }))
    expect(response.status).toBe(200); expect(await meals()).toHaveLength(0)
    expect((await decide(json({ action: 'commit', draftId: d.id, expectedRevision: 1 }))).status).toBe(409)
    expect(await meals()).toHaveLength(0)
  })
  it('rejects stale corrections and cross-account reads, corrections and acceptance', async () => {
    const originalOwner = owner, d = await draft()
    const request = { expectedRevision: 99, items: [food] }
    expect((await edit(json(request, 'PATCH'), { params: Promise.resolve({ id: d.id }) })).status).toBe(409)
    owner = randomUUID(); await db.exec('RESET ROLE'); await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner]); await photoDraftActor(db, owner)
    expect((await (await list()).json()).drafts).toHaveLength(0)
    expect((await edit(json({ ...request, expectedRevision: 1 }, 'PATCH'), { params: Promise.resolve({ id: d.id }) })).status).toBe(409)
    expect((await decide(json({ action: 'commit', draftId: d.id, expectedRevision: 1 }))).status).toBe(409)
    expect((await analyze(upload(randomUUID(), { expectedUserId: originalOwner! }))).status).toBe(403)
    expect(await meals()).toHaveLength(0)
  })
  it('recovers a saved draft after loss of the finish response without running analysis again', async () => {
    const id = randomUUID(), rpc = client.rpc
    const failure = vi.spyOn(client, 'rpc').mockImplementation(async (name, args) => name === 'finish_logging_request' ? { data: null, error: { code: undefined, message: 'Transport lost' } } : rpc(name, args))
    expect((await analyze(upload(id))).status).toBe(503)
    failure.mockRestore()
    const status = await (await check(new Request(`http://localhost/api/logging/requests/photo-draft:${id}?expectedUserId=${owner}`), { params: Promise.resolve({ id: `photo-draft:${id}` }) })).json()
    expect(status).toMatchObject({ requestResolved: true, canonicalChanged: false, state: 'draft' })
    const replay = await analyze(upload(id)); expect(replay.status).toBe(200); expect(complete).toHaveBeenCalledTimes(1); expect(await meals()).toHaveLength(0)
  })
  it('rejects changed-input request reuse before another provider call', async () => {
    const id = randomUUID(); await analyze(upload(id))
    expect((await analyze(upload(id, { timestamp: '2026-10-06T13:00:00Z' }))).status).toBe(409)
    expect(complete).toHaveBeenCalledTimes(1)
  })
  it.each(['create','edit','accept'] as const)('recovers a lost %s RPC response after its transaction committed', async action => {
    const d = action === 'create' ? null : await draft(), id = randomUUID(), rpc = client.rpc
    const functionName = action === 'accept' ? 'commit_activity_draft' : 'save_activity_draft'
    const lost = vi.spyOn(client, 'rpc').mockImplementation(async (name, args) => {
      const result = await rpc(name, args)
      return name === functionName ? { data: null, error: { code: undefined, message: 'Response lost after commit' } } : result
    })
    const payload = { requestId: id, expectedRevision: 1, items: [{ ...food, protein: 12 }] }
    const accept = { requestId: id, action: 'commit', draftId: d?.id, expectedRevision: 1 }
    const send = () => action === 'create' ? analyze(upload(id)) : action === 'edit' ? edit(json(payload, 'PATCH'), { params: Promise.resolve({ id: d.id }) }) : decide(json(accept))
    expect((await send()).status).toBe(503)
    lost.mockRestore()
    expect((await send()).status).toBe(200)
    expect(await meals()).toHaveLength(action === 'accept' ? 1 : 0)
    expect(complete).toHaveBeenCalledTimes(1)
    expect((await (await list()).json()).drafts).toHaveLength(action === 'accept' ? 0 : 1)
  })
  it('allows one acceptance from overlapping requests and rejects an edit after acceptance', async () => {
    const d = await draft(), action = { action: 'commit', draftId: d.id, expectedRevision: 1 }
    const responses = await Promise.all([decide(json(action)), decide(json(action))])
    expect(responses.map(response => response.status).sort()).toEqual([200,409])
    expect(await meals()).toHaveLength(1)
    expect((await edit(json({ expectedRevision: 1, items: [food] }, 'PATCH'), { params: Promise.resolve({ id: d.id }) })).status).toBe(409)
    expect(await meals()).toHaveLength(1)
  })
  it('excludes expired drafts and rejects expired edits, acceptance and forged correction fields', async () => {
    const d = await draft()
    expect((await edit(json({ expectedRevision: 1, items: [food], provenance: { origin: 'athlete_reported' } }, 'PATCH'), { params: Promise.resolve({ id: d.id }) })).status).toBe(422)
    expect((await edit(json({ expectedRevision: 1, items: [{ ...food, calories: -1 }] }, 'PATCH'), { params: Promise.resolve({ id: d.id }) })).status).toBe(422)
    await db.exec('RESET ROLE'); await db.query("UPDATE activity_drafts SET expires_at=now()-interval '1 day' WHERE id=$1", [d.id]); await photoDraftActor(db, owner!)
    expect((await (await list()).json()).drafts).toHaveLength(0)
    const changed = await edit(json({ expectedRevision: 1, items: [food] }, 'PATCH'), { params: Promise.resolve({ id: d.id }) })
    expect(changed.status).toBe(409); expect((await changed.json()).retryAllowed).toBe(true)
    expect((await decide(json({ action: 'commit', draftId: d.id, expectedRevision: 1 }))).status).toBe(409)
    expect(await meals()).toHaveLength(0)
  })
  it.each<Record<string, string>>([{ approved: 'false' }, { timestamp: 'garbage' }, { expectedUserId: 'different' }, { photoUrl: 'https://private.example' }])('rejects invalid or unapproved input before analysis: %j', async changes => {
    expect((await analyze(upload(randomUUID(), changes))).status).toBeGreaterThanOrEqual(400)
    expect(complete).not.toHaveBeenCalled(); expect(await meals()).toHaveLength(0)
  })
  it('does not save invalid analysis and makes a completed no-write failure recoverable', async () => {
    vi.mocked(complete).mockResolvedValueOnce({ text: '{"items":[]}', toolCalls: [], usage: { input: 0, output: 0 }, stopReason: 'stop', provider: 'anthropic', model: 'test-only' })
    const id = randomUUID(); expect((await analyze(upload(id))).status).toBe(422)
    const status = await (await check(new Request(`http://localhost/api/logging/requests/photo-draft:${id}?expectedUserId=${owner}`), { params: Promise.resolve({ id: `photo-draft:${id}` }) })).json()
    expect(status.retryAllowed).toBe(true); expect((await (await list()).json()).drafts).toHaveLength(0); expect(await meals()).toHaveLength(0)
  })
  it('honors authentication and the rollout pause before provider work', async () => {
    vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED', 'false'); expect((await analyze(upload())).status).toBe(409)
    owner = null; expect((await analyze(upload())).status).toBe(401); expect(complete).not.toHaveBeenCalled()
  })
})
