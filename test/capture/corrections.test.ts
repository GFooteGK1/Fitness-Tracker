import { afterEach, describe, expect, it, vi } from 'vitest'
import { amendActivity, changedCaptureFields } from '@/app/lib/capture/corrections'
import { auditedCaptureInstalled } from '@/app/lib/capture/compatibility'
import { captureProvenance } from '@/app/lib/capture/contracts'

const owner='11111111-1111-4111-8111-111111111111',entity='22222222-2222-4222-8222-222222222222'
const identity={entityId:entity,expectedRevision:1,requestId:'correction-request-1'}
const before={workout_date:'2026-09-17',notes:'old',rpe:7,blocks:[{block_type:'STRENGTH',exercises:[{movementId:'squat',movementName:'Squat',sets:3,reps:{min:5,max:8}}]}]}
const original=captureProvenance('workout','athlete_reported','unreviewed')
function client(record:Record<string,unknown>=before,provenance=original){
 const calls:string[]=[]
 const from=vi.fn((table:string)=>{calls.push(table);const chain:any={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:{record,provenance},error:null}),single:async()=>({data:null,error:{code:'PGRST116'}})};return chain})
 let frozen:string|undefined
 const receipt={schemaVersion:2,userId:owner,entityKind:'workout',entityId:entity,revision:2,state:'saved'}
 const rpc=vi.fn(async(_name:string,args:any)=>{const serialized=JSON.stringify(args);if(frozen&&frozen!==serialized)return {data:null,error:{code:'22023'}};frozen=serialized;return {data:receipt,error:null}})
 return {from,rpc,calls}
}
afterEach(()=>vi.unstubAllEnvs())
describe('correction source preservation and immutable replay',()=>{
 it('preserves unreviewed quantities when only notes or canonical movement names change',async()=>{
 const db=client();await amendActivity(db as never,owner,'workout',identity,{notes:'new'});expect(db.rpc.mock.calls[0][1].p_provenance).toEqual(original)
 const renamed={...before,blocks:[{...before.blocks[0],exercises:[{...before.blocks[0].exercises[0],movementName:'Back squat'}]}]}
 expect(changedCaptureFields('workout',before,renamed)).toEqual(['blocks'])
 })
 it('changes only inferred fields and leaves separately reported effort untouched',async()=>{
 const db=client();const changed={...before,blocks:[{...before.blocks[0],exercises:[{...before.blocks[0].exercises[0],sets:2}]}]};await amendActivity(db as never,owner,'workout',identity,changed,false,true)
 const p=db.rpc.mock.calls[0][1].p_provenance;expect(p.fields.quantities).toMatchObject({origin:'model_estimated',reviewState:'unreviewed'});expect(p.fields.rpe).toEqual(original.fields.rpe)
 })
 it('does not confirm unchanged meal composition after changing only a food name',()=>{
 const base={items:[{food:'Egg',portion:'1',protein:6,carbs:0,fat:5,calories:69}]};expect(changedCaptureFields('meal',base,{items:[{...base.items[0],food:'Large egg'}]})).toEqual(['items'])
 })
 it('reconstructs exact original amendment from archived revision after canonical deletion',async()=>{
 const db=client();const first=await amendActivity(db as never,owner,'workout',identity,{notes:'edited'});expect(await amendActivity(db as never,owner,'workout',identity,{notes:'edited'})).toEqual(first)
 expect(db.calls).toEqual(['activity_revisions','activity_revisions']);expect(db.rpc.mock.calls[0][1]).toEqual(db.rpc.mock.calls[1][1]);await expect(amendActivity(db as never,owner,'workout',identity,{notes:'changed reuse'})).rejects.toMatchObject({code:'22023'})
 })
 it('recognizes installed audited correction contracts independently of disabled capture writer flag',async()=>{
 vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED','false');const limit=vi.fn().mockResolvedValue({data:[],error:null});const db={from:vi.fn(()=>({select:()=>({limit})}))};expect(await auditedCaptureInstalled(db as never)).toBe(true);expect(limit).toHaveBeenCalledWith(1)
 limit.mockResolvedValue({data:null,error:{code:'42703'}});expect(await auditedCaptureInstalled(db as never)).toBe(false)
 limit.mockResolvedValue({data:null,error:{code:'08006'}});await expect(auditedCaptureInstalled(db as never)).rejects.toThrow('compatibility')
 })
})
