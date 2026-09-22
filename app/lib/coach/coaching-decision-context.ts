import { expectedPresentationClass, type RollingWeeklyAction } from './rolling-weekly-contracts'
import { decodeDirectionReconciliation, type DirectionReconciliation } from './direction-reconciliation'
import { decodeTargetedGoalReviews, TARGETED_REVIEW_VERSION } from './targeted-review-contracts'
import { decodeSignalEvidenceContext } from './signal-evidence-readback'
import type { SignalEvidenceContext } from './signal-evidence-context'

export const COACHING_DECISION_CONTEXT_VERSION = 'coaching-decision-context-1' as const
export type CoachingDecisionStatus = 'current' | 'absent' | 'unavailable' | 'invalid' | 'superseded' | 'invalidated' | 'context_changed'
type EvidenceSummary = {
  metricId: string; semanticRole: string; protocol: { id: string; version: string }; comparabilityKey: string
  observationIds: string[]; sampleCount: number; exposureCount: number; unit: string
  baselineAverage: number | null; recentAverage: number | null; directedChangePercent: number | null
  meaningfulChangeThresholdPercent: number; trend: string; status: string
}
type EvidenceSnapshotReference = {
  id: string; contentHash: string; activePlanVersionId: string; evaluationWindow: { startsAt: string; endsAt: string }
  excludedObservations: Array<{ observationId: string; reason: string }>
}
export interface CoachingDecisionRecord {
  signalEvidence?: SignalEvidenceContext
  signalEvidenceOmitted?: 'record_budget'
  directionReconciliation?: DirectionReconciliation
  reviewId: string; reviewRevision: number; reviewedAt: string; contextRevision: number
  action: RollingWeeklyAction; presentationClass: string; evidenceStatus: string
  rationale: string[]; missing: string[]; policyVersion: string; algorithmVersion: string
  evidence: EvidenceSummary[]
  evidenceSnapshot: EvidenceSnapshotReference | null
  goalReviews: Array<{ goalId: string; statement: string | null; action: string; disposition: string; attained: boolean
    includedSourceIds: string[]; excludedSources: Array<{ observationId: string; reason: string }>
    missing: string[]; evidence: EvidenceSummary[]; evidenceSnapshot: EvidenceSnapshotReference | null }>
  proposal: { state: 'absent' | 'proposed' | 'accepted' | 'rejected' | 'expired'; id: string | null; proposedPlanVersionId: string | null }
}
export interface AcceptedCoachingDecisionOrigin {
  authority: 'accepted_plan_origin'
  acceptedPlanVersionId: string
  reviewedBasePlanVersionId: string
  validity: 'historical_accepted_snapshot'
  currentEligibility: 'not_evaluated'
  /** Eligibility changes to included review sources, not a new review of all current facts. */
  sourceStatus: 'unchanged' | 'corrected' | 'unknown'
  decision: CoachingDecisionRecord
}
export interface CoachingDecisionContext {
  acceptedOrigin?: AcceptedCoachingDecisionOrigin
  version: typeof COACHING_DECISION_CONTEXT_VERSION
  userId: string; programId: string; basePlanVersionId: string
  status: CoachingDecisionStatus; authority: 'stored_review_only'
  sourceValidity: 'included_sources_and_context_revision'; latestAthleteContextReconciled: false
  projection: { mode: 'selected_fields'; maxSeriesPerSnapshot: 32; maxGoals: 8; maxRecordCharacters: 24000; wholeRecordOmitted: boolean }
  decision: CoachingDecisionRecord | null; missing: string[]
}
export interface CoachingDecisionProjectionInput {
  userId: string; programId: string; basePlanVersionId: string
  review: unknown | null; proposal?: unknown | null
  sourceInvalidated: boolean | null; superseded?: boolean; available?: boolean
  currentContextRevision?: number | null
}

/** Shared presentation of persisted decisions, never a fresh review or prescription. */
export function projectCoachingDecisionContext(input: CoachingDecisionProjectionInput): CoachingDecisionContext {
  const shell = (status: CoachingDecisionStatus, missing: string[], decision: CoachingDecisionRecord | null = null): CoachingDecisionContext => ({
    version: COACHING_DECISION_CONTEXT_VERSION, userId: input.userId, programId: input.programId,
    basePlanVersionId: input.basePlanVersionId, status, authority: 'stored_review_only',
    sourceValidity: 'included_sources_and_context_revision', latestAthleteContextReconciled: false, decision, missing,
    projection: { mode: 'selected_fields', maxSeriesPerSnapshot: 32, maxGoals: 8, maxRecordCharacters: 24000, wholeRecordOmitted: status === 'invalid' },
  })
  if (!input.userId || !input.programId || !input.basePlanVersionId) return shell('invalid', ['decision_scope_invalid'])
  if (input.available === false) return shell('unavailable', ['decision_storage_unavailable'])
  if (input.superseded) return shell('superseded', ['decision_base_or_review_superseded'])
  if (input.review === null) return shell('absent', ['stored_review_absent'])
  if (typeof input.sourceInvalidated !== 'boolean') return shell('unavailable', ['review_source_validity_unknown'])
  if (input.sourceInvalidated) return shell('invalidated', ['included_review_source_changed'])
  if (typeof input.currentContextRevision !== 'number' || !Number.isSafeInteger(input.currentContextRevision) || input.currentContextRevision < 0) {
    return shell('unavailable', ['current_context_revision_unavailable'])
  }
  try {
    const decision = decodeDecisionRecord(input, false)
    return decision ? shell('current', [], decision)
      : shell('context_changed', ['stored_review_context_revision_changed_or_unverified'])
  } catch { return shell('invalid', ['stored_decision_invalid_or_oversized']) }
}

/** Historical mode skips current eligibility, never substitutes a current revision. */
function decodeDecisionRecord(input: CoachingDecisionProjectionInput, historical: boolean): CoachingDecisionRecord | null {
  const row = object(input.review)
  if (row.user_id !== input.userId || row.program_id !== input.programId || row.base_plan_version_id !== input.basePlanVersionId) throw new Error()
  const action = text(row.action) as RollingWeeklyAction
  if (!['continue', 'adjust_dose', 'collect_signal', 'recover', 'shift_emphasis', 'pause_review'].includes(action)) throw new Error()
  const presentationClass = text(row.presentation_class)
  if (!expectedPresentationClass(action).includes(presentationClass as never)) throw new Error()
  const evidenceStatus = text(row.evidence_status)
  if (!['sufficient', 'insufficient', 'safety_override'].includes(evidenceStatus)) throw new Error()
  const rationale = object(row.rationale)
  if (typeof rationale.contextRevision !== 'number' || !Number.isSafeInteger(rationale.contextRevision)
    || rationale.contextRevision < 0 || (!historical && rationale.contextRevision !== input.currentContextRevision)) {
    if (!historical) return null
    throw new Error('Historical review revision is unverified')
  }
  const stored = object(rationale.planningDecision)
  if (stored.action !== action || stored.presentationClass !== presentationClass || stored.evidenceStatus !== evidenceStatus) throw new Error()
  const reviewedAt = text(rationale.reviewedAt ?? row.created_at)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(reviewedAt) || !Number.isFinite(Date.parse(reviewedAt))) throw new Error()
  const reviewId = text(row.id, 200)
  const goalReviews: CoachingDecisionRecord['goalReviews'] = []
  if (rationale.targetedReviewVersion !== undefined || rationale.goalReviews !== undefined) {
    if (rationale.targetedReviewVersion !== TARGETED_REVIEW_VERSION) throw new Error()
    const goals = decodeTargetedGoalReviews(rationale.goalReviews)
    if (!goals) throw new Error()
    for (const goal of goals) goalReviews.push({ goalId: text(goal.goalId, 200),
      statement: goal.binding ? text(goal.binding.goal.statement) : null, action: text(goal.actionCandidate),
      disposition: text(goal.disposition), attained: goal.attained, includedSourceIds: strings(goal.includedSourceIds),
      excludedSources: exclusions(goal.excludedSources), missing: strings(goal.missing),
      evidence: summarizeEvidence(goal.evaluator.evidenceSnapshot), evidenceSnapshot: snapshotReference(goal.evaluator.evidenceSnapshot, input.basePlanVersionId) })
  }
  let proposal: CoachingDecisionRecord['proposal'] = { state: 'absent', id: null, proposedPlanVersionId: null }
  if (input.proposal != null) {
    const pending = object(input.proposal)
    if (pending.user_id !== input.userId || pending.program_id !== input.programId
      || pending.base_plan_version_id !== input.basePlanVersionId || pending.weekly_review_id !== reviewId
      || !['proposed', 'accepted', 'rejected', 'expired'].includes(String(pending.status))) throw new Error()
    proposal = { state: pending.status as CoachingDecisionRecord['proposal']['state'], id: text(pending.id, 200),
      proposedPlanVersionId: text(pending.proposed_plan_version_id, 200) }
  }
  const decision: CoachingDecisionRecord = { reviewId, reviewRevision: count(row.review_revision ?? 1), reviewedAt, contextRevision: rationale.contextRevision,
    action, presentationClass, evidenceStatus, rationale: strings(rationale.messages), missing: strings(row.missing_requirements),
    policyVersion: text(row.policy_version, 200), algorithmVersion: text(row.algorithm_version, 200),
    evidence: summarizeEvidence(row.evidence_snapshot), evidenceSnapshot: snapshotReference(row.evidence_snapshot, input.basePlanVersionId), goalReviews, proposal }
  if (rationale.directionReconciliation !== undefined) {
    const reconciliation = decodeDirectionReconciliation(rationale.directionReconciliation)
    if (!reconciliation) throw new Error()
    decision.directionReconciliation = reconciliation
  }
  if (rationale.signalEvidence !== undefined) {
    const signalEvidence = decodeSignalEvidenceContext(rationale.signalEvidence, input.userId, reviewedAt)
    if (!signalEvidence) throw new Error('Stored signal evidence is invalid')
    decision.signalEvidence = signalEvidence
    if (JSON.stringify(decision).length > 24_000) {
      delete decision.signalEvidence
      decision.signalEvidenceOmitted = 'record_budget'
    }
  }
  if (decision.reviewRevision < 1 || JSON.stringify(decision).length > 24_000) throw new Error()
  return decision
}

/** Decode the origin only after validating the owned accepted proposal chain. */
export function projectAcceptedCoachingDecisionOrigin(input: {
  userId: string; programId: string; acceptedPlanVersionId: string
  acceptedPlan: unknown; proposal: unknown; review: unknown; sourceInvalidated: boolean | null
}): AcceptedCoachingDecisionOrigin | null {
  try {
    const plan = object(input.acceptedPlan), proposal = object(input.proposal), review = object(input.review)
    if (plan.id !== input.acceptedPlanVersionId || plan.user_id !== input.userId || plan.program_id !== input.programId
      || plan.status !== 'accepted' || plan.plan_mode !== 'rolling_weekly'
      || proposal.status !== 'accepted' || proposal.proposed_plan_version_id !== plan.id
      || proposal.weekly_review_id !== review.id || proposal.base_plan_version_id !== review.base_plan_version_id
      || review.base_plan_version_id === plan.id) return null
    const storedIntent = object(plan.intent)
    if (storedIntent.weekly_plan !== undefined) {
      const weeklyPlan = object(storedIntent.weekly_plan)
      if (weeklyPlan.reviewDecision != null && object(weeklyPlan.reviewDecision).reviewId !== review.id) return null
    }
    const basePlanVersionId = text(review.base_plan_version_id, 200)
    const decision = decodeDecisionRecord({ userId: input.userId, programId: input.programId,
      basePlanVersionId, review, proposal, sourceInvalidated: input.sourceInvalidated }, true)
    if (!decision) return null
    return { authority: 'accepted_plan_origin', acceptedPlanVersionId: input.acceptedPlanVersionId,
      reviewedBasePlanVersionId: basePlanVersionId, validity: 'historical_accepted_snapshot',
      currentEligibility: 'not_evaluated', sourceStatus: input.sourceInvalidated === true ? 'corrected'
        : input.sourceInvalidated === false && !decision.signalEvidence && !decision.signalEvidenceOmitted ? 'unchanged' : 'unknown', decision }
  } catch { return null }
}

/** All persisted strings remain untrusted; the caller must bind the prompt owner. */
export function renderCoachingDecisionContext(context: CoachingDecisionContext, userId: string): string {
  if (!userId || context.userId !== userId) throw new Error('Coaching decision ownership mismatch')
  return JSON.stringify(context)
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
  return value as Record<string, unknown>
}
function text(value: unknown, max = 2_000): string {
  if (typeof value !== 'string' || !value.length || value.length > max) throw new Error()
  return value
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 160) throw new Error()
  return value.map(item => text(item))
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error()
  return value
}
function nullableNumber(value: unknown): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error()
  return value
}
function summarizeEvidence(value: unknown): EvidenceSummary[] {
  if (value == null) return []
  const snapshot = object(value)
  // Reviews with no evidence use an explicit missingness envelope, not a series.
  if (snapshot.series === undefined && Array.isArray(snapshot.missing)) return []
  if (!Array.isArray(snapshot.series) || snapshot.series.length > 32) throw new Error()
  return snapshot.series.map(item => {
    const series = object(item), protocol = object(series.protocol)
    const threshold = nullableNumber(series.meaningfulChangeThresholdPercent)
    if (threshold === null || threshold < 0) throw new Error()
    return { metricId: text(series.metricId, 160), semanticRole: text(series.semanticRole, 100),
      protocol: { id: text(protocol.id, 200), version: text(protocol.version, 100) }, comparabilityKey: text(series.comparabilityKey, 1_000),
      observationIds: strings(series.observationIds), sampleCount: count(series.sampleCount), exposureCount: count(series.exposureCount),
      unit: text(series.unit, 100), baselineAverage: nullableNumber(series.baselineAverage), recentAverage: nullableNumber(series.recentAverage),
      directedChangePercent: nullableNumber(series.directedChangePercent), meaningfulChangeThresholdPercent: threshold,
      trend: text(series.trend, 100), status: text(series.status, 100) }
  })
}

function exclusions(value: unknown): Array<{ observationId: string; reason: string }> {
  if (!Array.isArray(value) || value.length > 160) throw new Error()
  return value.map(item => { const row = object(item); return { observationId: text(row.observationId, 200), reason: text(row.reason) } })
}
function snapshotReference(value: unknown, basePlanVersionId: string): EvidenceSnapshotReference | null {
  if (value == null) return null
  const snapshot = object(value)
  if (snapshot.series === undefined && Array.isArray(snapshot.missing)) return null
  if (snapshot.activePlanVersionId !== basePlanVersionId) throw new Error()
  const window = object(snapshot.evaluationWindow)
  const startsAt = text(window.startsAt, 100), endsAt = text(window.endsAt, 100)
  if (!Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(startsAt) > Date.parse(endsAt)) throw new Error()
  const contentHash = text(snapshot.contentHash, 64)
  if (!/^[0-9a-f]{64}$/.test(contentHash)) throw new Error()
  return { id: text(snapshot.id, 200), contentHash, activePlanVersionId: basePlanVersionId,
    evaluationWindow: { startsAt, endsAt }, excludedObservations: exclusions(snapshot.excludedObservations) }
}
