import { NextResponse } from 'next/server'
import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import {
  validateCompleteCoachPlanningInput,
  type CompleteCoachPlanningInput
} from '@/app/lib/coach/complete-intake'

interface IntakeRequest {
  planningInput?: unknown
  idempotencyKey?: unknown
}

interface MemoryWrite {
  key: string
  kind: 'goal' | 'schedule' | 'equipment' | 'constraint'
  content: Record<string, unknown>
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
        { error: 'Invalid coach setup', details: validated.errors },
        { status: 400 }
      )
    }

    const idempotencyKey = validIdempotencyKey(body.idempotencyKey)
    if (!idempotencyKey) return apiError('A valid idempotency key is required', 400)

    const memories = memoryWrites(validated.value)
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
  return [
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
