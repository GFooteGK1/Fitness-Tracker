/** Disposable current-source preview. No registration, submission or decision writes. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { doseContentHash } from './initial-dose-policy'
import { parseSupervisedCandidateDraft } from './supervised-candidate-draft'
import { prepareSupervisedCandidate } from './supervised-candidate-server'
import { readSupervisedProgramWorkspace } from './supervised-workspace-reader'
import { parseSupervisedReviewPacket } from './supervised-programming-contract'

export function createSupervisedCandidatePreview(options: { enabled: () => boolean }) {
  return async (db: SupabaseClient, input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).sort().join(',') !== 'draft,expectedUserId') return { kind: 'invalid_request' as const }
    const q = input as { expectedUserId: unknown; draft: unknown }, draft = parseSupervisedCandidateDraft(q.draft)
    if (!draft || typeof q.expectedUserId !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(q.expectedUserId)) return { kind: 'invalid_request' as const }
    const owner = q.expectedUserId
    const identity = { candidateId: draft.candidateId, enrollmentId: draft.enrollmentId, expectedUserId: owner, draftHash: doseContentHash(draft) }
    const unavailable = () => ({ kind: 'review_required' as const, identity,
      reasons: ['Current enrollment, accepted base, or proposed complete week could not be verified.'] })
    const sameOwner = async () => {
      const auth = await db.auth.getUser()
      return !auth.error && auth.data.user?.id === owner
    }
    const current = async () => {
      const result = await readSupervisedProgramWorkspace(db, { expectedUserId: owner, programId: draft.programId, limit: 1 })
      if (result.kind !== 'workspace') return false
      const p = result.page.program, e = p.latestEnrollment
      return p.role === 'athlete' && p.athleteId === owner && p.acceptedBaseId === draft.basePlanVersionId
        && e.enrollmentId === draft.enrollmentId && e.enabled && Date.parse(e.expiresAt) > Date.now() && e.operations.includes(draft.transition)
    }
    try {
      if (!await sameOwner()) return { kind: 'account_changed' as const, identity }
      if (!options.enabled()) return { kind: 'disabled' as const, identity }
      if (!await current()) return !await sameOwner() ? { kind: 'account_changed' as const, identity } : unavailable()
      const prepared = await prepareSupervisedCandidate(db, draft)
      if (!await sameOwner()) return { kind: 'account_changed' as const, identity }
      if (!options.enabled()) return { kind: 'disabled' as const, identity }
      if (prepared.kind !== 'prepared_candidate') {
        const reasons = 'reasons' in prepared ? prepared.reasons : null
        return Array.isArray(reasons) && reasons.length > 0 && reasons.length <= 32
          && reasons.every(reason => typeof reason === 'string' && reason.length > 0 && reason.length <= 4000)
          ? { kind: 'review_required' as const, identity, reasons } : unavailable()
      }
      const packet = parseSupervisedReviewPacket(prepared.reviewPacket)
      if (!packet || prepared.candidateId !== draft.candidateId || prepared.enrollmentId !== draft.enrollmentId
        || prepared.privatePacket.userId !== owner || !packet.week.scheduledSessions.every(slot => slot.prescription.source.review.contentHash === identity.draftHash)) return unavailable()
      if (!await current()) return !await sameOwner() ? { kind: 'account_changed' as const, identity } : unavailable()
      if (!await sameOwner()) return { kind: 'account_changed' as const, identity }
      if (!options.enabled()) return { kind: 'disabled' as const, identity }
      return { kind: 'preview' as const, identity, reviewPacket: packet }
    } catch { return unavailable() }
  }
}
