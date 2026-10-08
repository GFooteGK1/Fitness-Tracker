import { randomUUID } from 'node:crypto'
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from 'vitest'
import { supervisedLifecycleFixture,lifecycleIds,sourceClient } from './supervised-lifecycle-fixture'
import { sqlFile } from './fixture'
import { currentSetupContents } from '../fixtures/first-reviewed-setup'
import { parseFirstReviewSetupEditorSeed,parseFirstReviewSetupRequest,parseFirstReviewSetupResolution } from '@/app/lib/coach/first-reviewed-setup-request'
import type { FirstReviewSetupRequest } from '@/app/lib/coach/first-reviewed-setup-request'
import { createFirstReviewSetupActionsHttp } from '@/app/lib/coach/first-reviewed-setup-actions-http'

const migration='supabase/migrations/20261005192643_first_reviewed_setup_requests.sql'
describe('atomic first-reviewed declarations and exact recovery (disposable SQL, synthetic Auth)',()=>{
  const {owner,reviewer,foreign,program,base}=lifecycleIds
  let f:Awaited<ReturnType<typeof supervisedLifecycleFixture>>
  beforeAll(async()=>{
    f=await supervisedLifecycleFixture(true,true,true)
    for(const name of ['20261003150403_supervised_issue_closure_preflight.sql','20261005120000_first_reviewed_designation.sql',
      '20261005130000_first_reviewed_candidates.sql','20261005155602_first_reviewed_acceptance.sql','20261005172408_first_reviewed_workspace.sql'])
      await f.db.exec(sqlFile(`supabase/migrations/${name}`))
    await f.db.exec(sqlFile(migration))
  },30000)
  beforeEach(async()=>{await f.db.exec('BEGIN')})
  afterEach(async()=>{await f.db.exec('ROLLBACK; RESET ROLE')})
  afterAll(async()=>{await f?.db.close()})
  async function designation(expected=0,enabled=true,expiresAt=new Date(Date.now()+3600000).toISOString()){
    await f.actor(owner,'service_role');const id=randomUUID()
    await f.scalar('SELECT version_first_review_designation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value',
      [id,program,owner,base,reviewer,expected,'2026-10-05',enabled,expiresAt,'Disposable setup request qualification'])
    return id
  }
  async function request():Promise<FirstReviewSetupRequest>{
    await designation();return nextRequest()
  }
  async function nextRequest():Promise<FirstReviewSetupRequest>{
    await f.actor(owner)
    const raw=await f.scalar('SELECT read_first_review_setup_editor($1) AS value',[program]),seed=parseFirstReviewSetupEditorSeed(raw,owner,program)
    if(!seed)throw Error('Expected strict owner editor seed')
    const q=parseFirstReviewSetupRequest({schemaVersion:1,expectedUserId:owner,programId:program,designationId:seed.designationId,
      designationVersion:seed.designationVersion,basePlanVersionId:seed.basePlanVersionId,requestId:randomUUID(),
      expectedDeclarations:seed.declarations,contents:currentSetupContents()})
    if(!q)throw Error('Expected valid explicit setup request');return q
  }
  async function save(q:FirstReviewSetupRequest){await f.actor(owner);return f.scalar('SELECT save_first_review_setup($1) AS value',[JSON.stringify(q)])}
  async function resolve(q:FirstReviewSetupRequest,close=false){await f.actor(owner);return f.scalar('SELECT resolve_first_review_setup_request($1,$2) AS value',[JSON.stringify(q),close])}
  async function count(table:string){await f.db.exec('RESET ROLE');return f.scalar<number>(`SELECT count(*)::int AS value FROM ${table}`)}
  async function reject(work:()=>Promise<unknown>,code:string){
    await f.db.exec('SAVEPOINT expected_failure');try{await expect(work()).rejects.toMatchObject({code})}
    finally{await f.db.exec('ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure')}
  }
  it('creates all four missing declarations atomically and preserves accepted history',async()=>{
    const q=await request(),before=await f.scalar('SELECT intent AS value FROM training_plan_versions WHERE id=$1',[base])
    expect(Object.values(q.expectedDeclarations).every(d=>d===null)).toBe(true)
    const saved=await save(q);expect(parseFirstReviewSetupResolution(saved,q)).toEqual(saved)
    expect(saved).toMatchObject({disposition:'saved',receipt:{userId:owner,programId:program,requestId:q.requestId}})
    expect(await count('coach_memories')).toBe(4);expect(await count('coach_first_review_setup_requests')).toBe(1)
    await f.actor(owner);expect(await f.scalar('SELECT intent AS value FROM training_plan_versions WHERE id=$1',[base])).toEqual(before)
    expect(await count('coach_first_review_acceptances')).toBe(0);expect(await count('coach_supervised_enrollments')).toBe(0)
  })
  it('corrects the current four declarations through canonical review history and retains unequal daily times/prose',async()=>{
    await save(await request());const q=await nextRequest();q.contents.training_schedule.sessionAvailability=[{day:'tuesday',minutes:40},{day:'saturday',minutes:80}]
    const saved=await save(q);expect(parseFirstReviewSetupResolution(saved,q)).toEqual(saved)
    expect(await count('coach_memories')).toBe(8);expect(await count('coach_memory_review_events')).toBe(4)
    const read=await nextRequest();expect(read.expectedDeclarations.training_schedule?.content).toEqual(q.contents.training_schedule)
    expect(read.expectedDeclarations.available_equipment?.content.equipment).toBe(' A bench, barbell and an unmeasured outdoor area. ')
    expect(Object.values(read.expectedDeclarations).every(d=>d?.version===2&&d.status==='confirmed')).toBe(true)
  })
  it('rejects stale declaration snapshots before making any partial correction',async()=>{
    const q=await request();await save(q);const stale={...q,requestId:randomUUID()}
    await reject(()=>save(stale),'40001')
    expect(await count('coach_memories')).toBe(4);expect(await count('coach_first_review_setup_requests')).toBe(1)
    expect(await resolve(stale)).toMatchObject({disposition:'not_found'})
  })
  it('gets absent results without writes and permanently closes the exact original request',async()=>{
    const q=await request();expect(await resolve(q)).toEqual({schemaVersion:1,request:q,disposition:'not_found'})
    expect(await count('coach_first_review_setup_requests')).toBe(0)
    const closed=await resolve(q,true);expect(parseFirstReviewSetupResolution(closed,q)).toEqual(closed)
    expect(closed).toMatchObject({disposition:'no_write',receipt:null})
    await reject(()=>save(q),'55000');expect(await count('coach_memories')).toBe(0)
    expect(await resolve(q)).toEqual(closed)
  })
  it('returns saved historical proof after later correction and revocation, including closure attempts',async()=>{
    const q=await request(),saved=await save(q);await save(await nextRequest());await designation(1,false)
    expect(await resolve(q)).toEqual(saved);expect(await resolve(q,true)).toEqual(saved);expect(await save(q)).toEqual(saved)
    expect(parseFirstReviewSetupResolution(saved,q)).toEqual(saved)
    expect(await count('coach_memories')).toBe(8);expect(await count('coach_first_review_setup_requests')).toBe(2)
  })
  it('rejects changed content under an existing request identity rather than replaying or overwriting',async()=>{
    const q=await request();await save(q);const changed=structuredClone(q);changed.contents.primary_goal.goal='Changed goal under the original request identity.'
    await reject(()=>resolve(changed),'22023');await reject(()=>save(changed),'22023')
    expect(await count('coach_memories')).toBe(4)
  })
  it('rolls back all declarations and the receipt if the last canonical write fails',async()=>{
    const q=await request();await f.db.exec('RESET ROLE')
    await f.db.exec(`CREATE FUNCTION public.fail_setup_test_last_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.memory_key='training_schedule' THEN RAISE EXCEPTION 'Deliberate last declaration failure' USING ERRCODE='22023'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_setup_test_last_write BEFORE INSERT ON public.coach_memories FOR EACH ROW EXECUTE FUNCTION public.fail_setup_test_last_write();`)
    await reject(()=>save(q),'22023');expect(await count('coach_memories')).toBe(0);expect(await count('coach_memory_review_events')).toBe(0)
    expect(await count('coach_first_review_setup_requests')).toBe(0);expect(await resolve(q)).toMatchObject({disposition:'not_found'})
  })
  it.each(['revoked','replaced','base','paused'])('denies fresh setup saves when %s',async failure=>{
    const q=await request()
    if(failure==='revoked')await designation(1,false)
    if(failure==='replaced')await designation(1,true)
    if(failure==='base'){await f.db.exec('RESET ROLE');await f.db.query("UPDATE training_programs SET status='archived' WHERE id=$1",[program])}
    if(failure==='paused'){await f.db.exec('RESET ROLE');await f.db.exec('UPDATE coaching_write_control SET paused=true')}
    await reject(()=>save(q),failure==='base'?'40001':'55000');expect(await count('coach_memories')).toBe(0)
    expect((await resolve(q,true)).disposition).toBe('no_write')
  })
  it('denies new saves after actual designation expiry while preserving pure recovery and explicit closure',async()=>{
    const expiry=Date.now()+250;await designation(0,true,new Date(expiry).toISOString());const q=await nextRequest()
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,expiry-Date.now()+25)))
    await reject(()=>save(q),'55000');expect(await count('coach_memories')).toBe(0)
    expect((await resolve(q)).disposition).toBe('not_found');expect((await resolve(q,true)).disposition).toBe('no_write')
  })
  it('has owner-only receipt RLS and no direct ledger-write or private-helper grants',async()=>{
    const q=await request();await save(q);await f.actor(foreign)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_setup_requests')).toBe(0)
    expect(await f.scalar('SELECT read_first_review_setup_editor($1) AS value',[program])).toBeNull()
    expect(await f.scalar('SELECT resolve_first_review_setup_request($1,false) AS value',[JSON.stringify(q)])).toBeNull()
    await reject(()=>f.db.exec('DELETE FROM coach_first_review_setup_requests'),'42501')
    await reject(()=>f.db.query('SELECT first_review_setup_declaration($1,$2)',[owner,'primary_goal']),'42501')
    await f.actor(owner,'anon');await reject(()=>f.db.query('SELECT save_first_review_setup($1)',[JSON.stringify(q)]),'42501')
    await f.actor(owner,'service_role');await reject(()=>f.db.query('SELECT save_first_review_setup($1)',[JSON.stringify(q)]),'42501')
  })
  it('runs authenticated HTTP save/getter/closure without private or unrelated projections',async()=>{
    const q=await request(),db=sourceClient(f.db,owner),http=createFirstReviewSetupActionsHttp({createUserClient:async()=>db,enabled:()=>true})
    const body=()=>new Request('http://localhost/setup-actions',{method:'POST',body:JSON.stringify(q)})
    const editor=await http.read(new Request('http://localhost/setup-editor'),program);expect(editor.status).toBe(200)
    expect(editor.headers.get('cache-control')).toBe('private, no-store')
    const saved=await http.save(body());expect(saved.status).toBe(200)
    const raw=await saved.json();expect(parseFirstReviewSetupResolution(raw.resolution,q)).toEqual(raw.resolution)
    const disabled=createFirstReviewSetupActionsHttp({createUserClient:async()=>db,enabled:()=>false})
    expect((await disabled.save(body())).status).toBe(409)
    expect((await disabled.resolve(body())).status).toBe(200);expect((await disabled.close(body())).status).toBe(200)
    const wrong=createFirstReviewSetupActionsHttp({createUserClient:async()=>sourceClient(f.db,foreign),enabled:()=>true})
    expect((await wrong.resolve(body())).status).toBe(409)
    expect((await wrong.read(new Request('http://localhost/setup-editor'),program)).status).toBe(404)
  })
  it.each(['unknown','domain','repeat_domain','schedule','equipment','constraints'])('rejects invalid %s content at the database boundary',async failure=>{
    const q=await request()
    if(failure==='unknown')Object.assign(q.contents,{readiness:5})
    if(failure==='domain')q.contents.primary_goal.primaryDomain='unknown'
    if(failure==='repeat_domain')q.contents.primary_goal.secondaryGoals=[{domain:'aerobic',allocation:'development',athleteIntent:'Duplicate primary component.'}]
    if(failure==='schedule')q.contents.training_schedule.sessionAvailability=[{day:'tuesday',minutes:40},{day:'saturday',minutes:80.5}]
    if(failure==='equipment')q.contents.available_equipment.resolvedEquipmentIds=['unknown_equipment']
    if(failure==='constraints')q.contents.training_constraints.constraintKinds=['pain_free_assumed']
    await reject(()=>save(q),'22023');expect(await count('coach_memories')).toBe(0)
  })
  it.each(['memoryId','version','status','content','effectiveFrom','reviewAfter','unknown'])('rejects malformed prior declaration %s before closure or save',async field=>{
    await save(await request());const q=await nextRequest(),prior=q.expectedDeclarations.primary_goal!
    if(field==='memoryId')prior.memoryId='wrong'
    if(field==='version')prior.version=1.5
    if(field==='status')Object.assign(prior,{status:'assumed'})
    if(field==='content')Object.assign(prior,{content:null})
    if(field==='effectiveFrom')prior.effectiveFrom='infinity'
    if(field==='reviewAfter')prior.reviewAfter='2026-10-05'
    if(field==='unknown')Object.assign(prior,{current:true})
    expect(parseFirstReviewSetupRequest(q)).toBeNull()
    await reject(()=>resolve(q,true),'22023');await reject(()=>save(q),'22023')
    expect(await count('coach_memories')).toBe(4);expect(await count('coach_first_review_setup_requests')).toBe(1)
  })
  it('authenticates before reading the body and fences account changes after a committed save',async()=>{
    const q=await request(),db=sourceClient(f.db,owner)
    const anonymous={...db,auth:{getUser:async()=>({data:{user:null},error:null})}} as unknown as typeof db
    const denied=createFirstReviewSetupActionsHttp({createUserClient:async()=>anonymous,enabled:()=>true})
    const unread=new Request('http://localhost/setup',{method:'POST',body:'invalid JSON'})
    expect((await denied.save(unread)).status).toBe(401);expect(unread.bodyUsed).toBe(false)
    let calls=0
    const changing={...db,auth:{getUser:async()=>({data:{user:{id:++calls===1?owner:foreign}},error:null})}} as unknown as typeof db
    const http=createFirstReviewSetupActionsHttp({createUserClient:async()=>changing,enabled:()=>true})
    expect((await http.save(new Request('http://localhost/setup',{method:'POST',body:JSON.stringify(q)}))).status).toBe(409)
    // The mutation committed before the response fence. Recovery belongs only to the original actor.
    expect(parseFirstReviewSetupResolution(await resolve(q),q)?.disposition).toBe('saved')
  })
})
