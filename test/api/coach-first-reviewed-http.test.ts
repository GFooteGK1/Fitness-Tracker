import { describe,it,expect,vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFirstReviewedHttp } from '@/app/lib/coach/first-reviewed-http'
import type { FirstReviewedPending } from '@/app/lib/coach/first-reviewed-request-resolution'
import { effortWorkInput } from '../fixtures/reviewed-effort-work'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const user=id(1),program=id(2),candidate=id(3),key=id(4)
const accept:FirstReviewedPending & {operation:'accept'}={schemaVersion:1,userId:user,programId:program,operation:'accept',body:{expectedUserId:user,
  programId:program,candidateId:candidate,proposalId:id(5),planVersionId:id(6),requestId:key,contentHash:'a'.repeat(64),sourceHash:'b'.repeat(64)}}
const request=(pending:unknown=accept)=>new Request('http://localhost/api/coach/first-reviewed',{method:'POST',body:JSON.stringify(pending)})

function harness(){
  const auth=vi.fn().mockResolvedValue({data:{user:{id:user}},error:null})
  const db={auth:{getUser:auth}} as unknown as SupabaseClient
  const profiles={read:vi.fn(),prepare:vi.fn(),confirm:vi.fn()},review={read:vi.fn(),submit:vi.fn(),decide:vi.fn()}
  const life={issue:vi.fn(),accept:vi.fn(),recover:vi.fn(),close:vi.fn()}
  const http=createFirstReviewedHttp({createUserClient:async()=>db,profiles,review,life})
  return {auth,db,profiles,review,life,http}
}
function operations():FirstReviewedPending[]{
  const work=effortWorkInput(),recipe=work.registry[0].recipe,profile={...work.input.context.profile,startDate:'2026-10-05'}
  return [
    {schemaVersion:1,userId:user,programId:program,operation:'prepare_profile',body:{expectedUserId:user,
      request:{snapshotId:id(7),designationId:id(8),programId:program,basePlanVersionId:id(9),historyDays:90,tzOffset:0,windowStart:profile.startDate,targetSetup:profile}}},
    {schemaVersion:1,userId:user,programId:program,operation:'confirm_profile',body:{expectedUserId:user,snapshotId:id(7),requestId:key,
      contentHash:'a'.repeat(64),sourceHash:'b'.repeat(64),profileHash:doseContentHash(profile)}},
    {schemaVersion:1,userId:user,programId:program,operation:'submit',body:{expectedUserId:user,draft:{candidateId:candidate,designationId:id(8),programId:program,
      basePlanVersionId:id(9),profileSnapshotId:id(7),profileConfirmationRequestId:key,historyDays:90,tzOffset:0,windowStart:profile.startDate,sequenceNumber:2,
      confirmedTargetProfile:profile,confirmedTargetProfileHash:doseContentHash(profile),recipe:{sessions:recipe.sessions,baseSchedule:recipe.baseSchedule,
        schedules:recipe.schedules,protocols:recipe.protocols,instructions:recipe.instructions,limitations:recipe.limitations},scheduleId:work.input.context.scheduleId,
      rationale:'Synthetic HTTP request shape; not athlete suitability.'}}},
    {schemaVersion:1,userId:user,programId:program,operation:'decide',body:{expectedUserId:user,candidateId:candidate,designationId:id(8),requestId:key,
      decision:'approve',contentHash:'a'.repeat(64),sourceHash:'b'.repeat(64)}},
    {schemaVersion:1,userId:user,programId:program,operation:'issue',body:{expectedUserId:user,programId:program,candidateId:candidate,requestId:key}},accept]
}

describe('first reviewed authenticated HTTP boundary (mocked services)',()=>{
  it.each(operations().map(p=>[p.operation,p] as const))('dispatches only explicit %s to its bounded service',async(operation,pending)=>{
    const h=harness()
    const service=operation==='prepare_profile'?h.profiles.prepare:operation==='confirm_profile'?h.profiles.confirm
      :operation==='submit'?h.review.submit:operation==='decide'?h.review.decide:operation==='issue'?h.life.issue:h.life.accept
    service.mockResolvedValue({kind:'disabled',privatePacket:{secret:'must not escape'}})
    if(operation==='confirm_profile')h.life.recover.mockResolvedValue({kind:'resolved',resolution:{schemaVersion:1,request:pending,disposition:'not_found'}})
    const response=await h.http.execute(request(pending))
    expect(response.status).toBe(409);expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({kind:'disabled',request:pending})
    expect(service).toHaveBeenCalledExactlyOnceWith(h.db,...(operation==='prepare_profile'?[user,(pending.body as {request:unknown}).request]
      :operation==='confirm_profile'?[pending.body]:[pending]))
    for(const other of [...Object.values(h.profiles),...Object.values(h.review),...Object.values(h.life)]){
      if(other!==service&&(operation!=='confirm_profile'||other!==h.life.recover))expect(other).not.toHaveBeenCalled()
    }
    if(operation==='confirm_profile')expect(h.life.recover).toHaveBeenCalledExactlyOnceWith(h.db,pending)
  })
  it.each(['resolution','resolve'] as const)('%s remains independent of fresh-write enablement and never dispatches acceptance',async mode=>{
    const h=harness(),resolution={schemaVersion:1,request:accept,disposition:'no_write',resolutionId:id(11),resolvedAt:'2026-10-05T16:00:00Z'}
    const service=mode==='resolution'?h.life.recover:h.life.close
    service.mockResolvedValue({kind:'resolved',resolution,privatePacket:{secret:'hidden'}})
    const response=await h.http[mode](request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({kind:'resolved',request:accept,resolution,numericRuntimeEligible:false})
    expect(service).toHaveBeenCalledExactlyOnceWith(h.db,accept)
    expect(h.life.accept).not.toHaveBeenCalled();expect(h.life.issue).not.toHaveBeenCalled();expect(h.review.decide).not.toHaveBeenCalled()
  })
  it('authenticates before reading bodies and rejects changed actors or malformed envelopes',async()=>{
    const h=harness()
    h.auth.mockResolvedValue({data:{user:null},error:null})
    const untouched=request();expect((await h.http.execute(untouched)).status).toBe(401);expect(untouched.bodyUsed).toBe(false)
    h.auth.mockResolvedValue({data:{user:{id:user}},error:null})
    for(const invalid of [null,{...accept,extra:true},{...accept,body:{...accept.body,sourceHash:null}},{...accept,operation:'activate'}]){
      expect((await h.http.execute(request(invalid))).status).toBe(400)
    }
    const foreign={...accept,userId:id(12),body:{...accept.body,expectedUserId:id(12)}}
    expect((await h.http.execute(request(foreign))).status).toBe(409)
    expect(h.life.accept).not.toHaveBeenCalled()
  })
  it('rejects oversized UTF8 content and invalid JSON before forwarding',async()=>{
    const h=harness()
    expect((await h.http.execute(new Request('http://localhost',{method:'POST',body:'{"x":"'+'é'.repeat(300000)+'"}'}))).status).toBe(413)
    expect((await h.http.execute(new Request('http://localhost',{method:'POST',body:'{broken'}))).status).toBe(400)
    expect(h.life.accept).not.toHaveBeenCalled()
  })
  it.each(['before','after'] as const)('withholds changed-account acceptance %s the service await',async boundary=>{
    const h=harness();h.life.accept.mockResolvedValue({kind:'accepted',receipt:{proposalId:id(5),planVersionId:id(6),activePlanVersionId:id(6)}})
    h.auth.mockResolvedValueOnce({data:{user:{id:user}},error:null})
    if(boundary==='after')h.auth.mockResolvedValueOnce({data:{user:{id:user}},error:null})
    h.auth.mockResolvedValue({data:{user:{id:id(12)}},error:null})
    const response=await h.http.execute(request())
    expect(response.status).toBe(409);expect(await response.json()).toEqual({kind:'account_changed'})
    expect(h.life.accept).toHaveBeenCalledTimes(boundary==='after'?1:0)
  })
  it('returns only exact acceptance IDs and refuses malformed success receipts',async()=>{
    const h=harness(),receipt={proposalId:id(5),planVersionId:id(6),activePlanVersionId:id(13)}
    h.life.accept.mockResolvedValue({kind:'accepted',receipt,privatePacket:{secret:'hidden'}})
    const response=await h.http.execute(request())
    expect(response.status).toBe(200);expect(await response.json()).toEqual({kind:'accepted',request:accept,receipt,numericRuntimeEligible:false})
    for(const bad of [{...receipt,planVersionId:id(14)},{...receipt,privatePacket:{}},{}]){
      h.life.accept.mockResolvedValue({kind:'accepted',receipt:bad})
      expect((await h.http.execute(request())).status).toBe(503)
    }
  })
  it('does not dispatch confirmation after an outer program conflict or no-write closure',async()=>{
    const h=harness(),pending=operations().find(p=>p.operation==='confirm_profile')!
    h.life.recover.mockResolvedValue({kind:'request_conflict',request:pending})
    expect((await h.http.execute(request(pending))).status).toBe(409)
    h.life.recover.mockResolvedValue({kind:'resolved',resolution:{schemaVersion:1,request:pending,disposition:'no_write',resolutionId:id(15),resolvedAt:'2026-10-05T16:00:00Z'}})
    expect((await h.http.execute(request(pending))).status).toBe(409)
    expect(h.profiles.confirm).not.toHaveBeenCalled()
  })
  it('refuses success kinds without their required payload',async()=>{
    const h=harness()
    for(const kind of ['accepted','recovered','issued']){
      h.life.accept.mockResolvedValue({kind})
      expect((await h.http.execute(request())).status).toBe(503)
    }
    h.review.read.mockResolvedValue({kind:'candidate'})
    expect((await h.http.readCandidate(candidate)).status).toBe(503)
    h.profiles.read.mockResolvedValue({kind:'snapshot'})
    expect((await h.http.readSnapshot(id(7))).status).toBe(503)
  })
  it('binds fresh decision and profile confirmation receipts to the exact pending request',async()=>{
    const h=harness(),decision=operations().find(p=>p.operation==='decide')!,confirmation=operations().find(p=>p.operation==='confirm_profile')!
    if(decision.operation!=='decide'||confirmation.operation!=='confirm_profile')throw Error('Expected operation fixtures')
    const receipt={candidateId:candidate,decisionId:id(20),requestId:key,decision:'approve',reviewerId:user,designationId:id(8),designationVersion:1,
      contentHash:'a'.repeat(64),sourceHash:'b'.repeat(64),decidedAt:'2026-10-05T16:00:00Z',replayed:false}
    h.review.decide.mockResolvedValue({kind:'decided',receipt})
    expect((await h.http.execute(request(decision))).status).toBe(200)
    for(const bad of [{...receipt,candidateId:id(21)},{...receipt,sourceHash:'c'.repeat(64)},{...receipt,reviewerId:id(22)}]){
      h.review.decide.mockResolvedValue({kind:'decided',receipt:bad})
      expect((await h.http.execute(request(decision))).status).toBe(503)
    }
    h.life.recover.mockResolvedValue({kind:'resolved',resolution:{schemaVersion:1,request:confirmation,disposition:'not_found'}})
    const profileReceipt={snapshotId:confirmation.body.snapshotId,requestId:confirmation.body.requestId,userId:user,
      contentHash:confirmation.body.contentHash,sourceHash:confirmation.body.sourceHash,profileHash:confirmation.body.profileHash,confirmedAt:'2026-10-05T16:00:00Z'}
    h.profiles.confirm.mockResolvedValue({kind:'confirmed',receipt:profileReceipt})
    expect((await h.http.execute(request(confirmation))).status).toBe(200)
    h.profiles.confirm.mockResolvedValue({kind:'confirmed',receipt:{...profileReceipt,snapshotId:id(23)}})
    expect((await h.http.execute(request(confirmation))).status).toBe(503)
  })
  it.each(['readCandidate','readSnapshot'] as const)('%s enforces authentication, UUID and final actor checks',async mode=>{
    const h=harness(),service=mode==='readCandidate'?h.review.read:h.profiles.read
    expect((await h.http[mode]('not-a-uuid')).status).toBe(400);expect(service).not.toHaveBeenCalled()
    service.mockResolvedValue({kind:'not_found',privatePacket:{secret:'hidden'}})
    const response=await h.http[mode](candidate)
    expect(response.status).toBe(404);expect(await response.json()).toEqual({kind:'not_found'})
    h.auth.mockResolvedValueOnce({data:{user:{id:user}},error:null}).mockResolvedValue({data:{user:{id:id(12)}},error:null})
    expect((await h.http[mode](candidate)).status).toBe(409)
  })
  it('does not expose private error details or incomplete candidate packets',async()=>{
    const h=harness()
    h.review.read.mockResolvedValue({kind:'candidate',candidate:{privatePacket:{secret:'hidden'}}})
    expect((await h.http.readCandidate(candidate)).status).toBe(503)
    h.life.accept.mockRejectedValue(Error('secret backend error'))
    const response=await h.http.execute(request())
    expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('secret')
  })
})
