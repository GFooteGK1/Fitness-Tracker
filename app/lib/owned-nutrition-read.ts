import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateDailyTotals } from './adherence-calculator'
import type { DailyTargets, MacroTotals } from './types/food-tracking'

const historyMealFields = 'id,user_id,meal_timestamp,meal_timing,items,total_protein,total_carbs,total_fat,total_calories,needs_review,reviewed_at,entry_method,capture_revision,capture_provenance,capture_input_method,captured_at'
const nutritionTotalFields = 'id,user_id,meal_timestamp,total_protein,total_carbs,total_fat,total_calories'
const NUTRITION_TOTAL_LIMIT = 1000

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

type OwnedMealTotalsRead = {
  status: 'available' | 'no_records' | 'partial' | 'unavailable'
  count: number | null
  totals: MacroTotals | null
}

/** Summarize the local day independently of the smaller activity-detail query. */
export async function readOwnedMealTotals(db: SupabaseClient, owner: string, window: {
  startUtc: string; endUtcExclusive: string
}): Promise<OwnedMealTotalsRead> {
  const unavailable = { status: 'unavailable', count: null, totals: null } as const
  try {
    const { data, count: rawCount, error } = await db.from('meals').select(nutritionTotalFields, { count: 'exact' })
      .eq('user_id', owner).gte('meal_timestamp', window.startUtc).lt('meal_timestamp', window.endUtcExclusive)
      .order('meal_timestamp', { ascending: false }).order('id', { ascending: false }).limit(NUTRITION_TOTAL_LIMIT)
    if (error || !Array.isArray(data) || data.length > NUTRITION_TOTAL_LIMIT) return unavailable

    const start = Date.parse(window.startUtc), end = Date.parse(window.endUtcExclusive)
    const ids = new Set<string>()
    for (const row of data) {
      if (row?.user_id !== owner || typeof row.id !== 'string' || !row.id || ids.has(row.id)) return unavailable
      const at = typeof row.meal_timestamp === 'string' ? Date.parse(row.meal_timestamp) : NaN
      if (!(at >= start && at < end)) return unavailable
      ids.add(row.id)
    }
    // PostgREST clients may represent an unknown Content-Range total as NaN.
    const count = Number.isSafeInteger(rawCount) ? rawCount : null
    if (count !== null && count < data.length) return unavailable

    const valid = data.flatMap(row => {
      const protein = readStoredDecimal(row.total_protein), carbs = readStoredDecimal(row.total_carbs)
      const fat = readStoredDecimal(row.total_fat), calories = readStoredDecimal(row.total_calories)
      if (protein === null || protein < 0 || carbs === null || carbs < 0 ||
        fat === null || fat < 0 || calories === null || calories < 0) return []
      return [{ total_protein: protein, total_carbs: carbs, total_fat: fat, total_calories: calories }]
    })
    const complete = count === data.length && valid.length === data.length
    if (!complete && !valid.length) return { ...unavailable, count }

    const totals = calculateDailyTotals(valid)
    if (!Object.values(totals).every(Number.isFinite)) return { ...unavailable, count }
    return { status: !complete ? 'partial' : count === 0 ? 'no_records' : 'available', count, totals }
  } catch {
    return unavailable
  }
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
