import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const owner = '11111111-1111-4111-8111-111111111111'
const otherA = '22222222-2222-4222-8222-222222222222'
const otherB = '33333333-3333-4333-8333-333333333333'
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/app/lib/whoop/sync-service', () => ({ incrementalSync: vi.fn() }))
vi.mock('@/app/lib/whoop/timing-owner', () => ({ isWhoopTimingOwner: (id: unknown) => id === '11111111-1111-4111-8111-111111111111' }))
import { createServiceRoleClient } from '@/app/lib/auth/supabase-server'
import { incrementalSync } from '@/app/lib/whoop/sync-service'
import { GET, POST } from '@/app/api/whoop/sync-all/route'
import { POST as baselinePOST } from '../fixtures/whoop-sync-all-pre-get'

function setup(rows: unknown = [{ user_id: otherA }, { user_id: owner }, { user_id: otherB }], lookupError: unknown = null) {
  const select = vi.fn().mockResolvedValue({ data: rows, error: lookupError })
  const from = vi.fn(() => ({ select }))
  const client = { from } as unknown as ReturnType<typeof createServiceRoleClient>
  vi.mocked(createServiceRoleClient).mockReturnValue(client)
  vi.mocked(incrementalSync).mockResolvedValue({ success:true, recordsSynced:{recovery:1,sleep:1,cycles:1,workouts:1} })
  return { client, from, select }
}
function request(method: 'GET' | 'POST', authorization: string | undefined = 'Bearer synthetic-secret', suffix = '') {
  return new NextRequest('https://example.invalid/api/whoop/sync-all'+suffix, {
    method, headers: authorization === undefined ? {} : { authorization },
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV','production')
  vi.stubEnv('CRON_SECRET','synthetic-secret')
  vi.spyOn(console,'log').mockImplementation(() => {})
  vi.spyOn(console,'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('authenticated fixed-owner GET', () => {
  it.each([undefined,'','Bearer','Bearer ','Bearer wrong','Basic synthetic-secret','bearer synthetic-secret','Bearer synthetic-secret extra'])('rejects unauthorized header before all privileged work: %s', async header => {
    const { from,select } = setup()
    vi.mocked(createServiceRoleClient).mockImplementation(() => { throw new Error('forbidden client construction') })
    const req = request('GET','Bearer placeholder')
    if (header === undefined) req.headers.delete('authorization'); else req.headers.set('authorization',header)
    const response = await GET(req)
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(createServiceRoleClient).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled(); expect(select).not.toHaveBeenCalled(); expect(incrementalSync).not.toHaveBeenCalled()
  })
  it.each(['',undefined])('missing configured secret fails closed before lookup: %s', async secret => {
    const {from,select}=setup(); vi.stubEnv('CRON_SECRET',secret)
    const response=await GET(request('GET','Bearer undefined'))
    expect(response.status).toBe(500)
    expect(createServiceRoleClient).not.toHaveBeenCalled();expect(from).not.toHaveBeenCalled();expect(select).not.toHaveBeenCalled();expect(incrementalSync).not.toHaveBeenCalled()
  })
  it.each([[owner,otherA,otherB],[otherA,owner,otherB],[otherA,otherB,owner],[owner,owner,otherA]].map(ids=>[ids]))('selects only the fixed connected owner: %j', async ids => {
    const {client,from,select}=setup(ids.map(user_id=>({user_id})))
    const response=await GET(request('GET')); const body=await response.json()
    expect(response.status).toBe(200);expect(body.results).toEqual({total:1,successful:1,failed:0})
    expect(from).toHaveBeenCalledExactlyOnceWith('whoop_tokens');expect(select).toHaveBeenCalledExactlyOnceWith('user_id')
    expect(incrementalSync).toHaveBeenCalledExactlyOnceWith(owner,client)
    expect(JSON.stringify(body)).not.toContain(otherA);expect(JSON.stringify(body)).not.toContain(otherB)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it.each([[],null,[{user_id:otherA},{user_id:otherB}],[{},null,{user_id:42}]].map(rows=>[rows]))('never falls back when owner is absent: %j', async rows => {
    setup(rows)
    const response=await GET(request('GET'));expect(response.status).toBe(200)
    expect(await response.json()).toEqual({success:true,message:'No users to sync',usersSynced:0})
    expect(incrementalSync).not.toHaveBeenCalled()
  })
  it('ignores caller owner selectors and activity flags', async () => {
    const {client}=setup([{user_id:otherA,active:true},{user_id:owner,active:false}])
    vi.stubEnv('WHOOP_OWNER_ID',otherA)
    const req=request('GET','Bearer synthetic-secret','?user_id='+otherA+'&ownerOnly=false&fullSync=true')
    req.headers.set('x-owner-id',otherA)
    await GET(req);expect(incrementalSync).toHaveBeenCalledExactlyOnceWith(owner,client)
  })
  it('lookup error cannot sync', async () => {
    setup([{user_id:owner}],{message:'synthetic lookup failure'})
    const response=await GET(request('GET'));expect(response.status).toBe(500);expect(incrementalSync).not.toHaveBeenCalled()
  })
  it.each(['result','throw'])('reports selected-owner failure without extra calls: %s', async kind => {
    const {client}=setup()
    if(kind==='throw')vi.mocked(incrementalSync).mockRejectedValue(new Error('synthetic sync failure'))
    else vi.mocked(incrementalSync).mockResolvedValue({success:false,recordsSynced:{recovery:0,sleep:0,cycles:0,workouts:0},errors:['synthetic sync failure']})
    const body=await (await GET(request('GET'))).json()
    expect(body.results.total).toBe(1);expect(body.results.successful).toBe(0);expect(body.results.failed).toBe(1)
    expect(body.results.errors).toHaveLength(1);expect(incrementalSync).toHaveBeenCalledExactlyOnceWith(owner,client)
    expect(JSON.stringify(body)).not.toContain(otherA)
  })
  it('GET remains authenticated and owner-only outside production',async()=>{
    vi.stubEnv('NODE_ENV','development');const {client}=setup()
    const req=request('GET');req.headers.delete('authorization')
    expect((await GET(req)).status).toBe(401);expect(createServiceRoleClient).not.toHaveBeenCalled()
    await GET(request('GET'));expect(incrementalSync).toHaveBeenCalledExactlyOnceWith(owner,client)
  })
})

describe('POST exact baseline characterization',()=>{
  const cases=[
    {name:'all connected'}, {name:'empty',rows:[]},{name:'null',rows:null},
    {name:'wrong bearer',header:'Bearer wrong'},{name:'missing bearer',header:undefined},
    {name:'missing secret',secret:''},{name:'lookup error',lookupError:{message:'synthetic failure'}},
    {name:'partial failed result',failure:'result'},{name:'thrown sync',failure:'throw'},
    {name:'unexpected client exception',failure:'client'},
    {name:'development no bearer',mode:'development',header:undefined,secret:''},
  ]
  for(const value of cases)it(value.name,async()=>{
    const cfg={rows:[{user_id:otherA},{user_id:owner},{user_id:otherB}] as unknown,lookupError:null as unknown,header:'Bearer synthetic-secret' as string|undefined,secret:'synthetic-secret',mode:'production',failure:'',...value}
    const run=async(handler:typeof POST)=>{
      vi.clearAllMocks();vi.stubEnv('NODE_ENV',cfg.mode);vi.stubEnv('CRON_SECRET',cfg.secret)
      const {client,from,select}=setup(cfg.rows,cfg.lookupError)
      if(cfg.failure==='client')vi.mocked(createServiceRoleClient).mockImplementation(()=>{throw new Error('synthetic client failure')})
      vi.mocked(incrementalSync).mockImplementation(async id=>{
        if(id===otherA&&cfg.failure==='throw')throw new Error('synthetic sync failure')
        return {success:!(id===otherA&&cfg.failure==='result'),recordsSynced:{recovery:1,sleep:1,cycles:1,workouts:1},errors:id===otherA&&cfg.failure==='result'?['synthetic failure']:undefined}
      })
      const req=request('POST','Bearer placeholder','?ownerOnly=true&user_id='+owner)
      if(cfg.header===undefined)req.headers.delete('authorization');else req.headers.set('authorization',cfg.header)
      const response=await handler(req)
      expect(vi.mocked(incrementalSync).mock.calls.every(call=>call[1]===client)).toBe(true)
      return {status:response.status,body:await response.json(),headers:[...response.headers],clientCalls:vi.mocked(createServiceRoleClient).mock.calls.length,from:from.mock.calls,select:select.mock.calls,syncIds:vi.mocked(incrementalSync).mock.calls.map(call=>call[0])}
    }
    const baseline=await run(baselinePOST),candidate=await run(POST)
    expect(candidate).toEqual(baseline)
    if(value.name==='all connected')expect(candidate.syncIds).toEqual([otherA,owner,otherB])
  })
})
