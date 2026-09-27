import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {compareLiveAudits,LIVE_AUDIT_TABLES,renderLiveAuditSql} from './setup-freshness-live-audit.mjs'
import {LIVE_SETUP_KEYS,LIVE_SETUP_TARGET,validateLiveSetupManifest} from './setup-freshness-live-contract.mjs'
function fixture(){const runId=randomUUID(),manifest={schema:'socius-setup-live-1',runId,...LIVE_SETUP_TARGET,candidateSha:'f8718aa5ac588ffef0cf41d66149daddd681494d',deploymentId:'dpl_fixture',pausedGeneration:'9',
  owners:Object.fromEntries(['rolling','legacy'].map(label=>[label,{label,userId:randomUUID(),email:`setup-${runId}-${label}@sociusfit-local.invalid`}])),idempotencyKeys:Object.fromEntries(LIVE_SETUP_KEYS.map(k=>[k,randomUUID()])),numericPolicyEnabled:false,automaticRetries:0,workMs:180000,expiryMs:15000}
  const manifestHash=validateLiveSetupManifest(manifest).hash,before={schema:'setup-live-audit-1',manifestHash,readOnly:'on',observedAt:'2026-09-27T16:00:00Z',control:{paused:true,generation:'9'},tables:LIVE_AUDIT_TABLES.map(name=>({name,rows:'1',sha256:'a'.repeat(64)}))}
  const after=structuredClone(before);after.control.generation='11';after.observedAt='2026-09-27T16:01:00Z'
  return {manifest,before,after,containment:{manifestHash,containmentVerified:true,workerStoppedVerified:true,pauseBoundaryVerified:true}}
}
describe('post-containment non-synthetic history audit',()=>{
  it('requires the complete unchanged scope',()=>{
    const f=fixture();expect(compareLiveAudits(f.manifest,f.before,f.after,f.containment).globalHistoryVerified).toBe(true)
    f.after.tables.pop();expect(()=>compareLiveAudits(f.manifest,f.before,f.after,f.containment)).toThrow('audit_tables')
  })
  it('classifies any real-owner change as inconclusive, not an allowed correction',()=>{
    const f=fixture();f.after.tables[1].sha256='b'.repeat(64)
    expect(compareLiveAudits(f.manifest,f.before,f.after,f.containment)).toEqual({globalHistoryVerified:false,changedTables:['training_plan_versions'],outcome:'inconclusive_non_synthetic_changes'})
  })
  it('refuses missing termination, pause or generation proof',()=>{
    const f=fixture();f.containment.workerStoppedVerified=false
    expect(()=>compareLiveAudits(f.manifest,f.before,f.after,f.containment)).toThrow('audit_containment')
    f.containment.workerStoppedVerified=true;f.after.control.paused=false
    expect(()=>compareLiveAudits(f.manifest,f.before,f.after,f.containment)).toThrow('audit_requires_pause')
  })
  it('renders only read-only counts and full-row hashes outside the exact two owners',()=>{
    const f=fixture(),sql=renderLiveAuditSql(f.manifest)
    expect(sql).toContain('REPEATABLE READ READ ONLY');expect(sql).toContain('to_jsonb(t)::text')
    for(const owner of Object.values(f.manifest.owners))expect(sql).toContain(`'${owner.userId}'::uuid`)
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/)
  })
})
