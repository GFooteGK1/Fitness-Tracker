import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import { buildEightWeekProposal, validateCoachPlanningInput } from '@/app/lib/coach/planner'

interface ProposalRequest {
  planningInput?: unknown
  idempotencyKey?: unknown
}

interface ProposalRpcRow {
  proposal_id: string
  proposed_program_id: string
  proposed_plan_version_id: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    const body = await readJson(request)
    if (!body) return apiError('Request body must be valid JSON', 400)

    const idempotencyKey = validIdempotencyKey(body.idempotencyKey)
    if (!idempotencyKey) return apiError('A valid idempotency key is required', 400)

    const validated = validateCoachPlanningInput(body.planningInput)
    if (!validated.ok) {
      return NextResponse.json(
        { error: 'Invalid coach setup', details: validated.errors },
        { status: 400 }
      )
    }

    const context = await fetchCoachRuntimeContext(supabase, user.id)
    if (!context.storageAvailable) return apiError('Coach storage unavailable', 503)

    let proposal
    try {
      proposal = buildEightWeekProposal(validated.value, {
        assessments: context.assessments
      })
    } catch (error) {
      return apiError(
        'Invalid coach setup',
        400,
        error instanceof Error ? error.message : undefined
      )
    }

    const sourceSnapshot = {
      planningInput: proposal.inputSnapshot,
      assessments: context.assessments.map(assessment => ({
        id: assessment.id,
        movement: assessment.movement,
        variation: assessment.variation,
        sourceLoad: assessment.load,
        sourceReps: assessment.reps,
        unit: assessment.unit,
        estimatedOneRepMax: assessment.estimatedOneRepMax,
        estimateKind: assessment.estimateKind,
        athleteConfidence: assessment.athleteConfidence,
        calculatorVersion: assessment.calculatorVersion,
        sourceDate: assessment.assessedOn
      })),
      memories: context.memories.map(memory => ({
        id: memory.id,
        memoryKey: memory.memoryKey,
        version: memory.version
      }))
    }
    const inputFingerprint = createHash('sha256')
      .update(JSON.stringify({ proposal, sourceSnapshot }))
      .digest('hex')

    const commonArguments = {
      p_title: proposal.title,
      p_goal_summary: proposal.goalSummary,
      p_start_date: proposal.startDate,
      p_reference_version: proposal.referenceVersion,
      p_policy_version: proposal.policyVersion,
      p_intent: {
        horizon_weeks: 8,
        primary_domain: proposal.inputSnapshot.primaryDomain,
        weeks: proposal.weeks
      },
      p_input_snapshot: sourceSnapshot,
      p_sessions: proposal.sessions.map(session => ({
        week_number: session.weekNumber,
        session_index: session.sessionIndex,
        scheduled_date: session.scheduledDate,
        prescription: session.prescription
      })),
      p_rationale: {
        reason: context.activeProgram ? 'replacement_program' : 'initial_program',
        generatedBy: 'planning_kernel',
        athleteReviewRequired: true
      },
      p_input_fingerprint: inputFingerprint,
      p_idempotency_key: idempotencyKey
    }
    const { data, error } = context.activeProgram
      ? await supabase.rpc('create_training_plan_replacement_proposal', {
        p_program_id: context.activeProgram.id,
        p_base_plan_version_id: context.activeProgram.activePlanVersionId,
        ...commonArguments
      })
      : await supabase.rpc('create_initial_training_plan_proposal', commonArguments)

    if (error) {
      console.error('Coach proposal RPC failed:', { code: error.code })
      if (error.code === '40001') return apiError('The active plan changed; refresh and try again', 409)
      if (error.code === '55000') return apiError(
        context.activeProgram
          ? 'The active plan is unavailable for replacement'
          : 'An active program already exists',
        409
      )
      if (error.code === '22023') return apiError('Proposal request conflicts with an existing request', 409)
      return apiError('Unable to save coach proposal', 503)
    }

    const row = (data?.[0] ?? null) as ProposalRpcRow | null
    if (!row?.proposal_id || !row.proposed_program_id || !row.proposed_plan_version_id) {
      return apiError('Unable to save coach proposal', 503)
    }

    return NextResponse.json({
      proposalId: row.proposal_id,
      programId: row.proposed_program_id,
      planVersionId: row.proposed_plan_version_id,
      idempotencyKey,
      proposal
    }, {
      status: 201,
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    console.error('Coach proposal POST error:', error)
    return apiError('Unable to create coach proposal', 500)
  }
}

async function readJson(request: Request): Promise<ProposalRequest | null> {
  try {
    const value = await request.json()
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as ProposalRequest
      : null
  } catch {
    return null
  }
}

function validIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length >= 8 && trimmed.length <= 200 ? trimmed : null
}
