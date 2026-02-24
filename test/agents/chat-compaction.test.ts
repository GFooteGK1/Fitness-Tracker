import { describe, it, expect, vi } from 'vitest'
import { extractKeyFacts, generateCompactionSummary, compactOldMessages } from '@/app/lib/agents/chat-compaction'
import type { ChatMessage } from '@/app/lib/agents/types'

// ─── Helpers ─────────────────────────────────────────────────────────

function makeChatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    user_id: 'user-1',
    role: 'user',
    content: 'Hello',
    input_mode: 'text',
    input_type: null,
    domain: null,
    confidence: null,
    related_entity_id: null,
    related_entity_type: null,
    is_compacted: false,
    created_at: '2026-01-15T10:00:00Z',
    ...overrides,
  }
}

function createMockSupabase(overrides: {
  countResult?: { count: number | null }
  selectResult?: { data: unknown[] | null }
  insertResult?: { error: unknown }
  updateResult?: { error: unknown }
} = {}) {
  const countResult = overrides.countResult ?? { count: 0 }
  const selectResult = overrides.selectResult ?? { data: [] }
  const insertResult = overrides.insertResult ?? { error: null }
  const updateResult = overrides.updateResult ?? { error: null }

  // Build a count chain that returns { count } at the terminal .eq()
  function makeCountChain() {
    const chain: Record<string, any> = { count: countResult.count }
    chain.eq = vi.fn().mockReturnValue(chain)
    return chain
  }

  // Build a select chain for fetching messages
  function makeSelectChain() {
    const chain: Record<string, any> = {}
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.limit = vi.fn().mockReturnValue(selectResult)
    return chain
  }

  // Build an insert chain
  function makeInsertChain() {
    return { insert: vi.fn().mockReturnValue(insertResult) }
  }

  // Build an update chain
  function makeUpdateChain() {
    const chain: Record<string, any> = {}
    chain.update = vi.fn().mockReturnValue(chain)
    chain.in = vi.fn().mockReturnValue(updateResult)
    return chain
  }

  // Track from() calls to return appropriate chains
  let fromCallIndex = 0
  const fromFn = vi.fn(() => {
    const idx = fromCallIndex++
    // Call 0: count query (select with head: true)
    // Call 1: select query (fetch old messages)
    // Call 2: insert (compacted summary)
    // Call 3: update (mark originals)
    if (idx === 0) {
      const countChain = makeCountChain()
      return { select: vi.fn().mockReturnValue(countChain) }
    }
    if (idx === 1) {
      const selChain = makeSelectChain()
      return { select: vi.fn().mockReturnValue(selChain) }
    }
    if (idx === 2) {
      return makeInsertChain()
    }
    // idx === 3
    return makeUpdateChain()
  })

  return {
    from: fromFn,
  }
}

// ─── extractKeyFacts ─────────────────────────────────────────────────

describe('extractKeyFacts', () => {
  it('extracts workout entity references', () => {
    const messages = [
      makeChatMessage({ related_entity_type: 'workout', related_entity_id: 'w-123' }),
    ]
    const facts = extractKeyFacts(messages)
    expect(facts).toContain('Logged workout: w-123')
  })

  it('extracts meal entity references', () => {
    const messages = [
      makeChatMessage({ related_entity_type: 'meal', related_entity_id: 'm-456' }),
    ]
    const facts = extractKeyFacts(messages)
    expect(facts).toContain('Logged meal: m-456')
  })

  it('extracts PR mentions from content', () => {
    const messages = [
      makeChatMessage({ content: 'New PR on Fran! 3:45 RX' }),
    ]
    const facts = extractKeyFacts(messages)
    expect(facts).toEqual(expect.arrayContaining([
      expect.stringContaining('PR mentioned'),
    ]))
  })

  it('extracts "personal record" mentions (case-insensitive)', () => {
    const messages = [
      makeChatMessage({ content: 'That was a Personal Record for deadlift' }),
    ]
    const facts = extractKeyFacts(messages)
    expect(facts).toEqual(expect.arrayContaining([
      expect.stringContaining('PR mentioned'),
    ]))
  })

  it('extracts correction mentions', () => {
    const messages = [
      makeChatMessage({ content: 'Actually, the weight was 225 not 205' }),
    ]
    const facts = extractKeyFacts(messages)
    expect(facts).toEqual(expect.arrayContaining([
      expect.stringContaining('Correction'),
    ]))
  })

  it('returns empty array for messages with no key facts', () => {
    const messages = [
      makeChatMessage({ content: 'How are you?' }),
      makeChatMessage({ content: 'Just chatting' }),
    ]
    const facts = extractKeyFacts(messages)
    expect(facts).toEqual([])
  })

  it('handles empty message array', () => {
    expect(extractKeyFacts([])).toEqual([])
  })

  it('extracts multiple facts from a single message', () => {
    const messages = [
      makeChatMessage({
        content: 'New PR on clean and jerk!',
        related_entity_type: 'workout',
        related_entity_id: 'w-789',
      }),
    ]
    const facts = extractKeyFacts(messages)
    expect(facts).toHaveLength(2)
    expect(facts).toContain('Logged workout: w-789')
    expect(facts[1]).toContain('PR mentioned')
  })

  it('truncates long content in PR mentions to 100 chars', () => {
    const longContent = 'PR ' + 'a'.repeat(200)
    const messages = [makeChatMessage({ content: longContent })]
    const facts = extractKeyFacts(messages)
    const prFact = facts.find(f => f.startsWith('PR mentioned'))!
    // "PR mentioned: " prefix + 100 chars of content
    expect(prFact.length).toBeLessThanOrEqual('PR mentioned: '.length + 100)
  })
})

// ─── generateCompactionSummary ───────────────────────────────────────

describe('generateCompactionSummary', () => {
  it('includes message count in summary', () => {
    const messages = [
      makeChatMessage({ role: 'user' }),
      makeChatMessage({ role: 'trainer', id: 'msg-2' }),
    ]
    const result = generateCompactionSummary(messages, [])
    expect(result.original_message_count).toBe(2)
    expect(result.summary).toContain('Compacted 2 messages')
  })

  it('includes role breakdown in summary', () => {
    const messages = [
      makeChatMessage({ role: 'user' }),
      makeChatMessage({ role: 'trainer', id: 'msg-2' }),
      makeChatMessage({ role: 'trainer', id: 'msg-3' }),
    ]
    const result = generateCompactionSummary(messages, [])
    expect(result.summary).toContain('user: 1')
    expect(result.summary).toContain('trainer: 2')
  })

  it('includes key facts in summary', () => {
    const facts = ['Logged workout: w-1', 'PR mentioned: Fran 3:45']
    const result = generateCompactionSummary([makeChatMessage()], facts)
    expect(result.summary).toContain('Key facts:')
    expect(result.summary).toContain('- Logged workout: w-1')
    expect(result.summary).toContain('- PR mentioned: Fran 3:45')
    expect(result.key_facts).toEqual(facts)
  })

  it('omits key facts section when no facts', () => {
    const result = generateCompactionSummary([makeChatMessage()], [])
    expect(result.summary).not.toContain('Key facts:')
    expect(result.key_facts).toEqual([])
  })

  it('sets compacted_at to a valid ISO timestamp', () => {
    const result = generateCompactionSummary([makeChatMessage()], [])
    expect(new Date(result.compacted_at).toISOString()).toBe(result.compacted_at)
  })
})

// ─── compactOldMessages ──────────────────────────────────────────────

describe('compactOldMessages', () => {
  it('does nothing when count is at or below threshold', async () => {
    const mock = createMockSupabase({ countResult: { count: 50 } })
    await compactOldMessages(mock as any, 'user-1', 100)

    // from() called once for count query, no insert/update
    expect(mock.from).toHaveBeenCalledTimes(1)
  })

  it('does nothing when count is null', async () => {
    const mock = createMockSupabase({ countResult: { count: null } })
    await compactOldMessages(mock as any, 'user-1', 100)
    expect(mock.from).toHaveBeenCalledTimes(1)
  })

  it('compacts messages when count exceeds threshold', async () => {
    const oldMessages = [
      makeChatMessage({ id: 'old-1', content: 'Old message 1' }),
      makeChatMessage({ id: 'old-2', content: 'Old message 2', related_entity_type: 'workout', related_entity_id: 'w-1' }),
    ]

    const mock = createMockSupabase({
      countResult: { count: 102 },
      selectResult: { data: oldMessages },
    })

    await compactOldMessages(mock as any, 'user-1', 100)

    // Should have called from() 4 times: count, select, insert, update
    expect(mock.from).toHaveBeenCalledTimes(4)
    expect(mock.from).toHaveBeenCalledWith('chat_messages')

    // Verify insert was called with a system summary message (3rd from() call)
    const insertChain = mock.from.mock.results[2].value
    const insertCall = insertChain.insert.mock.calls[0]?.[0]
    expect(insertCall.role).toBe('system')
    expect(insertCall.is_compacted).toBe(true)
    expect(insertCall.user_id).toBe('user-1')
    expect(insertCall.content).toContain('Compacted 2 messages')

    // Verify update was called to mark originals as compacted (4th from() call)
    const updateChain = mock.from.mock.results[3].value
    const inCall = updateChain.in.mock.calls[0]
    expect(inCall[0]).toBe('id')
    expect(inCall[1]).toEqual(['old-1', 'old-2'])
  })

  it('does nothing when fetched messages are empty', async () => {
    const mock = createMockSupabase({
      countResult: { count: 150 },
      selectResult: { data: [] },
    })

    await compactOldMessages(mock as any, 'user-1', 100)

    // Should only call from() twice: count + select (no insert/update)
    expect(mock.from).toHaveBeenCalledTimes(2)
  })

  it('does nothing when fetched messages are null', async () => {
    const mock = createMockSupabase({
      countResult: { count: 150 },
      selectResult: { data: null },
    })

    await compactOldMessages(mock as any, 'user-1', 100)
    // Should only call from() twice: count + select (no insert/update)
    expect(mock.from).toHaveBeenCalledTimes(2)
  })

  it('uses default threshold of 100', async () => {
    const mock = createMockSupabase({ countResult: { count: 50 } })
    await compactOldMessages(mock as any, 'user-1')
    // With 50 messages and default threshold 100, should not compact
    expect(mock.from).toHaveBeenCalledTimes(1)
  })

  it('preserves key facts in compacted summary', async () => {
    const oldMessages = [
      makeChatMessage({ id: 'old-1', content: 'Got a new PR on Fran!', related_entity_type: 'workout', related_entity_id: 'w-pr' }),
      makeChatMessage({ id: 'old-2', content: 'Logged lunch', related_entity_type: 'meal', related_entity_id: 'm-lunch' }),
    ]

    const mock = createMockSupabase({
      countResult: { count: 102 },
      selectResult: { data: oldMessages },
    })

    await compactOldMessages(mock as any, 'user-1', 100)

    const insertChain = mock.from.mock.results[2].value
    const insertCall = insertChain.insert.mock.calls[0]?.[0]
    expect(insertCall.content).toContain('Logged workout: w-pr')
    expect(insertCall.content).toContain('Logged meal: m-lunch')
    expect(insertCall.content).toContain('PR mentioned')
  })
})
