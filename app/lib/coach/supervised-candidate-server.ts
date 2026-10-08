/** Prepare an UNAPPROVED candidate from an owned source and a proposed recipe.
 * No production registry, issuer, permission or approval is changed here.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatUTCAsLocalDateWithOffset } from '../timezone-utils'
import { doseContentHash, INITIAL_DOSE_POLICY_VERSION } from './initial-dose-policy'
import type { ReviewedWeekRecipe } from './offline-reviewed-week'
import { fetchReviewedDoseContext, type ReviewedContextScope } from './reviewed-dose-context-server'
import { prepareReviewedWeekProposalRegistration } from './reviewed-proposal-registration'
import type { TrustedReviewedWeekRegistration } from './reviewed-week-context-server'
import { reconcileReviewedWeekWindow } from './reviewed-week-transition'
import { decodeCoachWeeklyIntent } from './rolling-weekly-api'
import { buildRollingTrainingDirection } from './rolling-weekly-contracts'
import { parseSupervisedReviewPacket } from './supervised-programming-contract'
import { parseSupervisedCandidateDraft } from './supervised-candidate-draft'
import { projectReviewedEvidence } from './reviewed-evidence-projection'
export { parseSupervisedCandidateDraft, type SupervisedCandidateDraft } from './supervised-candidate-draft'

const same = (a: unknown, b: unknown) => doseContentHash(a) === doseContentHash(b)

export async function prepareSupervisedCandidate(db: SupabaseClient, input: unknown) {
  const draft = parseSupervisedCandidateDraft(input)
  if (!draft) return { kind: 'invalid_request' as const }
  try {
    const scope: ReviewedContextScope = { programId: draft.programId, basePlanVersionId: draft.basePlanVersionId,
      historyDays: draft.historyDays, tzOffset: draft.tzOffset,
      historyThrough: formatUTCAsLocalDateWithOffset(new Date().toISOString(), draft.tzOffset) }
    const source = await fetchReviewedDoseContext(db, scope)
    const base = decodeCoachWeeklyIntent(source.binding.base.plan.intent)
    if (!base || base.kind !== 'reviewed') return { kind: 'review_required' as const,
      reasons: ['A genuine compatible accepted reviewed base is required; first-base onboarding is separate.'] }
    const target = reconcileReviewedWeekWindow({ basePlanVersionId: scope.basePlanVersionId,
      base: base.plan, profile: source.profile, target: draft, kind: draft.transition })
    // These provisional IDs bind the mechanical preview, NOT a coach's decision.
    // Only the protected durable decision can later authorize this exact content.
    const provisionalReview = { id: `supervised-candidate:${draft.candidateId}`, contentHash: doseContentHash(draft) }
    const sources = [{ id: `owned-context:${draft.programId}`, revision: source.binding.revision, contentHash: source.contextHash }]
    const facts = { sourceHash: source.contextHash, basePlanVersionId: draft.basePlanVersionId }
    const recipe: ReviewedWeekRecipe = { ...draft.recipe, id: draft.candidateId, policyVersion: INITIAL_DOSE_POLICY_VERSION,
      review: provisionalReview, sources, profileHash: doseContentHash(target.profile), contextHash: doseContentHash(facts) }
    const registration: TrustedReviewedWeekRegistration = { id: draft.candidateId, userId: source.userId, scope,
      contextHash: source.contextHash, transition: draft.transition,
      compilation: { windowStart: draft.windowStart, sequenceNumber: draft.sequenceNumber,
        direction: buildRollingTrainingDirection(target.profile, { hypothesis: draft.rationale,
          goalTargetDate: base.plan.directionSnapshot.goalTargetDate }),
        context: { recipeId: recipe.id, scheduleId: draft.scheduleId, facts, currentReviews: [provisionalReview],
          currentSources: sources, unresolvedReasons: [] } },
      reviewedWeeks: [{ recipe, contentHash: doseContentHash(recipe) }] }
    // Reuse validation/freshness/continuity, but never add this provisional entry
    // to the runtime registry or call the registration/issuance transaction.
    const prepared = await prepareReviewedWeekProposalRegistration(db, registration.id, [registration])
    if (prepared.kind !== 'prepared_registration') return prepared
    if (prepared.packet.userId !== source.userId || prepared.packet.source.contextHash !== source.contextHash) {
      return { kind: 'review_required' as const, reasons: ['Source changed while preparing the review packet.'] }
    }
    if (source.performed.records.length > 64) return { kind: 'review_required' as const,
      reasons: ['The review packet needs a narrower explicit history window; evidence was not silently truncated.'] }
    const week = prepared.packet.intent.reviewed_week
    const evidence = projectReviewedEvidence(source.performed.records)
    const changes: Array<{ kind: 'changed' | 'preserved' | 'removed'; sessionIds: string[]; summary: string }> = week.scheduledSessions.map(slot => {
      const prior = base.plan.scheduledSessions.find(old => old.prescription.sessionId === slot.prescription.sessionId)
      // Provenance/date changes alone do not masquerade as a dose change.
      const preserved = prior && same(prior.prescription.content, slot.prescription.content)
        && same(prior.prescription.protocols, slot.prescription.protocols)
      return { kind: preserved ? 'preserved' as const : 'changed' as const,
        sessionIds: [slot.prescription.sessionId], summary: `${slot.prescription.title}: ${preserved
          ? 'work, preparation, rests and monitoring content retained' : 'complete session content requires review'}; scheduled ${slot.scheduledDate}.` }
    })
    for (const slot of base.plan.scheduledSessions) {
      if (!week.scheduledSessions.some(next => next.prescription.sessionId === slot.prescription.sessionId)) {
        changes.push({ kind: 'removed', sessionIds: [slot.prescription.sessionId],
          summary: `${slot.prescription.title}: removed from proposed week; review lost work, preparation, rest and monitoring against the accepted base.` })
      }
    }
    const reviewPacket = parseSupervisedReviewPacket({ schemaVersion: 1, reviewMode: 'manual_complete_week', week, baseWeek: base.plan,
      rationale: draft.rationale, changes, evidence,
      evidenceSource: { sourceHash: source.contextHash, revision: source.binding.revision,
        historyThrough: scope.historyThrough, historyDays: scope.historyDays },
      limitations: ['Unapproved proposed work; no programming authority or athlete acceptance.',
        'Rationale is a proposed explanation, not a verified observation.',
        'Evidence preserves structured effort, stop/symptom, rest, equipment and protocol context; unrelated narratives and private source tables are not shared.',
        'Additional-note flags require focused clarification if their content could change the prescription. Unrecorded readiness and outside work remain unknown.',
        ...source.limitations] })
    if (!reviewPacket) return { kind: 'review_required' as const, reasons: ['Complete bounded review packet could not be verified.'] }
    // Keep the exact detached compiler input private so issuance can reproduce
    // this packet against current owned source without developer registry edits.
    const privatePacket = { ...prepared.packet, inputSnapshot: { ...prepared.packet.inputSnapshot,
      supervisedCandidateDraft: structuredClone(draft) } }
    return { kind: 'prepared_candidate' as const, candidateId: draft.candidateId, enrollmentId: draft.enrollmentId,
      privatePacket, reviewPacket, submissionHash: doseContentHash({ privatePacket, reviewPacket }),
      persistable: false as const, numericRuntimeEligible: false as const }
  } catch { return { kind: 'review_required' as const, reasons: ['Current owned source or proposed complete week could not be verified.'] } }
}
