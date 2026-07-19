/**
 * Tests for classifyInput's LLM path after migration onto the LLM seam.
 *
 * The pure keyword/parse functions are covered elsewhere; this locks that the
 * LLM path calls the seam with the 'fast' purpose and that a seam failure
 * falls back to keyword classification (preserving the original resilience).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../app/lib/llm/client', () => ({ complete: vi.fn() }))

import { classifyInput } from '../../app/lib/agents/classifier'
import { complete } from '../../app/lib/llm/client'

function mockLlmText(text: string) {
  vi.mocked(complete).mockResolvedValue({
    text, toolCalls: [], usage: { input: 20, output: 10 }, stopReason: 'stop', model: 'm', provider: 'anthropic',
  })
}

describe('classifyInput (LLM path via seam)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('classifies via the seam using the fast purpose', async () => {
    mockLlmText(JSON.stringify({ input_type: 'meal_log', domains: ['nutritionist'], confidence: 0.9 }))

    const result = await classifyInput('2 eggs and toast', 'text')

    expect(result.input_type).toBe('meal_log')
    expect(result.domains).toContain('nutritionist')
    expect(vi.mocked(complete).mock.calls[0][0].purpose).toBe('fast')
  })

  it('falls back to keyword classification when the seam call throws', async () => {
    vi.mocked(complete).mockRejectedValue(new Error('provider down'))

    const result = await classifyInput('deadlift 225 for 5 reps', 'text')

    // Keyword fallback should still recognize this as a workout log.
    expect(result.input_type).toBe('workout_log')
    expect(result.domains).toContain('trainer')
  })
})
