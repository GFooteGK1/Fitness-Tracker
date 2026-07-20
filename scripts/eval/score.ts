/**
 * Pure scoring for the food-photo → macro eval (ADR-0002).
 *
 * No I/O, no seam, no SDK — deterministic functions over prediction/truth
 * pairs so they can be unit-tested without data or API keys. Portion/mass is
 * scored as its own metric (the documented dominant error source), separately
 * from macro composition.
 */
import type {
  MacroScore,
  MacroTruth,
  ModelScore,
  PredictionOutcome,
} from './types'

const MACROS = ['protein', 'carbs', 'fat', 'calories'] as const
type MacroKey = (typeof MACROS)[number]

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Score one dimension from {pred, truth} pairs: MAE + median APE (%). */
export function scoreMacro(pairs: Array<{ pred: number; truth: number }>): MacroScore {
  if (pairs.length === 0) return { mae: 0, medApe: 0, n: 0 }
  const absErrors = pairs.map((p) => Math.abs(p.pred - p.truth))
  // APE only defined for truth > 0.
  const apes = pairs
    .filter((p) => p.truth > 0)
    .map((p) => (Math.abs(p.pred - p.truth) / p.truth) * 100)
  return { mae: mean(absErrors), medApe: median(apes), n: pairs.length }
}

/**
 * Aggregate one candidate's outcomes against the golden set.
 * Only successfully-parsed outcomes contribute to macro scores; refusals/parse
 * failures are counted in refusalRate.
 */
export function scoreModel(
  provider: string,
  model: string,
  items: ReadonlyArray<{ id: string; truth: MacroTruth }>,
  outcomes: PredictionOutcome[]
): ModelScore {
  const truthById = new Map(items.map((i) => [i.id, i.truth]))
  const scored = outcomes.filter((o) => o.ok && o.prediction)
  const attempted = outcomes.length
  const refusals = attempted - scored.length

  const macroScore = (key: MacroKey): MacroScore =>
    scoreMacro(
      scored
        .map((o) => {
          const truth = truthById.get(o.id)
          if (!truth) return null
          return { pred: o.prediction![key], truth: truth[key] }
        })
        .filter((p): p is { pred: number; truth: number } => p !== null)
    )

  // Mass only when both truth and prediction carry it.
  const massPairs = scored
    .map((o) => {
      const truth = truthById.get(o.id)
      if (!truth || truth.mass_g == null || o.prediction!.mass_g == null) return null
      return { pred: o.prediction!.mass_g, truth: truth.mass_g }
    })
    .filter((p): p is { pred: number; truth: number } => p !== null)

  return {
    provider,
    model,
    attempted,
    refusalRate: attempted === 0 ? 0 : refusals / attempted,
    protein: macroScore('protein'),
    carbs: macroScore('carbs'),
    fat: macroScore('fat'),
    calories: macroScore('calories'),
    ...(massPairs.length > 0 ? { mass: scoreMacro(massPairs) } : {}),
    avgLatencyMs: mean(outcomes.map((o) => o.latencyMs)),
    totalTokens: {
      input: outcomes.reduce((a, o) => a + o.usage.input, 0),
      output: outcomes.reduce((a, o) => a + o.usage.output, 0),
    },
  }
}

/** Render a comparison table (markdown) across candidates for one layer. */
export function formatScoresTable(layer: string, scores: ModelScore[]): string {
  const round = (n: number) => Math.round(n * 10) / 10
  const cell = (s: MacroScore) => `${round(s.mae)} / ${round(s.medApe)}%`
  const lines: string[] = []
  lines.push(`### ${layer}`)
  lines.push('')
  lines.push('| Model | Refusal | Protein (MAE/MedAPE) | Carbs | Fat | Calories | Mass | Avg ms | Tokens (in/out) |')
  lines.push('|---|---|---|---|---|---|---|---|---|')
  for (const s of scores) {
    lines.push(
      `| ${s.provider}/${s.model} | ${round(s.refusalRate * 100)}% | ${cell(s.protein)} | ${cell(s.carbs)} | ${cell(s.fat)} | ${cell(s.calories)} | ${s.mass ? cell(s.mass) : '—'} | ${round(s.avgLatencyMs)} | ${s.totalTokens.input}/${s.totalTokens.output} |`
    )
  }
  return lines.join('\n')
}
