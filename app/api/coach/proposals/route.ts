import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import {
  buildProgrammingProfile,
  validateCompleteCoachPlanningInput
} from '@/app/lib/coach/complete-intake'
import { buildCompleteEightWeekPlan } from '@/app/lib/coach/complete-program'
import { validateCompleteProgrammingPlan } from '@/app/lib/coach/program-validator'
import type { TrainingWeekday } from '@/app/lib/coach/types'

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

    const validated = validateCompleteCoachPlanningInput(body.planningInput)
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
      const profile = buildProgrammingProfile(validated.value, context.assessments)
      proposal = buildCompleteEightWeekPlan(profile)
      const proposalValidation = validateCompleteProgrammingPlan(proposal)
      if (!proposalValidation.ok) throw new Error(proposalValidation.errors.join('; '))
    } catch (error) {
      return apiError(
        'Invalid coach setup',
        400,
        error instanceof Error ? error.message : undefined
      )
    }

    const sourceSnapshot = {
      planningInput: validated.value,
      programmingProfile: proposal.profileSnapshot,
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
      p_goal_summary: proposal.profileSnapshot.athleteGoalSummary,
      p_start_date: proposal.startDate,
      p_reference_version: proposal.evidenceReferenceVersion,
      p_policy_version: proposal.policyVersion,
      p_intent: {
        format: proposal.format,
        horizon_weeks: 8,
        kernel_version: proposal.kernelVersion,
        primary_domain: proposal.profileSnapshot.primaryGoal.domain,
        weeks: proposal.weeks.map(week => ({
          week: week.weekNumber,
          role: week.role,
          intent: week.intent,
          reviewRequired: week.review.status === 'pending_athlete_review',
          review: week.review,
          coverage: week.schedule.ledger
        }))
      },
      p_input_snapshot: sourceSnapshot,
      p_sessions: proposal.weeks.flatMap(week => week.sessions.map((session, index) => ({
        week_number: week.weekNumber,
        session_index: index + 1,
        scheduled_date: scheduledDate(proposal.startDate, week.weekNumber, session.day),
        prescription: session
      }))),
      p_rationale: {
        reason: context.activeProgram ? 'replacement_program' : 'initial_program',
        generatedBy: 'planning_kernel',
        kernelVersion: proposal.kernelVersion,
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

const WEEKDAY_OFFSET: Record<TrainingWeekday, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6
}

function scheduledDate(
  startDate: string,
  weekNumber: number,
  day: TrainingWeekday
): string {
  const date = new Date(`${startDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + ((weekNumber - 1) * 7) + WEEKDAY_OFFSET[day])
  return date.toISOString().slice(0, 10)
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
