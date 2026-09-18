import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/app/lib/llm/client', () => ({ complete: vi.fn() }))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { complete } from '@/app/lib/llm/client'
import { POST as quick } from '@/app/api/meals/quick-log/route'
import { POST as catalog } from '@/app/api/foods/log/route'
import { POST as textMeal } from '@/app/api/meals/parse-text/route'
import { POST as workout } from '@/app/api/parse-workout/route'
import { POST as photo } from '@/app/api/meals/upload/route'
import { captureProvenance, type CaptureOperation } from '@/app/lib/capture/contracts'

const owner='11111111-1111-4111-8111-111111111111', sourceId='22222222-2222-4222-8222-222222222222', requestId='33333333-3333-4333-8333-333333333333'
const timestamp='2026-09-17T12:00:00.000Z'
const items=[{food:'Egg',portion:'1 egg',protein:6,carbs:0,fat:5,calories:69}]
const source={id:sourceId,meal_timestamp:timestamp,items,total_protein:6,total_carbs:0,total_fat:5,total_calories:69,needs_review:false,reviewed_at:'2026-09-01T12:00:00.000Z',capture_revision:3,capture_provenance:captureProvenance('meal','model_estimated','corrected')}
const req=(path:string,body:object)=>new NextRequest(`http://localhost${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId,expectedUserId:owner,submittedAt:timestamp,...body})})
function boundary(staleCorrection = false) {
  let operations: CaptureOperation[]=[]; let committed=false
  const rpc=vi.fn(async(name:string,args:any):Promise<any>=>{
    if(name==='begin_logging_request')return {data:{id:'ledger-stable',claimed:true,status:'processing'},error:null}
    if(name==='freeze_logging_request_items'){operations=args.p_items;return {data:operations.map((op,index)=>({id:`child:${index}`,kind:op.kind,status:'pending',source_item_id:op.sourceItemId,receipt:null})),error:null}}
    if(name==='commit_logging_request_item'){committed=true;const op=operations[0];return {data:{schemaVersion:2,userId:owner,requestId:'ledger',requestKey:`test:${requestId}`,operationId:args.p_item_id,entityKind:op.kind,entityId:'persisted',revision:1,eventAt:op.eventAt,capturedAt:timestamp,inputMethod:op.inputMethod,state:'saved',provenance:op.provenance,recommendationId:null},error:null}}
    if(name==='amend_logged_activity' && staleCorrection)return {data:null,error:{code:'40001'}}
    if(name==='finish_logging_request')return {data:args.p_response,error:null}
    throw new Error(`Unexpected RPC ${name}`)
  })
  const insert=vi.fn(()=>{throw new Error('Direct insert bypass')})
  const from=vi.fn((table:string)=>{
    const chain:any={select:()=>chain,eq:()=>chain,upsert:()=>chain,insert,
      single:async()=>({data:table==='food_catalog_entries'?{id:'catalog-entry'}:source,error:null}),
      maybeSingle:async()=>({data:null,error:null})}
    return chain
  })
  const db={rpc,from,auth:{getUser:async()=>({data:{user:{id:owner}},error:null})}}
  vi.mocked(createServerClient).mockResolvedValue(db as never)
  return {rpc,insert,get operations(){return operations},get committed(){return committed}}
}
function model(payload:unknown){vi.mocked(complete).mockResolvedValue({text:JSON.stringify(payload),toolCalls:[],usage:{input:0,output:0},stopReason:'stop',model:'fixture',provider:'anthropic'} as never)}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED','true')})
afterEach(()=>vi.unstubAllEnvs())
describe('new capture adapter persistence boundary',()=>{
  it('copies occurrence without inventing composition origin or fresh review',async()=>{
    const db=boundary();const result=await quick(req('/api/meals/quick-log',{sourceMealId:sourceId,timestamp}));const body=await result.json()
    expect(result.status).toBe(200);expect(body.receipts[0]).toMatchObject({entityId:'persisted',inputMethod:'template'})
    expect(db.operations[0].provenance.fields).toEqual(source.capture_provenance.fields)
    expect(db.operations[0].record.reviewed_at).toBe(source.reviewed_at);expect(db.insert).not.toHaveBeenCalled();expect(complete).not.toHaveBeenCalled()
  })
  it('returns manual-label receipt and scales canonical totals',async()=>{
    const db=boundary();const result=await catalog(req('/api/foods/log',{timestamp,servings:2,food:{name:'Egg',brand:'',source:'manual_label',sourceKey:'manual:egg',servingAmount:1,servingUnit:'egg',servingLabel:'1 egg',nutritionBasis:'per_serving',nutrition:{protein:6,carbs:0,fat:5,calories:69},sourcePayload:{}}}));const body=await result.json()
    expect(result.status).toBe(200);expect(body).toMatchObject({catalogSaved:true,mealSaved:true,mealId:'persisted'});expect(body.receipts[0].provenance.fields.macros).toMatchObject({origin:'athlete_reported',reviewState:'athlete_confirmed'})
    expect(db.operations[0].record).toMatchObject({total_protein:12,total_calories:138});expect(complete).not.toHaveBeenCalled()
  })
  it('keeps model text quantities estimated and ignores model totals',async()=>{
    const db=boundary();model({items,totals:{protein:900,carbs:0,fat:5,calories:9999},confidence:.99})
    const result=await textMeal(req('/api/meals/parse-text',{text:'One egg',timestamp}));const body=await result.json()
    expect(result.status).toBe(200);expect(body.receipts[0].provenance.fields.macros).toMatchObject({origin:'model_estimated',reviewState:'unreviewed'})
    expect(db.operations[0].record.total_calories).toBe(69)
  })
  it('does not trust model PR flags or fabricated parser confidence',async()=>{
    const db=boundary();model({blocks:[{block_type:'STRENGTH',movements:[{name:'Squat',reps:5,weight:'100 lb'}],block_score:{is_pr:true,tonnage_lb:90000}}],rpe:7.5})
    const result=await workout(req('/api/parse-workout',{text:'Squat 100 lb x5',date:'2026-09-17'}));const body=await result.json()
    expect(result.status).toBe(200);expect(body.receipts[0].entityKind).toBe('workout');expect(db.operations[0].record).toMatchObject({parse_confidence:null,rpe:null,reported_rpe:7.5});expect(db.operations[0].blocks[0]).toMatchObject({is_pr:false,tonnage_lb:500})
  })
  it('photo saves only transient analysis with a shared receipt',async()=>{
    const db=boundary();model({items,total_protein:6,total_carbs:0,total_fat:5,total_calories:69,confidence:.85})
    const form=new FormData();form.append('photo',new File([new Uint8Array(2048)],'meal.jpg',{type:'image/jpeg'}));form.append('requestId',requestId);form.append('expectedUserId',owner);form.append('timestamp',timestamp)
    const result=await photo(new NextRequest('http://localhost/api/meals/upload',{method:'POST',body:form}));const body=await result.json()
    expect(result.status).toBe(200);expect(body.receipts[0].inputMethod).toBe('photo');expect(db.operations[0].record.photo_url).toBeNull();expect(JSON.stringify(db.operations)).not.toContain('base64')
  })
  it('does not freeze or commit malformed model quantities and marks no-write retry',async()=>{
    const db=boundary();model({items:[{food:'Egg',portion:'1'}],totals:{protein:6,carbs:0,fat:5,calories:69},confidence:.9})
    const result=await textMeal(req('/api/meals/parse-text',{text:'Egg',timestamp}));expect(result.ok).toBe(false);expect(db.operations).toEqual([]);expect(db.committed).toBe(false)
    expect(db.rpc).toHaveBeenCalledWith('finish_logging_request',expect.objectContaining({p_response:expect.objectContaining({retrySafe:true})}))
  })
  it('retains correction identity after a definitively stale amendment and never creates a new occurrence',async()=>{
    const db=boundary(true);model({items,totals:{protein:6,carbs:0,fat:5,calories:69}})
    const correction={entityId:sourceId,expectedRevision:3,requestId:'correction-original'}
    const result=await textMeal(req('/api/meals/parse-text',{text:'One egg',timestamp,correction}));const body=await result.json()
    expect(result.ok).toBe(false);expect(body).toMatchObject({retrySafe:true,correctionRequired:true,correction});expect(db.operations).toEqual([]);expect(db.committed).toBe(false)
    expect(db.rpc).toHaveBeenCalledWith('amend_logged_activity',expect.objectContaining({p_entity_id:sourceId,p_expected_revision:3}))
  })

})

