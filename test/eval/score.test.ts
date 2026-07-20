/**
 * Unit tests for the eval scoring module (pure — no data/keys needed).
 */
import { describe, it, expect } from 'vitest'
import { mean, median, scoreMacro, scoreModel, formatScoresTable } from '../../scripts/eval/score'
import type { GoldenItem, PredictionOutcome } from '../../scripts/eval/types'

describe('mean / median', () => {
  it('mean of empty is 0', () => expect(mean([])).toBe(0))
  it('mean averages', () => expect(mean([2, 4, 6])).toBe(4))
  it('median odd', () => expect(median([3, 1, 2])).toBe(2))
  it('median even averages the middle two', () => expect(median([1, 2, 3, 4])).toBe(2.5))
  it('median of empty is 0', () => expect(median([])).toBe(0))
})

describe('scoreMacro', () => {
  it('computes MAE and median APE, skipping truth=0 for APE', () => {
    const s = scoreMacro([
      { pred: 10, truth: 8 }, // ae 2, ape 25%
      { pred: 20, truth: 20 }, // ae 0, ape 0%
      { pred: 5, truth: 0 }, // ae 5, ape undefined (skipped)
    ])
    expect(s.n).toBe(3)
    expect(s.mae).toBeCloseTo((2 + 0 + 5) / 3, 5)
    // APE values over truth>0: [25, 0] -> median 12.5
    expect(s.medApe).toBe(12.5)
  })

  it('empty is zeroed', () => {
    expect(scoreMacro([])).toEqual({ mae: 0, medApe: 0, n: 0 })
  })
})

describe('scoreModel', () => {
  const items: GoldenItem[] = [
    { id: 'a', imagePath: 'a.jpg', mediaType: 'image/jpeg', truth: { protein: 30, carbs: 40, fat: 10, calories: 400, mass_g: 300 } },
    { id: 'b', imagePath: 'b.jpg', mediaType: 'image/jpeg', truth: { protein: 20, carbs: 20, fat: 5, calories: 200 } },
    { id: 'c', imagePath: 'c.jpg', mediaType: 'image/jpeg', truth: { protein: 10, carbs: 10, fat: 2, calories: 100 } },
  ]

  it('aggregates macro errors, refusal rate, tokens; mass only when present on both', () => {
    const outcomes: PredictionOutcome[] = [
      { id: 'a', ok: true, prediction: { protein: 33, carbs: 40, fat: 10, calories: 420, mass_g: 330 }, latencyMs: 1000, usage: { input: 100, output: 50 } },
      { id: 'b', ok: true, prediction: { protein: 20, carbs: 22, fat: 5, calories: 200 }, latencyMs: 2000, usage: { input: 100, output: 40 } },
      { id: 'c', ok: false, latencyMs: 500, usage: { input: 100, output: 0 } }, // refusal/parse fail
    ]
    const s = scoreModel('openai', 'gpt-5.6-luna', items, outcomes)

    expect(s.attempted).toBe(3)
    expect(s.refusalRate).toBeCloseTo(1 / 3, 5)
    // protein errors on the 2 parsed items: |33-30|=3, |20-20|=0 -> MAE 1.5
    expect(s.protein.mae).toBeCloseTo(1.5, 5)
    expect(s.protein.n).toBe(2)
    // mass present only for item 'a' (both truth + pred have it)
    expect(s.mass).toBeDefined()
    expect(s.mass!.n).toBe(1)
    expect(s.mass!.mae).toBeCloseTo(30, 5) // |330-300|
    expect(s.totalTokens).toEqual({ input: 300, output: 90 })
    expect(s.avgLatencyMs).toBeCloseTo((1000 + 2000 + 500) / 3, 5)
  })

  it('omits mass when no item carries it', () => {
    const noMassItems = items.map((i) => ({ ...i, truth: { ...i.truth, mass_g: undefined } }))
    const outcomes: PredictionOutcome[] = [
      { id: 'a', ok: true, prediction: { protein: 30, carbs: 40, fat: 10, calories: 400 }, latencyMs: 100, usage: { input: 1, output: 1 } },
    ]
    const s = scoreModel('anthropic', 'claude-x', noMassItems, outcomes)
    expect(s.mass).toBeUndefined()
  })
})

describe('formatScoresTable', () => {
  it('renders a markdown table with a row per model', () => {
    const rows = formatScoresTable('Nutrition5k', [
      scoreModel('openai', 'gpt-5.4-nano', [], []),
      scoreModel('openai', 'gpt-5.6-luna', [], []),
    ])
    expect(rows).toContain('### Nutrition5k')
    expect(rows).toContain('openai/gpt-5.4-nano')
    expect(rows).toContain('openai/gpt-5.6-luna')
    expect(rows.split('\n').length).toBeGreaterThanOrEqual(5)
  })
})
