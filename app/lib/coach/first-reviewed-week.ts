/** First-week bootstrap semantics only. Neither a confirmation hash nor this
 * reconciliation grants reviewer authority, persists work or enables execution. */
import { formatUTCAsLocalDateWithOffset, localDateToUTCStart } from '../timezone-utils'
import { doseContentHash } from './initial-dose-policy'
import { validateReviewedProgrammingProfile, type ProgrammingProfile } from './programming-schema'
import { hasOnlySupervisedReviewFields } from './supervised-programming-contract'
import type { ReviewedWeekWindow } from './reviewed-week-transition'
import type { ReviewedExecutionContinuity, ReviewedExecutionSlot } from './reviewed-execution-continuity'
import type { ReviewedRollingWeekPlan } from './reviewed-week-plan-contract'

export interface FirstReviewedTransition {
  schemaVersion: 1
  kind: 'first_reviewed'
  basePlanVersionId: string
  sourceWindow: ReviewedWeekWindow
  targetWindow: ReviewedWeekWindow
  confirmedTargetProfileHash: string
}
const plusDays = (date: string, days: number) => formatUTCAsLocalDateWithOffset(
  new Date(Date.parse(localDateToUTCStart(date, 0)) + days * 86400000).toISOString(), 0)
const monday = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
  && plusDays(date, 0) === date && new Date(localDateToUTCStart(date, 0)).getUTCDay() === 1

/** Target constraints are explicit athlete input; factual provenance must remain
 * the current authenticated projection, never client-invented training history.
 * Confirmation is repeated for edits, and the complete resulting week still
 * requires durable reviewer approval and separate athlete acceptance. */
export function reconcileFirstReviewedWindow(input: {
  basePlanVersionId: string
  base: ReviewedWeekWindow & { intentFormat: string; planMode: string }
  sourceProfile: ProgrammingProfile
  confirmedTargetProfile: ProgrammingProfile
  confirmedTargetProfileHash: string
  target: { windowStart: string; sequenceNumber: number }
}) {
  const { base, target } = input
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input.basePlanVersionId)
    || base.intentFormat !== 'rolling_weekly_intent_v0_1' || base.planMode !== 'rolling_weekly'
    || !monday(base.windowStart) || plusDays(base.windowStart, 6) !== base.windowEnd
    || !Number.isSafeInteger(base.sequenceNumber) || base.sequenceNumber < 1 || base.sequenceNumber >= 2147483647
    || !monday(target.windowStart) || target.windowStart <= plusDays(base.windowEnd, 1)
    || !Number.isSafeInteger(target.sequenceNumber) || target.sequenceNumber !== base.sequenceNumber + 1) {
    throw new Error('First review requires a legacy weekly base and an explicit later non-adjacent Monday')
  }
  const profile = structuredClone(input.confirmedTargetProfile)
  if (!hasOnlySupervisedReviewFields(profile, 'profile') || !validateReviewedProgrammingProfile(profile).ok
    || profile.startDate !== target.windowStart || !/^[a-f0-9]{64}$/.test(input.confirmedTargetProfileHash)
    || doseContentHash(profile) !== input.confirmedTargetProfileHash) {
    throw new Error('Confirm the exact valid target profile and window before first review')
  }
  for (const key of ['inputSource', 'assessments', 'recentTraining', 'trainingIntent', 'planningContext', 'prescriptionBasis'] as const) {
    if (doseContentHash(profile[key] ?? null) !== doseContentHash(input.sourceProfile[key] ?? null)) {
      throw new Error('First review cannot replace authenticated training evidence or provenance')
    }
  }
  const transition: FirstReviewedTransition = { schemaVersion: 1, kind: 'first_reviewed',
    basePlanVersionId: input.basePlanVersionId,
    sourceWindow: { windowStart: base.windowStart, windowEnd: base.windowEnd, sequenceNumber: base.sequenceNumber },
    targetWindow: { windowStart: target.windowStart, windowEnd: plusDays(target.windowStart, 6), sequenceNumber: target.sequenceNumber },
    confirmedTargetProfileHash: input.confirmedTargetProfileHash }
  return { profile, transition }
}

/** No skipped intermediate week or performed work is created. Prior planned
 * sessions remain unreported historical prescriptions; begun work must resolve. */
export function reconcileFirstReviewedExecution(input: {
  userId: string; programId: string; basePlanVersionId: string
  baseSessions: Array<{ scheduledDate: string; prescription: unknown }>
  sourceSlots: readonly ReviewedExecutionSlot[]
  target: ReviewedRollingWeekPlan; transition: FirstReviewedTransition
}): { kind: 'continuity'; binding: ReviewedExecutionContinuity } | { kind: 'review_required'; reasons: string[] } {
  try {
    const slots = structuredClone([...input.sourceSlots]).sort((a, b) => a.sessionIndex - b.sessionIndex)
    const t = input.transition
    if (t.kind !== 'first_reviewed' || t.basePlanVersionId !== input.basePlanVersionId
      || input.target.windowStart !== t.targetWindow.windowStart || input.target.windowEnd !== t.targetWindow.windowEnd
      || input.target.sequenceNumber !== t.targetWindow.sequenceNumber
      || doseContentHash(input.target.profileSnapshot) !== t.confirmedTargetProfileHash
      || !slots.length || slots.length > 14 || slots.length !== input.baseSessions.length
      || new Set(slots.map(s => s.executionSessionId)).size !== slots.length) throw new Error('First-review execution binding is incomplete')
    for (const [index, slot] of slots.entries()) {
      const base = input.baseSessions[index]
      if (slot.userId !== input.userId || slot.programId !== input.programId || slot.planVersionId !== input.basePlanVersionId
        || slot.sessionIndex !== index + 1 || !slot.executionSessionId || !slot.executionPlanVersionId
        || slot.scheduledDate !== base.scheduledDate || slot.scheduledDate >= input.target.windowStart
        || doseContentHash(slot.prescription) !== doseContentHash(base.prescription)
        || !['planned', 'completed', 'skipped'].includes(slot.status) || typeof slot.hasReports !== 'boolean'
        || (slot.status === 'planned' && (slot.hasReports || slot.completedWorkoutId !== null || slot.completionContractVersion !== null))) {
        throw new Error('Resolve incomplete, changed or begun prior execution before first review')
      }
    }
    return { kind: 'continuity', binding: { schemaVersion: 2, storageContract: 'reviewed_execution_slots_v1',
      basePlanVersionId: input.basePlanVersionId, sourceSlotsHash: doseContentHash(slots),
      slots: input.target.scheduledSessions.map((_, i) => ({ sessionIndex: i + 1, executionSessionId: null, executionPlanVersionId: null })),
      priorExecution: slots.map(s => ({ executionSessionId: s.executionSessionId, disposition: s.status === 'planned' ? 'unreported' : s.status })) } }
  } catch (error) { return { kind: 'review_required', reasons: [error instanceof Error ? error.message : 'First execution needs review'] } }
}
