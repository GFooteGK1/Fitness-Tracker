/** Server-internal trusted registration seam. No route, persistence or activation. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchReviewedDoseContext, type ReviewedContextScope } from './reviewed-dose-context-server'
import { buildReviewedRollingWeeklyPlan } from './rolling-weekly-plan'
import type { ReviewedWeekRegistration } from './offline-reviewed-week'
import { decodeCoachWeeklyIntent } from './rolling-weekly-api'
import { reconcileReviewedWeekWindow, type ReviewedWeekTransition } from './reviewed-week-transition'
import { reconcileReviewedDoseWeek, assertReviewedDoseSourceCorrespondence, type TrustedDoseWeekReconciliation } from './reviewed-dose-week-reconciliation'

type Compilation = Parameters<typeof buildReviewedRollingWeeklyPlan>[0]

/** Reviewed by the server owner; none of these fields may come from a request/model.
 * A registration binds one complete reviewed schedule and target window. Its
 * facts digest and authenticated source digest serve different purposes.
 */
export interface TrustedReviewedWeekRegistration {
  id: string
  userId: string
  scope: ReviewedContextScope
  contextHash: string
  /** Explicit server-owned operation. Omission retains historical same-week behavior. */
  transition?: ReviewedWeekTransition['kind']
  operation?: 'reviewed_load_trial'
  doseReconciliation?: TrustedDoseWeekReconciliation
  compilation: Omit<Compilation, 'context'> & {
    context: Omit<Compilation['context'], 'profile'>
  }
  reviewedWeeks: readonly ReviewedWeekRegistration[]
}

/** Caller selects only an ID; authority, recipe, dates, direction and scope are server-owned.
 * Current profile is copied to the exact target date only for explicit adjacent
 * week review. The recipe must bind that dated profile; no registry is rewritten.
 */
export async function compileAuthenticatedReviewedWeek(db: SupabaseClient, registrationId: string,
  registry: readonly TrustedReviewedWeekRegistration[]) {
  try {
    // Detach even before authentication awaits, including nested recipes/direction.
    const snapshot = structuredClone(registry)
    const { data, error } = await db.auth.getUser()
    const owner = data.user?.id
    if (error || !owner) throw new Error('Authentication required')
    const matches = snapshot.filter(entry => entry.id === registrationId && entry.userId === owner)
    if (matches.length !== 1) return { kind: 'review_required' as const, reasons: ['Owned reviewed week unavailable or ambiguous'] }
    const entry = matches[0]
    if ((entry.operation !== undefined && entry.operation !== 'reviewed_load_trial')
      || Boolean(entry.operation) !== Boolean(entry.doseReconciliation)) throw new Error('Load trial requires reviewed reconciliation')
    const context = await fetchReviewedDoseContext(db, entry.scope)
    if (context.userId !== owner || context.contextHash !== entry.contextHash) {
      return { kind: 'review_required' as const, reasons: ['Reviewed source context changed'] }
    }
    const base = decodeCoachWeeklyIntent(context.binding.base.plan.intent)
    if (!base) throw new Error('Accepted week unavailable')
    const window = reconcileReviewedWeekWindow({ basePlanVersionId: entry.scope.basePlanVersionId,
      base: { windowStart: base.plan.windowStart, windowEnd: base.plan.windowEnd, sequenceNumber: base.plan.sequenceNumber },
      profile: context.profile, target: entry.compilation, kind: entry.transition ?? 'same_week' })
    const result = buildReviewedRollingWeeklyPlan({ ...entry.compilation,
      context: { ...entry.compilation.context, profile: window.profile } }, entry.reviewedWeeks)
    if (result.kind !== 'reviewed_candidate') return result
    if (entry.doseReconciliation) assertReviewedDoseSourceCorrespondence(entry.doseReconciliation, context.binding.history.workouts, owner)
    const dose = entry.doseReconciliation ? base.kind === 'reviewed' ? reconcileReviewedDoseWeek({
      owner, contextHash: context.contextHash, basePlanVersionId: entry.scope.basePlanVersionId,
      base: base.plan, target: result.plan, registration: entry.doseReconciliation,
    }) : { kind: 'review_required' as const, reasons: ['Reviewed load trial requires an exact reviewed base week'] } : null
    if (dose?.kind === 'review_required') return dose
    return { ...result,
      ...(dose?.kind === 'reconciled' ? { doseReconciliation: dose.receipt } : {}),
      transition: window.transition,
      // Read-time evidence only, not an atomic acceptance credential or lock.
      sourceBinding: { userId: owner, contextHash: context.contextHash, readAt: context.asOf,
        scope: structuredClone(entry.scope), revision: context.binding.revision },
      limitations: [...context.limitations, 'Read-time whole-week binding only; atomic acceptance and saved readback remain unavailable.'],
    }
  } catch {
    return { kind: 'review_required' as const, reasons: ['Authenticated whole-week evidence unavailable, incomplete or changed'] }
  }
}
