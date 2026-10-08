import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { firstProfileUuid as uuid } from './first-reviewed-profile-contract'
import { firstReviewCursorKey,type FirstReviewDiscoveryKind } from './first-reviewed-workspace-contract'
import { readFirstReviewWorkspace } from './first-reviewed-workspace-reader'

const reply=(body:object,status:number)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
export function createFirstReviewWorkspaceHttp(options:{createUserClient:()=>Promise<SupabaseClient>;enabled:()=>boolean}){
  const discover=async(request:Request,kind:FirstReviewDiscoveryKind,programId?:string)=>{
    try{
      const db=await options.createUserClient(),before=await db.auth.getUser(),actor=before.data.user?.id
      if(before.error||!uuid(actor))return reply({kind:'unauthenticated'},401)
      const params=new URL(request.url).searchParams,key=firstReviewCursorKey(kind)
      if([...params.keys()].some(k=>![key,'limit'].includes(k)||params.getAll(k).length!==1)
        ||(params.has('limit')&&!/^[1-9][0-9]?$/.test(params.get('limit')!))
        ||(kind!=='programs'&&!uuid(programId)))return reply({kind:'invalid_request'},400)
      const r=await readFirstReviewWorkspace(db,{expectedUserId:actor,[key]:params.get(key),
        ...(params.has('limit')?{limit:Number(params.get('limit'))}:{}),...(kind==='programs'?{}:{programId})},kind)
      const after=await db.auth.getUser()
      if(after.error||after.data.user?.id!==actor)return reply({kind:'account_changed'},409)
      const status=['programs','workspace','snapshots'].includes(r.kind)?200:r.kind==='invalid_request'?400
        :r.kind==='not_found'?404:r.kind==='account_changed'?409:503
      return reply({...r,...(status===200?{writesEnabled:options.enabled(),numericRuntimeEligible:false}:{})},status)
    }catch{return reply({kind:'unavailable'},503)}
  }
  return {listPrograms:(request:Request)=>discover(request,'programs'),readProgram:(request:Request,id:string)=>discover(request,'workspace',id),
    listSnapshots:(request:Request,id:string)=>discover(request,'snapshots',id)}
}
