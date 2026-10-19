import { createServiceRoleClient } from '@/app/lib/auth/supabase-server'
import { nutritionPhotoPilotEnabled, nutritionPhotoPilotOwner } from './photo-pilot-policy'
import { photoUsageMicroUsd, type PhotoUsageEvidence } from './photo-pilot-usage'
import type { PhotoPaidStage } from './photo-pilot-budget'

/** Internal server composition only. No HTTP/MCP argument can invoke settlement.
 * Caller has just reverified owner auth and obtained a valid provider response. */
export async function settlePhotoUsage(owner: string, captureId: string, stage: PhotoPaidStage, evidence: PhotoUsageEvidence) {
  if (!nutritionPhotoPilotEnabled() || !nutritionPhotoPilotOwner(owner)) throw new Error('Pilot settlement disabled')
  const { data, error } = await createServiceRoleClient().rpc('settle_nutrition_photo_usage', {
    p_capture_id: captureId, p_owner: owner, p_stage: stage, p_evidence: evidence,
  })
  if (error || data?.state !== 'settled' || data.captureId !== captureId || data.owner !== owner || data.stage !== stage
    || data.confirmedMicroUsd !== photoUsageMicroUsd(stage, evidence)) throw new Error('Usage settlement unconfirmed')
  return data
}
