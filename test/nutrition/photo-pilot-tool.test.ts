import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('@/app/lib/nutrition/photo-pilot-context',()=>({readPilotNutrition:vi.fn(),correctPilotMeal:vi.fn()}))
import {readPilotNutrition,correctPilotMeal} from '@/app/lib/nutrition/photo-pilot-context'
import {createNutritionPilotTools} from '@/app/lib/nutrition/photo-pilot-tool'
const policy={clientId:'known-client',resource:'https://socius.example/api/mcp',issuer:'https://issuer.example'}
const principal=()=>({...policy,subject:'synthetic-owner',role:'authenticated',expiresAt:Date.now()+60000})
const db={auth:{getUser:vi.fn()}}
beforeEach(()=>{vi.clearAllMocks();db.auth.getUser.mockResolvedValue({data:{user:{id:'synthetic-owner'}},error:null})})
it('uses the verified request-local subject and exposes narrow read/correction descriptors',async()=>{
  vi.mocked(readPilotNutrition).mockResolvedValue({semantics:{intakeCoverage:'unknown'}} as never)
  const tools=createNutritionPilotTools(async()=>({principal:principal(),db:db as never}),policy)
  expect(tools.map(t=>t.descriptor.name)).toEqual(['get_nutrition_context','correct_estimated_meal'])
  expect(tools[0].descriptor.annotations.readOnlyHint).toBe(true);expect(tools[1].descriptor.annotations.readOnlyHint).toBe(false)
  const args={start:'2026-10-19T00:00:00Z',end:'2026-10-20T00:00:00Z'}
  expect((await tools[0].call(args)).isError).toBe(false);expect(readPilotNutrition).toHaveBeenCalledWith(db,args)
})
it.each([{issuer:'other'},{clientId:'other'},{resource:'other'},{role:'service_role'},{expiresAt:0}])('rejects invalid verifier output before domain access: %j',async changes=>{
  const tools=createNutritionPilotTools(async()=>({principal:{...principal(),...changes},db:db as never}),policy)
  await expect(tools[0].call({})).rejects.toMatchObject({status:401})
  expect(readPilotNutrition).not.toHaveBeenCalled();expect(correctPilotMeal).not.toHaveBeenCalled()
})
it('rejects a session/principal mismatch before reads or writes',async()=>{
  db.auth.getUser.mockResolvedValue({data:{user:{id:'another-owner'}},error:null})
  const tools=createNutritionPilotTools(async()=>({principal:principal(),db:db as never}),policy)
  await expect(tools[1].call({})).rejects.toMatchObject({status:401});expect(correctPilotMeal).not.toHaveBeenCalled()
})
