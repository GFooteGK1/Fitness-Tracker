import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { photoDraftActor, photoDraftClient, photoDraftDatabase } from '../helpers/photo-draft-database'

const guard = vi.hoisted(() => ({ calls: 0, inputTokens: 0, outputTokens: 0, requestId: null as string | null, model: '', blockedReason: null as string | null, fetch: globalThis.fetch }))
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@anthropic-ai/sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>()
  return { ...actual, default: class extends actual.default {
    constructor(options: ConstructorParameters<typeof actual.default>[0]) {
      super({ ...options, maxRetries: 0, timeout: 45000, baseURL: 'https://api.anthropic.com', fetch: async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
        if (url.origin !== 'https://api.anthropic.com' || url.pathname !== '/v1/messages' || init?.method?.toUpperCase() !== 'POST' || guard.calls >= 1) { guard.blockedReason = 'request_target_or_count'; throw new Error('Qualification request limit or target rejected.') }
        const body = JSON.parse(String(init.body))
        if (body.max_tokens !== 1024) { guard.blockedReason = 'output_token_cap'; throw new Error('Unexpected output-token cap.') }
        guard.calls++; guard.model = body.model
        const response = process.env.PHOTO_REVIEW_QUALIFICATION === 'dry'
          ? new Response(JSON.stringify({ id: 'dry-message', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', stop_sequence: null,
            content: [{ type: 'text', text: JSON.stringify({ items: [{ food: 'Egg', portion: '1 egg', protein: 6, carbs: 0, fat: 5, calories: 69 }], total_protein: 6, total_carbs: 0, total_fat: 5, total_calories: 69, confidence: 0.8, notes: 'Dry substitute.' }) }], usage: { input_tokens: 7, output_tokens: 14 } }), { headers: { 'Content-Type': 'application/json', 'request-id': 'dry-request' } })
          : await guard.fetch(input, { ...init, redirect: 'error' })
        guard.requestId = response.headers.get('request-id')
        const usage = (await response.clone().json()).usage
        guard.inputTokens = usage?.input_tokens ?? 0; guard.outputTokens = usage?.output_tokens ?? 0
        return response
      } })
    }
  } }
})
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { POST as analyze } from '@/app/api/meals/photo-drafts/route'
import { PATCH as edit } from '@/app/api/meals/photo-drafts/[id]/route'
import { GET as list, POST as decide } from '@/app/api/capture/drafts/route'

const mode = process.env.PHOTO_REVIEW_QUALIFICATION
let db: PGlite | undefined
beforeAll(() => {
  if (mode === 'live' || mode === 'dry') {
    vi.stubEnv('LLM_PROVIDER', 'anthropic'); vi.stubEnv('LLM_VISION_PROVIDER', 'anthropic')
    vi.stubEnv('LLM_ANTHROPIC_VISION_MODEL', 'claude-sonnet-4-6'); vi.stubEnv('ANTHROPIC_VISION_MODEL', 'claude-sonnet-4-6')
    vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED', 'true')
    vi.stubEnv('DEBUG', 'false')
    vi.stubGlobal('fetch', () => { throw new Error('Only the bounded Anthropic SDK transport may access the network.') })
  }
})
afterAll(async () => { await db?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it.skipIf(mode !== 'live' && mode !== 'dry')('qualifies one Claude photo response through local draft review, replay, acceptance and dismissal', async () => {
  const steps: string[] = []
  let passed = false
  const bytes = mode === 'dry' ? Buffer.alloc(2048) : readFileSync(process.env.PHOTO_REVIEW_QUALIFICATION_PHOTO!)
  const photoSha256 = createHash('sha256').update(bytes).digest('hex')
  if (mode === 'live') expect(photoSha256).toBe(process.env.PHOTO_REVIEW_QUALIFICATION_SHA256)
  try {
    db = await photoDraftDatabase()
    const owner = randomUUID()
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner]); await photoDraftActor(db, owner)
    const client = photoDraftClient(db, () => owner)
    vi.mocked(createServerClient).mockResolvedValue(client as never)
    const analysisId = randomUUID(), timestamp = new Date().toISOString()
    const upload = () => {
      const form = new FormData()
      form.set('photo', new File([new Uint8Array(bytes)], 'approved-test-photo.jpg', { type: 'image/jpeg' }))
      for (const [key, value] of Object.entries({ requestId: analysisId, timestamp, expectedUserId: owner, approved: 'true' })) form.set(key, value)
      return new Request('http://localhost/api/meals/photo-drafts', { method: 'POST', body: form })
    }
    const send = (body: object, method = 'POST') => new Request('http://localhost/api/capture/drafts', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedUserId: owner, requestId: randomUUID(), ...body }) })
    const mealCount = async () => (await db!.query('SELECT id FROM meals')).rows.length
    const response = await analyze(upload())
    expect(response.status).toBe(200)
    const { draft } = await response.json()
    expect(draft.normalized.record.items.length).toBeGreaterThan(0); expect(await mealCount()).toBe(0)
    steps.push('analysis_created_only_a_draft')
    expect((await (await analyze(upload())).json()).draft.id).toBe(draft.id); expect(guard.calls).toBe(1)
    expect((await (await list()).json()).drafts.map((d: { id: string }) => d.id)).toContain(draft.id)
    steps.push('reload_and_replay_without_reanalysis')
    const items = draft.normalized.record.items.map((item: Record<string, unknown>, index: number) => ({ ...item, portion: index === 0 ? 'Reviewed test portion' : item.portion }))
    const corrected = await edit(send({ expectedRevision: 1, items }, 'PATCH'), { params: Promise.resolve({ id: draft.id }) })
    expect(corrected.status).toBe(200); const updated = (await corrected.json()).draft
    expect(updated.revision).toBe(2); expect(await mealCount()).toBe(0)
    steps.push('correction_without_nutrition_change')
    const decision = { action: 'commit', draftId: draft.id, expectedRevision: 2, requestId: randomUUID() }
    const accepted = await decide(send(decision)); expect(accepted.status).toBe(200)
    const receipt = (await accepted.json()).receipt
    expect((await (await decide(send(decision))).json()).receipt).toEqual(receipt); expect(await mealCount()).toBe(1)
    expect(receipt.provenance.fields.macros.origin).toBe('model_estimated')
    expect(receipt.provenance.occurrence.reviewState).toBe('athlete_confirmed')
    const saved = (await db.query<{ photo_url: unknown; total_calories: string }>('SELECT photo_url,total_calories FROM meals')).rows[0]
    expect(saved.photo_url).toBeNull(); expect(Number(saved.total_calories)).toBe(updated.normalized.record.total_calories)
    steps.push('acceptance_once_with_estimated_origin_and_no_image_storage')
    // Reuse the saved estimate only to exercise dismissal, without a second provider request.
    const seed = await client.rpc('save_activity_draft', { p_request_id: randomUUID(), p_draft_id: null, p_expected_revision: null, p_operation: draft.normalized, p_discard: false })
    expect(seed.error).toBeNull()
    const dismissed = await decide(send({ action: 'discard', draftId: (seed.data as { id: string }).id, expectedRevision: 1 }))
    expect(dismissed.status).toBe(200); expect(await mealCount()).toBe(1); expect(guard.calls).toBe(1)
    steps.push('dismissal_without_another_provider_request_or_meal')
    passed = true
  } finally {
    const directory = resolve('output/photo-review-drafts'); mkdirSync(directory, { recursive: true })
    writeFileSync(resolve(directory, mode === 'live' ? `claude-live-${photoSha256}-receipt.json` : 'claude-dry-receipt.json'), JSON.stringify({ mode, passed, completedAt: new Date().toISOString(), photoSha256,
      provider: 'anthropic', model: guard.model, httpRequests: guard.calls, maximumHttpRequests: 1, sdkRetries: 0, maximumOutputTokens: 1024,
      usage: { inputTokens: guard.inputTokens, outputTokens: guard.outputTokens }, providerRequestId: guard.requestId, blockedReason: guard.blockedReason, steps, hostedDatabaseWrites: false,
      authTransport: 'local substitute', database: 'isolated in-memory PostgreSQL', physicalDeviceVerified: false }, null, 2), { flag: mode === 'live' ? 'wx' : 'w' })
  }
}, 90000)
