import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import type {PGlite} from '@electric-sql/pglite'
import {nutritionPilotDatabase,nutritionPilotSettlementClient,pilotTestOwner} from '../helpers/nutrition-pilot-database'
import {photoDraftActor} from '../helpers/photo-draft-database'
import {photoUsageEvidence,photoUsageMicroUsd} from '@/app/lib/nutrition/photo-pilot-usage'
const initial='2026-10-19T12:00:00Z'
let db:PGlite,server:ReturnType<typeof nutritionPilotSettlementClient>
const raw=(stage='screen',changes:object={})=>({receiptId:randomUUID(),inputTokens:stage==='screen'?3000:5000,outputTokens:stage==='screen'?0:1024,totalTokens:stage==='screen'?3000:6024,serviceTier:stage==='screen'?'fixed-decisions':'default',...changes})
const evidence=(stage:'screen'|'estimate'='screen')=>photoUsageEvidence(stage,stage==='screen'?'gpt-6-luna':'gpt-5.6-luna',raw(stage))!
const rpc=async(id:string,action:string,payload:object={})=>(await db.query<{v:any}>('SELECT nutrition_photo_pilot($1,$2,$3) v',[id,action,payload])).rows[0].v
async function ready(stage:'screen'|'estimate'='screen') {
  const id=randomUUID(),hash=id.replaceAll('-','').repeat(2)
  await rpc(id,'reserve',{sourceHash:hash,normalizedHash:hash,capturedAt:initial,context:'',consent:'selected-photo-openai-autolog-v1',normalization:'decoded-jpeg-v1'})
  await rpc(id,'photo_stored');await rpc(id,'screen_start')
  await rpc(id,'screen_result',{screening:{model:'gpt-6-luna',policy:'decisions-food-v2',route:'food_candidate'}})
  if(stage==='estimate'){
    await rpc(id,'estimate_start');await db.exec('RESET ROLE')
    // Isolate accounting; full canonical capture is tested in the capacity suite.
    await db.query("UPDATE nutrition_photo_captures SET original_estimate='{}' WHERE id=$1",[id]);await photoDraftActor(db,pilotTestOwner)
  }
  return id
}
const settle=(id:string,stage:'screen'|'estimate'='screen',value:object=evidence(stage))=>server.rpc('settle_nutrition_photo_usage',{p_capture_id:id,p_owner:pilotTestOwner,p_stage:stage,p_evidence:value})
const rows=async()=> (await db.query<any>('SELECT * FROM nutrition_photo_exposure ORDER BY capture_id,stage')).rows
beforeAll(async()=>{db=await nutritionPilotDatabase(true,initial);await db.query('INSERT INTO auth.users VALUES($1)',[pilotTestOwner]);server=nutritionPilotSettlementClient(db)},30000)
beforeEach(async()=>{await db.exec('RESET ROLE; TRUNCATE nutrition_photo_exposure,nutrition_photo_captures');await db.query('UPDATE pilot_test_clock SET at=$1',[initial]);await db.exec('UPDATE nutrition_photo_budget SET halted=false');await photoDraftActor(db,pilotTestOwner)})
afterAll(async()=>{await db?.close()})

describe('strict provider usage, never legacy zero defaults',()=>{
  it('rounds the independently specified premium ceilings upward',()=>{
    expect(photoUsageMicroUsd('screen',evidence())).toBe(660)
    expect(photoUsageMicroUsd('estimate',evidence('estimate'))).toBe(4778)
    expect(photoUsageMicroUsd('screen',photoUsageEvidence('screen','gpt-6-luna',raw('screen',{inputTokens:1,totalTokens:1}))!)).toBe(1)
    expect(photoUsageMicroUsd('estimate',photoUsageEvidence('estimate','gpt-5.6-luna',raw('estimate',{inputTokens:1050000,totalTokens:1051024}))!)).toBe(579528)
  })
  it.each([undefined,{},raw('screen',{inputTokens:0,totalTokens:0}),raw('screen',{inputTokens:'3000'}),raw('screen',{inputTokens:-1}),raw('screen',{inputTokens:1.5}),raw('screen',{inputTokens:1050001}),raw('screen',{inputTokens:Number.MAX_SAFE_INTEGER+1}),raw('screen',{totalTokens:3001}),raw('screen',{receiptId:''}),raw('screen',{outputTokens:1,totalTokens:3001})])
    ('rejects incomplete/inconsistent screening usage: %j',v=>{expect(photoUsageEvidence('screen','gpt-6-luna',v)).toBeUndefined()})
  it.each([raw('estimate',{outputTokens:0,totalTokens:5000}),raw('estimate',{outputTokens:1025,totalTokens:6025}),raw('estimate',{serviceTier:'fast'}),raw('estimate',{inputTokens:NaN})])
    ('rejects unqualified estimation usage: %j',v=>{expect(photoUsageEvidence('estimate','gpt-5.6-luna',v)).toBeUndefined()})
  it('rejects effective-model drift',()=>{expect(photoUsageEvidence('estimate','other-model',raw('estimate'))).toBeUndefined()})
})

describe('service-only durable settlement and financial time',()=>{
  it('owner result JSON cannot release money or grant rolling-age eligibility',async()=>{
    const id=await ready();await rpc(id,'uncertain')
    expect((await rows())[0]).toMatchObject({reserved_micro_usd:250000,confirmed_micro_usd:null,settled_at:null})
    await db.exec("RESET ROLE; UPDATE pilot_test_clock SET at=at+interval '25 hours'");await photoDraftActor(db,pilotTestOwner)
    for(let i=0;i<3;i++)await ready()
    await expect(ready()).rejects.toMatchObject({code:'54000'})
  })
  it('preserves original reserve and one immutable, idempotent confirmed settlement',async()=>{
    const id=await ready(),proof=evidence(),first=await settle(id,'screen',proof)
    expect(first.error).toBeNull();expect(first.data).toMatchObject({state:'settled',captureId:id,confirmedMicroUsd:660,reservedMicroUsd:250000})
    expect((await settle(id,'screen',proof)).data).toEqual(first.data)
    expect((await settle(id,'screen',{...proof,inputTokens:3001,totalTokens:3001})).error?.code).toBe('22023')
    expect((await rows())[0]).toMatchObject({reserved_micro_usd:250000,confirmed_micro_usd:660,usage_evidence:proof})
  })
  it('refuses reuse of one provider receipt for another reservation',async()=>{
    const a=await ready(),b=await ready(),proof=evidence();expect((await settle(a,'screen',proof)).error).toBeNull()
    expect((await settle(b,'screen',proof)).error?.code).toBe('23505')
    expect((await rows()).find(v=>v.capture_id===b).confirmed_micro_usd).toBeNull()
  })
  it('keeps a confirmed settlement through a lost acknowledgement and exact readback',async()=>{
    const id=await ready(),proof=evidence();await settle(id,'screen',proof) // response deliberately discarded
    expect((await settle(id,'screen',proof)).data).toMatchObject({confirmedMicroUsd:660})
    expect(await rows()).toHaveLength(1)
  })
  it('settles estimation only with explicit complete usage',async()=>{
    const id=await ready('estimate');expect((await settle(id,'estimate')).data).toMatchObject({confirmedMicroUsd:4778})
    expect((await rows()).find(v=>v.stage==='screen').settled_at).toBeNull()
  })
  it.each([{inputTokens:'3000'},{inputTokens:1.5},{inputTokens:-1},{inputTokens:1050001},{outputTokens:1,totalTokens:3001},{ratePolicy:'unqualified'},{model:'other'},{totalTokens:0}])
    ('retains full reserve on malformed trusted-RPC evidence %j',async patch=>{
      const id=await ready();expect((await settle(id,'screen',{...evidence(),...patch})).error).toBeTruthy()
      expect((await rows())[0]).toMatchObject({confirmed_micro_usd:null,settled_at:null})
    })
  it('allows historical settlement after expiry but never authorizes a new paid call',async()=>{
    const id=await ready();await db.exec("RESET ROLE; UPDATE pilot_test_clock SET at=at+interval '31 days'");await photoDraftActor(db,pilotTestOwner)
    expect((await settle(id)).error).toBeNull();await expect(ready()).rejects.toMatchObject({code:'54000'})
  })
  it.each(['authenticated','anon'])('denies %s execution even with forged role payload/claim',async role=>{
    const id=await ready();await db.exec('RESET ROLE; SET ROLE '+role)
    await db.query("SELECT set_config('request.jwt.claim.role','service_role',false)")
    await expect(db.query('SELECT settle_nutrition_photo_usage($1,$2,$3,$4)',[id,pilotTestOwner,'screen',evidence()])).rejects.toMatchObject({code:'42501'})
  })
  it.each(['UPDATE nutrition_photo_exposure SET confirmed_micro_usd=0','UPDATE nutrition_photo_exposure SET settled_at=now()','DELETE FROM nutrition_photo_exposure','TRUNCATE nutrition_photo_exposure'])
    ('denies direct owner financial mutation: %s',async sql=>{await ready();await expect(db.exec(sql)).rejects.toMatchObject({code:'42501'})})
  it('halts new admissions instead of clamping a charge above a deliberately broken test reserve',async()=>{
    const id=await ready()
    await db.exec('RESET ROLE; ALTER TABLE nutrition_photo_exposure DROP CONSTRAINT nutrition_photo_exposure_stage_reserve; UPDATE nutrition_photo_exposure SET reserved_micro_usd=1')
    await photoDraftActor(db,pilotTestOwner)
    try{
      expect((await settle(id)).data).toMatchObject({state:'bound_violation'})
      expect((await rows())[0].confirmed_micro_usd).toBeNull()
      await expect(ready()).rejects.toMatchObject({code:'54000'})
    }finally{
      await db.exec("RESET ROLE; TRUNCATE nutrition_photo_exposure,nutrition_photo_captures; ALTER TABLE nutrition_photo_exposure ADD CONSTRAINT nutrition_photo_exposure_stage_reserve CHECK(reserved_micro_usd=CASE stage WHEN 'screen' THEN 250000 ELSE 600000 END)")
      await photoDraftActor(db,pilotTestOwner)
    }
  })
  it('denies foreign capture/owner correspondence through the service boundary',async()=>{
    const id=await ready();expect((await server.rpc('settle_nutrition_photo_usage',{p_capture_id:id,p_owner:randomUUID(),p_stage:'screen',p_evidence:evidence()})).error?.code).toBe('42501')
  })
})

it('retains the independent literalfalse settlement gate in the unapplied SQL',async()=>{
  const inactive=await nutritionPilotDatabase(false)
  try{
    const result=await nutritionPilotSettlementClient(inactive).rpc('settle_nutrition_photo_usage',
      {p_capture_id:randomUUID(),p_owner:pilotTestOwner,p_stage:'screen',p_evidence:evidence()})
    expect(result.error?.code).toBe('42501')
  }finally{await inactive.close()}
},30000)
