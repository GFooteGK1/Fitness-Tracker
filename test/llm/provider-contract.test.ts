/**
 * Dual-adapter contract suite.
 *
 * Feeds each provider its own wire shape for the SAME semantic scenario and
 * asserts both normalize to an identical LlmResult. This is what lets call
 * sites and the agent loop treat providers interchangeably — if a provider's
 * mapping drifts, the migration's core guarantee breaks here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { anthropicCreate, openaiCreate } = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
  openaiCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreate }
  },
}))
vi.mock('openai', () => ({
  default: class {
    responses = { create: openaiCreate }
  },
}))

import { anthropicProvider } from '../../app/lib/llm/providers/anthropic'
import { openaiProvider } from '../../app/lib/llm/providers/openai'
import type { LlmRequest } from '../../app/lib/llm/types'

const req: LlmRequest = {
  purpose: 'agent',
  messages: [{ role: 'user', content: 'hi' }],
  maxTokens: 1000,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('ANTHROPIC_API_KEY', 'test')
  vi.stubEnv('OPENAI_API_KEY', 'test')
})

describe('provider contract parity', () => {
  it('normalizes a plain text response identically', async () => {
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'hello' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      stop_reason: 'end_turn',
    })
    openaiCreate.mockResolvedValue({
      output_text: 'hello',
      output: [],
      usage: { input_tokens: 10, output_tokens: 5 },
      status: 'completed',
      incomplete_details: null,
    })

    const a = await anthropicProvider.chat(req, 'claude-x')
    const o = await openaiProvider.chat(req, 'gpt-x')

    for (const r of [a, o]) {
      expect(r.text).toBe('hello')
      expect(r.toolCalls).toEqual([])
      expect(r.usage).toEqual({ input: 10, output: 5 })
      expect(r.stopReason).toBe('stop')
    }
    expect(a.provider).toBe('anthropic')
    expect(o.provider).toBe('openai')
  })

  it('normalizes a tool call identically', async () => {
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 't1', name: 'log_meal', input: { food: 'eggs' } }],
      usage: { input_tokens: 8, output_tokens: 4 },
      stop_reason: 'tool_use',
    })
    openaiCreate.mockResolvedValue({
      output_text: '',
      output: [{ type: 'function_call', call_id: 't1', name: 'log_meal', arguments: '{"food":"eggs"}' }],
      usage: { input_tokens: 8, output_tokens: 4 },
      status: 'completed',
      incomplete_details: null,
    })

    const a = await anthropicProvider.chat(req, 'claude-x')
    const o = await openaiProvider.chat(req, 'gpt-x')

    for (const r of [a, o]) {
      expect(r.toolCalls).toEqual([{ id: 't1', name: 'log_meal', input: { food: 'eggs' } }])
      expect(r.stopReason).toBe('tool_calls')
    }
  })

  it('normalizes a length-truncated response identically', async () => {
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'partial' }],
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: 'max_tokens',
    })
    openaiCreate.mockResolvedValue({
      output_text: 'partial',
      output: [],
      usage: { input_tokens: 1, output_tokens: 1 },
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
    })

    const a = await anthropicProvider.chat(req, 'claude-x')
    const o = await openaiProvider.chat(req, 'gpt-x')

    expect(a.stopReason).toBe('max_tokens')
    expect(o.stopReason).toBe('max_tokens')
  })

  it('produces an identical neutral continuation shape from appendToolResults', () => {
    const calls = [{ id: 't1', name: 'log_meal', input: { food: 'eggs' } }]
    const results = [{ toolCallId: 't1', content: '{"ok":true}' }]
    const base = [{ role: 'user' as const, content: 'log eggs' }]

    const aMsgs = anthropicProvider.appendToolResults(base, calls, results)
    const oMsgs = openaiProvider.appendToolResults(base, calls, results)

    // The neutral message list is uniform across providers; wire translation
    // happens inside each chat(), not here.
    expect(aMsgs).toEqual(oMsgs)
    for (const msgs of [aMsgs, oMsgs]) {
      expect(msgs).toHaveLength(3)
      expect(msgs[1].role).toBe('assistant')
      expect(msgs[1].toolCalls).toEqual(calls)
      expect(msgs[2].role).toBe('tool')
      expect(msgs[2].toolCallId).toBe('t1')
    }
  })
})
