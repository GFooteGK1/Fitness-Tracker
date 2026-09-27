import {describe,it,expect,vi} from 'vitest'
import {Readable} from 'node:stream'
import {createSetupPreflightConnection,SETUP_PREFLIGHT_ARGS} from './setup-freshness-preflight-login.mjs'

const token='fake-management-token-for-offline-tests'
function fixture(){
  const records=new Map<string,unknown>()
  const record=vi.fn(async(name:string,value:unknown)=>{if(records.has(name))throw Error('duplicate_intent');records.set(name,value)})
  const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({role:'cli_login_postgres',password:'synthetic-password',ttl_seconds:3600}),{status:201}))
  return {record,records,fetchImpl,now:()=>1000,argv:SETUP_PREFLIGHT_ARGS,input:Readable.from([JSON.stringify({managementAccessToken:token})])}
}
describe('explicit setup preflight credential issuance',()=>{
  it('reserves intent before one fixed request, retains encrypted response and yields only the pinned SQL endpoint',async()=>{
    const f=fixture()
    f.fetchImpl.mockImplementation(async()=>{
      expect(f.records.has('shared-sql-login-intent')).toBe(true)
      return new Response(JSON.stringify({role:'cli_login_postgres',password:'synthetic-password',ttl_seconds:3600}),{status:201})
    })
    const connection=await createSetupPreflightConnection(f)
    expect(connection).toEqual({PGHOST:'aws-1-us-east-1.pooler.supabase.com',PGPORT:'5432',PGUSER:'cli_login_postgres.auolnfwetmfcwhtvakzy',PGDATABASE:'postgres',PGPASSWORD:'synthetic-password'})
    expect(f.fetchImpl).toHaveBeenCalledTimes(1)
    const [url,request]=f.fetchImpl.mock.calls[0] as unknown as [string,RequestInit]
    expect(url).toBe('https://api.supabase.com/v1/projects/auolnfwetmfcwhtvakzy/cli/login-role')
    expect(request.method).toBe('POST');expect(request.redirect).toBe('error');expect(request.body).toBe('{"read_only":false}')
    expect(request.signal).toBeInstanceOf(AbortSignal)
    expect(f.records.has('shared-sql-login-response')).toBe(true)
    expect(JSON.stringify(f.records.get('setup-preflight-login'))).not.toContain('password')
  })
  it('requires the explicit login flag before reading credentials or contacting the service',async()=>{
    const f=fixture();f.argv=['setup-preflight']
    await expect(createSetupPreflightConnection(f)).rejects.toThrow('setup_preflight_connection_failed')
    expect(f.record).not.toHaveBeenCalled();expect(f.fetchImpl).not.toHaveBeenCalled()
  })
  for(const raw of ['invalid '+token,JSON.stringify({managementAccessToken:token,project:'other'}),'x'.repeat(16385)]){
    it(`rejects malformed, extra-scope or oversized input before any request (${raw.length} bytes)`,async()=>{
      const f=fixture();f.input=Readable.from([raw])
      await expect(createSetupPreflightConnection(f)).rejects.toThrow('setup_preflight_connection_failed')
      expect(f.fetchImpl).not.toHaveBeenCalled();expect(f.record).not.toHaveBeenCalled()
    })
  }
  it('does not repeat issuance after an uncertain response and redacts transport errors',async()=>{
    const f=fixture();f.fetchImpl.mockRejectedValue(Error('private error '+token))
    await expect(createSetupPreflightConnection(f)).rejects.toThrow('setup_preflight_connection_failed; inspect private evidence; do not retry issuance')
    f.input=Readable.from([JSON.stringify({managementAccessToken:token})])
    await expect(createSetupPreflightConnection(f)).rejects.toThrow('setup_preflight_connection_failed')
    expect(f.fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('preserves a rejected response before refusing the connection without fallback',async()=>{
    const f=fixture();f.fetchImpl.mockResolvedValue(new Response(JSON.stringify({message:'private failure'}),{status:403}))
    await expect(createSetupPreflightConnection(f)).rejects.toThrow('setup_preflight_connection_failed')
    expect(f.records.get('shared-sql-login-response')).toEqual({status:403,value:{message:'private failure'}})
    expect(f.fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('rejects an insufficient remaining lifetime after receipt latency',async()=>{
    const f=fixture();let n=0;f.now=()=>n++===0?1000:3500000
    await expect(createSetupPreflightConnection(f)).rejects.toThrow('setup_preflight_connection_failed')
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);expect(f.records.has('setup-preflight-login')).toBe(false)
  })
})
