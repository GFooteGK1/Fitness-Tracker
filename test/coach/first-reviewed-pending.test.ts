import { webcrypto } from 'node:crypto'
import { beforeAll,describe,expect,it,vi } from 'vitest'
import { firstReviewedBrowserHash,readFirstReviewedPending,saveFirstReviewedPending,listFirstReviewedPendingPrograms,performFirstReviewedPending,runFirstReviewedBrowserAction } from '@/app/lib/coach/first-reviewed-pending'
import type { FirstReviewedPending } from '@/app/lib/coach/first-reviewed-request-resolution'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { effortWorkInput } from '../fixtures/reviewed-effort-work'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
function fixture(operation:FirstReviewedPending['operation']='decide'){
  const userId=id(1),programId=id(2),candidateId=id(3),designationId=id(4),requestId=id(5),basePlanVersionId=id(6)
  const profile={...reviewedRollingWeek().plan.profileSnapshot,startDate:'2026-10-05'},recipe=effortWorkInput().registry[0].recipe
  const root={schemaVersion:1 as const,userId,programId},expectedUserId=userId
  const hashes={contentHash:'a'.repeat(64),sourceHash:'b'.repeat(64)},snapshotId=id(7)
  const pending:FirstReviewedPending=operation==='prepare_profile'?{...root,operation,body:{expectedUserId,request:{snapshotId,designationId,programId,
    basePlanVersionId,historyDays:90,tzOffset:300,windowStart:profile.startDate,targetSetup:profile}}}
    :operation==='confirm_profile'?{...root,operation,body:{expectedUserId,snapshotId,requestId,...hashes,profileHash:'c'.repeat(64)}}
      :operation==='submit'?{...root,operation,body:{expectedUserId,draft:{candidateId,designationId,programId,basePlanVersionId,
        profileSnapshotId:snapshotId,profileConfirmationRequestId:requestId,historyDays:90,tzOffset:300,windowStart:profile.startDate,sequenceNumber:2,
        confirmedTargetProfile:profile,confirmedTargetProfileHash:'c'.repeat(64),recipe:{sessions:recipe.sessions,baseSchedule:recipe.baseSchedule,
          schedules:recipe.schedules,protocols:recipe.protocols,instructions:recipe.instructions,limitations:recipe.limitations},scheduleId:recipe.schedules[0].id,rationale:'Synthetic draft.'}}}
        :operation==='decide'?{...root,operation,body:{expectedUserId,candidateId,designationId,requestId,decision:'approve',...hashes}}
          :operation==='issue'?{...root,operation,body:{expectedUserId,programId,candidateId,requestId}}
            :{...root,operation,body:{expectedUserId,programId,candidateId,requestId,proposalId:id(8),planVersionId:id(9),...hashes}}
  const records=new Map<string,string>(),store={getItem:(k:string)=>records.get(k)??null,setItem:(k:string,v:string)=>{records.set(k,v)},
    removeItem:(k:string)=>{records.delete(k)},get length(){return records.size},key:(n:number)=>[...records.keys()][n]??null}
  saveFirstReviewedPending(store,pending)
  const noWrite={schemaVersion:1,request:pending,disposition:'no_write',resolutionId:id(10),resolvedAt:'2026-10-05T15:00:00Z'}
  const saved={schemaVersion:1,request:pending,disposition:'saved',result:operation==='decide'?{candidateId,designationId,requestId,decision:'approve',
    reviewerId:userId,decisionId:id(11),designationVersion:1,...hashes,decidedAt:'2026-10-05T15:00:00Z',replayed:true}
    :operation==='confirm_profile'?{userId,snapshotId,requestId,...hashes,profileHash:'c'.repeat(64),confirmedAt:'2026-10-05T15:00:00Z'}
      :{proposalId:id(8),planVersionId:id(9),activePlanVersionId:id(9)}}
  return {pending,userId,programId,records,store,noWrite,saved}
}
beforeAll(()=>{vi.stubGlobal('crypto',webcrypto)})
function exclusiveLocks(){
  let held=false
  const request=vi.fn(async(name:string,options:LockOptions,callback:(lock:Lock|null)=>Promise<unknown>)=>{
    expect(options).toEqual({mode:'exclusive',ifAvailable:true})
    if(held)return callback(null)
    held=true;try{return await callback({name,mode:'exclusive'} as Lock)}finally{held=false}
  })
  return {locks:{request} as unknown as Pick<LockManager,'request'>,request}
}
describe('first reviewed browser pending requests',()=>{
  it('serializes reservation through archive/removal and rejects a second tab without overwriting',async()=>{
    const h=fixture(),{locks,request}=exclusiveLocks()
    h.store.removeItem(`first-reviewed-pending:${h.userId}:${h.programId}`)
    let release!:()=>void;const writer=new Promise<void>(r=>{release=r})
    const fetcher=vi.fn(async(url:string|URL|Request)=>{
      if(!url.toString().endsWith('/resolution'))await writer
      return Response.json({kind:'resolved',resolution:h.saved})
    })
    const first=runFirstReviewedBrowserAction(h.store,h.pending,()=>h.userId,'send',fetcher,locks)
    expect(readFirstReviewedPending(h.store,h.userId,h.programId)).toEqual(h.pending)
    const different={...h.pending,body:{...h.pending.body,requestId:id(99)}} as FirstReviewedPending
    await expect(runFirstReviewedBrowserAction(h.store,different,()=>h.userId,'send',fetcher,locks)).rejects.toThrow('Another tab')
    expect(readFirstReviewedPending(h.store,h.userId,h.programId)).toEqual(h.pending)
    expect(fetcher).toHaveBeenCalledTimes(1)
    release();expect((await first).disposition).toBe('saved')
    expect(readFirstReviewedPending(h.store,h.userId,h.programId)).toBeNull()
    expect(request.mock.calls.map(c=>c[0])).toEqual(Array(2).fill(`first-reviewed-request:${h.userId}:${h.programId}`))
  })
  it('never resends a retained request through the UI wrapper and recovers it under the same lock',async()=>{
    const h=fixture(),{locks}=exclusiveLocks(),fetcher=vi.fn(async()=>Response.json({kind:'resolved',resolution:h.saved}))
    await expect(runFirstReviewedBrowserAction(h.store,h.pending,()=>h.userId,'send',fetcher,locks)).rejects.toThrow('previous request')
    expect(fetcher).not.toHaveBeenCalled()
    expect((await runFirstReviewedBrowserAction(h.store,h.pending,()=>h.userId,'recover',fetcher,locks)).disposition).toBe('saved')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('retains requests without transmission when coordination or original account is unavailable',async()=>{
    const h=fixture(),{locks}=exclusiveLocks(),fetcher=vi.fn(async()=>Response.json({}))
    await expect(runFirstReviewedBrowserAction(h.store,h.pending,()=>id(99),'recover',fetcher,locks)).rejects.toThrow('original account')
    await expect(runFirstReviewedBrowserAction(h.store,h.pending,()=>h.userId,'recover',fetcher,null)).rejects.toThrow('coordination')
    expect(fetcher).not.toHaveBeenCalled();expect(readFirstReviewedPending(h.store,h.userId,h.programId)).toEqual(h.pending)
  })
  it.each(['prepare_profile','confirm_profile','submit','decide','issue','accept'] as const)('retains exact %s across reload and confirms closure without a resend',async op=>{
    const h=fixture(op),fetcher=vi.fn(async(_url:string|URL|Request,_init?:RequestInit)=>Response.json({kind:'resolved',resolution:h.noWrite}))
    expect(readFirstReviewedPending(h.store,h.userId,h.programId)).toEqual(h.pending)
    const r=await performFirstReviewedPending(h.store,h.pending,()=>h.userId,'recover',fetcher)
    expect(r.disposition).toBe('no_write');expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toBe('/api/coach/first-reviewed/resolution')
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual(h.pending)
    expect(readFirstReviewedPending(h.store,h.userId,h.programId)).toBeNull()
    expect([...h.records.keys()].some(k=>k.startsWith(`first-reviewed-receipt:${h.userId}:${h.programId}:${op}:`))).toBe(true)
  })
  it.each(['confirm_profile','decide','issue','accept'] as const)('archives saved %s only after pure original-envelope readback',async op=>{
    const h=fixture(op),fetcher=vi.fn(async(url:string|URL|Request)=>Response.json(url.toString().endsWith('/resolution')?{kind:'resolved',resolution:h.saved}:{kind:'ignored_writer_payload'}))
    expect((await performFirstReviewedPending(h.store,h.pending,()=>h.userId,'send',fetcher)).disposition).toBe('saved')
    expect(fetcher.mock.calls.map(c=>c[0])).toEqual(['/api/coach/first-reviewed','/api/coach/first-reviewed/resolution'])
    expect(readFirstReviewedPending(h.store,h.userId,h.programId)).toBeNull()
  })
  it('explicit closure also requires getter proof rather than trusting its response',async()=>{
    const h=fixture(),fetcher=vi.fn(async(url:string|URL|Request)=>Response.json(url.toString().endsWith('/resolution')?{kind:'resolved',resolution:h.noWrite}:{kind:'resolved',resolution:{}}))
    expect((await performFirstReviewedPending(h.store,h.pending,()=>h.userId,'close',fetcher)).disposition).toBe('no_write')
    expect(fetcher.mock.calls.map(c=>c[0])).toEqual(['/api/coach/first-reviewed/resolve','/api/coach/first-reviewed/resolution'])
  })
  it('never sends a replacement request or treats absence as cancellation',async()=>{
    const h=fixture(),fetcher=vi.fn(async()=>Response.json({kind:'resolved',resolution:{schemaVersion:1,request:h.pending,disposition:'not_found'}}))
    await expect(performFirstReviewedPending(h.store,h.pending,()=>h.userId,'recover',fetcher)).rejects.toThrow('unconfirmed')
    expect(fetcher).toHaveBeenCalledTimes(1);expect(readFirstReviewedPending(h.store,h.userId,h.programId)).toEqual(h.pending)
    expect(()=>saveFirstReviewedPending(h.store,{...h.pending,operation:'issue',body:{expectedUserId:h.userId,programId:h.programId,candidateId:id(3),requestId:id(99)}})).toThrow('previous request')
  })
  it('preserves lost execute/closure/getter responses and performs only a getter on recovery',async()=>{
    for(const mode of ['send','close','recover'] as const){
      const h=fixture(),fetcher=vi.fn(async()=>{throw Error('lost response')})
      await expect(performFirstReviewedPending(h.store,h.pending,()=>h.userId,mode,fetcher)).rejects.toThrow('lost response')
      expect(fetcher).toHaveBeenCalledTimes(1);expect(readFirstReviewedPending(h.store,h.userId,h.programId)).toEqual(h.pending)
      const getter=vi.fn(async(_url:string|URL|Request)=>Response.json({kind:'resolved',resolution:h.saved}))
      await performFirstReviewedPending(h.store,h.pending,()=>h.userId,'recover',getter)
      expect(getter.mock.calls[0][0]).toBe('/api/coach/first-reviewed/resolution')
    }
  })
  it('isolates accounts and lists revoked recovery scope from preserved local state',()=>{
    const h=fixture();expect(listFirstReviewedPendingPrograms(h.store,h.userId)).toEqual([h.programId])
    expect(listFirstReviewedPendingPrograms(h.store,id(99))).toEqual([])
    expect(readFirstReviewedPending(h.store,id(99),h.programId)).toBeNull()
    h.records.set(`first-reviewed-pending:${h.userId}:${id(98)}`,'broken')
    expect(listFirstReviewedPendingPrograms(h.store,h.userId)).toEqual([h.programId,id(98)].sort())
    expect(()=>readFirstReviewedPending(h.store,h.userId,id(98))).toThrow('preserved')
  })
  it('fences account and pending changes after every awaited read without removing user work',async()=>{
    const h=fixture();let actor=h.userId
    const fetcher=vi.fn(async()=>{actor=id(99);return Response.json({kind:'resolved',resolution:h.saved})})
    await expect(performFirstReviewedPending(h.store,h.pending,()=>actor,'recover',fetcher)).rejects.toThrow('original account')
    expect(readFirstReviewedPending(h.store,h.userId,h.programId)).toEqual(h.pending)
    actor=h.userId
    await expect(performFirstReviewedPending(h.store,h.pending,()=>actor,'recover',async()=>{
      h.records.set(`first-reviewed-pending:${h.userId}:${h.programId}`,JSON.stringify({...h.pending,body:{...h.pending.body,requestId:id(99)}}))
      return Response.json({kind:'resolved',resolution:h.saved})
    })).rejects.toThrow('changed')
    expect(h.store.getItem(`first-reviewed-pending:${h.userId}:${h.programId}`)).not.toBeNull()
  })
  it.each(['wrong_request','wrong_receipt','extra','http_error','invalid_json'])('preserves %s recovery result',async failure=>{
    const h=fixture(),r=structuredClone(h.saved)
    if(failure==='wrong_request')r.request={...h.pending,programId:id(99)}
    if(failure==='wrong_receipt')Object.assign(r.result,{sourceHash:'c'.repeat(64)})
    if(failure==='extra')Object.assign(r,{privatePacket:{}})
    const response=failure==='http_error'?Response.json({kind:'resolved',resolution:r},{status:503})
      :failure==='invalid_json'?new Response('broken'):Response.json({kind:'resolved',resolution:r})
    await expect(performFirstReviewedPending(h.store,h.pending,()=>h.userId,'recover',async()=>response)).rejects.toThrow()
    expect(readFirstReviewedPending(h.store,h.userId,h.programId)).toEqual(h.pending)
  })
  it('preserves state when archive write or pending removal fails, allowing same proof readback',async()=>{
    const h=fixture(),set=h.store.setItem,remove=h.store.removeItem,getter=async()=>Response.json({kind:'resolved',resolution:h.saved})
    h.store.setItem=()=>{throw Error('quota')}
    await expect(performFirstReviewedPending(h.store,h.pending,()=>h.userId,'recover',getter)).rejects.toThrow('quota')
    expect(readFirstReviewedPending(h.store,h.userId,h.programId)).toEqual(h.pending)
    h.store.setItem=set;h.store.removeItem=()=>{}
    await expect(performFirstReviewedPending(h.store,h.pending,()=>h.userId,'recover',getter)).rejects.toThrow('local pending')
    h.store.removeItem=remove;await performFirstReviewedPending(h.store,h.pending,()=>h.userId,'recover',getter)
    expect(readFirstReviewedPending(h.store,h.userId,h.programId)).toBeNull()
  })
  it('retains historical first receipt when later active plan changes',async()=>{
    const h=fixture('accept');h.store.removeItem=()=>{}
    await expect(performFirstReviewedPending(h.store,h.pending,()=>h.userId,'recover',async()=>Response.json({kind:'resolved',resolution:h.saved}))).rejects.toThrow('local pending')
    const old=[...h.records.entries()].find(([k])=>k.startsWith('first-reviewed-receipt:'))!
    const later={...h.saved,result:{...h.saved.result,activePlanVersionId:id(99)}}
    h.store.removeItem=k=>{h.records.delete(k)}
    await performFirstReviewedPending(h.store,h.pending,()=>h.userId,'recover',async()=>Response.json({kind:'resolved',resolution:later}))
    expect(h.store.getItem(old[0])).toBe(old[1])
  })
  it('does not send if pending preservation fails and hashes canonical structured content',async()=>{
    const h=fixture();h.store.setItem=()=>{}
    h.store.removeItem(`first-reviewed-pending:${h.userId}:${h.programId}`)
    expect(()=>saveFirstReviewedPending(h.store,h.pending)).toThrow('Nothing was sent')
    expect(await firstReviewedBrowserHash({b:2,a:1})).toBe(await firstReviewedBrowserHash({a:1,b:2}))
  })
})
