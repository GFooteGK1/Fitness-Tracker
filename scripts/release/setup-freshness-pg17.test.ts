import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { GOLDEN_PROGRAMMING_PROFILES } from '../../test/coach/golden-programming-profiles'
import { buildRollingTrainingDirection } from '../../app/lib/coach/rolling-weekly-contracts'
import { buildRollingWeeklyPlan } from '../../app/lib/coach/rolling-weekly-plan'
import { buildAdaptivePlanContract } from '../../app/lib/coach/adaptive-plan'
import { buildStoredRollingWeeklyIntent, serializeRollingSessions } from '../../app/lib/coach/rolling-weekly-api'
import { captureSetupMemoryBindings } from '../../app/lib/coach/setup-memory-bindings'
import { renderSetupInstallSql, SETUP_PREDECESSOR_SQL, setupMigrationSource } from './setup-freshness-install.mjs'
import { verifiedMigrationSource, migrationLedgerInsertSql } from './cutover-migrations.mjs'
import { root, output, sql, jsonSql, verifyTarget, callSql, literal, holdTransaction, sha } from './setup-freshness-local-db.mjs'

// Explicit opt-in only: fresh isolated local stack, real PG17, no hosted target override.
const resumeInstall = process.env.SOCIUS_SETUP_LOCAL_REHEARSAL === 'resume-install'
describe.skipIf(!['1','resume-install'].includes(process.env.SOCIUS_SETUP_LOCAL_REHEARSAL ?? ''))('isolated PG17 setup freshness release', () => {
  it('rehearses ordered upgrade, real writer contention, expiry, and retained accepted history', async () => {
    const checks: string[] = []
    const record = (label: string) => { checks.push(label); console.log(`PASS ${label}`) }
    const status = verifyTarget()
    const receiptPath = path.join(output, 'pg17-rehearsal.json')
    const baseline = jsonSql(`SELECT json_build_object('version',current_setting('server_version_num'),
      'pause',to_regclass('public.coaching_write_control'),'setup',to_regprocedure('public.assert_coach_setup_memories_current(uuid,jsonb,jsonb)'),
      'users',(SELECT count(*) FROM auth.users),'ledger',to_regclass('supabase_migrations.schema_migrations'));`)
    expect(Number(baseline.version)).toBeGreaterThanOrEqual(170000)
    expect(Number(baseline.version)).toBeLessThan(180000)
    expect(baseline.setup).toBeNull()
    if (!resumeInstall) { expect(baseline.pause).toBeNull(); expect(baseline.users).toBe(0) }
    else { expect(baseline.pause).toBe('coaching_write_control'); expect(baseline.users).toBe(4) }
    const fixture = JSON.parse(fs.readFileSync(path.join(output,'local-coaching-bootstrap-manifest.json'),'utf8'))
    expect(fixture.expectedTarget.projectId).toBe('sociusfit-setup-freshness-local')
    expect(fixture.schemaScope).toBe('revision-only')
    for (const source of fixture.sourceManifest) expect(sha(fs.readFileSync(path.join(root,source.path)))).toBe(source.sha256)
    const workout = fs.readFileSync(path.join(root,'supabase/migrations/20260926120000_workout_save_recovery.sql'),'utf8')
    // Synthetic ledger is explicitly fixture provenance, not a reconstruction of production.
    if (!resumeInstall) {
    if (!baseline.ledger) sql('CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);')
    expect(jsonSql('SELECT to_json(count(*)) FROM supabase_migrations.schema_migrations;')).toBe(0)
    sql(verifiedMigrationSource('pause'))
    sql(workout)
    sql(`${migrationLedgerInsertSql('revision')}\n${migrationLedgerInsertSql('pause')}\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements)
      VALUES('20260926120000','workout_save_recovery',ARRAY[${literal(workout)}]::text[]);`)
    }
    const ledger=jsonSql('SELECT json_agg(q ORDER BY version) FROM supabase_migrations.schema_migrations q;')
    expect(ledger.map((row:any)=>[row.version,row.statements])).toEqual([
      ['20260921010000',[verifiedMigrationSource('revision')]],['20260923010000',[verifiedMigrationSource('pause')]],['20260926120000',[workout]]])
    record('Real PG17 baseline includes revision, pause and newer workout recovery migration')
    const accounts: Array<{id:string,email:string,password:string}> = resumeInstall
      ? JSON.parse(fs.readFileSync(path.join(output,'pg17-accounts.private.json'),'utf8')) : []
    const admin = createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    const login = async (account:typeof accounts[number]) => {
      expect(account.email.endsWith('@sociusfit-local.invalid')).toBe(true)
      const client = createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
      const signedIn=await client.auth.signInWithPassword({email:account.email,password:account.password})
      expect(signedIn.error).toBeNull(); expect(signedIn.data.user?.id).toBe(account.id)
      return {id:account.id,client}
    }
    const ownerClient = async () => {
      const email = `setup-${randomUUID()}@sociusfit-local.invalid`, password = randomUUID()+randomUUID()
      const created = await admin.auth.admin.createUser({email,password,email_confirm:true})
      expect(created.error).toBeNull()
      const id = created.data.user!.id
      accounts.push({id,email,password})
      fs.writeFileSync(path.join(output,'pg17-accounts.private.json'),JSON.stringify(accounts))
      return login({id,email,password})
    }
    const retained = resumeInstall ? jsonSql(`SELECT json_agg(q ORDER BY status) FROM
      (SELECT a.user_id,a.id proposal_id,a.idempotency_key key,a.status,a.proposed_plan_version_id,
      p.input_snapshot FROM adaptation_proposals a JOIN training_plan_versions p ON p.id=a.proposed_plan_version_id) q;`) : null
    if (resumeInstall) {
      expect(retained).toHaveLength(2)
      expect(retained.map((r:any)=>r.status)).toEqual(['accepted','proposed'])
      expect(retained.every((r:any)=>!r.input_snapshot.setupMemoryBindings)).toBe(true)
    }
    const unused=resumeInstall ? accounts.filter(a=>!retained.some((r:any)=>r.user_id===a.id)) : []
    const [oldOwner,writerOwner,freshOwner,clockOwner] = resumeInstall
      ? await Promise.all([login(accounts.find(a=>a.id===retained[0].user_id)!),ownerClient(),login(unused[0]),login(unused[1])])
      : await Promise.all(Array.from({length:4},ownerClient))
    const profile = GOLDEN_PROGRAMMING_PROFILES[0].profile
    const plan = buildRollingWeeklyPlan({source:'initial',windowStart:profile.startDate,profile,
      direction:buildRollingTrainingDirection(profile,{hypothesis:'Synthetic setup release rehearsal'})})
    if (plan.kind !== 'weekly_plan') throw Error('Fixture week must compile')
    const intent = buildStoredRollingWeeklyIntent(plan,buildAdaptivePlanContract(profile,[plan]))
    const emptyBindings = {schemaVersion:1,memories:{primary_goal:null,training_schedule:null,available_equipment:null,training_constraints:null}}
    const actor = (id:string) => `SET ROLE authenticated; SET request.jwt.claim.sub=${literal(id)};`
    const revision = (id:string) => Number(sql(`${actor(id)} SELECT public.get_coach_context_revision();`).text)
    const args = (owner:string,key:string,binding:unknown=undefined,observed=revision(owner)) => [plan.title,profile.athleteGoalSummary,plan.windowStart,null,
      plan.directionSnapshot,plan.evidenceReferenceVersion,plan.policyVersion,intent,
      {contextRevision:observed,...(binding ? {setupMemoryBindings:binding}: {})},serializeRollingSessions(plan),{},'a'.repeat(64),key]
    const rpc = (owner:string,name:string,values:unknown[]) => JSON.parse(sql(`${actor(owner)} ${callSql(name,values)}`).text)
    const initial = (owner:string,binding?:unknown) => {
      const key=randomUUID(); return {...rpc(owner,'create_initial_rolling_weekly_proposal',args(owner,key,binding)),key}
    }
    const accept = (owner:string,p:any) => rpc(owner,'accept_adaptation_proposal',[p.proposal_id,p.key])
    const conflict = (owner:string,query:string,code:string) => {
      const failed=sql(`${actor(owner)} ${query}`,true)
      expect(failed.status).not.toBe(0); expect(failed.error).toContain(code)
    }
    const control = () => jsonSql('SELECT row_to_json(c) FROM public.coaching_write_control c;')
    const gate = (paused:boolean) => jsonSql(callSql('set_coaching_write_pause',[paused,control().generation,'Isolated setup rehearsal']))
    const digest = () => jsonSql(`SELECT coalesce(json_agg(q ORDER BY id),'[]'::json) FROM
      (SELECT p.id,md5(p.intent::text||p.input_snapshot::text) hash,
      (SELECT md5(string_agg(s.prescription::text,'' ORDER BY s.id)) FROM prescribed_sessions s WHERE s.plan_version_id=p.id) sessions
      FROM training_plan_versions p WHERE p.user_id=${literal(oldOwner.id)}) q;`)
    if (resumeInstall) {
      expect(control().paused).toBe(true); expect(control().generation).toBe(1)
      gate(false) // Explicit local-only recovery; re-exercise contention without reinstalling any migration.
    }
    const old=resumeInstall ? retained[0] : initial(oldOwner.id), oldAccepted=accept(oldOwner.id,old), before=digest()
    const held=holdTransaction(`${actor(writerOwner.id)} ${callSql('create_initial_rolling_weekly_proposal',args(writerOwner.id,randomUUID()))}`)
    try {
      await held.ready
      // Operator function owns the five-second lock timeout.
      const failed=sql(callSql('set_coaching_write_pause',[true,control().generation,'Local active writer contention']),true)
      expect(failed.status).not.toBe(0); expect(failed.error).toContain('55P03')
      expect(control().paused).toBe(false)
    } finally { held.release(); await held.done }
    gate(true)
    conflict(freshOwner.id,callSql('create_initial_rolling_weekly_proposal',args(freshOwner.id,randomUUID(),emptyBindings)),'PT503')
    expect(accept(oldOwner.id,old)).toEqual(oldAccepted)
    record('Independent writer transaction prevents committed pause; drain then denies new writes and retains accepted replay')
    const predecessors=JSON.parse(sql(`SELECT json_agg(q) FROM (${SETUP_PREDECESSOR_SQL.replace(/;\s*$/,'')}) q;`).text)
    fs.writeFileSync(path.join(output,'pg17-predecessors.json'),JSON.stringify({sourceManifestHash:sha(JSON.stringify(fixture)),workoutHash:sha(workout),predecessors},null,2))
    const generation=String(control().generation)
    for (const install of [renderSetupInstallSql({expectedGeneration:'999',predecessors}),
      renderSetupInstallSql({expectedGeneration:generation,predecessors:predecessors.map((p:any,i:number)=>i?p:{...p,md5:'0'.repeat(32)})})]) {
      expect(sql(install,true).error).toContain('55000')
      expect(jsonSql("SELECT json_build_object('helper',to_regprocedure('public.assert_coach_setup_memories_current(uuid,jsonb,jsonb)'));")).toEqual({helper:null})
    }
    const install=renderSetupInstallSql({expectedGeneration:generation,predecessors})
    sql(install) // Exact PG17 renderer. No predicate replacement or SQL adaptation.
    expect(jsonSql("SELECT to_json(statements) FROM supabase_migrations.schema_migrations WHERE version='20260926010000';")).toEqual([setupMigrationSource()])
    expect(sql(install,true).error).toContain('55000')
    expect(control().paused).toBe(true); expect(digest()).toEqual(before)
    expect(accept(oldOwner.id,old)).toEqual(oldAccepted)
    record('Exact production renderer installs atomically on PG17; bad generation/catalog and repeat installation refused')
    gate(false)
    conflict(freshOwner.id,callSql('create_initial_rolling_weekly_proposal',args(freshOwner.id,randomUUID())),'40001')
    expect(accept(freshOwner.id,initial(freshOwner.id,emptyBindings)).proposal_status).toBe('accepted')
    record('Old application writer refused; compatible bound writer accepted after resume')
    // Real Auth + PostgREST capture feeds the same bindings used by runtime routes.
    const content={experience:profile.trainingExperience,trainingDays:profile.sessionAvailability.map(s=>s.day),sessionMinutes:profile.sessionAvailability[0].minutes}
    const saved=rpc(clockOwner.id,'confirm_coach_memory',['training_schedule','schedule',content,{source:'program_setup',confirmedBy:'athlete'},1,randomUUID()])
    const expiresAt=jsonSql(`UPDATE public.coach_memories SET review_after=clock_timestamp()+interval '15 seconds' WHERE id=${literal(saved.memory_id)} AND user_id=${literal(clockOwner.id)} RETURNING to_json(review_after);`)
    const observed=revision(clockOwner.id)
    const binding=await captureSetupMemoryBindings(clockOwner.client,clockOwner.id,profile)
    const pending=initial(clockOwner.id,binding)
    const remaining=Date.parse(expiresAt)-Date.now()
    expect(remaining).toBeGreaterThan(0); expect(remaining).toBeLessThanOrEqual(15000)
    await new Promise(resolve=>setTimeout(resolve,remaining+200))
    expect(revision(clockOwner.id)).toBe(observed)
    conflict(clockOwner.id,callSql('accept_adaptation_proposal',[pending.proposal_id,pending.key]),'40001')
    expect(jsonSql(`SELECT to_json(status) FROM adaptation_proposals WHERE id=${literal(pending.proposal_id)};`)).toBe('proposed')
    record('Clock-only setup expiry denies first acceptance with unchanged revision through real PG17 and Auth capture')
    gate(true)
    expect(digest()).toEqual(before); expect(accept(oldOwner.id,old)).toEqual(oldAccepted)
    expect(jsonSql("SELECT to_json(data_type) FROM information_schema.columns WHERE table_schema='public' AND table_name='workouts' AND column_name='rpe';")).toBe('numeric')
    // Local HTTP rehearsal needs writes; resume only this isolated synthetic target.
    gate(false)
    const receipt={verifiedAt:new Date().toISOString(),resumedBeforeInstall:resumeInstall,target:'sociusfit-setup-freshness-local',postgres:baseline.version,
      migrationSha256:sha(setupMigrationSource()),bootstrapSha256:fixture.output.sha256,checks,acceptedDigest:before,
      limitations:['Synthetic local schema and ledger; not hosted state','HTTP route lifecycle and mobile browser gates are separate'],control:control()}
    fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n')
  },120000)
})
