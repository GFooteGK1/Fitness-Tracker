/** Server-only exact reconciliation. It validates reviewed content, never chooses or inserts a dose. */
import { doseContentHash, evaluateInitialDoseCandidate, type ReviewedDoseOption } from './initial-dose-policy'
import type { HistoryWorkoutRow } from './planning-history'
import { compileOfflineReviewedSession, type OfflineReviewedSessionContext, type ReviewedPreparationStep } from './offline-reviewed-session'
import { parseReviewedRollingWeek, type ReviewedRollingWeekPlan } from './reviewed-week-plan-contract'
import { reviewedSessionActivities } from './reviewed-session-contract'
import { reviewedPreparationMovementId } from './reviewed-movement-eligibility'
import type { ReviewedWeekActivity } from './offline-reviewed-week'
import type { ReviewedDoseWeekSummary } from './reviewed-dose-week-summary'

export interface ReviewedDoseWeekLink {
  review: { id: string; contentHash: string }
  basePlanHash: string
  targetPlanHash: string
  optionHash: string
  sessionRecipeHash: string
  sessionId: string
  workingActivityId: string
  preparationActivityIds: string[]
  factualSources: Array<{ optionSourceId: string; workoutId: string; workoutDate: string; revision: number; contentHash: string }>
  /** Explicitly reviewed correspondence, not inferred from matching movement names. */
  identity: { movementId: string; equipmentId: string; protocolId: string; requiredEquipment: string[] }
}
export interface TrustedDoseWeekReconciliation {
  link: ReviewedDoseWeekLink
  linkHash: string
  compilation: Omit<OfflineReviewedSessionContext, 'profile'>
}
export interface ReviewedDoseWeekReceipt {
  schemaVersion: 1
  owner: string
  contextHash: string
  basePlanVersionId: string
  link: ReviewedDoseWeekLink
  linkHash: string
  option: ReviewedDoseOption
  registration: TrustedDoseWeekReconciliation
  sessionRecipe: OfflineReviewedSessionContext['recipes'][number]['recipe']
  facts: Record<string, unknown>
  baseWorking: ReviewedWeekActivity
  targetWorking: ReviewedWeekActivity
  conditionalTiming: boolean
  summary: ReviewedDoseWeekSummary
}
const same = (a: unknown, b: unknown) => doseContentHash(a) === doseContentHash(b)
const exact = (range: { min: number; max: number }) => {
  if (range.min !== range.max) throw new Error('Range lowering requires separate review')
  return range.min
}
function matchesDose(activity: ReviewedWeekActivity, dose: ReviewedDoseOption['after'], allowUnknownEffort = false): boolean {
  return activity.role === 'working' && activity.movementId === dose.movementId
    && activity.sets === dose.sets && activity.work.kind === 'repetitions'
    && same(activity.work.repetitions, dose.repetitions) && activity.work.sides === (dose.repetitionsPerSide ? 2 : 1)
    && activity.load.kind === 'external' && activity.load.value === exact(dose.load) && activity.load.unit === dose.load.unit
    && activity.load.convention === (dose.loadConvention === 'total_external' ? 'total' : 'per_hand')
    && activity.restBetweenSeconds === exact(dose.restSeconds)
    && (dose.targetRpe === null ? allowUnknownEffort : activity.effort.kind === 'rpe'
      && same({ min: activity.effort.min, max: activity.effort.max }, dose.targetRpe))
}
function matchesPreparation(activity: ReviewedWeekActivity, expected: ReviewedPreparationStep, movementId: string): boolean {
  const dose = activity.work
  const effort = expected.effort.kind === 'rpe' ? { kind: 'rpe', ...expected.effort.range }
    : expected.effort.kind === 'quality' ? { kind: 'quality', cue: expected.effort.cue } : null
  return activity.role === 'preparation' && activity.sets === 1 && activity.restBetweenSeconds === 0
    && activity.movementId === reviewedPreparationMovementId(expected.movement, movementId)
    && (expected.dose.kind === 'duration' ? dose.kind === 'duration' && dose.seconds === expected.dose.seconds
      && dose.sides === 1 && dose.sideSwitchSeconds === 0
      : dose.kind === 'repetitions' && dose.sides === 1 && same(dose.repetitions, { min: expected.dose.repetitions, max: expected.dose.repetitions }))
    && same(activity.effort, effort)
    && (expected.load === null ? activity.load.kind !== 'external' : activity.load.kind === 'external'
      && activity.load.convention === 'total' && activity.load.unit === expected.load.unit && activity.load.value === exact(expected.load))
    && (expected.restAfterSeconds === null ? typeof activity.restAfterSeconds === 'object'
      && activity.restAfterSeconds.kind === 'as_needed' : activity.restAfterSeconds === exact(expected.restAfterSeconds))
}
const workingSummary = (activity: ReviewedWeekActivity) => {
  const dose = activity.work
  if (dose.kind !== 'repetitions' || activity.load.kind !== 'external' || activity.effort.kind !== 'rpe') throw new Error('Unsupported summary dose')
  return `${activity.load.value} ${activity.load.unit} ${activity.load.convention === 'total' ? 'total' : 'per hand'}, ${activity.sets} × ${dose.repetitions.min}${dose.repetitions.max === dose.repetitions.min ? '' : `–${dose.repetitions.max}`} reps${dose.sides === 2 ? ' per side' : ''}; target RPE ${activity.effort.min}–${activity.effort.max}; ${activity.restBetweenSeconds} seconds between sets.`
}

type ReconciliationInput = {
  owner: string; contextHash: string; basePlanVersionId: string
  base: ReviewedRollingWeekPlan; target: ReviewedRollingWeekPlan; registration: TrustedDoseWeekReconciliation
}
export function reconcileReviewedDoseWeek(input: ReconciliationInput) {
  return reconcile(input, true)
}
function reconcile(input: ReconciliationInput, currentEligibility: boolean):
  { kind: 'reconciled'; receipt: ReviewedDoseWeekReceipt } | { kind: 'review_required'; reasons: string[] } {
  try {
    const { base, target, registration } = structuredClone(input)
    if (!parseReviewedRollingWeek(base) || !parseReviewedRollingWeek(target)) throw new Error('Complete readable base and target weeks required')
    const { link } = registration
    if (doseContentHash(link) !== registration.linkHash
      || doseContentHash(base) !== link.basePlanHash || doseContentHash(target) !== link.targetPlanHash) throw new Error('Reviewed week linkage changed')
    if (!input.owner || !input.basePlanVersionId || !/^[a-f0-9]{64}$/.test(input.contextHash)) throw new Error('Authenticated source binding required')
    if (base.windowStart !== target.windowStart || base.windowEnd !== target.windowEnd || base.sequenceNumber !== target.sequenceNumber
      || !same(base.profileSnapshot, target.profileSnapshot) || !same(base.directionSnapshot, target.directionSnapshot)
      || !same(base.baseSchedule, target.baseSchedule) || !same(base.spacing, target.spacing)) throw new Error('Load trial cannot change weekly context or schedule')
    const candidate = evaluateInitialDoseCandidate(registration.compilation.input, registration.compilation.registry)
    if (candidate.kind !== 'candidate') return { kind: 'review_required', reasons: candidate.reasons }
    if (currentEligibility) {
      const compiled = compileOfflineReviewedSession({ ...registration.compilation, profile: target.profileSnapshot })
      if (compiled.kind !== 'compiled') return compiled
    }
    const options = registration.compilation.registry.filter(entry => entry.option.id === registration.compilation.input.optionId)
    const option = options[0].option
    const recipes = registration.compilation.recipes.filter(entry => entry.recipe.optionId === option.id)
    if (recipes.length !== 1 || doseContentHash(recipes[0].recipe) !== recipes[0].contentHash) throw new Error('Exact session recipe required')
    const recipe = recipes[0].recipe
    if (option.operation !== 'load_trial' || doseContentHash(option) !== link.optionHash || recipes[0].contentHash !== link.sessionRecipeHash
      || recipe.optionHash !== link.optionHash || !same(recipe.review, option.review)
      || link.review.id === option.review.id || !same(link.review, target.scheduledSessions[0].prescription.source.review)) {
      throw new Error('Separate complete-week review and exact session option required')
    }
    if (link.identity.movementId !== option.after.movementId || link.identity.equipmentId !== option.after.equipmentId
      || link.identity.protocolId !== option.after.protocolId || !link.identity.requiredEquipment.length
      || new Set(link.identity.requiredEquipment).size !== link.identity.requiredEquipment.length
      || link.identity.requiredEquipment.some(id => !target.profileSnapshot.equipment.resolvedIds.includes(id))) throw new Error('Reviewed setup and protocol linkage required')
    const before = base.scheduledSessions.find(slot => slot.prescription.sessionId === link.sessionId)
    const after = target.scheduledSessions.find(slot => slot.prescription.sessionId === link.sessionId)
    if (!before || !after || before.scheduledDate !== after.scheduledDate) throw new Error('Exact dated target session required')
    if (!Array.isArray(link.factualSources) || !same(link.factualSources.map(source => source.optionSourceId).sort(), option.sources.map(source => source.id).sort())
      || new Set(link.factualSources.map(source => source.workoutId)).size !== link.factualSources.length
      || link.factualSources.some(source => !source.workoutId || !Number.isSafeInteger(source.revision) || source.revision < 1
        || !/^[a-f0-9]{64}$/.test(source.contentHash) || !/^\d{4}-\d{2}-\d{2}$/.test(source.workoutDate)
        || !Number.isFinite(Date.parse(source.workoutDate)) || source.workoutDate >= after.scheduledDate)) throw new Error('Dated factual source must precede the trial')
    const beforeActivities = reviewedSessionActivities(before.prescription.content), activities = reviewedSessionActivities(after.prescription.content)
    const previous = beforeActivities.find(activity => activity.id === link.workingActivityId)
    const working = activities.find(activity => activity.id === link.workingActivityId)
    if (!previous || !working || !matchesDose(previous, option.before, true) || !matchesDose(working, option.after)
      || !same([...working.requiredEquipment].sort(), [...link.identity.requiredEquipment].sort())) throw new Error('Working dose or setup differs from reviewed option')
    // Prefix equality rejects intervening work, omitted preparation and reordered ramps.
    const prefix = activities.slice(0, activities.indexOf(working))
    if (prefix.length !== recipe.preparation.length || !same(prefix.map(activity => activity.id), link.preparationActivityIds)
      || prefix.some((activity, index) => !matchesPreparation(activity, recipe.preparation[index], option.after.movementId))) throw new Error('Exact ordered preparation must precede reviewed work')
    if (!recipe.workingInstructions.every(line => working.instructions.includes(line))) throw new Error('Reviewed working instructions missing')
    // Compare complete prescriptions after replacing only the intended load and effort.
    const normalized = structuredClone(target.scheduledSessions)
    const changed = normalized.find(slot => slot.prescription.sessionId === link.sessionId)!
    const adjusted = reviewedSessionActivities(changed.prescription.content).find(activity => activity.id === link.workingActivityId)!
    adjusted.load = structuredClone(previous.load); adjusted.effort = structuredClone(previous.effort)
    const content = (slots: typeof normalized) => slots.map(slot => ({ ...slot, prescription: { ...slot.prescription, source: null } }))
    if (!same(content(normalized), content(base.scheduledSessions))) throw new Error('Load trial changes surrounding prescribed work')
    const facts = registration.compilation.input.facts!
    const observedSets = Array.isArray(facts.actualSets) ? facts.actualSets.map((set, index) => {
      if (!set || typeof set !== 'object' || typeof set.reps !== 'number' || typeof set.loadLb !== 'number' || typeof set.rpe !== 'number') throw new Error('Unsupported observed-set summary')
      return `Set ${index + 1}: ${set.loadLb} lb × ${set.reps}, actual RPE ${set.rpe}.`
    }) : []
    const conditional = Boolean(after.prescription.content.conditionalTiming)
    const summary: ReviewedDoseWeekSummary = {
      historical: `${option.before.load.min} ${option.before.load.unit}, ${option.before.sets} × ${option.before.repetitions.min} reps; prior prescribed RPE ${option.before.targetRpe === null ? 'unknown' : `${option.before.targetRpe.min}–${option.before.targetRpe.max}`}.`,
      base: workingSummary(previous), proposed: workingSummary(working), observedSets,
      preparation: 'The separately reviewed preparation is retained in full; surrounding prescribed work is unchanged.',
      timing: conditional ? 'Time fit is conditional. Preparation recovery estimates are not limits.' : 'Duration is an arithmetic estimate, not measured session time.',
      limits: ['One reviewed next-exposure trial; not a universal load-increase rule.', 'Older history remains unknown unless separately documented.', 'Prescription targets are not completed work.'],
    }
    return { kind: 'reconciled', receipt: { schemaVersion: 1, owner: input.owner, contextHash: input.contextHash,
      basePlanVersionId: input.basePlanVersionId, link, linkHash: registration.linkHash, registration, option: structuredClone(option), sessionRecipe: structuredClone(recipe),
      facts: structuredClone(facts), baseWorking: structuredClone(previous), targetWorking: structuredClone(working), conditionalTiming: conditional, summary } }
  } catch (error) {
    return { kind: 'review_required', reasons: [error instanceof Error ? error.message : 'Reviewed dose/week reconciliation unavailable'] }
  }
}

/** Validate immutable historical content, without granting current acceptance authority. */
export function readReviewedDoseWeekSummary(receipt: unknown, input: {
  owner: string; contextHash: string; basePlanVersionId: string
  base: ReviewedRollingWeekPlan; target: ReviewedRollingWeekPlan
}): ReviewedDoseWeekSummary {
  if (!receipt || typeof receipt !== 'object' || !('registration' in receipt)) throw new Error('Dose receipt unavailable')
  const result = reconcile({ ...input, registration: receipt.registration as TrustedDoseWeekReconciliation }, false)
  if (result.kind !== 'reconciled' || !same(result.receipt, receipt)) throw new Error('Stored dose reconciliation changed')
  return structuredClone(result.receipt.summary)
}

/** Stable reviewed factual projection; the enclosing context also binds every raw field. */
export function reviewedDoseWorkoutHash(row: HistoryWorkoutRow): string {
  return doseContentHash({ id: row.id, workoutDate: row.workout_date, revision: row.capture_revision ?? row.execution_revision ?? null, blocks: row.blocks })
}
export function assertReviewedDoseSourceCorrespondence(registration: TrustedDoseWeekReconciliation, rows: readonly HistoryWorkoutRow[], owner: string): void {
  for (const source of registration.link.factualSources) {
    const matches = rows.filter(row => row.id === source.workoutId && row.user_id === owner)
    if (matches.length !== 1 || matches[0].workout_date !== source.workoutDate
      || (matches[0].capture_revision ?? matches[0].execution_revision) !== source.revision
      || reviewedDoseWorkoutHash(matches[0]) !== source.contentHash) throw new Error('Reviewed factual source correspondence changed')
  }
}
