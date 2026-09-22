import type { SupabaseClient } from '@supabase/supabase-js'
import { personalizedCoachingCapabilities } from '../personalized-coaching-capabilities'
import { validateIntentBaselineOwnership } from './planning-intent-server'
import { DIRECTION_MEMORY_KEYS, reconcileTrainingDirection, unavailableDirectionReconciliation, type DirectionMemoryKey, type DirectionMemoryRow, type DirectionReconciliation } from './direction-reconciliation'
import type { RollingWeeklyPlanDraft } from './rolling-weekly-plan'

/** Read only; caller captures the context revision before this read and binds it at persistence. */
export async function fetchDirectionReconciliation(supabase: SupabaseClient, userId: string,
  acceptedWeek: RollingWeeklyPlanDraft, nextWindowStart: string): Promise<DirectionReconciliation> {
  try {
    const rows = await Promise.all(DIRECTION_MEMORY_KEYS.map(async key => {
      const result = await supabase.from('coach_memories')
        .select('id,user_id,memory_key,kind,version,status,content,effective_from,effective_until,review_after')
        .eq('user_id', userId).eq('memory_key', key).order('version', { ascending: false }).limit(1)
      if (result.error) throw new Error('Planning memory unavailable')
      return [key, result.data?.[0] ?? null] as const
    }))
    const result = reconcileTrainingDirection({ userId, acceptedWeek, nextWindowStart,
      memories: Object.fromEntries(rows) as Partial<Record<DirectionMemoryKey, DirectionMemoryRow | null>>,
      intentRequired: personalizedCoachingCapabilities().trainingIntent || Boolean(acceptedWeek.profileSnapshot.trainingIntent), asOf: new Date().toISOString() })
    if (result.currentIntent) {
      const errors = await validateIntentBaselineOwnership(supabase, userId, result.currentIntent)
      if (errors.length) return { ...result, status: 'confirmation_required', reasons: [...result.reasons, 'Current outcome baselines need confirmation'] }
    }
    return result
  } catch { return unavailableDirectionReconciliation() }
}
