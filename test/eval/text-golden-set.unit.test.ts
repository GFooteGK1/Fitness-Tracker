/**
 * Validates the curated text-nutrition golden set is well-formed, and that the
 * scorer accepts text items (id + truth).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { scoreModel } from '../../scripts/eval/score'
import type { TextGoldenItem, PredictionOutcome } from '../../scripts/eval/types'

const items: TextGoldenItem[] = JSON.parse(
  readFileSync('scripts/eval/text-golden-set.json', 'utf-8')
)

describe('text-golden-set.json', () => {
  it('has a reasonable number of well-formed items', () => {
    expect(items.length).toBeGreaterThanOrEqual(10)
    for (const it of items) {
      expect(typeof it.id).toBe('string')
      expect(it.text.trim().length).toBeGreaterThan(0)
      for (const k of ['protein', 'carbs', 'fat', 'calories'] as const) {
        expect(typeof it.truth[k]).toBe('number')
        expect(it.truth[k]).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('scoreModel accepts text golden items', () => {
    const outcomes: PredictionOutcome[] = items.map((it) => ({
      id: it.id,
      ok: true,
      prediction: { ...it.truth }, // perfect prediction -> zero error
      latencyMs: 1,
      usage: { input: 1, output: 1 },
    }))
    const s = scoreModel('openai', 'gpt-5.4-nano', items, outcomes)
    expect(s.refusalRate).toBe(0)
    expect(s.protein.mae).toBe(0)
    expect(s.calories.mae).toBe(0)
  })
})
