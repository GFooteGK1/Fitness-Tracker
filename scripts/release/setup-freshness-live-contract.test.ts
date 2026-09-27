import { describe, expect, it, vi } from 'vitest'
import { createLiveSetupOperationGate, LIVE_SETUP_KEYS, LIVE_SETUP_STEPS, LIVE_SETUP_TARGET, validateLiveSetupManifest } from './setup-freshness-live-contract.mjs'
import { randomUUID } from 'node:crypto'

function fixture(): any {
  const runId='12345678-1234-4123-8123-123456789012'
  return {schema:'socius-setup-live-1',runId,...LIVE_SETUP_TARGET,
    candidateSha:'f8718aa5ac588ffef0cf41d66149daddd681494d',deploymentId:'dpl_candidate',pausedGeneration:'9',
    owners:{rolling:{label:'rolling',userId:'12345678-1234-4123-8123-123456789013',email:`setup-${runId}-rolling@sociusfit-local.invalid`},
      legacy:{label:'legacy',userId:'12345678-1234-4123-8123-123456789014',email:`setup-${runId}-legacy@sociusfit-local.invalid`}},
    idempotencyKeys:Object.fromEntries(LIVE_SETUP_KEYS.map(k=>[k,randomUUID()])),
    numericPolicyEnabled:false,automaticRetries:0,workMs:180000,expiryMs:15000}
}
function journal() {
  const reserved=new Set<string>(), events: string[]=[]
  return {events,reserved,async reserve(v:any) {const k=`${v.runId}:${v.step}`;if(reserved.has(k))throw Error('existing_intent');reserved.add(k);events.push(`intent:${v.step}`)},
    async complete(v:any) {events.push(`result:${v.step}`)}}
}
describe('bounded live setup operation contract',()=>{
  it('holds the validated run identity when its caller mutates the manifest',async()=>{
    const m=fixture(), original=m.runId, reserve=vi.fn(), controller=new AbortController()
    const gate=createLiveSetupOperationGate(m,{journal:{reserve,complete:async()=>{}},now:()=>1000,openedAt:1000,signal:controller.signal})
    m.runId=randomUUID()
    const request={owner:'synthetic',route:'/fixed'}
    await gate.perform(LIVE_SETUP_STEPS[0],async()=>{},request)
    expect(reserve.mock.calls[0][0]).toMatchObject({runId:original,request})
  })
  it.each(['deadline','abort'])('refuses completion after journal persistence crosses %s',async mode=>{
    let now=1000;const controller=new AbortController(),j=journal()
    j.complete=async()=>{if(mode==='deadline')now=181001;else controller.abort()}
    const gate=createLiveSetupOperationGate(fixture(),{journal:j,now:()=>now,openedAt:1000,signal:controller.signal})
    await expect(gate.perform(LIVE_SETUP_STEPS[0],async()=>true)).rejects.toThrow('work_deadline')
    expect(gate.status()).toMatchObject({failed:true,completed:false,completedSteps:0})
  })
  it('uses exact bigint generations without narrowing them to JS numbers',()=>{
    const m=fixture();m.pausedGeneration='9007199254740993'
    expect(validateLiveSetupManifest(m).expectedOpenGeneration).toBe('9007199254740994')
    expect(validateLiveSetupManifest(m).expectedClosedGeneration).toBe('9007199254740995')
  })
  it.each([
    (m:any)=>{m.project='wrong'},(m:any)=>{m.appOrigin='https://preview.vercel.app'},
    (m:any)=>{m.apiOrigin='https://other.supabase.co'},(m:any)=>{m.pausedGeneration='9223372036854775807'},
    (m:any)=>{m.owners.legacy.userId=m.owners.rolling.userId},(m:any)=>{m.owners.rolling.email='athlete@example.com'},
    (m:any)=>{m.numericPolicyEnabled=true},(m:any)=>{m.automaticRetries=1},(m:any)=>{m.workMs=181000},
    (m:any)=>{m.migrationSha256='0'.repeat(64)},
  ])('rejects broadened or wrong-target manifests',mutate=>{const m=fixture();mutate(m);expect(()=>validateLiveSetupManifest(m)).toThrow()})
  it('records intent before effects and does not expose completion before all ordered steps',async()=>{
    const j=journal(),controller=new AbortController()
    const gate=createLiveSetupOperationGate(fixture(),{journal:j,now:()=>1000,openedAt:1000,signal:controller.signal})
    for(const step of LIVE_SETUP_STEPS) {
      await gate.perform(step,async()=>{expect(j.events.at(-1)).toBe(`intent:${step}`);return {safe:true}})
    }
    expect(gate.status()).toEqual({completedSteps:LIVE_SETUP_STEPS.length,failed:false,active:false,completed:true})
    await expect(gate.perform(LIVE_SETUP_STEPS[0],async()=>{})).rejects.toThrow('operation_order')
  })
  it('never repeats an uncertain mutation, including after a new process-equivalent gate',async()=>{
    const j=journal(),options={journal:j,now:()=>1000,openedAt:1000,signal:new AbortController().signal}
    let calls=0
    const operation=async()=>{calls++;throw Error('response_lost')}
    const manifest=fixture(), gate=createLiveSetupOperationGate(manifest,options)
    await expect(gate.perform(LIVE_SETUP_STEPS[0],operation)).rejects.toThrow('response_lost')
    await expect(gate.perform(LIVE_SETUP_STEPS[0],operation)).rejects.toThrow('run_failed_or_busy')
    const restarted=createLiveSetupOperationGate(manifest,options)
    await expect(restarted.perform(LIVE_SETUP_STEPS[0],operation)).rejects.toThrow('existing_intent')
    expect(calls).toBe(1)
  })
  it('does not submit effects when the durable intent cannot be stored',async()=>{
    const gate=createLiveSetupOperationGate(fixture(),{journal:{reserve:async()=>{throw Error('disk_full')},complete:async()=>{}},
      now:()=>1000,openedAt:1000,signal:new AbortController().signal})
    const operation=vi.fn()
    await expect(gate.perform(LIVE_SETUP_STEPS[0],operation)).rejects.toThrow('disk_full')
    expect(operation).not.toHaveBeenCalled()
  })
  it('guardian abort rejects even a transport which ignores abort, and closes the worker to later steps',async()=>{
    const controller=new AbortController(),j=journal()
    const gate=createLiveSetupOperationGate(fixture(),{journal:j,now:()=>1000,openedAt:1000,signal:controller.signal})
    const pending=gate.perform(LIVE_SETUP_STEPS[0],async()=>{controller.abort();return new Promise(()=>{})})
    await expect(pending).rejects.toThrow('containment_aborted')
    expect(gate.status().failed).toBe(true)
    expect(j.events).toHaveLength(1)
  })
  it('work expiry during intent persistence prevents the network call',async()=>{
    let now=1000;const j=journal();const reserve=j.reserve.bind(j)
    j.reserve=async v=>{await reserve(v);now=181001}
    const gate=createLiveSetupOperationGate(fixture(),{journal:j,now:()=>now,openedAt:1000,signal:new AbortController().signal})
    const operation=vi.fn()
    await expect(gate.perform(LIVE_SETUP_STEPS[0],operation)).rejects.toThrow('work_deadline')
    expect(operation).not.toHaveBeenCalled()
  })
})
