/**
 * Tests for POST /api/prs/bulk-import (migrated onto the LLM seam).
 *
 * Mocks the seam (`complete`). Locks the behavior-preserving migration:
 * a JSON array of PRs is validated and inserted; unparseable output -> 500;
 * a non-array response -> 500; unauthenticated -> 401.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('../../app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))
vi.mock('../../app/lib/llm/client', () => ({ complete: vi.fn() }))
vi.mock('../../app/lib/agents/context-builder', () => ({ invalidatePassiveCache: vi.fn() }))

import { POST } from '../../app/api/prs/bulk-import/route'
import { createServerClient } from '../../app/lib/auth/supabase-server'
import { complete } from '../../app/lib/llm/client'

function authedSupabase(inserted: unknown[] = [{ id: 'p1', benchmark_name: 'Fran', score_display: '4:32', date: '2025-06-15', rx_status: 'RX' }]) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({ data: inserted, error: null }),
      })),
    })),
  }
}

function anonSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'Unauthorized' } }),
    },
  }
}

function mockLlmText(text: string) {
  vi.mocked(complete).mockResolvedValue({
    text, toolCalls: [], usage: { input: 50, output: 40 }, stopReason: 'stop', model: 'm', provider: 'anthropic',
  })
}

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/prs/bulk-import', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/prs/bulk-import', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 for an unauthenticated request', async () => {
    vi.mocked(createServerClient).mockResolvedValue(anonSupabase() as any)
    const response = await POST(req({ text: 'Fran 4:32' }))
    expect(response.status).toBe(401)
    expect(complete).not.toHaveBeenCalled()
  })

  it('parses a PR array via the seam and imports it', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabase() as any)
    mockLlmText('[{"benchmark_name":"Fran","score_value":272,"score_display":"4:32","date":"2025-06-15","rx_status":"RX"}]')

    const response = await POST(req({ text: 'Fran 4:32 on 2025-06-15' }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.imported).toBe(1)
    const arg = vi.mocked(complete).mock.calls[0][0]
    expect(arg.purpose).toBe('workout')
    expect(arg.temperature).toBe(0)
  })

  it('returns 500 on unparseable model output', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabase() as any)
    mockLlmText('no PRs here, sorry')
    const response = await POST(req({ text: 'nothing' }))
    expect(response.status).toBe(500)
  })

  it('returns 500 when the model returns a non-array', async () => {
    vi.mocked(createServerClient).mockResolvedValue(authedSupabase() as any)
    mockLlmText('{"benchmark_name":"Fran"}')
    const response = await POST(req({ text: 'Fran' }))
    expect(response.status).toBe(500)
  })
})
