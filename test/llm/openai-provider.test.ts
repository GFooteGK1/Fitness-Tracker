/**
 * Tests for the OpenAI provider's request/response mapping (Responses API).
 *
 * Verifies neutral LlmRequest -> Responses params (instructions, images,
 * tools, json_schema, reasoning) and Response -> LlmResult normalization
 * (output_text, function_call extraction, usage, stop-reason incl. length).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('openai', () => ({
  default: class {
    responses = { create: mockCreate }
  },
}))

import { openaiProvider } from '../../app/lib/llm/providers/openai'
import type { LlmRequest } from '../../app/lib/llm/types'

function baseResponse(overrides: Record<string, unknown> = {}) {
  return {
    output_text: '',
    output: [],
    usage: { input_tokens: 0, output_tokens: 0 },
    status: 'completed',
    incomplete_details: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('OPENAI_API_KEY', 'test-key')
})

describe('openaiProvider.chat', () => {
  it('normalizes a plain text response and maps system -> instructions', async () => {
    mockCreate.mockResolvedValue(
      baseResponse({ output_text: 'hello world', usage: { input_tokens: 12, output_tokens: 3 } })
    )

    const req: LlmRequest = {
      purpose: 'nutrition',
      system: 'You are a nutritionist.',
      messages: [{ role: 'user', content: 'log my lunch' }],
      maxTokens: 1024,
      temperature: 0,
    }
    const result = await openaiProvider.chat(req, 'gpt-5.4-nano')

    expect(result.text).toBe('hello world')
    expect(result.usage).toEqual({ input: 12, output: 3 })
    expect(result.stopReason).toBe('stop')
    expect(result.provider).toBe('openai')

    const params = mockCreate.mock.calls[0][0]
    expect(params.model).toBe('gpt-5.4-nano')
    expect(params.max_output_tokens).toBe(1024)
    expect(params.instructions).toBe('You are a nutritionist.')
  })

  it('maps an image content part to an input_image data URL', async () => {
    mockCreate.mockResolvedValue(baseResponse({ output_text: 'ok' }))

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
    await openaiProvider.chat(req, 'gpt-5.6-luna')

    const params = mockCreate.mock.calls[0][0]
    const block = params.input[0].content[0]
    expect(block).toEqual({
      type: 'input_image',
      image_url: 'data:image/png;base64,AAAA',
      detail: 'auto',
    })
  })

  it('extracts function_call output items and maps to tool_calls', async () => {
    mockCreate.mockResolvedValue(
      baseResponse({
        output: [
          { type: 'function_call', call_id: 'c1', name: 'log_meal', arguments: '{"food":"eggs"}' },
        ],
      })
    )

    const req: LlmRequest = {
      purpose: 'agent',
      messages: [{ role: 'user', content: 'log 3 eggs' }],
      tools: [{ name: 'log_meal', description: 'log a meal', parameters: { type: 'object' } }],
      maxTokens: 4096,
    }
    const result = await openaiProvider.chat(req, 'gpt-5.6-terra')

    expect(result.toolCalls).toEqual([{ id: 'c1', name: 'log_meal', input: { food: 'eggs' } }])
    expect(result.stopReason).toBe('tool_calls')

    const params = mockCreate.mock.calls[0][0]
    expect(params.tools[0]).toEqual({
      type: 'function',
      name: 'log_meal',
      description: 'log a meal',
      parameters: { type: 'object' },
      strict: false,
    })
  })

  it('requests strict json_schema structured output when asked', async () => {
    mockCreate.mockResolvedValue(baseResponse({ output_text: '{}' }))

    const req: LlmRequest = {
      purpose: 'nutrition',
      messages: [{ role: 'user', content: 'parse this' }],
      maxTokens: 1024,
      responseFormat: 'json',
      jsonSchema: { name: 'meal', schema: { type: 'object' } },
      reasoningEffort: 'low',
    }
    await openaiProvider.chat(req, 'gpt-5.4-nano')

    const params = mockCreate.mock.calls[0][0]
    expect(params.text.format).toEqual({
      type: 'json_schema',
      name: 'meal',
      schema: { type: 'object' },
      strict: true,
    })
    expect(params.reasoning).toEqual({ effort: 'low' })
  })

  it('maps an incomplete (length-capped) response to max_tokens', async () => {
    mockCreate.mockResolvedValue(
      baseResponse({
        output_text: 'partial',
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
      })
    )

    const result = await openaiProvider.chat(
      { purpose: 'workout', messages: [{ role: 'user', content: 'x' }], maxTokens: 8 },
      'gpt-5.4-nano'
    )
    expect(result.stopReason).toBe('max_tokens')
  })
})
