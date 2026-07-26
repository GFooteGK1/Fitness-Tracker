import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/llm/client', () => ({
  complete: vi.fn(),
  getProvider: vi.fn(),
}))

vi.mock('@/app/lib/agents/tools/executor', () => ({
  executeToolCall: vi.fn(),
}))

import { callAgentWithTools } from '@/app/lib/agents/tools/agentic-loop'
import { executeToolCall } from '@/app/lib/agents/tools/executor'
import { complete, getProvider } from '@/app/lib/llm/client'
import type { LlmMessage, LlmProvider } from '@/app/lib/llm/types'

describe('agentic-loop provider selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the provider that produced the agent result for tool continuation', async () => {
    const continuedMessages: LlmMessage[] = [
      { role: 'user', content: 'What did I eat today?' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'query_meals', input: { date: '2026-07-22' } }],
      },
      { role: 'tool', toolCallId: 'call-1', content: '{"success":true}' },
    ]
    const openaiAppend = vi.fn().mockReturnValue(continuedMessages)
    const anthropicAppend = vi.fn()
    const providers: Record<string, LlmProvider> = {
      openai: {
        name: 'openai',
        chat: vi.fn(),
        appendToolResults: openaiAppend,
      },
      anthropic: {
        name: 'anthropic',
        chat: vi.fn(),
        appendToolResults: anthropicAppend,
      },
    }

    vi.mocked(getProvider).mockImplementation((name = 'anthropic') => providers[name])
    vi.mocked(executeToolCall).mockResolvedValue({
      success: true,
      data: { meals: [] },
    })
    vi.mocked(complete)
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [
          { id: 'call-1', name: 'query_meals', input: { date: '2026-07-22' } },
        ],
        usage: { input: 20, output: 8 },
        stopReason: 'tool_calls',
        model: 'gpt-5.6-terra',
        provider: 'openai',
      })
      .mockResolvedValueOnce({
        text: 'You have not logged any meals today.',
        toolCalls: [],
        usage: { input: 30, output: 10 },
        stopReason: 'stop',
        model: 'gpt-5.6-terra',
        provider: 'openai',
      })

    const result = await callAgentWithTools({
      systemPrompt: 'Use tools when needed.',
      userInput: 'What did I eat today?',
      tools: [{ name: 'query_meals', parameters: { type: 'object' } }],
      userId: 'user-1',
      supabase: {} as never,
    })

    expect(getProvider).toHaveBeenCalledWith('openai')
    expect(openaiAppend).toHaveBeenCalledWith(
      [{ role: 'user', content: 'What did I eat today?' }],
      [{ id: 'call-1', name: 'query_meals', input: { date: '2026-07-22' } }],
      [{
        toolCallId: 'call-1',
        content: JSON.stringify({ success: true, data: { meals: [] } }),
      }],
    )
    expect(anthropicAppend).not.toHaveBeenCalled()
    expect(vi.mocked(complete).mock.calls[1][0].messages).toBe(continuedMessages)
    expect(result).toEqual({
      text: 'You have not logged any meals today.',
      toolCalls: [{
        name: 'query_meals',
        input: { date: '2026-07-22' },
        result: { success: true, data: { meals: [] } },
      }],
      totalTokens: { input: 50, output: 18 },
    })
  })
})
