import type { SupabaseClient } from '@supabase/supabase-js'
import { parseSupervisedPending } from './supervised-pending'
import { parseSupervisedRequestResolution } from './supervised-request-resolution'
/** Uses the authenticated client only; no current write capability is required
 * to recover or permanently fence this actor's historical request. */
export async function resolveSupervisedRequest(db: SupabaseClient, input: unknown, close: boolean) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { kind: 'invalid_request' as const }
  const value = input as Record<string, unknown>
  const pending = parseSupervisedPending(input, String(value.userId), String(value.programId))
  if (!pending) return { kind: 'invalid_request' as const }
  try {
    const before = await db.auth.getUser()
    if (before.error || before.data.user?.id !== pending.userId) return { kind: 'account_changed' as const }
    const result = await db.rpc(close ? 'resolve_supervised_request' : 'get_supervised_request_resolution', { p_request: pending })
    const after = await db.auth.getUser()
    if (after.error || after.data.user?.id !== pending.userId) return { kind: 'account_changed' as const }
    if (result.error) return { kind: result.error.code === '22023' ? 'request_conflict' as const : 'retry_required' as const }
    const resolution = parseSupervisedRequestResolution(result.data, pending)
    return resolution ? { kind: 'resolved' as const, resolution } : { kind: 'retry_required' as const }
  } catch { return { kind: 'retry_required' as const } }
}
