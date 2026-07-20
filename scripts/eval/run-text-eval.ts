/**
 * Text-nutrition eval runner (ADR-0002): meal DESCRIPTION -> macros, for the
 * `nutrition` purpose (parse-text / refine). Mirrors run-eval.ts but sends text
 * instead of an image, so we can measure text macro accuracy before flipping the
 * nutrition purpose off Claude. Reuses score.ts.
 */
import { readFile } from 'node:fs/promises'
import { complete } from '@/app/lib/llm/client'
import { extractJson } from '@/app/lib/llm/json'
import type { Candidate, ModelScore, Prediction, PredictionOutcome, TextGoldenItem } from './types'
import { scoreModel } from './score'

const TEXT_PROMPT =
  'Estimate the total nutrition for the meal described below. ' +
  'Return ONLY JSON, no prose: {"protein": <grams>, "carbs": <grams>, "fat": <grams>, "calories": <kcal>}.\n\nMeal: '

function normalize(parsed: Record<string, unknown>): Prediction | undefined {
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined
  const protein = num(parsed.protein)
  const carbs = num(parsed.carbs)
  const fat = num(parsed.fat)
  const calories = num(parsed.calories)
  if (protein == null || carbs == null || fat == null || calories == null) return undefined
  return { protein, carbs, fat, calories }
}

export async function loadTextManifest(path: string): Promise<TextGoldenItem[]> {
  return JSON.parse(await readFile(path, 'utf-8')) as TextGoldenItem[]
}

export async function analyzeTextItem(item: TextGoldenItem): Promise<PredictionOutcome> {
  const start = Date.now()
  try {
    const result = await complete({
      purpose: 'nutrition',
      maxTokens: 400,
      temperature: 0,
      reasoningEffort: 'low',
      messages: [{ role: 'user', content: TEXT_PROMPT + item.text }],
    })
    const parsed = extractJson<Record<string, unknown>>(result.text)
    const prediction = parsed ? normalize(parsed) : undefined
    return { id: item.id, ok: prediction != null, prediction, latencyMs: Date.now() - start, usage: result.usage }
  } catch {
    return { id: item.id, ok: false, latencyMs: Date.now() - start, usage: { input: 0, output: 0 } }
  }
}

/** Evaluate each candidate over the text golden set (nutrition purpose). */
export async function runTextEval(items: TextGoldenItem[], candidates: Candidate[]): Promise<ModelScore[]> {
  const scores: ModelScore[] = []
  for (const candidate of candidates) {
    const prevProvider = process.env.LLM_PROVIDER
    const envKey = `LLM_${candidate.provider.toUpperCase()}_NUTRITION_MODEL`
    const prevModel = process.env[envKey]

    process.env.LLM_PROVIDER = candidate.provider
    process.env[envKey] = candidate.model
    try {
      const outcomes: PredictionOutcome[] = []
      for (const item of items) {
        outcomes.push(await analyzeTextItem(item))
      }
      scores.push(scoreModel(candidate.provider, candidate.model, items, outcomes))
    } finally {
      if (prevProvider === undefined) delete process.env.LLM_PROVIDER
      else process.env.LLM_PROVIDER = prevProvider
      if (prevModel === undefined) delete process.env[envKey]
      else process.env[envKey] = prevModel
    }
  }
  return scores
}
