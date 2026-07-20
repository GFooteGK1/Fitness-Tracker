/**
 * Env-gated LIVE smoke test for the LLM seam (uiz.4).
 *
 * Skipped unless RUN_LLM_SMOKE=1. When enabled it makes REAL API calls against
 * the active provider (LLM_PROVIDER, default anthropic) using real keys — a
 * manual pre-deploy / post-flip check, never part of CI.
 *
 * Examples:
 *   RUN_LLM_SMOKE=1 ANTHROPIC_API_KEY=... npm test -- test/llm/smoke
 *   RUN_LLM_SMOKE=1 LLM_PROVIDER=openai OPENAI_API_KEY=... npm test -- test/llm/smoke
 */
import '../live-env' // load .env.local (vercel env pull) for real keys
import { describe, it, expect } from 'vitest'
import { complete, getActiveProviderName, getModel } from '../../app/lib/llm/client'

const RUN = process.env.RUN_LLM_SMOKE === '1'

describe.skipIf(!RUN)('LLM seam — live smoke', () => {
  it('reports the active provider + per-purpose models', () => {
    const provider = getActiveProviderName()
    const purposes = ['nutrition', 'vision', 'workout', 'query', 'agent', 'fast'] as const
    console.log('[smoke] provider:', provider)
    for (const p of purposes) console.log(`[smoke]   ${p} -> ${getModel(p)}`)
    expect(provider).toBeDefined()
  })

  it('text extraction returns non-empty text (nutrition purpose)', async () => {
    const r = await complete({
      purpose: 'nutrition',
      system: 'You return only compact JSON.',
      messages: [{ role: 'user', content: 'Return exactly {"ok":true}.' }],
      maxTokens: 100,
      temperature: 0,
      reasoningEffort: 'low',
    })
    console.log('[smoke] nutrition:', r.provider, r.model, r.usage, JSON.stringify(r.text).slice(0, 100))
    expect(r.text.length).toBeGreaterThan(0)
  }, 30_000)

  it('agent tool-call round-trips (agent purpose)', async () => {
    const r = await complete({
      purpose: 'agent',
      system: 'When asked to echo, call the echo tool with the given message.',
      messages: [{ role: 'user', content: 'echo the word hello' }],
      tools: [
        {
          name: 'echo',
          description: 'Echo a message back',
          parameters: {
            type: 'object',
            properties: { message: { type: 'string' } },
            required: ['message'],
          },
        },
      ],
      maxTokens: 200,
      temperature: 0,
    })
    console.log('[smoke] agent:', r.provider, r.model, 'toolCalls:', r.toolCalls.length, 'stop:', r.stopReason)
    expect(r.provider).toBeDefined()
  }, 30_000)
})
