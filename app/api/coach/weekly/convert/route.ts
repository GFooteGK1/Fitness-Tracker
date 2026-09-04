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

interface LegacyConversionRequest {
  planningInput?: unknown
  goalTargetDate?: unknown
  hypothesis?: unknown
  idempotencyKey?: unknown
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
        { error: 'Invalid weekly replacement setup', details: validated.errors },
        { status: 400 }
      )
    }
    if (!isMonday(validated.value.startDate)) {
      return apiError('A rolling week must start on Monday', 400)
    }
    const goalTargetDate = isIsoDate(body.goalTargetDate) ? body.goalTargetDate : null
    if (!goalTargetDate || goalTargetDate < validated.value.startDate) {
      return apiError('A goal target date on or after the replacement week is required', 400)
    }
    const hypothesis = typeof body.hypothesis === 'string' ? body.hypothesis.trim() : ''
    if (hypothesis.length < 5 || hypothesis.length > 500) {
      return apiError('A concise replacement hypothesis is required', 400)
    }
    const idempotencyKey = validIdempotencyKey(body.idempotencyKey)
    if (!idempotencyKey) return apiError('A valid idempotency key is required', 400)

    const { data: programs, error: programError } = await supabase
      .from('training_programs')
      .select('id, active_plan_version_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .eq('program_mode', 'legacy_eight_week')
      .limit(1)
    const program = programs?.[0] ?? null
    if (programError) return apiError('Unable to read the active legacy program', 503)
    if (!program?.active_plan_version_id) return apiError('No active legacy plan was found', 409)

    const [planResult, runtimeContext] = await Promise.all([
      supabase
        .from('training_plan_versions')
        .select('id, status, plan_mode')
        .eq('user_id', user.id)
        .eq('program_id', program.id)
        .eq('id', program.active_plan_version_id)
        .eq('status', 'accepted')
        .eq('plan_mode', 'legacy_eight_week')
        .limit(1),
      fetchCoachRuntimeContext(supabase, user.id)
    ])
    const basePlan = planResult.data?.[0] ?? null
    if (planResult.error) return apiError('Unable to read the accepted legacy plan', 503)
    if (!basePlan) return apiError('The active legacy plan changed; refresh and try again', 409)
    if (!runtimeContext.storageAvailable) return apiError('Coach storage is unavailable', 503)

    const baseProfile = buildProgrammingProfile(validated.value, runtimeContext.assessments)
    const profile = profileForDirectionHorizon(
      baseProfile,
      validated.value.startDate,
      goalTargetDate
    )
    const direction = buildRollingTrainingDirection(profile, { hypothesis, goalTargetDate })
    const result = buildRollingWeeklyPlan({
      source: 'legacy_conversion',
      windowStart: profile.startDate,
      profile,
      direction
    })
    if (result.kind !== 'weekly_plan') return apiError('Unable to build the weekly replacement', 422)

    const adaptivePlan = buildAdaptivePlanContract(profile, [result])
    const intent = buildStoredRollingWeeklyIntent(result, adaptivePlan)
    const sourceSnapshot = {
      reason: 'legacy_to_rolling_weekly_proposal',
      basePlanVersionId: basePlan.id,
      planningInput: validated.value,
      goalTargetDate,
      direction,
      assessments: runtimeContext.assessments
    }
    const inputFingerprint = rollingFingerprint({ intent, sourceSnapshot })
    const { data, error } = await supabase.rpc('create_rolling_weekly_replacement_proposal', {
      p_program_id: program.id,
      p_base_plan_version_id: basePlan.id,
      p_weekly_review_id: null,
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
        reason: 'legacy_to_rolling_weekly_proposal',
        automaticPlanActivation: false,
        athleteReviewRequired: true
      },
      p_input_fingerprint: inputFingerprint,
      p_idempotency_key: idempotencyKey
    })
    if (error) {
      console.error('Legacy weekly conversion RPC failed:', { code: error.code })
      if (error.code === '40001') {
        return apiError('The active legacy plan changed; refresh and try again', 409)
      }
      if (error.code === '22023' || error.code === '23505') {
        return apiError('Weekly replacement conflicts with an existing request', 409)
      }
      if (error.code === '55000') return apiError('The legacy plan cannot be converted', 409)
      return apiError('Unable to save the weekly replacement; retry with the same key', 503)
    }
    const row = (data?.[0] ?? null) as RollingProposalRpcRow | null
    if (!row?.proposal_id || !row.proposed_plan_version_id) {
      return apiError('Unable to read the weekly replacement; retry with the same key', 503)
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
    console.error('Legacy weekly conversion POST error:', error)
    return apiError(
      'Unable to create the weekly replacement',
      500,
      error instanceof Error ? error.message : undefined
    )
  }
}

async function readJson(request: Request): Promise<LegacyConversionRequest | null> {
  try {
    const value = await request.json()
    return isRecord(value) ? value as LegacyConversionRequest : null
  } catch {
    return null
  }
}
