import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn()
}))

import { POST } from '@/app/api/coach/imports/qwik/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import {
  parseQwikExport,
  qwikImportForPersistence
} from '@/app/lib/coach/qwik-import'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const rawText = readFileSync(join(
  repositoryRoot,
  'test',
  'fixtures',
  'qwik',
  'qwik-vbt-json-1.10.json'
), 'utf8')

let normalizedImport: ReturnType<typeof qwikImportForPersistence>

beforeAll(async () => {
  normalizedImport = qwikImportForPersistence(await parseQwikExport(rawText, {
    sourceFileName: 'qwik-export-2026-08-31.json',
    ingestedAt: '2026-08-31T22:30:00.000Z'
  }))
})

describe('POST /api/coach/imports/qwik', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires authentication before accepting normalized data', async () => {
    const client = supabaseClient(null)
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await POST(request(validBody()))

    expect(response.status).toBe(401)
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('rejects raw export transport without writing', async () => {
    const client = supabaseClient()
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await POST(request({
      action: 'save_for_review',
      rawText,
      idempotencyKey: 'qwik-upload-fixture-1'
    }))

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'Raw Qwik content is not accepted by this endpoint' })
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('saves only normalized provenance and measurements through the bounded transaction RPC', async () => {
    const client = supabaseClient()
    client.rpc.mockResolvedValue({
      data: [{
        import_id: '11111111-1111-4111-8111-111111111111',
        disposition: 'recorded',
        observation_group_count: 3,
        review_required: true
      }],
      error: null
    })
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await POST(request(validBody()))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      evidenceStatus: 'pending_review',
      adaptationEligible: false,
      result: { disposition: 'recorded', observation_group_count: 3 },
      review: { setCount: 3, warningCount: 1 }
    })
    expect(client.rpc).toHaveBeenCalledTimes(1)
    const [, rpcArgs] = client.rpc.mock.calls[0]
    expect(client.rpc).toHaveBeenCalledWith('record_qwik_import_v1', expect.objectContaining({
      p_idempotency_key: 'qwik-upload-fixture-1',
      p_source_file_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_source_schema_version: 'qwik-vbt-json-1.10',
      p_parser_version: 'qwik-import-0.1.0',
      p_manifest: expect.objectContaining({
        rawStoragePolicy: 'user_retained_not_uploaded',
        rawArtifactUploaded: false
      }),
      p_sets: expect.arrayContaining([
        expect.objectContaining({ sourceSetId: 'set-bench-paused-1' })
      ])
    }))
    expect(rpcArgs).not.toHaveProperty('p_raw_text')
    expect(JSON.stringify(rpcArgs)).not.toContain('export_format_version')
    expect(JSON.stringify(rpcArgs)).not.toContain('"barPath":')
    expect(JSON.stringify(rpcArgs)).not.toContain('bar_path')
  })

  it('returns a no-op replay without changing the evidence status', async () => {
    const client = supabaseClient()
    client.rpc.mockResolvedValue({
      data: [{
        import_id: '11111111-1111-4111-8111-111111111111',
        disposition: 'replayed',
        observation_group_count: 3,
        review_required: true
      }],
      error: null
    })
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await POST(request(validBody()))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.result.disposition).toBe('replayed')
    expect(body.adaptationEligible).toBe(false)
  })

  it('does not write when normalized data contains a raw bar path', async () => {
    const unsafe = JSON.parse(JSON.stringify(normalizedImport)) as {
      sets: Array<Record<string, unknown>>
    }
    unsafe.sets[0].barPath = [{ x: 1, y: 2 }]
    const client = supabaseClient()
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await POST(request({
      ...validBody(),
      normalizedImport: unsafe
    }))

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'Normalized Qwik import is invalid' })
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('maps idempotency conflicts to a stable conflict response', async () => {
    const client = supabaseClient()
    client.rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'do not expose database details' }
    })
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await POST(request(validBody()))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Qwik import conflicts with an existing request'
    })
  })
})

function validBody() {
  return {
    action: 'save_for_review',
    idempotencyKey: 'qwik-upload-fixture-1',
    normalizedImport
  }
}

function request(body: unknown): Request {
  return new Request('http://localhost/api/coach/imports/qwik', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function supabaseClient(user: { id: string } | null = { id: 'user-1' }) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : { message: 'Unauthorized' }
      })
    },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null })
  }
}
