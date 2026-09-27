import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {runSetupGuardian} from './setup-freshness-live-guardian.mjs'
import {LIVE_SETUP_KEYS,LIVE_SETUP_TARGET} from './setup-freshness-live-contract.mjs'

const fixture=()=>{const runId=randomUUID();return {schema:'socius-setup-live-1',runId,...LIVE_SETUP_TARGET,
  candidateSha:'f8718aa5ac588ffef0cf41d66149daddd681494d',deploymentId:'dpl_fixture',pausedGeneration:'9',
  owners:Object.fromEntries(['rolling','legacy'].map(label=>[label,{label,userId:randomUUID(),email:`setup-${runId}-${label}@sociusfit-local.invalid`}])),
  idempotencyKeys:Object.fromEntries(LIVE_SETUP_KEYS.map(k=>[k,randomUUID()])),numericPolicyEnabled:false,automaticRetries:0,workMs:180000,expiryMs:15000}}

describe('independent setup containment',()=>{
  it('never acknowledges an invalid guardian start',async()=>{
    let acknowledged=false
    await expect(runSetupGuardian(fixture(),{}, {startedAt:1001,now:()=>1000,onReady:()=>{acknowledged=true}})).rejects.toThrow('guardian_start')
    expect(acknowledged).toBe(false)
  })
  it.each(['success','crash','deadline','lost-pause-response','late-open'])('requires committed pause after %s',async mode=>{
    let now=1000,paused=false,generation='10',calls=0,stops=0,reserved=false
    if(mode==='late-open'){paused=true;generation='9'}
    const result=await runSetupGuardian(fixture(),{
      stopWorker:async()=>{stops++;return {terminated:true}},
      reservePause:async()=>{reserved=true},
      readGate:async()=>({paused,generation}),
      pause:async({expectedGeneration}:any)=>{expect(reserved).toBe(true);expect(expectedGeneration).toBe(generation);calls++;paused=true;generation=String(BigInt(generation)+BigInt(1));if(mode==='lost-pause-response')throw Error('lost')},
    },{startedAt:1000,now:()=>now,sleep:async(ms:number)=>{now+=ms},requested:()=>mode!=='deadline'})
    expect(result.containmentVerified).toBe(true);expect(calls).toBe(1);expect(stops).toBe(1)
    if(mode==='deadline')expect(result.containmentStartedAt).toBe(181000)
  })
  it.each(['locked','late-open-never-observed','unexpected-generation','intent-failure'])('does not falsely pass %s',async mode=>{
    let now=1000,calls=0
    const result=await runSetupGuardian(fixture(),{
      stopWorker:async()=>({terminated:true}),reservePause:async()=>{if(mode==='intent-failure')throw Error('disk_full')},
      readGate:async()=>mode==='late-open-never-observed'?{paused:true,generation:'9'}:
        mode==='unexpected-generation'?{paused:false,generation:'12'}:{paused:false,generation:'10'},
      pause:async()=>{calls++;throw Error('lock_timeout')},
    },{startedAt:1000,now:()=>now,sleep:async(ms:number)=>{now+=ms},requested:()=>true})
    expect(result.containmentVerified).toBe(false);expect(calls).toBeLessThanOrEqual(1)
  })
  it('pauses after failed worker termination without claiming full containment',async()=>{
    let now=1000,paused=false,generation='10',calls=0
    const result=await runSetupGuardian(fixture(),{stopWorker:async()=>{throw Error('worker_alive')},
      reservePause:async()=>{},readGate:async()=>({paused,generation}),pause:async()=>{calls++;paused=true;generation='11'},
    },{startedAt:1000,now:()=>now,sleep:async(ms:number)=>{now+=ms},requested:()=>true})
    expect(calls).toBe(1);expect(result.pauseBoundaryVerified).toBe(true)
    expect(result.containmentVerified).toBe(false);expect(result.reason).toBe('guardian_worker_stop_unverified')
  })
  it('uses the distinct open-generation CAS if opening wins the fence race',async()=>{
    let now=1000,paused=true,generation='9';const submitted:string[]=[]
    const result=await runSetupGuardian(fixture(),{stopWorker:async()=>({terminated:true}),reservePause:async()=>{},
      readGate:async()=>({paused,generation}),pause:async({expectedGeneration}:any)=>{
        submitted.push(expectedGeneration)
        if(expectedGeneration==='9'){paused=false;generation='10';throw Error('CAS_changed')}
        paused=true;generation='11'
      },
    },{startedAt:1000,now:()=>now,sleep:async(ms:number)=>{now+=ms},requested:()=>true})
    expect(result.containmentVerified).toBe(true);expect(submitted).toEqual(['9','10'])
  })
})
