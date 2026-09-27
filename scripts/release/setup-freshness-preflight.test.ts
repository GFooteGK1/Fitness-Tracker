import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { classifySetupPreflight, SETUP_PREFLIGHT_SQL } from './setup-freshness-preflight.mjs'
import { CUTOVER_MIGRATIONS } from './cutover-migrations.mjs'

const expected=JSON.parse(fs.readFileSync(new URL('./cutover-migrations.expected.json',import.meta.url),'utf8')).snapshots.revision
const reference=JSON.parse(fs.readFileSync(new URL('../../docs/verification/programming-quality/setup-freshness-local-release-2026-09-26.json',import.meta.url),'utf8'))
const now=Date.parse('2026-09-27T04:00:00Z')
const transport={projectRef:'auolnfwetmfcwhtvakzy',verifiedTarget:true,now}
function fixture(): any {
  return {format:'setup-freshness-preflight-1',observedAt:new Date(now).toISOString(),database:'postgres',role:'postgres',version:'170006',
    readOnly:'on',isolation:'repeatable read',rowSecurity:'off',setupHelpersAbsent:true,control:{paused:false,generation:'8'},workoutRpeType:'numeric',newerLedger:[],
    ledger:[CUTOVER_MIGRATIONS.revision,CUTOVER_MIGRATIONS.pause,{version:'20260926120000',name:'workout_save_recovery',sha256:reference.predecessors.workoutHash}].map(r=>({...r,statements:1})),
    functions:reference.predecessors.predecessors.map((p:any)=>{
      const f=expected.functions.find((f:any)=>p.signature.startsWith(`public.${f.proname}(`))
      return {signature:p.signature,present:true,owner:f.owner,prosecdef:f.prosecdef,proconfig:[...f.proconfig],execute:structuredClone(f.execute),lf_md5:p.md5,raw_md5:'a'.repeat(32)}
    }),boundary:structuredClone(expected),accepted:{plans:7,sessions:24,planDigest:'b'.repeat(32),sessionDigest:'c'.repeat(32)}}
}
describe('setup freshness read-only release preflight',()=>{
  it('compares normalized source identity but returns fresh raw hashes for the install fence',()=>{
    const value=fixture(), result=classifySetupPreflight(value,transport)
    expect(result.passed).toBe(true)
    expect(result.predecessors?.every((p:any)=>p.md5==='a'.repeat(32))).toBe(true)
  })
  it.each([
    ['target', (v:any)=>v, {...transport,projectRef:'wrong'}],
    ['fresh', (v:any)=>{v.observedAt='2026-09-26T04:00:00Z'},transport],
    ['readOnly',(v:any)=>{v.readOnly='off'},transport],
    ['guardAbsent',(v:any)=>{v.setupHelpersAbsent=false},transport],
    ['control',(v:any)=>{v.control.paused=true},transport],
    ['ledger',(v:any)=>{v.ledger[0].sha256='0'.repeat(64)},transport],
    ['noNewerMigration',(v:any)=>{v.newerLedger=['20260927120000']},transport],
    ['predecessors',(v:any)=>{v.functions[0].lf_md5='0'.repeat(32)},transport],
    ['predecessors',(v:any)=>{v.functions[0].execute.anon=true},transport],
    ['boundary',(v:any)=>{v.boundary.triggers.find((t:any)=>t.tgname==='coaching_write_pause').tgenabled='D'},transport],
    ['boundary',(v:any)=>{v.boundary.triggers.pop()},transport],
    ['boundary',(v:any)=>{v.boundary.functions.find((f:any)=>f.proname==='set_coaching_write_pause').definition_md5='0'.repeat(32)},transport],
    ['boundary',(v:any)=>{v.boundary.relations[0].relforcerowsecurity=false},transport],
  ] as const)('fails closed on %s without emitting installation hashes',(check,mutate,options)=>{
    const value=fixture(); mutate(value)
    const result=classifySetupPreflight(value,options)
    expect(result.passed).toBe(false); expect(result.failedChecks).toContain(check); expect(result.predecessors).toBeUndefined()
  })
  it('retains superseded plans and their sessions in the preservation baseline',()=>{
    expect(SETUP_PREFLIGHT_SQL).toContain("status IN ('accepted','superseded')")
    expect(SETUP_PREFLIGHT_SQL).toContain('JOIN accepted a ON a.id=s.plan_version_id')
    expect(SETUP_PREFLIGHT_SQL).toContain('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    expect(SETUP_PREFLIGHT_SQL.trim()).toMatch(/ROLLBACK;$/)
  })
})
