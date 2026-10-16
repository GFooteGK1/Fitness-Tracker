import { describe,expect,it,vi } from 'vitest'
import { readFirstReviewSetupPending,listFirstReviewSetupPendingPrograms,runFirstReviewSetupBrowserAction } from '@/app/lib/coach/first-reviewed-setup-pending'
import { runFirstReviewedBrowserAction } from '@/app/lib/coach/first-reviewed-pending'
import type { FirstReviewedPending } from '@/app/lib/coach/first-reviewed-request-resolution'
import { firstReviewSetupRequest,firstReviewSetupSaved } from '../fixtures/first-reviewed-setup-request'

function fixture(){
  const q=firstReviewSetupRequest(),values=new Map<string,string>(),store={getItem:(k:string)=>values.get(k)??null,
    setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)},get length(){return values.size},key:(i:number)=>[...values.keys()][i]??null}
  const locks={request:async(name:string,_opts:LockOptions,run:(lock:Lock)=>Promise<unknown>)=>run({name,mode:'exclusive'} as Lock)} as Pick<LockManager,'request'>
  const key=`first-reviewed-setup-pending:${q.expectedUserId}:${q.programId}`,archive=`first-reviewed-setup-receipt:${q.expectedUserId}:${q.programId}:${q.requestId}`
  const saved=firstReviewSetupSaved(q),current=()=>q.expectedUserId
  const send=(mode:'send'|'recover'|'close',fetcher:typeof fetch)=>runFirstReviewSetupBrowserAction(store,q,current,mode,fetcher,locks)
  return {q,values,store,locks,key,archive,saved,current,send}
}
describe('first-review setup original-request recovery (controlled locks, not native tabs)',()=>{
  it('preserves before sending, verifies the original getter, then archives before removal',async()=>{
    const f=fixture(),paths:string[]=[]
    const fetcher=vi.fn(async(url:string|URL|Request,init?:RequestInit)=>{
      paths.push(String(url));expect(JSON.parse(String(init?.body))).toEqual(f.q);expect(readFirstReviewSetupPending(f.store,f.q.expectedUserId,f.q.programId)).toEqual(f.q)
      return Response.json({kind:'resolved',resolution:f.saved})
    })
    expect(await f.send('send',fetcher)).toEqual(f.saved)
    expect(paths).toEqual(['/api/coach/first-reviewed/setup','/api/coach/first-reviewed/setup/resolution'])
    expect(JSON.parse(f.values.get(f.archive)!)).toEqual(f.saved);expect(f.values.has(f.key)).toBe(false)
  })
  it('recovers a committed lost response without resending and retains unequal time and equipment wording',async()=>{
    const f=fixture(),lost=vi.fn(async()=>{throw Error('Response lost after commit')})
    await expect(f.send('send',lost)).rejects.toThrow('Response lost')
    const original=f.values.get(f.key),recover=vi.fn(async()=>Response.json({kind:'resolved',resolution:f.saved}))
    expect(await f.send('recover',recover)).toEqual(f.saved);expect(lost).toHaveBeenCalledTimes(1);expect(recover).toHaveBeenCalledTimes(1)
    expect(recover).toHaveBeenCalledWith('/api/coach/first-reviewed/setup/resolution',expect.any(Object))
    expect(JSON.parse(original!).contents).toEqual(f.q.contents)
  })
  it('leaves absent results unresolved and checks saved proof after explicit no-write closure',async()=>{
    const f=fixture();f.values.set(f.key,JSON.stringify(f.q))
    const absent=vi.fn(async()=>Response.json({kind:'resolved',resolution:{schemaVersion:1,request:f.q,disposition:'not_found'}}))
    await expect(f.send('recover',absent)).rejects.toThrow('unconfirmed');expect(f.values.has(f.key)).toBe(true)
    const closed={schemaVersion:1,request:f.q,disposition:'no_write',receipt:null,resolvedAt:'2026-10-05T19:00:00Z'}
    const fetcher=vi.fn(async()=>Response.json({kind:'resolved',resolution:closed}))
    expect(await f.send('close',fetcher)).toEqual(closed)
    expect(fetcher).toHaveBeenNthCalledWith(1,'/api/coach/first-reviewed/setup/resolve',expect.any(Object))
    expect(fetcher).toHaveBeenNthCalledWith(2,'/api/coach/first-reviewed/setup/resolution',expect.any(Object))
    expect(JSON.parse(f.values.get(f.archive)!)).toEqual(closed)
  })
  it('does not clear on an unverified closure response or malformed saved proof',async()=>{
    const f=fixture();f.values.set(f.key,JSON.stringify(f.q))
    const wrong=structuredClone(f.saved);if(wrong.disposition==='saved')wrong.receipt.memories.training_schedule.content={schemaVersion:2}
    const fetcher=vi.fn(async()=>Response.json({kind:'resolved',resolution:wrong}))
    await expect(f.send('close',fetcher)).rejects.toThrow('unconfirmed')
    expect(f.values.has(f.key)).toBe(true);expect(f.values.has(f.archive)).toBe(false)
  })
  it.each(['unsupported','busy'])('sends nothing with %s browser coordination',async mode=>{
    const f=fixture(),fetcher=vi.fn(),locks=mode==='unsupported'?null:{request:async(_n:string,_o:LockOptions,run:(lock:null)=>Promise<unknown>)=>run(null)} as Pick<LockManager,'request'>
    await expect(runFirstReviewSetupBrowserAction(f.store,f.q,f.current,'send',fetcher,locks)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled();expect(f.values.size).toBe(0)
  })
  it('fences both pending-request types before sending and never overwrites unreadable work',async()=>{
    const f=fixture(),fetcher=vi.fn(),other=`first-reviewed-pending:${f.q.expectedUserId}:${f.q.programId}`
    f.values.set(other,'unreadable original')
    await expect(f.send('send',fetcher)).rejects.toThrow('Recover');expect(f.values.get(other)).toBe('unreadable original');expect(fetcher).not.toHaveBeenCalled()
    f.values.delete(other);f.values.set(f.key,'unreadable setup')
    const q:FirstReviewedPending={schemaVersion:1,userId:f.q.expectedUserId,programId:f.q.programId,operation:'issue',body:{expectedUserId:f.q.expectedUserId,
      programId:f.q.programId,candidateId:'00000000-0000-4000-8000-000000000010',requestId:'original-key'}}
    await expect(runFirstReviewedBrowserAction(f.store,q,f.current,'send',fetcher,f.locks)).rejects.toThrow('Recover')
    expect(fetcher).not.toHaveBeenCalled();expect(f.values.get(f.key)).toBe('unreadable setup')
  })
  it('cannot resend a retained setup request even with the same identity',async()=>{
    const f=fixture();f.values.set(f.key,JSON.stringify(f.q));const fetcher=vi.fn()
    await expect(f.send('send',fetcher)).rejects.toThrow('Recover');expect(fetcher).not.toHaveBeenCalled()
  })
  it('fences a delayed response after account or program change without clearing pending work',async()=>{
    const f=fixture();f.values.set(f.key,JSON.stringify(f.q));let actor:string|null=f.q.expectedUserId
    const fetcher=vi.fn(async()=>{actor=null;return Response.json({kind:'resolved',resolution:f.saved})})
    await expect(runFirstReviewSetupBrowserAction(f.store,f.q,()=>actor,'recover',fetcher,f.locks)).rejects.toThrow('Restore')
    expect(f.values.has(f.key)).toBe(true);expect(f.values.has(f.archive)).toBe(false)
  })
  it('preserves work when durable reservation or receipt storage fails',async()=>{
    const f=fixture(),fetcher=vi.fn(async()=>Response.json({kind:'resolved',resolution:f.saved}))
    const unavailable={...f.store,setItem:()=>{throw Error('Quota exceeded')}}
    await expect(runFirstReviewSetupBrowserAction(unavailable,f.q,f.current,'send',fetcher,f.locks)).rejects.toThrow('Quota');expect(fetcher).not.toHaveBeenCalled()
    f.values.set(f.key,JSON.stringify(f.q))
    await expect(runFirstReviewSetupBrowserAction(unavailable,f.q,f.current,'recover',fetcher,f.locks)).rejects.toThrow('Quota')
    expect(f.values.has(f.key)).toBe(true);expect(f.values.has(f.archive)).toBe(false)
  })
  it('does not overwrite a conflicting archived receipt and inventories only the original actor',async()=>{
    const f=fixture();f.values.set(f.key,JSON.stringify(f.q));f.values.set(f.archive,JSON.stringify({wrong:'receipt'}))
    await expect(f.send('recover',vi.fn(async()=>Response.json({kind:'resolved',resolution:f.saved})))).rejects.toThrow('conflicting receipt')
    expect(f.values.has(f.key)).toBe(true)
    expect(listFirstReviewSetupPendingPrograms(f.store,f.q.expectedUserId)).toEqual([f.q.programId])
    expect(listFirstReviewSetupPendingPrograms(f.store,'00000000-0000-4000-8000-000000000099')).toEqual([])
  })
})
