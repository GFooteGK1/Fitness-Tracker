import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
vi.mock('@/app/lib/auth/supabase-server',()=>({createServerClient:vi.fn()}))
vi.mock('@/app/lib/agents/classifier',()=>({classifyInput:vi.fn().mockResolvedValue({input_type:'workout_log',domains:['trainer'],confidence:1,context:{}})}))
vi.mock('@/app/lib/agents/router',()=>({determineRouteFromManager:()=>({type:'single',domain:'trainer'}),executeRoute:vi.fn()}))
vi.mock('@/app/lib/agents/context-builder',()=>({buildTrainerContext:vi.fn().mockResolvedValue({}),buildNutritionistContext:vi.fn().mockResolvedValue({}),buildSociusContext:vi.fn().mockResolvedValue({}),invalidatePassiveCache:vi.fn(),normalizeBlockFromDB:(x:unknown)=>x}))
vi.mock('@/app/lib/agents/trainer-agent',async(importOriginal)=>({...await importOriginal<object>(),callTrainerAgent:vi.fn()}))
vi.mock('@/app/lib/agents/socius-background',()=>({triggerSociusBackground:vi.fn()}))
import { POST } from '@/app/api/agent/process/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { executeRoute } from '@/app/lib/agents/router'
import { executeToolCall } from '@/app/lib/agents/tools/executor'
import { callTrainerAgent } from '@/app/lib/agents/trainer-agent'
import { triggerSociusBackground } from '@/app/lib/agents/socius-background'
import type { CaptureOperation } from '@/app/lib/capture/contracts'

const owner='11111111-1111-4111-8111-111111111111',at='2026-09-17T12:00:00.000Z'
const meal={meal_date:'2026-09-17',items:[{food:'Egg',portion:'1',protein:6,carbs:0,fat:5,calories:69}]}
const workout={workout_date:'2026-09-17',blocks:[{block_type:'STRENGTH',movements:[{name:'Squat',reps:5,weight:'100 lb'}]}]}
const request=(content:string)=>new NextRequest('http://localhost/api/agent/process',{method:'POST',body:JSON.stringify({content,input_mode:'text',requestId:'coach-request-1',expectedUserId:owner,submittedAt:at,tz_offset:-300})})
function fixture(failChild=-1){
 let operations:CaptureOperation[]=[]
 const receipt=(index:number)=>({schemaVersion:2,userId:owner,entityKind:operations[index].kind,entityId:`saved-${index}`,state:'saved',revision:1,provenance:operations[index].provenance})
 const rpc=vi.fn(async(name:string,args:any):Promise<any>=>{
  if(name==='begin_logging_request')return {data:{id:'ledger-id',claimed:true,status:'processing'},error:null}
  if(name==='freeze_logging_request_items'){operations=args.p_items;return {data:operations.map((op,i)=>({id:`child-${i}`,kind:op.kind,status:'pending',source_item_id:op.sourceItemId,receipt:null})),error:null}}
  if(name==='commit_logging_request_item'){const index=Number(args.p_item_id.slice(-1));return index===failChild?{data:null,error:{code:'transport'}}:{data:receipt(index),error:null}}
  if(name==='finish_logging_request')return {data:args.p_response,error:null}
  if(name==='save_activity_draft')return {data:{id:'preview-draft',status:'draft',revision:1,normalized:args.p_operation},error:null}
  throw new Error(`Unexpected ${name}`)
 })
 const from=vi.fn(()=>{const q:any={select:()=>q,eq:()=>q,is:()=>q,order:async()=>({data:[],error:null}),insert:async()=>({error:null})};return q})
 const db={rpc,from,auth:{getUser:async()=>({data:{user:{id:owner}},error:null})}}
 vi.mocked(createServerClient).mockResolvedValue(db as never)
 return {db,rpc,get operations(){return operations}}
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED','true')})
afterEach(()=>vi.unstubAllEnvs())
describe('Coach server authorization and frozen bundle',()=>{
 it('denies canonical logging for analysis despite a model tool and success claim',async()=>{
  const {db,rpc}=fixture();vi.mocked(executeRoute).mockImplementation(async()=>{
   expect((await executeToolCall('log_meal',meal,owner,db as never)).success).toBe(false)
   return [{role:'nutritionist',content:'Meal logged.',related_entity_id:'invented',related_entity_type:'meal'}]
  })
  const response=await POST(request('How much protein is in this meal?'));const body=await response.json()
  expect(response.status).toBe(200);expect(body.messages[0].content).toContain('No activity was logged');expect(body.messages[0]).not.toHaveProperty('related_entity_id')
  expect(rpc.mock.calls.some(([name])=>name==='commit_logging_request_item')).toBe(false);expect(triggerSociusBackground).not.toHaveBeenCalled()
 })
 it('freezes all authorized children before the first commit and returns partial receipts',async()=>{
  const {db,rpc,operations}=fixture(1);void operations
  vi.mocked(executeRoute).mockImplementation(async()=>{
   expect((await executeToolCall('log_workout',{...workout,source_item_id:'source:0'},owner,db as never)).success).toBe(true)
   expect((await executeToolCall('log_meal',{...meal,source_item_id:'source:1'},owner,db as never)).success).toBe(true)
   expect(rpc.mock.calls.some(([name])=>name==='commit_logging_request_item')).toBe(false)
   return [{role:'socius',content:'Done'}]
  })
  const response=await POST(request('Log workout: squat 100 lb x5; log meal: one egg'));const body=await response.json()
  expect(response.status).toBe(207);expect(body.receipts).toHaveLength(1);expect(body.receiptBundle.unresolved).toHaveLength(1)
  expect(rpc.mock.calls.filter(([name])=>name==='freeze_logging_request_items')[0][1].p_items).toHaveLength(2)
  expect(rpc.mock.calls.some(([name])=>name==='finish_logging_request')).toBe(false)
 })
 it('keeps two intended identical meals distinct while repeated model calls reuse one source',async()=>{
  const f=fixture();vi.mocked(executeRoute).mockImplementation(async()=>{
   for(const source of ['source:0','source:0','source:1']) await executeToolCall('log_meal',{...meal,source_item_id:source},owner,f.db as never)
   return [{role:'nutritionist',content:'Done'}]
  })
  const response=await POST(request('Log meal: one egg; log meal: one egg'));const body=await response.json()
  expect(response.status).toBe(200);expect(f.operations).toHaveLength(2);expect(body.receipts.map((r:any)=>r.entityId)).toEqual(['saved-0','saved-1'])
 })
 it('does not partially commit an incomplete interpretation of a mixed request',async()=>{
  const f=fixture();vi.mocked(executeRoute).mockImplementation(async()=>{await executeToolCall('log_meal',{...meal,source_item_id:'source:1'},owner,f.db as never);return [{role:'nutritionist',content:'Done'}]})
  const response=await POST(request('Log workout: something; log meal: one egg'));const body=await response.json()
  expect(response.status).toBe(422);expect(body.retrySafe).toBe(true);expect(f.operations).toEqual([])
 })
 it('stores a valid analysis preview only as an unconfirmed-occurrence draft',async()=>{
  const f=fixture();vi.mocked(callTrainerAgent).mockResolvedValue({message:'Workout saved',workout:{blocks:workout.blocks,primary_score:null,rpe:null,tags:[]},confidence:.99} as never)
  vi.mocked(executeRoute).mockImplementation(async(_d,u,c,r,callers)=>callers.trainer(u,c,r,[]))
  const response=await POST(request('Preview this workout: squat 100 lb x5'));const body=await response.json()
  expect(response.status).toBe(200);expect(body.canonicalChanged).toBe(false);expect(body.drafts[0].normalized.provenance.occurrence).toMatchObject({origin:'model_estimated',reviewState:'unreviewed'})
  expect(f.rpc.mock.calls.some(([name])=>name==='commit_logging_request_item')).toBe(false)
 })
})
