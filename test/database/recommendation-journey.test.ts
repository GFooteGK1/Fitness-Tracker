import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import type {PGlite} from '@electric-sql/pglite'
import type {SupabaseClient} from '@supabase/supabase-js'
import {recommendationFixture} from './recommendation-fixture'
import {formatUTCAsLocalDateWithOffset} from '@/app/lib/timezone-utils'
import {runtimeFingerprint} from '@/app/lib/recommendations/context'
import {getRecommendationView} from '@/app/lib/recommendations/service'
import {amendActivity} from '@/app/lib/capture/corrections'
import {replayJsonRequest,saveActivity} from '@/app/lib/logging/server'
import {NextRequest,NextResponse} from 'next/server'
import { POST as recordBaseline } from '@/app/api/coach/observations/route'
import {intent,runningOutcome} from '../fixtures/personalized-coaching/intent'
vi.mock('@/app/lib/auth/supabase-server',()=>({createServerClient:vi.fn(),createServiceRoleClient:vi.fn()}))
import {createServerClient} from '@/app/lib/auth/supabase-server'
let db:PGlite;let userDb:SupabaseClient;let serviceDb:SupabaseClient
const owner=randomUUID(),other=randomUUID();let queue=Promise.resolve()
const quote=(s:string)=>{if(!/^[a-z_][a-z0-9_]*$/.test(s))throw Error('Fixture identifier');return '"'+s+'"'}
/** PostgREST-shaped adapter executes actual SQL, RPCs, grants and RLS. No fixture source responses. */
function adapter(role:'authenticated'|'service_role',userId=owner):SupabaseClient{
 const execute=(sql:string,args:unknown[])=>{const task=queue.then(()=>db.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE ${role}`);await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[userId]);return (await tx.query(sql,args)).rows}));queue=task.then(()=>undefined,()=>undefined);return task.then(rows=>({data:JSON.parse(JSON.stringify(rows)),error:null})).catch(error=>({data:null,error:{code:error.code,message:error.message}}))}
 return {auth:{getUser:async()=>({data:{user:{id:userId}},error:null})},rpc:async(name:string,args:Record<string,unknown>)=>{const entries=Object.entries(args),tableResult=['record_training_baseline','confirm_training_intent'].includes(name);const invocation=`public.${quote(name)}(${entries.map(([key],i)=>`${quote(key)} => $${i+1}`).join(',')})`;const r=await execute(tableResult?`SELECT to_jsonb(result_row) result FROM (SELECT * FROM ${invocation}) result_row`:`SELECT ${invocation} result`,entries.map(([,v])=>v));return {...r,data:tableResult?r.data?.map((row:{result:unknown})=>row.result)??null:r.data?.[0]?.result??null}},from:(table:string)=>{
  let fields='*',order='',limit='',single=false;const where:string[]=[];const params:unknown[]=[]
  const chain:any={select:(v:string)=>{fields=v==='*'?'*':v.split(',').map(x=>quote(x.trim())).join(',');return chain},order:(key:string,o?:{ascending?:boolean})=>{order=` ORDER BY ${quote(key)} ${o?.ascending===false?'DESC':'ASC'}`;return chain},limit:(n:number)=>{limit=` LIMIT ${n}`;return chain},single:()=>{single=true;return chain},maybeSingle:()=>{single=true;return chain},then:(resolve:any,reject:any)=>execute(`SELECT ${fields} FROM public.${quote(table)}${where.length?' WHERE '+where.join(' AND '):''}${order}${limit}`,params).then(r=>resolve({...r,data:single?r.data?.[0]??null:r.data}),reject)}
  for(const [name,op]of [['eq','='],['gte','>='],['lte','<=']] as const)chain[name]=(key:string,value:unknown)=>{params.push(value);where.push(`${quote(key)} ${op} $${params.length}`);return chain}
  return chain
 }} as unknown as SupabaseClient
}
beforeAll(async()=>{
 vi.stubEnv('RECOMMENDATIONS_ENABLED','true');vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED','true');db=await recommendationFixture();await db.query('INSERT INTO auth.users(id) VALUES($1),($2)',[owner,other])
 // Same owner policy as original food migration; fixture supplies hosted default grants explicitly.
 await db.exec('ALTER TABLE daily_targets ENABLE ROW LEVEL SECURITY; CREATE POLICY target_owner ON daily_targets TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid()); GRANT SELECT,INSERT,UPDATE ON daily_targets TO authenticated;')
 userDb=adapter('authenticated');serviceDb=adapter('service_role');vi.mocked(createServerClient).mockResolvedValue(userDb as never)
},30000)
afterAll(async()=>{vi.unstubAllEnvs();await db?.close()})
describe('actual application to PostgreSQL recommendation journey',()=>{
 it('publishes truthful cold-start abstention and reuses it on repeat visits',async()=>{
  const a=await getRecommendationView(userDb,owner,0,true,serviceDb);expect(a.status).toBe('ready');expect(a.recommendations[0].decision.kind).toBe('abstain')
  const b=await getRecommendationView(userDb,owner,0,true,serviceDb);expect(b.recommendations[0].id).toBe(a.recommendations[0].id)
 })
 it('confirms intent, computes defined signal, records Done without phantom activity and preserves origin on interrupted logging replay',async()=>{
  const confirmed=await userDb.rpc('confirm_training_intent',{p_content:intent(runningOutcome()),p_idempotency_key:'journey:intent',p_previous_memory_id:null});expect(confirmed.error).toBeNull()
  const view=await getRecommendationView(userDb,owner,0,true,serviceDb);expect(view.status).toBe('ready');const rec=view.recommendations[0];expect(rec.decision.ruleId).toBe('missing_signal.baseline')
  const response=await userDb.rpc('respond_recommendation',{p_recommendation_id:rec.id,p_request_id:'journey:done',p_response:'done_reported',p_defer_until:null,p_runtime_fingerprint:runtimeFingerprint(),p_timezone_offset:0});expect(response.error).toBeNull()
  expect((await db.query('SELECT id FROM workouts')).rows).toHaveLength(0);expect((await db.query('SELECT id FROM meals')).rows).toHaveLength(0)
  const body={requestId:'journey-meal',expectedUserId:owner,recommendationId:rec.id,submittedAt:new Date().toISOString()};let parses=0
  const request=()=>new NextRequest('http://localhost/api/meals/parse-text',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
  const handler=async()=>{parses++;const id=await saveActivity(userDb,'meal',{meal_timestamp:body.submittedAt,items:[{food:'egg',portion:'one',protein:6,carbs:0,fat:5,calories:69}]});return NextResponse.json({id})}
  const saved=await replayJsonRequest(request(),'journey',handler);expect(saved.status).toBe(200);const savedBody=await saved.json();expect(savedBody.receipts[0].recommendationId).toBe(rec.id)
  const replay=await replayJsonRequest(request(),'journey',handler);expect(await replay.json()).toEqual(savedBody);expect(parses).toBe(1);expect((await db.query('SELECT id FROM meals')).rows).toHaveLength(1)
  const after=await getRecommendationView(userDb,owner,0,true,serviceDb);expect(after.status).toBe('ready');expect(after.recommendations[0].decision.kind).toBe('abstain')
  const foreign=await adapter('authenticated',other).rpc('respond_recommendation',{p_recommendation_id:rec.id,p_request_id:'foreign-response',p_response:'done_reported',p_defer_until:null,p_runtime_fingerprint:runtimeFingerprint(),p_timezone_offset:0});expect(foreign.error?.code).toBe('42501')
 })
 it('uses an explicit target and withdraws stale nutrition immediately after a versioned correction',async()=>{
  await db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE authenticated');await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[owner]);await tx.query('INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories) VALUES($1,100,150,60,1540)',[owner])})
  const before=await getRecommendationView(userDb,owner,0,true,serviceDb);const prior=before.recommendations[0];expect(prior.decision.ruleId).toBe('logged_nutrition.remaining');expect(prior.decision.reason).toContain('6 g protein');expect(prior.decision.reason).toContain('coverage is unknown')
  const meal=(await db.query<any>('SELECT id,capture_recommendation_id FROM meals WHERE user_id=$1',[owner])).rows[0]
  const receipt=await amendActivity(userDb,owner,'meal',{entityId:meal.id,expectedRevision:1,requestId:'journey-correction'},{items:[{food:'egg',portion:'one and a half',protein:9,carbs:0,fat:7.5,calories:103.5}]})
  expect(receipt.revision).toBe(2);expect(receipt.recommendationId).toBe(meal.capture_recommendation_id)
  const dirty=await getRecommendationView(userDb,owner,0,false,serviceDb);expect(dirty.status).toBe('pending');expect(dirty.recommendations).toHaveLength(0)
  const after=await getRecommendationView(userDb,owner,0,true,serviceDb);expect(after.status).toBe('ready');expect(after.recommendations[0].id).not.toBe(prior.id);expect(after.recommendations[0].decision.reason).toContain('9 g protein')
  expect((await db.query('SELECT id FROM meals WHERE user_id=$1',[owner])).rows).toHaveLength(1)
 })

})

/** Test-only passage of the follow-up deadline; no production RPC permits editing this snapshot.
 * The recommendation is selected by real application code, its binding is untouched, and
 * canonical evidence was recorded after the actual publication before this fixture clock step. */
async function makeFollowupDue(recommendationId:string){await queue;await db.query("UPDATE recommendations SET decision=jsonb_set(decision,'{outcome,dueAt}',to_jsonb(clock_timestamp()::text)) WHERE id=$1",[recommendationId])}
async function newAthlete(){const id=randomUUID();await queue;await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);const user=adapter('authenticated',id),service=adapter('service_role',id);vi.mocked(createServerClient).mockResolvedValue(user as never);return {id,user,service}}
async function confirmGoal(user:SupabaseClient,content=intent(runningOutcome()),previous:string|null=null){const result=await user.rpc('confirm_training_intent',{p_content:content,p_idempotency_key:randomUUID(),p_previous_memory_id:previous});expect(result.error).toBeNull();expect(result.data?.[0]?.memory_id).toBeTruthy();return result.data[0].memory_id as string}
async function reportDone(f:Awaited<ReturnType<typeof newAthlete>>,id:string){const args={p_recommendation_id:id,p_request_id:randomUUID(),p_response:'done_reported',p_defer_until:null,p_runtime_fingerprint:runtimeFingerprint(),p_timezone_offset:0};const first=await f.user.rpc('respond_recommendation',args);expect(first.error).toBeNull();const replay=await f.user.rpc('respond_recommendation',args);expect(replay).toEqual(first);return first.data}

describe('W9 prepared actual SQL capture/action/observation journey',()=>{
 it('reconciles interrupted capture and response, records comparable later evidence, and invalidates its interpretation after goal correction',async()=>{
  vi.stubEnv('COACH_TRAINING_INTENT_ENABLED','true');const f=await newAthlete(),memory=await confirmGoal(f.user)
  const body={requestId:randomUUID(),expectedUserId:f.id,submittedAt:new Date().toISOString()},request=()=>new NextRequest('http://localhost/api/parse-workout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});let parses=0
  const handler=async()=>{parses++;const id=await saveActivity(f.user,'workout',{workout_date:formatUTCAsLocalDateWithOffset(body.submittedAt,0),input_text:'Easy run; distance not measured',blocks:[{block_type:'CARDIO',movements:[{name:'Run'}]}]},[]);return NextResponse.json({id})}
  const firstCapture=await replayJsonRequest(request(),'journey-workout',handler),firstBody=await firstCapture.json();expect(firstCapture.status,JSON.stringify(firstBody)).toBe(200)
  // Simulate a lost acknowledgement: the caller retries the original identity without parsing again.
  const replay=await replayJsonRequest(request(),'journey-workout',handler);expect(await replay.json()).toEqual(firstBody);expect(parses).toBe(1)
  const view=await getRecommendationView(f.user,f.id,0,true,f.service);expect(view.status).toBe('ready');const rec=view.recommendations[0];expect(rec.decision.ruleId).toBe('missing_signal.baseline');expect(rec.decision.outcome?.binding?.measurement?.metricId).toBe('run.time')
  await reportDone(f,rec.id);expect((await db.query('SELECT id FROM workouts WHERE user_id=$1',[f.id])).rows).toHaveLength(1);expect((await db.query('SELECT id FROM performance_observation_groups WHERE user_id=$1',[f.id])).rows).toHaveLength(0)
  const baselineBody={expectedUserId:f.id,intentMemoryId:memory,goalId:'goal:5k',value:1500,observedAt:new Date().toISOString(),idempotencyKey:randomUUID(),confirmed:true},baselineRequest=()=>new Request('http://localhost/api/coach/observations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(baselineBody)})
  const captured=await recordBaseline(baselineRequest());expect(captured.status).toBe(201);const capturedBody=await captured.json();const repeat=await recordBaseline(baselineRequest());expect(repeat.status).toBe(201);expect(await repeat.json()).toEqual(capturedBody)
  const group=(await db.query<any>('SELECT * FROM performance_observation_groups WHERE id=$1',[capturedBody.observationId])).rows[0];expect(group).toMatchObject({user_id:f.id,source_kind:'manual',source_system:'sociusfit_training_baseline',verification_status:'athlete_confirmed',verified_by:f.id});expect(group.metadata.origin).toBe('athlete_reported');expect((await db.query('SELECT id FROM performance_observation_values WHERE group_id=$1',[group.id])).rows).toHaveLength(1)
  await makeFollowupDue(rec.id);const followed=await getRecommendationView(f.user,f.id,0,true,f.service);const observed=followed.outcomes?.find(o=>o.recommendationId===rec.id);expect(observed).toMatchObject({invalidated:false,payload:{adherence:'observed',metricId:'run.time',unit:'s'}});expect(observed?.payload.summary).toContain('No improvement or causal benefit');expect(observed?.payload).toMatchObject({evidence:expect.arrayContaining([{table:'performance_observation_groups',id:group.id,revision:null}])})
  const again=await getRecommendationView(f.user,f.id,0,true,f.service);expect(again.outcomes?.find(o=>o.recommendationId===rec.id)?.id).toBe(observed?.id);expect((await db.query("SELECT id FROM recommendation_events WHERE recommendation_id=$1 AND event_type='outcome'",[rec.id])).rows).toHaveLength(1)
  await confirmGoal(f.user,intent(runningOutcome('goal:5k',10000)),memory);const corrected=await getRecommendationView(f.user,f.id,0,true,f.service);expect(corrected.outcomes?.find(o=>o.recommendationId===rec.id)).toMatchObject({id:observed?.id,invalidated:true,payload:{adherence:'observed'}});const original=(await db.query<any>('SELECT decision,withdrawal_reason FROM recommendations WHERE id=$1',[rec.id])).rows[0];expect(original.withdrawal_reason).toBe('source_basis_changed');expect(original.decision.outcome.binding.binding.distance).toEqual({value:5000,unit:'m'});expect((await db.query('SELECT id FROM performance_observation_groups WHERE user_id=$1',[f.id])).rows).toHaveLength(1)
 })
 it.each([false,true])('keeps missing canonical follow-up %s distinct from athlete-reported Done',async(done)=>{
  const f=await newAthlete();await confirmGoal(f.user);const view=await getRecommendationView(f.user,f.id,0,true,f.service),rec=view.recommendations[0];if(done)await reportDone(f,rec.id);await makeFollowupDue(rec.id)
  const followed=await getRecommendationView(f.user,f.id,0,true,f.service),result=followed.outcomes?.find(o=>o.recommendationId===rec.id);expect(result?.payload.adherence).toBe(done?'reported':'unknown');expect((await db.query('SELECT id FROM workouts WHERE user_id=$1',[f.id])).rows).toHaveLength(0);expect((await db.query('SELECT id FROM performance_observation_groups WHERE user_id=$1',[f.id])).rows).toHaveLength(0);expect(result?.payload).toMatchObject({evidence:done?[expect.objectContaining({table:'recommendation_events'})]:[]})
 })
})

describe('W9 nutrition authority without unrelated training intake',()=>{
 it('uses the saved nutrition target without training intent and keeps coverage an explicit separate action',async()=>{
  const f=await newAthlete();await db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE authenticated');await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.id]);await tx.query('INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories) VALUES($1,100,150,60,1540)',[f.id])})
  const at=new Date().toISOString(),request=new NextRequest('http://localhost/api/meals/parse-text',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:randomUUID(),expectedUserId:f.id,submittedAt:at})});const saved=await replayJsonRequest(request,'journey-nutrition',async()=>NextResponse.json({id:await saveActivity(f.user,'meal',{meal_timestamp:at,items:[{food:'egg',portion:'one',protein:6,carbs:0,fat:5,calories:69}]})}));expect(saved.status).toBe(200)
  const view=await getRecommendationView(f.user,f.id,0,true,f.service),rec=view.recommendations[0];expect(view.status).toBe('ready');expect(rec.decision.ruleId).toBe('logged_nutrition.remaining');expect(rec.decision.intentMemoryId).toBeNull();expect(rec.decision.reason).toContain('1540');expect(rec.decision.missing).toContain('logging_coverage');expect((await db.query('SELECT id FROM coach_memories WHERE user_id=$1',[f.id])).rows).toHaveLength(0)
  const coverage=await f.user.rpc('confirm_logging_coverage',{p_domain:'nutrition',p_local_date:rec.decision.localDate,p_coverage_through:new Date().toISOString(),p_status:'complete_through',p_request_id:randomUUID(),p_expected_source_revision:view.refreshState!.sourceRevision,p_timezone_offset:0});expect(coverage.error).toBeNull();const confirmed=await getRecommendationView(f.user,f.id,0,true,f.service);expect(confirmed.recommendations[0].decision.missing).not.toContain('logging_coverage');expect(confirmed.recommendations[0].decision.sources.some(source=>source.table==='logging_coverage_confirmations')).toBe(true)
 })
})
