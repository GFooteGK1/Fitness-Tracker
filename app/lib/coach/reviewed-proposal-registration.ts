/** Server-internal preparation for the reviewed proposal transaction.
 * This module writes nothing. A prepared packet is not an acceptance credential;
 * a protected database registration and atomic freshness checks are still required.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatUTCAsLocalDateWithOffset, isValidTimezoneOffset, localDateToUTCEnd } from '../timezone-utils'
import { doseContentHash, INITIAL_DOSE_POLICY_VERSION } from './initial-dose-policy'
import { REVIEWED_MOVEMENT_CATALOG_VERSION } from './movement-catalog'
import { fetchReviewedDoseContext } from './reviewed-dose-context-server'
import { compileAuthenticatedReviewedWeek, type TrustedReviewedWeekRegistration } from './reviewed-week-context-server'
import { reconcileReviewedExecution } from './reviewed-execution-continuity'
import { decodeCoachWeeklyIntent } from './rolling-weekly-api'

type SourceContext = Awaited<ReturnType<typeof fetchReviewedDoseContext>>

/** This deadline covers clock-only transitions, which do not advance a revision.
 * Use the next local day boundary and every future confirmed-memory boundary.
 * It is an operational source-validity limit, never a training-policy duration.
 */
export function reviewedSourceValidBefore(context: SourceContext): string {
  const now = Date.parse(context.asOf), offset = context.binding.scope.tzOffset
  if (!Number.isFinite(now) || !isValidTimezoneOffset(offset)) throw new Error('Invalid source clock')
  const day = formatUTCAsLocalDateWithOffset(context.asOf, offset)
  if (context.binding.scope.historyThrough !== day) throw new Error('Source day changed')
  let boundary = Date.parse(localDateToUTCEnd(day, offset)) + 1
  for (const memory of context.binding.memories) {
    if (memory.status !== 'confirmed') continue
    for (const key of ['effective_from', 'effective_until', 'review_after']) {
      const value = memory[key]
      if (value == null) continue
      const time = typeof value === 'string' ? Date.parse(value) : NaN
      if (!Number.isFinite(time)) throw new Error('Invalid memory lifecycle')
      if (time > now) boundary = Math.min(boundary, time)
    }
  }
  return new Date(boundary).toISOString()
}

/** Only registrationId comes from the caller. Registry content is server-owned.
 * Keep the full exact compiler output: do not adapt it to legacy dose fields.
 */
export async function prepareReviewedWeekProposalRegistration(db: SupabaseClient, registrationId: string,
  registry: readonly TrustedReviewedWeekRegistration[]) {
  try {
    const detached = structuredClone(registry)
    const candidate = await compileAuthenticatedReviewedWeek(db, registrationId, detached)
    if (candidate.kind !== 'reviewed_candidate') return candidate
    // Re-read after compilation so the packet contains the exact authenticated
    // dependency snapshot rather than a caller-provided revision or digest.
    const source = await fetchReviewedDoseContext(db, candidate.sourceBinding.scope)
    if (source.userId !== candidate.sourceBinding.userId || source.contextHash !== candidate.sourceBinding.contextHash) {
      return { kind: 'review_required' as const, reasons: ['Reviewed source changed while preparing registration'] }
    }
    // The read-only compiler permits an absent revision as zero. Persistence must
    // distinguish that case because SQL's existing NOWAIT fence requires a row.
    const revision = await db.from('coach_context_revisions').select('user_id,revision')
      .eq('user_id', source.userId).limit(2)
    if (revision.error || revision.data?.length !== 1 || revision.data[0].user_id !== source.userId
      || revision.data[0].revision !== source.binding.revision) throw new Error('Source revision unavailable')
    const auth = await db.auth.getUser()
    if (auth.error || auth.data.user?.id !== source.userId) throw new Error('Source owner changed')
    const validBefore = reviewedSourceValidBefore(source)
    if (Date.now() >= Date.parse(validBefore)) throw new Error('Source validity elapsed')
    const plan = candidate.plan
    const base = decodeCoachWeeklyIntent(source.binding.base.plan.intent)
    if (!base || !source.binding.executionSlots) throw new Error('Complete accepted base required')
    const continuity = reconcileReviewedExecution({ userId: source.userId, programId: source.binding.scope.programId,
      basePlanVersionId: source.binding.scope.basePlanVersionId, baseSessions: base.plan.scheduledSessions,
      sourceSlots: source.binding.executionSlots, target: plan, transition: candidate.transition })
    if (continuity.kind !== 'continuity') return continuity
    const packet = {
      schemaVersion: 2 as const, registrationId, userId: source.userId,
      policyVersion: INITIAL_DOSE_POLICY_VERSION, movementCatalogVersion: REVIEWED_MOVEMENT_CATALOG_VERSION,
      source: { contextHash: source.contextHash, binding: source.binding, validBefore },
      intent: { format: 'reviewed_weekly_intent_v0_1' as const, horizon_weeks: 1 as const, reviewed_week: plan,
        ...(plan.profileSnapshot.trainingIntent ? { training_intent: plan.profileSnapshot.trainingIntent } : {}) },
      inputSnapshot: { contextRevision: source.binding.revision, setupMemoryBindings: source.binding.setup,
        reviewedSourceHash: source.contextHash, reviewedRegistrationId: registrationId,
        reviewedMovementCatalogVersion: REVIEWED_MOVEMENT_CATALOG_VERSION,
        reviewedExecutionStorage: continuity.binding.storageContract, reviewedExecutionContinuity: continuity.binding,
        reviewedWeekTransition: candidate.transition,
        ...(candidate.doseReconciliation ? { reviewedDoseReconciliation: candidate.doseReconciliation } : {}) },
      sessions: plan.scheduledSessions.map((slot, index) => ({ week_number: 1, session_index: index + 1,
        scheduled_date: slot.scheduledDate, prescription: slot.prescription })),
    }
    return { kind: 'prepared_registration' as const, packet: structuredClone(packet),
      fingerprint: doseContentHash(packet), persistable: false as const, numericRuntimeEligible: false as const,
      limitations: ['Prepared server packet only; no database registration or atomic acceptance authority',
        'Target window, sequence and execution preservation require transaction validation'] }
  } catch {
    return { kind: 'review_required' as const, reasons: ['Reviewed proposal registration requires current complete owned evidence'] }
  }
}
