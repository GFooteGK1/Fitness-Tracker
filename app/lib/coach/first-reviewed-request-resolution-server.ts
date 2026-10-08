import type { SupabaseClient } from '@supabase/supabase-js'
import { parseFirstReviewedPending,parseFirstReviewedRequestResolution } from './first-reviewed-request-resolution'
import { validateFirstReviewedProfileSnapshot } from './first-reviewed-profile-validation'
import { doseContentHash } from './initial-dose-policy'

/** Authenticated exact historical recovery/closure. A getter never calls a writer. */
export async function resolveFirstReviewedRequest(db:SupabaseClient,input:unknown,close:boolean) {
  const pending=parseFirstReviewedPending(input)
  if(!pending)return {kind:'invalid_request' as const}
  try {
    const before=await db.auth.getUser()
    if(before.error||before.data.user?.id!==pending.userId)return {kind:'account_changed' as const}
    const result=await db.rpc(close?'resolve_first_review_request':'get_first_review_request_resolution',{p_request:pending})
    const after=await db.auth.getUser()
    if(after.error||after.data.user?.id!==pending.userId)return {kind:'account_changed' as const}
    if(result.error)return {kind:result.error.code==='22023'?'request_conflict' as const:'retry_required' as const,request:pending}
    const resolution=parseFirstReviewedRequestResolution(result.data,pending)
    if(resolution?.disposition==='saved'&&pending.operation==='prepare_profile') {
      const snapshot=validateFirstReviewedProfileSnapshot(resolution.result)
      if(!snapshot||snapshot.requestHash!==doseContentHash(pending.body.request))return {kind:'retry_required' as const,request:pending}
    }
    return resolution?{kind:'resolved' as const,resolution}:{kind:'retry_required' as const,request:pending}
  } catch {return {kind:'retry_required' as const,request:pending}}
}
