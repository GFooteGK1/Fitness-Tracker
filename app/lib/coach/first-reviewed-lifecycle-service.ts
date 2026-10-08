/** Server factories only: no route, capability, enrollment or numerical activation. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { doseContentHash } from './initial-dose-policy'
import { parseFirstReviewedDraft } from './first-reviewed-contract'
import { prepareFirstReviewedCandidate } from './first-reviewed-candidate-server'
import { parseFirstReviewedPending,parseFirstReviewedRequestResolution } from './first-reviewed-request-resolution'
import { resolveFirstReviewedRequest } from './first-reviewed-request-resolution-server'
import type { createFirstReviewedReviewService } from './first-reviewed-review-service'

const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const same=(a:unknown,b:unknown)=>doseContentHash(a)===doseContentHash(b)
const owns=async(db:SupabaseClient,id:string)=>{const a=await db.auth.getUser();return !a.error&&a.data.user?.id===id}

export function createFirstReviewedLifecycleService(options:{enabled:()=>boolean;createServiceClient:()=>SupabaseClient;
  review:Pick<ReturnType<typeof createFirstReviewedReviewService>,'resolveApproved'>}) {
  const issue=async(db:SupabaseClient,input:unknown)=>{
    const request=parseFirstReviewedPending(input)
    if(!request||request.operation!=='issue')return {kind:'invalid_request' as const}
    const retry=()=>({kind:'retry_required' as const,request})
    const changed=()=>({kind:'account_changed' as const,request})
    const disabled=()=>({kind:'disabled' as const,request})
    try{
      const recovered=await resolveFirstReviewedRequest(db,request,false)
      if(recovered.kind!=='resolved')return {...recovered,request}
      if(recovered.resolution.disposition==='no_write')return {kind:'no_write' as const,request,resolution:recovered.resolution}
      const lookup=await db.rpc('get_reviewed_week_registration',{p_registration_id:request.body.candidateId})
      if(!await owns(db,request.userId))return changed()
      if(lookup.error)return retry()
      let saved:unknown=lookup.data
      const matches=()=>record(saved)&&Object.keys(saved).sort().join(',')==='planVersionId,programId,proposalId,registrationId,reviewId,userId'
        &&saved.registrationId===request.body.candidateId&&saved.reviewId===request.body.candidateId&&saved.userId===request.userId
        &&saved.programId===request.programId&&uuid(saved.proposalId)&&uuid(saved.planVersionId)
      if(recovered.resolution.disposition==='saved'){
        return matches()&&record(saved)&&saved.proposalId===recovered.resolution.result.proposalId&&saved.planVersionId===recovered.resolution.result.planVersionId
          ?{kind:'recovered' as const,request,receipt:recovered.resolution.result}:retry()
      }
      if(!options.enabled())return disabled()
      if(saved===null){
        const approved=await options.review.resolveApproved(db,request.body.candidateId)
        if(!await owns(db,request.userId))return changed()
        if(approved.kind!=='approved_candidate')return {...approved,request}
        const c=approved.candidate,packet=approved.privatePacket
        if(c.candidateId!==request.body.candidateId||c.userId!==request.userId||c.programId!==request.programId||!record(packet.inputSnapshot))return retry()
        const draft=parseFirstReviewedDraft(packet.inputSnapshot.firstReviewedDraft)
        if(!draft||draft.candidateId!==c.candidateId||draft.designationId!==c.designationId||draft.programId!==c.programId
          ||draft.basePlanVersionId!==c.basePlanVersionId)return retry()
        const prepared=await prepareFirstReviewedCandidate(db,draft)
        if(!await owns(db,request.userId))return changed()
        if(prepared.kind!=='prepared_first_candidate'||!same(prepared.privatePacket,packet)||!same(prepared.reviewPacket,c.reviewPacket))
          return {kind:'review_required' as const,request}
        if(!options.enabled())return disabled()
        const registered=await options.createServiceClient().rpc('register_reviewed_week_proposal',{
          p_id:c.candidateId,p_packet:prepared.privatePacket,p_fingerprint:doseContentHash(prepared.privatePacket)})
        if(!await owns(db,request.userId))return changed()
        if(registered.error)return registered.error.code==='22023'?{kind:'request_conflict' as const,request}:retry()
        const readback=await db.rpc('get_reviewed_week_registration',{p_registration_id:c.candidateId})
        if(!await owns(db,request.userId))return changed()
        if(readback.error)return retry()
        saved=readback.data
      }
      if(!matches()||!record(saved))return retry()
      if(!await owns(db,request.userId))return changed()
      if(!options.enabled())return disabled()
      const result=await db.rpc('create_registered_reviewed_week_proposal',{p_registration_id:request.body.candidateId,p_idempotency_key:request.body.requestId})
      if(!await owns(db,request.userId))return changed()
      if(result.error)return result.error.code==='22023'?{kind:'request_conflict' as const,request}:retry()
      if(!record(result.data)||Object.keys(result.data).sort().join(',')!=='planVersionId,programId,proposalId,replayed'
        ||result.data.proposalId!==saved.proposalId||result.data.planVersionId!==saved.planVersionId
        ||result.data.programId!==saved.programId||typeof result.data.replayed!=='boolean')return retry()
      return {kind:'issued' as const,request,proposalId:saved.proposalId as string,planVersionId:saved.planVersionId as string,
        programId:request.programId,replayed:result.data.replayed,numericRuntimeEligible:false as const}
    }catch{return retry()}
  }
  const accept=async(db:SupabaseClient,input:unknown)=>{
    const request=parseFirstReviewedPending(input)
    if(!request||request.operation!=='accept')return {kind:'invalid_request' as const}
    const retry=()=>({kind:'retry_required' as const,request})
    try{
      const recovered=await resolveFirstReviewedRequest(db,request,false)
      if(recovered.kind!=='resolved')return {...recovered,request}
      if(recovered.resolution.disposition==='saved')return {kind:'recovered' as const,request,receipt:recovered.resolution.result}
      if(recovered.resolution.disposition==='no_write')return {kind:'no_write' as const,request,resolution:recovered.resolution}
      if(!options.enabled())return {kind:'disabled' as const,request}
      if(!await owns(db,request.userId))return {kind:'account_changed' as const,request}
      if(!options.enabled())return {kind:'disabled' as const,request}
      const accepted=await db.rpc('accept_first_reviewed_week',{p_request:request})
      if(!await owns(db,request.userId))return {kind:'account_changed' as const,request}
      if(accepted.error)return accepted.error.code==='22023'?{kind:'request_conflict' as const,request}:retry()
      const verified=parseFirstReviewedRequestResolution({schemaVersion:1,request,disposition:'saved',result:accepted.data},request)
      return verified?.disposition==='saved'?{kind:'accepted' as const,request,receipt:verified.result,numericRuntimeEligible:false as const}:retry()
    }catch{return retry()}
  }
  return {issue,accept,recover:(db:SupabaseClient,input:unknown)=>resolveFirstReviewedRequest(db,input,false),
    close:(db:SupabaseClient,input:unknown)=>resolveFirstReviewedRequest(db,input,true)}
}
