import {describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {createLiveSqlOperator} from './setup-freshness-live-sql.mjs'
import {parseLiveCliConnection} from './setup-freshness-live-production-sql.mjs'
import {renderLiveFixtureSql} from './setup-freshness-live-fixtures.mjs'
import {LIVE_SETUP_KEYS,LIVE_SETUP_TARGET} from './setup-freshness-live-contract.mjs'
const fixture=()=>{const runId=randomUUID();return {schema:'socius-setup-live-1',runId,...LIVE_SETUP_TARGET,
  candidateSha:'f8718aa5ac588ffef0cf41d66149daddd681494d',deploymentId:'dpl_fixture',pausedGeneration:'9',
  owners:Object.fromEntries(['rolling','legacy'].map(label=>[label,{label,userId:randomUUID(),email:`setup-${runId}-${label}@sociusfit-local.invalid`}])),
  idempotencyKeys:Object.fromEntries(LIVE_SETUP_KEYS.map(k=>[k,randomUUID()])),numericPolicyEnabled:false,automaticRetries:0,workMs:180000,expiryMs:15000}}
const records=()=>{const saved=new Map();return {saved,record:async(name:string,data:unknown)=>{if(saved.has(name))throw Error('duplicate_intent');saved.set(name,data)}}}
describe('bounded SQL operator',()=>{
  it('rejects modified SQL and alternate owner without submitting',async()=>{
    const m=fixture(),query=vi.fn(),op=createLiveSqlOperator(m,{query,...records()})
    const payload=renderLiveFixtureSql(m,'rolling-confirm-initial',{owner:m.owners.rolling.userId,idempotencyKey:m.idempotencyKeys['rolling-confirm-initial']})
    await expect(op.fixture({...payload,sql:payload.sql+'SELECT 1;'})).rejects.toThrow()
    await expect(op.fixture({...payload,owner:m.owners.legacy.userId})).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })
  it('preserves an uncertain mutation intent across operator restart',async()=>{
    const m=fixture(),r=records(),query=vi.fn().mockRejectedValue(Error('transport_timeout'))
    await expect(createLiveSqlOperator(m,{query,...r}).open()).rejects.toThrow('transport_timeout')
    await expect(createLiveSqlOperator(m,{query,...r}).open()).rejects.toThrow('duplicate_intent')
    expect(query).toHaveBeenCalledTimes(1)
  })
  it('does not send a mutation if cancellation happens during durable intent creation',async()=>{
    const m=fixture(),controller=new AbortController(),query=vi.fn()
    const op=createLiveSqlOperator(m,{query,record:async()=>controller.abort()})
    await expect(op.open({signal:controller.signal})).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })
  it('permits only each predefined pause CAS once after reservation',async()=>{
    const m=fixture(),query=vi.fn().mockResolvedValue({paused:true,generation:'11'}),op=createLiveSqlOperator(m,{query,...records()})
    await expect(op.pause({expectedGeneration:'10'})).rejects.toThrow()
    await expect(op.reservePause({expectedGeneration:'11',signal:undefined})).rejects.toThrow()
    await op.reservePause({expectedGeneration:'10',signal:undefined});await op.pause({expectedGeneration:'10'})
    await expect(op.pause({expectedGeneration:'10'})).rejects.toThrow()
    expect(query).toHaveBeenCalledTimes(1)
  })
  it('keeps audit and synthetic history read-only and rejects foreign owners',async()=>{
    const m=fixture(),query=vi.fn().mockResolvedValue({}),op=createLiveSqlOperator(m,{query,...records()})
    await op.audit('before');await op.history({owner:m.owners.rolling.userId,planId:randomUUID()})
    expect(query.mock.calls.every(call=>call[1].readOnly===true)).toBe(true)
    await expect(op.history({owner:randomUUID(),planId:randomUUID()})).rejects.toThrow()
  })
})
describe('CLI connection parsing without execution',()=>{
  const script=(host=`db.${LIVE_SETUP_TARGET.project}.supabase.co`,user='cli_login_postgres')=>
    `export PGHOST="${host}"\nexport PGPORT="5432"\nexport PGUSER="${user}"\nexport PGPASSWORD="fake-fixture-only"\nexport PGDATABASE="postgres"`
  it('accepts only the fixed direct or session-pooler endpoint',()=>{
    expect(parseLiveCliConnection(script()).PGDATABASE).toBe('postgres')
    expect(parseLiveCliConnection(script('aws-1-us-east-1.pooler.supabase.com',`cli_login_postgres.${LIVE_SETUP_TARGET.project}`)).PGPORT).toBe('5432')
    expect(()=>parseLiveCliConnection(script('db.somewhere-else.supabase.co'))).toThrow()
    expect(()=>parseLiveCliConnection(script().replace('5432','6543'))).toThrow()
  })
  it('rejects duplicate variables and unsupported quoting',()=>{
    expect(()=>parseLiveCliConnection(script()+'\nexport PGHOST="other"')).toThrow()
    expect(()=>parseLiveCliConnection(script().replace('"fake-fixture-only"',"'unsupported'"))).toThrow()
  })
})
