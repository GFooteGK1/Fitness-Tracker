/**
 * Tests for the Anthropic provider's request/response mapping.
 *
 * Verifies the neutral LlmRequest → Messages API mapping (system, images,
 * tools) and the Anthropic response → LlmResult normalization (text join,
 * tool_use extraction, usage, stop-reason mapping).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

import { anthropicProvider } from '../../app/lib/llm/providers/anthropic'
import type { LlmRequest } from '../../app/lib/llm/types'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
})

describe('anthropicProvider.chat', () => {
  it('normalizes a plain text response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'hello ' }, { type: 'text', text: 'world' }],
      usage: { input_tokens: 12, output_tokens: 3 },
      stop_reason: 'end_turn',
    })

    const req: LlmRequest = {
      purpose: 'nutrition',
      system: 'You are a nutritionist.',
      messages: [{ role: 'user', content: 'log my lunch' }],
      maxTokens: 1024,
      temperature: 0,
    }
    const result = await anthropicProvider.chat(req, 'claude-test-model')

    expect(result.text).toBe('hello world')
    expect(result.toolCalls).toEqual([])
    expect(result.usage).toEqual({ input: 12, output: 3 })
    expect(result.stopReason).toBe('stop')
    expect(result.provider).toBe('anthropic')
    expect(result.model).toBe('claude-test-model')

    // Request mapping: model, max_tokens, system, temperature threaded through.
    const params = mockCreate.mock.calls[0][0]
    expect(params.model).toBe('claude-test-model')
    expect(params.max_tokens).toBe(1024)
    expect(params.system).toBe('You are a nutritionist.')
    expect(params.temperature).toBe(0)
  })

  it('maps an image content part to an Anthropic base64 image block', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: 'end_turn',
    })

    const req: LlmRequest = {
      purpose: 'vision',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', mediaType: 'image/png', base64: 'AAAA' },
            { type: 'text', text: 'what is this?' },
          ],
        },
      ],
      maxTokens: 512,
    }
    await anthropicProvider.chat(req, 'claude-vision')

    const params = mockCreate.mock.calls[0][0]
    const block = params.messages[0].content[0]
    expect(block.type).toBe('image')
    expect(block.source).toEqual({ type: 'base64', media_type: 'image/png', data: 'AAAA' })
  })

  it('extracts tool_use blocks and maps stop_reason to tool_calls', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: '' },
        { type: 'tool_use', id: 'tu_1', name: 'log_meal', input: { food: 'eggs' } },
      ],
      usage: { input_tokens: 20, output_tokens: 8 },
      stop_reason: 'tool_use',
    })

    const req: LlmRequest = {
      purpose: 'agent',
      messages: [{ role: 'user', content: 'log 3 eggs' }],
      tools: [{ name: 'log_meal', description: 'log a meal', parameters: { type: 'object' } }],
      maxTokens: 4096,
    }
    const result = await anthropicProvider.chat(req, 'claude-agent')

    expect(result.toolCalls).toEqual([{ id: 'tu_1', name: 'log_meal', input: { food: 'eggs' } }])
    expect(result.stopReason).toBe('tool_calls')

    // Tools are forwarded with input_schema.
    const params = mockCreate.mock.calls[0][0]
    expect(params.tools[0]).toEqual({
      name: 'log_meal',
      description: 'log a meal',
      input_schema: { type: 'object' },
    })
  })

  it('collapses tool result messages into a single user tool_result turn', async () => {
    const messages = anthropicProvider.appendToolResults(
      [{ role: 'user', content: 'log 3 eggs' }],
      [{ id: 'tu_1', name: 'log_meal', input: { food: 'eggs' } }],
      [{ toolCallId: 'tu_1', content: '{"meal_id":"m1"}' }]
    )
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'done' }],
      usage: { input_tokens: 5, output_tokens: 2 },
      stop_reason: 'end_turn',
    })

    await anthropicProvider.chat(
      { purpose: 'agent', messages, maxTokens: 4096 },
      'claude-agent'
    )

    const params = mockCreate.mock.calls[0][0]
    // [user, assistant(tool_use), user(tool_result)]
    expect(params.messages).toHaveLength(3)
    expect(params.messages[1].role).toBe('assistant')
    expect(params.messages[1].content.some((b: any) => b.type === 'tool_use')).toBe(true)
    expect(params.messages[2].role).toBe('user')
    expect(params.messages[2].content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'tu_1',
      content: '{"meal_id":"m1"}',
    })
  })
})
