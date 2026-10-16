/** Pure authenticated current-setup seed; factual confirmation remains separate. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatUTCAsLocalDateWithOffset } from '../timezone-utils'
import { doseContentHash } from './initial-dose-policy'
import { readFirstReviewWorkspace } from './first-reviewed-workspace-reader'
import { fetchReviewedDoseContext } from './reviewed-dose-context-server'
import { captureSetupMemoryBindings,setupMemoryBindingsCurrent } from './setup-memory-bindings'
import { decodeCoachWeeklyIntent } from './rolling-weekly-api'
import { firstReviewedSetupProfile } from './first-reviewed-setup-profile'
import { parseFirstReviewedSetupRead,parseFirstReviewedSetupSeed } from './first-reviewed-setup-contract'

export async function readFirstReviewedSetup(db:SupabaseClient,input:unknown){
  const q=parseFirstReviewedSetupRead(input);if(!q)return {kind:'invalid_request' as const}
  const actor=async()=>{const r=await db.auth.getUser();return r.error?null:r.data.user?.id??null}
  try{
    if(await actor()!==q.expectedUserId)return {kind:'account_changed' as const}
    const before=await readFirstReviewWorkspace(db,{expectedUserId:q.expectedUserId,programId:q.programId},'workspace')
    if(before.kind!=='workspace')return {kind:before.kind==='not_found'?'not_found' as const:'unavailable' as const}
    const p=before.page.program,d=p.latestDesignation
    if(p.role!=='athlete'||p.athleteId!==q.expectedUserId)return {kind:'not_found' as const}
    if(!p.reviewAvailable||!d||Date.parse(d.expiresAt)<=Date.now())return {kind:'review_required' as const}
    const base=await db.from('training_plan_versions').select('id,user_id,program_id,status,plan_mode,intent')
      .eq('user_id',q.expectedUserId).eq('program_id',q.programId).eq('id',d.basePlanVersionId).limit(2)
    const row=base.data?.[0],legacy=!base.error&&base.data?.length===1&&row?.id===d.basePlanVersionId&&row.user_id===q.expectedUserId
      &&row.program_id===q.programId&&row.status==='accepted'&&row.plan_mode==='rolling_weekly'?decodeCoachWeeklyIntent(row.intent):null
    if(!legacy||legacy.kind==='reviewed')return {kind:'unavailable' as const}
    const declarations=await captureSetupMemoryBindings(db,q.expectedUserId,legacy.plan.profileSnapshot,{review:true,reviewedSetup:true})
    const built=firstReviewedSetupProfile(legacy.plan.profileSnapshot,declarations,d.targetWindowStart)
    // Missing or overdue declarations are reviewable setup gaps, not a reason
    // to copy the old profile or weaken the fresh factual-source reader.
    const source=built.kind==='setup_ready'?await fetchReviewedDoseContext(db,{programId:q.programId,basePlanVersionId:d.basePlanVersionId,
      historyDays:q.historyDays,tzOffset:q.tzOffset,historyThrough:formatUTCAsLocalDateWithOffset(new Date().toISOString(),q.tzOffset)},
      {firstReviewSetup:true,firstReviewFacts:true}):null
    const after=await readFirstReviewWorkspace(db,{expectedUserId:q.expectedUserId,programId:q.programId},'workspace')
    if(after.kind!=='workspace'||doseContentHash(after.page.program)!==doseContentHash(p)
      ||doseContentHash(await captureSetupMemoryBindings(db,q.expectedUserId,legacy.plan.profileSnapshot,{review:true,reviewedSetup:true}))!==doseContentHash(declarations)
      ||(source&&(doseContentHash(source.binding.setup)!==doseContentHash(declarations)||!await setupMemoryBindingsCurrent(db,q.expectedUserId,source.binding.setup)))
      ||await actor()!==q.expectedUserId
      ||Date.parse(d.expiresAt)<=Date.now())return {kind:'unavailable' as const}
    if(built.kind==='setup_required')return built
    if(!source)return {kind:'unavailable' as const}
    const seed=parseFirstReviewedSetupSeed({schemaVersion:1,userId:q.expectedUserId,programId:q.programId,basePlanVersionId:d.basePlanVersionId,
      designationId:d.designationId,designationVersion:d.version,windowStart:d.targetWindowStart,sequenceNumber:p.legacyBase.sequenceNumber+1,
      historyDays:q.historyDays,tzOffset:q.tzOffset,readAt:source.asOf,sourceHash:source.contextHash,targetSetup:built.profile,
      factsLoaded:false,numericRuntimeEligible:false},q.expectedUserId,q.programId)
    return seed?{kind:'setup' as const,seed}:{kind:'unavailable' as const}
  }catch{return {kind:'unavailable' as const}}
}
