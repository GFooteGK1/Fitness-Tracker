import { NextResponse } from 'next/server'
import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { buildAdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import {
  buildProgrammingProfile,
  validateCompleteCoachPlanningInput
} from '@/app/lib/coach/complete-intake'
import {
  buildStoredRollingWeeklyIntent,
  isIsoDate,
  isRecord,
  nextIsoDate,
  parseStoredRollingWeeklyIntent,
  profileForDirectionHorizon,
  rollingFingerprint,
  serializeRollingSessions,
  validIdempotencyKey,
  type RollingProposalRpcRow
} from '@/app/lib/coach/rolling-weekly-api'
import {
  expectedPresentationClass,
  type RollingWeeklyAction,
  type RollingWeeklyDoseChange,
  type RollingWeeklyEvidenceStatus,
  type RollingWeeklyPlanningDecision,
  type RollingWeeklyPresentationClass,
  type RollingWeeklySafetyBoundary,
  type RollingWeeklySignalRequest
} from '@/app/lib/coach/rolling-weekly-contracts'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'

interface ProposalFromReviewRequest {
  idempotencyKey?: unknown
  replacementPlanningInput?: unknown
  replacementGoalTargetDate?: unknown
  replacementHypothesis?: unknown
}

interface ReviewRow {
  id: string
  base_plan_version_id: string
  action: string
  presentation_class: string
  evidence_status: string
  rationale: unknown
  policy_version: string
  algorithm_version: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ACTIONS: RollingWeeklyAction[] = [
  'continue', 'adjust_dose', 'collect_signal', 'recover', 'shift_emphasis', 'pause_review'
]
const EVIDENCE_STATUSES: RollingWeeklyEvidenceStatus[] = [
  'sufficient', 'insufficient', 'safety_override'
]

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!UUID_PATTERN.test(id)) return apiError('Invalid weekly review id', 400)

    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    const body = await readJson(request)
    if (!body) return apiError('Request body must be valid JSON', 400)
    const idempotencyKey = validIdempotencyKey(body.idempotencyKey)
    if (!idempotencyKey) return apiError('A valid idempotency key is required', 400)

    const { data: programs, error: programError } = await supabase
      .from('training_programs')
      .select('id, active_plan_version_id, goal_target_date, direction')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .eq('program_mode', 'rolling_weekly')
      .limit(1)
    const program = programs?.[0] ?? null
    if (programError) return apiError('Unable to read the active weekly program', 503)
    if (!program?.active_plan_version_id) return apiError('No active rolling week was found', 409)

    const [reviewResult, planResult, runtimeContext] = await Promise.all([
      supabase
        .from('coach_weekly_reviews')
        .select('id, base_plan_version_id, action, presentation_class, evidence_status, rationale, policy_version, algorithm_version')
        .eq('user_id', user.id)
        .eq('program_id', program.id)
        .eq('id', id)
        .limit(1),
      supabase
        .from('training_plan_versions')
        .select('id, intent, input_snapshot, window_start, window_end')
        .eq('user_id', user.id)
        .eq('program_id', program.id)
        .eq('id', program.active_plan_version_id)
        .eq('status', 'accepted')
        .eq('plan_mode', 'rolling_weekly')
        .limit(1),
      fetchCoachRuntimeContext(supabase, user.id)
    ])
    const review = (reviewResult.data?.[0] ?? null) as ReviewRow | null
    const planRow = planResult.data?.[0] ?? null
    if (reviewResult.error || planResult.error) return apiError('Unable to read the stored weekly review', 503)
    if (!review || !planRow) return apiError('Stored weekly review not found', 404)
    if (review.base_plan_version_id !== program.active_plan_version_id) {
      return apiError('The active plan changed; refresh and review again', 409)
    }
    if (review.action === 'pause_review') {
      return apiError('A safety review cannot create a training proposal', 409)
    }

    const storedIntent = parseStoredRollingWeeklyIntent(planRow.intent)
    if (!storedIntent
      || storedIntent.weekly_plan.windowStart !== planRow.window_start
      || storedIntent.weekly_plan.windowEnd !== planRow.window_end
      || rollingFingerprint(storedIntent.weekly_plan.directionSnapshot)
        !== rollingFingerprint(program.direction)
    ) {
      return apiError('The accepted weekly dose has an unsupported format', 409)
    }
    const decision = parsePlanningDecision(review)
    if (!decision) return apiError('The stored weekly decision is incomplete', 409)

    const nextWindowStart = nextIsoDate(storedIntent.weekly_plan.windowEnd)
    let profile = profileForDirectionHorizon(
      storedIntent.weekly_plan.profileSnapshot,
      nextWindowStart,
      program.goal_target_date
    )
    let direction = storedIntent.weekly_plan.directionSnapshot
    let adaptivePlan = storedIntent.adaptive_programming

    if (decision.action === 'shift_emphasis') {
      const validated = validateCompleteCoachPlanningInput(body.replacementPlanningInput)
      if (!validated.ok || validated.value.startDate !== nextWindowStart) {
        return apiError('Confirm a replacement setup that starts on the adjacent Monday', 400)
      }
      const goalTargetDate = isIsoDate(body.replacementGoalTargetDate)
        ? body.replacementGoalTargetDate
        : program.goal_target_date
      if (!goalTargetDate || goalTargetDate < nextWindowStart) {
        return apiError('Confirm a valid target date for the replacement direction', 400)
      }
      const hypothesis = typeof body.replacementHypothesis === 'string'
        ? body.replacementHypothesis.trim()
        : ''
      if (hypothesis.length < 5 || hypothesis.length > 500) {
        return apiError('Confirm a concise hypothesis for the replacement direction', 400)
      }
      profile = profileForDirectionHorizon(
        buildProgrammingProfile(validated.value, runtimeContext.assessments),
        nextWindowStart,
        goalTargetDate
      )
      direction = buildRollingTrainingDirection(profile, { hypothesis, goalTargetDate })
    } else if (body.replacementPlanningInput !== undefined) {
      return apiError('Only a material emphasis decision can replace the planning direction', 400)
    }

    let plan
    try {
      const result = buildRollingWeeklyPlan({
        source: 'weekly_review',
        windowStart: nextWindowStart,
        profile,
        direction,
        priorWeek: storedIntent.weekly_plan,
        decision
      })
      if (result.kind !== 'weekly_plan') return apiError('A safety review cannot create a training proposal', 409)
      plan = result
    } catch (error) {
      return apiError(
        'The stored weekly decision cannot generate a valid adjacent dose',
        409,
        error instanceof Error ? error.message : undefined
      )
    }
    if (decision.action === 'shift_emphasis') {
      adaptivePlan = buildAdaptivePlanContract(profile, [plan])
    }

    const sourceSnapshot = {
      reason: 'stored_rolling_weekly_review',
      basePlanVersionId: planRow.id,
      weeklyReviewId: review.id,
      sourcePlanInputSnapshot: planRow.input_snapshot,
      direction: plan.directionSnapshot
    }
    const intent = buildStoredRollingWeeklyIntent(plan, adaptivePlan)
    const inputFingerprint = rollingFingerprint({ intent, sourceSnapshot, action: decision.action })
    const { data, error } = await supabase.rpc('create_rolling_weekly_replacement_proposal', {
      p_program_id: program.id,
      p_base_plan_version_id: planRow.id,
      p_weekly_review_id: review.id,
      p_title: plan.title,
      p_goal_summary: plan.profileSnapshot.athleteGoalSummary,
      p_window_start: plan.windowStart,
      p_goal_target_date: plan.directionSnapshot.goalTargetDate,
      p_direction: plan.directionSnapshot,
      p_reference_version: plan.evidenceReferenceVersion,
      p_policy_version: plan.policyVersion,
      p_intent: intent,
      p_input_snapshot: sourceSnapshot,
      p_sessions: serializeRollingSessions(plan),
      p_rationale: {
        reason: 'stored_rolling_weekly_review',
        reviewAction: decision.action,
        presentationClass: decision.presentationClass,
        automaticPlanActivation: false,
        athleteReviewRequired: true
      },
      p_input_fingerprint: inputFingerprint,
      p_idempotency_key: idempotencyKey
    })
    if (error) {
      console.error('Stored weekly review proposal RPC failed:', { code: error.code })
      if (error.code === '40001') return apiError('The active plan changed; refresh and review again', 409)
      if (error.code === '22023' || error.code === '23505') {
        return apiError('Next-week proposal conflicts with an existing request', 409)
      }
      if (error.code === '55000') return apiError('The stored review cannot create a proposal', 409)
      return apiError('Unable to save the next-week proposal; retry with the same key', 503)
    }
    const row = (data?.[0] ?? null) as RollingProposalRpcRow | null
    if (!row?.proposal_id || !row.proposed_plan_version_id) {
      return apiError('Unable to read the next-week proposal; retry with the same key', 503)
    }

    return NextResponse.json({
      reviewId: review.id,
      proposalId: row.proposal_id,
      planVersionId: row.proposed_plan_version_id,
      idempotencyKey,
      proposal: plan,
      activePlanChanged: false,
      acceptanceRequired: true
    }, {
      status: 201,
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    console.error('Stored weekly review proposal POST error:', error)
    return apiError('Unable to create a proposal from the stored weekly review', 500)
  }
}

function parsePlanningDecision(review: ReviewRow): RollingWeeklyPlanningDecision | null {
  if (!ACTIONS.includes(review.action as RollingWeeklyAction)) return null
  if (!EVIDENCE_STATUSES.includes(review.evidence_status as RollingWeeklyEvidenceStatus)) return null
  if (!isRecord(review.rationale) || !isRecord(review.rationale.planningDecision)) return null
  const stored = review.rationale.planningDecision
  const action = review.action as RollingWeeklyAction
  const presentationClass = review.presentation_class as RollingWeeklyPresentationClass
  if (!expectedPresentationClass(action).includes(presentationClass)) return null
  if (stored.action !== action || stored.presentationClass !== presentationClass
    || stored.evidenceStatus !== review.evidence_status) return null
  const messages = Array.isArray(review.rationale.messages)
    ? review.rationale.messages.filter(item => typeof item === 'string')
    : []
  const decision: RollingWeeklyPlanningDecision = {
    reviewId: review.id,
    action,
    presentationClass,
    evidenceStatus: review.evidence_status as RollingWeeklyEvidenceStatus,
    rationale: messages.join(' ') || 'Stored weekly review decision.'
  }
  if (isRecord(stored.doseChange)) {
    decision.doseChange = stored.doseChange as unknown as RollingWeeklyDoseChange
  }
  if (isRecord(stored.signalRequest)) {
    decision.signalRequest = stored.signalRequest as unknown as RollingWeeklySignalRequest
  }
  if (isRecord(stored.safetyBoundary)) {
    decision.safetyBoundary = stored.safetyBoundary as unknown as RollingWeeklySafetyBoundary
  }
  return decision
}

async function readJson(request: Request): Promise<ProposalFromReviewRequest | null> {
  try {
    const value = await request.json()
    return isRecord(value) ? value as ProposalFromReviewRequest : null
  } catch {
    return null
  }
}
