import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  DailyProgrammingContext,
  ProgrammingReadinessContext
} from './types'

const MAX_PROGRAMMING_CONTEXT_DAYS = 90

interface DailyAgentContextRow {
  date: string
  workout_count: number | string | null
  workout_summary: string | null
  strength_blocks: number | string | null
  metcon_blocks: number | string | null
  cardio_blocks: number | string | null
  avg_rpe: number | string | null
  total_protein: number | string | null
  total_carbs: number | string | null
  total_fat: number | string | null
  total_calories: number | string | null
  protein_pct_target: number | string | null
  calorie_pct_target: number | string | null
  recovery_score: number | string | null
  hrv_rmssd_milli: number | string | null
  resting_heart_rate: number | string | null
  sleep_score: number | string | null
  sleep_efficiency_pct: number | string | null
  strain: number | string | null
}

export async function fetchProgrammingReadinessContext(
  supabase: SupabaseClient,
  userId: string,
  days = 30
): Promise<ProgrammingReadinessContext> {
  const boundedDays = Math.min(Math.max(Math.floor(days), 1), MAX_PROGRAMMING_CONTEXT_DAYS)
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - boundedDays)
  const cutoffDate = formatUTCDate(cutoff)

  const { data, error } = await supabase
    .from('daily_agent_context')
    .select(`
      date,
      workout_count,
      workout_summary,
      strength_blocks,
      metcon_blocks,
      cardio_blocks,
      avg_rpe,
      total_protein,
      total_carbs,
      total_fat,
      total_calories,
      protein_pct_target,
      calorie_pct_target,
      recovery_score,
      hrv_rmssd_milli,
      resting_heart_rate,
      sleep_score,
      sleep_efficiency_pct,
      strain
    `)
    .eq('user_id', userId)
    .gte('date', cutoffDate)
    .order('date', { ascending: false })
    .limit(boundedDays)

  if (error || !data) {
    return emptyProgrammingContext()
  }

  const daysContext = (data as DailyAgentContextRow[]).map(normalizeDailyRow)

  return {
    generated_at: new Date().toISOString(),
    days: daysContext,
    summary: summarizeDays(daysContext)
  }
}

export function summarizeDays(days: DailyProgrammingContext[]): ProgrammingReadinessContext['summary'] {
  return {
    day_count: days.length,
    workout_days: days.filter(day => day.workout_count > 0).length,
    nutrition_days: days.filter(day => day.total_calories > 0).length,
    recovery_days: days.filter(day => day.recovery_score !== null).length,
    avg_recovery: averageNullable(days.map(day => day.recovery_score)),
    avg_sleep_score: averageNullable(days.map(day => day.sleep_score)),
    avg_strain: averageNullable(days.map(day => day.strain)),
    avg_protein_pct_target: averageNullable(days.map(day => day.protein_pct_target)),
    avg_calorie_pct_target: averageNullable(days.map(day => day.calorie_pct_target))
  }
}

function normalizeDailyRow(row: DailyAgentContextRow): DailyProgrammingContext {
  return {
    date: row.date,
    workout_count: toNumber(row.workout_count) ?? 0,
    workout_summary: row.workout_summary,
    strength_blocks: toNumber(row.strength_blocks) ?? 0,
    metcon_blocks: toNumber(row.metcon_blocks) ?? 0,
    cardio_blocks: toNumber(row.cardio_blocks) ?? 0,
    avg_rpe: toNumber(row.avg_rpe),
    total_protein: toNumber(row.total_protein) ?? 0,
    total_carbs: toNumber(row.total_carbs) ?? 0,
    total_fat: toNumber(row.total_fat) ?? 0,
    total_calories: toNumber(row.total_calories) ?? 0,
    protein_pct_target: toNumber(row.protein_pct_target),
    calorie_pct_target: toNumber(row.calorie_pct_target),
    recovery_score: toNumber(row.recovery_score),
    hrv_rmssd_milli: toNumber(row.hrv_rmssd_milli),
    resting_heart_rate: toNumber(row.resting_heart_rate),
    sleep_score: toNumber(row.sleep_score),
    sleep_efficiency_pct: toNumber(row.sleep_efficiency_pct),
    strain: toNumber(row.strain)
  }
}

function emptyProgrammingContext(): ProgrammingReadinessContext {
  return {
    generated_at: new Date().toISOString(),
    days: [],
    summary: {
      day_count: 0,
      workout_days: 0,
      nutrition_days: 0,
      recovery_days: 0,
      avg_recovery: null,
      avg_sleep_score: null,
      avg_strain: null,
      avg_protein_pct_target: null,
      avg_calorie_pct_target: null
    }
  }
}

function toNumber(value: number | string | null): number | null {
  if (value === null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function averageNullable(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => value !== null)
  if (numeric.length === 0) return null
  const avg = numeric.reduce((sum, value) => sum + value, 0) / numeric.length
  return Math.round(avg * 10) / 10
}

function formatUTCDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}
