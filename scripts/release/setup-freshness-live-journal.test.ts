import {describe,it,expect,vi} from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {randomBytes,randomUUID} from 'node:crypto'
import {createEncryptedLiveJournal} from './setup-freshness-live-journal.mjs'
import {LIVE_SETUP_KEYS,LIVE_SETUP_TARGET,validateLiveSetupManifest} from './setup-freshness-live-contract.mjs'
async function fixture(){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'setup-journal-')),runId=randomUUID()
  const manifest={schema:'socius-setup-live-1',runId,...LIVE_SETUP_TARGET,candidateSha:'f8718aa5ac588ffef0cf41d66149daddd681494d',deploymentId:'dpl_fixture',pausedGeneration:'9',
    owners:Object.fromEntries(['rolling','legacy'].map(label=>[label,{label,userId:randomUUID(),email:`setup-${runId}-${label}@sociusfit-local.invalid`}])),
    idempotencyKeys:Object.fromEntries(LIVE_SETUP_KEYS.map(k=>[k,randomUUID()])),numericPolicyEnabled:false,automaticRetries:0,workMs:180000,expiryMs:15000}
  const key=randomBytes(32),journal=await createEncryptedLiveJournal(manifest,{directory,key})
  const intent={runId,manifestHash:validateLiveSetupManifest(manifest).hash,index:0,step:'rolling-confirm-initial',request:{owner:manifest.owners.rolling.userId,privateFixtureNote:'synthetic-marker-not-plaintext'}}
  return {directory,manifest,key,journal,intent}
}
describe('encrypted write-once operation journal',()=>{
  it('does not expose a named record until its entire envelope is flushed',async()=>{
    const f=await fixture(),realOpen=fs.open.bind(fs);let release!:()=>void,entered!:()=>void
    const hold=new Promise<void>(r=>{release=r}),writing=new Promise<void>(r=>{entered=r})
    const mocked=vi.spyOn(fs,'open').mockImplementation(async(...args:any[])=>{
      const handle=await (realOpen as any)(...args)
      if(String(args[0]).endsWith('.pending')){const write=handle.writeFile.bind(handle);handle.writeFile=async(value:any)=>{entered();await hold;return write(value)}}
      return handle
    })
    try{
      const published=f.journal.record('guardian-ready',{ready:true});await writing
      await expect(f.journal.readRecord('guardian-ready')).rejects.toMatchObject({code:'ENOENT'})
      release();await published;expect(await f.journal.readRecord('guardian-ready')).toEqual({ready:true})
    }finally{release();mocked.mockRestore();f.journal.dispose()}
  })
  it('keeps published readiness valid if staging-link cleanup fails',async()=>{
    const f=await fixture(),unlink=vi.spyOn(fs,'unlink').mockRejectedValueOnce(Error('sharing_violation'))
    try{await f.journal.record('guardian-ready',{ready:true});expect(await f.journal.readRecord('guardian-ready')).toEqual({ready:true})}
    finally{unlink.mockRestore();f.journal.dispose()}
  })
  it('shares immutable encrypted evidence across independent process openings',async()=>{
    const f=await fixture();await f.journal.record('guardian-ready',{marker:'private-evidence-marker'})
    const second=await createEncryptedLiveJournal(f.manifest,{directory:f.directory,key:f.key})
    expect(await second.readRecord('guardian-ready')).toEqual({marker:'private-evidence-marker'})
    await expect(second.record('guardian-ready',{})).rejects.toMatchObject({code:'EEXIST'})
    await expect(second.record('../escape',{})).rejects.toThrow('journal_record_name')
    expect(await fs.readFile(path.join(f.directory,'evidence-guardian-ready.record.sealed.json'),'utf8')).not.toContain('private-evidence-marker')
    f.journal.dispose();second.dispose()
  })
  it('recovers exact requests and results without plaintext on disk',async()=>{
    const {directory,journal,intent}=await fixture();await journal.reserve(intent)
    await journal.complete({...intent,value:{memory_id:randomUUID()}})
    expect(await journal.readIntent(intent)).toEqual(intent)
    expect((await journal.readResult(intent)).value.memory_id).toBeTruthy()
    for(const file of await fs.readdir(directory))expect(await fs.readFile(path.join(directory,file),'utf8')).not.toContain('synthetic-marker')
    journal.dispose()
  })
  it('allows only one concurrent intent and rejects reuse after restart',async()=>{
    const f=await fixture();const attempts=await Promise.allSettled([f.journal.reserve(f.intent),f.journal.reserve(f.intent)])
    expect(attempts.filter(x=>x.status==='fulfilled')).toHaveLength(1)
    const restarted=await createEncryptedLiveJournal(f.manifest,{directory:f.directory,key:f.key})
    await expect(restarted.reserve(f.intent)).rejects.toMatchObject({code:'EEXIST'})
  })
  it('refuses result without intent and preserves a partial intent as uncertain',async()=>{
    const f=await fixture();await expect(f.journal.complete({...f.intent,value:true})).rejects.toThrow()
    await fs.writeFile(path.join(f.directory,'0-rolling-confirm-initial.intent.sealed.json'),'{partial',{flag:'wx'})
    await expect(f.journal.reserve(f.intent)).rejects.toMatchObject({code:'EEXIST'})
    await expect(f.journal.readIntent(f.intent)).rejects.toThrow()
  })
  it('detects encrypted content tampering and wrong keys',async()=>{
    const f=await fixture();await f.journal.reserve(f.intent)
    const wrong=await createEncryptedLiveJournal(f.manifest,{directory:f.directory,key:randomBytes(32)})
    await expect(wrong.readIntent(f.intent)).rejects.toThrow()
    const target=path.join(f.directory,'0-rolling-confirm-initial.intent.sealed.json'),v=JSON.parse(await fs.readFile(target,'utf8'))
    const bytes=Buffer.from(v.data,'base64');bytes[0]^=1;v.data=bytes.toString('base64');await fs.writeFile(target,JSON.stringify(v))
    await expect(f.journal.readIntent(f.intent)).rejects.toThrow()
  })
})
