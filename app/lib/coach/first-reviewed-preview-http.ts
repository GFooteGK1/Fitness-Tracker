import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { firstProfileUuid } from './first-reviewed-profile-contract'
import { parseFirstReviewedDraft } from './first-reviewed-contract'
import { prepareFirstReviewedCandidate } from './first-reviewed-candidate-server'
import { doseContentHash } from './initial-dose-policy'
const reply=(body:object,status:number)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
export function createFirstReviewedPreviewHttp(options:{createUserClient:()=>Promise<SupabaseClient>;enabled:()=>boolean}){
  return {preview:async(request:Request)=>{
    try{
      const db=await options.createUserClient(),user=await db.auth.getUser(),actor=user.data.user?.id
      if(user.error||!firstProfileUuid(actor))return reply({kind:'unauthenticated'},401)
      const text=await request.text();if(new TextEncoder().encode(text).length>600000)return reply({kind:'invalid_request'},413)
      let raw:unknown;try{raw=JSON.parse(text)}catch{return reply({kind:'invalid_request'},400)}
      if(!raw||typeof raw!=='object'||Array.isArray(raw))return reply({kind:'invalid_request'},400)
      const input=raw as Record<string,unknown>,draft=parseFirstReviewedDraft(input.draft)
      if(Object.keys(input).sort().join(',')!=='draft,expectedUserId'||!draft)return reply({kind:'invalid_request'},400)
      if(input.expectedUserId!==actor)return reply({kind:'account_changed'},409)
      if(!options.enabled())return reply({kind:'disabled'},409)
      const result=await prepareFirstReviewedCandidate(db,draft),after=await db.auth.getUser()
      if(after.error||after.data.user?.id!==actor)return reply({kind:'account_changed'},409)
      if(!options.enabled())return reply({kind:'disabled'},409)
      if(result.kind!=='prepared_first_candidate')return reply({kind:'needs_review',error:'This draft could not be compiled against current confirmed context. Review context and the complete prescription.'},409)
      if(result.privatePacket.userId!==actor)return reply({kind:'not_found'},404)
      return reply({kind:'preview',candidateId:draft.candidateId,programId:draft.programId,draftHash:doseContentHash(draft),reviewPacket:result.reviewPacket},200)
    }catch{return reply({kind:'unavailable'},503)}
  }}
}
