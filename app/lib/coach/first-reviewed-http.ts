/** Authenticated first-week HTTP boundary. Private approved source packets stay server-only. */
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { createFirstReviewedProfileService } from './first-reviewed-profile-service'
import type { createFirstReviewedReviewService } from './first-reviewed-review-service'
import type { createFirstReviewedLifecycleService } from './first-reviewed-lifecycle-service'
import { parseFirstReviewedCandidateReview,parseFirstReviewedDecisionReceipt } from './first-reviewed-contract'
import { parseFirstReviewedProfileReceipt,firstProfileUuid } from './first-reviewed-profile-contract'
import { validateFirstReviewedProfileSnapshot } from './first-reviewed-profile-validation'
import { parseFirstReviewedPending,parseFirstReviewedRequestResolution,type FirstReviewedPending } from './first-reviewed-request-resolution'
import { doseContentHash } from './initial-dose-policy'

const reply=(body:object,status:number)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
const retry=()=>reply({kind:'retry_required',error:'The result is unconfirmed. Keep the original request for recovery.'},503)

function publicResult(value:{kind:string},pending?:FirstReviewedPending,readScope?:{kind:'candidate'|'snapshot';id:string;userId:string}){
  const result=value as unknown as Record<string,unknown>,visible:Record<string,unknown>={kind:value.kind}
  const required=value.kind==='candidate'?['candidate']:value.kind==='snapshot'?['snapshot']
    :value.kind==='saved'?pending?.operation==='submit'?['candidate']:pending?.operation==='prepare_profile'?['snapshot']:null
      :['confirmed','decided','accepted','recovered'].includes(value.kind)?['receipt']
        :value.kind==='issued'?['proposalId','planVersionId','programId']
          :['resolved','no_write'].includes(value.kind)?['resolution']:[]
  if(required===null||required.some(key=>!Object.hasOwn(result,key)))return retry()
  if(pending)visible.request=pending
  if(Object.hasOwn(result,'candidate')){
    const c=parseFirstReviewedCandidateReview(result.candidate);if(!c)return retry()
    if(readScope&&(readScope.kind!=='candidate'||c.candidateId!==readScope.id||![c.userId,c.reviewerId].includes(readScope.userId)))return retry()
    if(pending&&(pending.operation!=='submit'||c.candidateId!==pending.body.draft.candidateId||c.designationId!==pending.body.draft.designationId
      ||c.basePlanVersionId!==pending.body.draft.basePlanVersionId||c.programId!==pending.programId||c.userId!==pending.userId))return retry()
    visible.candidate=c
  }
  if(Object.hasOwn(result,'snapshot')){
    const s=validateFirstReviewedProfileSnapshot(result.snapshot);if(!s)return retry()
    if(readScope&&(readScope.kind!=='snapshot'||s.snapshotId!==readScope.id||s.userId!==readScope.userId))return retry()
    if(pending&&(pending.operation!=='prepare_profile'||s.userId!==pending.userId||s.programId!==pending.programId
      ||s.snapshotId!==pending.body.request.snapshotId||s.designationId!==pending.body.request.designationId
      ||s.basePlanVersionId!==pending.body.request.basePlanVersionId||s.requestHash!==doseContentHash(pending.body.request)))return retry()
    visible.snapshot=s
  }
  if(Object.hasOwn(result,'receipt')){
    const receipt=value.kind==='confirmed'?parseFirstReviewedProfileReceipt(result.receipt)
      :value.kind==='decided'?parseFirstReviewedDecisionReceipt(result.receipt)
        :pending?parseFirstReviewedRequestResolution({schemaVersion:1,request:pending,disposition:'saved',result:result.receipt},pending):null
    if(!receipt)return retry()
    if(value.kind==='confirmed'){
      if(!pending||pending.operation!=='confirm_profile'||!parseFirstReviewedRequestResolution({schemaVersion:1,request:pending,disposition:'saved',result:receipt},pending))return retry()
    }else if(value.kind==='decided'){
      if(!pending||pending.operation!=='decide'||!parseFirstReviewedRequestResolution({schemaVersion:1,request:pending,disposition:'saved',
        result:{...receipt,replayed:true}},pending))return retry()
    }
    visible.receipt='disposition' in receipt&&receipt.disposition==='saved'?receipt.result:receipt
  }
  if(Object.hasOwn(result,'resolution')){
    const resolution=pending&&parseFirstReviewedRequestResolution(result.resolution,pending)
    if(!resolution)return retry();visible.resolution=resolution
  }
  if(Object.hasOwn(result,'replayed')){
    if(typeof result.replayed!=='boolean')return retry();visible.replayed=result.replayed
  }
  for(const key of ['proposalId','planVersionId','programId'])if(Object.hasOwn(result,key)){
    if(!firstProfileUuid(result[key])||(key==='programId'&&pending&&result[key]!==pending.programId))return retry()
    visible[key]=result[key]
  }
  if(Array.isArray(result.reasons)&&result.reasons.every(x=>typeof x==='string'&&x.length<=4000)&&result.reasons.length<=64)visible.reasons=result.reasons
  const status=['snapshot','candidate','saved','confirmed','decided','issued','accepted','recovered','resolved'].includes(value.kind)?200
    :value.kind==='invalid_request'?400:value.kind==='unauthenticated'?401:value.kind==='not_found'?404
      :['retry_required','unavailable','unresolved'].includes(value.kind)?503:409
  if(status===200)visible.numericRuntimeEligible=false
  return reply(visible,status)
}

export function createFirstReviewedHttp(options:{createUserClient:()=>Promise<SupabaseClient>;
  profiles:Pick<ReturnType<typeof createFirstReviewedProfileService>,'read'|'prepare'|'confirm'>;
  review:Pick<ReturnType<typeof createFirstReviewedReviewService>,'read'|'submit'|'decide'>;
  life:Pick<ReturnType<typeof createFirstReviewedLifecycleService>,'issue'|'accept'|'recover'|'close'>}){
  const authenticate=async()=>{
    const db=await options.createUserClient(),a=await db.auth.getUser()
    return !a.error&&firstProfileUuid(a.data.user?.id)?{db,userId:a.data.user!.id}:null
  }
  const sameActor=async(db:SupabaseClient,userId:string)=>{const a=await db.auth.getUser();return !a.error&&a.data.user?.id===userId}
  const confirm=async(db:SupabaseClient,pending:FirstReviewedPending & {operation:'confirm_profile'})=>{
    // The confirmation body contains no program ID. Resolve the full immutable
    // envelope first so a different outer program cannot acquire a receipt.
    const found=await options.life.recover(db,pending)
    if(found.kind!=='resolved')return found
    if(found.resolution.disposition==='saved')return {kind:'confirmed' as const,receipt:found.resolution.result}
    if(found.resolution.disposition==='no_write')return {kind:'no_write' as const,resolution:found.resolution}
    return options.profiles.confirm(db,pending.body)
  }
  const act=(mode:'execute'|'resolution'|'resolve')=>async(request:Request)=>{
    try{
      const session=await authenticate();if(!session)return reply({kind:'unauthenticated'},401)
      const text=await request.text()
      if(new TextEncoder().encode(text).length>600000)return reply({kind:'invalid_request',error:'Request is too large.'},413)
      let input:unknown;try{input=JSON.parse(text)}catch{return reply({kind:'invalid_request'},400)}
      const pending=parseFirstReviewedPending(input)
      if(!pending)return reply({kind:'invalid_request'},400)
      if(pending.userId!==session.userId||!await sameActor(session.db,session.userId))return reply({kind:'account_changed'},409)
      // Historical recovery is available while fresh writes are disabled. Each
      // server service and protected SQL writer enforces its own fresh authority.
      const result=mode==='resolution'?await options.life.recover(session.db,pending)
        :mode==='resolve'?await options.life.close(session.db,pending)
          :pending.operation==='prepare_profile'?await options.profiles.prepare(session.db,session.userId,pending.body.request)
            :pending.operation==='confirm_profile'?await confirm(session.db,pending)
              :pending.operation==='submit'?await options.review.submit(session.db,pending)
                :pending.operation==='decide'?await options.review.decide(session.db,pending)
                  :pending.operation==='issue'?await options.life.issue(session.db,pending)
                    :await options.life.accept(session.db,pending)
      if(!await sameActor(session.db,session.userId))return reply({kind:'account_changed'},409)
      return publicResult(result,pending)
    }catch{return retry()}
  }
  const read=(kind:'candidate'|'snapshot')=>async(id:string)=>{
    try{
      const session=await authenticate();if(!session)return reply({kind:'unauthenticated'},401)
      if(!firstProfileUuid(id))return reply({kind:'invalid_request'},400)
      const result=kind==='candidate'?await options.review.read(session.db,id):await options.profiles.read(session.db,id)
      if(!await sameActor(session.db,session.userId))return reply({kind:'account_changed'},409)
      return publicResult(result,undefined,{kind,id,userId:session.userId})
    }catch{return retry()}
  }
  return {execute:act('execute'),resolution:act('resolution'),resolve:act('resolve'),readCandidate:read('candidate'),readSnapshot:read('snapshot')}
}
