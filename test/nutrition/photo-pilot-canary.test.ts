import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { nutritionCanaryDatabase,applyCanaryPhase } from '../helpers/nutrition-canary-database'
import { nutritionPilotClient,nutritionPilotSettlementClient,pilotTestOwner } from '../helpers/nutrition-pilot-database'
import { photoDraftActor } from '../helpers/photo-draft-database'
vi.hoisted(()=>{globalThis.fetch=async()=>{throw new Error('Unexpected network: offline canary suite')}})
vi.mock('@/app/lib/nutrition/photo-pilot-policy',()=>({nutritionPhotoPilotEnabled:vi.fn(()=>false),nutritionPhotoPilotOwner:(id:string)=>id==='11111111-1111-4111-8111-111111111111'}))
vi.mock('@/app/lib/nutrition/photo-pilot-canary-policy',async original=>({...await original<object>(),nutritionPhotoCanaryEnabled:vi.fn(()=>true),nutritionPhotoCanaryDispatchEnabled:vi.fn(()=>true)}))
vi.mock('@/app/lib/llm/client',()=>({complete:vi.fn()}))
vi.mock('@/app/lib/auth/supabase-server',()=>({createServerClient:vi.fn(),createServiceRoleClient:vi.fn()}))
vi.mock('node:fs/promises',async original=>{const fs=await original<typeof import('node:fs/promises')>();return {...fs,readFile:vi.fn(fs.readFile)}})
import { readFile } from 'node:fs/promises'
import * as photoPreparation from '@/app/lib/nutrition/photo-pilot-image'
import { createServerClient,createServiceRoleClient } from '@/app/lib/auth/supabase-server'
import { complete } from '@/app/lib/llm/client'
import { nutritionPhotoPilotEnabled } from '@/app/lib/nutrition/photo-pilot-policy'
import { nutritionPhotoCanaryEnabled,nutritionPhotoCanaryDispatchEnabled,PHOTO_CANARY_ID,PHOTO_CANARY_SOURCE_HASH,PHOTO_CANARY_NORMALIZED_HASH,PHOTO_CANARY_CONTEXT,PHOTO_CANARY_CONSENT } from '@/app/lib/nutrition/photo-pilot-canary-policy'
import { captureFixedPhotoCanary,capturePilotPhoto,resumePilotCapture } from '@/app/lib/nutrition/photo-pilot'
import { preparePilotPhoto,photoHash } from '@/app/lib/nutrition/photo-pilot-image'
import { POST,GET } from '@/app/api/meals/photo-pilot/canary/route'
import { POST as normalPost,GET as normalGet,PATCH as normalPatch } from '@/app/api/meals/photo-pilot/route'
import { GET as metadataGet } from '@/app/api/meals/photo-pilot/qualification/route'

let db:PGlite,owner:string|null,client:ReturnType<typeof nutritionPilotClient>,fetcher:ReturnType<typeof vi.fn>,missingScreen:boolean,missingEstimate:boolean
const url='https://example.test/api/meals/photo-pilot/canary'
const request=(body='consent='+PHOTO_CANARY_CONSENT,extra:RequestInit={})=>new Request(url,{method:'POST',headers:{origin:'https://example.test','content-type':'application/x-www-form-urlencoded'},body,...extra})
const decision=(choice='food')=>({model:'gpt-6-luna',answers:[{name:'food_screen',type:'choice',choice,confidence:1,probabilities:['food','non_food','uncertain'].map(value=>({value,probability:value===choice?1:0}))}],...(!missingScreen?{usage:{input_tokens:3000,output_tokens:0,total_tokens:3000}}:{})})
const analysis={items:[{food:'Synthetic illustration',portion:'Unmeasured',protein:30,carbs:40,fat:10,calories:370}],total_protein:30,total_carbs:40,total_fat:10,total_calories:370,confidence:0.5,notes:'Not consumed; synthetic plumbing only.'}
async function canonicalCounts(){
  const out:Record<string,number>={}
  for(const table of ['meals','logging_requests','logging_request_items','activity_revisions','activity_mutations'])out[table]=(await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n
  return out
}
const noCanonical=async()=>expect(await canonicalCounts()).toEqual({meals:0,logging_requests:0,logging_request_items:0,activity_revisions:0,activity_mutations:0})
const total=async()=>Number((await db.query<{n:string}>('SELECT coalesce(sum(coalesce(confirmed_micro_usd,reserved_micro_usd)),0)::text n FROM nutrition_photo_exposure')).rows[0].n)
beforeAll(async()=>{db=await nutritionCanaryDatabase();await applyCanaryPhase(db,1)},30000)
beforeEach(async()=>{
  vi.clearAllMocks();vi.mocked(nutritionPhotoPilotEnabled).mockReturnValue(false);vi.mocked(nutritionPhotoCanaryEnabled).mockReturnValue(true);vi.mocked(nutritionPhotoCanaryDispatchEnabled).mockReturnValue(true)
  owner=pilotTestOwner;missingScreen=false;missingEstimate=false
  await db.exec('RESET ROLE; TRUNCATE nutrition_photo_exposure,nutrition_photo_captures,logging_requests,activity_drafts,activity_revisions,activity_mutations,meals CASCADE');await photoDraftActor(db,owner)
  client=nutritionPilotClient(db,()=>owner,'nutrition-canary');vi.mocked(createServerClient).mockResolvedValue(client as never)
  vi.mocked(createServiceRoleClient).mockReturnValue(nutritionPilotSettlementClient(db) as never)
  vi.stubEnv('OPENAI_API_KEY','offline-synthetic-canary-key')
  fetcher=vi.fn(async(target:string,init:RequestInit)=>{
    if(target!=='https://api.openai.com/v1/decisions'||init.method!=='POST')throw new Error('Unexpected offline endpoint')
    expect(JSON.parse(init.body as string).model).toBe('gpt-6-luna')
    return new Response(JSON.stringify(decision()),{headers:{'x-request-id':'req_'+randomUUID()}})
  });vi.stubGlobal('fetch',fetcher)
  vi.mocked(complete).mockImplementation(async(req,routing)=>{
    req.beforeDispatch?.();expect(routing).toEqual({provider:'openai',model:'gpt-5.6-luna'})
    expect(req).toMatchObject({maxTokens:1024,maxRetries:0,store:false,timeoutMs:45000})
    expect(JSON.stringify(req)).toContain(PHOTO_CANARY_CONTEXT)
    return {text:JSON.stringify(analysis),provider:'openai',model:'gpt-5.6-luna',toolCalls:[],stopReason:'stop',usage:{input:5000,output:1024},...(!missingEstimate?{billing:{receiptId:'resp_'+randomUUID(),inputTokens:5000,outputTokens:1024,totalTokens:6024,serviceTier:'default'}}:{})}
  })
})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs()})
afterAll(async()=>{await db?.close()})

describe('fixed canary: real isolated PostgreSQL and inert provider/storage transports',()=>{
  it('binds the actual server fixture and production normalization to frozen hashes',async()=>{
    const source=readFileSync('app/lib/nutrition/fixtures/nutrition-canary-source.jpg')
    expect(photoHash(source)).toBe(PHOTO_CANARY_SOURCE_HASH)
    const photo=await preparePilotPhoto(source,'image/jpeg');expect(photo.normalizedHash).toBe(PHOTO_CANARY_NORMALIZED_HASH);expect(photo.bytes.length).toBe(20923)
    source[100]^=1;expect(photoHash(source)).not.toBe(PHOTO_CANARY_SOURCE_HASH)
  })
  it('rejects a changed source or derivative before staging or provider work',async()=>{
    const source=readFileSync('app/lib/nutrition/fixtures/nutrition-canary-source.jpg'),changed=Buffer.from(source);changed[100]^=1
    vi.mocked(readFile).mockResolvedValueOnce(changed as never)
    await expect(captureFixedPhotoCanary(client as never)).rejects.toMatchObject({status:409})
    const original=await preparePilotPhoto(source,'image/jpeg')
    vi.spyOn(photoPreparation,'preparePilotPhoto').mockResolvedValueOnce({...original,normalizedHash:'c'.repeat(64)})
    await expect(captureFixedPhotoCanary(client as never)).rejects.toMatchObject({status:409})
    expect(client.objects.size).toBe(0);expect(fetcher).not.toHaveBeenCalled();expect(await total()).toBe(0);await noCanonical()
  })
  it('stages privately with dispatch closed, then consumes the same ID once after proof gate',async()=>{
    vi.mocked(nutritionPhotoCanaryDispatchEnabled).mockReturnValue(false)
    expect((await captureFixedPhotoCanary(client as never)).state).toBe('photo_stored')
    expect(fetcher).not.toHaveBeenCalled();expect(complete).not.toHaveBeenCalled();expect(await total()).toBe(0)
    expect([...client.objects.keys()]).toEqual([`meals/${pilotTestOwner}/nutrition-canary/${PHOTO_CANARY_ID}.jpg`]);expect(photoHash([...client.objects.values()][0])).toBe(PHOTO_CANARY_NORMALIZED_HASH)
    expect((await captureFixedPhotoCanary(client as never)).state).toBe('photo_stored')
    await noCanonical()
    vi.mocked(nutritionPhotoCanaryDispatchEnabled).mockReturnValue(true)
    expect((await captureFixedPhotoCanary(client as never)).state).toBe('estimated')
    expect((await captureFixedPhotoCanary(client as never)).state).toBe('estimated')
    expect(fetcher).toHaveBeenCalledTimes(1);expect(complete).toHaveBeenCalledTimes(1);expect(await total()).toBe(5438)
    expect((await db.query('SELECT meal_id,receipt FROM nutrition_photo_captures')).rows).toEqual([{meal_id:null,receipt:null}]);await noCanonical()
  })
  it('does not commit a fresh or replayed valid estimate through the consent route',async()=>{
    const result=await POST(request());expect(result.status).toBe(200);expect((await result.json()).capture).toMatchObject({id:PHOTO_CANARY_ID,state:'estimated',mealId:null})
    expect((await POST(request())).status).toBe(200);expect(fetcher).toHaveBeenCalledTimes(1);expect(complete).toHaveBeenCalledTimes(1);await noCanonical()
  })
  it('refuses generic capture/resume/PATCH and direct SQL commits for the canary',async()=>{
    await captureFixedPhotoCanary(client as never);vi.mocked(nutritionPhotoPilotEnabled).mockReturnValue(true)
    await expect(capturePilotPhoto(client as never,{requestId:PHOTO_CANARY_ID} as never)).rejects.toMatchObject({status:409})
    await expect(resumePilotCapture(client as never,PHOTO_CANARY_ID.toUpperCase(),pilotTestOwner)).rejects.toMatchObject({status:409})
    expect((await normalPatch(new Request(url,{method:'PATCH',body:JSON.stringify({captureId:PHOTO_CANARY_ID,expectedOwner:pilotTestOwner})}))).status).toBe(409)
    expect((await client.rpc('nutrition_photo_pilot',{p_id:PHOTO_CANARY_ID,p_action:'commit'})).error?.code).toBe('42501');await noCanonical()
  })
  it.each([false,true])('keeps all normal photo routes paused with canary=%s and pilot=false',async active=>{
    vi.mocked(nutritionPhotoCanaryEnabled).mockReturnValue(active)
    expect((await normalGet(new Request(url))).status).toBe(409)
    expect((await normalPost(new Request(url,{method:'POST',body:'x'}))).status).toBe(409)
    expect((await normalPatch(new Request(url,{method:'PATCH',body:'{}'}))).status).toBe(409)
    expect(createServerClient).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();expect(client.objects.size).toBe(0)
  })
  it.each([null,'22222222-2222-4222-8222-222222222222'])('rejects absent or foreign owner %s',async next=>{
    owner=next;expect((await GET(new Request(url))).status).toBe(next?403:401);expect((await POST(request())).status).toBe(next?403:401)
    expect(fetcher).not.toHaveBeenCalled();expect(client.objects.size).toBe(0);await noCanonical()
  })
  it('GET returns a minimal nonhydrated status/form without writes or app side effects',async()=>{
    const rpc=vi.spyOn(client,'rpc'),response=await GET(new Request(url)),html=await response.text()
    expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(html).toContain('<form method="post"')
    expect(html).not.toMatch(/<script|__next|AuthProvider|WHOOP|object_path|offline-synthetic/);expect(rpc).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();expect(client.objects.size).toBe(0)
    const source=readFileSync('app/api/meals/photo-pilot/canary/route.ts','utf8');expect(source).not.toMatch(/from ['"].*(?:components|AuthContext|whoop)/)
    await noCanonical()
  })
  it.each(['consent='+PHOTO_CANARY_CONSENT+'&consent='+PHOTO_CANARY_CONSENT,'consent='+PHOTO_CANARY_CONSENT+'&model=other','consent=wrong','photo=anything','x'.repeat(129)])('rejects malformed, extra, duplicate or large consent fields',async body=>{
    expect([413,422]).toContain((await POST(request(body))).status);expect(fetcher).not.toHaveBeenCalled();expect(client.objects.size).toBe(0)
  })
  it('rejects query overrides, JSON/image bodies and cross-origin form submissions',async()=>{
    expect((await GET(new Request(url+'?captureId='+randomUUID()))).status).toBe(422)
    expect((await POST(new Request(url+'?model=other',{method:'POST',headers:{origin:'https://example.test','content-type':'application/x-www-form-urlencoded'},body:'consent='+PHOTO_CANARY_CONSENT}))).status).toBe(422)
    for(const type of ['application/json','image/jpeg'])expect((await POST(request('{}',{headers:{origin:'https://example.test','content-type':type}}))).status).toBe(422)
    expect((await POST(request(undefined,{headers:{origin:'https://foreign.test','content-type':'application/x-www-form-urlencoded'}}))).status).toBe(422)
    expect(fetcher).not.toHaveBeenCalled();expect(client.objects.size).toBe(0)
  })
  it('stops without estimate on missing screening usage and retains the full reservation',async()=>{
    missingScreen=true;expect((await captureFixedPhotoCanary(client as never)).state).toBe('uncertain')
    await captureFixedPhotoCanary(client as never);expect(fetcher).toHaveBeenCalledTimes(1);expect(complete).not.toHaveBeenCalled();expect(await total()).toBe(250000);await noCanonical()
  })
  it('retains the full estimate reserve on missing estimation usage without replay',async()=>{
    missingEstimate=true;expect((await captureFixedPhotoCanary(client as never)).state).toBe('estimated');await captureFixedPhotoCanary(client as never)
    expect(fetcher).toHaveBeenCalledTimes(1);expect(complete).toHaveBeenCalledTimes(1);expect(await total()).toBe(600660);await noCanonical()
  })
  it.each(['non_food','uncertain'])('stops on screening %s without forcing a second image',async choice=>{
    fetcher.mockResolvedValue(new Response(JSON.stringify(decision(choice)),{headers:{'x-request-id':'req_'+randomUUID()}}))
    expect((await captureFixedPhotoCanary(client as never)).state).toBe('rejected');await captureFixedPhotoCanary(client as never)
    expect(fetcher).toHaveBeenCalledTimes(1);expect(complete).not.toHaveBeenCalled();await noCanonical()
  })
  it('stops if the owner session changes after screening',async()=>{
    fetcher.mockImplementation(async()=>{owner=null;return new Response(JSON.stringify(decision()),{headers:{'x-request-id':'req_changed'}})})
    await captureFixedPhotoCanary(client as never);expect(complete).not.toHaveBeenCalled();expect(await total()).toBe(250000)
  })
  it('rejects changed private readback before any paid admission',async()=>{
    vi.mocked(nutritionPhotoCanaryDispatchEnabled).mockReturnValue(false);await captureFixedPhotoCanary(client as never)
    client.objects.set([...client.objects.keys()][0],new Uint8Array([1,2,3]));vi.mocked(nutritionPhotoCanaryDispatchEnabled).mockReturnValue(true)
    expect((await captureFixedPhotoCanary(client as never)).state).toBe('uncertain');expect(fetcher).not.toHaveBeenCalled();expect(await total()).toBe(0)
  })
  it.each(['screen_start','estimate_start'])('does not redispatch a committed but lost %s acknowledgement',async action=>{
    const original=client.rpc;let lost=false
    vi.spyOn(client,'rpc').mockImplementation(async(name,args)=>{const out=await original(name,args);if(args.p_action===action&&!lost){lost=true;return {data:null,error:{code:'transport',message:'synthetic lost acknowledgement'}}}return out})
    await captureFixedPhotoCanary(client as never);await captureFixedPhotoCanary(client as never)
    expect(fetcher).toHaveBeenCalledTimes(action==='screen_start'?0:1);expect(complete).not.toHaveBeenCalled();expect(await total()).toBe(action==='screen_start'?250000:600660);await noCanonical()
  })
  it('has all actual release gates false regardless of environment variables',async()=>{
    vi.stubEnv('NUTRITION_PHOTO_CANARY_ACTIVE','true');vi.stubEnv('NUTRITION_PHOTO_CANARY_DISPATCH_ACTIVE','true')
    const actual=await vi.importActual<typeof import('@/app/lib/nutrition/photo-pilot-canary-policy')>('@/app/lib/nutrition/photo-pilot-canary-policy')
    expect(actual.nutritionPhotoCanaryEnabled()).toBe(false);expect(actual.nutritionPhotoCanaryDispatchEnabled()).toBe(false)
    vi.mocked(nutritionPhotoCanaryEnabled).mockReturnValue(false)
    expect((await GET(new Request(url))).status).toBe(409);expect((await POST(request())).status).toBe(409)
    expect((await metadataGet(new Request('https://example.test/api/meals/photo-pilot/qualification'))).status).toBe(409)
    expect(createServerClient).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();expect(complete).not.toHaveBeenCalled()
  })
})
