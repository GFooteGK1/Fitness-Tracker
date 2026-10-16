/** Server composition only. A request selects IDs, never a recipe or source packet.
 * The immutable database registration is the recovery authority after a response
 * loss; never rebuild it from changed source data or mint replacement identities.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { prepareReviewedWeekProposalRegistration } from './reviewed-proposal-registration'
import type { TrustedReviewedWeekRegistration } from './reviewed-week-context-server'

export interface ReviewedProposalRequest {
  reviewId: string
  registrationId: string
  requestId: string
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function parseRequest(value: unknown): ReviewedProposalRequest | null {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'registrationId,requestId,reviewId'
    || typeof value.reviewId !== 'string' || !value.reviewId.length || value.reviewId.length > 200
    || typeof value.registrationId !== 'string' || !uuid.test(value.registrationId)
    || typeof value.requestId !== 'string' || value.requestId.length < 8 || value.requestId.length > 200
    || value.requestId !== value.requestId.trim()) return null
  return { reviewId: value.reviewId, registrationId: value.registrationId.toLowerCase(), requestId: value.requestId }
}

// Match exact SQL contracts, not broad error codes: serialization/lock/transport
// failures with similar codes do not establish a permanent source rejection.
const staleSourceMessages = new Set([
  'Reviewed active base changed', 'Reviewed accepted source changed', 'Reviewed source validity elapsed',
  'Reviewed memory lifecycle changed', 'Reviewed execution registration requires refresh',
  'Reviewed execution source changed or incomplete', 'Planning context changed; refresh the draft or review',
])
function knownRejection(error: unknown, request: ReviewedProposalRequest) {
  if (!isRecord(error)) return null
  if (error.code === '22023' && (error.message === 'Registration ID was used for different content'
    || error.message === 'Proposal request key was used for different registration'
    || error.message === 'Registration was issued with another request key')) {
    return { kind: 'request_conflict' as const, request,
      message: 'This identity conflicts with a saved request. Recover the original request before continuing.' }
  }
  if ((error.code === '40001' && typeof error.message === 'string' && staleSourceMessages.has(error.message))
    || (error.code === '55000' && error.message === 'Resolve begun execution before advancing the week')) {
    return { kind: 'review_required' as const, request,
      reasons: ['The saved review no longer matches current source or execution. Review the current state before proposing again.'] }
  }
  return null
}

/** These options belong to server composition, never an HTTP/model payload.
 * No route enables this factory yet. The production composition stays disabled.
 */
export function createReviewedWeekProposalIssuer(options: {
  registry: readonly TrustedReviewedWeekRegistration[]
  enabled: () => boolean
  createServiceClient: () => SupabaseClient
}) {
  const registry = structuredClone(options.registry)
  return async function issueReviewedWeekProposal(userDb: SupabaseClient, input: unknown) {
    if (!options.enabled()) return { kind: 'disabled' as const }
    const request = parseRequest(input)
    if (!request) return { kind: 'invalid_request' as const }
    const retry = () => ({ kind: 'retry_required' as const, request,
      message: 'Keep this request identity and retry to recover its result.' })
    try {
      const auth = await userDb.auth.getUser()
      const owner = auth.data.user?.id
      if (auth.error || !owner) return { kind: 'unauthenticated' as const }
      const sameOwner = async () => {
        const current = await userDb.auth.getUser()
        return !current.error && current.data.user?.id === owner
      }
      const lookup = await userDb.rpc('get_reviewed_week_registration', { p_registration_id: request.registrationId })
      if (lookup.error) return retry() // unavailable is not proof that registration is absent
      let saved: unknown = lookup.data
      if (saved === null) {
        const prepared = await prepareReviewedWeekProposalRegistration(userDb, request.reviewId, registry)
        if (prepared.kind !== 'prepared_registration') return { ...prepared, request }
        if (prepared.packet.userId !== owner || prepared.packet.registrationId !== request.reviewId
          || !await sameOwner()) return retry()
        if (!options.enabled()) return { kind: 'disabled' as const }
        const registered = await options.createServiceClient().rpc('register_reviewed_week_proposal', {
          p_id: request.registrationId, p_packet: prepared.packet, p_fingerprint: prepared.fingerprint,
        })
        if (registered.error) return knownRejection(registered.error, request) ?? retry()
        // Recovery and first issuance share the same owned readback contract.
        const readback = await userDb.rpc('get_reviewed_week_registration', { p_registration_id: request.registrationId })
        if (readback.error) return retry()
        saved = readback.data
      }
      if (!isRecord(saved) || saved.registrationId !== request.registrationId || saved.userId !== owner
        || saved.reviewId !== request.reviewId || typeof saved.proposalId !== 'string' || !uuid.test(saved.proposalId)
        || typeof saved.planVersionId !== 'string' || !uuid.test(saved.planVersionId)
        || typeof saved.programId !== 'string' || !uuid.test(saved.programId)) return retry()
      if (!await sameOwner()) return retry()
      if (!options.enabled()) return { kind: 'disabled' as const }
      const issued = await userDb.rpc('create_registered_reviewed_week_proposal', {
        p_registration_id: request.registrationId, p_idempotency_key: request.requestId,
      })
      if (issued.error) return knownRejection(issued.error, request) ?? retry()
      if (!isRecord(issued.data) || issued.data.proposalId !== saved.proposalId
        || issued.data.planVersionId !== saved.planVersionId || issued.data.programId !== saved.programId
        || typeof issued.data.replayed !== 'boolean') return retry()
      return { kind: 'issued' as const, request, proposalId: saved.proposalId,
        planVersionId: saved.planVersionId, programId: saved.programId, replayed: issued.data.replayed }
    } catch {
      // Includes thrown transport errors and response loss after a committed RPC.
      // Never imply rollback, replace the key, or automatically resend a mutation.
      return retry()
    }
  }
}
