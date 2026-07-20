/**
 * Env-gated text-nutrition eval. Skipped unless RUN_TEXT_EVAL=1. Makes real
 * `nutrition`-purpose calls against a curated meal-description golden set to
 * decide whether the nutrition purpose can flip off Claude.
 *
 * Example:
 *   RUN_TEXT_EVAL=1 OPENAI_API_KEY=... (ANTHROPIC via .env.local) \
 *   npm test -- test/eval/run-text-eval
 */
import '../live-env' // load .env.local (vercel env pull) for real keys
import { describe, it, expect } from 'vitest'
import { loadTextManifest, runTextEval } from '../../scripts/eval/run-text-eval'
import { formatScoresTable } from '../../scripts/eval/score'
import type { Candidate } from '../../scripts/eval/types'

const RUN = process.env.RUN_TEXT_EVAL === '1'

const DEFAULT_CANDIDATES: Candidate[] = [
  { provider: 'anthropic', model: 'claude-sonnet-4-6' }, // current prod nutrition model
  { provider: 'openai', model: 'gpt-5.4-nano' }, // the default OpenAI nutrition model
  { provider: 'openai', model: 'gpt-5.6-luna' }, // the safer OpenAI option
]

function candidatesFromEnv(): Candidate[] {
  const raw = process.env.TEXT_CANDIDATES
  if (!raw) return DEFAULT_CANDIDATES
  return raw.split(',').map((pair) => {
    const [provider, model] = pair.split(':')
    return { provider: provider as Candidate['provider'], model }
  })
}

describe.skipIf(!RUN)('text-nutrition eval (live)', () => {
  it('ranks candidates on meal-description -> macros', async () => {
    const manifestPath = process.env.TEXT_MANIFEST ?? 'scripts/eval/text-golden-set.json'
    const items = await loadTextManifest(manifestPath)
    const scores = await runTextEval(items, candidatesFromEnv())

    console.log('\n' + formatScoresTable(process.env.EVAL_LAYER || 'text-nutrition', scores) + '\n')
    expect(scores.length).toBeGreaterThan(0)
  }, 600_000)
})
