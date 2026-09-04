import { NextResponse } from 'next/server'
import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { buildAdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import {
  buildProgrammingProfile,
  validateCompleteCoachPlanningInput
} from '@/app/lib/coach/complete-intake'
import { validateStoredCoachSessionCheckin } from '@/app/lib/coach/execution-feedback'
import { fetchCoachEvidenceContext } from '@/app/lib/coach/evidence-context'
import type {
  CoachExecutionSession,
  CoachSessionCheckinSummary
} from '@/app/lib/coach/execution-feedback'
import {
  buildStoredRollingWeeklyIntent,
  isIsoDate,
  isRecord,
  isoTimestamp,
  nextIsoDate,
  parseStoredRollingWeeklyIntent,
  profileForDirectionHorizon,
  rollingFingerprint,
  serializeRollingSessions,
  validIdempotencyKey,
  validWindowDays,
  type RollingProposalRpcRow
} from '@/app/lib/coach/rolling-weekly-api'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import {
  buildRollingWeeklyPlan,
  type RollingWeeklyPlanDraft
} from '@/app/lib/coach/rolling-weekly-plan'
import type { CoachStrengthAssessmentSummary } from '@/app/lib/coach/types'
import {
  buildRollingWeeklyPlanningDecision,
  buildRollingWeeklyReview
} from '@/app/lib/coach/weekly-review'
import {
  formatUTCAsLocalDateWithOffset,
  isValidTimezoneOffset
} from '@/app/lib/timezone-utils'

interface WeeklyReviewRequest {
  asOf?: unknown
  tzOffset?: unknown
  windowDays?: unknown
  athleteRequestedReview?: unknown
  reviewIdempotencyKey?: unknown
  proposalIdempotencyKey?: unknown
  replacementPlanningInput?: unknown
  replacementGoalTargetDate?: unknown
  replacementHypothesis?: unknown
}

interface ProgramRow {
  id: string
  title: string
  goal_summary: string
  active_plan_version_id: string
  goal_target_date: string | null
  direction: unknown
}

interface PlanRow {
  id: string
  intent: unknown
  input_snapshot: unknown
  window_start: string
  window_end: string
}

interface ReviewRpcRow {
  review_id: string
  review_action: string
  review_presentation_class: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    const body = await readJson(request)
    if (!body) return apiError('Request body must be valid JSON', 400)
    const asOf = isoTimestamp(body.asOf)
    const tzOffset = validTimezoneOffset(body.tzOffset)
    const windowDays = validWindowDays(body.windowDays)
    const reviewIdempotencyKey = validIdempotencyKey(body.reviewIdempotencyKey)
    if (!asOf || tzOffset === null || windowDays === null || !reviewIdempotencyKey) {
      return apiError('A valid as-of time, timezone offset, review window, and idempotency key are required', 400)
    }
    if (body.athleteRequestedReview !== undefined && typeof body.athleteRequestedReview !== 'boolean') {
      return apiError('Athlete-requested review must be true or false', 400)
    }
    const athleteLocalDate = formatUTCAsLocalDateWithOffset(asOf, tzOffset)

    const { data: programs, error: programError } = await supabase
      .from('training_programs')
      .select('id, title, goal_summary, active_plan_version_id, goal_target_date, direction')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .eq('program_mode', 'rolling_weekly')
      .limit(1)
    const program = (programs?.[0] ?? null) as ProgramRow | null
    if (programError) return apiError('Unable to read the active weekly program', 503)
    if (!program?.active_plan_version_id) return apiError('No active rolling week was found', 409)

    const [planResult, sessionResult] = await Promise.all([
      supabase
        .from('training_plan_versions')
        .select('id, intent, input_snapshot, window_start, window_end')
        .eq('user_id', user.id)
        .eq('program_id', program.id)
        .eq('id', program.active_plan_version_id)
        .eq('status', 'accepted')
        .eq('plan_mode', 'rolling_weekly')
        .limit(1),
      supabase
        .from('prescribed_sessions')
        .select('id, week_number, session_index, scheduled_date, status')
        .eq('user_id', user.id)
        .eq('program_id', program.id)
        .eq('plan_version_id', program.active_plan_version_id)
        .order('session_index', { ascending: true })
    ])
    const planRow = (planResult.data?.[0] ?? null) as PlanRow | null
    if (planResult.error || sessionResult.error || !planRow) {
      return apiError('The accepted weekly dose is unavailable', 503)
    }
    const storedIntent = parseStoredRollingWeeklyIntent(planRow.intent)
    if (!storedIntent || storedIntent.weekly_plan.windowStart !== planRow.window_start
      || storedIntent.weekly_plan.windowEnd !== planRow.window_end
      || rollingFingerprint(storedIntent.weekly_plan.directionSnapshot)
        !== rollingFingerprint(program.direction)
    ) {
      return apiError('The accepted weekly dose has an unsupported format', 409)
    }
    const goalId = storedIntent.adaptive_programming.goals[0]?.goalId ?? ''

    const [context, recoveryContext, runtimeContext, checkinResult] = await Promise.all([
      fetchCoachEvidenceContext(supabase, user.id, {
        purpose: 'adaptation_review', goalId, asOf, windowDays
      }),
      fetchCoachEvidenceContext(supabase, user.id, {
        purpose: 'general_coaching', asOf, windowDays: Math.min(windowDays, 90)
      }),
      fetchCoachRuntimeContext(supabase, user.id, new Date(asOf)),
      supabase
        .from('coach_checkins')
        .select('id, prescribed_session_id, responses, occurred_at')
        .eq('user_id', user.id)
        .eq('checkin_type', 'session')
        .in('prescribed_session_id', (sessionResult.data ?? []).map(session => session.id))
        .order('occurred_at', { ascending: true })
    ])
    if (
      context.activePlan?.programId !== program.id
      || context.activePlan.planVersionId !== planRow.id
      || runtimeContext.activeProgram?.id !== program.id
      || runtimeContext.activeProgram.activePlanVersionId !== planRow.id
    ) {
      return apiError('The active plan changed; refresh and review again', 409)
    }
    if (checkinResult.error) return apiError('Unable to read weekly session feedback', 503)

    const sessions = (sessionResult.data ?? []).map(row => ({
      id: row.id,
      weekNumber: row.week_number,
      sessionIndex: row.session_index,
      scheduledDate: row.scheduled_date,
      status: row.status
    })) as CoachExecutionSession[]
    const checkins: CoachSessionCheckinSummary[] = []
    for (const row of checkinResult.data ?? []) {
      const validation = validateStoredCoachSessionCheckin(row.responses, row.occurred_at)
      if (!validation.ok) {
        return apiError('Weekly session feedback has an unsupported format', 409)
      }
      checkins.push({
        id: row.id,
        prescribedSessionId: row.prescribed_session_id,
        ...validation.value
      })
    }
    const review = buildRollingWeeklyReview({
      programId: program.id,
      basePlanVersionId: planRow.id,
      goalId,
      adaptivePlan: storedIntent.adaptive_programming,
      currentWeek: storedIntent.weekly_plan,
      context,
      recoveryContext,
      sessions,
      checkins,
      athleteLocalDate,
      athleteRequestedReview: body.athleteRequestedReview === true
    })
    if (review.status === 'not_ready') {
      return NextResponse.json({ review, activePlanChanged: false }, {
        headers: { 'Cache-Control': 'private, no-store' }
      })
    }

    const reviewFingerprint = rollingFingerprint({
      programId: program.id,
      basePlanVersionId: planRow.id,
      reviewedAt: review.reviewedAt,
      reviewReason: review.reviewReason,
      action: review.action,
      presentationClass: review.presentationClass,
      evidenceStatus: review.evidenceStatus,
      executionSummary: review.executionSummary,
      evidenceSnapshot: review.evidenceSnapshot,
      observationLinks: review.observationLinks
    })
    const { data: reviewData, error: reviewError } = await supabase.rpc('record_coach_weekly_review', {
      p_program_id: program.id,
      p_base_plan_version_id: planRow.id,
      p_review_window_start: review.windowStart,
      p_review_reason: review.reviewReason,
      p_action: review.action,
      p_presentation_class: review.presentationClass,
      p_evidence_status: review.evidenceStatus,
      p_confidence: review.confidence,
      p_evidence_snapshot: review.evidenceSnapshot ?? {
        status: 'unavailable',
        reviewedAt: review.reviewedAt,
        missing: review.missing
      },
      p_evaluation_window: context.window,
      p_execution_summary: review.executionSummary,
      p_missing_requirements: review.missing,
      p_safety_override: review.safetyOverride,
      p_rationale: {
        messages: review.rationale,
        goalMetMaintenance: review.goalMetMaintenance,
        reviewedAt: review.reviewedAt,
        planningDecision: {
          action: review.action,
          presentationClass: review.presentationClass,
          evidenceStatus: review.evidenceStatus,
          doseChange: review.doseChange,
          signalRequest: review.signalRequest,
          safetyBoundary: review.safetyBoundary
        }
      },
      p_observations: review.observationLinks,
      p_policy_version: review.policyVersion,
      p_algorithm_version: review.algorithmVersion,
      p_input_fingerprint: reviewFingerprint,
      p_idempotency_key: reviewIdempotencyKey
    })
    if (reviewError) {
      console.error('Weekly review RPC failed:', { code: reviewError.code })
      if (reviewError.code === '40001') return apiError('The active plan changed; refresh and review again', 409)
      if (reviewError.code === '22023' || reviewError.code === '23505') {
        return apiError('Weekly review request conflicts with an existing review', 409)
      }
      return apiError('Unable to save the weekly review', 503)
    }
    const reviewRow = (reviewData?.[0] ?? null) as ReviewRpcRow | null
    if (!reviewRow?.review_id) return apiError('Unable to save the weekly review', 503)

    if (!review.proposal.eligible || (!review.proposal.generationReady && review.action !== 'shift_emphasis')) {
      return NextResponse.json({
        review: { ...review, id: reviewRow.review_id },
        proposal: null,
        activePlanChanged: false,
        acceptanceRequired: false
      }, {
        status: 201,
        headers: { 'Cache-Control': 'private, no-store' }
      })
    }
    if (review.action === 'shift_emphasis' && body.replacementPlanningInput === undefined) {
      return NextResponse.json({
        review: { ...review, id: reviewRow.review_id },
        proposal: null,
        activePlanChanged: false,
        acceptanceRequired: false,
        nextAction: {
          type: 'confirm_replacement_direction',
          message: 'Confirm the replacement emphasis before the coach generates the next week.'
        }
      }, {
        status: 201,
        headers: { 'Cache-Control': 'private, no-store' }
      })
    }

    const proposalIdempotencyKey = validIdempotencyKey(body.proposalIdempotencyKey)
    if (!proposalIdempotencyKey) {
      return apiError('A valid proposal idempotency key is required', 400)
    }
    const nextWeek = await buildNextWeek({
      body,
      review,
      reviewId: reviewRow.review_id,
      storedIntent,
      currentWeek: storedIntent.weekly_plan,
      programGoalTargetDate: program.goal_target_date,
      assessments: runtimeContext.assessments,
      nextWindowStart: nextIsoDate(storedIntent.weekly_plan.windowEnd)
    })
    if (!nextWeek.ok) return apiError(nextWeek.error, 409)

    const sourceSnapshot = {
      reason: 'rolling_weekly_review',
      basePlanVersionId: planRow.id,
      weeklyReviewId: reviewRow.review_id,
      reviewInputFingerprint: reviewFingerprint,
      sourcePlanInputSnapshot: planRow.input_snapshot,
      direction: nextWeek.plan.directionSnapshot
    }
    const intent = buildStoredRollingWeeklyIntent(nextWeek.plan, nextWeek.adaptivePlan)
    const proposalFingerprint = rollingFingerprint({
      intent,
      sourceSnapshot,
      reviewAction: review.action
    })
    const { data: proposalData, error: proposalError } = await supabase.rpc(
      'create_rolling_weekly_replacement_proposal',
      {
        p_program_id: program.id,
        p_base_plan_version_id: planRow.id,
        p_weekly_review_id: reviewRow.review_id,
        p_title: nextWeek.plan.title,
        p_goal_summary: nextWeek.plan.profileSnapshot.athleteGoalSummary,
        p_window_start: nextWeek.plan.windowStart,
        p_goal_target_date: nextWeek.plan.directionSnapshot.goalTargetDate,
        p_direction: nextWeek.plan.directionSnapshot,
        p_reference_version: nextWeek.plan.evidenceReferenceVersion,
        p_policy_version: nextWeek.plan.policyVersion,
        p_intent: intent,
        p_input_snapshot: sourceSnapshot,
        p_sessions: serializeRollingSessions(nextWeek.plan),
        p_rationale: {
          reason: 'rolling_weekly_review',
          reviewAction: review.action,
          presentationClass: review.presentationClass,
          explanation: review.rationale,
          automaticPlanActivation: false,
          athleteReviewRequired: true
        },
        p_input_fingerprint: proposalFingerprint,
        p_idempotency_key: proposalIdempotencyKey
      }
    )
    if (proposalError) {
      console.error('Next weekly proposal RPC failed:', { code: proposalError.code })
      if (proposalError.code === '40001') return apiError('The active plan changed; refresh and review again', 409)
      if (proposalError.code === '22023' || proposalError.code === '23505') {
        return apiError('Next-week proposal conflicts with an existing request', 409)
      }
      if (proposalError.code === '55000') return apiError('The weekly review cannot create a proposal', 409)
      return apiError('The review was saved, but the next-week proposal could not be saved; retry with the same keys', 503)
    }
    const proposalRow = (proposalData?.[0] ?? null) as RollingProposalRpcRow | null
    if (!proposalRow?.proposal_id || !proposalRow.proposed_plan_version_id) {
      return apiError('The review was saved, but the next-week proposal could not be read; retry with the same keys', 503)
    }

    return NextResponse.json({
      review: { ...review, id: reviewRow.review_id },
      proposalId: proposalRow.proposal_id,
      planVersionId: proposalRow.proposed_plan_version_id,
      idempotencyKey: proposalIdempotencyKey,
      proposal: nextWeek.plan,
      activePlanChanged: false,
      acceptanceRequired: true
    }, {
      status: 201,
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    console.error('Weekly review POST error:', error)
    return apiError(
      'Unable to review the weekly dose',
      500,
      error instanceof Error ? error.message : undefined
    )
  }
}

async function buildNextWeek(input: {
  body: WeeklyReviewRequest
  review: Extract<ReturnType<typeof buildRollingWeeklyReview>, { status: 'ready' }>
  reviewId: string
  storedIntent: NonNullable<ReturnType<typeof parseStoredRollingWeeklyIntent>>
  currentWeek: RollingWeeklyPlanDraft
  programGoalTargetDate: string | null
  assessments: CoachStrengthAssessmentSummary[]
  nextWindowStart: string
}): Promise<
  | { ok: true; plan: RollingWeeklyPlanDraft; adaptivePlan: NonNullable<ReturnType<typeof parseStoredRollingWeeklyIntent>>['adaptive_programming'] }
  | { ok: false; error: string }
> {
  let profile = profileForDirectionHorizon(
    input.currentWeek.profileSnapshot,
    input.nextWindowStart,
    input.programGoalTargetDate
  )
  let direction = input.currentWeek.directionSnapshot
  let adaptivePlan = input.storedIntent.adaptive_programming

  if (input.review.action === 'shift_emphasis') {
    const validated = validateCompleteCoachPlanningInput(input.body.replacementPlanningInput)
    if (!validated.ok || validated.value.startDate !== input.nextWindowStart) {
      return { ok: false, error: 'Confirm a replacement setup that starts on the adjacent Monday' }
    }
    const goalTargetDate = isIsoDate(input.body.replacementGoalTargetDate)
      ? input.body.replacementGoalTargetDate
      : input.programGoalTargetDate
    if (!goalTargetDate || goalTargetDate < input.nextWindowStart) {
      return { ok: false, error: 'Confirm a valid target date for the replacement direction' }
    }
    profile = profileForDirectionHorizon(
      buildProgrammingProfile(validated.value, input.assessments),
      input.nextWindowStart,
      goalTargetDate
    )
    const hypothesis = typeof input.body.replacementHypothesis === 'string'
      ? input.body.replacementHypothesis.trim()
      : ''
    if (hypothesis.length < 5 || hypothesis.length > 500) {
      return { ok: false, error: 'Confirm a concise hypothesis for the replacement direction' }
    }
    direction = buildRollingTrainingDirection(profile, { hypothesis, goalTargetDate })
  }

  const decision = buildRollingWeeklyPlanningDecision(input.reviewId, input.review)
  let result
  try {
    result = buildRollingWeeklyPlan({
      source: 'weekly_review',
      windowStart: input.nextWindowStart,
      profile,
      direction,
      priorWeek: input.currentWeek,
      decision
    })
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to build the adjacent weekly dose'
    }
  }
  if (result.kind !== 'weekly_plan') {
    return { ok: false, error: 'A safety review cannot generate a training dose' }
  }
  if (input.review.action === 'shift_emphasis') {
    adaptivePlan = buildAdaptivePlanContract(profile, [result])
  }
  return { ok: true, plan: result, adaptivePlan }
}

function validTimezoneOffset(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isInteger(value)
    && isValidTimezoneOffset(value)
    ? value
    : null
}

async function readJson(request: Request): Promise<WeeklyReviewRequest | null> {
  try {
    const value = await request.json()
    return isRecord(value) ? value as WeeklyReviewRequest : null
  } catch {
    return null
  }
}
