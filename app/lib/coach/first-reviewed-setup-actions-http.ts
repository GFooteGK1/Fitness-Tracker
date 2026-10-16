import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { firstProfileUuid as uuid } from './first-reviewed-profile-contract'
import { parseFirstReviewSetupEditorSeed,parseFirstReviewSetupRequest,parseFirstReviewSetupResolution } from './first-reviewed-setup-request'
const reply=(body:object,status:number)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
export function createFirstReviewSetupActionsHttp(options:{createUserClient:()=>Promise<SupabaseClient>;enabled:()=>boolean}){
  const action=async(request:Request,mode:'save'|'read'|'close')=>{
    try{
      const db=await options.createUserClient(),auth=await db.auth.getUser(),actor=auth.data.user?.id
      if(auth.error||!uuid(actor))return reply({kind:'unauthenticated'},401)
      const text=await request.text();if(new TextEncoder().encode(text).length>100000)return reply({kind:'invalid_request'},413)
      let raw:unknown;try{raw=JSON.parse(text)}catch{return reply({kind:'invalid_request'},400)}
      const q=parseFirstReviewSetupRequest(raw);if(!q)return reply({kind:'invalid_request'},400)
      if(q.expectedUserId!==actor)return reply({kind:'account_changed'},409)
      if(mode==='save'&&!options.enabled())return reply({kind:'disabled'},409)
      const result=await db.rpc(mode==='save'?'save_first_review_setup':'resolve_first_review_setup_request',
        mode==='save'?{p_request:q}:{p_request:q,p_close:mode==='close'})
      const after=await db.auth.getUser()
      if(after.error||after.data.user?.id!==actor)return reply({kind:'account_changed'},409)
      if(result.error)return reply({kind:['22023','40001','55000','55P03'].includes(result.error.code??'')?'review_required':'unavailable'},
        ['22023','40001','55000','55P03'].includes(result.error.code??'')?409:503)
      if(result.data===null)return reply({kind:'not_found'},404)
      const resolution=parseFirstReviewSetupResolution(result.data,q)
      return resolution?reply({kind:'resolved',resolution},200):reply({kind:'unavailable'},503)
    }catch{return reply({kind:'unavailable'},503)}
  }
  return {save:(r:Request)=>action(r,'save'),resolve:(r:Request)=>action(r,'read'),close:(r:Request)=>action(r,'close'),
    read:async(request:Request,programId:string)=>{
      try{
        const db=await options.createUserClient(),auth=await db.auth.getUser(),actor=auth.data.user?.id
        if(auth.error||!uuid(actor))return reply({kind:'unauthenticated'},401)
        if(!uuid(programId)||new URL(request.url).searchParams.size!==0)return reply({kind:'invalid_request'},400)
        const result=await db.rpc('read_first_review_setup_editor',{p_program_id:programId}),after=await db.auth.getUser()
        if(after.error||after.data.user?.id!==actor)return reply({kind:'account_changed'},409)
        if(result.error)return reply({kind:'unavailable'},503)
        if(result.data===null)return reply({kind:'not_found'},404)
        const seed=parseFirstReviewSetupEditorSeed(result.data,actor,programId)
        return seed?reply({kind:'setup_editor',seed,writesEnabled:options.enabled()},200):reply({kind:'unavailable'},503)
      }catch{return reply({kind:'unavailable'},503)}
    }}
}
