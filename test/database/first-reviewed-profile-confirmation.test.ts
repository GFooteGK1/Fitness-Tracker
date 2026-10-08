import { randomUUID } from 'node:crypto'
import { beforeAll,beforeEach,afterAll,afterEach,describe,expect,it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supervisedLifecycleFixture,lifecycleIds,sourceClient } from './supervised-lifecycle-fixture'
import { sqlFile } from './fixture'
import { createFirstReviewedProfileService } from '@/app/lib/coach/first-reviewed-profile-service'
import { parseFirstReviewedProfileRequest } from '@/app/lib/coach/first-reviewed-profile-contract'
import { validateFirstReviewedProfileSnapshot } from '@/app/lib/coach/first-reviewed-profile-validation'
import { resolveFirstReviewedRequest } from '@/app/lib/coach/first-reviewed-request-resolution-server'
import { parseFirstReviewedPending, type FirstReviewedPending } from '@/app/lib/coach/first-reviewed-request-resolution'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { runningOutcome,intent } from '../fixtures/personalized-coaching/intent'

describe('owned first-profile preparation and confirmation (disposable SQL; not real Auth)', () => {
  let f: Awaited<ReturnType<typeof supervisedLifecycleFixture>>
  const { owner,reviewer,foreign,program,base } = lifecycleIds
  beforeAll(async () => {
    f = await supervisedLifecycleFixture(true,true,true)
    await f.db.exec(sqlFile('supabase/migrations/20261005120000_first_reviewed_designation.sql'))
    await f.db.exec(sqlFile('supabase/migrations/20261005130000_first_reviewed_candidates.sql'))
  },30000)
  beforeEach(async () => { await f.db.exec('BEGIN') })
  afterEach(async () => { await f.db.exec('ROLLBACK; RESET ROLE') })
  afterAll(async () => { await f?.db.close() })
  async function designation(expected = 0,enabled = true) {
    const id = randomUUID(); await f.actor(owner,'service_role')
    await f.scalar('SELECT version_first_review_designation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value',
      [id,program,owner,base,reviewer,expected,'2026-10-05',enabled,new Date(Date.now()+3600000).toISOString(),'disposable profile qualification'])
    return id
  }
  const service = (enabled = () => true, calls: string[] = []) => createFirstReviewedProfileService({ enabled,
    createServiceClient:() => sourceClient(f.db,owner,'service_role',calls) })
  const client = (actor = owner,calls: string[] = []) => sourceClient(f.db,actor,'authenticated',calls)
  async function request() {
    if (f.initialWeek.kind !== 'weekly_plan') throw Error('Expected genuine legacy base')
    return { snapshotId:randomUUID(),designationId:await designation(),programId:program,basePlanVersionId:base,
      historyDays:90,tzOffset:0,windowStart:'2026-10-05',targetSetup:{ ...structuredClone(f.initialWeek.profileSnapshot),startDate:'2026-10-05' } }
  }
  async function prepared() {
    const q = await request(), s = service(), saved = await s.prepare(client(),owner,q)
    if (saved.kind !== 'saved') throw Error(JSON.stringify(saved))
    return { q,s,saved,confirmation:{ snapshotId:q.snapshotId,requestId:randomUUID(),expectedUserId:owner,
      contentHash:saved.snapshot.contentHash,sourceHash:saved.snapshot.sourceHash,profileHash:saved.snapshot.profileHash } }
  }
  async function rejected(work:() => Promise<unknown>,code: string) {
    await f.db.exec('SAVEPOINT expected_rejection')
    try { await expect(work()).rejects.toMatchObject({ code }) }
    finally { await f.db.exec('ROLLBACK TO SAVEPOINT expected_rejection; RELEASE SAVEPOINT expected_rejection') }
  }
  it('captures fresh facts, confirms exact content and leaves legacy history and enrollment untouched', async () => {
    await f.db.exec('RESET ROLE')
    const before = await f.scalar('SELECT to_jsonb(v) AS value FROM training_plan_versions v WHERE id=$1',[base])
    const p = await prepared()
    expect(p.saved.snapshot.projection.profile.recentTraining.lookbackDays).toBe(90)
    expect(p.saved.snapshot.projection.numericRuntimeEligible).toBe(false)
    expect(p.saved.snapshot.profileHash).toBe(doseContentHash(p.saved.snapshot.projection.profile))
    expect(await p.s.confirm(client(),p.confirmation)).toMatchObject({ kind:'confirmed',receipt:{ snapshotId:p.q.snapshotId,userId:owner } })
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT to_jsonb(v) AS value FROM training_plan_versions v WHERE id=$1',[base])).toEqual(before)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_supervised_programs')).toBe(0)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_candidates')).toBe(0)
  })
  it('uses current confirmed intent even when the accepted legacy profile lacks it', async () => {
    const q = await request(); await f.db.exec('RESET ROLE')
    const o = runningOutcome(); q.targetSetup.primaryGoal.domain='aerobic'; q.targetSetup.secondaryGoals=[]
    await f.db.query("INSERT INTO coach_memories(user_id,memory_key,content,kind,status,version,idempotency_key) VALUES($1,'training_intent',$2,'goal','confirmed',1,'fresh-profile-intent')",[owner,JSON.stringify(intent(o))])
    const saved = await service().prepare(client(),owner,q)
    expect(saved).toMatchObject({ kind:'saved',snapshot:{ projection:{ profile:{ trainingIntent:{ content:{ outcomes:[{ goal:{ id:o.goal.id } }] } } } } } })
    if (saved.kind !== 'saved') return
    expect(await service().confirm(client(),{ snapshotId:q.snapshotId,requestId:randomUUID(),expectedUserId:owner,
      contentHash:saved.snapshot.contentHash,sourceHash:saved.snapshot.sourceHash,profileHash:saved.snapshot.profileHash })).toMatchObject({ kind:'confirmed' })
  })
  it.each([reviewer,foreign])('does not disclose private profile or allow confirmation to another actor %s', async actor => {
    const p = await prepared()
    expect(await p.s.read(client(actor),p.q.snapshotId)).toEqual({ kind:'not_found' })
    expect(await p.s.confirm(client(actor),{ ...p.confirmation,expectedUserId:actor })).toMatchObject({ kind:'retry_required' })
    const r = await client(actor).rpc('get_first_review_profile_receipt',{ p_request_id:p.confirmation.requestId })
    expect(r).toMatchObject({ data:null,error:null })
  })
  it('retains exact snapshot and confirmation replay after revocation and application disablement', async () => {
    const p = await prepared(), result = await p.s.confirm(client(),p.confirmation)
    expect(result.kind).toBe('confirmed'); await designation(1,false)
    const calls: string[] = [], disabled = service(() => false,calls)
    expect(await disabled.prepare(client(owner,calls),owner,p.q)).toMatchObject({ kind:'saved',replayed:true })
    expect(await disabled.confirm(client(owner,calls),p.confirmation)).toEqual(result)
    expect(calls).not.toContain('submit_first_review_profile_snapshot')
    expect(calls).not.toContain('confirm_first_review_profile')
    expect(await p.s.confirm(client(),{ ...p.confirmation,requestId:randomUUID() })).toMatchObject({ kind:'retry_required' })
  })
  it.each(['revision','designation','pause'])('denies first confirmation after %s changes and creates no receipt', async change => {
    const p = await prepared(); await f.db.exec('RESET ROLE')
    if (change==='revision') await f.db.query("INSERT INTO workouts(user_id,workout_date,input_text,blocks) VALUES($1,'2026-10-05','New source','[]')",[owner])
    if (change==='designation') await designation(1,false)
    if (change==='pause') await f.db.exec("UPDATE coaching_write_control SET paused=true,generation=generation+1,reason='Disposable pause check'")
    expect(await p.s.confirm(client(),p.confirmation)).toMatchObject({ kind:'retry_required' })
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_profile_confirmations')).toBe(0)
  })
  it.each(['contentHash','sourceHash','profileHash'])('requires exact %s and preserves the original request identity', async key => {
    const p = await prepared(), q = { ...p.confirmation,[key]:'f'.repeat(64) }
    expect(await p.s.confirm(client(),q)).toMatchObject({ kind:'retry_required',request:q })
    expect(await p.s.confirm(client(),p.confirmation)).toMatchObject({ kind:'confirmed' })
    expect(await p.s.confirm(client(),q)).toMatchObject({ kind:'request_conflict',request:q })
  })
  it('rejects a changed preparation under the same saved snapshot ID', async () => {
    const p = await prepared(), q = structuredClone(p.q); q.targetSetup.sessionAvailability[0].minutes+=1
    expect(await p.s.prepare(client(),owner,q)).toMatchObject({ kind:'request_conflict' })
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_profile_snapshots')).toBe(1)
  })
  it('enforces private tables and helper grants, including service-role direct writes', async () => {
    const p = await prepared()
    for (const role of ['authenticated','service_role','anon'] as const) {
      await f.db.exec(`RESET ROLE; SET LOCAL ROLE ${role}`)
      await rejected(() => f.db.query('SELECT * FROM coach_first_review_profile_snapshots'),'42501')
      await rejected(() => f.db.query('SELECT * FROM coach_first_review_profile_confirmations'),'42501')
      await rejected(() => f.db.query('SELECT first_review_profile_snapshot_json($1)',[p.q.snapshotId]),'42501')
    }
    await f.actor(owner)
    await rejected(() => f.db.query('SELECT submit_first_review_profile_snapshot($1,$2,$3,$4,$5,$6,$7,$8)',
      [randomUUID(),p.q.designationId,owner,'a'.repeat(64),'{}','{}','b'.repeat(64),JSON.stringify(p.q)]),'42501')
  })
  it('prevents snapshot and confirmation modification even by an operator', async () => {
    const p = await prepared(); await p.s.confirm(client(),p.confirmation); await f.db.exec('RESET ROLE')
    await rejected(() => f.db.query("UPDATE coach_first_review_profile_snapshots SET profile_hash=$2 WHERE id=$1",[p.q.snapshotId,'c'.repeat(64)]),'55000')
    await rejected(() => f.db.query('DELETE FROM coach_first_review_profile_confirmations WHERE snapshot_id=$1',[p.q.snapshotId]),'55000')
  })
  it('recovers a saved confirmation after its response is lost without resending', async () => {
    const p = await prepared(), db = client(), calls: string[]=[]
    const lost = { ...db,rpc:async (name:string,args:Record<string,unknown>) => {
      calls.push(name); const r = await db.rpc(name,args)
      return name==='confirm_first_review_profile' && !r.error ? { data:null,error:new Error('Simulated lost response') } : r
    } } as unknown as SupabaseClient
    expect(await p.s.confirm(lost,p.confirmation)).toMatchObject({ kind:'retry_required' })
    expect(await p.s.confirm(lost,p.confirmation)).toMatchObject({ kind:'confirmed' })
    expect(calls.filter(n=>n==='confirm_first_review_profile')).toHaveLength(1)
  })
  it('recovers a saved preparation after its response is lost without recapturing or resending', async () => {
    const q = await request(), calls: string[]=[]
    const real = sourceClient(f.db,owner,'service_role',calls)
    const s = createFirstReviewedProfileService({ enabled:()=>true,createServiceClient:()=>({ ...real,
      rpc:async (name:string,args:Record<string,unknown>) => { const r=await real.rpc(name,args); return !r.error ? { data:null,error:new Error('Simulated lost response') } : r },
    }) as unknown as SupabaseClient })
    expect(await s.prepare(client(),owner,q)).toMatchObject({ kind:'retry_required' })
    expect(await s.prepare(client(),owner,q)).toMatchObject({ kind:'saved',replayed:true })
    expect(calls.filter(n=>n==='submit_first_review_profile_snapshot')).toHaveLength(1)
  })
  it('does not treat a failed historical read as absence or resend an uncertain mutation', async () => {
    const p = await prepared(), db = client(), calls: string[]=[]
    const unavailable = { ...db,rpc:async (name:string,args:Record<string,unknown>) => {
      calls.push(name); return name.startsWith('get_first_review_profile') ? { data:null,error:new Error('Unavailable read') } : db.rpc(name,args)
    } } as unknown as SupabaseClient
    expect(await p.s.prepare(unavailable,owner,p.q)).toMatchObject({ kind:'retry_required' })
    expect(await p.s.confirm(unavailable,p.confirmation)).toMatchObject({ kind:'retry_required' })
    expect(calls.some(n=>n.startsWith('submit_')||n.startsWith('confirm_'))).toBe(false)
  })
  it('fences an account change on the final read before exposing a private snapshot', async () => {
    const p = await prepared(), db = client(); let reads=0
    const changing = { ...db,auth:{ getUser:async () => ({ data:{ user:{ id:++reads===1 ? owner : foreign } },error:null }) } } as unknown as SupabaseClient
    expect(await p.s.read(changing,p.q.snapshotId)).toEqual({ kind:'unavailable' })
  })
  it('rejects unbounded/unknown profile input and altered factual return hashes', async () => {
    const p = await prepared()
    expect(parseFirstReviewedProfileRequest({ ...p.q,cutoff:'2026-01-01' })).toBeNull()
    expect(parseFirstReviewedProfileRequest({ ...p.q,targetSetup:{ ...p.q.targetSetup,rawTranscript:'private' } })).toBeNull()
    const s = structuredClone(p.saved.snapshot); s.projection.profile.recentTraining.completedSessionCount++
    expect(validateFirstReviewedProfileSnapshot(s)).toBeNull()
  })
  it.each([undefined,null,'90',90.5,0,181])('rejects malformed historyDays %s at the direct service boundary without persisting a snapshot', async value => {
    const p = await prepared(); await f.db.exec('RESET ROLE')
    const source = await f.scalar<{ binding:{ scope:Record<string,unknown> } }>('SELECT source AS value FROM coach_first_review_profile_snapshots WHERE id=$1',[p.q.snapshotId])
    if (value===undefined) delete source.binding.scope.historyDays
    else source.binding.scope.historyDays=value
    await f.actor(owner,'service_role')
    const next={...p.q,snapshotId:randomUUID()}
    await rejected(() => f.db.query('SELECT submit_first_review_profile_snapshot($1,$2,$3,$4,$5,$6,$7,$8)',
      [next.snapshotId,p.q.designationId,owner,doseContentHash(next),JSON.stringify(source),JSON.stringify(p.saved.snapshot.projection),p.saved.snapshot.profileHash,JSON.stringify(next)]),'22023')
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_profile_snapshots')).toBe(1)
  })
  it('getter-only recovery reports absent receipt unresolved and never confirms a profile', async () => {
    const p = await prepared(), calls: string[]=[]
    expect(await p.s.recoverConfirmation(client(owner,calls),p.confirmation)).toEqual({ kind:'unresolved',request:p.confirmation })
    expect(calls).toEqual(['get_first_review_profile_receipt'])
    const confirmed = await p.s.confirm(client(),p.confirmation)
    expect(await service(()=>false).recoverConfirmation(client(),p.confirmation)).toEqual(confirmed)
  })
  const preparing=(q:Awaited<ReturnType<typeof request>>):FirstReviewedPending=>({schemaVersion:1,userId:owner,programId:program,
    operation:'prepare_profile',body:{expectedUserId:owner,request:q}})
  const confirming=(p:Awaited<ReturnType<typeof prepared>>):FirstReviewedPending=>({schemaVersion:1,userId:owner,programId:program,
    operation:'confirm_profile',body:p.confirmation})
  async function resolve(q:FirstReviewedPending,close=false,calls:string[]=[]) {
    return resolveFirstReviewedRequest(client(owner,calls),q,close)
  }
  async function closures() {
    await f.db.exec('RESET ROLE')
    return f.scalar<number>('SELECT count(*)::int AS value FROM coach_first_review_request_resolutions')
  }
  it('leaves absent preparation/confirmation unresolved without writing a snapshot, receipt or closure',async()=>{
    const q=await request(),a=preparing(q),calls:string[]=[]
    expect(parseFirstReviewedPending(a)).toEqual(a)
    expect(await resolve(a,false,calls)).toEqual({kind:'resolved',resolution:{schemaVersion:1,request:a,disposition:'not_found'}})
    expect(await closures()).toBe(0)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_profile_snapshots')).toBe(0)
    const saved=await service().prepare(client(),owner,q)
    if(saved.kind!=='saved')throw Error(JSON.stringify(saved))
    const b:FirstReviewedPending={schemaVersion:1,userId:owner,programId:program,operation:'confirm_profile',body:{snapshotId:q.snapshotId,
      requestId:randomUUID(),expectedUserId:owner,contentHash:saved.snapshot.contentHash,sourceHash:saved.snapshot.sourceHash,profileHash:saved.snapshot.profileHash}}
    expect(await resolve(b,false,calls)).toEqual({kind:'resolved',resolution:{schemaVersion:1,request:b,disposition:'not_found'}})
    expect(calls).toEqual(['get_first_review_request_resolution','get_first_review_request_resolution'])
    expect(await closures()).toBe(0)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_profile_confirmations')).toBe(0)
  })
  it('closes preparation before a snapshot exists and the app preserves cancellation instead of capturing fresh sources',async()=>{
    const q=await request(),pending=preparing(q),calls:string[]=[]
    const closed=await resolve(pending,true)
    expect(closed).toMatchObject({kind:'resolved',resolution:{disposition:'no_write'}})
    expect(await resolve(pending)).toEqual(closed)
    expect(await service(()=>true,calls).prepare(client(owner,calls),owner,q)).toMatchObject({kind:'no_write'})
    expect(calls).not.toContain('get_current_first_review_designation')
    expect(calls).not.toContain('submit_first_review_profile_snapshot')
    expect(await closures()).toBe(1)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_profile_snapshots')).toBe(0)
    const changed={...q,historyDays:89}
    expect(await resolve(preparing(changed))).toMatchObject({kind:'request_conflict'})
  })
  it('fences delayed profile submit RPC and alternate insertion using the original request identity',async()=>{
    const p=await prepared(),q={...p.q,snapshotId:randomUUID()},pending=preparing(q)
    await f.db.exec('RESET ROLE')
    const source=await f.scalar('SELECT source AS value FROM coach_first_review_profile_snapshots WHERE id=$1',[p.q.snapshotId])
    await resolve(pending,true)
    await f.actor(owner,'service_role')
    await rejected(()=>f.db.query('SELECT submit_first_review_profile_snapshot($1,$2,$3,$4,$5,$6,$7,$8)',[q.snapshotId,q.designationId,owner,
      doseContentHash(q),JSON.stringify(source),JSON.stringify(p.saved.snapshot.projection),p.saved.snapshot.profileHash,JSON.stringify(q)]),'55000')
    await f.db.exec('RESET ROLE')
    await rejected(()=>f.db.query(`INSERT INTO coach_first_review_profile_snapshots(id,designation_id,user_id,program_id,base_plan_version_id,request_hash,request,source,projection,profile_hash,content_hash)
      SELECT $1,designation_id,user_id,program_id,base_plan_version_id,$2,$3,source,projection,profile_hash,content_hash
      FROM coach_first_review_profile_snapshots WHERE id=$4`,[q.snapshotId,doseContentHash(q),JSON.stringify(q),p.q.snapshotId]),'55000')
    expect(await closures()).toBe(1)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_profile_snapshots')).toBe(1)
  })
  it('closes exact confirmation and prevents both normal and alternate confirmation writers',async()=>{
    const p=await prepared(),pending=confirming(p),calls:string[]=[]
    const closed=await resolve(pending,true)
    expect(await resolve(pending)).toEqual(closed)
    expect(await p.s.confirm(client(owner,calls),p.confirmation)).toMatchObject({kind:'no_write'})
    expect(calls).not.toContain('confirm_first_review_profile')
    await f.actor(owner)
    await rejected(()=>f.scalar('SELECT confirm_first_review_profile($1,$2,$3,$4,$5) AS value',[p.q.snapshotId,p.confirmation.requestId,
      p.confirmation.contentHash,p.confirmation.sourceHash,p.confirmation.profileHash]),'55000')
    await f.db.exec('RESET ROLE')
    await rejected(()=>f.db.query('INSERT INTO coach_first_review_profile_confirmations(snapshot_id,user_id,request_id) VALUES($1,$2,$3)',
      [p.q.snapshotId,owner,p.confirmation.requestId]),'55000')
    expect(await closures()).toBe(1)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_profile_confirmations')).toBe(0)
  })
  it('retains the exact saved preparation and confirmation after revocation and coaching pause',async()=>{
    const p=await prepared(),confirmed=await p.s.confirm(client(),p.confirmation)
    if(confirmed.kind!=='confirmed')throw Error(JSON.stringify(confirmed))
    await designation(1,false)
    await f.db.exec('RESET ROLE')
    await f.db.query('SELECT * FROM set_coaching_write_pause(true,0,$1)',['Disposable profile recovery'])
    for(const close of [false,true]) {
      expect(await resolve(preparing(p.q),close)).toEqual({kind:'resolved',resolution:{schemaVersion:1,request:preparing(p.q),disposition:'saved',result:p.saved.snapshot}})
      expect(await resolve(confirming(p),close)).toEqual({kind:'resolved',resolution:{schemaVersion:1,request:confirming(p),disposition:'saved',result:confirmed.receipt}})
    }
    expect(await closures()).toBe(0)
    const changed={...p.q,historyDays:89}
    expect(await resolve(preparing(changed))).toMatchObject({kind:'request_conflict'})
    expect(await resolve({...confirming(p),programId:randomUUID()})).toMatchObject({kind:'retry_required'})
  })
  it('recovers a lost profile closure response without resending, including when the capability is disabled',async()=>{
    const q=await request(),pending=preparing(q),calls:string[]=[],db=client(owner,calls)
    const lost={auth:db.auth,rpc:async(name:string,args:Record<string,unknown>)=>{
      const result=await db.rpc(name,args);if(result.error)return result
      throw Error('Disposable lost profile closure response')
    }} as unknown as SupabaseClient
    expect(await resolveFirstReviewedRequest(lost,pending,true)).toEqual({kind:'retry_required',request:pending})
    expect(await resolve(pending,false,calls)).toMatchObject({kind:'resolved',resolution:{disposition:'no_write'}})
    expect(calls).toEqual(['resolve_first_review_request','get_first_review_request_resolution'])
    expect(await service(()=>false).prepare(client(),owner,q)).toMatchObject({kind:'no_write'})
    expect(await closures()).toBe(1)
  })
  it('does not expose private preparation or closure to a reviewer or foreign athlete',async()=>{
    const p=await prepared(),pending=preparing(p.q)
    for(const actor of [reviewer,foreign]) {
      const forged={...pending,userId:actor,body:{expectedUserId:actor,request:p.q}}
      expect(await resolveFirstReviewedRequest(client(actor),forged,false)).toMatchObject({kind:'retry_required'})
      const ownHeader={...confirming(p),userId:actor,body:{...p.confirmation,expectedUserId:actor}}
      expect(await resolveFirstReviewedRequest(client(actor),ownHeader,true)).toMatchObject({kind:'retry_required'})
    }
    expect(await closures()).toBe(0)
  })
  it('stores original requests privately without adding their prose to profile snapshot readback',async()=>{
    const p=await prepared()
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT request AS value FROM coach_first_review_profile_snapshots WHERE id=$1',[p.q.snapshotId])).toEqual(p.q)
    expect(Object.keys(p.saved.snapshot)).not.toContain('request')
    expect(await f.scalar("SELECT has_function_privilege('authenticated','first_review_profile_request_resolution_result(jsonb,boolean)','EXECUTE') AS value")).toBe(false)
    expect(await f.scalar("SELECT has_function_privilege('service_role','first_review_profile_prepare_request_valid(jsonb)','EXECUTE') AS value")).toBe(false)
  })
  it.each(['missing_date','null_date','missing_experience','fractional_offset','offset_below_app_range'])('fails closed for an unrecoverable original request: %s',async kind=>{
    const p=await prepared(),q:Record<string,unknown>={...p.q,snapshotId:randomUUID(),targetSetup:structuredClone(p.q.targetSetup)}
    if(kind==='offset_below_app_range')q.tzOffset=-721
    else if(kind==='fractional_offset')q.tzOffset=330.5
    else if(kind==='missing_experience')delete(q.targetSetup as Record<string,unknown>).trainingExperience
    else if(kind==='missing_date')delete(q.targetSetup as Record<string,unknown>).startDate
    else(q.targetSetup as Record<string,unknown>).startDate=null
    expect(parseFirstReviewedProfileRequest(q)).toBeNull()
    if(kind==='fractional_offset')expect(validateFirstReviewedProfileSnapshot({...p.saved.snapshot,tzOffset:330.5})).toBeNull()
    await f.db.exec('RESET ROLE')
    expect(await f.scalar('SELECT first_review_profile_prepare_request_valid($1) AS value',[JSON.stringify(q)])).toBe(false)
    const source=await f.scalar('SELECT source AS value FROM coach_first_review_profile_snapshots WHERE id=$1',[p.q.snapshotId])
    await f.actor(owner,'service_role')
    await rejected(()=>f.db.query('SELECT submit_first_review_profile_snapshot($1,$2,$3,$4,$5,$6,$7,$8)',[q.snapshotId,p.q.designationId,owner,
      doseContentHash(q),JSON.stringify(source),JSON.stringify(p.saved.snapshot.projection),p.saved.snapshot.profileHash,JSON.stringify(q)]),'22023')
    expect(await closures()).toBe(0)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_profile_snapshots')).toBe(1)
  })
  it('binds the original requested daily setup to its projection before a privileged snapshot insert',async()=>{
    const p=await prepared(),q={...p.q,snapshotId:randomUUID(),targetSetup:structuredClone(p.q.targetSetup)}
    q.targetSetup.sessionAvailability[0].minutes=75
    expect(parseFirstReviewedProfileRequest(q)).toEqual(q)
    await f.db.exec('RESET ROLE')
    const source=await f.scalar('SELECT source AS value FROM coach_first_review_profile_snapshots WHERE id=$1',[p.q.snapshotId])
    await f.actor(owner,'service_role')
    await rejected(()=>f.db.query('SELECT submit_first_review_profile_snapshot($1,$2,$3,$4,$5,$6,$7,$8)',[q.snapshotId,q.designationId,owner,
      doseContentHash(q),JSON.stringify(source),JSON.stringify(p.saved.snapshot.projection),p.saved.snapshot.profileHash,JSON.stringify(q)]),'22023')
    expect(await closures()).toBe(0)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_profile_snapshots')).toBe(1)
  })
  it.each(['request_hash','projection_hash'])('does not certify altered saved-profile %s during generic recovery',async kind=>{
    const p=await prepared(),pending=preparing(p.q),db=client()
    const altered={auth:db.auth,rpc:async(name:string,args:Record<string,unknown>)=>{
      const result=await db.rpc(name,args)
      if(result.error)return result
      const copy=structuredClone(result.data)
      if(kind==='request_hash')copy.result.requestHash='c'.repeat(64)
      else copy.result.projection.profile.recentTraining.completedSessionCount++
      return {data:copy,error:null}
    }} as unknown as SupabaseClient
    expect(await resolveFirstReviewedRequest(altered,pending,false)).toEqual({kind:'retry_required',request:pending})
  })
})
