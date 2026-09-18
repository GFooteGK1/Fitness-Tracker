import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { confirmedUnwrittenEvent } from '@/app/lib/recommendations/event-recovery'
import { recommendationEvent } from '@/app/lib/recommendations/api'
import { POST as coveragePost } from '@/app/api/recommendations/coverage/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
vi.mock('@/app/lib/auth/supabase-server',()=>({createServerClient:vi.fn()}))
vi.mock('@/app/lib/recommendations/service',()=>({getRecommendationView:vi.fn()}))
const db={auth:{getUser:vi.fn()},rpc:vi.fn()},id='11111111-1111-4111-8111-111111111111'
const requestId='retry:original-request'
const body={expectedUserId:'owner',requestId,tzOffset:0,response:'deferred',deferUntil:'2030-01-01T12:00:00Z'}
function request(value:Record<string,unknown>){return new NextRequest('http://localhost/api/recommendations/event',{method:'POST',body:JSON.stringify(value)})}
const coverage={expectedUserId:'owner',requestId,domain:'nutrition',tzOffset:0,expectedSourceRevision:7,localDate:'2026-09-18',coverageThrough:'2026-09-18T05:00:00Z',status:'partial'}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(createServerClient).mockResolvedValue(db as never);db.auth.getUser.mockResolvedValue({data:{user:{id:'owner'}},error:null})})
describe('independent event recovery proof boundary',()=>{
 it.each([
  ['coverage','40001','Coverage sources changed'],['coverage','22023','Invalid bounded coverage confirmation'],
  ['response','40001','Recommendation is no longer current'],['shown','40001','Recommendation local scope changed'],['response','22023','Invalid defer time'],
 ] as const)('recognizes only exact pre-write %s rejection %s %s',async(kind,code,message)=>{
  expect(confirmedUnwrittenEvent({code,message},kind)).toBe(true);db.rpc.mockResolvedValue({data:null,error:{code,message}})
  const response=kind==='coverage'?await coveragePost(request(coverage)):await recommendationEvent(request(body),id,kind)
  expect(response.status).toBe(409);expect(await response.json()).toMatchObject({noWriteConfirmed:true,refreshRequired:true});expect(db.rpc).toHaveBeenCalledTimes(1);expect(db.rpc.mock.calls[0][1].p_request_id).toBe(requestId)
 })
 it.each([
  {code:'40001'}, {code:'55000'}, {code:'40001',message:'serialization failure'},
  {code:'40001',message:'Coverage sources changed unexpectedly'}, {code:'22023',message:'Coverage replay payload changed'},
  {code:'22023',message:'Response replay payload changed'}, {code:'23505',message:'duplicate key'},
  {code:'PGRST000',message:'Connection lost'}, {code:'XX000',message:'Recommendation is no longer current'},
 ])('retains original uncertainty or collision for $code $message',async(error)=>{
  for(const kind of ['response','shown','coverage'] as const)expect(confirmedUnwrittenEvent(error,kind)).toBe(false)
  db.rpc.mockResolvedValue({data:null,error});const event=await recommendationEvent(request(body),id,'response'),report=await coveragePost(request(coverage))
  expect(await event.json()).toMatchObject({noWriteConfirmed:false,refreshRequired:false});expect(await report.json()).toMatchObject({noWriteConfirmed:false,refreshRequired:false});expect(db.rpc.mock.calls.every(([,args])=>args.p_request_id===requestId)).toBe(true)
 })
 it('does not reuse the proof for a different RPC family',()=>{
  expect(confirmedUnwrittenEvent({code:'40001',message:'Coverage sources changed'},'response')).toBe(false)
  expect(confirmedUnwrittenEvent({code:'22023',message:'Invalid defer time'},'shown')).toBe(false)
  expect(confirmedUnwrittenEvent({code:'40001',message:'Recommendation is no longer current'},'coverage')).toBe(false)
 })
 it('does not turn a thrown transport error into no-write proof',async()=>{
  db.rpc.mockRejectedValue(new Error('socket closed after response'))
  for(const response of [await recommendationEvent(request(body),id,'response'),await coveragePost(request(coverage))]){expect(response.status).toBe(503);expect((await response.json()).noWriteConfirmed).not.toBe(true)}
 })
 it('returns successful replay without adding no-write or refresh flags',async()=>{
  db.rpc.mockResolvedValue({data:{id:'saved',request_id:requestId},error:null});const response=await recommendationEvent(request(body),id,'response');expect(await response.json()).toEqual({event:{id:'saved',request_id:requestId}})
 })
})
