import type { SupabaseClient } from '@supabase/supabase-js'
import { projectAcceptedCoachingDecisionOrigin, projectCoachingDecisionContext, type CoachingDecisionContext } from './coaching-decision-context'

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
      sourceInvalidated: Boolean(invalidations.data?.length), superseded: Boolean(successors.data?.length) || !active.data?.length })
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
