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
  isMonday,
  isRecord,
  profileForDirectionHorizon,
  rollingFingerprint,
  serializeRollingSessions,
  validIdempotencyKey,
  type RollingProposalRpcRow
} from '@/app/lib/coach/rolling-weekly-api'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'

interface InitialWeeklyProposalRequest {
  planningInput?: unknown
  goalTargetDate?: unknown
  hypothesis?: unknown
  idempotencyKey?: unknown
}

export async function GET() {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    const { data: programs, error: programError } = await supabase
      .from('training_programs')
      .select('id, title, goal_summary, start_date, end_date, status, program_mode, goal_target_date, direction, active_plan_version_id, updated_at')
      .eq('user_id', user.id)
      .in('status', ['active', 'draft'])
      .order('status', { ascending: true })
      .order('updated_at', { ascending: false })
      .limit(1)
    if (programError) return apiError('Unable to read weekly coach state', 503)

    const program = programs?.[0] ?? null
    if (!program) {
      return NextResponse.json({ mode: 'rolling_weekly', program: null, currentWeek: null, history: [] }, {
        headers: { 'Cache-Control': 'private, no-store' }
      })
    }

    const [plansResult, reviewsResult, proposalsResult] = await Promise.all([
      supabase
        .from('training_plan_versions')
        .select('id, version, status, window_start, window_end, sequence_number, intent, accepted_at, created_at')
        .eq('user_id', user.id)
        .eq('program_id', program.id)
        .eq('plan_mode', 'rolling_weekly')
        .order('sequence_number', { ascending: false })
        .limit(16),
      supabase
        .from('coach_weekly_reviews')
        .select('id, base_plan_version_id, review_window_start, review_reason, action, presentation_class, evidence_status, confidence, evidence_snapshot, evaluation_window, execution_summary, missing_requirements, safety_override, rationale, policy_version, algorithm_version, input_fingerprint, idempotency_key, created_at')
        .eq('user_id', user.id)
        .eq('program_id', program.id)
        .order('review_window_start', { ascending: false })
        .limit(16),
      supabase
        .from('adaptation_proposals')
        .select('id, base_plan_version_id, proposed_plan_version_id, weekly_review_id, idempotency_key, status, rationale, created_at')
        .eq('user_id', user.id)
        .eq('program_id', program.id)
        .eq('status', 'proposed')
        .order('created_at', { ascending: false })
        .limit(1)
    ])
    if (plansResult.error || reviewsResult.error || proposalsResult.error) {
      return apiError('Unable to read weekly coach history', 503)
    }

    const plans = plansResult.data ?? []
    const rollingProgram = program.program_mode === 'rolling_weekly' ? program : null
    const activePlan = rollingProgram
      ? plans.find(plan => plan.id === program.active_plan_version_id) ?? null
      : null
    return NextResponse.json({
      mode: 'rolling_weekly',
      program: rollingProgram,
      currentWeek: activePlan,
      pendingProposal: proposalsResult.data?.[0] ?? null,
      history: {
        plans,
        reviews: reviewsResult.data ?? []
      }
    }, {
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    console.error('Weekly coach GET error:', error)
    return apiError('Unable to read weekly coach state', 500)
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    const body = await readJson(request)
    if (!body) return apiError('Request body must be valid JSON', 400)
    const validated = validateCompleteCoachPlanningInput(body.planningInput)
    if (!validated.ok) {
      return NextResponse.json(
        { error: 'Invalid weekly setup', details: validated.errors },
        { status: 400 }
      )
    }
    if (!isMonday(validated.value.startDate)) {
      return apiError('A rolling week must start on Monday', 400)
    }
    const goalTargetDate = isIsoDate(body.goalTargetDate) ? body.goalTargetDate : null
    if (!goalTargetDate || goalTargetDate < validated.value.startDate) {
      return apiError('A goal target date on or after the first week is required', 400)
    }
    const idempotencyKey = validIdempotencyKey(body.idempotencyKey)
    if (!idempotencyKey) return apiError('A valid idempotency key is required', 400)

    const runtimeContext = await fetchCoachRuntimeContext(supabase, user.id)
    if (!runtimeContext.storageAvailable) return apiError('Coach storage is unavailable', 503)

    const baseProfile = buildProgrammingProfile(validated.value, runtimeContext.assessments)
    const profile = profileForDirectionHorizon(
      baseProfile,
      validated.value.startDate,
      goalTargetDate
    )
    const hypothesis = typeof body.hypothesis === 'string' && body.hypothesis.trim().length >= 5
      ? body.hypothesis.trim().slice(0, 500)
      : `Repeatable weekly ${profile.primaryGoal.domain.replaceAll('_', ' ')} doses will support the athlete goal.`
    const direction = buildRollingTrainingDirection(profile, { hypothesis, goalTargetDate })
    const result = buildRollingWeeklyPlan({
      source: 'initial',
      windowStart: profile.startDate,
      profile,
      direction
    })
    if (result.kind !== 'weekly_plan') return apiError('Unable to build the first weekly dose', 422)

    const adaptivePlan = buildAdaptivePlanContract(profile, [result])
    const intent = buildStoredRollingWeeklyIntent(result, adaptivePlan)
    const sourceSnapshot = {
      reason: 'initial_rolling_weekly_proposal',
      planningInput: validated.value,
      goalTargetDate,
      direction,
      assessments: runtimeContext.assessments
    }
    const inputFingerprint = rollingFingerprint({ intent, sourceSnapshot })
    const { data, error } = await supabase.rpc('create_initial_rolling_weekly_proposal', {
      p_title: result.title,
      p_goal_summary: profile.athleteGoalSummary,
      p_window_start: result.windowStart,
      p_goal_target_date: goalTargetDate,
      p_direction: direction,
      p_reference_version: result.evidenceReferenceVersion,
      p_policy_version: result.policyVersion,
      p_intent: intent,
      p_input_snapshot: sourceSnapshot,
      p_sessions: serializeRollingSessions(result),
      p_rationale: {
        reason: 'initial_rolling_weekly_proposal',
        input_fingerprint: inputFingerprint,
        automaticPlanActivation: false,
        athleteReviewRequired: true
      },
      p_input_fingerprint: inputFingerprint,
      p_idempotency_key: idempotencyKey
    })
    if (error) {
      console.error('Initial weekly proposal RPC failed:', { code: error.code })
      if (error.code === '55000') return apiError('An active program already exists', 409)
      if (error.code === '22023') return apiError('Proposal request conflicts with an existing request', 409)
      return apiError('Unable to save the first weekly proposal', 503)
    }
    const row = (data?.[0] ?? null) as RollingProposalRpcRow | null
    if (!row?.proposal_id || !row.proposed_program_id || !row.proposed_plan_version_id) {
      return apiError('Unable to save the first weekly proposal', 503)
    }

    return NextResponse.json({
      proposalId: row.proposal_id,
      programId: row.proposed_program_id,
      planVersionId: row.proposed_plan_version_id,
      idempotencyKey,
      proposal: result,
      activePlanChanged: false,
      acceptanceRequired: true
    }, {
      status: 201,
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    console.error('Weekly coach POST error:', error)
    return apiError(
      'Unable to create the first weekly proposal',
      500,
      error instanceof Error ? error.message : undefined
    )
  }
}

async function readJson(request: Request): Promise<InitialWeeklyProposalRequest | null> {
  try {
    const value = await request.json()
    return isRecord(value) ? value as InitialWeeklyProposalRequest : null
  } catch {
    return null
  }
}
