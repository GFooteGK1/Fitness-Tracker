/**
 * Property-Based Tests for Chat Compaction
 *
 * Feature: agent-system, Property 21: Chat compaction threshold
 *
 * *For any* user with more than the configured threshold of non-compacted messages,
 * running compaction SHALL reduce the non-compacted message count to at most the
 * threshold, and the compacted summary SHALL contain references to all entity IDs
 * and PR mentions from the original messages.
 *
 * **Validates: Requirements 6.6, 6.7**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect, vi } from 'vitest'
import {
  extractKeyFacts,
  generateCompactionSummary,
  compactOldMessages,
} from '@/app/lib/agents/chat-compaction'
import type {
  ChatMessage,
  ChatRole,
  InputMode,
  InputType,
  AgentDomain,
} from '@/app/lib/agents/types'

const propertyConfig = { numRuns: 100 }

// ─── Arbitraries ─────────────────────────────────────────────────────

const VALID_ROLES: ChatRole[] = ['user', 'trainer', 'nutritionist', 'socius', 'system']
const VALID_INPUT_MODES: InputMode[] = ['text', 'voice', 'photo', 'file']
const VALID_INPUT_TYPES: InputType[] = ['workout_log', 'meal_log', 'question', 'mixed', 'unclear']
const VALID_DOMAINS: AgentDomain[] = ['trainer', 'nutritionist', 'socius']

const arbRole = fc.constantFrom<ChatRole>(...VALID_ROLES)
const arbInputMode = fc.constantFrom<InputMode>(...VALID_INPUT_MODES)
const arbInputType = fc.constantFrom<InputType>(...VALID_INPUT_TYPES)
const arbDomain = fc.constantFrom<AgentDomain>(...VALID_DOMAINS)

/** Safe ISO date string arbitrary */
const arbISODate = fc.date({ min: new Date('2025-01-01T00:00:00.000Z'), max: new Date('2026-12-31T00:00:00.000Z'), noInvalidDate: true })
  .map(d => d.toISOString())

/** Generate a ChatMessage with optional overrides */
const arbChatMessage = (overrides: Partial<ChatMessage> = {}): fc.Arbitrary<ChatMessage> =>
  fc.record({
    id: fc.uuid(),
    user_id: fc.constant(overrides.user_id ?? 'user-1'),
    role: overrides.role ? fc.constant(overrides.role) : arbRole,
    content: overrides.content ? fc.constant(overrides.content) : fc.string({ minLength: 1, maxLength: 200 }),
    input_mode: fc.option(arbInputMode, { nil: null }),
    input_type: fc.option(arbInputType, { nil: null }),
    domain: fc.option(arbDomain, { nil: null }),
    confidence: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: null }),
    related_entity_id: overrides.related_entity_id !== undefined
      ? fc.constant(overrides.related_entity_id)
      : fc.option(fc.uuid(), { nil: null }),
    related_entity_type: overrides.related_entity_type !== undefined
      ? fc.constant(overrides.related_entity_type)
      : fc.option(fc.constantFrom('workout', 'meal', 'insight'), { nil: null }),
    is_compacted: fc.constant(false),
    created_at: arbISODate,
  }) as fc.Arbitrary<ChatMessage>

/** Generate a message with a workout entity reference */
const arbWorkoutMessage: fc.Arbitrary<ChatMessage> = fc.record({
  id: fc.uuid(),
  user_id: fc.constant('user-1'),
  role: arbRole,
  content: fc.string({ minLength: 1, maxLength: 200 }),
  input_mode: fc.option(arbInputMode, { nil: null }),
  input_type: fc.option(arbInputType, { nil: null }),
  domain: fc.option(arbDomain, { nil: null }),
  confidence: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: null }),
  related_entity_id: fc.uuid(),
  related_entity_type: fc.constant('workout' as const),
  is_compacted: fc.constant(false),
  created_at: arbISODate,
}) as fc.Arbitrary<ChatMessage>

/** Generate a message with a meal entity reference */
const arbMealMessage: fc.Arbitrary<ChatMessage> = fc.record({
  id: fc.uuid(),
  user_id: fc.constant('user-1'),
  role: arbRole,
  content: fc.string({ minLength: 1, maxLength: 200 }),
  input_mode: fc.option(arbInputMode, { nil: null }),
  input_type: fc.option(arbInputType, { nil: null }),
  domain: fc.option(arbDomain, { nil: null }),
  confidence: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: null }),
  related_entity_id: fc.uuid(),
  related_entity_type: fc.constant('meal' as const),
  is_compacted: fc.constant(false),
  created_at: arbISODate,
}) as fc.Arbitrary<ChatMessage>

/** Generate a message with PR mention in content */
const arbPRMessage: fc.Arbitrary<ChatMessage> = fc
  .tuple(
    fc.constantFrom('PR', 'pr', 'Personal Record', 'personal record'),
    fc.string({ minLength: 1, maxLength: 100 }),
  )
  .chain(([prKeyword, rest]) =>
    fc.record({
      id: fc.uuid(),
      user_id: fc.constant('user-1'),
      role: arbRole,
      content: fc.constant(`${prKeyword} ${rest}`),
      input_mode: fc.option(arbInputMode, { nil: null }),
      input_type: fc.option(arbInputType, { nil: null }),
      domain: fc.option(arbDomain, { nil: null }),
      confidence: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: null }),
      related_entity_id: fc.option(fc.uuid(), { nil: null }),
      related_entity_type: fc.option(fc.constantFrom('workout', 'meal', 'insight'), { nil: null }),
      is_compacted: fc.constant(false),
      created_at: arbISODate,
    }) as fc.Arbitrary<ChatMessage>,
  )


// ─── Mock Helpers ────────────────────────────────────────────────────

function createCompactionMock(opts: {
  count: number | null
  oldMessages: ChatMessage[]
}) {
  const insertFn = vi.fn().mockReturnValue({ error: null })
  const updateFn = vi.fn().mockReturnThis()
  const inFn = vi.fn().mockReturnValue({ error: null })

  let fromCallIndex = 0
  const fromFn = vi.fn(() => {
    const idx = fromCallIndex++
    if (idx === 0) {
      // Count query
      const countChain: Record<string, any> = { count: opts.count }
      countChain.eq = vi.fn().mockReturnValue(countChain)
      return { select: vi.fn().mockReturnValue(countChain) }
    }
    if (idx === 1) {
      // Select old messages
      const selChain: Record<string, any> = {}
      selChain.eq = vi.fn().mockReturnValue(selChain)
      selChain.order = vi.fn().mockReturnValue(selChain)
      selChain.limit = vi.fn().mockReturnValue({ data: opts.oldMessages })
      return { select: vi.fn().mockReturnValue(selChain) }
    }
    if (idx === 2) {
      // Insert compacted summary
      return { insert: insertFn }
    }
    // Update originals
    return { update: updateFn, in: inFn }
  })

  return { from: fromFn, _insertFn: insertFn, _updateFn: updateFn, _inFn: inFn }
}

// ─── Property 21a: extractKeyFacts preserves ALL workout entity references ──

describe('Property 21: Chat compaction threshold', () => {

  /**
   * extractKeyFacts preserves ALL workout entity references from input messages.
   * **Validates: Requirements 6.6, 6.7**
   */
  test.prop(
    [fc.array(arbWorkoutMessage, { minLength: 1, maxLength: 10 })],
    propertyConfig,
  )(
    'extractKeyFacts preserves ALL workout entity references',
    (workoutMessages) => {
      const facts = extractKeyFacts(workoutMessages)
      for (const msg of workoutMessages) {
        expect(facts).toContain(`Logged workout: ${msg.related_entity_id}`)
      }
    },
  )

  /**
   * extractKeyFacts preserves ALL meal entity references from input messages.
   * **Validates: Requirements 6.6, 6.7**
   */
  test.prop(
    [fc.array(arbMealMessage, { minLength: 1, maxLength: 10 })],
    propertyConfig,
  )(
    'extractKeyFacts preserves ALL meal entity references',
    (mealMessages) => {
      const facts = extractKeyFacts(mealMessages)
      for (const msg of mealMessages) {
        expect(facts).toContain(`Logged meal: ${msg.related_entity_id}`)
      }
    },
  )

  /**
   * extractKeyFacts preserves ALL PR mentions from input messages.
   * **Validates: Requirements 6.6, 6.7**
   */
  test.prop(
    [fc.array(arbPRMessage, { minLength: 1, maxLength: 10 })],
    propertyConfig,
  )(
    'extractKeyFacts preserves ALL PR mentions',
    (prMessages) => {
      const facts = extractKeyFacts(prMessages)
      const prFacts = facts.filter(f => f.startsWith('PR mentioned:'))
      // At least one PR fact per message (content always contains a PR keyword)
      expect(prFacts.length).toBeGreaterThanOrEqual(prMessages.length)
    },
  )

  /**
   * generateCompactionSummary.original_message_count equals input message count.
   * **Validates: Requirements 6.6, 6.7**
   */
  test.prop(
    [
      fc.array(arbChatMessage(), { minLength: 1, maxLength: 20 }),
      fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 10 }),
    ],
    propertyConfig,
  )(
    'generateCompactionSummary.original_message_count equals input message count',
    (messages, keyFacts) => {
      const result = generateCompactionSummary(messages, keyFacts)
      expect(result.original_message_count).toBe(messages.length)
    },
  )

  /**
   * generateCompactionSummary.key_facts equals the key facts passed in.
   * **Validates: Requirements 6.6, 6.7**
   */
  test.prop(
    [
      fc.array(arbChatMessage(), { minLength: 1, maxLength: 10 }),
      fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 10 }),
    ],
    propertyConfig,
  )(
    'generateCompactionSummary.key_facts equals the key facts passed in',
    (messages, keyFacts) => {
      const result = generateCompactionSummary(messages, keyFacts)
      expect(result.key_facts).toEqual(keyFacts)
    },
  )

  /**
   * compactOldMessages does NOT compact when count <= threshold.
   * **Validates: Requirements 6.6, 6.7**
   */
  test.prop(
    [
      fc.integer({ min: 1, max: 500 }),  // threshold
      fc.integer({ min: 0, max: 500 }),  // count offset (will be clamped to <= threshold)
    ],
    propertyConfig,
  )(
    'compactOldMessages does NOT compact when count <= threshold',
    async (threshold, rawCount) => {
      const count = Math.min(rawCount, threshold) // ensure count <= threshold
      const mock = createCompactionMock({ count, oldMessages: [] })

      await compactOldMessages(mock as any, 'user-1', threshold)

      // from() should only be called once (count query), no insert/update
      expect(mock.from).toHaveBeenCalledTimes(1)
    },
  )

  /**
   * compactOldMessages DOES compact when count > threshold (verify insert and update are called).
   * **Validates: Requirements 6.6, 6.7**
   */
  test.prop(
    [
      fc.integer({ min: 1, max: 100 }),  // threshold
      fc.integer({ min: 1, max: 50 }),   // excess above threshold
      fc.array(arbChatMessage(), { minLength: 1, maxLength: 10 }),
    ],
    propertyConfig,
  )(
    'compactOldMessages DOES compact when count > threshold',
    async (threshold, excess, messages) => {
      const count = threshold + excess
      const mock = createCompactionMock({ count, oldMessages: messages })

      await compactOldMessages(mock as any, 'user-1', threshold)

      // from() should be called 4 times: count, select, insert, update
      expect(mock.from).toHaveBeenCalledTimes(4)

      // Insert was called with a system summary message
      const insertCall = mock._insertFn.mock.calls[0]?.[0]
      expect(insertCall).toBeDefined()
      expect(insertCall.role).toBe('system')
      expect(insertCall.is_compacted).toBe(true)
      expect(insertCall.user_id).toBe('user-1')
    },
  )
})
