import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { firstReviewLocalTarget as t,firstReviewFixedFixture,firstReviewEligibleObservation,firstReviewBoundBody,
  firstReviewReadPath,firstReviewResourceSql,firstReviewAdmitted,firstReviewSnapshotSql,firstReviewPreservesRows,
  firstReviewIsolationPreserved,firstReviewAllowedAdditionsSql,firstReviewTerminalSql,firstReviewTerminalPreserved,
  firstReviewMutablePreserved } from '../../scripts/release/first-reviewed-next-scope.mjs'
import { supervisedLifecycleFixture,lifecycleIds } from './supervised-lifecycle-fixture'
import { firstReviewExecutionManifestSql,firstReviewIdentitySql,firstReviewRenewalSource,
  firstReviewRenewalObservation } from '../../scripts/release/first-reviewed-next-scope.mjs'
import { sqlFile } from './fixture'
import { buildSupervisedMigrationPlan } from '../../scripts/release/supervised-local-migration-plan.mjs'
import { buildFirstReviewedLocalMigrationPlan } from '../../scripts/release/first-reviewed-local-migration-plan.mjs'
import { LocalRequestDrain } from '../../scripts/release/supervised-browser-finalization'

const sources=[{runId:'7af8657d-70d7-4ef7-be95-969b45651c59',status:'passed',target:t.api,programId:t.programId,planId:t.baseId,syntheticUserIds:[t.ownerId]},
  {runId:'f0d5bb72-36aa-49d6-8d7c-5a8214e6176d',status:'passed',target:t.api,journal:[{disposition:'response_received'}],
    users:[{actor:'athlete',id:t.reviewerId,email:'synthetic-reviewer@sociusfit-local.invalid'},{actor:'foreign',id:t.foreignId,email:'synthetic-foreign@sociusfit-local.invalid'}]}]
const fixture=()=>firstReviewFixedFixture(sources,randomUUID(),randomUUID())
describe('fixed first-reviewed Next runtime boundaries (offline/disposable SQL)',()=>{
  let f:Awaited<ReturnType<typeof supervisedLifecycleFixture>>
  beforeAll(async()=>{
    f=await supervisedLifecycleFixture(true,true,true)
    await f.db.exec(`RESET ROLE;
      ALTER TABLE auth.users ADD COLUMN email text, ADD COLUMN deleted_at timestamptz;
      UPDATE auth.users SET email=id::text || '@sociusfit-local.invalid';`)
    for(const file of buildSupervisedMigrationPlan().manifest.files.slice(2))await f.db.exec(sqlFile(`supabase/migrations/${file.name}`))
    await f.db.exec('GRANT EXECUTE ON FUNCTION confirm_coach_memory(text,text,jsonb,jsonb,numeric,text) TO service_role')
    await f.db.exec(buildFirstReviewedLocalMigrationPlan().sql.replace(
      "current_setting('server_version_num')::integer/10000<>17","current_setting('server_version_num')::integer/10000<>18"))
  },30000)
  afterAll(async()=>{await f?.db.close()})
  it('binds exactly the passed local sources and three distinct existing synthetic identities',()=>{
    const q=fixture();expect(q.users.map(u=>u.id)).toEqual([t.ownerId,t.reviewerId,t.foreignId])
    expect(()=>firstReviewFixedFixture([{...sources[0],target:'https://hosted.invalid'},sources[1]],q.runId,q.designationId)).toThrow()
    expect(()=>firstReviewFixedFixture([sources[0],{...sources[1],journal:[{disposition:'pending'}]}],q.runId,q.designationId)).toThrow()
    expect(()=>firstReviewFixedFixture([sources[0],{...sources[1],users:[{actor:'athlete',id:t.reviewerId,email:'real@example.com'}]}],q.runId,q.designationId)).toThrow()
  })
  it('requires one existing active accepted legacy base, no anchor/enrollment, profiles and zero WHOOP connections',()=>{
    const observation={program:{programId:t.programId,ownerId:t.ownerId,baseId:t.baseId,windowStart:'2026-09-21',sequenceNumber:1,
      active:true,accepted:true,legacy:true,oneOwnedActive:true,unanchored:true,unenrolled:true},
      identities:[t.ownerId,t.reviewerId,t.foreignId].map(id=>({id,synthetic:true,profileExists:true,whoopCount:0})),
      executionManifest:{expectedSessions:3,rawSessions:3,effectiveSessions:3,exact:true}}
    expect(firstReviewEligibleObservation(observation)).toBe(true)
    for(const key of ['oneOwnedActive','unanchored','unenrolled','legacy'])expect(firstReviewEligibleObservation({...observation,program:{...observation.program,[key]:false}})).toBe(false)
    expect(firstReviewEligibleObservation({...observation,identities:observation.identities.slice(0,2)})).toBe(false)
    for(const executionManifest of [undefined,{expectedSessions:3,rawSessions:0,effectiveSessions:0,exact:false},
      {...observation.executionManifest,effectiveSessions:2},{...observation.executionManifest,exact:false},
      {expectedSessions:0,rawSessions:0,effectiveSessions:0,exact:true}])expect(firstReviewEligibleObservation({...observation,executionManifest})).toBe(false)
  })
  it('manifest preflight rejects missing and changed saved prescriptions under owner RLS',async()=>{
    const sql=firstReviewExecutionManifestSql({ownerId:lifecycleIds.owner,programId:lifecycleIds.program,baseId:lifecycleIds.base})
    const read=async()=>{const result=await f.db.exec(sql);return result.flatMap(r=>r.rows).find(r=>r.jsonb_build_object)?.jsonb_build_object}
    expect(await read()).toMatchObject({exact:true})
    await f.db.exec('RESET ROLE; ALTER TABLE public.prescribed_sessions DISABLE TRIGGER USER')
    const saved=await f.db.query<{id:string;prescription:unknown;row:unknown}>('SELECT id,prescription,to_jsonb(s) AS row FROM public.prescribed_sessions s ORDER BY session_index LIMIT 1')
    await f.db.query("UPDATE public.prescribed_sessions SET prescription=prescription||'{\"fixtureMismatch\":true}'::jsonb WHERE id=$1",[saved.rows[0].id])
    expect(await read()).toMatchObject({exact:false})
    await f.db.exec('RESET ROLE')
    await f.db.query('UPDATE public.prescribed_sessions SET prescription=$1::jsonb WHERE id=$2',[JSON.stringify(saved.rows[0].prescription),saved.rows[0].id])
    await f.db.query('DELETE FROM public.prescribed_sessions WHERE id=$1',[saved.rows[0].id])
    expect(await read()).toMatchObject({exact:false})
    await f.db.exec('RESET ROLE')
    await f.db.query('INSERT INTO public.prescribed_sessions SELECT * FROM jsonb_populate_record(NULL::public.prescribed_sessions,$1::jsonb)',[JSON.stringify(saved.rows[0].row)])
    await f.db.exec('ALTER TABLE public.prescribed_sessions ENABLE TRIGGER USER')
    expect(await read()).toMatchObject({exact:true})
    expect(()=>firstReviewExecutionManifestSql({...t,ownerId:"bad'; SELECT 1"})).toThrow()
  })
  it('binds atomic setup requests and recovery to the fixed program/base/designation',()=>{
    const q=fixture(),body={schemaVersion:1,expectedUserId:t.ownerId,programId:t.programId,basePlanVersionId:t.baseId,
      designationId:q.designationId,designationVersion:1,requestId:randomUUID()}
    expect(firstReviewBoundBody(q,'/api/coach/first-reviewed/setup',body)).toMatchObject({mutation:true,closure:false})
    expect(firstReviewBoundBody(q,'/api/coach/first-reviewed/setup/resolution',body)).toMatchObject({mutation:false,closure:false})
    expect(firstReviewBoundBody(q,'/api/coach/first-reviewed/setup/resolve',body)).toMatchObject({mutation:false,closure:true})
    for(const change of [{programId:randomUUID()},{basePlanVersionId:randomUUID()},{designationId:randomUUID()},{designationVersion:2},{expectedUserId:randomUUID()}])expect(firstReviewBoundBody(q,'/api/coach/first-reviewed/setup',{...body,...change})).toBeNull()
  })
  it('renews only the exact retained v1 and rejects stale setup version envelopes',()=>{
    const q=firstReviewFixedFixture(sources,randomUUID(),randomUUID(),2)
    const observed={program:{programId:t.programId,ownerId:t.ownerId,baseId:t.baseId,windowStart:'2026-09-21',sequenceNumber:1,
      active:true,accepted:true,legacy:true,oneOwnedActive:true,unanchored:true,unenrolled:true},
      identities:[t.ownerId,t.reviewerId,t.foreignId].map(id=>({id,synthetic:true,profileExists:true,whoopCount:0})),
      executionManifest:{expectedSessions:3,rawSessions:3,effectiveSessions:3,exact:true},bridgeInstalled:true,designationCount:1,
      latestDesignation:{designationId:firstReviewRenewalSource.designationId,version:1,programId:t.programId,userId:t.ownerId,
        basePlanVersionId:t.baseId,reviewerId:t.reviewerId,targetWindowStart:t.targetWindowStart,enabled:true,expiresAt:'2026-10-06T13:55:00Z'}}
    expect(q).toMatchObject({designationVersion:2,expectedDesignationVersion:1,previousDesignationId:firstReviewRenewalSource.designationId})
    expect(firstReviewRenewalObservation(observed)).toBe(true)
    for(const change of [{designationId:randomUUID()},{version:2},{reviewerId:t.foreignId},{enabled:false},{basePlanVersionId:randomUUID()}])
      expect(firstReviewRenewalObservation({...observed,latestDesignation:{...observed.latestDesignation,...change}})).toBe(false)
    expect(firstReviewRenewalObservation({...observed,designationCount:2})).toBe(false)
    expect(firstReviewRenewalObservation({...observed,executionManifest:{...observed.executionManifest,effectiveSessions:2}})).toBe(false)
    expect(()=>firstReviewFixedFixture(sources,q.runId,firstReviewRenewalSource.designationId,2)).toThrow()
    expect(()=>firstReviewFixedFixture(sources,q.runId,q.designationId,3)).toThrow()
    const body={schemaVersion:1,expectedUserId:t.ownerId,programId:t.programId,basePlanVersionId:t.baseId,
      designationId:q.designationId,designationVersion:2,requestId:randomUUID()}
    expect(firstReviewBoundBody(q,'/api/coach/first-reviewed/setup',body)?.mutation).toBe(true)
    expect(firstReviewBoundBody(q,'/api/coach/first-reviewed/setup',{...body,designationVersion:1})).toBeNull()
  })
  it('reads latest designation metadata without a grant or login',async()=>{
    const sql=firstReviewIdentitySql()
    expect(sql).toContain('BEGIN READ ONLY;')
    expect(sql).toContain('ORDER BY version DESC LIMIT 1')
    expect(sql).not.toContain('version_first_review_designation(')
    expect(sql).not.toMatch(/INSERT|UPDATE|DELETE|SET LOCAL ROLE service_role/)
    await f.db.exec('RESET ROLE')
    // Lifecycle migrations include WHOOP tokens but omit this profile projection.
    await f.db.exec('CREATE TABLE public.user_profiles(user_id uuid)')
    const result=await f.db.exec(sql)
    const observed=result.flatMap(r=>r.rows).find(r=>r.jsonb_build_object)?.jsonb_build_object
    expect(observed).toMatchObject({program:null,designationCount:0,latestDesignation:null,bridgeInstalled:true})
  })
  it('permits the fixed foreign actor through the outer boundary so real route authorization must deny it',()=>{
    const q=fixture(),body={schemaVersion:1,userId:t.foreignId,programId:t.programId,operation:'issue',
      body:{expectedUserId:t.foreignId,programId:t.programId,candidateId:randomUUID(),requestId:randomUUID()}}
    expect(firstReviewBoundBody(q,'/api/coach/first-reviewed',body)?.mutation).toBe(true)
    expect(firstReviewBoundBody(q,'/api/coach/first-reviewed',{...body,userId:randomUUID()})).toBeNull()
  })
  it('requires target dates/sequence and exact profile identity for preview and submit',()=>{
    const q=fixture(),draft={candidateId:randomUUID(),programId:t.programId,basePlanVersionId:t.baseId,designationId:q.designationId,
      windowStart:t.targetWindowStart,sequenceNumber:2,profileSnapshotId:randomUUID(),profileConfirmationRequestId:randomUUID(),confirmedTargetProfile:{startDate:t.targetWindowStart}}
    const body={expectedUserId:t.ownerId,draft}
    expect(firstReviewBoundBody(q,'/api/coach/first-reviewed/preview',body)?.mutation).toBe(false)
    for(const change of [{windowStart:'2026-10-12'},{sequenceNumber:3},{basePlanVersionId:randomUUID()}])expect(firstReviewBoundBody(q,'/api/coach/first-reviewed/preview',{...body,draft:{...draft,...change}})).toBeNull()
    const submit={schemaVersion:1,userId:t.ownerId,programId:t.programId,operation:'submit',body}
    expect(firstReviewBoundBody(q,'/api/coach/first-reviewed',submit)?.mutation).toBe(true)
  })
  it('keeps original issuance and acceptance request keys distinct by operation; getter never counts as mutation',()=>{
    const q=fixture(),body={schemaVersion:1,userId:t.ownerId,programId:t.programId,operation:'issue',
      body:{expectedUserId:t.ownerId,programId:t.programId,candidateId:randomUUID(),requestId:randomUUID()}}
    const issue=firstReviewBoundBody(q,'/api/coach/first-reviewed',body)!
    const accept=firstReviewBoundBody(q,'/api/coach/first-reviewed',{...body,operation:'accept',body:{...body.body,proposalId:randomUUID(),planVersionId:randomUUID()}})!
    expect(issue.key).not.toBe(accept.key)
    expect(firstReviewBoundBody(q,'/api/coach/first-reviewed/resolution',body)).toMatchObject({mutation:false,closure:false})
    expect(firstReviewBoundBody(q,'/api/coach/supervised/issue',body)).toBeNull()
  })
  it('limits discovery to the selected program and recorded candidate/snapshot IDs',()=>{
    const known=randomUUID()
    expect(firstReviewReadPath(`/api/coach/first-reviewed/programs/${t.programId}/setup`)).toBe(true)
    expect(firstReviewReadPath(`/api/coach/first-reviewed/programs/${randomUUID()}`)).toBe(false)
    expect(firstReviewReadPath(`/api/coach/first-reviewed/candidates/${known}`,[])).toBe(false)
    expect(firstReviewReadPath(`/api/coach/first-reviewed/candidates/${known}`,[known])).toBe(true)
  })
  it('requires real fixed-program/designation readback; a failed POST UUID cannot admit a resource',async()=>{
    const q=fixture(),arbitrary=randomUUID(),path=`/api/coach/first-reviewed/profiles/${arbitrary}`
    const sql=firstReviewResourceSql(q,path)!
    expect(sql).toContain(`designation_id='${q.designationId}'`)
    expect(firstReviewReadPath(path)).toBe(false)
    const result=await f.db.exec(sql)
    expect(result.flatMap(r=>r.rows)[0].to_jsonb).toBe(false)
    expect(firstReviewResourceSql(q,'/api/coach/first-reviewed/profiles/invalid')).toBeNull()
    expect(firstReviewResourceSql(q,`/api/coach/supervised/candidates/${arbitrary}`)).toBeNull()
  })
  it.each(['pre-dispatch URL parse','initial receipt save','final receipt save'])('always drains after an injected %s failure',async(message)=>{
    const drain=new LocalRequestDrain()
    await expect(firstReviewAdmitted(drain,async()=>{throw Error(message)})).rejects.toThrow(message)
    await drain.begin()
    expect(await firstReviewAdmitted(drain,async()=>{throw Error('must not run')})).toBe(false)
  })
  it('rejects any extra Auth identity, unrelated row, or duplicate hash unless explicitly scoped',()=>{
    const before={auth_identity:{old:1},coach_first_review_candidates:{},workouts:{old:1}}
    const after={auth_identity:{old:1},coach_first_review_candidates:{approved:1},workouts:{old:1}}
    expect(firstReviewIsolationPreserved(before,after,{coach_first_review_candidates:{approved:1}})).toBe(true)
    expect(firstReviewIsolationPreserved(before,{...after,auth_identity:{old:1,unexpected:1}},{coach_first_review_candidates:{approved:1}})).toBe(false)
    expect(firstReviewIsolationPreserved(before,{...after,workouts:{old:2}},{coach_first_review_candidates:{approved:1}})).toBe(false)
    expect(firstReviewIsolationPreserved(before,after,{})).toBe(false)
  })
  it('requires exact terminal predicates and rejects malformed or missing diagnostics',()=>{
    const names=['active_pointer','direction','goal_summary','goal_target_date','no_enrollment','one_acceptance',
      'one_active_program','program_clock','program_window','title','two_plan_versions','window_sequence_anchor']
    const predicates=Object.fromEntries(names.map(name=>[name,true]))
    const diagnostic={matchedRows:1,checks:[{predicates}]}
    expect(firstReviewTerminalPreserved(diagnostic)).toBe(true)
    const {program_clock,...rest}=predicates
    expect(program_clock).toBe(true)
    for(const value of [null,{}, {...diagnostic,matchedRows:2}, {...diagnostic,checks:[null]},
      {...diagnostic,checks:[{predicates:{...rest,unrelated:true}}]},
      {...diagnostic,checks:[{predicates:{...predicates,program_clock:null}}]}]) {
      expect(firstReviewTerminalPreserved(value)).toBe(false)
    }
  })
  it('independently rejects lowered revisions even when memory validation passes',()=>{
    const before={contextRevision:4,recommendationRevision:5,memoriesValid:true}
    expect(firstReviewMutablePreserved(before,before)).toBe(true)
    for(const key of ['contextRevision','recommendationRevision']) {
      expect(firstReviewMutablePreserved(before,{...before,[key]:0})).toBe(false)
    }
  })
  it('executes fixture-scoped addition and exact accepted-state checks in disposable SQL',async()=>{
    const q=fixture(),tables=['training_programs','training_plan_versions','coach_memories','coach_context_revisions']
    const result=await f.db.exec(firstReviewAllowedAdditionsSql(tables,q))
    const allowed=result.flatMap(r=>r.rows)[0].jsonb_object_agg
    expect(allowed).toEqual(Object.fromEntries([...tables,'auth_identity'].map(name=>[name,{}])))
    const baseline={programUpdatedAt:'2026-10-05T00:00:00Z',capturedAt:'2026-10-06T00:00:00Z'}
    const terminal=await f.db.exec(firstReviewTerminalSql(q,baseline))
    expect(terminal.flatMap(r=>r.rows)[0].to_jsonb).toBe(false)
    expect(()=>firstReviewTerminalSql(q)).toThrow('baseline required')
    expect(()=>firstReviewTerminalSql(q,{...baseline,capturedAt:"2026-10-06T00:00:00Z'; SELECT 1"})).toThrow('baseline required')
    expect(()=>firstReviewAllowedAdditionsSql(['unsafe; drop'],q)).toThrow()
  })
  it('rejects unsafe snapshot identifiers and detects deletion or alteration while permitting added rows',()=>{
    expect(()=>firstReviewSnapshotSql(['training_programs; DROP SCHEMA public'])).toThrow()
    expect(()=>firstReviewSnapshotSql(['coach_memories'],['not-a-uuid'])).toThrow()
    const before={a:{abc:1},b:{def:2}}
    expect(firstReviewPreservesRows(before,{a:{abc:1,new:1},b:{def:2}})).toBe(true)
    expect(firstReviewPreservesRows(before,{a:{abc:1},b:{def:1}})).toBe(false)
    expect(firstReviewPreservesRows(before,{a:{changed:1},b:{def:2}})).toBe(false)
    expect(firstReviewPreservesRows(before,{a:{abc:1},b:{def:2},extra:{}})).toBe(false)
  })
  it('executes read-only preservation SQL and detects a changed program outside the fixed fixture',async()=>{
    const sql=firstReviewSnapshotSql(['training_programs','training_plan_versions','coach_memories','coach_context_revisions'])
    const snapshot=async()=>{const r=await f.db.exec(sql);return r.flatMap(x=>x.rows).find(row=>row.jsonb_object_agg)?.jsonb_object_agg}
    const before=await snapshot();expect(firstReviewPreservesRows(before,await snapshot())).toBe(true)
    await f.db.exec("UPDATE training_programs SET title='Unexpected other-program edit'")
    expect(firstReviewPreservesRows(before,await snapshot())).toBe(false)
  })
})
