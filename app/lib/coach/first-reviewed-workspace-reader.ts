/** Only authenticated bounded SQL getters. No privileged client or write path. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseFirstReviewDiscoveryRequest,parseFirstReviewProgramsPage,parseFirstReviewProgramWorkspace,parseFirstReviewSnapshotsPage,
  type FirstReviewDiscoveryKind } from './first-reviewed-workspace-contract'

export async function readFirstReviewWorkspace(db:SupabaseClient,input:unknown,kind:FirstReviewDiscoveryKind){
  const q=parseFirstReviewDiscoveryRequest(input,kind)
  if(!q)return {kind:'invalid_request' as const}
  try{
    const before=await db.auth.getUser()
    if(before.error||before.data.user?.id!==q.actor)return {kind:'account_changed' as const}
    const r=kind==='programs'?await db.rpc('list_first_review_programs',{p_after_program_id:q.after,p_limit:q.limit})
      :kind==='workspace'?await db.rpc('get_first_review_program_workspace',{p_program_id:q.programId,p_after_candidate_id:q.after,p_limit:q.limit})
        :await db.rpc('list_first_review_profile_snapshots',{p_program_id:q.programId,p_after_snapshot_id:q.after,p_limit:q.limit})
    const after=await db.auth.getUser()
    if(after.error||after.data.user?.id!==q.actor)return {kind:'account_changed' as const}
    if(r.error)return {kind:'unavailable' as const}
    if(r.data===null&&kind!=='programs')return {kind:'not_found' as const}
    if(kind==='programs'){
      const page=parseFirstReviewProgramsPage(r.data,q.actor,q.after,q.limit)
      return page?{kind:'programs' as const,page}:{kind:'unavailable' as const}
    }
    if(kind==='workspace'){
      const page=parseFirstReviewProgramWorkspace(r.data,q.actor,q.programId!,q.after,q.limit)
      return page?{kind:'workspace' as const,page}:{kind:'unavailable' as const}
    }
    const page=parseFirstReviewSnapshotsPage(r.data,q.actor,q.programId!,q.after,q.limit)
    return page?{kind:'snapshots' as const,page}:{kind:'unavailable' as const}
  }catch{return {kind:'unavailable' as const}}
}
