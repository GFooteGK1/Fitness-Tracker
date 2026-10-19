import {afterEach,beforeEach,expect,it,vi} from 'vitest'
vi.hoisted(()=>{globalThis.fetch=async()=>{throw new Error('Unexpected qualification network')}})
vi.mock('@/app/lib/auth/supabase-server',()=>({createServerClient:vi.fn()}))
vi.mock('@/app/lib/nutrition/photo-pilot-policy',()=>({nutritionPhotoPilotOwner:(id:string)=>id==='synthetic-owner'}))
vi.mock('@/app/lib/nutrition/photo-pilot-qualification-policy',()=>({nutritionPhotoQualificationEnabled:vi.fn(()=>false)}))
import {createServerClient} from '@/app/lib/auth/supabase-server'
import {nutritionPhotoQualificationEnabled} from '@/app/lib/nutrition/photo-pilot-qualification-policy'
import {qualifyPhotoModels} from '@/app/lib/nutrition/photo-pilot-qualification-server'
import {GET} from '@/app/api/meals/photo-pilot/qualification/route'
let owner:string|null,fetcher:ReturnType<typeof vi.fn>,getUser:ReturnType<typeof vi.fn>
beforeEach(()=>{
  vi.clearAllMocks();owner='synthetic-owner';vi.mocked(nutritionPhotoQualificationEnabled).mockReturnValue(false)
  getUser=vi.fn(async()=>({data:{user:owner?{id:owner}:null},error:null}))
  vi.mocked(createServerClient).mockResolvedValue({auth:{getUser}} as never)
  vi.stubEnv('OPENAI_API_KEY','synthetic-qualification-key')
  fetcher=vi.fn(async(url:string,init:RequestInit)=>{
    expect(init).toMatchObject({method:'GET',redirect:'error',cache:'no-store'})
    expect(['https://api.openai.com/v1/models/gpt-6-luna','https://api.openai.com/v1/models/gpt-5.6-luna']).toContain(url)
    return new Response(JSON.stringify({id:url.split('/').at(-1),object:'model',ignored:'synthetic-private-provider-field'}))
  });vi.stubGlobal('fetch',fetcher)
})
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
const request=(suffix='')=>new Request('https://socius.example/api/meals/photo-pilot/qualification'+suffix)
const active=()=>vi.mocked(nutritionPhotoQualificationEnabled).mockReturnValue(true)
it('ships the actual separate policy literally false despite invented environment overrides',async()=>{
  vi.stubEnv('NUTRITION_PHOTO_QUALIFICATION_ACTIVE','true')
  const policy=await vi.importActual<typeof import('@/app/lib/nutrition/photo-pilot-qualification-policy')>('@/app/lib/nutrition/photo-pilot-qualification-policy')
  expect(policy.NUTRITION_PHOTO_QUALIFICATION_ACTIVE).toBe(false);expect(policy.nutritionPhotoQualificationEnabled()).toBe(false)
  const response=await GET(request());expect(response.status).toBe(409);expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(createServerClient).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled()
})
it.each([null,'foreign-owner'])('denies unverified/foreign owner %s without touching provider',async user=>{
  active();owner=user;expect((await GET(request())).status).toBe(user?403:401);expect(fetcher).not.toHaveBeenCalled()
})
it('rechecks owner before each fixed model and stops a changed session',async()=>{
  active();getUser.mockResolvedValueOnce({data:{user:{id:owner}},error:null}).mockResolvedValue({data:{user:null},error:null})
  expect((await GET(request())).status).toBe(401);expect(fetcher).not.toHaveBeenCalled()
})
it('reports missing configuration separately and makes zero metadata requests',async()=>{
  active();vi.stubEnv('OPENAI_API_KEY','')
  const body=await (await GET(request())).json();expect(body.configured).toBe(false);expect(body.models.map((v:any)=>v.metadata)).toEqual(['not_checked','not_checked']);expect(fetcher).not.toHaveBeenCalled()
})
it('performs exactly two fixed metadata GETs without claiming billing/access qualification',async()=>{
  active();const response=await GET(request()),body=await response.json()
  expect(response.status).toBe(200);expect(body.configured).toBe(true);expect(fetcher).toHaveBeenCalledTimes(2)
  expect(body.models.map((v:any)=>v.metadata)).toEqual(['available','available'])
  expect(body).toMatchObject({paidEndpointBillingQualification:'not_established',pricingQualification:'not_established',dataControlQualification:'not_established'})
  expect(JSON.stringify(body)).not.toContain('synthetic-qualification-key');expect(JSON.stringify(body)).not.toContain('synthetic-private-provider-field')
})
it.each([401,403,429,500])('does not retry metadata status%s or echo error bodies',async status=>{
  active();fetcher.mockImplementation(async()=>new Response('synthetic-private-provider-field',{status}))
  const body=await (await GET(request())).json();expect(fetcher).toHaveBeenCalledTimes(2)
  expect(body.models.map((v:any)=>v.metadata)).toEqual([status<429?'denied':'unavailable',status<429?'denied':'unavailable'])
  expect(JSON.stringify(body)).not.toContain('synthetic-private-provider-field')
})
it.each(['bad-json',JSON.stringify({id:'other-model',object:'model'}),'x'.repeat(4097)])('bounds and validates provider metadata',async text=>{
  active();fetcher.mockImplementation(async()=>new Response(text))
  expect((await (await GET(request())).json()).models.map((v:any)=>v.metadata)).toEqual(['unavailable','unavailable'])
})
it('rejects arbitrary query parameters and has no direct ungated service path',async()=>{
  active();expect((await GET(request('?model=other'))).status).toBe(422);expect(fetcher).not.toHaveBeenCalled()
  vi.mocked(nutritionPhotoQualificationEnabled).mockReturnValue(false)
  await expect(qualifyPhotoModels({auth:{getUser}} as never)).rejects.toMatchObject({status:409});expect(fetcher).not.toHaveBeenCalled()
})
