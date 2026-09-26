import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/app/lib/auth/supabase-server',()=>({createServerClient:vi.fn()}))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { replayJsonRequest, saveActivity, loggingContext } from '@/app/lib/logging/server'
import { DELETE as cancel, POST as retry, GET as status } from '@/app/api/logging/requests/[id]/route'
import { PUT as correctMeal } from '@/app/api/meals/[id]/route'
import { POST as reviewedFood } from '@/app/api/foods/log/route'
import { executeToolCall } from '@/app/lib/agents/tools/executor'
import { captureProvenance } from '@/app/lib/capture/contracts'

const owner='11111111-1111-4111-8111-111111111111',entity='22222222-2222-4222-8222-222222222222',ledgerId='33333333-3333-4333-8333-333333333333'
const meal={id:entity,user_id:owner,meal_timestamp:'2026-09-17T12:00:00Z',capture_revision:1,capture_provenance:captureProvenance('meal'),items:[{food:'Egg',portion:'1',protein:6,carbs:0,fat:5,calories:69}]}
const receipt={schemaVersion:2,userId:owner,requestId:ledgerId,requestKey:'meal:key-12345678',operationId:'op-one',entityKind:'meal',entityId:entity,revision:2,eventAt:meal.meal_timestamp,capturedAt:meal.meal_timestamp,inputMethod:'text',state:'saved',provenance:meal.capture_provenance,recommendationId:null}
const makeRequest=(path:string,body:unknown,method='POST')=>new Request(`http://localhost${path}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
function dbFixture(){
 const state:any={ledger:{id:ledgerId,user_id:owner,request_key:'meal:key-12345678',status:'processing',entities:[]},items:[],mutation:null,current:meal,schema:true}
 const writes=vi.fn()
 const read=(table:string)=> table==='logging_requests'?state.ledger:table==='logging_request_items'?state.items:table==='activity_mutations'?state.mutation:table==='activity_revisions'?{record:meal,provenance:meal.capture_provenance}:table==='food_catalog_entries'?{id:'catalog-one'}:state.current
 const from=vi.fn((table:string)=>{const q:any={select:()=>q,eq:()=>q,in:async()=>({data:[],error:null}),order:async()=>({data:read(table),error:null}),maybeSingle:async()=>({data:read(table),error:null}),single:async()=>({data:read(table),error:null}),limit:async()=>({data:[],error:state.schema?null:{code:'42703'}}),upsert:(...args:any[])=>{writes(table,...args);return q}};return q})
 const rpc=vi.fn(async(name:string,args:any):Promise<any>=>{
 if(name==='begin_logging_request') return {data:{...state.ledger,claimed:!state.claimed},error:null}
 if(name==='finish_logging_request'){
   if(state.ledger.status==='complete')return {data:null,error:{code:'55000'}}
   state.ledger.status='complete';state.ledger.http_status=args.p_status;state.ledger.response={...args.p_response,retryAllowed:args.p_status>=400&&args.p_response.retrySafe===true&&state.ledger.entities.length===0};return {data:state.ledger.response,error:null}
 }
 if(name==='cancel_logging_request_item'){
   const item=state.items.find((x:any)=>x.id===args.p_item_id);if(item.status==='committed')return {data:null,error:{code:'55000'}}
   item.status='canceled';item.cancellation??={schemaVersion:1,operationId:item.id,state:'canceled',noWriteConfirmed:true};return {data:item.cancellation,error:null}
 }
 if(name==='amend_logged_activity')return {data:receipt,error:null}
 throw new Error(`Unexpected RPC ${name}`)
 })
 const db={from,rpc,auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:owner}},error:null})}}
 vi.mocked(createServerClient).mockResolvedValue(db as never)
 return {db,state,writes}
}
beforeEach(()=>{vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED','true');vi.clearAllMocks()})
afterEach(()=>vi.unstubAllEnvs())
describe('capture API recovery boundaries',()=>{
 it.each(['GET','POST','replay'])('returns confirmed-unsaved legacy workout proof through %s without rerunning a provider',async method=>{
 const {db,state}=dbFixture();state.claimed=true;Object.assign(state.ledger,{request_key:'workout-text:key-12345678',status:'complete',http_status:500,response:{error:'Failed to parse workout',retryAllowed:false}})
 const baseRpc=db.rpc.getMockImplementation()!;db.rpc.mockImplementation(async(name,args)=>name==='confirm_failed_workout_request'?{data:{retryAllowed:true},error:null}:baseRpc(name,args))
 const process=vi.fn();const path='/api/logging/requests/key?expectedUserId='+owner;const params={params:Promise.resolve({id:state.ledger.request_key})}
 const response=method==='replay'?await replayJsonRequest(makeRequest('/api/parse-workout',{requestId:'key-12345678',expectedUserId:owner}),'workout-text',process):method==='POST'?await retry(makeRequest(path,{}),params):await status(new Request('http://localhost'+path),params)
 expect(response.status).toBe(method==='replay'?500:200);expect(await response.json()).toMatchObject({state:'draft',retryAllowed:true,savedEntities:[]});expect(process).not.toHaveBeenCalled();expect(state.ledger.response.retryAllowed).toBe(false)
 expect(db.rpc.mock.calls.filter(call=>call[0]==='finish_logging_request')).toHaveLength(0)
 })
 it('lost amendment response remains uncertain then recovers without rerunning the process',async()=>{
 const {db,state}=dbFixture();const baseRpc=db.rpc.getMockImplementation()!;db.rpc.mockImplementation(async(name,args)=>{
 if(name==='amend_logged_activity'){state.mutation={receipt};state.claimed=true;throw new TypeError('response lost after commit')}
 return baseRpc(name,args)
 })
 const body={requestId:'key-12345678',expectedUserId:owner,correction:{entityId:entity,expectedRevision:1,requestId:'correction-key'}}
 const process=vi.fn(async()=>{await saveActivity(db as never,'meal',{...meal,items:[{...meal.items[0],protein:8}]});return new Response('{}')})
 const first=await replayJsonRequest(makeRequest('/api/meals/parse-text',body),'meal',process);expect(first.status).toBe(503);expect(await first.json()).not.toHaveProperty('retrySafe',true);expect(state.ledger.status).toBe('processing')
 const recovered=await replayJsonRequest(makeRequest('/api/meals/parse-text',body),'meal',process);expect(recovered.status).toBe(200);expect((await recovered.json()).receipts).toEqual([receipt]);expect(process).toHaveBeenCalledTimes(1)
 })
 it('routes installed-schema meal corrections through audited RPC while capture writer flag is off',async()=>{
 vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED','false');const {db}=dbFixture();const response=await correctMeal(makeRequest(`/api/meals/${entity}`,{expectedUserId:owner,expectedRevision:1,requestId:'correct-meal-1',items:[{...meal.items[0],protein:8}]},'PUT') as never,{params:Promise.resolve({id:entity})});expect(response.status).toBe(200);expect(db.rpc).toHaveBeenCalledWith('amend_logged_activity',expect.objectContaining({p_entity_id:entity,p_expected_revision:1}));expect(db.from.mock.results.every(x=>!x.value.update)).toBe(true)
 })
 it('reports saved catalog separately when its meal commit response is lost',async()=>{
 const {db,state,writes}=dbFixture();state.current=null;const baseRpc=db.rpc.getMockImplementation()!;db.rpc.mockImplementation(async(name,args)=>{
 if(name==='freeze_logging_request_items')return {data:[{id:'pending-meal',source_item_id:'activity:0',kind:'meal',status:'pending',receipt:null}],error:null}
 if(name==='commit_logging_request_item')throw new TypeError('lost meal response')
 return baseRpc(name,args)
 })
 const macros={protein:6,carbs:0,fat:5,calories:69};const input={requestId:'44444444-4444-4444-8444-444444444444',expectedUserId:owner,timestamp:meal.meal_timestamp,servings:1,food:{name:'Egg',brand:'',source:'manual_label',sourceKey:'label:egg',servingAmount:1,servingUnit:'item',servingLabel:'1 egg',nutritionBasis:'per_serving',nutrition:macros,sourceNutrition:macros,sourcePayload:{}}}
 const response=await reviewedFood(makeRequest('/api/foods/log',input) as never);const body=await response.json();expect(response.status).toBe(503);expect(writes).toHaveBeenCalledTimes(1);expect(body).toMatchObject({catalogSaved:true,catalogEntryId:'catalog-one',mealSaved:false,state:'save_unconfirmed'});expect(state.ledger.status).toBe('processing')
 })
 it('explicit cancellation enables edited new identity only after every pending child is terminal and replays proof',async()=>{
 const {state,db}=dbFixture();state.items=[{id:'op-one',source_item_id:'source:0',kind:'meal',status:'pending',receipt:null,payload:{}}];const path='/api/logging/requests/meal%3Akey-12345678?expectedUserId='+owner,params={params:Promise.resolve({id:state.ledger.request_key})}
 const first=await cancel(makeRequest(path,{operationId:'op-one'},'DELETE'),params);expect(first.status).toBe(200);const result=await first.json();expect(result.retryAllowed).toBe(true);expect(result.state).toBe('draft');expect(result.canceledItems).toHaveLength(1)
 const again=await cancel(makeRequest(path,{operationId:'op-one'},'DELETE'),params);expect(again.status).toBe(200);expect((await again.json()).canceledItems).toEqual(result.canceledItems);expect(db.rpc.mock.calls.filter(x=>x[0]==='finish_logging_request')).toHaveLength(1)
 })
 it('never cancels a committed child or retries it as a new save',async()=>{
 const {state,db}=dbFixture();state.items=[{id:'op-one',source_item_id:'source:0',kind:'meal',status:'committed',receipt,payload:{}}];const params={params:Promise.resolve({id:state.ledger.request_key})},path='/api/logging/requests/key?expectedUserId='+owner
 expect((await cancel(makeRequest(path,{operationId:'op-one'},'DELETE'),params)).status).toBe(409);const recovered=await retry(makeRequest(path,{}),params);expect(recovered.status).toBe(200);expect((await recovered.json()).receipts).toEqual([receipt]);expect(db.rpc.mock.calls.some(x=>x[0]==='commit_logging_request_item')).toBe(false)
 })
 it('rejects switched-account recovery before any read or mutation',async()=>{
 const {db,state}=dbFixture();const response=await status(new Request('http://localhost/api/logging/requests/key?expectedUserId=other'),{params:Promise.resolve({id:state.ledger.request_key})});expect(response.status).toBe(403);expect(db.from).not.toHaveBeenCalled();expect(db.rpc).not.toHaveBeenCalled()
 })
 it.each(['draft','discarded'])('recovers lost %s mutation outcome without provider or canonical rerun',async(draftStatus)=>{
 const {state}=dbFixture();state.claimed=true;state.mutation={receipt:{id:'draft-one',status:draftStatus,revision:1,normalized:{record:meal}}};const process=vi.fn(async()=>{throw new Error('Must not rerun a provider')});const response=await replayJsonRequest(makeRequest('/api/capture/drafts',{requestId:'key-12345678',expectedUserId:owner}),'draft',process);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({canonicalChanged:false,draft:{id:'draft-one',status:draftStatus}});expect(process).not.toHaveBeenCalled()
 })
 it('preserves saved child receipts when pending recovery is paused by the writer flag',async()=>{
 vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED','false');const {state,db}=dbFixture();state.claimed=true;state.items=[{id:'op-one',source_item_id:'source:0',status:'committed',kind:'meal',receipt,payload:{}},{id:'op-two',source_item_id:'source:1',status:'pending',kind:'meal',receipt:null,payload:{}}];const process=vi.fn();const response=await replayJsonRequest(makeRequest('/api/meals/parse-text',{requestId:'key-12345678',expectedUserId:owner}),'meal',process);expect((await response.json()).receipts).toEqual([receipt]);expect(db.rpc.mock.calls.some(x=>x[0]==='finish_logging_request')).toBe(false);expect(process).not.toHaveBeenCalled()
 })
 it('keeps explicit Coach correction on the audited schema after the writer flag is disabled',async()=>{
 vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED','false');const {db}=dbFixture();const result=await loggingContext.run({id:ledgerId,userId:owner,correction:{entityId:entity,expectedRevision:1,requestId:'coach-correction'},correctionKind:'meal',correctionAuthorized:true},()=>executeToolCall('update_meal',{meal_id:entity,items:[{...meal.items[0],protein:8}]},owner,db as never));expect(result.success).toBe(true);expect(db.rpc).toHaveBeenCalledWith('amend_logged_activity',expect.objectContaining({p_entity_id:entity}))
 })

})
