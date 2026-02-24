/**
 * Property-Based Tests for Chat Persistence
 *
 * Feature: agent-system, Property 19: Chat message persistence round-trip
 * Feature: agent-system, Property 20: Chat retrieval ordering
 *
 * *For any* user message and agent response, persisting them to `chat_messages`
 * and then fetching recent messages SHALL return records with matching `role`,
 * `content`, `input_mode`, `input_type`, `domain`, and `related_entity_id`/
 * `related_entity_type` (when present).
 *
 * *For any* set of persisted chat messages, fetching recent messages SHALL return
 * them in chronological order (oldest first within the result set).
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.5**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect, vi } from 'vitest'
import { persistMessages, fetchRecentChat } from '@/app/lib/agents/chat-persistence'
import type {
  AgentRequest,
  AgentMessage,
  ClassificationResult,
  InputMode,
  InputType,
  AgentDomain,
  ChatRole,
  ChatMessage,
} from '@/app/lib/agents/types'

const propertyConfig = { numRuns: 100 }

// ─── Arbitraries ─────────────────────────────────────────────────────

const VALID_INPUT_MODES: InputMode[] = ['text', 'voice', 'photo', 'file']
const VALID_INPUT_TYPES: InputType[] = ['workout_log', 'meal_log', 'question', 'mixed', 'unclear']
const VALID_DOMAINS: AgentDomain[] = ['trainer', 'nutritionist', 'socius']
const VALID_AGENT_ROLES: ChatRole[] = ['trainer', 'nutritionist', 'socius', 'system']
const VALID_ENTITY_TYPES = ['workout', 'meal', 'insight'] as const

const arbInputMode = fc.constantFrom<InputMode>(...VALID_INPUT_MODES)
const arbInputType = fc.constantFrom<InputType>(...VALID_INPUT_TYPES)
const arbDomain = fc.constantFrom<AgentDomain>(...VALID_DOMAINS)
const arbAgentRole = fc.constantFrom<ChatRole>(...VALID_AGENT_ROLES)
const arbEntityType = fc.constantFrom<'workout' | 'meal' | 'insight'>(...VALID_ENTITY_TYPES)

const arbAgentRequest = fc.record({
  content: fc.string({ minLength: 1, maxLength: 200 }),
  input_mode: arbInputMode,
})

const arbClassification = fc.record({
  input_type: arbInputType,
  domains: fc.array(arbDomain, { minLength: 1, maxLength: 3 }),
  confidence: fc.float({ min: 0, max: 1, noNaN: true }),
  context: fc.record({
    has_portions: fc.boolean(),
    has_score: fc.boolean(),
    is_benchmark: fc.boolean(),
  }),
}) as fc.Arbitrary<ClassificationResult>

const arbAgentMessage = fc.record({
  role: arbAgentRole,
  content: fc.string({ minLength: 1, maxLength: 200 }),
  domain: fc.option(arbDomain, { nil: undefined }),
  confidence: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
  related_entity_id: fc.option(fc.uuid(), { nil: undefined }),
  related_entity_type: fc.option(arbEntityType, { nil: undefined }),
}) as fc.Arbitrary<AgentMessage>

// ─── Mock Helpers ────────────────────────────────────────────────────

function createInsertCaptureMock() {
  let capturedRows: Record<string, unknown>[] = []

  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue({ data: [], error: null }),
    insert: vi.fn((rows: Record<string, unknown>[]) => {
      capturedRows = rows
      return { error: null }
    }),
  }

  return {
    supabase: { from: vi.fn().mockReturnValue(chainable), _chain: chainable },
    getCapturedRows: () => capturedRows,
  }
}

function createFetchMock(data: unknown[]) {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue({ data }),
    insert: vi.fn().mockReturnValue({ error: null }),
  }

  return { from: vi.fn().mockReturnValue(chainable), _chain: chainable }
}

// ─── Property 19: Chat message persistence round-trip ────────────────

describe('Property 19: Chat message persistence round-trip', () => {

  /**
   * Property 19a: User message row preserves role, content, input_mode, input_type
   */
  test.prop(
    [arbAgentRequest, fc.array(arbAgentMessage, { minLength: 0, maxLength: 5 }), arbClassification],
    propertyConfig
  )(
    'Property 19: user message row preserves role, content, input_mode, input_type',
    async (request, agentMsgs, classification) => {
      const { supabase, getCapturedRows } = createInsertCaptureMock()
      await persistMessages(supabase as any, 'user-1', request, agentMsgs, classification)

      const rows = getCapturedRows()
      expect(rows.length).toBe(1 + agentMsgs.length)

      const userRow = rows[0]
      expect(userRow.role).toBe('user')
      expect(userRow.content).toBe(request.content)
      expect(userRow.input_mode).toBe(request.input_mode)
      expect(userRow.input_type).toBe(classification.input_type)
      expect(userRow.confidence).toBe(classification.confidence)
      expect(userRow.is_compacted).toBe(false)
    }
  )

  /**
   * Property 19b: Agent message rows preserve role, content, domain, confidence
   */
  test.prop(
    [arbAgentRequest, fc.array(arbAgentMessage, { minLength: 1, maxLength: 5 }), arbClassification],
    propertyConfig
  )(
    'Property 19: agent message rows preserve role, content, domain, confidence',
    async (request, agentMsgs, classification) => {
      const { supabase, getCapturedRows } = createInsertCaptureMock()
      await persistMessages(supabase as any, 'user-1', request, agentMsgs, classification)

      const rows = getCapturedRows()
      // Skip user row (index 0), check agent rows
      for (let i = 0; i < agentMsgs.length; i++) {
        const row = rows[i + 1]
        const msg = agentMsgs[i]
        expect(row.role).toBe(msg.role)
        expect(row.content).toBe(msg.content)
        expect(row.domain).toBe(msg.domain ?? null)
        expect(row.confidence).toBe(msg.confidence ?? null)
        expect(row.is_compacted).toBe(false)
      }
    }
  )

  /**
   * Property 19c: Agent message rows preserve related_entity_id and related_entity_type when present
   */
  test.prop(
    [
      arbAgentRequest,
      fc.array(
        fc.record({
          role: arbAgentRole,
          content: fc.string({ minLength: 1, maxLength: 100 }),
          domain: fc.option(arbDomain, { nil: undefined }),
          confidence: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
          related_entity_id: fc.uuid(),
          related_entity_type: arbEntityType,
        }) as fc.Arbitrary<AgentMessage>,
        { minLength: 1, maxLength: 3 }
      ),
      arbClassification,
    ],
    propertyConfig
  )(
    'Property 19: related_entity_id and related_entity_type preserved when present',
    async (request, agentMsgs, classification) => {
      const { supabase, getCapturedRows } = createInsertCaptureMock()
      await persistMessages(supabase as any, 'user-1', request, agentMsgs, classification)

      const rows = getCapturedRows()
      for (let i = 0; i < agentMsgs.length; i++) {
        const row = rows[i + 1]
        const msg = agentMsgs[i]
        expect(row.related_entity_id).toBe(msg.related_entity_id)
        expect(row.related_entity_type).toBe(msg.related_entity_type)
      }
    }
  )

  /**
   * Property 19d: User message row has null for agent-only fields (domain, related_entity_*)
   */
  test.prop(
    [arbAgentRequest, fc.array(arbAgentMessage, { minLength: 0, maxLength: 3 }), arbClassification],
    propertyConfig
  )(
    'Property 19: user message row has null for agent-only fields',
    async (request, agentMsgs, classification) => {
      const { supabase, getCapturedRows } = createInsertCaptureMock()
      await persistMessages(supabase as any, 'user-1', request, agentMsgs, classification)

      const userRow = getCapturedRows()[0]
      expect(userRow.domain).toBeNull()
      expect(userRow.related_entity_id).toBeNull()
      expect(userRow.related_entity_type).toBeNull()
    }
  )

  /**
   * Property 19e: Agent message rows have null for input_mode and input_type
   */
  test.prop(
    [arbAgentRequest, fc.array(arbAgentMessage, { minLength: 1, maxLength: 5 }), arbClassification],
    propertyConfig
  )(
    'Property 19: agent message rows have null input_mode and input_type',
    async (request, agentMsgs, classification) => {
      const { supabase, getCapturedRows } = createInsertCaptureMock()
      await persistMessages(supabase as any, 'user-1', request, agentMsgs, classification)

      const rows = getCapturedRows()
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].input_mode).toBeNull()
        expect(rows[i].input_type).toBeNull()
      }
    }
  )

  /**
   * Property 19f: Total row count is always 1 (user) + N (agent messages)
   */
  test.prop(
    [arbAgentRequest, fc.array(arbAgentMessage, { minLength: 0, maxLength: 10 }), arbClassification],
    propertyConfig
  )(
    'Property 19: total row count is 1 + agent message count',
    async (request, agentMsgs, classification) => {
      const { supabase, getCapturedRows } = createInsertCaptureMock()
      await persistMessages(supabase as any, 'user-1', request, agentMsgs, classification)

      expect(getCapturedRows().length).toBe(1 + agentMsgs.length)
    }
  )

  /**
   * Property 19g: All rows have the correct user_id
   */
  test.prop(
    [fc.uuid(), arbAgentRequest, fc.array(arbAgentMessage, { minLength: 0, maxLength: 5 }), arbClassification],
    propertyConfig
  )(
    'Property 19: all rows have the correct user_id',
    async (userId, request, agentMsgs, classification) => {
      const { supabase, getCapturedRows } = createInsertCaptureMock()
      await persistMessages(supabase as any, userId, request, agentMsgs, classification)

      for (const row of getCapturedRows()) {
        expect(row.user_id).toBe(userId)
      }
    }
  )
})

// ─── Property 20: Chat retrieval ordering ────────────────────────────

describe('Property 20: Chat retrieval ordering', () => {

  /**
   * Property 20a: fetchRecentChat returns messages in chronological order (oldest first)
   *
   * Supabase returns messages in descending order (newest first).
   * fetchRecentChat must reverse them to chronological order.
   */
  test.prop(
    [
      fc.array(
        fc.record({
          id: fc.uuid(),
          user_id: fc.constant('user-1'),
          role: fc.constantFrom<ChatRole>('user', 'trainer', 'nutritionist', 'socius', 'system'),
          content: fc.string({ minLength: 1, maxLength: 100 }),
          input_mode: fc.option(arbInputMode, { nil: null }),
          input_type: fc.option(arbInputType, { nil: null }),
          domain: fc.option(arbDomain, { nil: null }),
          confidence: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: null }),
          related_entity_id: fc.option(fc.uuid(), { nil: null }),
          related_entity_type: fc.option(fc.constantFrom('workout', 'meal', 'insight'), { nil: null }),
          is_compacted: fc.constant(false),
          created_at: fc.date({
            min: new Date('2025-01-01T00:00:00.000Z'),
            max: new Date('2026-12-31T00:00:00.000Z'),
            noInvalidDate: true,
          }).map(d => d.toISOString()),
        }) as fc.Arbitrary<ChatMessage>,
        { minLength: 2, maxLength: 20 }
      ),
    ],
    propertyConfig
  )(
    'Property 20: messages returned in chronological order (oldest first)',
    async (messages) => {
      // Sort descending (newest first) to simulate Supabase's order
      const descMessages = [...messages].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      const mock = createFetchMock(descMessages)
      const result = await fetchRecentChat(mock as any, 'user-1')

      // Verify chronological order: each message's created_at <= next message's created_at
      for (let i = 0; i < result.length - 1; i++) {
        const current = new Date(result[i].created_at).getTime()
        const next = new Date(result[i + 1].created_at).getTime()
        expect(current).toBeLessThanOrEqual(next)
      }
    }
  )

  /**
   * Property 20b: fetchRecentChat preserves all message content after reordering
   */
  test.prop(
    [
      fc.array(
        fc.record({
          id: fc.uuid(),
          user_id: fc.constant('user-1'),
          role: fc.constantFrom<ChatRole>('user', 'trainer', 'nutritionist', 'socius', 'system'),
          content: fc.string({ minLength: 1, maxLength: 100 }),
          input_mode: fc.option(arbInputMode, { nil: null }),
          input_type: fc.option(arbInputType, { nil: null }),
          domain: fc.option(arbDomain, { nil: null }),
          confidence: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: null }),
          related_entity_id: fc.option(fc.uuid(), { nil: null }),
          related_entity_type: fc.option(fc.constantFrom('workout', 'meal', 'insight'), { nil: null }),
          is_compacted: fc.constant(false),
          created_at: fc.date({
            min: new Date('2025-01-01T00:00:00.000Z'),
            max: new Date('2026-12-31T00:00:00.000Z'),
            noInvalidDate: true,
          }).map(d => d.toISOString()),
        }) as fc.Arbitrary<ChatMessage>,
        { minLength: 1, maxLength: 15 }
      ),
    ],
    propertyConfig
  )(
    'Property 20: all message content preserved after reordering',
    async (messages) => {
      const descMessages = [...messages].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      const mock = createFetchMock(descMessages)
      const result = await fetchRecentChat(mock as any, 'user-1')

      // Same number of messages
      expect(result.length).toBe(messages.length)

      // Same set of IDs (content preserved, just reordered)
      const inputIds = new Set(messages.map(m => m.id))
      const outputIds = new Set(result.map(m => m.id))
      expect(outputIds).toEqual(inputIds)
    }
  )

  /**
   * Property 20c: fetchRecentChat returns empty array for null data
   */
  test.prop(
    [fc.constant(null)],
    propertyConfig
  )(
    'Property 20: returns empty array for null data',
    async () => {
      const mock = createFetchMock(null as any)
      // Override limit to return null data
      mock._chain.limit.mockReturnValue({ data: null })
      const result = await fetchRecentChat(mock as any, 'user-1')
      expect(result).toEqual([])
    }
  )

  /**
   * Property 20d: fetchRecentChat result length never exceeds input length
   */
  test.prop(
    [
      fc.array(
        fc.record({
          id: fc.uuid(),
          content: fc.string({ minLength: 1, maxLength: 50 }),
          created_at: fc.date({
            min: new Date('2025-01-01T00:00:00.000Z'),
            max: new Date('2026-12-31T00:00:00.000Z'),
            noInvalidDate: true,
          }).map(d => d.toISOString()),
        }),
        { minLength: 0, maxLength: 20 }
      ),
    ],
    propertyConfig
  )(
    'Property 20: result length equals input data length',
    async (messages) => {
      const mock = createFetchMock(messages)
      const result = await fetchRecentChat(mock as any, 'user-1')
      expect(result.length).toBe(messages.length)
    }
  )
})
