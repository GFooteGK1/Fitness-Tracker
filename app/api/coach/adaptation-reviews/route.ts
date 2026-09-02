import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import {
  evaluateAdaptation,
  type AdaptationExecutionSummary,
  type AdaptationSafetySignal
} from '@/app/lib/coach/adaptation-evaluator'
import {
  buildProgrammingProfile,
  validateCompleteCoachPlanningInput
} from '@/app/lib/coach/complete-intake'
import { buildCompleteEightWeekPlan } from '@/app/lib/coach/complete-program'
import { fetchCoachEvidenceContext } from '@/app/lib/coach/evidence-context'
import type { CoachSessionCheckinSummary } from '@/app/lib/coach/execution-feedback'
import { validateCompleteProgrammingPlan } from '@/app/lib/coach/program-validator'
import type {
  ActiveCoachProgramSummary,
  TrainingWeekday
} from '@/app/lib/coach/types'

interface AdaptationReviewRequest {
  goalId?: unknown
  asOf?: unknown
  windowDays?: unknown
  replacementPlanningInput?: unknown
  idempotencyKey?: unknown
}

interface PlanSourceRow {
  id: string
  intent: unknown
  input_snapshot: unknown
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
    const goalId = stableId(body.goalId)
    const asOf = isoTimestamp(body.asOf)
    const windowDays = validWindowDays(body.windowDays)
    if (!goalId || !asOf || windowDays === null) {
      return apiError('A valid goal, as-of time, and review window are required', 400)
    }

    const [context, recoveryContext, runtimeContext] = await Promise.all([
      fetchCoachEvidenceContext(supabase, user.id, {
        purpose: 'adaptation_review',
        goalId,
        asOf,
        windowDays
      }),
      fetchCoachEvidenceContext(supabase, user.id, {
        purpose: 'general_coaching',
        asOf,
        windowDays: Math.min(windowDays, 90)
      }),
      fetchCoachRuntimeContext(supabase, user.id, new Date(asOf))
    ])
    if (!runtimeContext.storageAvailable || !context.activePlan) {
      return apiError('Coach review storage is unavailable', 503)
    }
    if (
      !runtimeContext.activeProgram
      || runtimeContext.activeProgram.id !== context.activePlan.programId
      || runtimeContext.activeProgram.activePlanVersionId !== context.activePlan.planVersionId
    ) {
      return apiError('The active plan changed; refresh and review again', 409)
    }

    const { data: planRows, error: planError } = await supabase
      .from('training_plan_versions')
      .select('id, intent, input_snapshot')
      .eq('user_id', user.id)
      .eq('id', context.activePlan.planVersionId)
      .eq('status', 'accepted')
      .limit(1)
    const planSource = ((planRows ?? [])[0] ?? null) as PlanSourceRow | null
    if (planError || !planSource || planSource.id !== context.activePlan.planVersionId) {
      return apiError('The accepted plan is unavailable for review', 503)
    }

    const adaptivePlan = isRecord(planSource.intent)
      ? planSource.intent.adaptive_programming
      : null
    const execution = buildExecutionSummary(
      runtimeContext.activeProgram,
      context.window.startsAt,
      asOf
    )
    const safetySignals = buildSafetySignals(
      runtimeContext.activeProgram?.sessionCheckins ?? [],
      context.window.startsAt,
      asOf
    )
    const review = evaluateAdaptation({
      goalId,
      adaptivePlan,
      context,
      recoveryContext,
      safetySignals,
      execution
    })

    if (body.replacementPlanningInput === undefined) {
      return NextResponse.json({ review }, {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store' }
      })
    }
    if (!review.proposalRecommendation.eligible || !review.evidenceSnapshot) {
      return apiError('This review does not support a replacement proposal', 409)
    }

    const idempotencyKey = validIdempotencyKey(body.idempotencyKey)
    if (!idempotencyKey) return apiError('A valid idempotency key is required', 400)
    const validated = validateCompleteCoachPlanningInput(body.replacementPlanningInput)
    if (!validated.ok) {
      return NextResponse.json(
        { error: 'Invalid replacement setup', details: validated.errors },
        { status: 400 }
      )
    }
    if (validated.value.startDate < asOf.slice(0, 10)) {
      return apiError('A replacement plan must start on or after the review date', 400)
    }

    let proposal
    try {
      const profile = buildProgrammingProfile(validated.value, runtimeContext.assessments)
      proposal = buildCompleteEightWeekPlan(profile)
      const validation = validateCompleteProgrammingPlan(proposal)
      if (!validation.ok) throw new Error(validation.errors.join('; '))
    } catch (error) {
      return apiError(
        'Invalid replacement setup',
        400,
        error instanceof Error ? error.message : undefined
      )
    }

    const sourceSnapshot = {
      reason: 'evidence_derived_adaptation',
      basePlanVersionId: context.activePlan.planVersionId,
      goalId,
      planningInput: validated.value,
      evidenceSnapshot: review.evidenceSnapshot,
      sourcePlanInputFingerprint: createHash('sha256')
        .update(stableStringify(planSource.input_snapshot))
        .digest('hex'),
      assessments: runtimeContext.assessments.map(assessment => ({
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
      }))
    }
    const inputFingerprint = createHash('sha256')
      .update(stableStringify({ proposal, sourceSnapshot, action: review.action }))
      .digest('hex')
    const { data, error } = await supabase.rpc('create_training_plan_replacement_proposal', {
      p_program_id: context.activePlan.programId,
      p_base_plan_version_id: context.activePlan.planVersionId,
      p_title: proposal.title,
      p_goal_summary: proposal.profileSnapshot.athleteGoalSummary,
      p_start_date: proposal.startDate,
      p_reference_version: proposal.evidenceReferenceVersion,
      p_policy_version: proposal.policyVersion,
      p_intent: {
        format: proposal.format,
        horizon_weeks: 8,
        kernel_version: proposal.kernelVersion,
        adaptive_programming: proposal.adaptiveProgramming,
        adaptation_source: {
          evidenceSnapshotId: review.evidenceSnapshot.id,
          action: review.action,
          algorithmVersion: review.algorithmVersion,
          basePlanVersionId: context.activePlan.planVersionId
        },
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
        reason: 'evidence_derived_adaptation',
        action: review.action,
        confidence: review.confidence,
        explanation: review.rationale,
        trend: review.trend,
        evidenceStatus: review.evidenceStatus,
        evidenceSnapshot: review.evidenceSnapshot,
        generatedBy: 'deterministic_adaptation_evaluator',
        algorithmVersion: review.algorithmVersion,
        automaticPlanActivation: false,
        athleteReviewRequired: true
      },
      p_input_fingerprint: inputFingerprint,
      p_idempotency_key: idempotencyKey
    })
    if (error) {
      console.error('Adaptation proposal RPC failed:', { code: error.code })
      if (error.code === '40001') return apiError('The active plan changed; refresh and review again', 409)
      if (error.code === '55000') return apiError('The active plan is unavailable for replacement', 409)
      if (error.code === '22023') return apiError('Proposal request conflicts with an existing request', 409)
      return apiError('Unable to save adaptation proposal', 503)
    }

    const row = (data?.[0] ?? null) as ProposalRpcRow | null
    if (!row?.proposal_id || !row.proposed_program_id || !row.proposed_plan_version_id) {
      return apiError('Unable to save adaptation proposal', 503)
    }

    return NextResponse.json({
      review,
      proposalId: row.proposal_id,
      programId: row.proposed_program_id,
      planVersionId: row.proposed_plan_version_id,
      idempotencyKey,
      proposal,
      activePlanChanged: false,
      acceptanceRequired: true
    }, {
      status: 201,
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    console.error('Coach adaptation review POST error:', error)
    return apiError('Unable to create adaptation review', 500)
  }
}

function buildExecutionSummary(
  activeProgram: ActiveCoachProgramSummary | null,
  startsAt: string,
  asOf: string
): AdaptationExecutionSummary | null {
  if (!activeProgram) return null
  const startDate = startsAt.slice(0, 10)
  const endDate = asOf.slice(0, 10)
  const sessions = activeProgram.upcomingSessions.filter(session => (
    session.scheduledDate !== null
    && session.scheduledDate >= startDate
    && session.scheduledDate <= endDate
  ))
  const sessionIds = new Set(sessions.map(session => session.id))
  const checkins = activeProgram.sessionCheckins.filter(checkin => (
    sessionIds.has(checkin.prescribedSessionId)
    && checkin.occurredAt >= startsAt
    && checkin.occurredAt <= asOf
  ))
  const rpes = checkins.flatMap(checkin => checkin.sessionRpe === null ? [] : [checkin.sessionRpe])
  const completedSessionIds = sessions.filter(session => session.status === 'completed').map(session => session.id)
  const skippedSessionIds = sessions.filter(session => session.status === 'skipped').map(session => session.id)
  return {
    scheduledSessionIds: sessions.map(session => session.id),
    completedSessionIds,
    skippedSessionIds,
    checkinIds: checkins.map(checkin => checkin.id),
    completionRate: sessions.length === 0
      ? null
      : Math.round((completedSessionIds.length / sessions.length) * 10_000) / 10_000,
    averageSessionRpe: rpes.length === 0
      ? null
      : Math.round((rpes.reduce((total, value) => total + value, 0) / rpes.length) * 100) / 100
  }
}

function buildSafetySignals(
  checkins: readonly CoachSessionCheckinSummary[],
  startsAt: string,
  asOf: string
): AdaptationSafetySignal[] {
  return checkins
    .filter(checkin => checkin.occurredAt >= startsAt && checkin.occurredAt <= asOf)
    .flatMap(checkin => {
      const signals: AdaptationSafetySignal[] = []
      if (checkin.pain === 'concerning') {
        signals.push({
          id: `${checkin.id}:pain`,
          kind: 'concerning_pain',
          severity: 'pause',
          occurredAt: checkin.occurredAt
        })
      } else if (checkin.pain === 'mild') {
        signals.push({
          id: `${checkin.id}:pain`,
          kind: 'repeated_pain',
          severity: 'recover',
          occurredAt: checkin.occurredAt
        })
      }
      if (checkin.outcome === 'stopped_early') {
        signals.push({
          id: `${checkin.id}:stopped`,
          kind: 'stopped_early',
          severity: 'recover',
          occurredAt: checkin.occurredAt
        })
      }
      if (checkin.energy === 'low') {
        signals.push({
          id: `${checkin.id}:energy`,
          kind: 'low_energy',
          severity: 'recover',
          occurredAt: checkin.occurredAt
        })
      }
      return signals
    })
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

function scheduledDate(startDate: string, weekNumber: number, day: TrainingWeekday): string {
  const date = new Date(`${startDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + ((weekNumber - 1) * 7) + WEEKDAY_OFFSET[day])
  return date.toISOString().slice(0, 10)
}

async function readJson(request: Request): Promise<AdaptationReviewRequest | null> {
  try {
    const value = await request.json()
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

function stableId(value: unknown): string | null {
  return typeof value === 'string'
    && value.length <= 160
    && /^[a-z0-9][a-z0-9._:-]*$/i.test(value)
    ? value
    : null
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null
  return new Date(value).toISOString() === value ? value : null
}

function validWindowDays(value: unknown): number | null {
  if (value === undefined) return 84
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 180
    ? value
    : null
}

function validIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length >= 8 && trimmed.length <= 200 ? trimmed : null
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
