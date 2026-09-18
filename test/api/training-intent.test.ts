import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { POST as confirm } from '@/app/api/coach/intent/route'
import { POST as baseline } from '@/app/api/coach/observations/route'
import { intent } from '../fixtures/personalized-coaching/intent'
const rpc=vi.fn()
const body=()=>({expectedUserId:'user-1',intent:intent(),confirmed:true,idempotencyKey:'intent-request-1',previousMemoryId:null})
const measurement=()=>({expectedUserId:'user-1',intentMemoryId:'11111111-1111-4111-8111-111111111111',goalId:'goal:5k',value:1500.5,observedAt:'2026-09-17T12:00:00.000Z',confirmed:true,idempotencyKey:'baseline-request-1'})
const request=(input:unknown)=>new Request('http://localhost/api/coach/intent',{method:'POST',body:JSON.stringify(input)})
beforeEach(()=>{vi.stubEnv('COACH_TRAINING_INTENT_ENABLED','true');rpc.mockReset().mockResolvedValue({data:[{memory_id:'memory-1',memory_version:1,observation_id:'observation-1'}],error:null});vi.mocked(createServerClient).mockResolvedValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'user-1'}},error:null})},rpc} as never)})
afterEach(()=>vi.unstubAllEnvs())
describe('training intent authenticated mutation boundaries',()=>{
 it('requires explicit confirmation and expected account, with no RPC on rejection',async()=>{
  for(const candidate of [{...body(),confirmed:false},{...body(),expectedUserId:'prior-user'},{...body(),user_id:'other'}, {...body(),intent:{...intent(),confidence:1}}])expect((await confirm(request(candidate))).status).toBeGreaterThanOrEqual(400)
  expect(rpc).not.toHaveBeenCalled()
 })
 it('freezes the owner-resolved intent through the confirmation RPC without accepting a plan',async()=>{
  const response=await confirm(request(body()));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({activePlanChanged:false})
  expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('confirm_training_intent',{p_content:intent(),p_idempotency_key:'intent-request-1',p_previous_memory_id:null})
 })
 it('requires the current account for baseline and never accepts client metric or provenance',async()=>{
  for(const candidate of [{...measurement(),expectedUserId:'prior-user'},{...measurement(),metricId:'run.time'},{...measurement(),source:'model_inferred'}])expect((await baseline(request(candidate))).status).toBeGreaterThanOrEqual(400)
  expect(rpc).not.toHaveBeenCalled()
  expect((await baseline(request(measurement()))).status).toBe(201)
  expect(rpc).toHaveBeenCalledWith('record_training_baseline',expect.objectContaining({p_value:1500.5,p_goal_id:'goal:5k'}))
 })
 it('disables writers independently of compatibility readers',async()=>{
  vi.stubEnv('COACH_TRAINING_INTENT_ENABLED','false')
  expect((await confirm(request(body()))).status).toBe(409);expect((await baseline(request(measurement()))).status).toBe(409);expect(rpc).not.toHaveBeenCalled()
 })
})
