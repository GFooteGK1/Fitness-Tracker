import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/app/lib/coach/trust-center', async importOriginal => {
  const actual = await importOriginal<typeof import('@/app/lib/coach/trust-center')>()
  return { ...actual, fetchCoachTrustCenter: vi.fn() }
})

import { GET, POST } from '@/app/api/coach/trust/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachTrustCenter } from '@/app/lib/coach/trust-center'

const userId = '11111111-1111-4111-8111-111111111111'
const importId = '31111111-1111-4111-8111-111111111111'
const groupId = '71111111-1111-4111-8111-111111111111'

describe('/api/coach/trust', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchCoachTrustCenter).mockResolvedValue({
      generatedAt: '2026-09-01T18:00:00.000Z', available: true, unavailableReason: null,
      memories: [], imports: [], goals: [], qualities: [], signalSummary: [], proposals: []
    })
  })

  it('returns the user-scoped trust read model without caching', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(fetchCoachTrustCenter).toHaveBeenCalledWith(supabase, userId)
  })

  it('authenticates before reading an action body', async () => {
    const supabase = client({ authenticated: false })
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const request = { json: vi.fn(() => { throw new Error('must not parse') }) } as unknown as Request
    const response = await POST(request)
    expect(response.status).toBe(401)
    expect(request.json).not.toHaveBeenCalled()
  })

  it('rejects raw Qwik fields recursively before any RPC', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const response = await POST(request({
      action: 'confirm_import', resourceId: importId, idempotencyKey: 'trust-import-1',
      mappings: [{ groupId, movementId: 'barbell_back_squat', barPath: [1, 2] }]
    }))
    expect(response.status).toBe(422)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('uses the bounded memory lifecycle RPC and refreshes the read model', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const memoryId = '21111111-1111-4111-8111-111111111111'
    const response = await POST(request({
      action: 'reaffirm_memory', resourceId: memoryId, idempotencyKey: 'trust-memory-1'
    }))
    expect(response.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith('review_coach_memory', {
      p_memory_id: memoryId,
      p_action: 'reaffirmed',
      p_reason: null,
      p_idempotency_key: 'trust-memory-1'
    })
    expect(fetchCoachTrustCenter).toHaveBeenCalledWith(supabase, userId)
  })

  it('enriches an allowed ambiguous Qwik mapping before the atomic review RPC', async () => {
    const supabase = client({
      tables: {
        measurement_imports: [{ id: importId, user_id: userId, source_system: 'qwik_vbt', source_file_hash: 'a'.repeat(64), status: 'pending_review' }],
        performance_observation_groups: [pendingGroup()],
        performance_observation_values: [{
          group_id: groupId, user_id: userId, metric_id: 'bar.mean_velocity', value_numeric: 0.58, ordinal: 0, status: 'complete'
        }]
      }
    })
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const response = await POST(request({
      action: 'confirm_import', resourceId: importId, idempotencyKey: 'trust-import-2',
      mappings: [{ groupId, movementId: 'barbell_back_squat' }]
    }))
    expect(response.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith('review_qwik_import_v1', expect.objectContaining({
      p_import_id: importId,
      p_action: 'confirmed',
      p_reason: null,
      p_mappings: [expect.objectContaining({
        groupId,
        movementId: 'barbell_back_squat',
        movementName: 'Barbell back squat',
        comparabilityKey: expect.stringContaining('movement=barbell_back_squat'),
        comparison: expect.objectContaining({ movementId: 'barbell_back_squat' })
      })]
    }))
    expect(JSON.stringify(supabase.rpc.mock.calls)).not.toMatch(/rawText|bar_path|barPath/)
  })
  it('replays proposal acceptance after the first response is lost', async () => {
    const proposalId = '41111111-1111-4111-8111-111111111111'
    const supabase = client({
      tables: {
        adaptation_proposals: [{
          id: proposalId,
          user_id: userId,
          status: 'accepted',
          idempotency_key: 'proposal-creation-key'
        }]
      }
    })
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const response = await POST(request({
      action: 'accept_proposal', resourceId: proposalId, idempotencyKey: 'trust-proposal-retry'
    }))
    expect(response.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith('accept_adaptation_proposal', {
      p_proposal_id: proposalId, p_idempotency_key: 'proposal-creation-key'
    })
  })


  it('rejects a proposal through a reason-bearing idempotent transition', async () => {
    const supabase = client()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const proposalId = '41111111-1111-4111-8111-111111111111'
    const response = await POST(request({
      action: 'reject_proposal', resourceId: proposalId, idempotencyKey: 'trust-proposal-1',
      reason: 'Keep the current emphasis'
    }))
    expect(response.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith('reject_adaptation_proposal', {
      p_proposal_id: proposalId,
      p_reason: 'Keep the current emphasis',
      p_idempotency_key: 'trust-proposal-1'
    })
  })
})

function client(options: {
  authenticated?: boolean
  tables?: Record<string, unknown[]>
} = {}) {
  const tables = options.tables ?? {}
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue(options.authenticated === false
        ? { data: { user: null }, error: { message: 'no session' } }
        : { data: { user: { id: userId } }, error: null })
    },
    rpc: vi.fn().mockResolvedValue({ data: [{ event_id: 'event-1' }], error: null }),
    from: vi.fn((table: string) => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {}
      const filters: Array<[string, unknown]> = []
      for (const method of ['select', 'in', 'order']) {
        chain[method] = vi.fn(() => chain)
      }
      chain.eq = vi.fn((column: string, value: unknown) => {
        filters.push([column, value])
        return chain
      })
      chain.limit = vi.fn().mockImplementation(() => Promise.resolve({
        data: (tables[table] ?? []).filter(row => filters.every(([column, value]) =>
          typeof row === 'object' && row !== null && (row as Record<string, unknown>)[column] === value)),
        error: null
      }))
      return chain
    })
  }
  return supabase
}

function pendingGroup() {
  return {
    id: groupId, user_id: userId, source_import_id: importId, status: 'incomplete',
    observed_at: '2026-08-31T12:00:00.000Z', captured_at: '2026-08-31T12:01:00.000Z',
    source_system: 'qwik_vbt', source_device: 'phone-1', source_record_id: 'set-1',
    assessment_definition_id: 'strength.fixed_load_velocity', assessment_catalog_version: '0.2.0',
    protocol_version: '1.0.0', parser_version: 'qwik-import-0.1.0', comparability_key: null,
    comparison_modifiers: {
      movementId: null, variationId: null, repetitions: 3,
      externalLoad: { value: 100, unit: 'kg' }, distance: null, duration: null,
      equipmentIds: [], techniqueModifiers: [], environmentModifiers: []
    },
    metadata: {
      sourceExercise: 'Squat', mappingStatus: 'ambiguous', canonicalMovementId: null,
      canonicalMovementName: null, candidateMovementIds: ['barbell_back_squat', 'dumbbell_goblet_squat']
    }
  }
}

function request(body: unknown): Request {
  return new Request('http://localhost/api/coach/trust', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })
}
