import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import type {PGlite} from '@electric-sql/pglite'
import {nutritionPilotDatabase,pilotTestOwner} from '../helpers/nutrition-pilot-database'
import {photoDraftActor} from '../helpers/photo-draft-database'
import {photoDispatchGuard} from '@/app/lib/nutrition/photo-pilot-budget'

let db:PGlite
const rpc=async(id:string,action:string,payload:object={})=>(await db.query<{v:any}>('SELECT nutrition_photo_pilot($1,$2,$3) v',[id,action,payload])).rows[0].v
async function ready() {
  const id=randomUUID(),hash=id.replaceAll('-','').repeat(2)
  await rpc(id,'reserve',{sourceHash:hash,normalizedHash:hash,capturedAt:'2026-10-19T12:00:00Z',context:'',consent:'selected-photo-openai-autolog-v1',normalization:'decoded-jpeg-v1'})
  await rpc(id,'photo_stored');return id
}
async function exposure(amounts:number[],settled:string|null=null) {
  await db.exec('RESET ROLE')
  for(const amount of amounts)await db.query(`INSERT INTO nutrition_photo_exposure(capture_id,user_id,stage,policy,reserved_micro_usd,admitted_at,settled_at)
    VALUES($1,$2,$3,'openai-owner-30d-v1',$4,clock_timestamp()-interval '3 days',$5)`,[randomUUID(),pilotTestOwner,amount===250000?'screen':'estimate',amount,settled])
  await photoDraftActor(db,pilotTestOwner)
}
beforeAll(async()=>{db=await nutritionPilotDatabase();await db.query('INSERT INTO auth.users(id) VALUES($1)',[pilotTestOwner])},30000)
beforeEach(async()=>{await db.exec(`RESET ROLE; TRUNCATE nutrition_photo_exposure,nutrition_photo_captures;
  WITH t AS (SELECT clock_timestamp()-interval '1 day' s) UPDATE nutrition_photo_budget SET started_at=t.s,ends_at=t.s+interval '720 hours' FROM t`)
  // One timestamp is required by the exact immutable-period constraint.
  await photoDraftActor(db,pilotTestOwner)
})
afterEach(()=>vi.restoreAllMocks())
afterAll(async()=>{await db?.close()})

describe('fixed first-period financial admissions (disposable PostgreSQL only)',()=>{
  it('admits exactly $1 of unresolved screening exposure and refuses the next stage',async()=>{
    for(let i=0;i<4;i++)expect((await rpc(await ready(),'screen_start')).dispatch_grant.reservedMicroUsd).toBe(250000)
    await expect(rpc(await ready(),'screen_start')).rejects.toMatchObject({code:'54000'})
    expect((await db.query<{n:string}>('SELECT sum(reserved_micro_usd)::text n FROM nutrition_photo_exposure')).rows[0].n).toBe('1000000')
  })
  it('never ages unresolved calls out, even when admission is days old',async()=>{
    await exposure([250000,250000,250000,250000])
    await expect(rpc(await ready(),'screen_start')).rejects.toMatchObject({code:'54000'})
  })
  it('ages confirmed calls only after completion plus a dispatch safety margin',async()=>{
    await exposure([250000,250000,250000,250000],new Date(Date.now()-24*3600000-30000).toISOString())
    await expect(rpc(await ready(),'screen_start')).rejects.toMatchObject({code:'54000'})
    await db.exec("RESET ROLE; UPDATE nutrition_photo_exposure SET settled_at=clock_timestamp()-interval '25 hours'")
    await photoDraftActor(db,pilotTestOwner)
    expect((await rpc(await ready(),'screen_start')).state).toBe('screening')
  })
  it('enforces the lifetime $5 boundary even when rolling exposure is zero',async()=>{
    await exposure(Array(19).fill(250000),new Date(Date.now()-25*3600000).toISOString())
    await rpc(await ready(),'screen_start')
    await expect(rpc(await ready(),'screen_start')).rejects.toMatchObject({code:'54000'})
  })
  it('reserves a full estimation ceiling, separately from screening',async()=>{
    const id=await ready();await rpc(id,'screen_start')
    await rpc(id,'screen_result',{screening:{model:'gpt-6-luna',policy:'decisions-food-v2',route:'food_candidate'}})
    expect((await rpc(id,'estimate_start')).dispatch_grant).toMatchObject({stage:'estimate',model:'gpt-5.6-luna',reservedMicroUsd:600000})
    await expect(rpc(await ready(),'screen_start')).rejects.toMatchObject({code:'54000'})
  })
  it('grants only one admission across competing duplicate stage requests',async()=>{
    const id=await ready(),results=await Promise.allSettled([rpc(id,'screen_start'),rpc(id,'screen_start')])
    expect(results.filter(v=>v.status==='fulfilled')).toHaveLength(1)
    expect((await db.query('SELECT * FROM nutrition_photo_exposure')).rows).toHaveLength(1)
    await expect(rpc(id,'screen_start')).rejects.toBeTruthy()
  })
  it('rolls reservation back when the capture transition fails',async()=>{
    await expect(rpc(randomUUID(),'screen_start')).rejects.toMatchObject({code:'42501'})
    expect((await db.query('SELECT * FROM nutrition_photo_exposure')).rows).toHaveLength(0)
  })
  it.each(['DELETE FROM nutrition_photo_exposure','TRUNCATE nutrition_photo_exposure',"UPDATE nutrition_photo_exposure SET reserved_micro_usd=0",'DELETE FROM nutrition_photo_budget',"UPDATE nutrition_photo_budget SET ends_at=clock_timestamp()+interval '30 days'"])
    ('denies owner reset/refund/delete: %s',async sql=>{await expect(db.exec(sql)).rejects.toMatchObject({code:'42501'})})
  it('denies a missing, future or ended period without manufacturing a replacement',async()=>{
    const id=await ready();await db.exec("RESET ROLE; WITH t AS (SELECT clock_timestamp()-interval '31 days' s) UPDATE nutrition_photo_budget SET started_at=t.s,ends_at=t.s+interval '720 hours' FROM t")
    await photoDraftActor(db,pilotTestOwner);await expect(rpc(id,'screen_start')).rejects.toMatchObject({code:'54000'})
    await db.exec('RESET ROLE; DELETE FROM nutrition_photo_budget');await photoDraftActor(db,pilotTestOwner)
    await expect(rpc(id,'screen_start')).rejects.toMatchObject({code:'54000'})
  })
})

describe('non-replayable execution-local dispatch acknowledgement',()=>{
  const grant={policy:'openai-owner-30d-v1',stage:'screen',captureId:'synthetic',model:'gpt-6-luna',reservedMicroUsd:250000,remainingMs:100000}
  it('accepts one acknowledged dispatch and refuses a second',()=>{
    const guard=photoDispatchGuard(grant,'screen','synthetic',performance.now());guard();expect(guard).toThrow()
  })
  it.each([undefined,{}, {...grant,model:'other'}, {...grant,reservedMicroUsd:0},{...grant,remainingMs:59999},{...grant,captureId:'other'}])
    ('refuses missing or changed authority before any dispatch',value=>{expect(()=>photoDispatchGuard(value,'screen','synthetic',performance.now())).toThrow()})
  it('refuses delayed RPC acknowledgement, including a grant committed before a long pause',()=>{
    const guard=photoDispatchGuard(grant,'screen','synthetic',performance.now()-10001);expect(guard).toThrow()
  })
})
