import {describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {provisionLiveSetupOwners} from './setup-freshness-live-provision.mjs'
import {obtainSharedSetupLogin} from './setup-freshness-live-login.mjs'
import {LIVE_SETUP_TARGET,LIVE_SETUP_KEYS} from './setup-freshness-live-contract.mjs'
function fixture(){const runId=randomUUID();const manifest={schema:'socius-setup-live-1',runId,...LIVE_SETUP_TARGET,candidateSha:'f8718aa5ac588ffef0cf41d66149daddd681494d',deploymentId:'dpl_fixture',pausedGeneration:'9',
  owners:Object.fromEntries(['rolling','legacy'].map(label=>[label,{label,userId:randomUUID(),email:`setup-${runId}-${label}@sociusfit-local.invalid`}])),
  idempotencyKeys:Object.fromEntries(LIVE_SETUP_KEYS.map(k=>[k,randomUUID()])),numericPolicyEnabled:false,automaticRetries:0,workMs:180000,expiryMs:15000};
  const records=new Map<string,any>([['operator-credentials',{managementAccessToken:'fake-local-management-token'}]]);
  const evidence={record:async(name:string,value:any)=>{if(records.has(name))throw Error('duplicate_intent');records.set(name,value)},
    read:async(name:string)=>{if(!records.has(name))throw Object.assign(Error('missing'),{code:'ENOENT'});return records.get(name)}};
  return {manifest,evidence,records};
}
function provisionFixture(){const f=fixture();let owner:any;const profiles:any[]=[];
  const createUser=vi.fn(async(attributes:any)=>{owner={id:attributes.id,email:attributes.email};return {data:{user:owner},error:null}});
  const client={auth:{signInWithPassword:vi.fn(async()=>({error:null,data:{user:owner,session:{user:owner}}})),getUser:async()=>({error:null,data:{user:owner}})},
    from:(table:string)=>{expect(table).toBe('user_profiles');return {upsert:(value:any)=>{profiles.push(value);return {select:()=>({single:async()=>({error:null,data:{user_id:owner.id}})})}}}}};
  return {...f,profiles,createUser,admin:{auth:{admin:{createUser}}},ownerClient:()=>client};
}
describe('one-use synthetic owner provisioning',()=>{
  it('uses exact manifest IDs and owner profile sessions, then saves both sessions',async()=>{
    const f=provisionFixture();expect(await provisionLiveSetupOwners(f.manifest,f)).toEqual({ownersProvisioned:2})
    expect(f.profiles.map(x=>x.user_id)).toEqual(Object.values(f.manifest.owners).map(x=>x.userId))
    expect(Object.keys(await f.evidence.read('owner-sessions'))).toHaveLength(2)
    await expect(provisionLiveSetupOwners(f.manifest,f)).rejects.toThrow('duplicate_intent');expect(f.createUser).toHaveBeenCalledTimes(2)
  })
  it('never creates a replacement or profile after uncertain creation',async()=>{
    const f=provisionFixture();f.createUser.mockRejectedValueOnce(Error('lost_response'))
    await expect(provisionLiveSetupOwners(f.manifest,f)).rejects.toThrow('lost_response')
    await expect(provisionLiveSetupOwners(f.manifest,f)).rejects.toThrow('duplicate_intent')
    expect(f.createUser).toHaveBeenCalledTimes(1);expect(f.profiles).toHaveLength(0)
  })
  it('rejects an unexpected returned Auth identity',async()=>{
    const f=provisionFixture();f.createUser.mockResolvedValueOnce({data:{user:{id:randomUUID(),email:f.manifest.owners.rolling.email}},error:null})
    await expect(provisionLiveSetupOwners(f.manifest,f)).rejects.toThrow();expect(f.profiles).toHaveLength(0)
  })
})
describe('single shared temporary SQL login without CLI side effects',()=>{
  const successful=()=>vi.fn(async()=>new Response(JSON.stringify({role:'cli_login_postgres',password:'fake-only',ttl_seconds:3600}),{status:201}))
  it('issues once and shares it with all independent transports',async()=>{
    const f=fixture(),fetchImpl=successful();const options={evidence:f.evidence,fetchImpl,now:()=>1000,channel:'operator'}
    const first=await obtainSharedSetupLogin(f.manifest,options)
    for(const channel of ['coordinator','guardian','recovery'])expect(await obtainSharedSetupLogin(f.manifest,{...options,channel})).toEqual(first)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url,init]=(fetchImpl.mock.calls[0] as unknown as [string,RequestInit])
    expect(url).toBe(`https://api.supabase.com/v1/projects/${LIVE_SETUP_TARGET.project}/cli/login-role`)
    expect(init.method).toBe('POST');expect(init.redirect).toBe('error');expect(init.body).toBe('{"read_only":false}')
  })
  it('never repeats issuance after a lost response',async()=>{
    const f=fixture(),fetchImpl=vi.fn().mockRejectedValue(Error('lost_response')),options={...f,fetchImpl,channel:'operator'}
    await expect(obtainSharedSetupLogin(f.manifest,options)).rejects.toThrow('lost_response')
    await expect(obtainSharedSetupLogin(f.manifest,options)).rejects.toThrow('duplicate_intent');expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('does not issue from the guardian or rotate an expiring saved login',async()=>{
    const f=fixture(),fetchImpl=successful()
    await expect(obtainSharedSetupLogin(f.manifest,{...f,fetchImpl,channel:'guardian'})).rejects.toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
    await obtainSharedSetupLogin(f.manifest,{...f,fetchImpl,channel:'operator',now:()=>1000})
    await expect(obtainSharedSetupLogin(f.manifest,{...f,fetchImpl,channel:'guardian',now:()=>3500000})).rejects.toThrow('lifetime')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
