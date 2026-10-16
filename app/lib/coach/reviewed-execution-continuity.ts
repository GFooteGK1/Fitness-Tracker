/** Pure execution identity reconciliation; does not authorize a proposal or write. */
import { doseContentHash } from './initial-dose-policy'
import type { ReviewedRollingWeekPlan } from './reviewed-week-plan-contract'
import type { ReviewedWeekTransition } from './reviewed-week-transition'

export interface ReviewedExecutionSlot {
  userId: string
  programId: string
  planVersionId: string
  sessionIndex: number
  scheduledDate: string
  prescription: unknown
  executionSessionId: string
  executionPlanVersionId: string
  status: 'planned' | 'completed' | 'skipped'
  completedWorkoutId: string | null
  completionContractVersion: number | null
  /** A reported attempt matters even if no working set was completed. */
  hasReports: boolean
}

export interface ReviewedExecutionContinuity {
  schemaVersion: 1 | 2
  storageContract: 'reviewed_execution_slots_v1'
  basePlanVersionId: string
  sourceSlotsHash: string
  slots: Array<{ sessionIndex: number; executionSessionId: string | null; executionPlanVersionId: string | null }>
  priorExecution?: Array<{ executionSessionId: string; disposition: 'completed' | 'skipped' | 'unreported' }>
}

/** Input slots must be a complete authenticated projection of the accepted base.
 * SQL must prove the same ownership/completeness and freshness atomically.
 * Full prescription equality includes preparation, protocol and review provenance.
 */
export function reconcileReviewedExecution(input: {
  userId: string
  programId: string
  basePlanVersionId: string
  baseSessions: Array<{ scheduledDate: string; prescription: unknown }>
  sourceSlots: readonly ReviewedExecutionSlot[]
  target: ReviewedRollingWeekPlan
  transition?: ReviewedWeekTransition
}): { kind: 'continuity'; binding: ReviewedExecutionContinuity } | { kind: 'review_required'; reasons: string[] } {
  try {
    const slots = structuredClone([...input.sourceSlots]).sort((a, b) => a.sessionIndex - b.sessionIndex)
    if (!slots.length || slots.length !== input.baseSessions.length || slots.length > 14
      || new Set(slots.map(slot => slot.executionSessionId)).size !== slots.length) throw new Error('Accepted execution manifest is incomplete or ambiguous')
    for (const [index, slot] of slots.entries()) {
      const base = input.baseSessions[index]
      if (slot.userId !== input.userId || slot.programId !== input.programId || slot.planVersionId !== input.basePlanVersionId
        || slot.sessionIndex !== index + 1 || !slot.executionSessionId || !slot.executionPlanVersionId
        || slot.scheduledDate !== base.scheduledDate || doseContentHash(slot.prescription) !== doseContentHash(base.prescription)
        || !['planned', 'completed', 'skipped'].includes(slot.status) || typeof slot.hasReports !== 'boolean'
        || (slot.status === 'planned' && (slot.completedWorkoutId !== null || slot.completionContractVersion !== null))) {
        throw new Error('Accepted execution identity, prescription or state needs review')
      }
    }
    if (input.transition?.kind === 'next_week') {
      if (input.transition.basePlanVersionId !== input.basePlanVersionId
        || input.target.windowStart !== input.transition.targetWindow.windowStart
        || input.target.windowEnd !== input.transition.targetWindow.windowEnd
        || input.target.sequenceNumber !== input.transition.targetWindow.sequenceNumber
        || slots.some(slot => slot.scheduledDate >= input.target.windowStart)
        || slots.some(slot => slot.status === 'planned' && slot.hasReports)) {
        throw new Error('Resolve begun execution before advancing to a new week')
      }
      return { kind: 'continuity', binding: { schemaVersion: 2, storageContract: 'reviewed_execution_slots_v1',
        basePlanVersionId: input.basePlanVersionId, sourceSlotsHash: doseContentHash(slots),
        slots: input.target.scheduledSessions.map((_, i) => ({ sessionIndex: i + 1, executionSessionId: null, executionPlanVersionId: null })),
        priorExecution: slots.map(slot => ({ executionSessionId: slot.executionSessionId,
          disposition: slot.status === 'planned' ? 'unreported' : slot.status })) } }
    }
    const used = new Set<string>()
    const links = input.target.scheduledSessions.map((target, index) => {
      const matches = slots.filter(slot => slot.scheduledDate === target.scheduledDate
        && doseContentHash(slot.prescription) === doseContentHash(target.prescription))
      if (matches.length > 1) throw new Error('Execution identity is ambiguous')
      const source = matches[0]
      if (source && used.has(source.executionSessionId)) throw new Error('Execution identity would be duplicated')
      if (source) used.add(source.executionSessionId)
      return { sessionIndex: index + 1, executionSessionId: source?.executionSessionId ?? null,
        executionPlanVersionId: source?.executionPlanVersionId ?? null }
    })
    if (slots.some(slot => (slot.status !== 'planned' || slot.hasReports) && !used.has(slot.executionSessionId))) {
      throw new Error('A started or completed session must retain its exact date and prescription')
    }
    return { kind: 'continuity', binding: { schemaVersion: 1, storageContract: 'reviewed_execution_slots_v1',
      basePlanVersionId: input.basePlanVersionId, sourceSlotsHash: doseContentHash(slots), slots: links } }
  } catch (error) {
    return { kind: 'review_required', reasons: [error instanceof Error ? error.message : 'Execution continuity unavailable'] }
  }
}
