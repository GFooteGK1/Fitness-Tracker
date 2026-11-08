import { beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PostgrestClient } from '@supabase/postgrest-js'
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { GET } from '@/app/api/meals/daily/route'
import { POST as saveTarget } from '@/app/api/targets/route'
import { mcpActivityFixture } from '../database/mcp-activity-fixture'
import { calculateAdherenceStatus } from '@/app/lib/adherence-calculator'

const owner=randomUUID(), other=randomUUID(), absent=randomUUID()
let sql: Awaited<ReturnType<typeof mcpActivityFixture>>, subject=owner, mode='healthy', setup=true, writes=0, tolerance=0, mealMode='healthy', authError=false
let targetPatch: Record<string, unknown> | null = null
const traces:any[]=[]
const expectedError={error:'Unable to load your daily targets. Please try again.'}
const transport:typeof fetch=async(input,init)=>{
 const u=new URL(String(input)), table=u.pathname.split('/').pop()!, method=init?.method??'GET'
 traces.push({table,method,owner:u.searchParams.get('user_id'),limit:u.searchParams.get('limit'),accept:new Headers(init?.headers).get('accept'),bounds:u.searchParams.getAll('meal_timestamp')})
 expect(['meals','daily_targets']).toContain(table)
 if(method==='POST'){
  if(!setup)throw Error('Writes prohibited after fixture setup')
  const row=JSON.parse(String(init?.body));expect(row.user_id).toBe(owner);writes++
  const r=await sql.query<any>('INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories,tolerance_pct) VALUES($1,$2,$3,$4,$5,$6) RETURNING to_jsonb(daily_targets) value',[owner,row.target_protein,row.target_carbs,row.target_fat,row.target_calories,row.tolerance_pct])
  return Response.json(r.rows[0].value,{status:201})
 }
 expect(method).toBe('GET');expect(u.searchParams.get('user_id')).toBe('eq.'+subject)
 if(table==='meals'){
  if(mealMode==='error')return Response.json({code:'PGRST000',message:'Synthetic meal fault'},{status:503})
  if(mealMode==='null')return Response.json(null)
  const b=u.searchParams.getAll('meal_timestamp'),start=b.find(x=>x.startsWith('gte.'))?.slice(4),end=b.find(x=>x.startsWith('lt.'))?.slice(3)
  const r=await sql.query<any>('SELECT to_jsonb(m) value FROM meals m WHERE user_id=$1 AND meal_timestamp >= $2 AND meal_timestamp < $3 ORDER BY meal_timestamp',[subject,start,end])
  return Response.json(r.rows.map(x=>x.value))
 }
 const rows=(await sql.query<any>('SELECT to_jsonb(t) value FROM daily_targets t WHERE user_id=$1 LIMIT 2',[subject])).rows.map(x=>({...x.value,tolerance_pct:tolerance}))
 if(mode==='fetch')throw TypeError('Synthetic private transport fault')
 if(mode==='service')return Response.json({code:'PGRST000',message:'Synthetic private provider fault'},{status:503})
 if(mode==='ambiguous')return Response.json({code:'PGRST116',details:null,message:'Synthetic singular response failure'},{status:406})
 if(mode==='duplicate')return Response.json({code:'PGRST116',details:'The result contains 2 rows',message:'Synthetic singular response failure'},{status:406})
 if(mode==='null')return Response.json(null)
 if(mode==='invalid-json')return new Response('{')
 if(mode==='array')return Response.json(rows)
 if(mode==='two-rows')return Response.json([rows[0],rows[0]])
 if(mode==='object')return Response.json(rows[0]??{})
 const row=rows[0]
 if(row){
  if(targetPatch)Object.assign(row,targetPatch)
  const patches:Record<string,unknown>={'wrong-owner':other,'invalid-number':'not-a-number','null-number':null,'missing-number':undefined,'zero-number':0,'negative-number':-1,'boolean-number':true,'partial-number':'150.25junk','null-tolerance':null,'missing-tolerance':undefined,'negative-tolerance':-0.01,'large-tolerance':100.01}
  if(mode==='wrong-owner')row.user_id=patches[mode]
  else if(mode.endsWith('-number'))row.target_protein=patches[mode]
  else if(mode.endsWith('-tolerance'))row.tolerance_pct=patches[mode]
 }
 if(new Headers(init?.headers).get('accept')==='application/vnd.pgrst.object+json'){
  if(rows.length!==1)return Response.json({code:'PGRST116',details:'The result contains '+rows.length+' rows',message:'Synthetic singular response failure'},{status:406})
  return Response.json(row)
 }
 return Response.json(rows)
}
const sdk=new PostgrestClient('https://synthetic.invalid/rest/v1',{fetch:transport})
const db={auth:{getUser:async()=>({data:{user:authError?null:{id:subject}},error:authError?{message:'Denied'}:null})},from:sdk.from.bind(sdk)}
const call=(availability?:string,date='2026-11-02')=>GET(new Request('http://local.invalid/api/meals/daily?date='+date+'&tzOffset=360'+(availability===undefined?'':'&availability='+encodeURIComponent(availability))))
const snapshot=async()=>({targets:(await sql.query('SELECT to_jsonb(t) value FROM daily_targets t ORDER BY user_id')).rows,meals:(await sql.query('SELECT to_jsonb(m) value FROM meals m ORDER BY id')).rows})
let before:any
beforeAll(async()=>{
 vi.stubGlobal('fetch',()=>{throw Error('Live network forbidden')})
 sql=await mcpActivityFixture();await sql.query('INSERT INTO auth.users(id) VALUES($1),($2),($3)',[owner,other,absent]);vi.mocked(createServerClient).mockResolvedValue(db as any)
 const saved=await saveTarget(new Request('http://local.invalid/api/targets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({targetProtein:150.25,targetCarbs:200.5,targetFat:60.75,tolerancePct:0})}) as any)
 expect(saved.status).toBe(201)
 for(const [id,stamp,p,c,f,k] of [[owner,'2026-11-03T05:30:00Z',25.25,10.5,2.25,163.25],[owner,'2026-11-03T06:00:00Z',99,0,0,396],[owner,'2026-11-04T18:00:00Z',0,0,0,0],[other,'2026-11-03T05:30:00Z',77,0,0,308]] as const)
 await sql.query('INSERT INTO meals(user_id,meal_timestamp,items,total_protein,total_carbs,total_fat,total_calories) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,stamp,JSON.stringify([{food:'Synthetic complete meal',portion:'1 serving',protein:p,carbs:c,fat:f,calories:k}]),p,c,f,k])
 setup=false;before=await snapshot()
},30000)
beforeEach(()=>{subject=owner;mode='healthy';mealMode='healthy';authError=false;tolerance=0;targetPatch=null;traces.length=0;vi.mocked(createServerClient).mockResolvedValue(db as any);vi.spyOn(console,'warn').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation(()=>{})})
afterEach(async()=>{expect(writes).toBe(1);expect(await snapshot()).toEqual(before);vi.restoreAllMocks()})
afterAll(async()=>{await sql?.close();vi.unstubAllGlobals()})
for(const availability of [undefined,'unknown','EXPLICIT']){
 it('legacy healthy '+availability,async()=>{const r=await call(availability),b=await r.json();expect(r.status).toBe(200);expect(b.adherence).not.toBeNull();expect(b).not.toHaveProperty('adherenceAvailability');expect(b.dailyTotals).toEqual({protein:25.25,carbs:10.5,fat:2.25,calories:163.25});expect(b.meals).toHaveLength(1);expect(b.meals[0].userId).toBe(owner)})
 it('legacy confirmed empty '+availability,async()=>{subject=absent;const r=await call(availability),b=await r.json();expect(r.status).toBe(200);expect(b.adherence).toMatchObject({overallScore:0,withinTolerance:false});expect(b.adherence).not.toBeNull()})
 it('legacy unavailable errors '+availability,async()=>{mode='service';const r=await call(availability),b=await r.json();expect(r.status).toBe(500);expect(b).toEqual(expectedError)})
}
for(const fault of ['service','fetch','ambiguous','duplicate','two-rows','object','null','invalid-json','wrong-owner','invalid-number','null-number','missing-number','zero-number','negative-number','boolean-number','partial-number','null-tolerance','missing-tolerance','negative-tolerance','large-tolerance']){
 it('explicit classifies '+fault,async()=>{mode=fault;const r=await call('explicit'),b=await r.json();expect(r.status).toBe(200);expect(b.dailyTotals).toEqual({protein:25.25,carbs:10.5,fat:2.25,calories:163.25});expect(b).toMatchObject({adherenceAvailability:'unavailable',adherence:null})})
}
it('explicit confirmed absence only on successful empty query',async()=>{subject=absent;const r=await call('explicit'),b=await r.json();expect(r.status).toBe(200);expect(b).toMatchObject({adherenceAvailability:'not_configured',adherence:null,meals:[]})})
for(const value of [0,12.34,100])it('explicit healthy fractional target/tolerance '+value,async()=>{tolerance=value;const r=await call('explicit'),b=await r.json();expect(r.status).toBe(200);expect(b.adherence).toEqual(calculateAdherenceStatus(b.dailyTotals,{userId:owner,targetProtein:150.25,targetCarbs:200.5,targetFat:60.75,targetCalories:1949.8,tolerancePct:value,updatedAt:new Date()}));expect(b.adherenceAvailability).toBe('available')})
it('true zero intake is calculated zero at zero tolerance',async()=>{const r=await call(undefined,'2026-11-04'),b=await r.json();expect(b.meals).toHaveLength(1);expect(b.dailyTotals).toEqual({protein:0,carbs:0,fat:0,calories:0});expect(b.adherence).toMatchObject({overallScore:0,withinTolerance:false})})
it('empty meals preserve current math at tolerance100',async()=>{tolerance=100;const r=await call(undefined,'2026-11-05'),b=await r.json();expect(b.meals).toEqual([]);expect(b.adherence).toMatchObject({overallScore:100,withinTolerance:true})})
it('local date/owner query and zero writes',async()=>{await call();expect(traces.map(t=>t.table)).toEqual(['meals','daily_targets']);expect(traces[0].bounds).toEqual(['gte.2026-11-02T06:00:00.000Z','lt.2026-11-03T05:59:59.999Z']);expect(traces.every(t=>t.owner==='eq.'+owner&&t.method==='GET')).toBe(true)})
it('one bounded array read limit2',async()=>{await call('explicit');expect(traces[1]).toMatchObject({limit:'2'});expect(traces[1].accept).not.toBe('application/vnd.pgrst.object+json')})
it('data accompanied by error is unavailable, never used',async()=>{const row={user_id:owner,target_protein:150,target_carbs:200,target_fat:60,target_calories:1940,tolerance_pct:0};const result={data:row,error:{code:'PGRST116',message:'Synthetic error with data'}};vi.mocked(createServerClient).mockResolvedValue({...db,from:(table:string)=>table==='meals'?sdk.from(table):{select:()=>({eq:()=>({single:async()=>result,limit:async()=>({...result,data:[row]})})})}} as any);const r=await call('explicit'),b=await r.json();expect(r.status).toBe(200);expect(b).toMatchObject({adherenceAvailability:'unavailable',adherence:null})})
it.each(['error','null'])('meal failure %s returns no fabricated facts',async failure=>{mealMode=failure;const r=await call('explicit'),b=await r.json();expect(r.status).toBe(500);expect(b).not.toHaveProperty('dailyTotals');expect(b).not.toHaveProperty('meals')})
it('auth failure reads no meals/targets',async()=>{authError=true;const r=await call('explicit');expect(r.status).toBe(401);expect(traces).toEqual([])})
it('successful explicit facts are private no-store',async()=>{const r=await call('explicit');expect(r.headers.get('cache-control')).toBe('private, no-store')})

it.each(['service','fetch','ambiguous','duplicate','two-rows','object','null','invalid-json','wrong-owner','invalid-number','null-number','missing-number','zero-number','negative-number','boolean-number','partial-number','null-tolerance','missing-tolerance','negative-tolerance','large-tolerance'])('legacy %s failure is fixed non-nullable error',async fault=>{
 mode=fault;const r=await call(),body=await r.json();expect(r.status).toBe(500);expect(body).toEqual(expectedError);expect(r.headers.get('cache-control')).toBe('private, no-store')
})
it.each(['target_protein','target_carbs','target_fat','target_calories','tolerance_pct'])('does not default missing/null %s',async field=>{
 for(const value of [null,undefined]){targetPatch={[field]:value};const r=await call('explicit');expect(r.status).toBe(200);expect(await r.json()).toMatchObject({adherenceAvailability:'unavailable',adherence:null})}
})
it.each(['',' ','NaN','Infinity','0x10',[],{},true])('rejects non-decimal numeric representation %j',async value=>{
 targetPatch={target_protein:value};const r=await call('explicit');expect(await r.json()).toMatchObject({adherenceAvailability:'unavailable',adherence:null})
})
it('preserves valid full decimal strings and explicit zero tolerance',async()=>{
 targetPatch={target_protein:'150.25',target_carbs:'200.50',target_fat:'60.75',target_calories:'1949.80',tolerance_pct:'0'}
 const legacy=await(await call()).json(),explicit=await(await call('explicit')).json()
 const {adherenceAvailability,...facts}=explicit;expect(adherenceAvailability).toBe('available');expect(facts).toEqual(legacy)
})
it('preserves exact healthy legacy meal/provenance/math payload',async()=>{
 const legacy=await(await call()).json(),explicit=await(await call('explicit')).json()
 const {adherenceAvailability,...facts}=explicit;expect(adherenceAvailability).toBe('available');expect(facts).toEqual(legacy)
 expect(Object.keys(legacy).sort()).toEqual(['adherence','dailyTotals','meals'])
 expect(legacy.meals[0].captureRevision).toBeDefined();expect(legacy.meals[0].captureProvenance).toBeDefined()
})
it('preserves exact confirmed-empty legacy shape without nullable adherence',async()=>{
 subject=absent;const legacy=await(await call()).json(),explicit=await(await call('explicit')).json()
 expect(explicit).toEqual({...legacy,adherenceAvailability:'not_configured',adherence:null})
 expect(legacy.adherence).toEqual({proteinAdherence:0,carbsAdherence:0,fatAdherence:0,caloriesAdherence:0,overallScore:0,withinTolerance:false})
})
it.each(['availability=explicit&availability=explicit','availability=unknown&availability=explicit','availability=%20explicit','availability=true'])('keeps non-exact negotiation legacy: %s',async query=>{
 const url='http://local.invalid/api/meals/daily?date=2026-11-02&tzOffset=360&'+query
 const healthy=await GET(new Request(url)),body=await healthy.json();expect(healthy.status).toBe(200);expect(body.adherence).not.toBeNull();expect(body).not.toHaveProperty('adherenceAvailability')
 mode='service';const failed=await GET(new Request(url));expect(failed.status).toBe(500);expect(await failed.json()).toEqual(expectedError)
})
it.each([undefined,'explicit'])('contains a thrown target query in the %s contract',async availability=>{
 vi.mocked(createServerClient).mockResolvedValue({...db,from:(table:string)=>table==='meals'?sdk.from(table):{select:()=>({eq:()=>({limit:async()=>{throw new Error('Private query exception')}})})}} as any)
 const r=await call(availability),body=await r.json();expect(r.status).toBe(availability==='explicit'?200:500)
 if(availability==='explicit')expect(body).toMatchObject({adherenceAvailability:'unavailable',adherence:null,dailyTotals:{protein:25.25,carbs:10.5,fat:2.25,calories:163.25}})
 else expect(body).toEqual(expectedError)
})
it('rejects auth data accompanied by an error before table access',async()=>{
 const from=vi.fn();vi.mocked(createServerClient).mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:owner}},error:{message:'Denied'}})},from} as any)
 const r=await call('explicit');expect(r.status).toBe(401);expect(from).not.toHaveBeenCalled();expect(r.headers.get('cache-control')).toBe('private, no-store')
})
