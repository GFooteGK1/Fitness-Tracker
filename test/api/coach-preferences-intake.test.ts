import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/app/lib/auth/supabase-server', () => ({createServerClient: vi.fn()}))
vi.mock('@/app/lib/coach/evidence-context', () => ({fetchCoachEvidenceContext: vi.fn()}))
import { POST, GET } from '@/app/api/coach/intake/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { fetchCoachEvidenceContext } from '@/app/lib/coach/evidence-context'
const planningInput = {format:'complete_programming_intake_v0_3', primaryDomain:'strength', goal:'Build useful strength',
 experience:'consistent',trainingDays:['monday','thursday'],sessionMinutes:60,equipment:'Dumbbells',resolvedEquipmentIds:['bodyweight','dumbbell'],
 constraints:'',constraintKinds:[],secondaryGoals:[],startDate:'2026-09-14'}
const none = {schemaVersion:1,state:'none',entries:[]}
const request = (extra = {}) => new Request('http://localhost/api/coach/intake',{method:'POST',body:JSON.stringify({planningInput:{...planningInput,...extra},idempotencyKey:'preference-retry-1'})})
function client(user: string | null = 'owner') {
 return {auth:{getUser:vi.fn().mockResolvedValue({data:{user:user ? {id:user}:null},error:null})},rpc:vi.fn().mockResolvedValue({error:null})}
}
describe('preference intake',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('COACH_EXERCISE_PREFERENCES_ENABLED','true')})
 afterEach(()=>vi.unstubAllEnvs())
 it('saves standalone preferences without changing other memories and preserves retry identity',async()=>{
  const db=client();vi.mocked(createServerClient).mockResolvedValue(db as never)
  const standalone=()=>new Request('http://localhost/api/coach/intake',{method:'POST',body:JSON.stringify({exercisePreferences:none,idempotencyKey:'standalone-retry-1'})})
  db.rpc.mockResolvedValueOnce({error:{code:'unavailable'}})
  expect((await POST(standalone())).status).toBe(503)
  expect((await POST(standalone())).status).toBe(200)
  expect(db.rpc).toHaveBeenCalledTimes(2)
  expect(db.rpc.mock.calls[0]).toEqual(db.rpc.mock.calls[1])
  expect(db.rpc.mock.calls[1][1]).toMatchObject({p_memory_key:'exercise_preferences',p_content:none,p_idempotency_key:'standalone-retry-1:exercise_preferences'})
 })
 it('rejects malformed, ambiguous, or disabled standalone writes',async()=>{
  const db=client();vi.mocked(createServerClient).mockResolvedValue(db as never)
  const standalone=(extra={})=>new Request('http://localhost/api/coach/intake',{method:'POST',body:JSON.stringify({exercisePreferences:none,idempotencyKey:'standalone-retry-1',...extra})})
  expect((await POST(standalone({exercisePreferences:{...none,state:'specified'}}))).status).toBe(400)
  expect((await POST(standalone({planningInput}))).status).toBe(400)
  expect((await POST(standalone({idempotencyKey:''}))).status).toBe(400)
  vi.stubEnv('COACH_EXERCISE_PREFERENCES_ENABLED','false')
  expect((await POST(standalone())).status).toBe(409)
  expect(db.rpc).not.toHaveBeenCalled()
 })
 it('requires authentication for read and write',async()=>{
  const db=client(null);vi.mocked(createServerClient).mockResolvedValue(db as never)
  expect((await GET()).status).toBe(401);expect((await POST(request({exercisePreferences:none}))).status).toBe(401);expect(db.rpc).not.toHaveBeenCalled()
 })
 it('skipping preserves existing preferences by omitting any preference mutation',async()=>{
  const db=client();vi.mocked(createServerClient).mockResolvedValue(db as never)
  expect((await POST(request())).status).toBe(200)
  expect(db.rpc.mock.calls.some(call=>call[1].p_memory_key==='exercise_preferences')).toBe(false)
 })
 it('explicit none uses an atomic owned snapshot and stable retry key',async()=>{
  const db=client();vi.mocked(createServerClient).mockResolvedValue(db as never)
  db.rpc.mockResolvedValueOnce({error:{code:'unavailable'}})
  expect((await POST(request({exercisePreferences:none}))).status).toBe(503)
  expect(db.rpc).toHaveBeenCalledTimes(1)
  expect((await POST(request({exercisePreferences:none}))).status).toBe(200)
  expect(db.rpc.mock.calls[0]).toEqual(db.rpc.mock.calls[1])
  expect(db.rpc.mock.calls[0]).toEqual(['confirm_coach_memory',expect.objectContaining({p_memory_key:'exercise_preferences',p_kind:'preference',p_content:none,p_idempotency_key:'preference-retry-1:exercise_preferences'})])
  expect(db.rpc.mock.calls[0][1]).not.toHaveProperty('user_id')
 })
 it('rejects invalid or disabled preferences before writes',async()=>{
  const db=client();vi.mocked(createServerClient).mockResolvedValue(db as never)
  expect((await POST(request({exercisePreferences:{...none,state:'specified'}}))).status).toBe(400)
  vi.stubEnv('COACH_EXERCISE_PREFERENCES_ENABLED','false')
  expect((await POST(request({exercisePreferences:none}))).status).toBe(409)
  expect(db.rpc).not.toHaveBeenCalled()
  expect(await (await GET()).json()).toEqual({exercisePreferencesEnabled:false,exercisePreferences:null})
 })
 it('reads current owned confirmed snapshot and fails closed on incomplete selection',async()=>{
  vi.mocked(createServerClient).mockResolvedValue(client() as never)
  vi.mocked(fetchCoachEvidenceContext).mockResolvedValue({storageAvailable:true,selectionComplete:true,memories:[{memoryKey:'exercise_preferences',content:none}]} as never)
  const response=await GET();expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toContain('no-store')
  expect(await response.json()).toEqual({exercisePreferencesEnabled:true,exercisePreferences:none})
  expect(fetchCoachEvidenceContext).toHaveBeenCalledWith(expect.anything(),'owner',expect.objectContaining({purpose:'new_planning'}))
  vi.mocked(fetchCoachEvidenceContext).mockResolvedValue({storageAvailable:true,selectionComplete:false} as never)
  expect((await GET()).status).toBe(503)
 })
})
