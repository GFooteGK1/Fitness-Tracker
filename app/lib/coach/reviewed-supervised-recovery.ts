import type { SupabaseClient } from '@supabase/supabase-js'
import { recoverSupervisedLifecycle } from './supervised-lifecycle-recovery'
import type { SupervisedResourceScope } from './supervised-resource-access'
import { parseReviewedRequestResolution } from './reviewed-request-resolution'
import { parseReviewedProposalResolution } from './reviewed-proposal-resolution'

export type ReviewedScopedOperation = 'accept' | 'set' | 'complete' | 'resolve' | 'proposal_resolve'
/** Map exact immutable saved receipts to existing runner response contracts.
 * This never invokes a resolver that could create a fence or another write.
 */
export async function recoverReviewedSupervisedRequest(db: SupabaseClient, scope: SupervisedResourceScope,
  operation: ReviewedScopedOperation, body: Record<string, unknown>) {
  const op = operation === 'resolve' || operation === 'proposal_resolve' ? body.operation : operation
  const identity = operation === 'accept' ? { proposalId: scope.resourceId, planVersionId: scope.planVersionId }
    : operation === 'proposal_resolve' ? body.identity
      : { sessionId: scope.resourceId, [op === 'set' ? 'report' : 'completion']: operation === 'resolve' ? body.payload : body[op === 'set' ? 'report' : 'completion'] }
  const recovered = await recoverSupervisedLifecycle(db, { expectedUserId: scope.userId, programId: scope.programId,
    operation: op, requestId: body.requestId, identity })
  if (recovered.kind !== 'recovered') return recovered
  const result = recovered.receipt.result
  if (!result) return { kind: 'retry_required' as const }
  if (operation === 'resolve') {
    const expected = { userId: scope.userId, sessionId: scope.resourceId, operation: op as 'set' | 'complete', requestId: body.requestId as string, payload: body.payload }
    const resolution = parseReviewedRequestResolution({ ...expected, schemaVersion: 1, disposition: 'saved', result }, expected)
    return resolution ? { kind: 'saved_response' as const, response: { kind: 'resolved', resolution } } : { kind: 'retry_required' as const }
  }
  if (operation === 'proposal_resolve') {
    const expected = { userId: scope.userId, programId: scope.programId, operation: op as 'issue' | 'accept',
      requestId: body.requestId as string, identity: recovered.request.identity as import('./reviewed-proposal-resolution').ProposalResolutionIdentity }
    const proposalId = op === 'issue' ? result.proposalId : (expected.identity as { proposalId: string }).proposalId
    const planVersionId = op === 'issue' ? result.planVersionId : result.active_plan_version_id
    const resolution = parseReviewedProposalResolution({ ...expected, schemaVersion: 1, disposition: 'saved', proposalId, planVersionId,
      activePlanVersionId: op === 'accept' ? result.active_plan_version_id : null }, expected)
    return resolution ? { kind: 'saved_response' as const, response: { kind: 'resolved', resolution } } : { kind: 'retry_required' as const }
  }
  return { kind: 'saved_response' as const, response: operation === 'accept'
    ? { kind: 'accepted', requestId: body.requestId, proposalId: scope.resourceId, accepted: result }
    : operation === 'set' ? { kind: 'saved', requestId: body.requestId, sessionId: scope.resourceId, setReport: result }
      : { kind: 'saved', requestId: body.requestId, result: result.result, receipt: result.receipt } }
}
