import { randomUUID, createHash } from 'node:crypto'
import sharp from 'sharp'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { photoDraftDatabase, photoDraftActor, photoDraftClient } from '../helpers/photo-draft-database'
import { sqlFile } from '../database/fixture'
import { POST as submit } from '@/app/api/capture/camera/photos/route'
import { normalizedCameraJPEG } from '@/app/lib/capture/camera-jpeg'
import { GET as status } from '@/app/api/capture/camera/status/route'
import { POST as pair, DELETE as revoke, GET as devices } from '@/app/api/capture/devices/route'
import { screenMealPhoto } from '@/app/lib/nutrition/photo-screening'
import { analyzeMealPhoto } from '@/app/lib/nutrition/meal-photo-analysis'
import { createServerClient, createServiceRoleClient } from '@/app/lib/auth/supabase-server'
import { deviceHash } from '@/app/lib/capture/camera-device'

vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn(), createServiceRoleClient: vi.fn() }))
vi.mock('@/app/lib/nutrition/photo-screening', () => ({ screenMealPhoto: vi.fn() }))
vi.mock('@/app/lib/nutrition/meal-photo-analysis', async original => ({ ...await original<object>(), analyzeMealPhoto: vi.fn() }))
let db: PGlite, owner: string, other: string, token: string, device: string
const names: Record<string,string[]> = {
 camera_photo_request: ['p_hash','p_action','p_id','p_content_hash','p_captured_at','p_outcome','p_operation'],
 camera_photo_device_control: ['p_action','p_id','p_hash','p_policy'],
}
const food = { food: 'Egg', portion: '1 egg', protein: 6, carbs: 1, fat: 5, calories: 73 }
const analysis = { items: [food], total_protein: 6, total_carbs: 1, total_fat: 5, total_calories: 73, confidence: .95, notes: '' }
const screening = { model: 'gpt-6-luna', policy: 'decisions-food-v2', choice: 'food', confidence: .95, probabilities: [{ value: 'food', probability: .95 },{value:'non_food',probability:.03},{value:'uncertain',probability:.02}], route: 'food_candidate' } as const
function rpc(role: 'owner' | 'service') {
 return { rpc: async (name: string, args: Record<string,unknown>) => {
  try {
   await db.exec(`SET ROLE ${role === 'service' ? 'service_role' : 'authenticated'}`)
   await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [role === 'owner' ? owner : ''])
   const list = names[name], row = await db.query<{ result: unknown }>(`SELECT public.${name}(${list.map((_,i)=>`$${i+1}`).join(',')}) result`, list.map(k => args[k] ?? null))
   return { data: row.rows[0].result, error: null }
  } catch (e) { return { data: null, error: { code: (e as {code:string}).code } } }
 } }
}
let photoBytes: Uint8Array
function jpeg() { return new Uint8Array(photoBytes) }
function upload(id: string = randomUUID(), extra: Record<string,string> = {}, bearer = token, bytes = jpeg()) {
 const form = new FormData(); form.set('photo',new File([bytes], 'photo.jpg', {type:'image/jpeg'}))
 for (const [key,value] of Object.entries({ requestId:id, timestamp:new Date().toISOString(), contentHash:createHash('sha256').update(bytes).digest('hex'), ...extra })) form.set(key,value)
 return new Request('https://localhost/api/capture/camera/photos',{ method:'POST',headers:{Authorization:`Bearer ${bearer}`},body:form })
}
function read(id: string, bearer = token) { return status(new Request(`https://localhost/api/capture/camera/status?requestId=${id}`, {headers:{Authorization:`Bearer ${bearer}`}})) }
async function count(table: string) { await db.exec('RESET ROLE'); return (await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table} WHERE user_id=$1`,[owner])).rows[0].n }
beforeAll(async()=> {
 // Actual pixels, decoded and re-encoded by the candidate route. No model call.
 const pixels = Buffer.from(Array.from({ length: 64 * 64 * 3 }, (_, i) => i * 37 % 256))
 photoBytes = new Uint8Array(await sharp(pixels, { raw: {width:64,height:64,channels:3} }).jpeg({quality:95}).toBuffer())
 db = await photoDraftDatabase(); await db.exec(sqlFile('docs/migrations/camera-photo-bridge.sql')); await db.exec(sqlFile('docs/migrations/camera-photo-bridge.sql'))
},30000)
beforeEach(async()=> {
 vi.clearAllMocks(); vi.stubEnv('CAMERA_PHOTO_BRIDGE_ENABLED','true'); vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED','true')
 owner=randomUUID(); other=randomUUID(); await db.exec('RESET ROLE'); await db.query('INSERT INTO auth.users(id) VALUES($1),($2)',[owner,other])
 vi.mocked(createServerClient).mockResolvedValue({ ...rpc('owner'), auth:{ getUser: async()=>({data:{user:{id:owner}},error:null}) } } as never)
 vi.mocked(createServiceRoleClient).mockReturnValue(rpc('service') as never)
 vi.mocked(screenMealPhoto).mockResolvedValue(screening as never); vi.mocked(analyzeMealPhoto).mockResolvedValue(analysis)
 const r=await pair(new Request('https://localhost/api/capture/devices',{method:'POST',body:JSON.stringify({expectedUserId:owner,consentPolicy:'camera-cloud-v1'})})), data=await r.json()
 expect(r.status).toBe(200); token=data.token; device=data.id
 // Admission and captured times for this synthetic case are strictly ordered.
 await db.exec('RESET ROLE'); await db.query("UPDATE camera_photo_devices SET admitted_at=clock_timestamp()-interval '1 minute' WHERE id=$1",[device])
})
afterAll(async()=> { vi.unstubAllEnvs(); await db?.close() })
describe('scoped native photo bridge (real PostgreSQL functions/RLS; fake providers)',()=> {
 it('creates one owned unreviewed draft, terminal replay and zero meals',async()=> {
  const request=upload(), id=(await request.clone().formData()).get('requestId') as string
  const first=await submit(request.clone()), result=await first.json(); expect(first.status).toBe(200); expect(result).toMatchObject({state:'complete',outcome:'draft',canonicalChanged:false})
  expect(await count('meals')).toBe(0)
  expect((await (await submit(request.clone())).json()).draftId).toBe(result.draftId)
  expect((await (await read(id)).json()).draftId).toBe(result.draftId)
  expect(screenMealPhoto).toHaveBeenCalledTimes(1); expect(analyzeMealPhoto).toHaveBeenCalledTimes(1)
  expect(analyzeMealPhoto).toHaveBeenCalledWith(expect.objectContaining({timeoutMs:45000,maxRetries:0}))
  await photoDraftActor(db,owner); const rows=await db.query<{user_id:string; normalized:Record<string,unknown>}>('SELECT * FROM activity_drafts WHERE id=$1',[result.draftId])
  expect(rows.rows[0].user_id).toBe(owner); expect(rows.rows[0].normalized).toMatchObject({inputMethod:'photo',provenance:{occurrence:{reviewState:'unreviewed'}}})
  // Native capability has no generic acceptance permission. Only a separate
  // authenticated browser request can confirm consumption and write a meal.
  await db.exec('SET ROLE service_role')
  await expect(db.query('SELECT commit_activity_draft($1,1,$2)',[result.draftId,randomUUID()])).rejects.toMatchObject({code:'42501'})
  await photoDraftActor(db,owner)
  const claim=await db.query<{r:{id:string}}>("SELECT begin_logging_request($1,$2) r",[`test-accept:${randomUUID()}`,'c'.repeat(64)])
  await db.query('SELECT commit_activity_draft($1,1,$2)',[result.draftId,claim.rows[0].r.id]);expect(await count('meals')).toBe(1)
 })
 it.each(['non_food_candidate','review'])('stops %s with no macro or draft',async route=> {
  vi.mocked(screenMealPhoto).mockResolvedValue({...screening,route} as never)
  const result=await(await submit(upload())).json(); expect(result.outcome).toBe(route==='review'?'review_required':'non_food')
  expect(analyzeMealPhoto).not.toHaveBeenCalled(); await db.exec('RESET ROLE');expect((await db.query('SELECT * FROM activity_drafts WHERE user_id=$1',[owner])).rows).toHaveLength(0)
 })
 it('preserves the claim on lost finish and performs status-only recovery with zero resend',async()=> {
  const service=rpc('service'), original=service.rpc; let fail=true
  service.rpc=async(n,a)=> { const r=await original(n,a); if(a.p_action==='finish'&&fail){fail=false;return {data:null,error:{code:'transport'}}}return r }
  vi.mocked(createServiceRoleClient).mockReturnValue(service as never)
  const request=upload(), id=(await request.clone().formData()).get('requestId') as string
  expect((await submit(request)).status).toBe(503)
  expect((await(await read(id)).json()).outcome).toBe('draft');expect(screenMealPhoto).toHaveBeenCalledTimes(1)
 })
 it('leaves an interrupted provider claim processing and never claims it a second time',async()=> {
  const req=upload(), form=await req.clone().formData()
  const service=rpc('service');await service.rpc('camera_photo_request',{p_hash:deviceHash(token),p_action:'begin',p_id:form.get('requestId'),p_content_hash:form.get('contentHash'),p_captured_at:form.get('timestamp')})
  expect((await(await submit(req)).json()).state).toBe('processing');expect(screenMealPhoto).not.toHaveBeenCalled();expect(analyzeMealPhoto).not.toHaveBeenCalled()
 })
 it('rejects changed original input and duplicate content with a replacement identity',async()=> {
  const req=upload();expect((await submit(req.clone())).status).toBe(200)
  const form=await req.clone().formData(), id=form.get('requestId') as string
  const changed=new Uint8Array(await sharp(Buffer.from(jpeg())).modulate({brightness:.8}).jpeg({quality:95}).toBuffer())
  expect((await submit(upload(id,{},token,changed))).status).toBe(409)
  expect((await submit(upload())).status).toBe(409);expect(screenMealPhoto).toHaveBeenCalledTimes(1)
 })
 it('rejects pre-consent photos, forbidden metadata and hash mismatch before provider calls',async()=> {
  const extras:Record<string,string>[]=[{timestamp:'2020-01-01T00:00:00Z'},{localIdentifier:'private-id'},{filename:'private.jpg'},{contentHash:'a'.repeat(64)}]
  for(const extra of extras) expect((await submit(upload(randomUUID(),extra))).status).toBeGreaterThanOrEqual(400)
  expect(screenMealPhoto).not.toHaveBeenCalled()
 })
 it('blocks malformed, revoked and expired tokens for both submit and status',async()=> {
  expect((await submit(upload(randomUUID(),{},'invalid'))).status).toBe(401)
  await revoke(new Request('https://localhost/api/capture/devices',{method:'DELETE',body:JSON.stringify({expectedUserId:owner,deviceId:device})}))
  expect((await submit(upload())).status).toBe(401);expect((await read(randomUUID())).status).toBe(401)
  await db.exec('RESET ROLE');await db.query("UPDATE camera_photo_devices SET revoked_at=NULL,expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[device])
  expect((await read(randomUUID())).status).toBe(401);expect(screenMealPhoto).not.toHaveBeenCalled()
 })
 it('rechecks revocation between screening and macro dispatch',async()=> {
  vi.mocked(screenMealPhoto).mockImplementation(async()=>{ await db.exec('RESET ROLE');await db.query('UPDATE camera_photo_devices SET revoked_at=clock_timestamp() WHERE id=$1',[device]);return screening as never })
  expect((await submit(upload())).status).toBe(401);expect(analyzeMealPhoto).not.toHaveBeenCalled();expect(await count('meals')).toBe(0)
 })
 it('does not reveal another device request and owners cannot read token hashes or native RPC',async()=> {
  const req=upload(), id=(await req.clone().formData()).get('requestId') as string;await submit(req)
  const old=token;owner=other
  const second=await(await pair(new Request('https://localhost/api/capture/devices',{method:'POST',body:JSON.stringify({expectedUserId:owner,consentPolicy:'camera-cloud-v1'})}))).json()
  expect((await(await read(id,second.token)).json()).state).toBe('not_found')
  const list=await(await devices()).json();expect(JSON.stringify(list)).not.toContain(old);expect(list.devices.map((d:{id:string})=>d.id)).not.toContain(device)
  await photoDraftActor(db,owner)
  await expect(db.query('SELECT token_hash FROM camera_photo_devices')).rejects.toMatchObject({code:'42501'})
  await expect(db.query("SELECT camera_photo_request($1,'check')",[deviceHash(old)])).rejects.toMatchObject({code:'42501'})
 })
 it('an anonymous owner session cannot create a credential; consent and account identity are required',async()=> {
  const request=(body:object)=>new Request('https://localhost/api/capture/devices',{method:'POST',body:JSON.stringify(body)})
  expect((await pair(request({expectedUserId:other,consentPolicy:'camera-cloud-v1'}))).status).toBe(403)
  expect((await pair(request({expectedUserId:owner}))).status).toBe(422)
  vi.mocked(createServerClient).mockResolvedValue({auth:{getUser:async()=>({data:{user:null},error:null})}} as never)
  expect((await pair(request({expectedUserId:owner,consentPolicy:'camera-cloud-v1'}))).status).toBe(401)
 })
 it('pauses before providers and keeps revocation available while paused',async()=> {
  vi.stubEnv('CAMERA_PHOTO_BRIDGE_ENABLED','false');expect((await submit(upload())).status).toBe(409)
  expect((await revoke(new Request('https://localhost/api/capture/devices',{method:'DELETE',body:JSON.stringify({expectedUserId:owner})}))).status).toBe(200)
  expect(screenMealPhoto).not.toHaveBeenCalled()
 })
 it('provider failure is terminal and repeated body does not retry provider work',async()=> {
  vi.mocked(screenMealPhoto).mockRejectedValue(Error('private provider failure'))
  const req=upload();expect((await(await submit(req.clone())).json()).outcome).toBe('failed')
  expect((await(await submit(req.clone())).json()).outcome).toBe('failed');expect(screenMealPhoto).toHaveBeenCalledTimes(1)
 })
 it('concurrent identical submissions reserve only one provider execution',async()=> {
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve})
  vi.mocked(screenMealPhoto).mockImplementation(async()=>{await held;return screening as never})
  const req=upload(), first=submit(req.clone())
  await vi.waitFor(()=>expect(screenMealPhoto).toHaveBeenCalledTimes(1))
  const second=await submit(req.clone());expect((await second.json()).state).toBe('processing')
  release();expect((await first).status).toBe(200);expect(analyzeMealPhoto).toHaveBeenCalledTimes(1)
 })
 it('rejects EXIF, comments and malformed JPEG headers before screening',async()=> {
  for(const marker of [225,254]) {const bytes=jpeg();bytes.set([255,216,255,marker,0,12]);expect(normalizedCameraJPEG(Buffer.from(bytes))).toBe(false);expect((await submit(upload(randomUUID(),{},token,bytes))).status).toBe(422)}
  expect(normalizedCameraJPEG(Buffer.from([255,216,255,255,255,217]))).toBe(false);expect(screenMealPhoto).not.toHaveBeenCalled()
 })
 it('enforces the daily dispatch cap before any next provider call',async()=> {
  await db.exec('RESET ROLE');await db.query("INSERT INTO camera_photo_requests(id,device_id,user_id,content_hash,captured_at) SELECT gen_random_uuid(),$1,$2,lpad(i::text,64,'0'),clock_timestamp() FROM generate_series(1,50) i",[device,owner])
  expect((await submit(upload())).status).toBe(429);expect(screenMealPhoto).not.toHaveBeenCalled()
 })
 it('rejects private segments after entropy data, trailing bytes and scan-only non-images',async()=> {
  const clean=Buffer.from(jpeg())
  const privateSegment=Buffer.from([255,225,0,10,69,120,105,102,0,0,1,2])
  const injected=new Uint8Array(Buffer.concat([clean.subarray(0,-2),privateSegment,clean.subarray(-2)]))
  expect(normalizedCameraJPEG(Buffer.from(injected))).toBe(false)
  expect((await submit(upload(randomUUID(),{},token,injected))).status).toBe(422)
  expect(normalizedCameraJPEG(Buffer.concat([clean,Buffer.from([1,2])]))).toBe(false)
  const scanOnly=Buffer.alloc(2048);scanOnly.set([255,216,255,218,0,2]);scanOnly.set([255,217],2046)
  expect((await submit(upload(randomUUID(),{},token,new Uint8Array(scanOnly)))).status).toBe(422)
  expect(screenMealPhoto).not.toHaveBeenCalled()
 })
 it('accepts actual progressive pixels and refuses oversized decoded dimensions',async()=> {
  const progressive=new Uint8Array(await sharp(Buffer.from(jpeg())).jpeg({progressive:true,quality:95}).toBuffer())
  expect(normalizedCameraJPEG(Buffer.from(progressive))).toBe(true)
  expect((await submit(upload(randomUUID(),{},token,progressive))).status).toBe(200)
  const oversized=new Uint8Array(await sharp({create:{width:1201,height:1201,channels:3,background:'red'}}).jpeg().toBuffer())
  expect((await submit(upload(randomUUID(),{},token,oversized))).status).toBe(422)
  expect(screenMealPhoto).toHaveBeenCalledTimes(1)
 })
 it('does not report revocation success for a missing RPC or missing acknowledgement',async()=> {
  for(const result of [{data:null,error:{code:'PGRST202'}},{data:{},error:null}]) {
   vi.mocked(createServerClient).mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},rpc:async()=>result} as never)
   expect((await revoke(new Request('https://localhost/api/capture/devices',{method:'DELETE',body:JSON.stringify({expectedUserId:owner})}))).status).toBe(503)
  }
 })
})
