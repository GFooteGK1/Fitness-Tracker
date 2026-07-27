import { NextResponse } from 'next/server'
import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'

interface AcceptanceRequest {
  idempotencyKey?: unknown
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!UUID_PATTERN.test(id)) return apiError('Invalid proposal id', 400)

    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    const body = await readJson(request)
    const idempotencyKey = validIdempotencyKey(body?.idempotencyKey)
    if (!idempotencyKey) return apiError('A valid idempotency key is required', 400)

    const { data, error } = await supabase.rpc('accept_adaptation_proposal', {
      p_proposal_id: id,
      p_idempotency_key: idempotencyKey
    })

    if (error) {
      console.error('Coach proposal acceptance failed:', { code: error.code })
      if (error.code === '40001') return apiError('This proposal is stale; create a new review', 409)
      if (error.code === 'P0002') return apiError('Coach proposal not found', 404)
      if (error.code === '22023') return apiError('Proposal request does not match', 409)
      return apiError('Unable to accept coach proposal', 503)
    }

    const context = await fetchCoachRuntimeContext(supabase, user.id)
    return NextResponse.json({
      accepted: data?.[0] ?? null,
      context
    }, {
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    console.error('Coach proposal acceptance POST error:', error)
    return apiError('Unable to accept coach proposal', 500)
  }
}

async function readJson(request: Request): Promise<AcceptanceRequest | null> {
  try {
    const value = await request.json()
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as AcceptanceRequest
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
