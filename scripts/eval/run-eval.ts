/**
 * Seam-driven runner for the food-photo → macro eval (ADR-0002).
 *
 * Drives the SAME seam the app uses (`complete({ purpose: 'vision' })`), selecting
 * each candidate via the per-purpose env override — no app code changes. Loads a
 * golden-set manifest, runs every item through each candidate, and scores the
 * results. Requires image files + real API keys, so it is invoked from the
 * gated runner test (RUN_EVAL=1), not in CI.
 *
 * PLUG-IN POINTS for the operator:
 *   1. A manifest JSON of GoldenItem[] (e.g. built from a Nutrition5k export).
 *   2. Real ANTHROPIC_API_KEY / OPENAI_API_KEY in the environment.
 */
import { readFile } from 'node:fs/promises'
import { complete } from '@/app/lib/llm/client'
import { extractJson } from '@/app/lib/llm/json'
import type { Candidate, GoldenItem, Prediction, PredictionOutcome, ModelScore } from './types'
import { scoreModel } from './score'

// A controlled, flat-shape prompt for the eval (independent of the app routes'
// prompts) so parsing is uniform across items and models.
const EVAL_PROMPT =
  'Estimate the total nutrition for the whole plate in this photo. ' +
  'Return ONLY JSON, no prose: ' +
  '{"protein": <grams>, "carbs": <grams>, "fat": <grams>, "calories": <kcal>, "mass_g": <total grams or null>}.'

function normalize(parsed: Record<string, unknown>): Prediction | undefined {
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined
  const protein = num(parsed.protein)
  const carbs = num(parsed.carbs)
  const fat = num(parsed.fat)
  const calories = num(parsed.calories)
  if (protein == null || carbs == null || fat == null || calories == null) return undefined
  return { protein, carbs, fat, calories, mass_g: num(parsed.mass_g) }
}

/** Load a manifest of GoldenItem[] from a JSON file. */
export async function loadManifest(path: string): Promise<GoldenItem[]> {
  const raw = await readFile(path, 'utf-8')
  return JSON.parse(raw) as GoldenItem[]
}

/** Run one item through the currently-active provider/model via the seam. */
export async function analyzeItem(item: GoldenItem): Promise<PredictionOutcome> {
  const base64 = (await readFile(item.imagePath)).toString('base64')
  const start = Date.now()
  try {
    const result = await complete({
      purpose: 'vision',
      maxTokens: 1024,
      temperature: 0,
      reasoningEffort: 'low',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', mediaType: item.mediaType, base64 },
            { type: 'text', text: EVAL_PROMPT },
          ],
        },
      ],
    })
    const parsed = extractJson<Record<string, unknown>>(result.text)
    const prediction = parsed ? normalize(parsed) : undefined
    return {
      id: item.id,
      ok: prediction != null,
      prediction,
      latencyMs: Date.now() - start,
      usage: result.usage,
    }
  } catch {
    return { id: item.id, ok: false, latencyMs: Date.now() - start, usage: { input: 0, output: 0 } }
  }
}

/**
 * Evaluate every candidate over the manifest. Each candidate is selected by
 * setting the seam's env overrides before its batch; getModel/getActiveProviderName
 * read env per call, so no app code changes are needed.
 */
export async function runEval(items: GoldenItem[], candidates: Candidate[]): Promise<ModelScore[]> {
  const scores: ModelScore[] = []
  for (const candidate of candidates) {
    const prevProvider = process.env.LLM_PROVIDER
    const envKey = `LLM_${candidate.provider.toUpperCase()}_VISION_MODEL`
    const prevModel = process.env[envKey]

    process.env.LLM_PROVIDER = candidate.provider
    process.env[envKey] = candidate.model
    try {
      const outcomes: PredictionOutcome[] = []
      for (const item of items) {
        outcomes.push(await analyzeItem(item))
      }
      scores.push(scoreModel(candidate.provider, candidate.model, items, outcomes))
    } finally {
      // Restore env so candidates don't leak into each other.
      if (prevProvider === undefined) delete process.env.LLM_PROVIDER
      else process.env.LLM_PROVIDER = prevProvider
      if (prevModel === undefined) delete process.env[envKey]
      else process.env[envKey] = prevModel
    }
  }
  return scores
}
