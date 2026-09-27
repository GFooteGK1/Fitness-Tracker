import {describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {createLiveSetupHttp,readBoundedLiveJson,waitForDatabaseExpiry} from './setup-freshness-live-http.mjs'
import {LIVE_SETUP_KEYS,LIVE_SETUP_TARGET} from './setup-freshness-live-contract.mjs'
const jwt=(claims:any)=>`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`
function fixture(){
  const runId=randomUUID(),manifest={schema:'socius-setup-live-1',runId,...LIVE_SETUP_TARGET,candidateSha:'f8718aa5ac588ffef0cf41d66149daddd681494d',deploymentId:'dpl_fixture',pausedGeneration:'9',
    owners:Object.fromEntries(['rolling','legacy'].map(label=>[label,{label,userId:randomUUID(),email:`setup-${runId}-${label}@sociusfit-local.invalid`}])),
    idempotencyKeys:Object.fromEntries(LIVE_SETUP_KEYS.map(k=>[k,randomUUID()])),numericPolicyEnabled:false,automaticRetries:0,workMs:180000,expiryMs:15000}
  const sessions:any={};for(const o of Object.values(manifest.owners))sessions[o.userId]={user:{id:o.userId,email:o.email},refresh_token:'synthetic-only',
    access_token:jwt({sub:o.userId,role:'authenticated',iss:`${LIVE_SETUP_TARGET.apiOrigin}/auth/v1`,exp:Math.floor(Date.now()/1000)+3600})}
  const fetchImpl=vi.fn(async(input:any,init:any)=>{
    expect(init.redirect).toBe('error');const url=String(input)
    if(url.endsWith('/auth/v1/user')){
      const token=new Headers(init.headers).get('Authorization')!.slice(7),sub=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub
      return new Response(JSON.stringify(sessions[sub].user),{status:200,headers:{'Content-Type':'application/json'}})
    }
    return new Response(JSON.stringify({pendingProposal:null}),{status:200})
  })
  const executeFixture=vi.fn(async(_request:any)=>({memory_id:randomUUID()}))
  return {manifest,sessions,fetchImpl,executeFixture,readDatabaseTime:async()=>new Date().toISOString(),anonKey:jwt({role:'anon',ref:LIVE_SETUP_TARGET.project})}
}
describe('fixed hosted owner adapter without live network',()=>{
  it('does not confuse microsecond ordering inside the same millisecond',async()=>{
    const read=vi.fn().mockResolvedValueOnce('2026-09-27T17:14:31.786100Z').mockResolvedValueOnce('2026-09-27T17:14:31.787000Z')
    expect((await waitForDatabaseExpiry({at:'2026-09-27T17:14:31.786238Z',signal:new AbortController().signal},read)).expired).toBe(true)
    expect(read).toHaveBeenCalledTimes(2)
  })
  it('requires database-observed expiry even when the host clock is ahead',async()=>{
    const at='2026-09-27T17:14:31.786Z',read=vi.fn()
      .mockResolvedValueOnce('2026-09-27T17:14:31.738Z').mockResolvedValueOnce('2026-09-27T17:14:31.800Z')
    const result=await waitForDatabaseExpiry({at,signal:new AbortController().signal},read)
    expect(read).toHaveBeenCalledTimes(2);expect(result.expired).toBe(true)
  })
  it('cancels an oversized body while streaming',async()=>{
    let cancelled=false
    const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024*1024))},cancel(){cancelled=true}})
    await expect(readBoundedLiveJson(new Response(stream))).rejects.toThrow('Lifecycle response limit')
    expect(cancelled).toBe(true)
  })
  it('does not connect during construction and verifies both owners before work',async()=>{
    const f=fixture(),io=createLiveSetupHttp(f.manifest,f)
    expect(f.fetchImpl).not.toHaveBeenCalled()
    await expect(io.api({owner:f.manifest.owners.rolling.userId,route:'/api/coach/weekly',body:undefined,signal:new AbortController().signal})).rejects.toThrow('readiness')
    expect(await io.ready()).toEqual({ownersVerified:2})
    expect(f.fetchImpl).toHaveBeenCalledTimes(2)
  })
  it('uses only the production cookie prefix and refuses unsupported routes',async()=>{
    const f=fixture(),io=createLiveSetupHttp(f.manifest,f);await io.ready()
    const owner=f.manifest.owners.rolling.userId,signal=new AbortController().signal
    await io.api({owner,route:'/api/coach/weekly',body:undefined,signal})
    const [url,init]=f.fetchImpl.mock.calls.at(-1)!
    expect(url).toBe(`${LIVE_SETUP_TARGET.appOrigin}/api/coach/weekly`)
    expect(init.headers.Cookie).toContain(`sb-${LIVE_SETUP_TARGET.project}-auth-token=`)
    await expect(io.api({owner,route:'https://other.example/',body:undefined,signal})).rejects.toThrow('Unexpected lifecycle route')
  })
  it('passes only fenced, manifest-bound fixture SQL to the privileged operator',async()=>{
    const f=fixture(),io=createLiveSetupHttp(f.manifest,f);await io.ready()
    await io.confirm({owner:f.manifest.owners.rolling.userId,step:'rolling-confirm-initial',idempotencyKey:f.manifest.idempotencyKeys['rolling-confirm-initial'],signal:new AbortController().signal})
    expect(f.executeFixture.mock.calls).toHaveLength(1)
    const request:any=f.executeFixture.mock.calls[0][0]
    expect(request.sql).toContain('FOR SHARE');expect(request.sql).toContain('control.generation<>10::bigint')
    expect(request.sql).not.toContain('synthetic-only')
  })
  it('rejects a service-role or wrong-project owner session',()=>{
    const f=fixture(),owner=f.manifest.owners.rolling.userId
    f.sessions[owner].access_token=jwt({sub:owner,role:'service_role',iss:`${LIVE_SETUP_TARGET.apiOrigin}/auth/v1`,exp:Math.floor(Date.now()/1000)+3600})
    expect(()=>createLiveSetupHttp(f.manifest,f)).toThrow()
  })
})
