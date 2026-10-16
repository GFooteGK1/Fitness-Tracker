import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveFirstReviewedRequest } from '@/app/lib/coach/first-reviewed-request-resolution-server'
import { parseFirstReviewedPending, parseFirstReviewedRequestResolution, type FirstReviewedPending } from '@/app/lib/coach/first-reviewed-request-resolution'

const user='00000000-0000-4000-8000-000000000001',program='00000000-0000-4000-8000-000000000010'
const candidate='00000000-0000-4000-8000-000000000020',other='00000000-0000-4000-8000-000000000003'
const request:FirstReviewedPending={schemaVersion:1,userId:user,programId:program,operation:'decide',body:{expectedUserId:user,
  candidateId:candidate,designationId:'00000000-0000-4000-8000-000000000021',requestId:'00000000-0000-4000-8000-000000000022',
  decision:'approve',contentHash:'a'.repeat(64),sourceHash:'b'.repeat(64)}}
const absent={schemaVersion:1,request,disposition:'not_found'}
function client(result:unknown=absent,actors=[user,user],error:unknown=null) {
  let index=0
  const getUser=vi.fn(async()=>({data:{user:{id:actors[Math.min(index++,actors.length-1)]}},error:null}))
  const rpc=vi.fn(async()=>({data:result,error}))
  return {db:{auth:{getUser},rpc} as unknown as SupabaseClient,getUser,rpc}
}
describe('first reviewed exact request recovery transport',()=>{
  it('binds acceptance to exact candidate, proposal, plan and approval hashes while allowing later active supersession',async()=>{
    const acceptance:FirstReviewedPending={schemaVersion:1,userId:user,programId:program,operation:'accept',body:{expectedUserId:user,programId:program,
      candidateId:candidate,proposalId:'00000000-0000-4000-8000-000000000040',planVersionId:'00000000-0000-4000-8000-000000000041',
      requestId:'original-acceptance-key',contentHash:'a'.repeat(64),sourceHash:'b'.repeat(64)}}
    expect(parseFirstReviewedPending(acceptance)).toEqual(acceptance)
    const saved={schemaVersion:1,request:acceptance,disposition:'saved',result:{proposalId:acceptance.body.proposalId,
      planVersionId:acceptance.body.planVersionId,activePlanVersionId:other}}
    expect(parseFirstReviewedRequestResolution(saved,acceptance)).toEqual(saved)
    for(const bad of [{...saved.result,proposalId:other},{...saved.result,planVersionId:other},
      {...saved.result,activePlanVersionId:null},{...saved.result,privatePacket:{}},{}]){
      expect(parseFirstReviewedRequestResolution({...saved,result:bad},acceptance)).toBeNull()
      const c=client({...saved,result:bad})
      expect(await resolveFirstReviewedRequest(c.db,acceptance,false)).toEqual({kind:'retry_required',request:acceptance})
      expect(c.rpc.mock.calls).toEqual([['get_first_review_request_resolution',{p_request:acceptance}]])
    }
    for(const bad of [{...acceptance.body,expectedUserId:other},{...acceptance.body,programId:other},
      {...acceptance.body,candidateId:['not-a-uuid']},{...acceptance.body,contentHash:null},
      {...acceptance.body,sourceHash:'A'.repeat(64)},{...acceptance.body,requestId:' key '},{...acceptance.body,extra:true}]){
      expect(parseFirstReviewedPending({...acceptance,body:bad})).toBeNull()
    }
    expect(parseFirstReviewedRequestResolution({...saved,request:{...acceptance,body:{...acceptance.body,sourceHash:'c'.repeat(64)}}},acceptance)).toBeNull()
  })
  it('uses only the getter for an absent receipt and does not infer cancellation or retry a writer',async()=>{
    const c=client()
    expect(await resolveFirstReviewedRequest(c.db,request,false)).toEqual({kind:'resolved',resolution:absent})
    expect(c.rpc.mock.calls).toEqual([['get_first_review_request_resolution',{p_request:request}]])
  })
  it.each([false,true])('fences an account switch after the final await (close=%s)',async close=>{
    const c=client(absent,[user,other])
    expect(await resolveFirstReviewedRequest(c.db,request,close)).toEqual({kind:'account_changed'})
    expect(c.rpc).toHaveBeenCalledTimes(1)
  })
  it('does not call SQL when the authenticated actor already differs',async()=>{
    const c=client(absent,[other])
    expect(await resolveFirstReviewedRequest(c.db,request,false)).toEqual({kind:'account_changed'})
    expect(c.rpc).not.toHaveBeenCalled()
  })
  it('retains an exact request after a conflict or transient error without automatic resend',async()=>{
    for(const [code,kind] of [['22023','request_conflict'],['55P03','retry_required']]) {
      const c=client(null,[user,user],{code})
      expect(await resolveFirstReviewedRequest(c.db,request,true)).toEqual({kind,request})
      expect(c.rpc).toHaveBeenCalledTimes(1)
    }
  })
  it('does not certify an echoed envelope with incomplete or unrelated saved results',async()=>{
    const result={candidateId:candidate,decisionId:'00000000-0000-4000-8000-000000000030',requestId:request.body.requestId,
      decision:'approve',reviewerId:user,designationId:request.body.designationId,designationVersion:1,
      contentHash:request.body.contentHash,sourceHash:request.body.sourceHash,decidedAt:'2026-10-05T15:00:00Z',replayed:true}
    const saved={schemaVersion:1,request,disposition:'saved',result}
    expect(parseFirstReviewedRequestResolution(saved,request)).toEqual(saved)
    for(const bad of [{}, {...result,requestId:other}, {...result,reviewerId:other}, {...result,replayed:false},
      {...result,privatePacket:{}}, {...result,contentHash:'c'.repeat(64)}]) {
      expect(parseFirstReviewedRequestResolution({...saved,result:bad},request)).toBeNull()
      const c=client({...saved,result:bad})
      expect(await resolveFirstReviewedRequest(c.db,request,false)).toEqual({kind:'retry_required',request})
    }
  })
  it('rejects unknown envelope fields, coercible decisions and changed cancellation echoes',()=>{
    expect(parseFirstReviewedPending({...request,extra:true})).toBeNull()
    expect(parseFirstReviewedPending({...request,body:{...request.body,decision:['approve']}})).toBeNull()
    expect(parseFirstReviewedRequestResolution({schemaVersion:1,request:{...request,userId:other},disposition:'no_write',
      resolutionId:other,resolvedAt:'2026-10-05T15:00:00Z'},request)).toBeNull()
  })
})
