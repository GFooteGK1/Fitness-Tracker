import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest'
import {randomBytes,randomUUID} from 'node:crypto'
import sharp from 'sharp'
import type {PGlite} from '@electric-sql/pglite'
import {nutritionPilotDatabase,nutritionPilotClient,nutritionPilotSettlementClient,pilotTestOwner} from '../helpers/nutrition-pilot-database'
import {photoDraftActor} from '../helpers/photo-draft-database'
vi.hoisted(()=>{globalThis.fetch=async()=>{throw new Error('Unexpected network: synthetic capacity suite')}})
vi.mock('@/app/lib/nutrition/photo-pilot-policy',()=>({nutritionPhotoPilotEnabled:()=>true,nutritionPhotoPilotOwner:(id:string)=>id==='11111111-1111-4111-8111-111111111111'}))
vi.mock('@/app/lib/llm/client',()=>({complete:vi.fn()}))
vi.mock('@/app/lib/auth/supabase-server',()=>({createServiceRoleClient:vi.fn()}))
import {createServiceRoleClient} from '@/app/lib/auth/supabase-server'
import {complete} from '@/app/lib/llm/client'
import {capturePilotPhoto} from '@/app/lib/nutrition/photo-pilot'
const initial=Date.parse('2026-10-19T12:00:00Z')
let db:PGlite,client:ReturnType<typeof nutritionPilotClient>,at:number,omitted:boolean,screenCalls:number,estimateCalls:number
let beforeTenth:number,beforeLast:number,server:ReturnType<typeof nutritionPilotSettlementClient>
const food={food:'Synthetic food',portion:'Estimated serving',protein:30,carbs:40,fat:10,calories:370}
const analysis={items:[food],total_protein:30,total_carbs:40,total_fat:10,total_calories:370,confidence:0.5,notes:'Synthetic estimate, not measured nutrition.'}
const exposure=async(rolling=false)=>Number((await db.query<{n:string}>(`SELECT coalesce(sum(coalesce(confirmed_micro_usd,reserved_micro_usd)),0)::text n FROM nutrition_photo_exposure ${rolling?"WHERE settled_at IS NULL OR settled_at>=public.pilot_test_clock()-interval '24 hours 60 seconds'":''}`)).rows[0].n)
beforeAll(async()=>{db=await nutritionPilotDatabase(true,new Date(initial).toISOString());await db.query('INSERT INTO auth.users VALUES($1)',[pilotTestOwner])},30000)
beforeEach(async()=>{
  vi.clearAllMocks();at=initial;omitted=false;screenCalls=0;estimateCalls=0;beforeTenth=0;beforeLast=0
  await db.exec('RESET ROLE; TRUNCATE nutrition_photo_exposure,nutrition_photo_captures,logging_requests,activity_drafts,activity_revisions,activity_mutations,meals CASCADE')
  await db.query('UPDATE pilot_test_clock SET at=$1',[new Date(at).toISOString()])
  await db.exec("UPDATE nutrition_photo_budget SET halted=false,started_at=public.pilot_test_clock(),ends_at=public.pilot_test_clock()+interval '720 hours'")
  await photoDraftActor(db,pilotTestOwner);client=nutritionPilotClient(db,()=>pilotTestOwner)
  server=nutritionPilotSettlementClient(db);vi.mocked(createServiceRoleClient).mockReturnValue(server as never)
  vi.stubEnv('OPENAI_API_KEY','synthetic-capacity-key')
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
    if(url!=='https://api.openai.com/v1/decisions'||init.method!=='POST')throw new Error('Unexpected synthetic endpoint')
    expect(JSON.parse(init.body as string).model).toBe('gpt-6-luna');screenCalls++
    return new Response(JSON.stringify({model:'gpt-6-luna',answers:[{name:'food_screen',type:'choice',choice:'food',confidence:1,
      probabilities:[{value:'food',probability:1},{value:'non_food',probability:0},{value:'uncertain',probability:0}]}],
      ...(!omitted?{usage:{input_tokens:3000,output_tokens:0,total_tokens:3000}}:{})}),{headers:{'x-request-id':'req_'+randomUUID()}})
  }))
  vi.mocked(complete).mockImplementation(async(req,routing)=>{
    req.beforeDispatch?.();expect(routing).toEqual({provider:'openai',model:'gpt-5.6-luna'})
    if(estimateCalls===9)beforeTenth=await exposure(true)
    if(estimateCalls===299)beforeLast=await exposure()
    estimateCalls++
    return {text:JSON.stringify(analysis),provider:'openai',model:'gpt-5.6-luna',toolCalls:[],stopReason:'stop',usage:{input:5000,output:1024},
      ...(!omitted?{billing:{receiptId:'resp_'+randomUUID(),inputTokens:5000,outputTokens:1024,totalTokens:6024,serviceTier:'default'}}:{})}
  })
})
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
afterAll(async()=>{await db?.close()})
async function capture() {
  const bytes=await sharp(randomBytes(32*32*3),{raw:{width:32,height:32,channels:3}}).png().toBuffer()
  return capturePilotPhoto(client as never,{expectedOwner:pilotTestOwner,requestId:randomUUID(),capturedAt:new Date(at).toISOString(),context:'Synthetic fixture',consent:'selected-photo-openai-autolog-v1',bytes,mediaType:'image/png'})
}

it('saves ten sequential real capture transactions/day using confirmed synthetic usage',async()=>{
  for(let i=0;i<10;i++)expect((await capture()).state).toBe('saved')
  expect(beforeTenth).toBe(649602);expect(await exposure()).toBe(54380)
  expect((await db.query('SELECT * FROM meals')).rows).toHaveLength(10)
  expect(screenCalls).toBe(10);expect(estimateCalls).toBe(10)
  await expect(capture()).rejects.toMatchObject({status:503}) // separate ten-capture admission remains
  expect(screenCalls).toBe(10)
},30000)

it('simulates300 captures across one fixed720h period without increasing either cap',async()=>{
  for(let day=0;day<30;day++){
    // Disposable SQL copy uses an authoritative test DB clock, never client time.
    at=initial+day*(24*3600000+61000)
    await db.exec('RESET ROLE');await db.query('UPDATE pilot_test_clock SET at=$1',[new Date(at).toISOString()]);await photoDraftActor(db,pilotTestOwner)
    for(let i=0;i<10;i++)expect((await capture()).state).toBe('saved')
    expect(await exposure(true)).toBe(54380)
  }
  expect(beforeLast).toBe(2226622);expect(await exposure()).toBe(1631400)
  expect((await db.query('SELECT * FROM meals')).rows).toHaveLength(300)
  expect(screenCalls).toBe(300);expect(estimateCalls).toBe(300)
  await db.exec("RESET ROLE; UPDATE pilot_test_clock SET at=(SELECT ends_at FROM nutrition_photo_budget)");await photoDraftActor(db,pilotTestOwner)
  at=initial+30*24*3600000
  await expect(capture()).rejects.toMatchObject({status:503});expect(screenCalls).toBe(300)
},120000)

it('retains the full850000 when usage is absent, reducing capacity without a free retry',async()=>{
  omitted=true;expect((await capture()).state).toBe('saved');expect(await exposure()).toBe(850000)
  expect((await db.query('SELECT confirmed_micro_usd,settled_at FROM nutrition_photo_exposure')).rows).toEqual([
    {confirmed_micro_usd:null,settled_at:null},{confirmed_micro_usd:null,settled_at:null}])
  expect((await capture()).state).toBe('uncertain');expect(screenCalls).toBe(1);expect(estimateCalls).toBe(1)
  await db.exec("RESET ROLE; UPDATE pilot_test_clock SET at=at+interval '25 hours'");await photoDraftActor(db,pilotTestOwner)
  at+=25*3600000
  expect((await capture()).state).toBe('uncertain');expect(screenCalls).toBe(1);expect(await exposure(true)).toBe(850000)
},30000)

it('a lost trusted settlement acknowledgement cannot redispatch or lose its confirmed charge',async()=>{
  const original=server.rpc;let dropped=false
  vi.spyOn(server,'rpc').mockImplementation(async(name,args)=>{
    const value=await original(name,args)
    if(!dropped){dropped=true;return {data:null,error:{code:'synthetic-lost-ack'}}}
    return value
  })
  expect((await capture()).state).toBe('uncertain');expect(await exposure()).toBe(660)
  expect(screenCalls).toBe(1);expect(estimateCalls).toBe(0)
  const status=(await db.query<any>('SELECT state FROM nutrition_photo_captures')).rows[0]
  expect(status.state).toBe('uncertain')
})
it('a rejected settlement retains the original full reserve and stops estimation',async()=>{
  vi.spyOn(server,'rpc').mockResolvedValue({data:null,error:{code:'synthetic-before-commit'}})
  expect((await capture()).state).toBe('uncertain');expect(await exposure()).toBe(250000)
  expect(screenCalls).toBe(1);expect(estimateCalls).toBe(0)
  expect((await db.query('SELECT confirmed_micro_usd,settled_at FROM nutrition_photo_exposure')).rows[0]).toEqual({confirmed_micro_usd:null,settled_at:null})
})
it('confirmed provider cost survives an unrelated canonical commit failure',async()=>{
  const original=client.rpc
  vi.spyOn(client,'rpc').mockImplementation(async(name,args)=>args.p_action==='commit'?{data:null,error:{code:'synthetic-canonical-failure',message:'not committed'}}:original(name,args))
  expect((await capture()).state).toBe('estimated');expect(await exposure()).toBe(5438)
  expect((await db.query('SELECT * FROM meals')).rows).toHaveLength(0)
  expect(screenCalls).toBe(1);expect(estimateCalls).toBe(1)
})
