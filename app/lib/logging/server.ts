import { createServerClient } from '@/app/lib/auth/supabase-server'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

interface LoggingContext { id: string; submittedAt?: string; tzOffset?: number; writeAttempted?: boolean }
export const loggingContext = new AsyncLocalStorage<LoggingContext>()
export const validRequestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[\w-]{8,120}$/.test(value)

export async function beginRequest(supabase: SupabaseClient, key: string, input: string) {
  const { data, error } = await supabase.rpc('begin_logging_request', {
    p_key: key, p_fingerprint: createHash('sha256').update(input).digest('hex')
  })
  if (error || !data) return { response: NextResponse.json({
    error: error?.code === '22023' ? 'This request ID belongs to different input.' : 'Logging is unavailable. Your request was not started.'
  }, { status: error?.code === '22023' ? 409 : 503 }) }
  if (data.status === 'complete') return { response: NextResponse.json(data.response, { status: data.http_status }) }
  if (!data.claimed) return { response: NextResponse.json({
    error: 'This request is still processing or needs reconciliation. Check your history before starting a new log.',
    requestStatus: 'pending', savedEntities: data.entities
  }, { status: 409, headers: { 'Retry-After': '5' } }) }
  return { id: data.id as string }
}

export async function finishRequest(supabase: SupabaseClient, id: string, response: Response) {
  const { data, error } = await supabase.rpc('finish_logging_request', {
    p_id: id, p_response: await response.clone().json(), p_status: response.status
  })
  if (error) throw new Error('Unable to confirm the request receipt. Check history before logging again.')
  return NextResponse.json(data ?? await response.clone().json(), { status: response.status })
}

export class ActivitySaveError extends Error {}

export async function saveActivity(supabase: SupabaseClient, kind: 'meal' | 'workout',
  record: Record<string, unknown>, blocks: Record<string, unknown>[] = [], response?: Record<string, unknown>) {
  const context = loggingContext.getStore()
  if (context) context.writeAttempted = true
  try {
  const { data, error } = await supabase.rpc('save_logged_activity', {
    p_kind: kind, p_record: record, p_blocks: blocks,
    p_request_id: loggingContext.getStore()?.id ?? null, p_response: response ?? null
  })
  if (error || typeof data !== 'string') throw new ActivitySaveError('Unable to save the complete activity. Check history before retrying.')
  return data
  } catch (error) {
    if (error instanceof ActivitySaveError) throw error
    // A transport failure may happen after commit. Abort the agent tool loop too.
    throw new ActivitySaveError('The save could not be confirmed. Retry the same request or check history before logging again.')
  }
}

export async function replayJsonRequest<T extends Request>(request: T, kind: string, process: (request: T) => Promise<Response>) {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body
  try { body = await request.clone().json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body || !validRequestId(body.requestId)) return NextResponse.json({ error: 'A requestId is required. Refresh the app.' }, { status: 400 })
  if (body.expectedUserId && body.expectedUserId !== user.id) return NextResponse.json({ error: 'The signed-in account changed. Sign back in to the original account to retry.' }, { status: 403 })
  const claim = await beginRequest(supabase, `${kind}:${body.requestId}`, JSON.stringify(body))
  if (claim.response) return claim.response
  try {
    const context: LoggingContext = { id: claim.id!, submittedAt: body.submittedAt }
    return await loggingContext.run(context, async () => {
      let response = await process(request)
      // These two text routes write only through saveActivity. Analysis failures
      // before that boundary are confirmed no-write failures and can restart.
      if (!response.ok && !context.writeAttempted) {
        response = NextResponse.json({ ...await response.json(), retrySafe: true }, { status: response.status })
      }
      return finishRequest(supabase, claim.id!, response)
    })
  } catch {
    return NextResponse.json({ error: 'The save could not be confirmed. Retry the same request or check history before logging again.' }, { status: 503 })
  }
}
