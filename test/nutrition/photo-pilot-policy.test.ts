import {afterEach,expect,it,vi} from 'vitest'
import {NUTRITION_PHOTO_PILOT_ACTIVE,nutritionPhotoPilotEnabled,nutritionPhotoPilotOwner} from '@/app/lib/nutrition/photo-pilot-policy'
afterEach(()=>vi.unstubAllEnvs())
it('keeps the shipped pilot literally inactive despite existing or invented feature environment flags',()=>{
  for(const key of ['NUTRITION_PHOTO_PILOT_ENABLED','CAPTURE_RECEIPTS_V2_ENABLED','CAMERA_PHOTO_BRIDGE_ENABLED'])vi.stubEnv(key,'true')
  expect(NUTRITION_PHOTO_PILOT_ACTIVE).toBe(false);expect(nutritionPhotoPilotEnabled()).toBe(false)
})
it.each(['','11111111-1111-4111-8111-111111111111','forged-owner','2bf29505900fa586ff4ff34b6f049944c0f44fcc7786ffb5ac6acb1d66b76543'])('does not treat a synthetic ID or digest as owner authentication: %s',id=>{
  expect(nutritionPhotoPilotOwner(id)).toBe(false)
})
