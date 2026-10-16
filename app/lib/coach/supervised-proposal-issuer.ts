/** Private server composition. Durable approval replaces per-week registry edits.
 * No route, enrollment, runtime flag or numerical policy is enabled here.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { doseContentHash } from './initial-dose-policy'
import { parseSupervisedCandidateDraft, prepareSupervisedCandidate } from './supervised-candidate-server'
import { recoverSupervisedLifecycle } from './supervised-lifecycle-recovery'
import type { createSupervisedReviewService } from './supervised-review-service'

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const same = (a: unknown, b: unknown) => doseContentHash(a) === doseContentHash(b)
interface IssueRequest { expectedUserId: string; programId: string; candidateId: string; requestId: string }
function parseRequest(v: unknown): IssueRequest | null {
  if (!record(v) || Object.keys(v).sort().join(',') !== 'candidateId,expectedUserId,programId,requestId'
    || ![v.expectedUserId, v.programId, v.candidateId].every(uuid) || typeof v.requestId !== 'string'
    || v.requestId.trim() !== v.requestId || v.requestId.length < 8 || v.requestId.length > 200) return null
  return structuredClone(v) as unknown as IssueRequest
}

export function createSupervisedWeekIssuer(options: {
  enabled: () => boolean
  createServiceClient: () => SupabaseClient
  review: Pick<ReturnType<typeof createSupervisedReviewService>, 'read' | 'resolveApproved'>
}) {
  return async (db: SupabaseClient, input: unknown) => {
    const request = parseRequest(input)
    if (!request) return { kind: 'invalid_request' as const }
    const retry = () => ({ kind: 'retry_required' as const, request })
    const changed = () => ({ kind: 'account_changed' as const, request })
    const disabled = () => ({ kind: 'disabled' as const, request })
    const reviewRequired = () => ({ kind: 'review_required' as const, request,
      reasons: ['The approved packet cannot be reproduced from current owned source. Submit a new candidate for review.'] })
    const sameOwner = async () => {
      const auth = await db.auth.getUser()
      return !auth.error && auth.data.user?.id === request.expectedUserId
    }
    try {
      // Receipt reads precede current-source/enablement checks. An absent receipt
      // is unconfirmed, never a no-write fence or permission to change identity.
      const recovered = await recoverSupervisedLifecycle(db, { expectedUserId: request.expectedUserId,
        programId: request.programId, operation: 'issue', requestId: request.requestId,
        identity: { reviewId: request.candidateId, registrationId: request.candidateId } })
      if (recovered.kind === 'recovered') return { kind: 'recovered' as const, request, receipt: recovered.receipt }
      if (recovered.kind !== 'unconfirmed') return { ...recovered, request }
      if (!options.enabled()) return disabled()
      const lookup = await db.rpc('get_reviewed_week_registration', { p_registration_id: request.candidateId })
      if (!await sameOwner()) return changed()
      if (lookup.error) return retry()
      let saved: unknown = lookup.data
      if (saved === null) {
        const approved = await options.review.resolveApproved(db, request.candidateId)
        if (!await sameOwner()) return changed()
        if (approved.kind !== 'approved_candidate') return { ...approved, request }
        const c = approved.candidate, packet = approved.privatePacket
        if (c.candidateId !== request.candidateId || c.userId !== request.expectedUserId || c.programId !== request.programId
          || !record(packet.inputSnapshot)) return reviewRequired()
        const draft = parseSupervisedCandidateDraft(packet.inputSnapshot.supervisedCandidateDraft)
        if (!draft || draft.candidateId !== c.candidateId || draft.enrollmentId !== c.enrollmentId
          || draft.programId !== c.programId || draft.basePlanVersionId !== c.basePlanVersionId || draft.transition !== c.transition
          || !c.reviewPacket.week.scheduledSessions.every(slot =>
            slot.prescription.source.review.contentHash === doseContentHash(draft))) return reviewRequired()
        const prepared = await prepareSupervisedCandidate(db, draft)
        if (!await sameOwner()) return changed()
        // Compare all private and visible content. Never refresh an old approval
        // by normalizing differences, dropping timestamps or replacing sources.
        if (prepared.kind !== 'prepared_candidate' || !same(prepared.privatePacket, packet)
          || !same(prepared.reviewPacket, c.reviewPacket)) return reviewRequired()
        if (!options.enabled()) return disabled()
        const registered = await options.createServiceClient().rpc('register_reviewed_week_proposal', {
          p_id: request.candidateId, p_packet: prepared.privatePacket, p_fingerprint: doseContentHash(prepared.privatePacket),
        })
        if (!await sameOwner()) return changed()
        if (registered.error) return retry()
        const readback = await db.rpc('get_reviewed_week_registration', { p_registration_id: request.candidateId })
        if (!await sameOwner()) return changed()
        if (readback.error) return retry()
        saved = readback.data
      }
      if (!record(saved) || saved.registrationId !== request.candidateId || saved.reviewId !== request.candidateId
        || saved.userId !== request.expectedUserId || saved.programId !== request.programId
        || !uuid(saved.proposalId) || !uuid(saved.planVersionId)) return retry()
      // Legacy registrations remain supported by the shared SQL issuer. Require
      // immutable supervised lineage here, including an existing registration,
      // so this factory cannot become a global-policy bypass for nonpilot work.
      const visible = await options.review.read(db, request.candidateId)
      if (!await sameOwner()) return changed()
      if (visible.kind === 'unavailable' || visible.kind === 'unauthenticated') return retry()
      if (visible.kind !== 'candidate' || visible.candidate.candidateId !== request.candidateId
        || visible.candidate.userId !== request.expectedUserId || visible.candidate.programId !== request.programId) return reviewRequired()
      if (!await sameOwner()) return changed()
      if (!options.enabled()) return disabled()
      // One explicit issuance attempt. SQL checks durable supervision, approval,
      // enrollment, source and pause atomically, including already-registered work.
      const issued = await db.rpc('create_registered_reviewed_week_proposal', {
        p_registration_id: request.candidateId, p_idempotency_key: request.requestId,
      })
      if (!await sameOwner()) return changed()
      if (issued.error) return issued.error.code === '22023'
        ? { kind: 'request_conflict' as const, request } : retry()
      if (!record(issued.data) || issued.data.proposalId !== saved.proposalId || issued.data.planVersionId !== saved.planVersionId
        || issued.data.programId !== saved.programId || typeof issued.data.replayed !== 'boolean') return retry()
      return { kind: 'issued' as const, request, proposalId: saved.proposalId, planVersionId: saved.planVersionId,
        programId: saved.programId, replayed: issued.data.replayed }
    } catch { return retry() }
  }
}
