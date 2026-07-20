/**
 * Env-gated runner for the food-photo eval (ADR-0002). Skipped unless
 * RUN_EVAL=1. Makes REAL vision calls, so it needs image files + API keys —
 * a manual eval, never CI.
 *
 * Example:
 *   RUN_EVAL=1 EVAL_MANIFEST=scripts/eval/manifest.nutrition5k.json \
 *   OPENAI_API_KEY=... ANTHROPIC_API_KEY=... npm test -- test/eval/run-eval
 *
 * Candidates default to the migration's shortlist; override with EVAL_CANDIDATES
 * as a comma list of provider:model (e.g. "openai:gpt-5.6-luna,openai:gpt-5.4-nano").
 */
import '../live-env' // load .env.local (vercel env pull) for real keys
import { describe, it, expect } from 'vitest'
import { loadManifest, runEval } from '../../scripts/eval/run-eval'
import { formatScoresTable } from '../../scripts/eval/score'
import type { Candidate } from '../../scripts/eval/types'

const RUN = process.env.RUN_EVAL === '1'

const DEFAULT_CANDIDATES: Candidate[] = [
  { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' }, // current baseline
  { provider: 'openai', model: 'gpt-5.4-nano' },
  { provider: 'openai', model: 'gpt-5.6-luna' },
  { provider: 'openai', model: 'gpt-5.6-terra' },
]

function candidatesFromEnv(): Candidate[] {
  const raw = process.env.EVAL_CANDIDATES
  if (!raw) return DEFAULT_CANDIDATES
  return raw.split(',').map((pair) => {
    const [provider, model] = pair.split(':')
    return { provider: provider as Candidate['provider'], model }
  })
}

describe.skipIf(!RUN)('food-photo eval (live)', () => {
  it('ranks candidates over the golden set', async () => {
    const manifestPath = process.env.EVAL_MANIFEST
    expect(manifestPath, 'set EVAL_MANIFEST to a golden-set JSON path').toBeTruthy()

    const items = await loadManifest(manifestPath!)
    const scores = await runEval(items, candidatesFromEnv())

    console.log('\n' + formatScoresTable(process.env.EVAL_LAYER || 'eval', scores) + '\n')
    expect(scores.length).toBeGreaterThan(0)
  }, 600_000)
})
