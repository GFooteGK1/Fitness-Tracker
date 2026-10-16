/** Private server composition. Durable review is separate from issuance and athlete acceptance. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { doseContentHash } from './initial-dose-policy'
import { prepareFirstReviewedCandidate } from './first-reviewed-candidate-server'
import { parseFirstReviewedCandidateReview,parseFirstReviewedDecisionReceipt } from './first-reviewed-contract'
import { parseFirstReviewedPending } from './first-reviewed-request-resolution'
import { resolveFirstReviewedRequest } from './first-reviewed-request-resolution-server'

const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join(',')===[...keys].sort().join(',')
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const same=(a:unknown,b:unknown)=>doseContentHash(a)===doseContentHash(b)
const actor=async(db:SupabaseClient)=>{const a=await db.auth.getUser();return !a.error&&uuid(a.data.user?.id)?a.data.user!.id:null}

export function createFirstReviewedReviewService(options:{enabled:()=>boolean;createServiceClient:()=>SupabaseClient}) {
  const read=async(db:SupabaseClient,id:string)=>{
    if(!uuid(id))return {kind:'invalid_request' as const}
    try{
      const owner=await actor(db)
      if(!owner)return {kind:'unauthenticated' as const}
      const result=await db.rpc('get_first_review_candidate',{p_id:id})
      if(await actor(db)!==owner)return {kind:'account_changed' as const}
      if(result.error)return {kind:'unavailable' as const}
      if(result.data===null)return {kind:'not_found' as const}
      const candidate=parseFirstReviewedCandidateReview(result.data)
      return candidate&&candidate.candidateId===id&&[candidate.userId,candidate.reviewerId].includes(owner)
        ?{kind:'candidate' as const,candidate}:{kind:'unavailable' as const}
    }catch{return {kind:'unavailable' as const}}
  }
  const submit=async(db:SupabaseClient,input:unknown)=>{
    const request=parseFirstReviewedPending(input)
    if(!request||request.operation!=='submit')return {kind:'invalid_request' as const}
    const retry=()=>({kind:'retry_required' as const,request})
    try{
      const recovered=await resolveFirstReviewedRequest(db,request,false)
      if(recovered.kind!=='resolved')return {...recovered,request}
      if(recovered.resolution.disposition==='saved'){
        const candidate=parseFirstReviewedCandidateReview(recovered.resolution.result)
        return candidate?{kind:'saved' as const,request,candidate,replayed:true}:retry()
      }
      if(recovered.resolution.disposition==='no_write')return {kind:'no_write' as const,request,resolution:recovered.resolution}
      if(!options.enabled())return {kind:'disabled' as const,request}
      const prepared=await prepareFirstReviewedCandidate(db,request.body.draft)
      if(await actor(db)!==request.userId)return {kind:'account_changed' as const,request}
      if(prepared.kind!=='prepared_first_candidate')return {...prepared,request}
      if(prepared.privatePacket.userId!==request.userId)return retry()
      if(!options.enabled())return {kind:'disabled' as const,request}
      const saved=await options.createServiceClient().rpc('submit_first_review_candidate',{
        p_id:request.body.draft.candidateId,p_designation_id:request.body.draft.designationId,
        p_private_packet:prepared.privatePacket,p_review_packet:prepared.reviewPacket})
      if(await actor(db)!==request.userId)return {kind:'account_changed' as const,request}
      if(saved.error)return saved.error.code==='22023'?{kind:'request_conflict' as const,request}:retry()
      const c=parseFirstReviewedCandidateReview(saved.data),d=request.body.draft
      if(!c||c.candidateId!==d.candidateId||c.designationId!==d.designationId||c.programId!==request.programId
        ||c.userId!==request.userId||c.basePlanVersionId!==d.basePlanVersionId||!same(c.reviewPacket,prepared.reviewPacket))return retry()
      return {kind:'saved' as const,request,candidate:c,replayed:false}
    }catch{return retry()}
  }
  const decide=async(db:SupabaseClient,input:unknown)=>{
    const request=parseFirstReviewedPending(input)
    if(!request||request.operation!=='decide')return {kind:'invalid_request' as const}
    const retry=()=>({kind:'retry_required' as const,request})
    try{
      const recovered=await resolveFirstReviewedRequest(db,request,false)
      if(recovered.kind!=='resolved')return {...recovered,request}
      if(recovered.resolution.disposition==='saved'){
        const receipt=parseFirstReviewedDecisionReceipt(recovered.resolution.result)
        return receipt?{kind:'decided' as const,request,receipt}:retry()
      }
      if(recovered.resolution.disposition==='no_write')return {kind:'no_write' as const,request,resolution:recovered.resolution}
      if(!options.enabled())return {kind:'disabled' as const,request}
      const q=request.body
      const result=await db.rpc('decide_first_review_candidate',{p_id:q.candidateId,p_request_id:q.requestId,p_decision:q.decision,
        p_content_hash:q.contentHash,p_source_hash:q.sourceHash,p_designation_id:q.designationId})
      if(await actor(db)!==request.userId)return {kind:'account_changed' as const,request}
      if(result.error)return result.error.code==='22023'?{kind:'request_conflict' as const,request}:retry()
      const r=parseFirstReviewedDecisionReceipt(result.data)
      if(!r||r.candidateId!==q.candidateId||r.requestId!==q.requestId||r.reviewerId!==request.userId
        ||r.designationId!==q.designationId||r.decision!==q.decision||r.contentHash!==q.contentHash||r.sourceHash!==q.sourceHash)return retry()
      return {kind:'decided' as const,request,receipt:r}
    }catch{return retry()}
  }
  /** Only the server issuer consumes this private packet. Never expose it through HTTP. */
  const resolveApproved=async(db:SupabaseClient,id:string)=>{
    try{
      const owner=await actor(db),visible=await read(db,id)
      if(!owner||visible.kind!=='candidate'||visible.candidate.userId!==owner||await actor(db)!==owner)
        return {kind:'unavailable' as const}
      if(!options.enabled())return {kind:'disabled' as const}
      const c=visible.candidate
      const result=await options.createServiceClient().rpc('get_approved_first_review_candidate',{
        p_id:id,p_designation_id:c.designationId,p_content_hash:c.contentHash,p_source_hash:c.sourceHash})
      if(await actor(db)!==owner)return {kind:'account_changed' as const}
      if(result.error||!record(result.data)||!exact(result.data,['candidate','decision','privatePacket']))return {kind:'review_required' as const}
      const returned=parseFirstReviewedCandidateReview(result.data.candidate),decision=parseFirstReviewedDecisionReceipt(result.data.decision)
      const packet=result.data.privatePacket
      if(!returned||!same(returned,c)||!decision||decision.decision!=='approve'||decision.candidateId!==c.candidateId
        ||decision.designationId!==c.designationId||decision.designationVersion!==c.designationVersion||decision.reviewerId!==c.reviewerId
        ||decision.contentHash!==c.contentHash||decision.sourceHash!==c.sourceHash||!record(packet)||packet.userId!==owner
        ||packet.registrationId!==id||packet.schemaVersion!==2||!record(packet.source)||packet.source.contextHash!==c.sourceHash
        ||!record(packet.intent)||!same(packet.intent.reviewed_week,c.reviewPacket.week)||!record(packet.source.binding)
        ||!record(packet.source.binding.scope)||packet.source.binding.scope.programId!==c.programId
        ||packet.source.binding.scope.basePlanVersionId!==c.basePlanVersionId||!record(packet.inputSnapshot)
        ||!record(packet.inputSnapshot.reviewedWeekTransition)||packet.inputSnapshot.reviewedWeekTransition.kind!=='first_reviewed'
        ||!same(packet.sessions,c.reviewPacket.week.scheduledSessions.map((slot,index)=>({week_number:1,session_index:index+1,
          scheduled_date:slot.scheduledDate,prescription:slot.prescription})))||!options.enabled())return {kind:'unavailable' as const}
      return {kind:'approved_candidate' as const,candidate:c,decision,privatePacket:structuredClone(packet),numericRuntimeEligible:false as const}
    }catch{return {kind:'unavailable' as const}}
  }
  return {read,submit,decide,resolveApproved}
}
