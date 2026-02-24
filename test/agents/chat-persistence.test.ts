import { describe, it, expect, vi, beforeEach } from 'vitest'
import { persistMessages, fetchRecentChat, fetchPendingUrgentInsights } from '@/app/lib/agents/chat-persistence'
import type { AgentRequest, AgentMessage, ClassificationResult } from '@/app/lib/agents/types'

// ─── Supabase mock helpers ───────────────────────────────────────────

function createMockSupabase(overrides: {
  insertResult?: { error: unknown }
  selectResult?: { data: unknown[] | null; error?: unknown }
} = {}) {
  const insertResult = overrides.insertResult ?? { error: null }
  const selectResult = overrides.selectResult ?? { data: [], error: null }

  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue(selectResult),
    insert: vi.fn().mockReturnValue(insertResult),
  }

  return {
    from: vi.fn().mockReturnValue(chainable),
    _chain: chainable,
  }
}

// ─── Test fixtures ───────────────────────────────────────────────────

const baseRequest: AgentRequest = {
  content: 'Did Fran in 4:32 RX',
  input_mode: 'text',
}

const baseClassification: ClassificationResult = {
  input_type: 'workout_log',
  domains: ['trainer'],
  confidence: 0.92,
  context: {
    has_portions: false,
    has_score: true,
    is_benchmark: true,
    benchmark_name: 'Fran',
  },
}

const agentMessages: AgentMessage[] = [
  {
    role: 'trainer',
    content: 'Nice Fran time! That is a new PR.',
    domain: 'trainer',
    confidence: 0.95,
    related_entity_id: 'workout-123',
    related_entity_type: 'workout',
  },
]

// ─── persistMessages ─────────────────────────────────────────────────

describe('persistMessages', () => {
  it('inserts user message with input_mode and input_type', async () => {
    const mock = createMockSupabase()
    await persistMessages(mock as any, 'user-1', baseRequest, agentMessages, baseClassification)

    expect(mock.from).toHaveBeenCalledWith('chat_messages')
    const insertCall = mock._chain.insert.mock.calls[0][0]
    const userRow = insertCall[0]

    expect(userRow.role).toBe('user')
    expect(userRow.input_mode).toBe('text')
    expect(userRow.input_type).toBe('workout_log')
    expect(userRow.content).toBe('Did Fran in 4:32 RX')
    expect(userRow.confidence).toBe(0.92)
    expect(userRow.is_compacted).toBe(false)
  })

  it('inserts agent messages with domain and related entity fields', async () => {
    const mock = createMockSupabase()
    await persistMessages(mock as any, 'user-1', baseRequest, agentMessages, baseClassification)

    const insertCall = mock._chain.insert.mock.calls[0][0]
    const agentRow = insertCall[1]

    expect(agentRow.role).toBe('trainer')
    expect(agentRow.domain).toBe('trainer')
    expect(agentRow.confidence).toBe(0.95)
    expect(agentRow.related_entity_id).toBe('workout-123')
    expect(agentRow.related_entity_type).toBe('workout')
    expect(agentRow.input_mode).toBeNull()
    expect(agentRow.input_type).toBeNull()
    expect(agentRow.is_compacted).toBe(false)
  })

  it('handles multiple agent messages', async () => {
    const mock = createMockSupabase()
    const multiMessages: AgentMessage[] = [
      { role: 'trainer', content: 'Workout logged', domain: 'trainer', confidence: 0.9 },
      { role: 'nutritionist', content: 'Consider fueling', domain: 'nutritionist', confidence: 0.8 },
    ]

    await persistMessages(mock as any, 'user-1', baseRequest, multiMessages, baseClassification)

    const insertCall = mock._chain.insert.mock.calls[0][0]
    expect(insertCall).toHaveLength(3) // 1 user + 2 agent
    expect(insertCall[1].role).toBe('trainer')
    expect(insertCall[2].role).toBe('nutritionist')
  })

  it('sets null for optional agent message fields when absent', async () => {
    const mock = createMockSupabase()
    const minimalAgent: AgentMessage[] = [
      { role: 'socius', content: 'Hello' },
    ]

    await persistMessages(mock as any, 'user-1', baseRequest, minimalAgent, baseClassification)

    const insertCall = mock._chain.insert.mock.calls[0][0]
    const agentRow = insertCall[1]

    expect(agentRow.domain).toBeNull()
    expect(agentRow.confidence).toBeNull()
    expect(agentRow.related_entity_id).toBeNull()
    expect(agentRow.related_entity_type).toBeNull()
  })

  it('logs error on insert failure without throwing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mock = createMockSupabase({ insertResult: { error: { message: 'DB error' } } })

    await persistMessages(mock as any, 'user-1', baseRequest, agentMessages, baseClassification)

    expect(consoleSpy).toHaveBeenCalledWith('Failed to persist chat messages:', { message: 'DB error' })
    consoleSpy.mockRestore()
  })
})

// ─── fetchRecentChat ─────────────────────────────────────────────────

describe('fetchRecentChat', () => {
  it('queries non-compacted messages for the user', async () => {
    const mock = createMockSupabase({ selectResult: { data: [] } })
    await fetchRecentChat(mock as any, 'user-1', 20)

    expect(mock.from).toHaveBeenCalledWith('chat_messages')
    expect(mock._chain.select).toHaveBeenCalledWith('*')
    expect(mock._chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(mock._chain.eq).toHaveBeenCalledWith('is_compacted', false)
    expect(mock._chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(mock._chain.limit).toHaveBeenCalledWith(20)
  })

  it('returns messages in chronological order (reversed)', async () => {
    const messages = [
      { id: '3', content: 'third', created_at: '2026-01-03T00:00:00Z' },
      { id: '2', content: 'second', created_at: '2026-01-02T00:00:00Z' },
      { id: '1', content: 'first', created_at: '2026-01-01T00:00:00Z' },
    ]
    const mock = createMockSupabase({ selectResult: { data: messages } })
    const result = await fetchRecentChat(mock as any, 'user-1')

    expect(result[0].content).toBe('first')
    expect(result[1].content).toBe('second')
    expect(result[2].content).toBe('third')
  })

  it('returns empty array when no data', async () => {
    const mock = createMockSupabase({ selectResult: { data: null } })
    const result = await fetchRecentChat(mock as any, 'user-1')
    expect(result).toEqual([])
  })

  it('uses default limit of 20', async () => {
    const mock = createMockSupabase({ selectResult: { data: [] } })
    await fetchRecentChat(mock as any, 'user-1')
    expect(mock._chain.limit).toHaveBeenCalledWith(20)
  })

  it('accepts custom limit', async () => {
    const mock = createMockSupabase({ selectResult: { data: [] } })
    await fetchRecentChat(mock as any, 'user-1', 50)
    expect(mock._chain.limit).toHaveBeenCalledWith(50)
  })
})

// ─── fetchPendingUrgentInsights ──────────────────────────────────────

describe('fetchPendingUrgentInsights', () => {
  it('queries urgent unsurfaced insights for the user', async () => {
    const mock = createMockSupabase()
    mock._chain.order.mockReturnValue({ data: [] })
    await fetchPendingUrgentInsights(mock as any, 'user-1')

    expect(mock.from).toHaveBeenCalledWith('insights')
    expect(mock._chain.select).toHaveBeenCalledWith('id, content')
    expect(mock._chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(mock._chain.eq).toHaveBeenCalledWith('priority', 'urgent')
    expect(mock._chain.is).toHaveBeenCalledWith('surfaced_at', null)
    expect(mock._chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('returns insight id and content', async () => {
    const insights = [
      { id: 'ins-1', content: 'High strain with low calories' },
      { id: 'ins-2', content: 'Recovery declining' },
    ]
    const mock = createMockSupabase()
    // order() is the terminal call for this query, so override it to return data
    mock._chain.order.mockReturnValue({ data: insights })
    const result = await fetchPendingUrgentInsights(mock as any, 'user-1')

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: 'ins-1', content: 'High strain with low calories' })
    expect(result[1]).toEqual({ id: 'ins-2', content: 'Recovery declining' })
  })

  it('returns empty array when no data', async () => {
    const mock = createMockSupabase()
    mock._chain.order.mockReturnValue({ data: null })
    const result = await fetchPendingUrgentInsights(mock as any, 'user-1')
    expect(result).toEqual([])
  })
})
