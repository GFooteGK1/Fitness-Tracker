import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { deriveStrengthAssessment } from '@/app/lib/coach/policy'
import type {
  CoachStrengthAssessmentSummary,
  StrengthAssessmentInput
} from '@/app/lib/coach/types'

interface AssessmentRequest {
  assessment?: unknown
  idempotencyKey?: unknown
}

interface AssessmentRow {
  id: string
  movement: string
  variation: string | null
  load: number | string
  unit: 'lb' | 'kg'
  reps: 1 | 3 | 5
  assessed_on: string
  is_true_rep_max: boolean
  rir: number | string | null
  rpe: number | string | null
  athlete_confidence: number | string
  estimated_1rm: number | string
  estimate_kind: 'reported_1rm' | 'estimated_1rm'
  calculator_version: string
  input_fingerprint: string
}

const ASSESSMENT_SELECT = `
  id,
  movement,
  variation,
  load,
  unit,
  reps,
  assessed_on,
  is_true_rep_max,
  rir,
  rpe,
  athlete_confidence,
  estimated_1rm,
  estimate_kind,
  calculator_version,
  input_fingerprint
`

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    const body = await readJson(request)
    if (!body) return apiError('Request body must be valid JSON', 400)

    const input = parseAssessment(body.assessment)
    const idempotencyKey = validIdempotencyKey(body.idempotencyKey)
    if (!input || !idempotencyKey) {
      return apiError('A valid assessment and idempotency key are required', 400)
    }

    let derived
    try {
      derived = deriveStrengthAssessment(input)
    } catch (error) {
      return apiError(
        'Invalid strength assessment',
        400,
        error instanceof Error ? error.message : undefined
      )
    }

    const inputFingerprint = createHash('sha256')
      .update(JSON.stringify(derived))
      .digest('hex')
    const rowToInsert = {
      user_id: user.id,
      idempotency_key: idempotencyKey,
      input_fingerprint: inputFingerprint,
      movement: derived.movement,
      variation: derived.variation,
      load: derived.sourceLoad,
      unit: derived.unit,
      reps: derived.sourceReps,
      assessed_on: derived.sourceDate,
      is_true_rep_max: derived.isTrueRepMax,
      rir: derived.rir,
      rpe: derived.rpe,
      athlete_confidence: derived.athleteConfidence,
      estimated_1rm: derived.estimatedOneRepMax,
      estimate_kind: derived.estimateKind,
      calculator_version: derived.calculatorVersion,
      provenance: {
        source: 'athlete_confirmed',
        formula: derived.formula
      }
    }

    const insertResult = await supabase
      .from('coach_strength_assessments')
      .insert(rowToInsert)
      .select(ASSESSMENT_SELECT)
      .single()

    let stored = insertResult.data as AssessmentRow | null
    if (insertResult.error?.code === '23505') {
      const existing = await supabase
        .from('coach_strength_assessments')
        .select(ASSESSMENT_SELECT)
        .eq('user_id', user.id)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()

      if (existing.error || !existing.data) {
        return apiError('Unable to save strength assessment', 503)
      }
      stored = existing.data as AssessmentRow
      if (stored.input_fingerprint !== inputFingerprint) {
        return apiError('Assessment request conflicts with an existing request', 409)
      }
    } else if (insertResult.error) {
      console.error('Strength assessment insert failed:', { code: insertResult.error.code })
      return apiError('Unable to save strength assessment', 503)
    }

    const assessment = stored ? normalizeAssessment(stored) : null
    if (!assessment) return apiError('Unable to save strength assessment', 503)

    return NextResponse.json({ assessment }, {
      status: 201,
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    console.error('Strength assessment POST error:', error)
    return apiError('Unable to save strength assessment', 500)
  }
}

function parseAssessment(value: unknown): StrengthAssessmentInput | null {
  if (!isRecord(value)) return null
  if (
    typeof value.movement !== 'string'
    || typeof value.load !== 'number'
    || (value.unit !== 'lb' && value.unit !== 'kg')
    || (value.reps !== 1 && value.reps !== 3 && value.reps !== 5)
    || typeof value.assessedOn !== 'string'
    || typeof value.isTrueRepMax !== 'boolean'
    || typeof value.athleteConfidence !== 'number'
    || (value.variation !== undefined && typeof value.variation !== 'string')
    || (value.rir !== undefined && typeof value.rir !== 'number')
    || (value.rpe !== undefined && typeof value.rpe !== 'number')
  ) return null

  return {
    movement: value.movement,
    variation: value.variation,
    load: value.load,
    unit: value.unit,
    reps: value.reps,
    assessedOn: value.assessedOn,
    isTrueRepMax: value.isTrueRepMax,
    rir: value.rir,
    rpe: value.rpe,
    athleteConfidence: value.athleteConfidence
  }
}

function normalizeAssessment(row: AssessmentRow): CoachStrengthAssessmentSummary | null {
  const load = Number(row.load)
  const rir = row.rir === null ? null : Number(row.rir)
  const rpe = row.rpe === null ? null : Number(row.rpe)
  const confidence = Number(row.athlete_confidence)
  const estimatedOneRepMax = Number(row.estimated_1rm)
  if (![load, confidence, estimatedOneRepMax].every(Number.isFinite)) return null
  if (rir !== null && !Number.isFinite(rir)) return null
  if (rpe !== null && !Number.isFinite(rpe)) return null

  return {
    id: row.id,
    movement: row.movement,
    variation: row.variation,
    load,
    unit: row.unit,
    reps: row.reps,
    assessedOn: row.assessed_on,
    isTrueRepMax: row.is_true_rep_max,
    rir,
    rpe,
    athleteConfidence: confidence,
    estimatedOneRepMax,
    estimateKind: row.estimate_kind,
    calculatorVersion: row.calculator_version
  }
}

async function readJson(request: Request): Promise<AssessmentRequest | null> {
  try {
    const value = await request.json()
    return isRecord(value) ? value as AssessmentRequest : null
  } catch {
    return null
  }
}

function validIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length >= 8 && trimmed.length <= 200 ? trimmed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
