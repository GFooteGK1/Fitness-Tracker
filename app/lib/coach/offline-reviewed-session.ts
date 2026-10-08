/** Local W5 integration. This format is deliberately not a rolling weekly plan or stored session. */
import {
  evaluateInitialDoseCandidate, type InitialDoseCandidateInput, type ReviewedDoseRegistryEntry,
} from './initial-dose-policy'
import type { NumericRange, ProgrammingExecutionTarget, ProgrammingProfile } from './programming-schema'
import { composeReviewedWorkingPrescription, type ReviewedWorkingPrescription } from './session-composer'
import { validateOfflineReviewedSession } from './program-validator'

export interface ReviewedPreparationStep {
  id: string
  movement: string
  dose: { kind: 'repetitions'; repetitions: number } | { kind: 'duration'; seconds: number }
  load: (NumericRange & { unit: 'lb' | 'kg' }) | null
  effort: ProgrammingExecutionTarget
  /** null preserves the reviewed instruction to rest as needed. */
  restAfterSeconds: NumericRange | null
}

export interface ReviewedSessionRecipe {
  optionId: string
  optionHash: string
  review: { id: string; contentHash: string }
  preparation: ReviewedPreparationStep[]
  workingInstructions: string[]
}

export interface OfflineReviewedSessionContext {
  input: InitialDoseCandidateInput
  profile: ProgrammingProfile
  registry: readonly ReviewedDoseRegistryEntry[]
  recipes: readonly { recipe: ReviewedSessionRecipe; contentHash: string }[]
}

export interface OfflineReviewedSession {
  format: 'offline_reviewed_session_v1'
  numericRuntimeEligible: false
  persistable: false
  requiresAthleteAcceptance: true
  recipeHash: string
  preparation: ReviewedPreparationStep[]
  working: ReviewedWorkingPrescription
  workingInstructions: string[]
  timing: { estimatedMinutes: null; wholeWeekFitVerified: false }
}

export function compileOfflineReviewedSession(context: OfflineReviewedSessionContext):
  | { kind: 'compiled'; session: OfflineReviewedSession }
  | { kind: 'review_required'; reasons: string[] } {
  const candidate = evaluateInitialDoseCandidate(context.input, context.registry)
  if (candidate.kind !== 'candidate') return { kind: 'review_required', reasons: candidate.reasons }
  const entries = context.recipes.filter(entry => entry.recipe.optionId === candidate.option.id)
  if (entries.length !== 1) return { kind: 'review_required', reasons: ['Unique reviewed session recipe required'] }
  const { recipe, contentHash } = entries[0]
  const session: OfflineReviewedSession = {
    format: 'offline_reviewed_session_v1', numericRuntimeEligible: false, persistable: false,
    requiresAthleteAcceptance: true, recipeHash: contentHash,
    preparation: structuredClone(recipe.preparation), workingInstructions: [...recipe.workingInstructions],
    working: composeReviewedWorkingPrescription(candidate.option),
    timing: { estimatedMinutes: null, wholeWeekFitVerified: false },
  }
  const validation = validateOfflineReviewedSession(session, context)
  return validation.ok ? { kind: 'compiled', session } : { kind: 'review_required', reasons: validation.errors }
}
