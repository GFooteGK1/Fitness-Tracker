/** W5 pure offline boundary. Callers supply a trusted review registry, not model-authored authority. */
import { createHash } from 'node:crypto'
import { stableStringify } from './rolling-weekly-contracts'
import type { NumericRange } from './programming-schema'

export const INITIAL_DOSE_POLICY_VERSION = 'initial-dose-0.2.0' as const

export interface ReviewedWorkingDose {
  movementId: string
  equipmentId: string
  protocolId: string
  loadConvention: 'total_external' | 'per_hand_external'
  repetitionsPerSide: boolean
  sets: number
  repetitions: NumericRange
  load: NumericRange & { unit: 'lb' | 'kg' }
  targetRpe: NumericRange | null
  restSeconds: NumericRange
}

export interface DoseSourceBinding {
  id: string
  revision: number
  contentHash: string
}

export interface ReviewedDoseOption {
  id: string
  policyVersion: typeof INITIAL_DOSE_POLICY_VERSION
  operation: 'retain' | 'load_trial'
  review: { id: string; contentHash: string }
  sources: DoseSourceBinding[]
  /** Includes set-level response, symptoms, goal, week commitments and comparability facts. */
  reviewedFactsHash: string
  before: ReviewedWorkingDose
  after: ReviewedWorkingDose
}

export interface ReviewedDoseRegistryEntry {
  option: ReviewedDoseOption
  /** Trusted registry digest; never accept a replacement digest from the planner. */
  contentHash: string
}

export interface InitialDoseCandidateInput {
  optionId: string
  policyVersion: string
  before: ReviewedWorkingDose | null
  /** Structured evidence/context from the offline case or, later, an authenticated adapter. */
  facts: Record<string, unknown> | null
  currentSources: DoseSourceBinding[]
  currentReviews: Array<{ id: string; contentHash: string }>
  unresolvedReasons: string[]
  /** Offline caller assertion, not measured timing or compiler-proven week feasibility. */
  wholeWeekFit: 'verified' | 'unknown' | 'infeasible'
}

export type InitialDoseCandidateResult = {
  mode: 'offline_only'
  numericRuntimeEligible: false
  policyVersion: typeof INITIAL_DOSE_POLICY_VERSION
} & (
  | { kind: 'candidate'; option: ReviewedDoseOption; requiresAthleteAcceptance: true }
  | { kind: 'provisional' | 'review_required' | 'unsupported'; reasons: string[] }
)

/** Stable source binding, not a signature, authentication check or physiological grader. */
export function doseContentHash(value: unknown): string {
  assertJson(value)
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

function assertJson(value: unknown): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (Array.isArray(value)) { value.forEach(assertJson); return }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    Object.values(value).forEach(assertJson); return
  }
  throw new Error('Dose bindings require finite JSON values')
}

const hashPattern = /^[a-f0-9]{64}$/
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const range = (value: NumericRange | null, min: number, max = Infinity, integer = false) => Boolean(value
  && Number.isFinite(value.min) && Number.isFinite(value.max) && value.min >= min && value.max <= max
  && value.min <= value.max && (!integer || (Number.isInteger(value.min) && Number.isInteger(value.max))))
const equal = (a: unknown, b: unknown) => doseContentHash(a) === doseContentHash(b)

function validDose(dose: ReviewedWorkingDose): boolean {
  return [dose.movementId, dose.equipmentId, dose.protocolId].every(nonempty)
    && ['total_external', 'per_hand_external'].includes(dose.loadConvention)
    && typeof dose.repetitionsPerSide === 'boolean'
    && Number.isInteger(dose.sets) && dose.sets > 0
    && range(dose.repetitions, 1, Infinity, true) && range(dose.load, 0)
    && ['lb', 'kg'].includes(dose.load.unit) && range(dose.restSeconds, 0)
    && (dose.targetRpe === null || range(dose.targetRpe, 1, 10))
}

function optionProblem(option: ReviewedDoseOption): string | null {
  if (!nonempty(option.id) || option.policyVersion !== INITIAL_DOSE_POLICY_VERSION
    || !nonempty(option.review.id) || !hashPattern.test(option.review.contentHash)
    || !hashPattern.test(option.reviewedFactsHash)) return 'invalid_review_binding'
  if (!option.sources.length || new Set(option.sources.map(source => source.id)).size !== option.sources.length
    || option.sources.some(source => !nonempty(source.id) || !Number.isInteger(source.revision)
      || source.revision < 1 || !hashPattern.test(source.contentHash))) return 'invalid_source_bindings'
  if (!validDose(option.before) || !validDose(option.after)) return 'invalid_working_dose'
  if (option.after.targetRpe === null) return 'explicit_working_effort_missing'
  if (option.operation === 'retain') return equal(option.before, option.after) ? null : 'retention_changes_dose'
  if (option.operation !== 'load_trial') return 'unsupported_operation'
  const { load: beforeLoad, targetRpe: beforeEffort, ...before } = option.before
  const { load: afterLoad, targetRpe: afterEffort, ...after } = option.after
  if (!equal(before, after) || beforeLoad.unit !== afterLoad.unit
    || (beforeEffort !== null && !equal(beforeEffort, afterEffort)) || afterEffort === null) return 'trial_changes_other_variables'
  // This first reviewed operation uses exact loads. Range lowering needs a separately reviewed operation.
  if (beforeLoad.min !== beforeLoad.max || afterLoad.min !== afterLoad.max
    || afterLoad.min <= beforeLoad.min) return 'unsupported_load_trial'
  return null
}

/**
 * Validates a selected reviewed option; it does not infer a dose, grade coaching,
 * authenticate ownership, inspect clinical restrictions, or accept/persist a plan.
 * The caller must bind all relevant evidence/context in facts and currentSources.
 * Only offline lowering consumes this stage. Live eligibility stays false even on success.
 */
export function evaluateInitialDoseCandidate(
  input: InitialDoseCandidateInput,
  registry: readonly ReviewedDoseRegistryEntry[],
): InitialDoseCandidateResult {
  const base = { mode: 'offline_only', numericRuntimeEligible: false, policyVersion: INITIAL_DOSE_POLICY_VERSION } as const
  const reject = (kind: 'provisional' | 'review_required' | 'unsupported', ...reasons: string[]): InitialDoseCandidateResult => ({ ...base, kind, reasons })
  if (input.policyVersion !== INITIAL_DOSE_POLICY_VERSION) return reject('unsupported', 'policy_version_unavailable')
  const entries = registry.filter(entry => entry.option.id === input.optionId)
  if (!entries.length) return reject('unsupported', 'reviewed_option_unavailable')
  if (entries.length !== 1) return reject('review_required', 'ambiguous_option_identity')
  const { option, contentHash } = entries[0]
  try {
    if (!hashPattern.test(contentHash) || doseContentHash(option) !== contentHash) return reject('review_required', 'reviewed_option_changed')
    const problem = optionProblem(option)
    if (problem) return reject('review_required', problem)
    const reviews = input.currentReviews.filter(review => review.id === option.review.id)
    if (reviews.length !== 1 || reviews[0].contentHash !== option.review.contentHash) return reject('review_required', 'review_source_changed_or_unavailable')
    if (input.unresolvedReasons.length) return reject('review_required', ...input.unresolvedReasons)
    if (input.wholeWeekFit !== 'verified') return reject('review_required', `whole_week_${input.wholeWeekFit}`)
    if (input.currentSources.length !== option.sources.length) return reject('review_required', 'source_set_changed')
    for (const expected of option.sources) {
      const current = input.currentSources.filter(source => source.id === expected.id)
      if (current.length !== 1 || !equal(current[0], expected)) return reject('review_required', 'source_changed_or_unavailable')
    }
    if (input.before === null || input.facts === null) return reject('provisional', 'evidence_or_context_missing')
    if (!validDose(input.before) || !equal(input.before, option.before)) return reject('review_required', 'source_dose_mismatch')
    if (doseContentHash(input.facts) !== option.reviewedFactsHash) return reject('review_required', 'facts_outside_reviewed_case')
    return { ...base, kind: 'candidate', option: structuredClone(option), requiresAthleteAcceptance: true }
  } catch {
    return reject('review_required', 'invalid_binding_data')
  }
}
