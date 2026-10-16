/** Read-only recovery for supervised programming. Absence never authorizes resend.
 * This factory is not runtime composition and has no privileged database client.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { doseContentHash } from './initial-dose-policy'
import { parseProposalResolutionIdentity, type ProposalResolutionIdentity } from './reviewed-proposal-resolution'
import { parseReviewedRequestResolution } from './reviewed-request-resolution'

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: Record<string, unknown>, fields: string[]) => Object.keys(v).sort().join(',') === [...fields].sort().join(',')
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const same = (a: unknown, b: unknown) => doseContentHash(a) === doseContentHash(b)

type OperationIdentity =
  | { operation: 'issue'; identity: Extract<ProposalResolutionIdentity, { reviewId: string }> }
  | { operation: 'accept'; identity: Extract<ProposalResolutionIdentity, { proposalId: string }> }
  | { operation: 'set'; identity: { sessionId: string; report: Record<string, unknown> } }
  | { operation: 'complete'; identity: { sessionId: string; completion: Record<string, unknown> } }
export type SupervisedLifecycleRequest = OperationIdentity & { expectedUserId: string; programId: string; requestId: string }
export type SupervisedLifecycleReceipt = {
  schemaVersion: 1; userId: string; programId: string; operation: SupervisedLifecycleRequest['operation']
  requestId: string; identity: SupervisedLifecycleRequest['identity']
} & ({ disposition: 'saved'; result: Record<string, unknown> } | { disposition: 'not_found'; result: null })

/** Preserve the exact historical payload instead of normalizing it through a
 * newer write schema. Only identity/bounds are needed for this read-only lookup.
 */
export function parseSupervisedLifecycleRequest(value: unknown): SupervisedLifecycleRequest | null {
  try {
    doseContentHash(value)
    if (!record(value) || !exact(value, ['expectedUserId', 'programId', 'operation', 'requestId', 'identity'])
      || !uuid(value.expectedUserId) || !uuid(value.programId) || typeof value.requestId !== 'string'
      || value.requestId.trim() !== value.requestId || value.requestId.length < 8
      || value.requestId.length > (value.operation === 'complete' ? 175 : 200)
      || new TextEncoder().encode(JSON.stringify(value)).length > 120000) return null
    if (value.operation === 'issue' || value.operation === 'accept') {
      const identity = parseProposalResolutionIdentity(value.operation, value.identity)
      if (!identity) return null
      return structuredClone({ ...value, identity }) as SupervisedLifecycleRequest
    }
    if (value.operation !== 'set' && value.operation !== 'complete') return null
    const field = value.operation === 'set' ? 'report' : 'completion'
    if (!record(value.identity) || !exact(value.identity, ['sessionId', field])
      || !uuid(value.identity.sessionId) || !record(value.identity[field])) return null
    return structuredClone(value) as SupervisedLifecycleRequest
  } catch { return null }
}

export function parseSupervisedLifecycleReceipt(value: unknown, expected: SupervisedLifecycleRequest): SupervisedLifecycleReceipt | null {
  try {
    doseContentHash(value)
    if (!record(value) || !exact(value, ['schemaVersion', 'userId', 'programId', 'operation', 'requestId', 'identity', 'disposition', 'result'])
      || value.schemaVersion !== 1 || value.userId !== expected.expectedUserId || value.programId !== expected.programId
      || value.operation !== expected.operation || value.requestId !== expected.requestId || !same(value.identity, expected.identity)
      || new TextEncoder().encode(JSON.stringify(value)).length > 250000) return null
    if (value.disposition === 'not_found') return value.result === null ? structuredClone(value) as SupervisedLifecycleReceipt : null
    if (value.disposition !== 'saved' || !record(value.result)) return null
    const r = value.result
    if (expected.operation === 'issue') {
      if (!exact(r, ['proposalId', 'programId', 'planVersionId', 'replayed']) || !uuid(r.proposalId) || !uuid(r.planVersionId)
        || r.programId !== expected.programId || r.replayed !== true) return null
    } else if (expected.operation === 'accept') {
      if (!('proposalId' in expected.identity) || !exact(r, ['accepted_program_id', 'active_plan_version_id', 'proposal_status'])
        || r.accepted_program_id !== expected.programId || r.active_plan_version_id !== expected.identity.planVersionId
        || r.proposal_status !== 'accepted') return null
    } else {
      const sessionId = expected.identity.sessionId
      const payload = expected.operation === 'set' ? expected.identity.report : expected.identity.completion
      const saved = parseReviewedRequestResolution({ schemaVersion: 1, userId: expected.expectedUserId,
        sessionId, operation: expected.operation, requestId: expected.requestId, payload, disposition: 'saved', result: r },
      { userId: expected.expectedUserId, sessionId, operation: expected.operation, requestId: expected.requestId, payload })
      if (!saved) return null
    }
    return structuredClone(value) as SupervisedLifecycleReceipt
  } catch { return null }
}

/** Works when writes are disabled. A successful lookup performs exactly one
 * authenticated getter RPC, never a mutating resolver, issuer or completion.
 */
export async function recoverSupervisedLifecycle(db: SupabaseClient, input: unknown) {
  const request = parseSupervisedLifecycleRequest(input)
  if (!request) return { kind: 'invalid_request' as const }
  const retry = () => ({ kind: 'retry_required' as const, request })
  try {
    const before = await db.auth.getUser()
    if (before.error || before.data.user?.id !== request.expectedUserId) return { kind: 'account_changed' as const, request }
    const result = await db.rpc('get_supervised_lifecycle_receipt', { p_program_id: request.programId,
      p_operation: request.operation, p_request_id: request.requestId, p_identity: request.identity })
    const after = await db.auth.getUser()
    if (after.error || after.data.user?.id !== request.expectedUserId) return { kind: 'account_changed' as const, request }
    if (result.error) return result.error.code === '22023' ? { kind: 'request_conflict' as const, request } : retry()
    const receipt = parseSupervisedLifecycleReceipt(result.data, request)
    if (!receipt) return retry()
    // An in-flight transaction could still commit. Do not clear pending state,
    // invent a no-write fence, generate a new request key or resend the mutation.
    if (receipt.disposition === 'not_found') return { kind: 'unconfirmed' as const, request, receipt }
    return { kind: 'recovered' as const, request, receipt }
  } catch { return retry() }
}
