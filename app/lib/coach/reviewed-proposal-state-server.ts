import type { SupabaseClient } from '@supabase/supabase-js'
import { doseContentHash } from './initial-dose-policy'
import { decodeCoachWeeklyIntent } from './rolling-weekly-api'
import { parseCoachContextRevision } from './proposal-context-revision'
import type { ReviewedProposalState, ReviewedProposalIndex } from './reviewed-proposal-state'
import type { TrustedReviewedWeekRegistration } from './reviewed-week-context-server'
import { readReviewedDoseWeekSummary } from './reviewed-dose-week-reconciliation'

const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
async function revision(db: SupabaseClient, owner: string) {
  const result = await db.from('coach_context_revisions').select('user_id,revision').eq('user_id', owner).limit(2)
  const value = result.data?.length === 1 && result.data[0].user_id === owner ? parseCoachContextRevision(result.data[0].revision) : null
  if (result.error || value === null) throw new Error('Proposal revision unavailable')
  return value
}
const programQuery = (db: SupabaseClient, owner: string, id: string) => db.from('training_programs')
  .select('id,user_id,status,program_mode,active_plan_version_id').eq('user_id', owner).eq('id', id).limit(2)

/** Server-owned discovery exposes IDs only; issuance still revalidates all source.
 * Saved proposals remain discoverable when their registry entry is retired.
 */
export async function fetchReviewedProposalIndex(db: SupabaseClient, owner: string, programId: string,
  registry: readonly TrustedReviewedWeekRegistration[]): Promise<ReviewedProposalIndex | null> {
  const snapshot = structuredClone(registry), programResult = await programQuery(db, owner, programId)
  if (programResult.error || !Array.isArray(programResult.data) || programResult.data.length > 1) throw new Error('Program unavailable')
  if (!programResult.data.length) return null
  const program = programResult.data[0]
  if (program.id !== programId || program.user_id !== owner || program.program_mode !== 'rolling_weekly') throw new Error('Program mismatch')
  const result = await db.from('adaptation_proposals').select('id,user_id,program_id,status,rationale', { count: 'exact' })
    .eq('user_id', owner).eq('program_id', programId).eq('rationale->>proposal_mode', 'reviewed_rolling_week')
    .order('created_at', { ascending: false }).limit(100)
  if (result.error || !Array.isArray(result.data) || result.count !== result.data.length) throw new Error('Complete proposal list unavailable')
  const proposals = result.data.map(row => {
    if (row.user_id !== owner || row.program_id !== programId || !uuid.test(row.id)
      || row.rationale?.proposal_mode !== 'reviewed_rolling_week' || !['proposed', 'accepted', 'rejected', 'expired'].includes(row.status)) throw new Error('Invalid proposal list')
    return { proposalId: row.id, status: row.status }
  })
  const entries = program.status === 'active' ? snapshot.filter(entry => entry.userId === owner && entry.scope.programId === programId
    && entry.scope.basePlanVersionId === program.active_plan_version_id) : []
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Ambiguous review registry')
  const reviews = entries.map(entry => ({ reviewId: entry.id, windowStart: entry.compilation.windowStart, transition: entry.transition ?? 'same_week' as const }))
  const [after, auth] = await Promise.all([programQuery(db, owner, programId), db.auth.getUser()])
  if (after.error || after.data?.length !== 1 || doseContentHash(after.data[0]) !== doseContentHash(program)
    || auth.error || auth.data.user?.id !== owner) throw new Error('Program changed during discovery')
  return { userId: owner, programId, reviews, proposals }
}

/** Historical readback is not numerical authority. Acceptance remains atomic SQL. */
export async function fetchReviewedProposalState(db: SupabaseClient, owner: string, proposalId: string): Promise<ReviewedProposalState | null> {
  const read = () => db.from('adaptation_proposals').select('*').eq('user_id', owner).eq('id', proposalId).limit(2)
  const response = await read()
  if (response.error || !Array.isArray(response.data) || response.data.length > 1) throw new Error('Proposal unavailable')
  if (!response.data.length) return null
  const row = response.data[0], before = await revision(db, owner)
  if (row.id !== proposalId || row.user_id !== owner || row.rationale?.proposal_mode !== 'reviewed_rolling_week'
    || typeof row.rationale.reviewedRegistrationId !== 'string' || !uuid.test(row.rationale.reviewedRegistrationId)
    || !['proposed', 'accepted', 'rejected', 'expired'].includes(row.status)
    || typeof row.idempotency_key !== 'string' || row.idempotency_key.length < 8 || row.idempotency_key.length > 200) throw new Error('Invalid reviewed proposal')
  const [registered, programResult, plansResult] = await Promise.all([
    db.rpc('get_reviewed_week_registration', { p_registration_id: row.rationale.reviewedRegistrationId }),
    programQuery(db, owner, row.program_id),
    db.from('training_plan_versions').select('id,user_id,program_id,status,plan_mode,window_start,window_end,sequence_number,intent,input_snapshot')
      .eq('user_id', owner).eq('program_id', row.program_id).in('id', [row.base_plan_version_id, row.proposed_plan_version_id]).limit(3),
  ])
  const metadata = registered.data, program = programResult.data?.[0]
  const plan = plansResult.data?.find(p => p.id === row.proposed_plan_version_id), base = plansResult.data?.find(p => p.id === row.base_plan_version_id)
  const decoded = decodeCoachWeeklyIntent(plan?.intent), decodedBase = decodeCoachWeeklyIntent(base?.intent)
  if (registered.error || metadata?.userId !== owner || metadata?.proposalId !== row.id || metadata?.programId !== row.program_id
    || metadata?.planVersionId !== row.proposed_plan_version_id || metadata?.registrationId !== row.rationale.reviewedRegistrationId
    || programResult.error || programResult.data?.length !== 1 || program?.user_id !== owner || program.id !== row.program_id
    || plansResult.error || plansResult.data?.length !== 2 || !plan || !base || !decoded || decoded.kind !== 'reviewed' || !decodedBase
    || [plan, base].some(p => p.user_id !== owner || p.program_id !== row.program_id || p.plan_mode !== 'rolling_weekly')
    || plan.input_snapshot?.reviewedRegistrationId !== metadata.reviewId
    || plan.window_start !== decoded.plan.windowStart || plan.window_end !== decoded.plan.windowEnd || plan.sequence_number !== decoded.plan.sequenceNumber
    || (row.status === 'proposed' && plan.status !== 'proposed') || (row.status === 'accepted' && !['accepted', 'superseded'].includes(plan.status))) throw new Error('Proposal linkage unavailable')
  const receipt = plan.input_snapshot?.reviewedDoseReconciliation
  if (receipt !== undefined && decodedBase.kind !== 'reviewed') throw new Error('Reviewed dose base unavailable')
  const doseDecision = receipt !== undefined && decodedBase.kind === 'reviewed' ? readReviewedDoseWeekSummary(receipt, {
    owner, contextHash: plan.input_snapshot.reviewedSourceHash, basePlanVersionId: base.id,
    base: decodedBase.plan, target: decoded.plan,
  }) : undefined
  const [after, afterProgram, afterRevision, auth] = await Promise.all([read(), programQuery(db, owner, row.program_id), revision(db, owner), db.auth.getUser()])
  if (after.error || after.data?.length !== 1 || doseContentHash(after.data[0]) !== doseContentHash(row)
    || afterProgram.error || afterProgram.data?.length !== 1 || doseContentHash(afterProgram.data[0]) !== doseContentHash(program)
    || before !== afterRevision || auth.error || auth.data.user?.id !== owner) throw new Error('Proposal changed during readback')
  return { userId: owner, programId: row.program_id, proposalId: row.id, planVersionId: plan.id, basePlanVersionId: base.id,
    requestId: row.idempotency_key, status: row.status, activePlanVersionId: program.active_plan_version_id,
    acceptanceAvailable: row.status === 'proposed' && program.status === 'active' && program.active_plan_version_id === base.id
      && parseCoachContextRevision(plan.input_snapshot?.contextRevision) === before,
    plan: decoded.plan, baseWeek: decodedBase, ...(doseDecision ? { doseDecision } : {}) }
}
