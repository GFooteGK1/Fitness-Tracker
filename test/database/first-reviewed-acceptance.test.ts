import { randomUUID } from 'node:crypto'
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from 'vitest'
import { supervisedLifecycleFixture,lifecycleIds,sourceClient } from './supervised-lifecycle-fixture'
import { sqlFile } from './fixture'
import { createFirstReviewedProfileService } from '@/app/lib/coach/first-reviewed-profile-service'
import { prepareFirstReviewedCandidate } from '@/app/lib/coach/first-reviewed-candidate-server'
import { effortWorkInput } from '../fixtures/reviewed-effort-work'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { createFirstReviewedReviewService } from '@/app/lib/coach/first-reviewed-review-service'
import { createFirstReviewedLifecycleService } from '@/app/lib/coach/first-reviewed-lifecycle-service'
import type { FirstReviewedDraft } from '@/app/lib/coach/first-reviewed-contract'
import type { FirstReviewedPending } from '@/app/lib/coach/first-reviewed-request-resolution'
import { parseFirstReviewedRequestResolution } from '@/app/lib/coach/first-reviewed-request-resolution'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFirstReviewedHttp } from '@/app/lib/coach/first-reviewed-http'
import { validateFirstReviewedProfileSnapshot } from '@/app/lib/coach/first-reviewed-profile-validation'
import { parseFirstReviewedProfileReceipt } from '@/app/lib/coach/first-reviewed-profile-contract'
import { readFirstReviewWorkspace } from '@/app/lib/coach/first-reviewed-workspace-reader'
import { createFirstReviewWorkspaceHttp } from '@/app/lib/coach/first-reviewed-workspace-http'
import { saveFirstReviewedPending,readFirstReviewedPending,performFirstReviewedPending } from '@/app/lib/coach/first-reviewed-pending'
import { readFirstReviewedSetup } from '@/app/lib/coach/first-reviewed-setup-reader'
import { createFirstReviewedSetupHttp } from '@/app/lib/coach/first-reviewed-setup-http'
import { currentSetupContents } from '../fixtures/first-reviewed-setup'
import { createFirstReviewedPreviewHttp } from '@/app/lib/coach/first-reviewed-preview-http'
import { parseFirstReviewedPreview } from '@/app/lib/coach/first-reviewed-preview'

const migration='supabase/migrations/20261005155602_first_reviewed_acceptance.sql'
describe('first reviewed issuance and atomic acceptance (disposable SQL, not real Auth)',()=>{
  let f:Awaited<ReturnType<typeof supervisedLifecycleFixture>>
  const {owner,reviewer,foreign,program,base}=lifecycleIds
  async function boot(){
    const fresh=await supervisedLifecycleFixture(true,true,true)
    for(const file of ['20261003150403_supervised_issue_closure_preflight.sql','20261005120000_first_reviewed_designation.sql',
      '20261005130000_first_reviewed_candidates.sql']) await fresh.db.exec(sqlFile(`supabase/migrations/${file}`))
    await fresh.db.exec(sqlFile(migration))
    await fresh.db.exec(sqlFile('supabase/migrations/20261005172408_first_reviewed_workspace.sql'));return fresh
  }
  beforeAll(async()=>{f=await boot()},30000)
  beforeEach(async()=>{await f.db.exec('BEGIN')})
  afterEach(async()=>{await f.db.exec('ROLLBACK; RESET ROLE')})
  afterAll(async()=>{await f?.db.close()})
  async function designation(expected=0,enabled=true,designatedReviewer=reviewer){
    const id=randomUUID(); await f.actor(owner,'service_role')
    await f.scalar('SELECT version_first_review_designation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value',
      [id,program,owner,base,designatedReviewer,expected,'2026-10-05',enabled,new Date(Date.now()+3600000).toISOString(),'disposable acceptance qualification'])
    return id
  }
  async function preparedCandidate(useHttp=false,designatedReviewer=reviewer,goalSummary?:string){
    const id=await designation(0,true,designatedReviewer)
    if(f.initialWeek.kind!=='weekly_plan')throw Error('Expected legacy base')
    const profile={...structuredClone(f.initialWeek.profileSnapshot),startDate:'2026-10-05'}
    if(goalSummary){
      profile.athleteGoalSummary=goalSummary
      profile.primaryGoal.athleteIntent=goalSummary
      await saveSetup('primary_goal',{goal:goalSummary,primaryDomain:profile.primaryGoal.domain,
        secondaryGoals:structuredClone(profile.secondaryGoals)})
    }
    const profiles=createFirstReviewedProfileService({enabled:()=>true,createServiceClient:()=>sourceClient(f.db,owner,'service_role')})
    const profileRequest={snapshotId:randomUUID(),designationId:id,programId:program,
      basePlanVersionId:base,historyDays:90,tzOffset:0,windowStart:profile.startDate,targetSetup:profile}
    const s=services(),http=createFirstReviewedHttp({createUserClient:async()=>s.actorDb,profiles,review:s.review,life:s.life})
    const send=(pending:FirstReviewedPending)=>http.execute(new Request('http://localhost/api/coach/first-reviewed',{method:'POST',body:JSON.stringify(pending)}))
    const result=useHttp?await(await send({schemaVersion:1,userId:owner,programId:program,operation:'prepare_profile',
      body:{expectedUserId:owner,request:profileRequest}})).json():await profiles.prepare(sourceClient(f.db,owner),owner,profileRequest)
    const snapshot=validateFirstReviewedProfileSnapshot(result.snapshot)
    if(result.kind!=='saved'||!snapshot)throw Error(`Expected exact saved first profile: ${JSON.stringify(result)}`)
    const requestId=randomUUID()
    const confirmation={snapshotId:snapshot.snapshotId,requestId,expectedUserId:owner,
      contentHash:snapshot.contentHash,sourceHash:snapshot.sourceHash,profileHash:snapshot.profileHash}
    const confirmed=useHttp?await(await send({schemaVersion:1,userId:owner,programId:program,operation:'confirm_profile',body:confirmation})).json()
      :await profiles.confirm(sourceClient(f.db,owner),confirmation)
    if(confirmed.kind!=='confirmed'||!parseFirstReviewedProfileReceipt(confirmed.receipt))throw Error('Expected exact first profile confirmation')
    const input=effortWorkInput(),recipe=input.registry[0].recipe
    const inputDraft:FirstReviewedDraft={candidateId:randomUUID(),designationId:id,programId:program,
      basePlanVersionId:base,profileSnapshotId:snapshot.snapshotId,profileConfirmationRequestId:requestId,
      historyDays:90,tzOffset:0,windowStart:profile.startDate,sequenceNumber:2,confirmedTargetProfile:snapshot.projection.profile,
      confirmedTargetProfileHash:snapshot.profileHash,
      recipe:{sessions:recipe.sessions,baseSchedule:recipe.baseSchedule,schedules:recipe.schedules,protocols:recipe.protocols,instructions:recipe.instructions,limitations:recipe.limitations},
      scheduleId:input.input.context.scheduleId,rationale:'Mechanical complete first-week acceptance, not athlete suitability.'}
    const prepared=await prepareFirstReviewedCandidate(sourceClient(f.db,owner),inputDraft)
    if(prepared.kind!=='prepared_first_candidate')throw Error(JSON.stringify(prepared))
    return {...prepared,inputDraft}
  }
  async function candidate(approve=true,designatedReviewer=reviewer){
    const prepared=await preparedCandidate(false,designatedReviewer),id=prepared.designationId
    await f.actor(owner,'service_role')
    const saved=await f.scalar<{contentHash:string;sourceHash:string}>('SELECT submit_first_review_candidate($1,$2,$3,$4) AS value',
      [prepared.candidateId,id,JSON.stringify(prepared.privatePacket),JSON.stringify(prepared.reviewPacket)])
    if(approve){await f.actor(designatedReviewer);await f.scalar('SELECT decide_first_review_candidate($1,$2,$3,$4,$5,$6) AS value',
      [prepared.candidateId,randomUUID(),'approve',saved.contentHash,saved.sourceHash,id])}
    return {...prepared,saved}
  }
  async function register(c:Awaited<ReturnType<typeof candidate>>,packet=c.privatePacket){
    await f.actor(owner,'service_role')
    return f.scalar<{registrationId:string;proposalId:string;planVersionId:string}>('SELECT register_reviewed_week_proposal($1,$2,$3) AS value',
      [c.candidateId,JSON.stringify(packet),doseContentHash(packet)])
  }
  async function issued(){
    const c=await candidate(),r=await register(c),key=randomUUID()
    await f.actor(owner)
    const value=await f.scalar('SELECT create_registered_reviewed_week_proposal($1,$2) AS value',[r.registrationId,key])
    return{c,r,key,value}
  }
  async function accept(p:Awaited<ReturnType<typeof issued>>,fn='accept_adaptation_proposal'){
    await f.actor(owner)
    return f.scalar(`SELECT to_jsonb(a) AS value FROM ${fn}($1,$2) a`,[p.r.proposalId,p.key])
  }
  async function rejected(work:()=>Promise<unknown>,code:string){
    await f.db.exec('SAVEPOINT rejection')
    try{await expect(work()).rejects.toMatchObject({code})}
    finally{await f.db.exec('ROLLBACK TO SAVEPOINT rejection; RELEASE SAVEPOINT rejection')}
  }
  async function count(table:string){
    await f.db.exec('RESET ROLE');return f.scalar<number>(`SELECT count(*)::int AS value FROM ${table}`)
  }
  type RpcHook=(name:string,result:{data:unknown;error:unknown})=>Promise<{data:unknown;error:unknown}>
  function services(enabled=()=>true,privateHook?:RpcHook){
    const ownerCalls:string[]=[],reviewerCalls:string[]=[],privateCalls:string[]=[]
    const actorDb=sourceClient(f.db,owner,'authenticated',ownerCalls)
    const reviewerDb=sourceClient(f.db,reviewer,'authenticated',reviewerCalls)
    const rawPrivate=sourceClient(f.db,owner,'service_role',privateCalls)
    const privateDb=privateHook?intercept(rawPrivate,privateHook):rawPrivate
    const review=createFirstReviewedReviewService({enabled,createServiceClient:()=>privateDb})
    return {review,life:createFirstReviewedLifecycleService({enabled,createServiceClient:()=>privateDb,review}),
      actorDb,reviewerDb,privateDb,ownerCalls,reviewerCalls,privateCalls}
  }
  function issueRequest(candidateId:string,key=randomUUID()):FirstReviewedPending & {operation:'issue'}{
    return {schemaVersion:1,userId:owner,programId:program,operation:'issue',
      body:{expectedUserId:owner,programId:program,candidateId,requestId:key}}
  }
  function acceptRequest(p:Awaited<ReturnType<typeof issued>>):FirstReviewedPending & {operation:'accept'}{
    return {schemaVersion:1,userId:owner,programId:program,operation:'accept',body:{expectedUserId:owner,programId:program,
      candidateId:p.c.candidateId,proposalId:p.r.proposalId,planVersionId:p.r.planVersionId,requestId:p.key,
      contentHash:p.c.saved.contentHash,sourceHash:p.c.saved.sourceHash}}
  }
  function intercept(db:SupabaseClient,hook:RpcHook):SupabaseClient {
    return {...db,rpc:async(name:string,args:Record<string,unknown>)=>hook(name,await db.rpc(name,args))} as unknown as SupabaseClient
  }
  async function saveSetup(key:string,content:Record<string,unknown>){
    await f.actor(owner)
    return f.db.query('SELECT * FROM confirm_coach_memory($1,$2,$3,$4,$5,$6)',[key,
      {primary_goal:'goal',training_schedule:'schedule',available_equipment:'equipment',training_constraints:'constraint'}[key],
      JSON.stringify(content),'{"source":"athlete_confirmed"}',1,randomUUID()])
  }
  async function currentSetup(){const id=await designation();for(const [key,content] of Object.entries(currentSetupContents()))await saveSetup(key,content);return id}
  const setupQuery={expectedUserId:owner,programId:program,historyDays:90,tzOffset:300}
  it('reads current owned declarations without writes and binds them through real SQL profile confirmation',async()=>{
    const id=await currentSetup();await f.db.exec('RESET ROLE')
    const original=await f.scalar('SELECT to_jsonb(v) AS value FROM training_plan_versions v WHERE id=$1',[base])
    const memoriesBefore=await count('coach_memories'),snapshotsBefore=await count('coach_first_review_profile_snapshots')
    const r=await readFirstReviewedSetup(sourceClient(f.db,owner),setupQuery)
    expect(r.kind).toBe('setup');if(r.kind!=='setup')throw Error(JSON.stringify(r))
    expect(r.seed).toMatchObject({designationId:id,factsLoaded:false,numericRuntimeEligible:false,targetSetup:{primaryGoal:{domain:'aerobic'},
      sessionAvailability:[{day:'tuesday',minutes:45},{day:'saturday',minutes:75}],equipment:{athleteDescription:' A bench, barbell and an unmeasured outdoor area. '}}})
    expect(await count('coach_memories')).toBe(memoriesBefore);expect(await count('coach_first_review_profile_snapshots')).toBe(snapshotsBefore)
    const service=createFirstReviewedProfileService({enabled:()=>true,createServiceClient:()=>sourceClient(f.db,owner,'service_role')})
    const saved=await service.prepare(sourceClient(f.db,owner),owner,{snapshotId:randomUUID(),designationId:id,programId:program,
      basePlanVersionId:base,historyDays:r.seed.historyDays,tzOffset:r.seed.tzOffset,windowStart:r.seed.windowStart,targetSetup:r.seed.targetSetup})
    expect(saved.kind).toBe('saved');if(saved.kind!=='saved')throw Error(JSON.stringify(saved))
    expect(saved.snapshot.projection.profile.sessionAvailability).toEqual(r.seed.targetSetup.sessionAvailability)
    expect(saved.snapshot.projection.profile.planningContext).toMatchObject({loggingCoverage:'unknown'})
    const confirmed=await service.confirm(sourceClient(f.db,owner),{snapshotId:saved.snapshot.snapshotId,requestId:randomUUID(),expectedUserId:owner,
      contentHash:saved.snapshot.contentHash,sourceHash:saved.snapshot.sourceHash,profileHash:saved.snapshot.profileHash})
    expect(confirmed.kind).toBe('confirmed');await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT to_jsonb(v) AS value FROM training_plan_versions v WHERE id=$1',[base])).toEqual(original)
  })
  it('keeps missing declarations reviewable without copying the old accepted profile',async()=>{
    await designation()
    expect(await readFirstReviewedSetup(sourceClient(f.db,owner),setupQuery)).toEqual({kind:'setup_required',
      keys:['primary_goal','training_schedule','available_equipment','training_constraints']})
  })
  it('returns an overdue declaration for correction without reviving previous content',async()=>{
    await currentSetup();await f.db.exec('RESET ROLE')
    await f.db.query("UPDATE coach_memories SET review_after=now()-interval '1 second' WHERE user_id=$1 AND memory_key='training_schedule'",[owner])
    expect(await readFirstReviewedSetup(sourceClient(f.db,owner),setupQuery)).toEqual({kind:'setup_required',keys:['training_schedule']})
  })
  it('keeps declaration GET readable with the application switch off and creates no confirmation',async()=>{
    await currentSetup();const http=createFirstReviewedSetupHttp({createUserClient:async()=>sourceClient(f.db,owner),enabled:()=>false})
    const r=await http.read(new Request('http://localhost/setup?tzOffset=300'),program)
    expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store')
    expect(await r.json()).toMatchObject({kind:'setup',writesEnabled:false,numericRuntimeEligible:false,seed:{factsLoaded:false,historyDays:90}})
    expect(await count('coach_first_review_profile_snapshots')).toBe(0)
  })
  it('does not grant standalone setup visibility to a designated reviewer or foreign athlete',async()=>{
    await currentSetup()
    for(const actor of [reviewer,foreign])expect(await readFirstReviewedSetup(sourceClient(f.db,actor),{...setupQuery,expectedUserId:actor})).toEqual({kind:'not_found'})
    expect(await readFirstReviewedSetup(sourceClient(f.db,foreign),setupQuery)).toEqual({kind:'account_changed'})
  })
  it('requires an enabled current designation for a setup seed',async()=>{
    await currentSetup();await designation(1,false)
    expect(await readFirstReviewedSetup(sourceClient(f.db,owner),setupQuery)).toEqual({kind:'review_required'})
  })
  it('fences a changed saved declaration before returning the setup seed',async()=>{
    await currentSetup();let reads=0
    const db=intercept(sourceClient(f.db,owner),async(name,r)=>{
      if(name==='get_first_review_program_workspace'&&++reads===2){const c=currentSetupContents().training_schedule;
        c.sessionAvailability=[{day:'tuesday',minutes:60},{day:'saturday',minutes:75}];await saveSetup('training_schedule',c)}return r})
    expect(await readFirstReviewedSetup(db,setupQuery)).toEqual({kind:'unavailable'})
  })
  it('fences an account change during discovery',async()=>{
    await currentSetup();const db=sourceClient(f.db,owner);let reads=0
    const changing={...db,auth:{getUser:async()=>({data:{user:{id:++reads<3?owner:foreign}},error:null})}} as unknown as SupabaseClient
    expect(await readFirstReviewedSetup(changing,setupQuery)).toEqual({kind:'unavailable'})
  })
  it('authenticates before rejecting malformed query scope and rejects duplicate or implicit timezone',async()=>{
    const db=sourceClient(f.db,owner),anon={...db,auth:{getUser:async()=>({data:{user:null},error:null})}} as unknown as SupabaseClient
    const anonymous=createFirstReviewedSetupHttp({createUserClient:async()=>anon,enabled:()=>true})
    expect((await anonymous.read(new Request('http://localhost/setup?garbage=true'),'bad')).status).toBe(401)
    const http=createFirstReviewedSetupHttp({createUserClient:async()=>db,enabled:()=>true})
    for(const query of ['', '?tzOffset=300&tzOffset=0','?tzOffset=300&extra=true','?tzOffset=300.5','?tzOffset=9999','?tzOffset=300&historyDays=181']){
      const r=await http.read(new Request(`http://localhost/setup${query}`),program);expect(r.status).toBe(400)
      expect(r.headers.get('cache-control')).toBe('private, no-store')
    }
  })
  it('discovers real saved candidate and owner-only confirmed context through bounded getters',async()=>{
    const c=await candidate(false)
    const ownerRead=await readFirstReviewWorkspace(sourceClient(f.db,owner),{expectedUserId:owner,programId:program},'workspace')
    expect(ownerRead.kind).toBe('workspace');if(ownerRead.kind!=='workspace')throw Error('owner workspace missing')
    expect(ownerRead.page.candidates).toEqual([{candidateId:c.candidateId,designationId:c.designationId,designationVersion:1,reviewerId:reviewer,
      createdAt:expect.any(String),decision:'pending',proposalId:null,proposalStatus:null,planVersionId:null,proposalRequestId:null}])
    const profiles=await readFirstReviewWorkspace(sourceClient(f.db,owner),{expectedUserId:owner,programId:program},'snapshots')
    expect(profiles.kind).toBe('snapshots');if(profiles.kind!=='snapshots')throw Error('owner context missing')
    expect(profiles.page.snapshots[0]).toMatchObject({snapshotId:c.inputDraft.profileSnapshotId,designationId:c.designationId,
      confirmationRequestId:c.inputDraft.profileConfirmationRequestId,confirmedAt:expect.any(String)})
    expect(JSON.stringify(profiles)).not.toContain('projection')
    const h=createFirstReviewWorkspaceHttp({createUserClient:async()=>sourceClient(f.db,reviewer),enabled:()=>true})
    const r=await h.readProgram(new Request('http://localhost/programs'),program);expect(r.status).toBe(200)
    expect((await r.json()).page.candidates[0].candidateId).toBe(c.candidateId)
    expect((await h.listSnapshots(new Request('http://localhost/programs'),program)).status).toBe(404)
  })
  it('preserves owner candidate/context history after reviewer replacement while rejecting old candidate cursors',async()=>{
    const c=await candidate(false);await designation(1,true)
    const ownerPage=await readFirstReviewWorkspace(sourceClient(f.db,owner),{expectedUserId:owner,programId:program},'workspace')
    expect(ownerPage).toMatchObject({kind:'workspace',page:{candidates:[{candidateId:c.candidateId,designationVersion:1}]}})
    const reviewerDb=sourceClient(f.db,reviewer)
    expect(await readFirstReviewWorkspace(reviewerDb,{expectedUserId:reviewer,programId:program},'workspace')).toMatchObject({kind:'workspace',page:{candidates:[]}})
    expect(await readFirstReviewWorkspace(reviewerDb,{expectedUserId:reviewer,programId:program,afterCandidateId:c.candidateId},'workspace')).toEqual({kind:'unavailable'})
    expect(await readFirstReviewWorkspace(sourceClient(f.db,owner),{expectedUserId:owner,programId:program},'snapshots'))
      .toMatchObject({kind:'snapshots',page:{snapshots:[{snapshotId:c.inputDraft.profileSnapshotId}]}})
  })
  it('discovers issued and accepted exact plan linkage without granting reviewer post-acceptance access',async()=>{
    const p=await issued()
    const read=()=>readFirstReviewWorkspace(sourceClient(f.db,owner),{expectedUserId:owner,programId:program},'workspace')
    expect(await read()).toMatchObject({kind:'workspace',page:{candidates:[{candidateId:p.c.candidateId,decision:'approve',
      proposalId:p.r.proposalId,proposalStatus:'proposed',planVersionId:p.r.planVersionId,proposalRequestId:p.key}]}})
    const reviewerRead=await readFirstReviewWorkspace(sourceClient(f.db,reviewer),{expectedUserId:reviewer,programId:program},'workspace')
    expect(reviewerRead).toMatchObject({kind:'workspace',page:{candidates:[{proposalId:p.r.proposalId,proposalRequestId:null}]}})
    expect(JSON.stringify(reviewerRead)).not.toContain(p.key)
    await accept(p)
    expect(await read()).toMatchObject({kind:'workspace',page:{program:{reviewAvailable:false,activePlanVersionId:p.r.planVersionId,
      legacyBase:{planVersionId:base}},candidates:[{proposalStatus:'accepted',proposalId:p.r.proposalId,proposalRequestId:p.key}]}})
    expect(await readFirstReviewWorkspace(sourceClient(f.db,reviewer),{expectedUserId:reviewer,programId:program},'workspace')).toEqual({kind:'not_found'})
    await designation(1,false)
    expect(await read()).toMatchObject({kind:'workspace',page:{candidates:[{candidateId:p.c.candidateId}]}})
    expect(await readFirstReviewWorkspace(sourceClient(f.db,owner),{expectedUserId:owner,programId:program},'snapshots'))
      .toMatchObject({kind:'snapshots',page:{snapshots:[{snapshotId:p.c.inputDraft.profileSnapshotId}]}})
  })
  it('paginates candidate and profile history independently without exposing source packets',async()=>{
    const first=await candidate(false),profiles=createFirstReviewedProfileService({enabled:()=>true,createServiceClient:()=>sourceClient(f.db,owner,'service_role')})
    const request={snapshotId:randomUUID(),designationId:first.designationId,programId:program,basePlanVersionId:base,
      historyDays:90,tzOffset:0,windowStart:'2026-10-05',targetSetup:first.inputDraft.confirmedTargetProfile}
    expect((await profiles.prepare(sourceClient(f.db,owner),owner,request)).kind).toBe('saved')
    const second=randomUUID(),prepared=await prepareFirstReviewedCandidate(sourceClient(f.db,owner),{...first.inputDraft,candidateId:second})
    if(prepared.kind!=='prepared_first_candidate')throw Error('second candidate preparation failed')
    await f.actor(owner,'service_role')
    await f.scalar('SELECT submit_first_review_candidate($1,$2,$3,$4) AS value',[second,first.designationId,
      JSON.stringify(prepared.privatePacket),JSON.stringify(prepared.reviewPacket)])
    for(const [kind,cursorKey,ids] of [['workspace','afterCandidateId',[first.candidateId,second]],
      ['snapshots','afterSnapshotId',[first.inputDraft.profileSnapshotId,request.snapshotId]]] as const){
      const sorted=[...ids].sort(),a=await readFirstReviewWorkspace(sourceClient(f.db,owner),{expectedUserId:owner,programId:program,limit:1},kind)
      expect(a.kind).toBe(kind);if(a.kind!==kind)throw Error('page missing')
      const next=a.kind==='workspace'?a.page.nextAfterCandidateId:a.kind==='snapshots'?a.page.nextAfterSnapshotId:null
      expect(next).toBe(sorted[0])
      const b=await readFirstReviewWorkspace(sourceClient(f.db,owner),{expectedUserId:owner,programId:program,limit:1,[cursorKey]:next},kind)
      expect(b.kind).toBe(kind)
      if(b.kind==='workspace')expect(b.page.candidates.map(c=>c.candidateId)).toEqual([sorted[1]])
      else if(b.kind==='snapshots')expect(b.page.snapshots.map(s=>s.snapshotId)).toEqual([sorted[1]])
      expect(JSON.stringify(a)).not.toContain('privatePacket');expect(JSON.stringify(b)).not.toContain('sourceHash')
    }
  })
  it('permits explicitly designated owner review but requires separate issuance and athlete acceptance',async()=>{
    const c=await candidate(true,owner),s=services(),key=randomUUID()
    expect(await count('coach_first_review_acceptances')).toBe(0)
    const result=await s.life.issue(s.actorDb,issueRequest(c.candidateId,key))
    expect(result.kind).toBe('issued');if(result.kind!=='issued')throw Error('Expected distinct issued proposal')
    expect(await count('coach_first_review_acceptances')).toBe(0)
    const page=await readFirstReviewWorkspace(s.actorDb,{expectedUserId:owner,programId:program},'workspace')
    expect(page.kind).toBe('workspace');if(page.kind!=='workspace')throw Error('Expected owned reload metadata')
    expect(page.page.program.role).toBe('athlete');expect(page.page.program.latestDesignation?.reviewerId).toBe(owner)
    const summary=page.page.candidates[0];expect(summary.proposalRequestId).toBe(key)
    const accepted=await s.life.accept(s.actorDb,{schemaVersion:1,userId:owner,programId:program,operation:'accept',body:{expectedUserId:owner,programId:program,candidateId:c.candidateId,
      proposalId:summary.proposalId!,planVersionId:summary.planVersionId!,requestId:summary.proposalRequestId!,contentHash:c.saved.contentHash,sourceHash:c.saved.sourceHash}})
    expect(accepted.kind).toBe('accepted');expect(await count('coach_first_review_acceptances')).toBe(1)
    expect(await count('coach_supervised_enrollments')).toBe(0)
  })
  it('previews exact complete content through SQL-backed context without candidate, review, proposal or acceptance writes',async()=>{
    const c=await preparedCandidate(),db=sourceClient(f.db,owner),http=createFirstReviewedPreviewHttp({createUserClient:async()=>db,enabled:()=>true})
    const tables=['coach_first_review_candidates','coach_first_review_decisions','coach_reviewed_proposal_registrations','adaptation_proposals','coach_first_review_acceptances']
    const before=await Promise.all(tables.map(t=>count(t)))
    const response=await http.preview(new Request('http://localhost/preview',{method:'POST',body:JSON.stringify({expectedUserId:owner,draft:c.inputDraft})}))
    expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body=await response.json(),parsed=await parseFirstReviewedPreview(body,c.inputDraft)
    expect(parsed).toEqual({draft:c.inputDraft,packet:c.reviewPacket})
    expect(JSON.stringify(body)).not.toContain('privatePacket')
    expect(await Promise.all(tables.map(t=>count(t)))).toEqual(before)
    for(const corrupt of [
      {...body,programId:foreign},{...body,draftHash:'f'.repeat(64)},
      {...body,reviewPacket:{...body.reviewPacket,profileFacts:{...body.reviewPacket.profileFacts,confirmationRequestId:randomUUID()}}},
    ])expect(await parseFirstReviewedPreview(corrupt,c.inputDraft)).toBeNull()
  })
  it('preview rejects foreign actors, disabled writes and incomplete prescriptions without saving a candidate',async()=>{
    const c=await preparedCandidate()
    const request=(draft=c.inputDraft,expectedUserId=owner)=>new Request('http://localhost/preview',{method:'POST',body:JSON.stringify({expectedUserId,draft})})
    const http=(actor=owner,enabled=true)=>createFirstReviewedPreviewHttp({createUserClient:async()=>sourceClient(f.db,actor),enabled:()=>enabled})
    expect((await http().preview(request(c.inputDraft,foreign))).status).toBe(409)
    expect((await http(foreign).preview(request(c.inputDraft,foreign))).status).toBe(409)
    expect((await http(owner,false).preview(request())).status).toBe(409)
    const broken=structuredClone(c.inputDraft);broken.recipe.sessions[0].steps=[]
    expect((await http().preview(request(broken))).status).toBe(409)
    expect(await count('coach_first_review_candidates')).toBe(0)
    expect(await count('coach_first_review_acceptances')).toBe(0)
  })
  it('runs all six authenticated HTTP handlers through real disposable SQL with bounded public responses',async()=>{
    const c=await preparedCandidate(true),s=services(),profiles=createFirstReviewedProfileService({enabled:()=>true,createServiceClient:()=>s.privateDb})
    const http=(db:SupabaseClient)=>createFirstReviewedHttp({createUserClient:async()=>db,profiles,review:s.review,life:s.life})
    const call=async(db:SupabaseClient,pending:FirstReviewedPending)=>{
      const response=await http(db).execute(new Request('http://localhost/api/coach/first-reviewed',{method:'POST',body:JSON.stringify(pending)}))
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(response.status).toBe(200)
      const value=await response.json();expect(JSON.stringify(value)).not.toContain('privatePacket');return value
    }
    const submit:FirstReviewedPending={schemaVersion:1,userId:owner,programId:program,operation:'submit',body:{expectedUserId:owner,draft:c.inputDraft}}
    const saved=await call(s.actorDb,submit)
    const read=await http(s.reviewerDb).readCandidate(c.candidateId)
    expect(read.status).toBe(200);expect((await read.json()).candidate.reviewPacket).toEqual(c.reviewPacket)
    expect((await http(sourceClient(f.db,foreign)).readCandidate(c.candidateId)).status).toBe(404)
    const decision:FirstReviewedPending={schemaVersion:1,userId:reviewer,programId:program,operation:'decide',body:{expectedUserId:reviewer,
      candidateId:c.candidateId,designationId:c.designationId,requestId:randomUUID(),decision:'approve',
      contentHash:saved.candidate.contentHash,sourceHash:saved.candidate.sourceHash}}
    await call(s.reviewerDb,decision)
    const issue=issueRequest(c.candidateId),issued=await call(s.actorDb,issue)
    expect(await count('coach_first_review_acceptances')).toBe(0)
    // Reconstruct a new client as a reload would. Acceptance uses authoritative
    // owner metadata, not the in-memory issuance response or a newly generated key.
    const workspaceHttp=createFirstReviewWorkspaceHttp({createUserClient:async()=>sourceClient(f.db,owner),enabled:()=>true})
    const reloaded=await workspaceHttp.readProgram(new Request('http://localhost/programs'),program)
    expect(reloaded.status).toBe(200)
    const summary=(await reloaded.json()).page.candidates[0]
    expect(summary.proposalRequestId).toBe(issue.body.requestId)
    const acceptance:FirstReviewedPending={schemaVersion:1,userId:owner,programId:program,operation:'accept',body:{expectedUserId:owner,programId:program,
      candidateId:summary.candidateId,proposalId:summary.proposalId,planVersionId:summary.planVersionId,requestId:summary.proposalRequestId,
      contentHash:saved.candidate.contentHash,sourceHash:saved.candidate.sourceHash}}
    const accepted=await call(s.actorDb,acceptance)
    expect(accepted).toMatchObject({kind:'accepted',receipt:{planVersionId:issued.planVersionId},numericRuntimeEligible:false})
    expect(await count('coach_supervised_initial_bases')).toBe(1)
    expect(await count('coach_supervised_enrollments')).toBe(0)
    await f.db.exec('SET CONSTRAINTS ALL IMMEDIATE')
  })
  it('recovers each browser operation from lost HTTP response using only its SQL-backed getter while writes are disabled',async()=>{
    const designationId=await designation();let enabled=true,actor=owner
    const s=services(()=>enabled),profiles=createFirstReviewedProfileService({enabled:()=>enabled,createServiceClient:()=>s.privateDb})
    const http=()=>createFirstReviewedHttp({createUserClient:async()=>sourceClient(f.db,actor),profiles,review:s.review,life:s.life})
    const records=new Map<string,string>(),store={getItem:(k:string)=>records.get(k)??null,
      setItem:(k:string,v:string)=>{records.set(k,v)},removeItem:(k:string)=>{records.delete(k)}}
    const paths:string[]=[]
    const fetcher:typeof fetch=async(url,init)=>{
      const path=url.toString();paths.push(path)
      const request=new Request(`http://localhost${path}`,init),h=http()
      const response=path.endsWith('/resolution')?await h.resolution(request):await h.execute(request)
      expect(response.status).toBe(200)
      if(!path.endsWith('/resolution'))throw Error('Lost browser response after saved write')
      return response
    }
    const recover=async(pending:FirstReviewedPending)=>{
      enabled=true;actor=pending.userId;saveFirstReviewedPending(store,pending)
      await expect(performFirstReviewedPending(store,pending,()=>actor,'send',fetcher)).rejects.toThrow('Lost browser response')
      expect(readFirstReviewedPending(store,actor,program)).toEqual(pending)
      enabled=false
      const failures=pending.operation==='prepare_profile'?['requestHash','profileHash','factsHash','assessments']
        :pending.operation==='submit'?['draftHash']:[]
      for(const failure of failures){
        const corrupted:typeof fetch=async(url,init)=>{
          const response=await fetcher(url,init),value=await response.json(),result=value.resolution.result
          if(failure==='requestHash'||failure==='profileHash')result[failure]='a'.repeat(64)
          else if(failure==='factsHash')result.projection.factsHash='a'.repeat(64)
          else if(failure==='assessments')result.projection.assessments=[...result.projection.profile.assessments,{}]
          else for(const session of result.reviewPacket.week.scheduledSessions)session.prescription.source.review.contentHash='a'.repeat(64)
          // These remain structurally valid receipts. The additional canonical
          // browser integrity check must reject them without clearing user work.
          expect(parseFirstReviewedRequestResolution(value.resolution,pending)).not.toBeNull()
          return Response.json(value)
        }
        await expect(performFirstReviewedPending(store,pending,()=>actor,'recover',corrupted)).rejects.toThrow()
        expect(readFirstReviewedPending(store,actor,program)).toEqual(pending)
      }
      const before=paths.length,result=await performFirstReviewedPending(store,pending,()=>actor,'recover',fetcher)
      expect(paths.slice(before)).toEqual(['/api/coach/first-reviewed/resolution'])
      expect(result.disposition).toBe('saved');expect(readFirstReviewedPending(store,actor,program)).toBeNull()
      if(result.disposition!=='saved')throw Error('Expected saved original request')
      return result.result
    }
    if(f.initialWeek.kind!=='weekly_plan')throw Error('Expected legacy profile')
    const targetSetup={...structuredClone(f.initialWeek.profileSnapshot),startDate:'2026-10-05'}
    const snapshotId=randomUUID(),snapshot=validateFirstReviewedProfileSnapshot(await recover({schemaVersion:1,userId:owner,programId:program,
      operation:'prepare_profile',body:{expectedUserId:owner,request:{snapshotId,designationId,programId:program,basePlanVersionId:base,
        historyDays:90,tzOffset:0,windowStart:targetSetup.startDate,targetSetup}}}))
    if(!snapshot)throw Error('Expected exact saved snapshot')
    const confirmationId=randomUUID()
    await recover({schemaVersion:1,userId:owner,programId:program,operation:'confirm_profile',body:{expectedUserId:owner,
      snapshotId,requestId:confirmationId,contentHash:snapshot.contentHash,sourceHash:snapshot.sourceHash,profileHash:snapshot.profileHash}})
    const input=effortWorkInput(),recipe=input.registry[0].recipe,candidateId=randomUUID()
    const draft:FirstReviewedDraft={candidateId,designationId,programId:program,basePlanVersionId:base,profileSnapshotId:snapshotId,
      profileConfirmationRequestId:confirmationId,historyDays:90,tzOffset:0,windowStart:targetSetup.startDate,sequenceNumber:2,
      confirmedTargetProfile:snapshot.projection.profile,confirmedTargetProfileHash:snapshot.profileHash,
      recipe:{sessions:recipe.sessions,baseSchedule:recipe.baseSchedule,schedules:recipe.schedules,protocols:recipe.protocols,
        instructions:recipe.instructions,limitations:recipe.limitations},scheduleId:input.input.context.scheduleId,
      rationale:'Synthetic complete browser recovery qualification, not athlete training.'}
    const saved=await recover({schemaVersion:1,userId:owner,programId:program,operation:'submit',body:{expectedUserId:owner,draft}})
    const hashes={contentHash:saved.contentHash as string,sourceHash:saved.sourceHash as string}
    await recover({schemaVersion:1,userId:reviewer,programId:program,operation:'decide',body:{expectedUserId:reviewer,
      candidateId,designationId,requestId:randomUUID(),decision:'approve',...hashes}})
    const issue=issueRequest(candidateId),issued=await recover(issue)
    expect(await count('coach_first_review_acceptances')).toBe(0)
    await recover({schemaVersion:1,userId:owner,programId:program,operation:'accept',body:{expectedUserId:owner,programId:program,
      candidateId,proposalId:issued.proposalId as string,planVersionId:issued.planVersionId as string,requestId:issue.body.requestId,...hashes}})
    expect(paths.filter(p=>!p.endsWith('/resolution'))).toHaveLength(6)
    expect(paths.filter(p=>p.endsWith('/resolution'))).toHaveLength(11)
    expect([...records.keys()].filter(k=>k.startsWith('first-reviewed-receipt:'))).toHaveLength(6)
    expect(await count('coach_first_review_acceptances')).toBe(1)
    expect(await count('coach_supervised_initial_bases')).toBe(1);expect(await count('coach_supervised_enrollments')).toBe(0)
    await f.db.exec('SET CONSTRAINTS ALL IMMEDIATE')
  })
  it('denies a fresh owned profile confirmation under a different outer program before any receipt is written',async()=>{
    const designationId=await designation(),s=services(),profiles=createFirstReviewedProfileService({enabled:()=>true,createServiceClient:()=>s.privateDb})
    if(f.initialWeek.kind!=='weekly_plan')throw Error('Expected legacy profile')
    const targetSetup={...structuredClone(f.initialWeek.profileSnapshot),startDate:'2026-10-05'}
    const http=createFirstReviewedHttp({createUserClient:async()=>s.actorDb,profiles,review:s.review,life:s.life})
    const profileRequest={snapshotId:randomUUID(),designationId,programId:program,basePlanVersionId:base,historyDays:90,tzOffset:0,
      windowStart:targetSetup.startDate,targetSetup}
    const execute=(pending:FirstReviewedPending)=>http.execute(new Request('http://localhost',{method:'POST',body:JSON.stringify(pending)}))
    const prepared=await execute({schemaVersion:1,userId:owner,programId:program,operation:'prepare_profile',body:{expectedUserId:owner,request:profileRequest}})
    expect(prepared.status).toBe(200)
    const snapshot=validateFirstReviewedProfileSnapshot((await prepared.json()).snapshot);if(!snapshot)throw Error('Expected saved profile')
    const pending:FirstReviewedPending={schemaVersion:1,userId:owner,programId:program,operation:'confirm_profile',body:{expectedUserId:owner,
      snapshotId:snapshot.snapshotId,requestId:randomUUID(),contentHash:snapshot.contentHash,sourceHash:snapshot.sourceHash,profileHash:snapshot.profileHash}}
    const before=s.ownerCalls.length,response=await execute({...pending,programId:randomUUID()})
    expect(response.status).toBe(503)
    expect(await count('coach_first_review_profile_confirmations')).toBe(0)
    expect(s.ownerCalls.slice(before)).toEqual(['get_first_review_request_resolution'])
    expect((await execute(pending)).status).toBe(200)
    expect(await count('coach_first_review_profile_confirmations')).toBe(1)
  })
  it('withholds complete SQL-backed candidate/profile records returned for another GET identity',async()=>{
    const c=await candidate(false),s=services(),profiles=createFirstReviewedProfileService({enabled:()=>true,createServiceClient:()=>s.privateDb})
    const candidateResult=await s.review.read(s.actorDb,c.candidateId),snapshot=await profiles.read(s.actorDb,c.inputDraft.profileSnapshotId)
    expect(candidateResult.kind).toBe('candidate');expect(snapshot.kind).toBe('snapshot')
    const http=createFirstReviewedHttp({createUserClient:async()=>s.actorDb,profiles:{...profiles,read:async()=>snapshot},
      review:{...s.review,read:async()=>candidateResult},life:s.life})
    expect((await http.readCandidate(randomUUID())).status).toBe(503)
    expect((await http.readSnapshot(randomUUID())).status).toBe(503)
    expect((await http.readCandidate(c.candidateId)).status).toBe(200)
    expect((await http.readSnapshot(c.inputDraft.profileSnapshotId)).status).toBe(200)
  })
  it.each([undefined,'Develop strength with reliable twice-weekly bench work and lower-body support. Choose working loads from set effort and crisp technique; older performed training is unknown.'])('composes complete server submission, designated approval, issuance and separate athlete acceptance with goal %s',async goal=>{
    const c=await preparedCandidate(false,reviewer,goal),s=services()
    const submit:FirstReviewedPending={schemaVersion:1,userId:owner,programId:program,operation:'submit',body:{expectedUserId:owner,draft:c.inputDraft}}
    const saved=await s.review.submit(s.actorDb,submit)
    expect(saved.kind).toBe('saved');if(saved.kind!=='saved')throw Error(JSON.stringify(saved))
    expect(saved.candidate.reviewPacket).toEqual(c.reviewPacket)
    expect(await s.review.read(s.reviewerDb,c.candidateId)).toMatchObject({kind:'candidate',candidate:saved.candidate})
    const decision:FirstReviewedPending={schemaVersion:1,userId:reviewer,programId:program,operation:'decide',body:{expectedUserId:reviewer,
      candidateId:c.candidateId,designationId:c.designationId,requestId:randomUUID(),decision:'approve',
      contentHash:saved.candidate.contentHash,sourceHash:saved.candidate.sourceHash}}
    expect(await s.review.decide(s.reviewerDb,decision)).toMatchObject({kind:'decided',receipt:{replayed:false}})
    const request=issueRequest(c.candidateId),outcome=await s.life.issue(s.actorDb,request)
    expect(outcome.kind).toBe('issued');if(outcome.kind!=='issued')throw Error(JSON.stringify(outcome))
    expect(await count('coach_first_review_acceptances')).toBe(0)
    expect(await count('coach_supervised_programs')).toBe(0)
    const accept:FirstReviewedPending={schemaVersion:1,userId:owner,programId:program,operation:'accept',body:{expectedUserId:owner,programId:program,
      candidateId:c.candidateId,proposalId:outcome.proposalId,planVersionId:outcome.planVersionId,requestId:request.body.requestId,
      contentHash:saved.candidate.contentHash,sourceHash:saved.candidate.sourceHash}}
    expect(await s.life.recover(s.actorDb,accept)).toMatchObject({kind:'resolved',resolution:{disposition:'not_found'}})
    expect(await s.life.accept(s.actorDb,accept)).toMatchObject({kind:'accepted',receipt:{proposalId:outcome.proposalId,planVersionId:outcome.planVersionId},numericRuntimeEligible:false})
    expect(await count('coach_supervised_programs')).toBe(1)
    expect(await count('coach_supervised_initial_bases')).toBe(1)
    expect(await count('coach_supervised_enrollments')).toBe(0)
    await f.db.exec('SET CONSTRAINTS ALL IMMEDIATE')
    if(goal){
      await f.db.exec('RESET ROLE')
      const programReadback=await f.scalar<{title:string;goalSummary:string;intent:unknown;issuedTitle:string}>(
        `SELECT jsonb_build_object('title',p.title,'goalSummary',p.goal_summary,'intent',v.intent,
          'issuedTitle',a.rationale#>>'{program_metadata,title}') AS value
         FROM training_programs p JOIN training_plan_versions v ON v.id=p.active_plan_version_id
         JOIN adaptation_proposals a ON a.proposed_plan_version_id=v.id WHERE p.id=$1`,[program])
      expect(Array.from(programReadback.title)).toHaveLength(160)
      expect(programReadback.title.endsWith(': 2026-10-05')).toBe(true)
      expect(programReadback.title).toBe(c.reviewPacket.week.title)
      expect(programReadback.issuedTitle).toBe(programReadback.title)
      expect(programReadback.goalSummary).toBe(goal)
      expect(JSON.stringify(programReadback.intent)).toContain(goal)
    }
    expect(s.privateCalls).toEqual(['submit_first_review_candidate','get_approved_first_review_candidate','register_reviewed_week_proposal'])
  })
  it('denies first issue without a designated complete-week approval',async()=>{
    const c=await candidate(false),s=services()
    expect(await s.life.issue(s.actorDb,issueRequest(c.candidateId))).toMatchObject({kind:'review_required'})
    expect(await count('coach_reviewed_proposal_registrations')).toBe(0)
    expect(await count('adaptation_proposals')).toBe(0)
  })
  it('does not refresh an old approval after factual evidence changes',async()=>{
    const c=await candidate(),s=services();await f.db.exec('RESET ROLE')
    await f.db.query("INSERT INTO workouts(user_id,workout_date,input_text,blocks) VALUES($1,'2026-10-05','New performed evidence','[]')",[owner])
    expect(await s.life.issue(s.actorDb,issueRequest(c.candidateId))).toMatchObject({kind:'review_required'})
    expect(await count('coach_reviewed_proposal_registrations')).toBe(0)
    expect(s.privateCalls).not.toContain('register_reviewed_week_proposal')
  })
  it('continues an existing registration but denies a changed issue key',async()=>{
    const c=await candidate(),r=await register(c),s=services(),request=issueRequest(c.candidateId)
    expect(await s.life.issue(s.actorDb,request)).toMatchObject({kind:'issued',proposalId:r.proposalId})
    expect(s.privateCalls).toEqual([])
    expect(await s.life.issue(s.actorDb,issueRequest(c.candidateId))).toMatchObject({kind:'request_conflict'})
    expect(await count('adaptation_proposals')).toBe(1)
  })
  it.each(['contentHash','sourceHash','proposalId','planVersionId','requestId'] as const)('rejects a changed acceptance %s without creating a closure',async field=>{
    const p=await issued(),s=services(),request=acceptRequest(p)
    request.body[field]=field.endsWith('Hash')?'c'.repeat(64):randomUUID()
    expect(await s.life.accept(s.actorDb,request)).toMatchObject({kind:'request_conflict',request})
    expect(await s.life.close(s.actorDb,request)).toMatchObject({kind:'request_conflict',request})
    expect(await count('coach_reviewed_proposal_resolutions')).toBe(0)
    expect(await count('coach_first_review_acceptances')).toBe(0)
    expect(s.ownerCalls).not.toContain('accept_first_reviewed_week')
  })
  it('closes exact acceptance once, recovers a lost closure response and fences late acceptance',async()=>{
    const p=await issued(),s=services(),request=acceptRequest(p)
    const lost=intercept(s.actorDb,async(name,result)=>name==='resolve_first_review_request'&&!result.error?{data:null,error:{code:'network_lost'}}:result)
    expect(await s.life.close(lost,request)).toMatchObject({kind:'retry_required',request})
    expect(await count('coach_reviewed_proposal_resolutions')).toBe(1)
    const before=s.ownerCalls.length
    expect(await s.life.recover(s.actorDb,request)).toMatchObject({kind:'resolved',resolution:{disposition:'no_write'}})
    expect(s.ownerCalls.slice(before)).toEqual(['get_first_review_request_resolution'])
    expect(await s.life.accept(s.actorDb,request)).toMatchObject({kind:'no_write',request})
    await f.actor(owner)
    await rejected(()=>f.scalar('SELECT accept_first_reviewed_week($1) AS value',[JSON.stringify(request)]),'55000')
    expect(await count('coach_first_review_acceptances')).toBe(0)
  })
  it('recovers a lost first-issuance response with no writer replay after disabling',async()=>{
    const c=await candidate(),r=await register(c);let enabled=true
    const s=services(()=>enabled),request=issueRequest(c.candidateId)
    const lost=intercept(s.actorDb,async(name,result)=>name==='create_registered_reviewed_week_proposal'&&!result.error?{data:null,error:{code:'network_lost'}}:result)
    expect(await s.life.issue(lost,request)).toMatchObject({kind:'retry_required',request})
    enabled=false;await designation(1,false)
    const before=s.ownerCalls.length
    expect(await s.life.issue(s.actorDb,request)).toMatchObject({kind:'recovered',receipt:{proposalId:r.proposalId,planVersionId:r.planVersionId}})
    expect(s.ownerCalls.slice(before)).toEqual(['get_first_review_request_resolution','get_reviewed_week_registration'])
    expect(await count('adaptation_proposals')).toBe(1)
  })
  it('fences an account switch after acceptance without presenting another actor a receipt',async()=>{
    const p=await issued(),s=services(),request=acceptRequest(p);let switched=false
    const switchedDb=intercept(s.actorDb,async(name,result)=>{if(name==='accept_first_reviewed_week')switched=true;return result})
    switchedDb.auth={getUser:async()=>({data:{user:{id:switched?foreign:owner}},error:null})} as SupabaseClient['auth']
    expect(await s.life.accept(switchedDb,request)).toMatchObject({kind:'account_changed',request})
    expect(await count('coach_first_review_acceptances')).toBe(1)
    expect(await s.life.recover(s.actorDb,request)).toMatchObject({kind:'resolved',resolution:{disposition:'saved'}})
  })
  it.each([reviewer,foreign])('denies a non-owner service acceptance and private approval read %s',async user=>{
    const p=await issued(),s=services(),request=acceptRequest(p),db=sourceClient(f.db,user)
    expect(await s.life.accept(db,request)).toMatchObject({kind:'account_changed'})
    const rebound={...request,userId:user,body:{...request.body,expectedUserId:user}}
    expect(await s.life.accept(db,rebound)).toMatchObject({kind:'retry_required'})
    expect(await s.review.resolveApproved(db,p.c.candidateId)).toMatchObject({kind:'unavailable'})
    expect(s.privateCalls).toEqual([])
    expect(await count('coach_first_review_acceptances')).toBe(0)
  })
  it('recovers a lost candidate submission without replaying privileged writes',async()=>{
    const c=await preparedCandidate();let enabled=true
    const s=services(()=>enabled,async(name,result)=>name==='submit_first_review_candidate'&&!result.error?{data:null,error:{code:'network_lost'}}:result)
    const request:FirstReviewedPending={schemaVersion:1,userId:owner,programId:program,operation:'submit',body:{expectedUserId:owner,draft:c.inputDraft}}
    expect(await s.review.submit(s.actorDb,request)).toMatchObject({kind:'retry_required',request})
    enabled=false;await designation(1,false)
    const before=s.ownerCalls.length
    expect(await s.review.submit(s.actorDb,request)).toMatchObject({kind:'saved',replayed:true,candidate:{candidateId:c.candidateId}})
    expect(s.ownerCalls.slice(before)).toEqual(['get_first_review_request_resolution'])
    expect(s.privateCalls.filter(n=>n==='submit_first_review_candidate')).toHaveLength(1)
    expect(await count('coach_first_review_candidates')).toBe(1)
  })
  it('recovers a lost reviewer decision after revocation and disabling without replay',async()=>{
    const c=await candidate(false);let enabled=true
    const s=services(()=>enabled),request:FirstReviewedPending={schemaVersion:1,userId:reviewer,programId:program,operation:'decide',
      body:{expectedUserId:reviewer,candidateId:c.candidateId,designationId:c.designationId,requestId:randomUUID(),decision:'approve',
        contentHash:c.saved.contentHash,sourceHash:c.saved.sourceHash}}
    const lost=intercept(s.reviewerDb,async(name,result)=>name==='decide_first_review_candidate'&&!result.error?{data:null,error:{code:'network_lost'}}:result)
    expect(await s.review.decide(lost,request)).toMatchObject({kind:'retry_required',request})
    enabled=false;await designation(1,false)
    const before=s.reviewerCalls.length
    expect(await s.review.decide(s.reviewerDb,request)).toMatchObject({kind:'decided',receipt:{replayed:true,requestId:request.body.requestId}})
    expect(s.reviewerCalls.slice(before)).toEqual(['get_first_review_request_resolution'])
    expect(await count('coach_first_review_decisions')).toBe(1)
  })
  it('recovers a lost registration response before first issue without another registration',async()=>{
    const c=await candidate(),s=services(()=>true,async(name,result)=>name==='register_reviewed_week_proposal'&&!result.error?{data:null,error:{code:'network_lost'}}:result)
    const request=issueRequest(c.candidateId)
    expect(await s.life.issue(s.actorDb,request)).toMatchObject({kind:'retry_required',request})
    expect(await count('coach_reviewed_proposal_registrations')).toBe(1)
    expect(await count('adaptation_proposals')).toBe(0)
    expect(await s.life.recover(s.actorDb,request)).toMatchObject({kind:'resolved',resolution:{disposition:'not_found'}})
    expect(await s.life.issue(s.actorDb,request)).toMatchObject({kind:'issued'})
    expect(s.privateCalls.filter(n=>n==='register_reviewed_week_proposal')).toHaveLength(1)
    expect(await count('adaptation_proposals')).toBe(1)
  })
  it.each(['get_approved_first_review_candidate','register_reviewed_week_proposal'])('fences account switches after privileged %s',async boundary=>{
    const c=await candidate();let switched=false
    const s=services(()=>true,async(name,result)=>{if(name===boundary)switched=true;return result})
    s.actorDb.auth={getUser:async()=>({data:{user:{id:switched?foreign:owner}},error:null})} as SupabaseClient['auth']
    expect(await s.life.issue(s.actorDb,issueRequest(c.candidateId))).toMatchObject({kind:'account_changed'})
    expect(await count('coach_reviewed_proposal_registrations')).toBe(boundary==='register_reviewed_week_proposal'?1:0)
    expect(await count('adaptation_proposals')).toBe(0)
    expect(s.ownerCalls).not.toContain('create_registered_reviewed_week_proposal')
  })
  it('does not trust a malformed privileged candidate result and recovers the exact saved candidate',async()=>{
    const c=await preparedCandidate(),s=services(()=>true,async(name,result)=>name==='submit_first_review_candidate'&&!result.error
      ?{...result,data:{...(result.data as Record<string,unknown>),sourceHash:'e'.repeat(64)}}:result)
    const request:FirstReviewedPending={schemaVersion:1,userId:owner,programId:program,operation:'submit',body:{expectedUserId:owner,draft:c.inputDraft}}
    expect(await s.review.submit(s.actorDb,request)).toMatchObject({kind:'retry_required'})
    expect(await s.review.submit(s.actorDb,request)).toMatchObject({kind:'saved',replayed:true,candidate:{sourceHash:c.privatePacket.source.contextHash}})
    expect(s.privateCalls.filter(n=>n==='submit_first_review_candidate')).toHaveLength(1)
  })
  it('does not trust a changed decision result and recovers the exact saved decision',async()=>{
    const c=await candidate(false),s=services(),request:FirstReviewedPending={schemaVersion:1,userId:reviewer,programId:program,operation:'decide',
      body:{expectedUserId:reviewer,candidateId:c.candidateId,designationId:c.designationId,requestId:randomUUID(),decision:'approve',
        contentHash:c.saved.contentHash,sourceHash:c.saved.sourceHash}}
    const malformed=intercept(s.reviewerDb,async(name,result)=>name==='decide_first_review_candidate'&&!result.error
      ?{...result,data:{...(result.data as Record<string,unknown>),requestId:randomUUID()}}:result)
    expect(await s.review.decide(malformed,request)).toMatchObject({kind:'retry_required',request})
    expect(await s.review.decide(s.reviewerDb,request)).toMatchObject({kind:'decided',receipt:{requestId:request.body.requestId,replayed:true}})
    expect(s.reviewerCalls.filter(n=>n==='decide_first_review_candidate')).toHaveLength(1)
  })
  it('rejects malformed private approval and registration readback without issuing',async()=>{
    const c=await candidate(),badPrivate=services(()=>true,async(name,result)=>name==='get_approved_first_review_candidate'&&!result.error
      ?{...result,data:{...(result.data as Record<string,unknown>),privatePacket:{}}}:result)
    expect(await badPrivate.life.issue(badPrivate.actorDb,issueRequest(c.candidateId))).toMatchObject({kind:'unavailable'})
    expect(await count('coach_reviewed_proposal_registrations')).toBe(0)
    await register(c)
    const s=services(),badMetadata=intercept(s.actorDb,async(name,result)=>name==='get_reviewed_week_registration'&&!result.error
      ?{...result,data:{...(result.data as Record<string,unknown>),userId:foreign}}:result)
    expect(await s.life.issue(badMetadata,issueRequest(c.candidateId))).toMatchObject({kind:'retry_required'})
    expect(await count('adaptation_proposals')).toBe(0)
    expect(s.ownerCalls).not.toContain('create_registered_reviewed_week_proposal')
  })
  it('preserves acceptance identity after malformed success and recovers getter-only',async()=>{
    const p=await issued(),s=services(),request=acceptRequest(p)
    const malformed=intercept(s.actorDb,async(name,result)=>name==='accept_first_reviewed_week'&&!result.error
      ?{...result,data:{...(result.data as Record<string,unknown>),planVersionId:randomUUID()}}:result)
    expect(await s.life.accept(malformed,request)).toMatchObject({kind:'retry_required',request})
    const before=s.ownerCalls.length
    expect(await s.life.accept(s.actorDb,request)).toMatchObject({kind:'recovered',receipt:{planVersionId:p.r.planVersionId}})
    expect(s.ownerCalls.slice(before)).toEqual(['get_first_review_request_resolution'])
    expect(await count('coach_first_review_acceptances')).toBe(1)
  })
  it('recovers a lost committed acceptance with revoked and disabled authority using only the getter',async()=>{
    const shared=f;f=await boot()
    try{
      await f.db.exec('BEGIN')
      const p=await issued();await f.db.exec('COMMIT; BEGIN')
      let enabled=true;const s=services(()=>enabled),request=acceptRequest(p)
      const lost=intercept(s.actorDb,async(name,result)=>{
        if(name==='accept_first_reviewed_week'&&!result.error){await f.db.exec('COMMIT; BEGIN');return {data:null,error:{code:'network_lost'}}}
        return result
      })
      expect(await s.life.accept(lost,request)).toMatchObject({kind:'retry_required',request})
      await designation(1,false);await f.db.exec("RESET ROLE; UPDATE coaching_write_control SET paused=true,generation=generation+1,reason='Committed lost-response qualification'; COMMIT; BEGIN")
      enabled=false;const before=s.ownerCalls.length
      expect(await s.life.accept(s.actorDb,request)).toMatchObject({kind:'recovered',receipt:{proposalId:p.r.proposalId,planVersionId:p.r.planVersionId}})
      expect(s.ownerCalls.slice(before)).toEqual(['get_first_review_request_resolution'])
      expect(await s.life.close(s.actorDb,request)).toMatchObject({kind:'resolved',resolution:{disposition:'saved'}})
      expect(await count('coach_first_review_acceptances')).toBe(1)
      expect(await count('coach_supervised_initial_bases')).toBe(1)
      expect(await count('coach_supervised_enrollments')).toBe(0)
      await f.db.exec('COMMIT')
    }finally{await f.db.close();f=shared}
  },30000)
  it('keeps the new acceptance helpers private and grants only bounded authenticated entrypoints',async()=>{
    await f.db.exec('RESET ROLE')
    for(const name of ['first_review_accept_request_identity(jsonb)','first_review_request_resolution_result(jsonb,boolean)',
      'first_review_request_resolution_result_before_acceptance(jsonb,boolean)']){
      for(const role of ['anon','authenticated','service_role']){
        expect(await f.scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS value',[role,name])).toBe(false)
      }
    }
    for(const name of ['get_first_review_request_resolution(jsonb)','resolve_first_review_request(jsonb)','accept_first_reviewed_week(jsonb)']){
      expect(await f.scalar('SELECT has_function_privilege(\'authenticated\',$1,\'EXECUTE\') AS value',[name])).toBe(true)
      for(const role of ['anon','service_role'])expect(await f.scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS value',[role,name])).toBe(false)
    }
  })
  it('rejects direct SQL acceptance envelope omissions, extra fields and rebound ownership',async()=>{
    const p=await issued(),request=acceptRequest(p)
    const {sourceHash:_hash,...missingHash}=request.body;void _hash
    for(const bad of [{...request,body:missingHash},{...request,body:{...request.body,extra:true}},
      {...request,body:{...request.body,sourceHash:null}},{...request,body:{...request.body,programId:foreign}},
      {...request,userId:foreign,body:{...request.body,expectedUserId:foreign}}]){
      await f.actor(owner)
      await rejected(()=>f.scalar('SELECT accept_first_reviewed_week($1) AS value',[JSON.stringify(bad)]),'22023')
    }
    expect(await count('coach_first_review_acceptances')).toBe(0)
    expect(await count('coach_reviewed_proposal_resolutions')).toBe(0)
  })
  it('issues the exact approved non-adjacent week without accepting or enrolling',async()=>{
    const p=await issued()
    expect(p.value).toMatchObject({proposalId:p.r.proposalId,planVersionId:p.r.planVersionId,programId:program,replayed:false})
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT active_plan_version_id AS value FROM training_programs WHERE id=$1',[program])).toBe(base)
    expect(await f.scalar('SELECT intent AS value FROM training_plan_versions WHERE id=$1',[p.r.planVersionId])).toEqual(p.c.privatePacket.intent)
    expect(await count('coach_supervised_programs')).toBe(0)
    expect(await count('coach_supervised_enrollments')).toBe(0)
    await f.db.exec('SET CONSTRAINTS ALL IMMEDIATE')
  })
  it('accepts separately and commits exact permanent lineage and initial anchor together',async()=>{
    const p=await issued();await f.db.exec('RESET ROLE')
    const old=await f.scalar('SELECT to_jsonb(v)-\'status\' AS value FROM training_plan_versions v WHERE id=$1',[base])
    const execution=await f.scalar('SELECT supervised_static_execution($1,$2,$3) AS value',[owner,program,base])
    expect(await accept(p)).toEqual({accepted_program_id:program,active_plan_version_id:p.r.planVersionId,proposal_status:'accepted'})
    await f.db.exec('RESET ROLE; SET CONSTRAINTS ALL IMMEDIATE')
    expect(await count('coach_supervised_programs')).toBe(1)
    expect(await count('coach_supervised_initial_bases')).toBe(1)
    expect(await count('coach_first_review_acceptances')).toBe(1)
    expect(await count('coach_supervised_enrollments')).toBe(0)
    expect(await f.scalar('SELECT to_jsonb(v)-\'status\' AS value FROM training_plan_versions v WHERE id=$1',[base])).toEqual(old)
    expect(await f.scalar('SELECT supervised_static_execution($1,$2,$3) AS value',[owner,program,base])).toEqual(execution)
    expect(await f.scalar('SELECT status AS value FROM training_plan_versions WHERE id=$1',[base])).toBe('superseded')
  })
  it('requires approval before even private alternate registration inserts',async()=>{
    const c=await candidate(false)
    await rejected(()=>register(c),'55000')
    await f.db.exec('RESET ROLE')
    await rejected(()=>f.db.query('INSERT INTO coach_reviewed_proposal_registrations(id,user_id,packet,fingerprint) VALUES($1,$2,$3,$4)',
      [c.candidateId,owner,JSON.stringify(c.privatePacket),doseContentHash(c.privatePacket)]),'55000')
    expect(await count('coach_reviewed_proposal_registrations')).toBe(0)
  })
  it('denies changed approved registration content even with stripped first markers',async()=>{
    const c=await candidate(),packet=structuredClone(c.privatePacket)
    const snapshot=packet.inputSnapshot as unknown as Record<string,unknown>
    delete snapshot.firstReviewDesignation;delete snapshot.firstReviewedDraft;snapshot.reviewedWeekTransition={kind:'next_week'}
    await rejected(()=>register(c,packet),'55000')
  })
  it.each([reviewer,foreign])('requires the owned athlete for issuance and acceptance %s',async actor=>{
    const p=await issued();await f.actor(actor)
    await rejected(()=>f.scalar('SELECT create_registered_reviewed_week_proposal($1,$2) AS value',[p.r.registrationId,p.key]),'P0002')
    await rejected(()=>f.scalar('SELECT * FROM accept_adaptation_proposal($1,$2)',[p.r.proposalId,p.key]),'P0002')
    expect(await count('coach_first_review_acceptances')).toBe(0)
  })
  it.each(['revision','revocation','pause'])('rolls back acceptance when %s changes',async change=>{
    const p=await issued();await f.db.exec('RESET ROLE')
    if(change==='revision')await f.db.query("INSERT INTO workouts(user_id,workout_date,input_text,blocks) VALUES($1,'2026-10-05','Changed evidence','[]')",[owner])
    if(change==='revocation')await designation(1,false)
    if(change==='pause')await f.db.exec("UPDATE coaching_write_control SET paused=true,generation=generation+1,reason='Disposable acceptance pause'")
    await rejected(()=>accept(p),change==='revocation'?'55000':change==='pause'?'PT503':'40001')
    expect(await count('coach_first_review_acceptances')).toBe(0)
    expect(await count('coach_supervised_programs')).toBe(0)
  })
  it('rejects raw accepted target and program updates without authenticated transaction proof',async()=>{
    const p=await issued();await f.db.exec('RESET ROLE')
    await rejected(()=>f.db.query("UPDATE training_plan_versions SET status='accepted',accepted_at=clock_timestamp() WHERE id=$1",[p.r.planVersionId]),'55000')
    await rejected(()=>f.db.query('UPDATE training_programs SET active_plan_version_id=$1 WHERE id=$2',[p.r.planVersionId,program]),'55000')
    await rejected(()=>f.db.query("UPDATE adaptation_proposals SET status='accepted' WHERE id=$1",[p.r.proposalId]),'55000')
  })
  it('rejects stripping plan/proposal markers by reserved registration identity',async()=>{
    const p=await issued();await f.db.exec('RESET ROLE')
    await rejected(()=>f.db.query("UPDATE training_plan_versions SET intent='{}',input_snapshot='{}' WHERE id=$1",[p.r.planVersionId]),'55000')
    await rejected(()=>f.db.query("UPDATE adaptation_proposals SET rationale='{}' WHERE id=$1",[p.r.proposalId]),'55000')
    await rejected(()=>f.db.query('UPDATE adaptation_proposals SET idempotency_key=$1 WHERE id=$2',[randomUUID(),p.r.proposalId]),'55000')
    await rejected(()=>f.db.query('UPDATE adaptation_proposals SET id=$1 WHERE id=$2',[randomUUID(),p.r.proposalId]),'55000')
    await rejected(()=>f.db.query('UPDATE training_plan_versions SET id=$1 WHERE id=$2',[randomUUID(),p.r.planVersionId]),'55000')
  })
  it('denies the old private acceptance path without proof, including a privileged caller',async()=>{
    const p=await issued();await f.db.exec('RESET ROLE')
    await rejected(()=>f.scalar('SELECT * FROM accept_adaptation_proposal_before_supervision($1,$2)',[p.r.proposalId,p.key]),'55000')
  })
  it('rolls back all acceptance mutations if anchor insertion fails',async()=>{
    const p=await issued();await f.db.exec('RESET ROLE')
    await f.db.exec("CREATE FUNCTION test_reject_anchor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected anchor failure' USING ERRCODE='P0001'; END $$; CREATE TRIGGER test_reject_anchor BEFORE INSERT ON coach_supervised_initial_bases FOR EACH ROW EXECUTE FUNCTION test_reject_anchor()")
    await rejected(()=>accept(p),'P0001')
    expect(await count('coach_first_review_acceptances')).toBe(0)
    expect(await count('coach_supervised_programs')).toBe(0)
    expect(await count('coach_supervised_initial_bases')).toBe(0)
    expect(await f.scalar('SELECT active_plan_version_id AS value FROM training_programs WHERE id=$1',[program])).toBe(base)
    expect(await f.scalar('SELECT status AS value FROM adaptation_proposals WHERE id=$1',[p.r.proposalId])).toBe('proposed')
  })
  it('replays exact saved registration, issue and acceptance after revocation and pause',async()=>{
    const p=await issued();await accept(p);await designation(1,false);await f.db.exec('RESET ROLE')
    await f.db.exec("UPDATE coaching_write_control SET paused=true,generation=generation+1,reason='Disposable historical recovery'")
    expect(await register(p.c)).toEqual(p.r)
    await f.actor(owner)
    expect(await f.scalar('SELECT create_registered_reviewed_week_proposal($1,$2) AS value',[p.r.registrationId,p.key])).toMatchObject({replayed:true,proposalId:p.r.proposalId})
    expect(await accept(p)).toMatchObject({proposal_status:'accepted',active_plan_version_id:p.r.planVersionId})
    expect(await count('coach_first_review_acceptances')).toBe(1)
    await f.db.exec('SET CONSTRAINTS ALL IMMEDIATE')
  })
  it('respects exact no-write issue closure before creating any target row',async()=>{
    const c=await candidate(),r=await register(c),key=randomUUID();await f.actor(owner)
    await f.scalar('SELECT resolve_reviewed_proposal_request($1,\'issue\',$2,$3) AS value',
      [program,key,JSON.stringify({reviewId:c.candidateId,registrationId:c.candidateId})])
    await rejected(()=>f.scalar('SELECT create_registered_reviewed_week_proposal($1,$2) AS value',[r.registrationId,key]),'55000')
    expect(await count('training_plan_versions')).toBe(1)
    expect(await count('adaptation_proposals')).toBe(0)
  })
  it('honors acceptance closure and leaves the legacy base active',async()=>{
    const p=await issued();await f.actor(owner)
    expect(await f.scalar('SELECT resolve_reviewed_proposal_request($1,\'accept\',$2,$3) AS value',
      [program,p.key,JSON.stringify({proposalId:p.r.proposalId,planVersionId:p.r.planVersionId})])).toMatchObject({disposition:'closed'})
    await rejected(()=>accept(p),'55000')
    expect(await count('coach_first_review_acceptances')).toBe(0)
    expect(await count('coach_supervised_programs')).toBe(0)
    expect(await f.scalar('SELECT active_plan_version_id AS value FROM training_programs WHERE id=$1',[program])).toBe(base)
  })
  it('recovers committed first acceptance after a later ordinary week and disabled authority',async()=>{
    // Isolate real COMMIT boundaries from the rollback-based tests; dispose this DB.
    const shared=f;f=await boot()
    try{
      await f.db.exec('BEGIN')
      const p=await issued();await accept(p);await f.db.exec('COMMIT; BEGIN')
      const enrollment=await f.enrollment();const next=await f.prepare(enrollment,'next_week')
      await f.actor(owner,'service_role')
      const r=await f.scalar<{registrationId:string;proposalId:string;planVersionId:string}>('SELECT register_reviewed_week_proposal($1,$2,$3) AS value',
        [next.candidateId,JSON.stringify(next.privatePacket),doseContentHash(next.privatePacket)])
      const key=randomUUID();await f.actor(owner)
      await f.scalar('SELECT create_registered_reviewed_week_proposal($1,$2) AS value',[r.registrationId,key])
      await f.scalar('SELECT * FROM accept_adaptation_proposal($1,$2)',[r.proposalId,key])
      await f.db.exec('COMMIT; BEGIN')
      await designation(1,false);await f.enrollment(false);await f.db.exec('RESET ROLE')
      await f.db.exec("UPDATE coaching_write_control SET paused=true,generation=generation+1,reason='Committed historical replay check'")
      await f.db.exec('COMMIT; BEGIN')
      expect(await accept(p)).toEqual({accepted_program_id:program,active_plan_version_id:r.planVersionId,proposal_status:'accepted'})
      await f.actor(owner)
      expect(await f.scalar('SELECT resolve_reviewed_proposal_request($1,\'accept\',$2,$3) AS value',
        [program,p.key,JSON.stringify({proposalId:p.r.proposalId,planVersionId:p.r.planVersionId})])).toMatchObject({
        disposition:'saved',planVersionId:p.r.planVersionId,activePlanVersionId:r.planVersionId})
      expect(await count('coach_first_review_acceptances')).toBe(1)
      await f.db.exec('COMMIT')
    }finally{await f.db.close();f=shared}
  },30000)
  it('keeps transaction proof and private dispatch helpers inaccessible to runtime roles',async()=>{
    await f.db.exec('RESET ROLE')
    for(const role of ['anon','authenticated','service_role']){
      expect(await f.scalar("SELECT has_table_privilege($1,'coach_first_review_acceptances','SELECT,INSERT,UPDATE,DELETE') AS value",[role])).toBe(false)
      for(const signature of ['assert_first_review_acceptance_transaction(uuid)','assert_first_review_approval(uuid,jsonb,boolean)',
        'accept_adaptation_proposal_before_first_review(uuid,text)','register_reviewed_week_proposal_before_first_review(uuid,jsonb,text)'])
        expect(await f.scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS value',[role,signature])).toBe(false)
    }
  })
  it('deferred validation denies alternate acceptance that omits lineage and anchor',async()=>{
    const p=await issued();await f.actor(owner);await f.db.exec('RESET ROLE; SAVEPOINT unprotected_acceptance')
    try{
      await f.db.query(`INSERT INTO coach_first_review_acceptances(registration_id,program_id,user_id,proposal_id,base_plan_version_id,
        plan_version_id,request_id,accepted_transaction,legacy_snapshot,legacy_execution)
        SELECT $1,$2,$3,$4,$5,$6,$7,txid_current(),to_jsonb(v)-'status',supervised_static_execution($3,$2,$5)
        FROM training_plan_versions v WHERE id=$5`,[p.r.registrationId,program,owner,p.r.proposalId,base,p.r.planVersionId,p.key])
      await f.scalar('SELECT * FROM accept_adaptation_proposal_before_supervision($1,$2)',[p.r.proposalId,p.key])
      await expect(f.db.exec('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toMatchObject({code:'55000'})
    }finally{await f.db.exec('ROLLBACK TO SAVEPOINT unprotected_acceptance; RELEASE SAVEPOINT unprotected_acceptance')}
    expect(await count('coach_first_review_acceptances')).toBe(0)
    expect(await f.scalar('SELECT active_plan_version_id AS value FROM training_programs WHERE id=$1',[program])).toBe(base)
  })
  it.each(['transaction','actor','request'])('rejects malformed private proof %s',async change=>{
    const p=await issued();await f.actor(owner);await f.db.exec('RESET ROLE')
    await rejected(()=>f.db.query(`INSERT INTO coach_first_review_acceptances(registration_id,program_id,user_id,proposal_id,base_plan_version_id,
      plan_version_id,request_id,accepted_transaction,legacy_snapshot,legacy_execution)
      SELECT $1,$2,$3,$4,$5,$6,$7,${change==='transaction'?'txid_current()+1':'txid_current()'},to_jsonb(v)-'status',supervised_static_execution($8,$2,$5)
      FROM training_plan_versions v WHERE id=$5`,[p.r.registrationId,program,change==='actor'?foreign:owner,p.r.proposalId,base,p.r.planVersionId,
        change==='request'?randomUUID():p.key,owner]),'55000')
  })
})

describe('ordinary continuation remains supported under first-review dispatch',()=>{
  it.each(['same_week','next_week'] as const)('qualifies ordinary %s with the new migration installed',async transition=>{
    const f=await supervisedLifecycleFixture()
    try{
      for(const file of ['20261003150403_supervised_issue_closure_preflight.sql','20261005120000_first_reviewed_designation.sql',
        '20261005130000_first_reviewed_candidates.sql'])await f.db.exec(sqlFile(`supabase/migrations/${file}`))
      await f.db.exec(sqlFile(migration))
      await f.db.exec(sqlFile('supabase/migrations/20261005172408_first_reviewed_workspace.sql'))
      await f.db.exec('BEGIN')
      const enrollment=await f.enrollment();await f.anchor()
      const prepared=await f.prepare(enrollment,transition)
      await f.actor(lifecycleIds.owner,'service_role')
      const r=await f.scalar<{registrationId:string;proposalId:string;planVersionId:string}>('SELECT register_reviewed_week_proposal($1,$2,$3) AS value',
        [prepared.candidateId,JSON.stringify(prepared.privatePacket),doseContentHash(prepared.privatePacket)])
      const key=randomUUID();await f.actor()
      await f.scalar('SELECT create_registered_reviewed_week_proposal($1,$2) AS value',[r.registrationId,key])
      expect(await f.scalar('SELECT to_jsonb(a) AS value FROM accept_adaptation_proposal($1,$2) a',[r.proposalId,key])).toMatchObject({proposal_status:'accepted',active_plan_version_id:r.planVersionId})
      await f.db.exec('RESET ROLE')
      expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_acceptances')).toBe(0)
      await f.db.exec('COMMIT')
    }finally{await f.db.close()}
  },30000)
})
