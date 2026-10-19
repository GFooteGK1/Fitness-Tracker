import { expect,it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { nutritionCanaryDatabase,applyCanaryPhase } from '../helpers/nutrition-canary-database'
import { photoDraftActor } from '../helpers/photo-draft-database'
import { pilotTestOwner,nutritionPilotClient,nutritionPilotSettlementClient } from '../helpers/nutrition-pilot-database'
import { PHOTO_CANARY_ID,PHOTO_CANARY_SOURCE_HASH,PHOTO_CANARY_NORMALIZED_HASH,PHOTO_CANARY_CREATED_AT,PHOTO_CANARY_CONTEXT } from '@/app/lib/nutrition/photo-pilot-canary-policy'

it('executes all four exact approved scripts locally; proves phase isolation, grants and unchanged accounting',async()=>{
  const db=await nutritionCanaryDatabase()
  const client=nutritionPilotClient(db,()=>pilotTestOwner,'nutrition-canary'),service=nutritionPilotSettlementClient(db)
  const reserve={sourceHash:PHOTO_CANARY_SOURCE_HASH,normalizedHash:PHOTO_CANARY_NORMALIZED_HASH,capturedAt:PHOTO_CANARY_CREATED_AT,context:PHOTO_CANARY_CONTEXT,consent:'selected-photo-openai-autolog-v1',normalization:'decoded-jpeg-v1'}
  const call=(id:string,action:string,payload:object={})=>client.rpc('nutrition_photo_pilot',{p_id:id,p_action:action,p_payload:payload})
  try {
    const period=(await db.query('SELECT policy,started_at,ends_at FROM nutrition_photo_budget')).rows
    expect(period).toHaveLength(1)
    await photoDraftActor(db,pilotTestOwner)
    expect((await call(PHOTO_CANARY_ID,'reserve',reserve)).error?.code).toBe('42501')
    expect((await service.rpc('settle_nutrition_photo_usage',{p_capture_id:PHOTO_CANARY_ID,p_owner:pilotTestOwner,p_stage:'screen',p_evidence:{}})).error?.code).toBe('42501')
    await applyCanaryPhase(db,1);await photoDraftActor(db,pilotTestOwner)
    expect((await call(randomUUID(),'reserve',reserve)).error?.code).toBe('42501')
    expect((await call(PHOTO_CANARY_ID,'reserve',reserve)).data).toMatchObject({id:PHOTO_CANARY_ID,claimed:true,object_path:`meals/${pilotTestOwner}/nutrition-canary/${PHOTO_CANARY_ID}.jpg`})
    expect((await call(PHOTO_CANARY_ID,'commit')).error?.code).toBe('42501')
    expect((await db.query('SELECT * FROM nutrition_photo_captures')).rows).toHaveLength(1)
    await expect(db.query("UPDATE nutrition_photo_captures SET state='estimated'")).rejects.toMatchObject({code:'42501'})
    await expect(db.query('SELECT * FROM nutrition_photo_budget')).rejects.toMatchObject({code:'42501'})
    await expect(db.query("SELECT settle_nutrition_photo_usage($1,$2,'screen','{}')",[PHOTO_CANARY_ID,pilotTestOwner])).rejects.toMatchObject({code:'42501'})
    await photoDraftActor(db,'22222222-2222-4222-8222-222222222222')
    expect((await db.query('SELECT * FROM nutrition_photo_captures')).rows).toHaveLength(0)
    expect((await db.query('SELECT * FROM nutrition_photo_exposure')).rows).toHaveLength(0)
    expect((await call(PHOTO_CANARY_ID,'reserve',reserve)).error?.code).toBe('42501')
    await db.exec('SET ROLE anon')
    expect((await call(PHOTO_CANARY_ID,'commit')).error?.code).toBe('42501')
    await expect(db.query('SELECT * FROM nutrition_photo_captures')).rejects.toMatchObject({code:'42501'})
    expect((await service.rpc('settle_nutrition_photo_usage',{p_capture_id:randomUUID(),p_owner:pilotTestOwner,p_stage:'screen',p_evidence:{}})).error?.code).toBe('42501')
    await applyCanaryPhase(db,2)
    // Even a corrupted saved-state receipt must not bypass the canary veto via
    // the old commit replay return. Disposable test superuser fixture only.
    await db.query("UPDATE nutrition_photo_captures SET state='saved',receipt='{}' WHERE id=$1",[PHOTO_CANARY_ID])
    await photoDraftActor(db,pilotTestOwner)
    expect((await call(PHOTO_CANARY_ID,'commit')).error?.code).toBe('42501')
    const normal=randomUUID()
    expect((await call(normal,'reserve',{...reserve,sourceHash:'a'.repeat(64),normalizedHash:'b'.repeat(64)})).data).toMatchObject({id:normal,claimed:true,object_path:`meals/${pilotTestOwner}/nutrition-pilot/${normal}.jpg`})
    await call(normal,'photo_stored');expect((await call(normal,'screen_start')).data).toMatchObject({state:'screening',dispatch_grant:{reservedMicroUsd:250000}})
    await applyCanaryPhase(db,3)
    expect((await db.query('SELECT policy,started_at,ends_at FROM nutrition_photo_budget')).rows).toEqual(period)
    expect((await db.query('SELECT halted FROM nutrition_photo_budget')).rows).toEqual([{halted:true}])
    expect((await db.query('SELECT reserved_micro_usd,confirmed_micro_usd FROM nutrition_photo_exposure')).rows).toEqual([{reserved_micro_usd:250000,confirmed_micro_usd:null}])
    await photoDraftActor(db,pilotTestOwner)
    expect((await call(normal,'estimate_start')).error?.code).toBe('42501')
    expect((await service.rpc('settle_nutrition_photo_usage',{p_capture_id:normal,p_owner:pilotTestOwner,p_stage:'screen',p_evidence:{}})).error?.code).toBe('42501')
    await db.exec('RESET ROLE')
    for(const table of ['meals','logging_requests','logging_request_items','activity_revisions'])expect((await db.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0)
    expect((await db.query('SELECT * FROM nutrition_photo_captures')).rows).toHaveLength(2)
  } finally { await db.close() }
},30000)
