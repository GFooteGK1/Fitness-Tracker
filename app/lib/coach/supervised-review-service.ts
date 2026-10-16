/** Server-only factory, deliberately not wired into routes or numerical issuance.
 * A durable review approval is distinct from permission to issue/accept a week.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { doseContentHash } from './initial-dose-policy'
import { parseSupervisedCandidateDraft, prepareSupervisedCandidate } from './supervised-candidate-server'
import { parseSupervisedCandidateReview as parseCandidate, parseSupervisedDecisionReceipt as parseReceipt, parseSupervisedReviewDecision as parseDecision, type SupervisedDecisionReceipt, type SupervisedReviewDecision } from './supervised-programming-contract'
export type { SupervisedReviewDecision } from './supervised-programming-contract'

const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: Record<string, unknown>, fields: string[]) => Object.keys(v).sort().join(',') === [...fields].sort().join(',')
const same = (a: unknown, b: unknown) => doseContentHash(a) === doseContentHash(b)

const receiptMatches = (r: SupervisedDecisionReceipt, q: SupervisedReviewDecision) => r.reviewerId === q.expectedUserId
  && r.candidateId === q.candidateId && r.requestId === q.requestId && r.decision === q.decision
  && r.enrollmentId === q.enrollmentId && r.contentHash === q.contentHash && r.sourceHash === q.sourceHash

export function createSupervisedReviewService(options: { enabled: () => boolean; createServiceClient: () => SupabaseClient }) {
  const owner = async (db: SupabaseClient) => {
    const auth = await db.auth.getUser()
    return !auth.error && uuid(auth.data.user?.id) ? auth.data.user!.id : null
  }
  const read = async (db: SupabaseClient, candidateId: string) => {
    if (!uuid(candidateId)) return { kind: 'invalid_request' as const }
    try {
      const actor = await owner(db)
      if (!actor) return { kind: 'unauthenticated' as const }
      const result = await db.rpc('get_supervised_candidate', { p_id: candidateId })
      if (result.error) return { kind: 'unavailable' as const }
      if (result.data === null) return { kind: 'not_found' as const }
      const candidate = parseCandidate(result.data)
      if (!candidate || candidate.candidateId !== candidateId || ![candidate.userId, candidate.reviewerId].includes(actor)
        || await owner(db) !== actor) return { kind: 'unavailable' as const }
      return { kind: 'candidate' as const, candidate }
    } catch { return { kind: 'unavailable' as const } }
  }

  const submit = async (db: SupabaseClient, expectedUserId: string, input: unknown) => {
    const draft = parseSupervisedCandidateDraft(input)
    if (!uuid(expectedUserId) || !draft) return { kind: 'invalid_request' as const }
    const identity = { candidateId: draft.candidateId, enrollmentId: draft.enrollmentId,
      expectedUserId, draftHash: doseContentHash(draft) }
    const retry = () => ({ kind: 'retry_required' as const, identity })
    try {
      if (await owner(db) !== expectedUserId) return { kind: 'account_changed' as const, identity }
      // Determine an existing result before any fresh source read or mutation.
      const existing = await read(db, draft.candidateId)
      if (await owner(db) !== expectedUserId) return retry()
      if (existing.kind === 'candidate') {
        const c = existing.candidate
        return c.userId === expectedUserId && c.enrollmentId === draft.enrollmentId && c.programId === draft.programId
          && c.basePlanVersionId === draft.basePlanVersionId && c.transition === draft.transition
          && c.reviewPacket.week.scheduledSessions.every(slot => slot.prescription.source.review.contentHash === identity.draftHash)
          ? { kind: 'saved' as const, candidate: c, replayed: true, identity }
          : { kind: 'request_conflict' as const, identity }
      }
      if (existing.kind !== 'not_found') return retry()
      if (!options.enabled()) return { kind: 'disabled' as const, identity }
      const prepared = await prepareSupervisedCandidate(db, draft)
      if (prepared.kind !== 'prepared_candidate') return { ...prepared, identity }
      if (prepared.privatePacket.userId !== expectedUserId || await owner(db) !== expectedUserId) return retry()
      if (!options.enabled()) return { kind: 'disabled' as const, identity }
      const saved = await options.createServiceClient().rpc('submit_supervised_candidate', { p_id: draft.candidateId,
        p_enrollment_id: draft.enrollmentId, p_private_packet: prepared.privatePacket, p_review_packet: prepared.reviewPacket })
      if (saved.error) return retry() // A rejected attempt does not prove an older uncertain save absent.
      const candidate = parseCandidate(saved.data)
      if (!candidate || candidate.userId !== expectedUserId || candidate.candidateId !== draft.candidateId
        || candidate.enrollmentId !== draft.enrollmentId || candidate.programId !== draft.programId
        || candidate.basePlanVersionId !== draft.basePlanVersionId || candidate.transition !== draft.transition
        || !same(candidate.reviewPacket, prepared.reviewPacket) || await owner(db) !== expectedUserId) return retry()
      return { kind: 'saved' as const, candidate, replayed: false, identity }
    } catch { return retry() }
  }

  const decide = async (db: SupabaseClient, input: unknown) => {
    const request = parseDecision(input)
    if (!request) return { kind: 'invalid_request' as const }
    const retry = () => ({ kind: 'retry_required' as const, request })
    try {
      if (await owner(db) !== request.expectedUserId) return { kind: 'account_changed' as const, request }
      const saved = await db.rpc('get_supervised_decision_receipt', { p_request_id: request.requestId })
      if (saved.error) return retry()
      if (saved.data !== null) {
        const receipt = parseReceipt(saved.data)
        if (!receipt || await owner(db) !== request.expectedUserId) return retry()
        return receiptMatches(receipt, request) ? { kind: 'decided' as const, receipt }
          : { kind: 'request_conflict' as const, request }
      }
      if (!options.enabled()) return { kind: 'disabled' as const, request }
      if (await owner(db) !== request.expectedUserId) return retry()
      if (!options.enabled()) return { kind: 'disabled' as const, request }
      const result = await db.rpc('decide_supervised_candidate', { p_id: request.candidateId, p_request_id: request.requestId,
        p_decision: request.decision, p_content_hash: request.contentHash, p_source_hash: request.sourceHash, p_enrollment_id: request.enrollmentId })
      if (result.error) return retry()
      const receipt = parseReceipt(result.data)
      if (await owner(db) !== request.expectedUserId) return retry()
      return receipt && receiptMatches(receipt, request) ? { kind: 'decided' as const, receipt } : retry()
    } catch { return retry() }
  }

  /** Private server result; never return this object from a reviewer HTTP read.
   * It supplies no enrollment enforcement for the existing issuer by itself.
   */
  const resolveApproved = async (db: SupabaseClient, candidateId: string) => {
    try {
      if (!options.enabled()) return { kind: 'disabled' as const }
      const actor = await owner(db), visible = await read(db, candidateId)
      if (!actor || visible.kind !== 'candidate' || visible.candidate.userId !== actor) return { kind: 'unavailable' as const }
      const c = visible.candidate
      const result = await options.createServiceClient().rpc('get_approved_supervised_candidate', { p_id: c.candidateId,
        p_content_hash: c.contentHash, p_source_hash: c.sourceHash, p_enrollment_id: c.enrollmentId })
      if (result.error || !record(result.data) || !exact(result.data, ['candidate', 'decision', 'privatePacket'])) return { kind: 'review_required' as const }
      const returned = parseCandidate(result.data.candidate), decision = parseReceipt(result.data.decision), packet = result.data.privatePacket
      if (!returned || !same(returned, c) || !decision || decision.decision !== 'approve' || decision.candidateId !== c.candidateId
        || decision.enrollmentId !== c.enrollmentId || decision.enrollmentVersion !== c.enrollmentVersion || decision.reviewerId !== c.reviewerId
        || decision.contentHash !== c.contentHash || decision.sourceHash !== c.sourceHash
        || !record(packet) || packet.registrationId !== c.candidateId || packet.userId !== actor || !record(packet.source)
        || packet.source.contextHash !== c.sourceHash || !record(packet.intent) || !same(packet.intent.reviewed_week, c.reviewPacket.week)
        || packet.schemaVersion !== 2 || !record(packet.source.binding) || !record(packet.source.binding.scope)
        || packet.source.binding.scope.programId !== c.programId || packet.source.binding.scope.basePlanVersionId !== c.basePlanVersionId
        || !record(packet.inputSnapshot) || !record(packet.inputSnapshot.reviewedWeekTransition)
        || packet.inputSnapshot.reviewedWeekTransition.kind !== c.transition
        || !same(packet.sessions, c.reviewPacket.week.scheduledSessions.map((slot, index) => ({
          week_number: 1, session_index: index + 1, scheduled_date: slot.scheduledDate, prescription: slot.prescription })))
        || await owner(db) !== actor || !options.enabled()) return { kind: 'unavailable' as const }
      return { kind: 'approved_candidate' as const, candidate: c, decision, privatePacket: structuredClone(packet), numericRuntimeEligible: false as const }
    } catch { return { kind: 'unavailable' as const } }
  }
  return { read, submit, decide, resolveApproved }
}
