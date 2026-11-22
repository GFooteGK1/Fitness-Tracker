import { setupMemoryBindingsCurrent } from './setup-memory-bindings'
import type { SupabaseClient } from '@supabase/supabase-js'
import { projectAcceptedCoachingDecisionOrigin, projectCoachingDecisionContext, type CoachingDecisionContext } from './coaching-decision-context'
import { validateStoredCoachSessionCheckin } from './execution-feedback'

const reviewActions = ['continue', 'adjust_dose', 'collect_signal', 'recover', 'shift_emphasis', 'pause_review'] as const

export type ActivePlanSafety =
  | { status: 'clear' }
  | { status: 'hold'; reason: 'pause_review' | 'recover' | 'concerning_feedback' }
  | { status: 'unavailable' }

/** The latest accepted-base safety action is independent of weekly proposal eligibility. */
export async function readActivePlanSafety(db: SupabaseClient, owner: string, programId: string, planId: string, asOf: string): Promise<ActivePlanSafety> {
  const unavailable = { status: 'unavailable' } as const
  const cutoff = Date.parse(asOf)
  if (!owner || !programId || !planId || !Number.isFinite(cutoff)) return unavailable
  try {
    const feedback = await db.from('coach_checkins').select('id,user_id,program_id,plan_version_id,created_at,occurred_at,responses')
      .eq('user_id', owner).eq('program_id', programId).eq('plan_version_id', planId).eq('checkin_type', 'session')
      .eq('responses->>pain', 'concerning').order('created_at', { ascending: false }).order('id', { ascending: true }).limit(1)

    // Check the active base and latest review after the feedback read, which can outlast either.
    const [reviewResult, activeResult] = await Promise.all([
      db.from('coach_weekly_reviews').select('id,user_id,program_id,base_plan_version_id,review_revision,action,created_at')
        .eq('user_id', owner).eq('program_id', programId).eq('base_plan_version_id', planId)
        .order('review_revision', { ascending: false }).limit(1),
      db.from('training_programs').select('id,user_id,active_plan_version_id,status')
        .eq('user_id', owner).eq('id', programId).eq('status', 'active').eq('active_plan_version_id', planId).limit(1),
    ])
    if (reviewResult.error || activeResult.error || !Array.isArray(reviewResult.data) || reviewResult.data.length > 1
      || !Array.isArray(activeResult.data) || activeResult.data.length !== 1) return unavailable
    const active = activeResult.data[0]
    if (active.id !== programId || active.user_id !== owner || active.active_plan_version_id !== planId || active.status !== 'active') {
      return unavailable
    }
    const review = reviewResult.data[0] ?? null
    if (review && (review.user_id !== owner || review.program_id !== programId || review.base_plan_version_id !== planId
      || typeof review.id !== 'string' || !review.id || !Number.isSafeInteger(review.review_revision) || review.review_revision < 1
      || !reviewActions.some(action => action === review.action) || typeof review.created_at !== 'string'
      || !Number.isFinite(Date.parse(review.created_at)) || Date.parse(review.created_at) > cutoff)) return unavailable
    if (review?.action === 'pause_review' || review?.action === 'recover') return { status: 'hold', reason: review.action }

    // An ordinary weekly review cannot resolve a concerning feedback signal.
    if (feedback.error || !Array.isArray(feedback.data) || feedback.data.length > 1) return unavailable
    const row = feedback.data[0]
    if (!row) return { status: 'clear' }
    if (row.user_id !== owner || row.program_id !== programId || row.plan_version_id !== planId
      || typeof row.id !== 'string' || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))
      || Date.parse(row.created_at) > cutoff) return unavailable
    const checkIn = validateStoredCoachSessionCheckin(row.responses, row.occurred_at, row.id)
    return checkIn.ok && checkIn.value.pain === 'concerning' ? { status: 'hold', reason: 'concerning_feedback' } : unavailable
  } catch { return unavailable }
}

/** Bounded, owned readback of one stored decision for the active accepted base. */
export async function fetchCoachingDecisionContext(
  supabase: SupabaseClient, userId: string, programId: string, basePlanVersionId: string
): Promise<CoachingDecisionContext> {
  const current = await fetchCurrentCoachingDecisionContext(supabase, userId, programId, basePlanVersionId)
  if (!userId || !programId || !basePlanVersionId) return current
  const origin = await fetchAcceptedOrigin(supabase, userId, programId, basePlanVersionId)
  return { ...current, ...(origin.acceptedOrigin ? { acceptedOrigin: origin.acceptedOrigin } : {}),
    missing: [...current.missing, ...origin.missing] }
}

async function fetchCurrentCoachingDecisionContext(
  supabase: SupabaseClient, userId: string, programId: string, basePlanVersionId: string
): Promise<CoachingDecisionContext> {
  const scope = { userId, programId, basePlanVersionId }
  const unavailable = () => projectCoachingDecisionContext({ ...scope, review: null, sourceInvalidated: null, available: false })
  if (!userId || !programId || !basePlanVersionId) return projectCoachingDecisionContext({ ...scope, review: null, sourceInvalidated: null })
  try {
    const reviewResult = await supabase.from('coach_weekly_reviews')
      .select('id,user_id,program_id,base_plan_version_id,review_revision,action,presentation_class,evidence_status,rationale,missing_requirements,evidence_snapshot,policy_version,algorithm_version,created_at')
      .eq('user_id', userId).eq('program_id', programId).eq('base_plan_version_id', basePlanVersionId)
      .order('review_revision', { ascending: false }).order('created_at', { ascending: false }).limit(1)
    if (reviewResult.error) return unavailable()
    const review = reviewResult.data?.[0] ?? null
    if (!review) return projectCoachingDecisionContext({ ...scope, review: null, sourceInvalidated: false })
    if (typeof review.id !== 'string') return projectCoachingDecisionContext({ ...scope, review, sourceInvalidated: false })
    const [invalidations, successors, proposals, active, revisionResult] = await Promise.all([
      supabase.from('coach_review_source_invalidations').select('review_id').eq('user_id', userId).eq('review_id', review.id).limit(1),
      supabase.from('coach_weekly_reviews').select('id').eq('user_id', userId).eq('program_id', programId).eq('supersedes_review_id', review.id).limit(1),
      supabase.from('adaptation_proposals').select('id,user_id,program_id,base_plan_version_id,proposed_plan_version_id,weekly_review_id,status')
        .eq('user_id', userId).eq('program_id', programId).eq('base_plan_version_id', basePlanVersionId).eq('weekly_review_id', review.id)
        .order('created_at', { ascending: false }).limit(1),
      supabase.from('training_programs').select('id,active_plan_version_id').eq('user_id', userId).eq('id', programId)
        .eq('status', 'active').eq('active_plan_version_id', basePlanVersionId).limit(1),
      supabase.from('coach_context_revisions').select('user_id,revision').eq('user_id', userId).limit(1),
    ])
    if ([invalidations, successors, proposals, active, revisionResult].some(result => result.error)) return unavailable()
    const revisionRow = revisionResult.data?.[0]
    if (revisionRow && revisionRow.user_id !== userId) return unavailable()
    const rawRevision = revisionRow?.revision ?? (revisionRow ? null : 0)
    const currentContextRevision = typeof rawRevision === 'number' ? rawRevision
      : typeof rawRevision === 'string' && /^\d+$/.test(rawRevision) ? Number(rawRevision) : null
    return projectCoachingDecisionContext({ ...scope, review, proposal: proposals.data?.[0] ?? null,
      currentContextRevision,
      sourceInvalidated: Boolean(invalidations.data?.length) || !await setupMemoryBindingsCurrent(supabase, userId, review.rationale?.setupMemoryBindings), superseded: Boolean(successors.data?.length) || !active.data?.length })
  } catch { return unavailable() }
}

/** A reviewed replacement's origin belongs to its prior base, not the active
 * plan's next review. Keep this historical projection independent of eligibility.
 */
async function fetchAcceptedOrigin(supabase: SupabaseClient, userId: string, programId: string, acceptedPlanVersionId: string):
Promise<{ acceptedOrigin?: CoachingDecisionContext['acceptedOrigin']; missing: string[] }> {
  try {
    const proposalResult = await supabase.from('adaptation_proposals')
      .select('id,user_id,program_id,base_plan_version_id,proposed_plan_version_id,weekly_review_id,status')
      .eq('user_id', userId).eq('program_id', programId).eq('proposed_plan_version_id', acceptedPlanVersionId)
      .eq('status', 'accepted').limit(1)
    if (proposalResult.error) return { missing: ['accepted_origin_unavailable'] }
    const proposal = proposalResult.data?.[0]
    // Initial proposals have no originating weekly review.
    if (!proposal || proposal.status !== 'accepted' || proposal.weekly_review_id === null) return { missing: [] }
    if (proposal.user_id !== userId || proposal.program_id !== programId || proposal.proposed_plan_version_id !== acceptedPlanVersionId
      || typeof proposal.weekly_review_id !== 'string' || typeof proposal.base_plan_version_id !== 'string') {
      return { missing: ['accepted_origin_binding_invalid'] }
    }
    const [plan, review, invalidations, active] = await Promise.all([
      supabase.from('training_plan_versions').select('id,user_id,program_id,status,plan_mode,intent')
        .eq('user_id', userId).eq('program_id', programId).eq('id', acceptedPlanVersionId).eq('status', 'accepted').limit(1),
      supabase.from('coach_weekly_reviews')
        .select('id,user_id,program_id,base_plan_version_id,review_revision,action,presentation_class,evidence_status,rationale,missing_requirements,evidence_snapshot,policy_version,algorithm_version,created_at')
        .eq('user_id', userId).eq('program_id', programId).eq('id', proposal.weekly_review_id)
        .eq('base_plan_version_id', proposal.base_plan_version_id).limit(1),
      supabase.from('coach_review_source_invalidations').select('review_id').eq('user_id', userId)
        .eq('review_id', proposal.weekly_review_id).limit(1),
      supabase.from('training_programs').select('id,user_id,active_plan_version_id,status').eq('user_id', userId)
        .eq('id', programId).eq('status', 'active').eq('active_plan_version_id', acceptedPlanVersionId).limit(1),
    ])
    if ([plan, review, active].some(result => result.error)) return { missing: ['accepted_origin_unavailable'] }
    const activeRow = active.data?.[0]
    if (!activeRow || activeRow.id !== programId || activeRow.user_id !== userId
      || activeRow.active_plan_version_id !== acceptedPlanVersionId || activeRow.status !== 'active') {
      return { missing: ['accepted_origin_binding_changed'] }
    }
    const acceptedOrigin = projectAcceptedCoachingDecisionOrigin({ userId, programId, acceptedPlanVersionId,
      acceptedPlan: plan.data?.[0], proposal, review: review.data?.[0],
      sourceInvalidated: invalidations.error ? null : Boolean(invalidations.data?.length) })
    return acceptedOrigin ? { acceptedOrigin, missing: invalidations.error ? ['accepted_origin_source_validity_unknown'] : [] }
      : { missing: ['accepted_origin_invalid_or_oversized'] }
  } catch { return { missing: ['accepted_origin_unavailable'] } }
}
