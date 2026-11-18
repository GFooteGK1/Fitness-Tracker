import type { SupabaseClient } from '@supabase/supabase-js'
import type { DailyTargets } from './types/food-tracking'

const historyMealFields = 'id,user_id,meal_timestamp,meal_timing,items,total_protein,total_carbs,total_fat,total_calories,needs_review,reviewed_at,entry_method,capture_revision,capture_provenance,capture_input_method,captured_at'

export async function readOwnedMeals(db: SupabaseClient, owner: string, window: {
  startUtc: string; endUtcExclusive: string
}, limit?: number) {
  const table = db.from('meals')
  const query = (limit === undefined ? table.select('*') : table.select(historyMealFields, { count: 'exact' }))
    .eq('user_id', owner).gte('meal_timestamp', window.startUtc).lt('meal_timestamp', window.endUtcExclusive)
    .order('meal_timestamp', { ascending: true })
  const result = await (limit === undefined ? query : query.order('id', { ascending: true }).limit(limit))
  if (result.error) return result
  if (!Array.isArray(result.data) || result.data.some(row => row?.user_id !== owner)) {
    throw new Error('Meal source is unavailable')
  }
  return result
}

export function readStoredDecimal(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function comparisonTargets(value: unknown, owner: string): DailyTargets | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const protein = readStoredDecimal(row.target_protein), carbs = readStoredDecimal(row.target_carbs)
  const fat = readStoredDecimal(row.target_fat), calories = readStoredDecimal(row.target_calories)
  const tolerance = readStoredDecimal(row.tolerance_pct)
  if (row.user_id !== owner || protein === null || protein <= 0 || carbs === null || carbs <= 0 ||
    fat === null || fat <= 0 || calories === null || calories <= 0 || tolerance === null || tolerance < 0 || tolerance > 100) return null
  return { userId: owner, targetProtein: protein, targetCarbs: carbs, targetFat: fat,
    targetCalories: calories, tolerancePct: tolerance,
    updatedAt: new Date(typeof row.updated_at === 'string' ? row.updated_at : NaN) }
}

export type OwnedTargetRead =
  | { status: 'available'; targets: DailyTargets }
  | { status: 'not_configured' | 'unavailable' }

export async function readOwnedCurrentTargets(db: SupabaseClient, owner: string): Promise<OwnedTargetRead> {
  try {
    const { data, error } = await db.from('daily_targets')
      .select('user_id,target_protein,target_carbs,target_fat,target_calories,tolerance_pct,updated_at').eq('user_id', owner).limit(2)
    if (!error && Array.isArray(data)) {
      if (data.length === 0) return { status: 'not_configured' }
      if (data.length === 1) {
        const targets = comparisonTargets(data[0], owner)
        if (targets) return { status: 'available', targets }
      }
    }
  } catch {
    // Target failures cannot erase successfully retrieved meal facts.
  }
  return { status: 'unavailable' }
}
