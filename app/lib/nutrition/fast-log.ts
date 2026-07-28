import type { FoodItem, MacroTotals } from '@/app/lib/types/food-tracking'

export interface MealHistoryRow {
  id: string
  meal_timestamp: string
  items: unknown
  total_protein: number | string
  total_carbs: number | string
  total_fat: number | string
  total_calories: number | string
  needs_review?: boolean | null
  manual_override?: boolean | null
  reviewed_at?: string | null
}

export interface CommonMeal {
  signature: string
  sourceMealId: string
  title: string
  items: FoodItem[]
  totals: MacroTotals
  timesLogged: number
  lastLoggedAt: string
  needsReview: boolean
}

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isFoodItem(value: unknown): value is FoodItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<FoodItem>
  return typeof item.food === 'string' && normalizedText(item.food).length > 0 &&
    typeof item.portion === 'string' && normalizedText(item.portion).length > 0 &&
    isFiniteNonNegative(item.protein) &&
    isFiniteNonNegative(item.carbs) &&
    isFiniteNonNegative(item.fat) &&
    isFiniteNonNegative(item.calories)
}

function numericTotal(value: number | string): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? rounded(parsed) : null
}

export function buildMealSignature(items: FoodItem[]): string {
  const canonicalItems = items.map(item => ({
    food: normalizedText(item.food),
    portion: normalizedText(item.portion),
    protein: rounded(item.protein),
    carbs: rounded(item.carbs),
    fat: rounded(item.fat),
    calories: rounded(item.calories),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))

  return JSON.stringify(canonicalItems)
}

function mealTitle(items: FoodItem[]): string {
  const names = items.map(item => item.food.trim()).filter(Boolean)
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`
}

function validatedRow(row: MealHistoryRow): {
  row: MealHistoryRow
  items: FoodItem[]
  totals: MacroTotals
  timestamp: number
} | null {
  if (!row.id || !Array.isArray(row.items) || row.items.length === 0 || !row.items.every(isFoodItem)) {
    return null
  }

  const timestamp = Date.parse(row.meal_timestamp)
  const protein = numericTotal(row.total_protein)
  const carbs = numericTotal(row.total_carbs)
  const fat = numericTotal(row.total_fat)
  const calories = numericTotal(row.total_calories)
  if (!Number.isFinite(timestamp) || protein === null || carbs === null || fat === null || calories === null) {
    return null
  }

  return {
    row,
    items: row.items.map(item => ({ ...item })),
    totals: { protein, carbs, fat, calories },
    timestamp,
  }
}

/**
 * Groups only exact reviewed meal snapshots. Frequency wins, followed by the
 * most recent log and then a stable signature tie-break. No model call or
 * fuzzy clustering is involved.
 */
export function rankCommonMeals(rows: MealHistoryRow[], limit = 6): CommonMeal[] {
  const boundedLimit = Math.max(1, Math.min(12, Math.floor(limit)))
  const groups = new Map<string, {
    count: number
    latest: NonNullable<ReturnType<typeof validatedRow>>
  }>()

  for (const candidate of rows) {
    const valid = validatedRow(candidate)
    if (!valid || candidate.needs_review === true) continue

    const signature = buildMealSignature(valid.items)
    const existing = groups.get(signature)
    if (!existing) {
      groups.set(signature, { count: 1, latest: valid })
      continue
    }

    existing.count += 1
    if (valid.timestamp > existing.latest.timestamp ||
      (valid.timestamp === existing.latest.timestamp && valid.row.id.localeCompare(existing.latest.row.id) > 0)) {
      existing.latest = valid
    }
  }

  return [...groups.entries()]
    .map(([signature, group]) => ({
      signature,
      sourceMealId: group.latest.row.id,
      title: mealTitle(group.latest.items),
      items: group.latest.items,
      totals: group.latest.totals,
      timesLogged: group.count,
      lastLoggedAt: group.latest.row.meal_timestamp,
      needsReview: Boolean(group.latest.row.needs_review),
    }))
    .sort((left, right) =>
      right.timesLogged - left.timesLogged ||
      Date.parse(right.lastLoggedAt) - Date.parse(left.lastLoggedAt) ||
      left.signature.localeCompare(right.signature)
    )
    .slice(0, boundedLimit)
}
