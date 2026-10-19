import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest'
import { randomBytes,randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { PGlite } from '@electric-sql/pglite'
import { nutritionPilotClient,nutritionPilotDatabase,pilotTestOwner } from '../helpers/nutrition-pilot-database'
import { photoDraftActor } from '../helpers/photo-draft-database'
vi.mock('@/app/lib/nutrition/photo-pilot-policy',()=>({nutritionPhotoPilotEnabled:vi.fn(()=>true),nutritionPhotoPilotOwner:vi.fn((id:string)=>id==='11111111-1111-4111-8111-111111111111')}))
vi.mock('@/app/lib/llm/client',()=>({complete:vi.fn()}))
vi.mock('@/app/lib/auth/supabase-server',()=>({createServerClient:vi.fn()}))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { complete } from '@/app/lib/llm/client'
import { nutritionPhotoPilotEnabled } from '@/app/lib/nutrition/photo-pilot-policy'
import { capturePilotPhoto } from '@/app/lib/nutrition/photo-pilot'
import { correctPilotMeal,readPilotNutrition } from '@/app/lib/nutrition/photo-pilot-context'
import { preparePilotPhoto } from '@/app/lib/nutrition/photo-pilot-image'
import { POST,GET,PATCH } from '@/app/api/meals/photo-pilot/route'

let db:PGlite,owner:string|null,client:ReturnType<typeof nutritionPilotClient>,bytes:Buffer
let screening:ReturnType<typeof vi.fn>
const food={food:'Synthetic food',portion:'Estimated serving',protein:30,carbs:40,fat:10,calories:370}
const analysis={items:[food],total_protein:499,total_carbs:999,total_fat:299,total_calories:4999,confidence:0,notes:'Portions uncertain; not a measurement.'}
const result={text:JSON.stringify(analysis),provider:'openai' as const,model:'gpt-5.6-luna',toolCalls:[],stopReason:'stop' as const,usage:{input:200,output:100}}
const decision=(choice='food')=>({model:'gpt-6-luna',answers:[{name:'food_screen',type:'choice',choice,confidence:1,probabilities:['food','non_food','uncertain'].map(value=>({value,probability:value===choice?1:0}))}]})
const typed=()=>client as never
const input=(overrides:object={})=>({requestId:randomUUID(),expectedOwner:pilotTestOwner,capturedAt:'2026-10-19T12:30:00-05:00',context:'Ingredients unknown',consent:'selected-photo-openai-autolog-v1',bytes,mediaType:'image/png',...overrides})
const window={start:'2026-10-19T00:00:00-05:00',end:'2026-10-20T00:00:00-05:00'}
beforeAll(async()=>{db=await nutritionPilotDatabase();await db.query('INSERT INTO auth.users(id) VALUES($1)',[pilotTestOwner])},30000)
beforeEach(async()=>{
  vi.clearAllMocks();vi.mocked(nutritionPhotoPilotEnabled).mockReturnValue(true)
  owner=pilotTestOwner;await db.exec('RESET ROLE');await db.exec('TRUNCATE nutrition_photo_exposure,nutrition_photo_captures,logging_requests,activity_drafts,activity_revisions,activity_mutations,meals CASCADE');await photoDraftActor(db,owner)
  client=nutritionPilotClient(db,()=>owner)
  vi.mocked(createServerClient).mockResolvedValue(client as never)
  bytes=await sharp(randomBytes(32*32*3),{raw:{width:32,height:32,channels:3}}).png().toBuffer()
  vi.stubEnv('OPENAI_API_KEY','synthetic-key');vi.stubEnv('LLM_VISION_PROVIDER','anthropic')
  screening=vi.fn(async()=>new Response(JSON.stringify(decision())));vi.stubGlobal('fetch',screening)
  vi.mocked(complete).mockImplementation(async req=>{req.beforeDispatch?.();return result})
})
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
afterAll(async()=>{await db?.close()})

describe('inactive prepared selected-photo pilot: real PostgreSQL, synthetic bytes and transports',()=>{
  it('accepts bounded multipart input and exposes only owned public capture status',async()=>{
    const form=new FormData(),id=randomUUID();form.set('photo',new File([new Uint8Array(bytes)],'synthetic.png',{type:'image/png'}))
    for(const [key,value] of Object.entries({expectedOwner:pilotTestOwner,requestId:id,capturedAt:'2026-10-19T12:30:00-05:00',context:'',consent:'selected-photo-openai-autolog-v1'}))form.set(key,value)
    const response=await POST(new Request('http://localhost/api/meals/photo-pilot',{method:'POST',body:form}))
    expect(response.status).toBe(200);const saved=await response.json();expect(saved.capture.state).toBe('saved');expect(JSON.stringify(saved)).not.toContain('object_path')
    const status=await GET(new Request('http://localhost/api/meals/photo-pilot?captureId='+id));expect(status.headers.get('cache-control')).toBe('private, no-store')
    expect((await status.json()).capture.state).toBe('saved')
    expect((await GET(new Request('http://localhost/api/meals/photo-pilot?captureId='+randomUUID()))).status).toBe(404)
  })
  it('bounds chunked multipart bytes before parsing and rejects duplicate fields',async()=>{
    const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1024*1024+8193));controller.close()}})
    expect((await POST(new Request('http://localhost',{method:'POST',body:stream,duplex:'half'} as RequestInit))).status).toBe(413)
    const form=new FormData();form.append('requestId',randomUUID());form.append('requestId',randomUUID())
    expect((await POST(new Request('http://localhost',{method:'POST',body:form}))).status).toBe(422)
    expect(screening).not.toHaveBeenCalled()
  })
  it('stores one private derivative and an unreviewed estimated canonical meal with deterministic totals and original evidence',async()=>{
    const request=input(),saved=await capturePilotPhoto(typed(),request)
    expect(saved.state).toBe('saved');expect(client.objects.size).toBe(1)
    const meal=(await db.query<Record<string,any>>('SELECT * FROM meals')).rows[0]
    expect(meal).toMatchObject({total_protein:'30.00',total_carbs:'40.00',total_fat:'10.00',total_calories:'370.00',needs_review:true,reviewed_at:null,ai_confidence:'0.00',photo_url:null,capture_revision:1})
    expect((meal.capture_provenance as any).occurrence).toMatchObject({origin:'model_estimated',reviewState:'unreviewed'})
    expect((meal.capture_provenance as any).fields.macros).toMatchObject({origin:'model_estimated',reviewState:'unreviewed'})
    const stored=(await db.query<Record<string,any>>('SELECT * FROM nutrition_photo_captures')).rows[0]
    expect(stored.original_estimate).toMatchObject({provider:'openai',model:'gpt-5.6-luna',analysis:{confidence:0,total_calories:370}})
    expect(stored.prompt_hash).toMatch(/^[a-f0-9]{64}$/);expect(stored.photo_stored_at).toBeTruthy();expect(stored.estimated_at).toBeTruthy()
    expect(vi.mocked(complete).mock.calls[0][1]).toEqual({provider:'openai',model:'gpt-5.6-luna'})
    expect(vi.mocked(complete).mock.calls[0][0]).toMatchObject({maxTokens:1024,maxRetries:0,timeoutMs:45000})
    expect((await capturePilotPhoto(typed(),request)).meal_id).toBe(saved.meal_id)
    expect(screening).toHaveBeenCalledTimes(1);expect(complete).toHaveBeenCalledTimes(1)
    const context=await readPilotNutrition(typed(),window)
    expect(context.meals.state).toBe('available');expect(context.semantics.intakeCoverage).toBe('unknown')
    expect(JSON.stringify(context)).not.toContain('object_path');expect(JSON.stringify(context)).not.toContain('meals/11111111-1111-4111-8111-111111111111/nutrition-pilot')
    expect(context.currentTargets.state).toBe('missing')
  })
  it('rejects changed request input and new-ID duplicate image without another provider attempt',async()=>{
    const request=input();await capturePilotPhoto(typed(),request)
    await expect(capturePilotPhoto(typed(),{...request,context:'changed'})).rejects.toMatchObject({status:409})
    await expect(capturePilotPhoto(typed(),{...request,requestId:randomUUID()})).rejects.toMatchObject({status:409})
    expect(complete).toHaveBeenCalledTimes(1)
  })
  it('conflicts on identical normalized pixels under a new ID after image metadata changes',async()=>{
    const variant=await sharp(bytes).withExif({IFD0:{ImageDescription:'Synthetic metadata-only change'}}).png().toBuffer()
    const before=await preparePilotPhoto(bytes,'image/png'),after=await preparePilotPhoto(variant,'image/png')
    expect(before.sourceHash).not.toBe(after.sourceHash);expect(before.normalizedHash).toBe(after.normalizedHash)
    await capturePilotPhoto(typed(),input())
    await expect(capturePilotPhoto(typed(),input({bytes:variant}))).rejects.toMatchObject({status:409})
    expect(complete).toHaveBeenCalledTimes(1);expect((await db.query('SELECT * FROM meals')).rows).toHaveLength(1)
  })
  it('serializes concurrent identical admission and produces one meal',async()=>{
    const request=input(),values=await Promise.all([capturePilotPhoto(typed(),request),capturePilotPhoto(typed(),request)])
    expect(values.map(v=>v.id)).toEqual([request.requestId,request.requestId])
    expect((await db.query('SELECT * FROM meals')).rows).toHaveLength(1);expect(complete).toHaveBeenCalledTimes(1);expect(screening).toHaveBeenCalledTimes(1)
  })
  it.each(['non_food','uncertain'])('does not estimate or log %s screening',async choice=>{
    screening.mockImplementation(async()=>new Response(JSON.stringify(decision(choice))))
    expect((await capturePilotPhoto(typed(),input())).state).toBe('rejected')
    expect(complete).not.toHaveBeenCalled();expect((await db.query('SELECT * FROM meals')).rows).toHaveLength(0)
  })
  it.each(['screen','estimate','upload'])('stops %s ambiguity without blind paid retry',async boundary=>{
    if(boundary==='screen')screening.mockRejectedValue(new Error('lost response'))
    if(boundary==='estimate')vi.mocked(complete).mockRejectedValue(new Error('lost response'))
    if(boundary==='upload')vi.spyOn(client.storage,'from').mockReturnValue({upload:async()=>({error:{code:'transport'}})})
    const request=input();expect((await capturePilotPhoto(typed(),request)).state).toBe('uncertain')
    await capturePilotPhoto(typed(),request)
    expect(screening).toHaveBeenCalledTimes(boundary==='upload'?0:1);expect(complete).toHaveBeenCalledTimes(boundary==='estimate'?1:0)
    expect((await db.query('SELECT * FROM meals')).rows).toHaveLength(0)
  })
  it('recovers a committed but lost canonical response without another model call',async()=>{
    const original=client.rpc;let lost=false
    vi.spyOn(client,'rpc').mockImplementation(async(name,args)=>{const value=await original(name,args);if(args.p_action==='commit'&&!lost){lost=true;return {data:null,error:{code:'transport',message:'response lost'}}}return value})
    const request=input(),saved=await capturePilotPhoto(typed(),request)
    expect(saved.state).toBe('saved');expect((await capturePilotPhoto(typed(),request)).meal_id).toBe(saved.meal_id)
    expect((await db.query('SELECT * FROM meals')).rows).toHaveLength(1);expect(complete).toHaveBeenCalledTimes(1)
  })
  it('can resume a persisted estimate after a proven precommit rejection without rerunning providers',async()=>{
    const original=client.rpc;let rejected=false
    vi.spyOn(client,'rpc').mockImplementation(async(name,args)=>{if(args.p_action==='commit'&&!rejected){rejected=true;return {data:null,error:{code:'40001',message:'not committed'}}}return original(name,args)})
    const request=input();expect((await capturePilotPhoto(typed(),request)).state).toBe('estimated')
    const status=await GET(new Request('http://localhost/api/meals/photo-pilot?captureId='+request.requestId))
    expect((await status.json()).capture.state).toBe('estimated');expect((await db.query('SELECT * FROM meals')).rows).toHaveLength(0)
    const recovery=()=>PATCH(new Request('http://localhost/api/meals/photo-pilot',{method:'PATCH',body:JSON.stringify({captureId:request.requestId,expectedOwner:pilotTestOwner})}))
    expect((await (await recovery()).json()).capture.state).toBe('saved')
    expect((await (await recovery()).json()).capture.state).toBe('saved')
    expect(complete).toHaveBeenCalledTimes(1);expect(screening).toHaveBeenCalledTimes(1)
    expect((await db.query('SELECT * FROM meals')).rows).toHaveLength(1)
  })
  it('corrects an owned revision with replay and preserves the original estimate and occurrence uncertainty',async()=>{
    const saved=await capturePilotPhoto(typed(),input()),edit={mealId:saved.meal_id,expectedRevision:1,requestId:randomUUID(),items:[{...food,protein:35,portion:'Revised portion'}]}
    const receipt=await correctPilotMeal(typed(),edit)
    expect(receipt.revision).toBe(2);expect((await correctPilotMeal(typed(),edit)).revision).toBe(2)
    await expect(correctPilotMeal(typed(),{...edit,requestId:randomUUID()})).rejects.toMatchObject({code:'40001'})
    await expect(correctPilotMeal(typed(),{...edit,items:[{...food,protein:99}]})).rejects.toBeTruthy()
    expect((await db.query<{total_protein:string}>('SELECT total_protein FROM meals')).rows[0].total_protein).toBe('35.00')
    expect((await db.query<{original_estimate:unknown}>('SELECT original_estimate FROM nutrition_photo_captures')).rows[0].original_estimate).toMatchObject({analysis:{total_protein:30}})
    expect(receipt.provenance.occurrence.reviewState).toBe('unreviewed');expect(receipt.provenance.fields.macros.origin).toBe('model_estimated')
  })
  it('allows only one concurrent correction from a revision and denies direct capture mutation',async()=>{
    const saved=await capturePilotPhoto(typed(),input())
    const edits=[35,40].map(protein=>({mealId:saved.meal_id,expectedRevision:1,requestId:randomUUID(),items:[{...food,protein}]}))
    const outcomes=await Promise.allSettled(edits.map(edit=>correctPilotMeal(typed(),edit)))
    expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1)
    expect(outcomes.filter(r=>r.status==='rejected')).toHaveLength(1)
    await expect(db.query("UPDATE nutrition_photo_captures SET original_estimate='{}' WHERE id=$1",[saved.id])).rejects.toMatchObject({code:'42501'})
    await expect(db.query('DELETE FROM nutrition_photo_captures WHERE id=$1',[saved.id])).rejects.toMatchObject({code:'42501'})
  })
  it('denies anonymous, foreign and switched owners before storage/provider work, with SQL RLS as a second boundary',async()=>{
    owner=null;await expect(capturePilotPhoto(typed(),input())).rejects.toMatchObject({status:401})
    owner=pilotTestOwner;await expect(capturePilotPhoto(typed(),input({expectedOwner:randomUUID()}))).rejects.toMatchObject({status:403})
    const saved=await capturePilotPhoto(typed(),input());owner=randomUUID();await db.exec('RESET ROLE');await db.query('INSERT INTO auth.users VALUES($1)',[owner]);await photoDraftActor(db,owner)
    expect((await db.query('SELECT * FROM nutrition_photo_captures')).rows).toHaveLength(0)
    expect((await client.rpc('nutrition_photo_pilot',{p_id:saved.id,p_action:'commit'})).error?.code).toBe('42501')
    await expect(correctPilotMeal(typed(),{mealId:saved.meal_id,expectedRevision:1,requestId:randomUUID(),items:[food]})).rejects.toMatchObject({status:403})
    expect(complete).toHaveBeenCalledTimes(1)
  })
  it('rechecks authorization after screening before any estimation',async()=>{
    screening.mockImplementation(async()=>{vi.mocked(nutritionPhotoPilotEnabled).mockReturnValue(false);return new Response(JSON.stringify(decision()))})
    await capturePilotPhoto(typed(),input());expect(complete).not.toHaveBeenCalled()
  })
  it.each(['screen_start','estimate_start'])('does not dispatch after a committed but lost %s acknowledgement',async action=>{
    const original=client.rpc;let lost=false
    vi.spyOn(client,'rpc').mockImplementation(async(name,args)=>{
      const value=await original(name,args)
      if(args.p_action===action&&!lost){lost=true;return {data:null,error:{code:'transport',message:'lost synthetic acknowledgement'}}}
      return value
    })
    const request=input();expect((await capturePilotPhoto(typed(),request)).state).toBe('uncertain')
    await capturePilotPhoto(typed(),request)
    expect(screening).toHaveBeenCalledTimes(action==='screen_start'?0:1);expect(complete).not.toHaveBeenCalled()
    const ledger=(await db.query<{stage:string;settled_at:string|null}>('SELECT stage,settled_at FROM nutrition_photo_exposure')).rows
    expect(ledger.find(row=>row.stage===(action==='screen_start'?'screen':'estimate'))?.settled_at).toBeNull()
  })
  it('refuses a malformed paid grant before either paid transport',async()=>{
    const original=client.rpc
    vi.spyOn(client,'rpc').mockImplementation(async(name,args)=>{
      const value=await original(name,args)
      if(args.p_action==='screen_start'&&value.data)return {data:{...value.data as object,dispatch_grant:{}},error:null}
      return value
    })
    expect((await capturePilotPhoto(typed(),input())).state).toBe('uncertain')
    expect(screening).not.toHaveBeenCalled();expect(complete).not.toHaveBeenCalled()
  })
  it('keeps default-off routes inert regardless of existing feature flags',async()=>{
    vi.mocked(nutritionPhotoPilotEnabled).mockReturnValue(false);vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED','true')
    expect((await POST(new Request('http://localhost',{method:'POST',body:'not multipart'}))).status).toBe(409)
    expect((await GET(new Request('http://localhost'))).status).toBe(409)
    expect((await PATCH(new Request('http://localhost',{method:'PATCH',body:'{}'}))).status).toBe(409)
    expect(screening).not.toHaveBeenCalled();expect(client.objects.size).toBe(0)
  })
  it('keeps empty logs distinct from unknown intake coverage and outages',async()=>{
    const empty=await readPilotNutrition(typed(),window);expect(empty.meals.state).toBe('missing');expect(empty.semantics.intakeCoverage).toBe('unknown')
    vi.spyOn(client,'from').mockImplementation(()=>{throw new Error('read outage')})
    expect((await readPilotNutrition(typed(),window)).meals.state).toBe('unavailable')
  })
  it('reports capped source coverage and uses an exclusive time boundary',async()=>{
    await db.exec('RESET ROLE')
    await db.query("INSERT INTO meals(user_id,meal_timestamp,items,total_protein,total_carbs,total_fat,total_calories) SELECT $1,'2026-10-19T17:30:00Z','[]',0,0,0,0 FROM generate_series(1,51)",[pilotTestOwner])
    await db.query("INSERT INTO meals(user_id,meal_timestamp,items,total_protein,total_carbs,total_fat,total_calories) VALUES($1,'2026-10-20T05:00:00Z','[]',0,0,0,0)",[pilotTestOwner])
    await photoDraftActor(db,pilotTestOwner)
    const context=await readPilotNutrition(typed(),window);expect(context.meals.state).toBe('truncated');expect(context.meals.count).toBe(51);expect(context.meals.records).toHaveLength(50)
    await expect(readPilotNutrition(typed(),{...window,owner:'forged'})).rejects.toMatchObject({status:422})
    await expect(readPilotNutrition(typed(),{start:window.start,end:'2027-01-01T00:00:00Z'})).rejects.toMatchObject({status:422})
  })
  it.each([Buffer.from('not an image'),Buffer.from([0xff,0xd8,...new Uint8Array(200),0xff,0xd9])])('rejects malformed decoded image before dispatch',async invalid=>{
    await expect(capturePilotPhoto(typed(),input({bytes:invalid,mediaType:'image/jpeg'}))).rejects.toMatchObject({status:422})
    expect(screening).not.toHaveBeenCalled();expect(client.objects.size).toBe(0)
  })
  it('rejects MIME spoofing and overlarge decoded dimensions; strips metadata',async()=>{
    await expect(preparePilotPhoto(bytes,'image/jpeg')).rejects.toBeTruthy()
    const huge=await sharp({create:{width:4000,height:4000,channels:3,background:'white'}}).png().toBuffer()
    await expect(preparePilotPhoto(huge,'image/png')).rejects.toBeTruthy()
    const metadataPhoto=await sharp(bytes).withMetadata({orientation:6}).jpeg().toBuffer()
    const normalized=await preparePilotPhoto(metadataPhoto,'image/jpeg'),meta=await sharp(normalized.bytes).metadata()
    expect(meta.exif).toBeUndefined();expect(meta.orientation).toBeUndefined()
  })
})

it('retains a second default-off database gate even if the application gate changes',async()=>{
  const inactive=await nutritionPilotDatabase(false)
  try {await inactive.query('INSERT INTO auth.users VALUES($1)',[pilotTestOwner]);await photoDraftActor(inactive,pilotTestOwner)
    await expect(inactive.query("SELECT nutrition_photo_pilot($1,'reserve','{}')",[randomUUID()])).rejects.toMatchObject({code:'42501'})
  }finally{await inactive.close()}
},30000)
