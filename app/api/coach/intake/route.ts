import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'
import { exercisePreferencesEnabled } from '@/app/lib/coach/exercise-preferences-server'
import { validateExercisePreferences } from '@/app/lib/coach/exercise-preferences'
import { fetchCoachEvidenceContext } from '@/app/lib/coach/evidence-context'
import { NextResponse } from 'next/server'
import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import {
  validateCompleteCoachPlanningInput,
  type CompleteCoachPlanningInput
} from '@/app/lib/coach/complete-intake'

interface IntakeRequest {
  planningInput?: unknown
  exercisePreferences?: unknown
  idempotencyKey?: unknown
}

interface MemoryWrite {
  key: string
  kind: 'goal' | 'schedule' | 'equipment' | 'constraint' | 'preference'
  content: Record<string, unknown>
}

export async function GET() {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return apiError('Unauthorized', 401)
    const enabled = exercisePreferencesEnabled()
    if (!enabled) return NextResponse.json({ exercisePreferencesEnabled: false, exercisePreferences: null }, { headers: { 'Cache-Control': 'private, no-store' } })
    const context = await fetchCoachEvidenceContext(supabase, user.id, { purpose: 'new_planning', asOf: new Date().toISOString() })
    if (!context.storageAvailable || !context.selectionComplete) return apiError('Unable to load preferences', 503)
    const memory = context.memories.find(item => item.memoryKey === 'exercise_preferences')
    if (memory && !validateExercisePreferences(memory.content)) return apiError('Saved preferences need review', 422)
    return NextResponse.json({ exercisePreferencesEnabled: true, exercisePreferences: memory?.content ?? null }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return apiError('Unable to load preferences', 503)
  }
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

    let memories: MemoryWrite[]
    if (body.exercisePreferences !== undefined) {
      if (body.planningInput !== undefined || !validateExercisePreferences(body.exercisePreferences)) {
        return apiError('Invalid exercise preferences', 400)
      }
      if (!exercisePreferencesEnabled()) return apiError('Exercise preferences are not enabled', 409)
      memories = [{ key: 'exercise_preferences', kind: 'preference', content: { ...body.exercisePreferences } }]
    } else {
      if (personalizedCoachingCapabilities().trainingIntent && (body.planningInput as { setupConfirmed?: boolean } | undefined)?.setupConfirmed !== true) throw new Error('Confirm current training days, session duration and equipment')
    const validated = validateCompleteCoachPlanningInput(body.planningInput)
      if (!validated.ok) {
        return NextResponse.json(
          { error: 'Invalid coach setup', details: validated.errors },
          { status: 400 }
        )
      }

      if (validated.value.exercisePreferences !== undefined && !exercisePreferencesEnabled()) {
        return apiError('Exercise preferences are not enabled', 409)
      }
      memories = memoryWrites(validated.value)
    }
    for (const memory of memories) {
      const { error } = await supabase.rpc('confirm_coach_memory', {
        p_memory_key: memory.key,
        p_kind: memory.kind,
        p_content: memory.content,
        p_provenance: {
          source: 'program_setup',
          confirmedBy: 'athlete'
        },
        p_confidence: 1,
        p_idempotency_key: `${idempotencyKey}:${memory.key}`
      })

      if (error) {
        console.error('Coach intake memory write failed:', {
          key: memory.key,
          code: error.code
        })
        return apiError('Unable to save coach setup', 503)
      }
    }

    return NextResponse.json({ saved: true }, {
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    console.error('Coach intake POST error:', error)
    return apiError('Unable to save coach setup', 500)
  }
}

function memoryWrites(input: CompleteCoachPlanningInput): MemoryWrite[] {
  const preferences: MemoryWrite[] = input.exercisePreferences === undefined ? [] : [{
    key: 'exercise_preferences', kind: 'preference', content: { ...input.exercisePreferences }
  }]
  return [
    ...preferences,
    {
      key: 'primary_goal',
      kind: 'goal',
      content: {
        goal: input.goal,
        primaryDomain: input.primaryDomain,
        secondaryGoals: input.secondaryGoals
      }
    },
    {
      key: 'training_schedule',
      kind: 'schedule',
      content: {
        experience: input.experience,
        trainingDays: input.trainingDays,
        sessionMinutes: input.sessionMinutes,
        startDate: input.startDate
      }
    },
    {
      key: 'available_equipment',
      kind: 'equipment',
      content: {
        equipment: input.equipment,
        resolvedEquipmentIds: input.resolvedEquipmentIds
      }
    },
    {
      key: 'training_constraints',
      kind: 'constraint',
      content: {
        constraints: input.constraints,
        constraintKinds: input.constraintKinds
      }
    }
  ]
}

async function readJson(request: Request): Promise<IntakeRequest | null> {
  try {
    const value = await request.json()
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as IntakeRequest
      : null
  } catch {
    return null
  }
}

function validIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length >= 8 && trimmed.length <= 70 ? trimmed : null
}
