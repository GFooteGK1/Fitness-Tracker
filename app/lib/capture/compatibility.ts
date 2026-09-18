import type { SupabaseClient } from '@supabase/supabase-js'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'

/** Writer rollout flags may pause new captures, but cannot undo installed revision/grant contracts. */
export async function auditedCaptureInstalled(supabase: SupabaseClient): Promise<boolean> {
  if (personalizedCoachingCapabilities().captureReceiptsV2) return true
  const { error } = await supabase.from('meals').select('capture_revision').limit(1)
  if (!error) return true
  if (['42703', 'PGRST204'].includes(error.code)) return false
  throw new Error('Capture compatibility could not be established. Retry without changing this request.')
}
