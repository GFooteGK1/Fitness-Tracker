import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {renderLiveFixtureSql} from './setup-freshness-live-fixtures.mjs'
import {LIVE_SETUP_KEYS,LIVE_SETUP_TARGET} from './setup-freshness-live-contract.mjs'
const fixture=()=>{const runId=randomUUID();return {schema:'socius-setup-live-1',runId,...LIVE_SETUP_TARGET,
  candidateSha:'f8718aa5ac588ffef0cf41d66149daddd681494d',deploymentId:'dpl_fixture',pausedGeneration:'9',
  owners:Object.fromEntries(['rolling','legacy'].map(label=>[label,{label,userId:randomUUID(),email:`setup-${runId}-${label}@sociusfit-local.invalid`}])),
  idempotencyKeys:Object.fromEntries(LIVE_SETUP_KEYS.map(k=>[k,randomUUID()])),numericPolicyEnabled:false,automaticRetries:0,workMs:180000,expiryMs:15000}}
describe('fixture mutation boundary',()=>{
  it.each(['rolling-confirm-initial','rolling-expire-initial','legacy-create'])('takes the exact shared generation lock before %s',step=>{
    const m=fixture(),owner=m.owners[step==='legacy-create'?'legacy':'rolling'].userId
    const rendered=renderLiveFixtureSql(m,step,{owner,idempotencyKey:m.idempotencyKeys[step],memory:{memory_id:randomUUID()}})
    expect(rendered.sql.indexOf('FOR SHARE')).toBeLessThan(rendered.sql.indexOf('END $fixture_guard$'))
    expect(rendered.sql).toContain('control.generation<>10::bigint')
    expect(rendered.sql.startsWith('BEGIN;')).toBe(true);expect(rendered.sql.endsWith('COMMIT;\n')).toBe(true)
  })
  it('rejects another owner before constructing SQL',()=>{
    const m=fixture();expect(()=>renderLiveFixtureSql(m,'rolling-confirm-initial',{owner:m.owners.legacy.userId,idempotencyKey:m.idempotencyKeys['rolling-confirm-initial']})).toThrow('fixture_owner')
  })
  it('rejects unrecognized mutation and request keys',()=>{
    const m=fixture(),owner=m.owners.rolling.userId
    expect(()=>renderLiveFixtureSql(m,'delete',{owner})).toThrow('fixture_step')
    expect(()=>renderLiveFixtureSql(m,'rolling-confirm-initial',{owner,idempotencyKey:randomUUID()})).toThrow('fixture_key')
  })
})
