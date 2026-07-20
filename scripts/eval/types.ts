/**
 * Types for the food-photo → macro eval harness (ADR-0002).
 */

/** Ground-truth macros for one golden-set item (per whole plate). */
export interface MacroTruth {
  protein: number
  carbs: number
  fat: number
  calories: number
  /** Total mass in grams, when the dataset provides it (e.g. Nutrition5k). */
  mass_g?: number
}

/** One labeled item in a (vision) golden-set manifest. */
export interface GoldenItem {
  id: string
  imagePath: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  truth: MacroTruth
}

/** One labeled item for the text-nutrition eval (meal description -> macros). */
export interface TextGoldenItem {
  id: string
  text: string
  truth: MacroTruth
}

/** A candidate model to evaluate, expressed as provider + model id. */
export interface Candidate {
  provider: 'anthropic' | 'openai'
  model: string
}

/** What the model predicted for one item (flat totals). */
export interface Prediction {
  protein: number
  carbs: number
  fat: number
  calories: number
  mass_g?: number
}

/** The outcome of running one item through one candidate. */
export interface PredictionOutcome {
  id: string
  /** false when the model refused or the response could not be parsed. */
  ok: boolean
  prediction?: Prediction
  latencyMs: number
  usage: { input: number; output: number }
}

/** Error metrics for a single macro across the scored items. */
export interface MacroScore {
  /** Mean absolute error. */
  mae: number
  /** Median absolute percentage error (%), over items with truth > 0. */
  medApe: number
  /** Number of scored (parsed) items contributing. */
  n: number
}

/** Aggregate score for one candidate across a golden-set layer. */
export interface ModelScore {
  provider: string
  model: string
  /** Total items attempted. */
  attempted: number
  /** Fraction that refused or failed to parse (0–1). */
  refusalRate: number
  protein: MacroScore
  carbs: MacroScore
  fat: MacroScore
  calories: MacroScore
  /** Present only when the golden set carries mass_g and predictions include it. */
  mass?: MacroScore
  avgLatencyMs: number
  totalTokens: { input: number; output: number }
}
