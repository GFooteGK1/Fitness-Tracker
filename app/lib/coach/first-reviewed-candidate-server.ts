/** First onboarding preview only. Durable review, issuance and acceptance are
 * separate transactions; a prepared packet never grants programming authority. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatUTCAsLocalDateWithOffset } from '../timezone-utils'
import { doseContentHash, INITIAL_DOSE_POLICY_VERSION } from './initial-dose-policy'
import { REVIEWED_MOVEMENT_CATALOG_VERSION } from './movement-catalog'
import { fetchReviewedDoseContext } from './reviewed-dose-context-server'
import { captureSetupMemoryBindings } from './setup-memory-bindings'
import { reviewedSourceValidBefore } from './reviewed-proposal-registration'
import { decodeCoachWeeklyIntent } from './rolling-weekly-api'
import { buildRollingTrainingDirection } from './rolling-weekly-contracts'
import { buildReviewedRollingWeeklyPlan } from './rolling-weekly-plan'
import type { ReviewedWeekRecipe } from './offline-reviewed-week'
import { reconcileFirstReviewedWindow, reconcileFirstReviewedExecution } from './first-reviewed-week'
import { legacyReviewBase, parseFirstReviewedDraft, parseFirstReviewedReviewPacket, parseFirstReviewDesignation } from './first-reviewed-contract'
import { projectReviewedEvidence } from './reviewed-evidence-projection'
import { projectFirstReviewedProfileFacts } from './first-reviewed-profile-facts'
import { parseFirstReviewedProfileReceipt } from './first-reviewed-profile-contract'
import { validateFirstReviewedProfileSnapshot } from './first-reviewed-profile-validation'

export async function prepareFirstReviewedCandidate(db: SupabaseClient, input: unknown) {
  const draft = parseFirstReviewedDraft(input)
  if (!draft) return { kind: 'invalid_request' as const }
  try {
    const designationResult = await db.rpc('get_current_first_review_designation', { p_id: draft.designationId })
    const designation = designationResult.error ? null : parseFirstReviewDesignation(designationResult.data)
    if (!designation || designation.designationId !== draft.designationId || designation.programId !== draft.programId
      || designation.basePlanVersionId !== draft.basePlanVersionId || designation.targetWindowStart !== draft.windowStart
      || !designation.enabled || Date.parse(designation.expiresAt) <= Date.now()) throw new Error('First reviewer scope changed')
    const scope = { programId: draft.programId, basePlanVersionId: draft.basePlanVersionId, historyDays: draft.historyDays,
      tzOffset: draft.tzOffset, historyThrough: formatUTCAsLocalDateWithOffset(new Date().toISOString(), draft.tzOffset) }
    const snapshotResult = await db.rpc('get_first_review_profile_snapshot',{ p_id:draft.profileSnapshotId })
    const receiptResult = await db.rpc('get_first_review_profile_receipt',{ p_request_id:draft.profileConfirmationRequestId })
    const snapshot = snapshotResult.error ? null : validateFirstReviewedProfileSnapshot(snapshotResult.data)
    const receipt = receiptResult.error ? null : parseFirstReviewedProfileReceipt(receiptResult.data)
    if (!snapshot || !receipt || snapshot.snapshotId !== draft.profileSnapshotId || snapshot.designationId !== designation.designationId
      || snapshot.userId !== designation.userId || snapshot.programId !== draft.programId || snapshot.basePlanVersionId !== draft.basePlanVersionId
      || snapshot.historyDays !== scope.historyDays || snapshot.historyThrough !== scope.historyThrough || snapshot.tzOffset !== scope.tzOffset
      || snapshot.profileHash !== draft.confirmedTargetProfileHash || doseContentHash(snapshot.projection.profile) !== doseContentHash(draft.confirmedTargetProfile)
      || receipt.snapshotId !== snapshot.snapshotId || receipt.requestId !== draft.profileConfirmationRequestId || receipt.userId !== designation.userId
      || receipt.contentHash !== snapshot.contentHash || receipt.sourceHash !== snapshot.sourceHash || receipt.profileHash !== snapshot.profileHash
      || Date.now()>=Date.parse(snapshot.validBefore)) throw new Error('Exact authenticated profile confirmation required')
    const source = await fetchReviewedDoseContext(db, scope, { firstReviewSetup: true,firstReviewFacts:true })
    if (source.userId !== designation.userId) throw new Error('First review owner differs')
    const projection = projectFirstReviewedProfileFacts(source,snapshot.projection.profile,snapshot.projection.projectionAsOf)
    if (source.contextHash !== snapshot.sourceHash || source.binding.revision !== snapshot.revision
      || doseContentHash(projection) !== doseContentHash(snapshot.projection)) throw new Error('Confirmed first profile facts changed')
    const base = decodeCoachWeeklyIntent(source.binding.base.plan.intent), stored = source.binding.base.plan
    if (!base || base.kind !== 'standard' || base.plan.windowStart !== stored.window_start
      || base.plan.windowEnd !== stored.window_end || base.plan.sequenceNumber !== stored.sequence_number) throw new Error('Complete legacy base unavailable')
    const target = reconcileFirstReviewedWindow({ basePlanVersionId: draft.basePlanVersionId,
      base: { ...base.plan, intentFormat: 'rolling_weekly_intent_v0_1', planMode: String(stored.plan_mode) },
      sourceProfile: projection.profile, confirmedTargetProfile: draft.confirmedTargetProfile,
      confirmedTargetProfileHash: draft.confirmedTargetProfileHash, target: draft })
    const targetSetup = await captureSetupMemoryBindings(db, source.userId, target.profile, { reviewedSetup:true })
    if (doseContentHash(targetSetup) !== doseContentHash(source.binding.setup)) throw new Error('Confirmed target setup changed')
    const review = { id: `first-reviewed-candidate:${draft.candidateId}`, contentHash: doseContentHash(draft) }
    const sources = [{ id: `owned-context:${draft.programId}`, revision: source.binding.revision, contentHash: source.contextHash }]
    const facts = { sourceHash: source.contextHash, basePlanVersionId: draft.basePlanVersionId }
    const recipe: ReviewedWeekRecipe = { ...draft.recipe, id: draft.candidateId, policyVersion: INITIAL_DOSE_POLICY_VERSION,
      review, sources, profileHash: doseContentHash(target.profile), contextHash: doseContentHash(facts) }
    const currentIntent = target.profile.trainingIntent?.content, activeOutcomes = currentIntent?.outcomes.filter(o=>o.goal.status==='active') ?? []
    const leadingOutcome = currentIntent?.priorityOrder?.length
      ? activeOutcomes.find(o=>o.goal.id===currentIntent.priorityOrder![0]) : activeOutcomes.length===1 ? activeOutcomes[0] : null
    const compiled = buildReviewedRollingWeeklyPlan({ windowStart: draft.windowStart, sequenceNumber: draft.sequenceNumber,
      direction: buildRollingTrainingDirection(target.profile, { hypothesis: draft.rationale,
        goalTargetDate: currentIntent?.event?.date ?? leadingOutcome?.goal.targetDate ?? null }),
      context: { recipeId: recipe.id, scheduleId: draft.scheduleId, profile: target.profile, facts,
        currentReviews: [review], currentSources: sources, unresolvedReasons: [] } }, [{ recipe, contentHash: doseContentHash(recipe) }])
    if (compiled.kind !== 'reviewed_candidate') return compiled
    const continuity = reconcileFirstReviewedExecution({ userId: source.userId, programId: draft.programId,
      basePlanVersionId: draft.basePlanVersionId, baseSessions: base.plan.scheduledSessions,
      sourceSlots: source.binding.executionSlots, target: compiled.plan, transition: target.transition })
    if (continuity.kind !== 'continuity') return continuity
    if (source.performed.records.length > 64) throw new Error('Explicit narrower history needed; no evidence was truncated')
    const week = compiled.plan
    const reviewPacket = parseFirstReviewedReviewPacket({ schemaVersion: 1, reviewMode: 'manual_first_reviewed_week',
      week, legacyBase: legacyReviewBase(base.plan), rationale: draft.rationale,
      profileFacts: { snapshotId:snapshot.snapshotId,confirmationRequestId:receipt.requestId,projectionAsOf:projection.projectionAsOf,
        factsHash:projection.factsHash,assessments:projection.assessments,baselines:projection.baselines },
      changes: week.scheduledSessions.map(s => ({ kind: 'changed', sessionIds: [s.prescription.sessionId],
        summary: `${s.prescription.title}: complete first reviewed session requires approval; scheduled ${s.scheduledDate}.` })),
      evidence: projectReviewedEvidence(source.performed.records),
      evidenceSource: { sourceHash: source.contextHash, revision: source.binding.revision,
        historyThrough: scope.historyThrough, historyDays: scope.historyDays },
      limitations: ['Unapproved first-week work; no programming or athlete-acceptance authority.',
        'Calendar gaps do not imply completed or skipped training. Legacy prescriptions remain historical.',
        'Rationale and declared target setup are proposals, not measured performance.',
        'Structured evidence preserves effort, symptoms, stops, equipment and rest; additional-note flags may need focused clarification.',
        ...source.limitations] })
    if (!reviewPacket) throw new Error('Complete bounded first review projection unavailable')
    const after = await fetchReviewedDoseContext(db, scope, { firstReviewSetup: true,firstReviewFacts:true })
    const afterProjection = projectFirstReviewedProfileFacts(after,snapshot.projection.profile,projection.projectionAsOf)
    const revision = await db.from('coach_context_revisions').select('user_id,revision').eq('user_id', source.userId).limit(2)
    const afterDesignation = await db.rpc('get_current_first_review_designation', { p_id: draft.designationId })
    // The reviewer can read the same bounded designation. Re-authenticate after
    // all final awaits before returning the athlete's private source packet.
    const finalAuth = await db.auth.getUser()
    if (after.contextHash !== source.contextHash || after.userId !== source.userId || doseContentHash(afterProjection) !== doseContentHash(projection) || revision.error
      || revision.data?.length !== 1 || revision.data[0].revision !== source.binding.revision
      || revision.data[0].user_id !== source.userId || afterDesignation.error
      || doseContentHash(afterDesignation.data) !== doseContentHash(designation)
      || finalAuth.error || finalAuth.data.user?.id !== source.userId) throw new Error('Source, owner or reviewer changed during preparation')
    const validBefore = reviewedSourceValidBefore(after)
    if (Date.now() >= Date.parse(validBefore) || Date.now() >= Date.parse(designation.expiresAt)) throw new Error('Source or reviewer validity elapsed')
    const privatePacket = { schemaVersion: 2 as const, registrationId: draft.candidateId, userId: source.userId,
      policyVersion: INITIAL_DOSE_POLICY_VERSION, movementCatalogVersion: REVIEWED_MOVEMENT_CATALOG_VERSION,
      source: { contextHash: source.contextHash, binding: source.binding, validBefore },
      intent: { format: 'reviewed_weekly_intent_v0_1', horizon_weeks: 1, reviewed_week: week,
        ...(week.profileSnapshot.trainingIntent ? { training_intent: week.profileSnapshot.trainingIntent } : {}) },
      inputSnapshot: { contextRevision: source.binding.revision, setupMemoryBindings: targetSetup,
        reviewedSourceHash: source.contextHash, reviewedRegistrationId: draft.candidateId,
        reviewedMovementCatalogVersion: REVIEWED_MOVEMENT_CATALOG_VERSION,
        reviewedExecutionStorage: continuity.binding.storageContract, reviewedExecutionContinuity: continuity.binding,
        reviewedWeekTransition: target.transition, firstReviewDesignation: designation, firstReviewedDraft: draft,
        firstReviewProfileSnapshotId:snapshot.snapshotId,firstReviewProfileConfirmationRequestId:receipt.requestId },
      sessions: week.scheduledSessions.map((slot, i) => ({ week_number: 1, session_index: i + 1,
        scheduled_date: slot.scheduledDate, prescription: slot.prescription })) }
    return { kind: 'prepared_first_candidate' as const, candidateId: draft.candidateId, designationId: draft.designationId,
      privatePacket: structuredClone(privatePacket), reviewPacket, submissionHash: doseContentHash({ privatePacket, reviewPacket }),
      persistable: false as const, numericRuntimeEligible: false as const }
  } catch { return { kind: 'review_required' as const, reasons: ['First review requires complete current owned source, confirmed target setup and a current designated reviewer.'] } }
}
