import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { firstProfileUuid as uuid } from './first-reviewed-profile-contract'
import { readFirstReviewedSetup } from './first-reviewed-setup-reader'

const reply=(body:object,status:number)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
export function createFirstReviewedSetupHttp(options:{createUserClient:()=>Promise<SupabaseClient>;enabled:()=>boolean}){
  return {read:async(request:Request,programId:string)=>{
    try{
      const db=await options.createUserClient(),before=await db.auth.getUser(),actor=before.data.user?.id
      if(before.error||!uuid(actor))return reply({kind:'unauthenticated'},401)
      const params=new URL(request.url).searchParams
      if(!uuid(programId)||[...params.keys()].some(k=>!['historyDays','tzOffset'].includes(k)||params.getAll(k).length!==1)
        ||!params.has('tzOffset')||!/^(-?[1-9][0-9]*|0)$/.test(params.get('tzOffset')!)
        ||(params.has('historyDays')&&!/^[1-9][0-9]*$/.test(params.get('historyDays')!)))return reply({kind:'invalid_request'},400)
      const r=await readFirstReviewedSetup(db,{expectedUserId:actor,programId,historyDays:Number(params.get('historyDays')??90),tzOffset:Number(params.get('tzOffset'))})
      const after=await db.auth.getUser()
      if(after.error||after.data.user?.id!==actor)return reply({kind:'account_changed'},409)
      const status=r.kind==='setup'?200:r.kind==='invalid_request'?400:r.kind==='not_found'?404
        :['setup_required','review_required','account_changed'].includes(r.kind)?409:503
      return reply({...r,...(r.kind==='setup'?{writesEnabled:options.enabled(),numericRuntimeEligible:false}:{})},status)
    }catch{return reply({kind:'unavailable'},503)}
  }}
}
