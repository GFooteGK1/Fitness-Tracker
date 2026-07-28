import type { createServerClient } from '@/app/lib/auth/supabase-server'
import type { DashboardNarrativeStore } from '@/app/lib/dashboard-narrative-service'
import type {
  DashboardDailyFact,
  DashboardNarrativeFacts,
  DashboardPersonalRecordFact,
} from '@/app/lib/dashboard-narrative'
import {
  DEFAULT_DASHBOARD_VIEW_TEMPLATE,
  validateViewTemplate,
} from '@/app/lib/view-templates'
import {
  formatUTCAsLocalDateWithOffset,
  localDateToUTCEnd,
  localDateToUTCStart,
} from '@/app/lib/timezone-utils'

type SupabaseServerClient = Awaited<ReturnType<typeof createServerClient>>

interface TemplateRow {
  version: number
  schema_version: number
  template: unknown
}

interface PersonalRecordRow extends Record<string, unknown> {
  id: string
  workout_id: string | null
  exercise: string
  pr_type: string
  value: unknown
  achieved_at: string
}

interface MealFactRow extends Record<string, unknown> {
  meal_timestamp: string
  total_protein: unknown
  total_carbs: unknown
  total_fat: unknown
  total_calories: unknown
}

function mapTemplate(row: TemplateRow | null) {
  if (!row) return null
  const validated = validateViewTemplate(row.template)
  if (
    !validated.ok ||
    validated.value.schemaVersion !== row.schema_version ||
    !Number.isInteger(row.version) ||
    row.version < 1
  ) throw new Error('Stored dashboard view template is invalid')
  return { version: row.version, template: validated.value }
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function numberOrZero(value: unknown): number {
  return numberOrNull(value) ?? 0
}

function mapDailyFact(row: Record<string, unknown>): DashboardDailyFact {
  return {
    date: String(row.date),
    workoutCount: numberOrZero(row.workout_count),
    strengthBlocks: numberOrZero(row.strength_blocks),
    metconBlocks: numberOrZero(row.metcon_blocks),
    cardioBlocks: numberOrZero(row.cardio_blocks),
    avgRpe: numberOrNull(row.avg_rpe),
    mealCount: numberOrZero(row.meal_count),
    totalProtein: numberOrZero(row.total_protein),
    totalCarbs: numberOrZero(row.total_carbs),
    totalFat: numberOrZero(row.total_fat),
    totalCalories: numberOrZero(row.total_calories),
    proteinPctTarget: numberOrNull(row.protein_pct_target),
    caloriePctTarget: numberOrNull(row.calorie_pct_target),
    recoveryScore: numberOrNull(row.recovery_score),
    sleepScore: numberOrNull(row.sleep_score),
    strain: numberOrNull(row.strain),
  }
}

function mapPersonalRecord(row: Record<string, unknown>): DashboardPersonalRecordFact | null {
  const value = numberOrNull(row.value)
  if (
    typeof row.exercise !== 'string' ||
    typeof row.pr_type !== 'string' ||
    typeof row.achieved_at !== 'string' ||
    value === null
  ) return null
  return {
    exercise: row.exercise,
    prType: row.pr_type,
    value,
    achievedAt: row.achieved_at.slice(0, 10),
  }
}

function addUtcDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + days))
  return value.toISOString().slice(0, 10)
}

function emptyDailyFact(date: string): DashboardDailyFact {
  return {
    date,
    workoutCount: 0,
    strengthBlocks: 0,
    metconBlocks: 0,
    cardioBlocks: 0,
    avgRpe: null,
    mealCount: 0,
    totalProtein: 0,
    totalCarbs: 0,
    totalFat: 0,
    totalCalories: 0,
    proteinPctTarget: null,
    caloriePctTarget: null,
    recoveryScore: null,
    sleepScore: null,
    strain: null,
  }
}

function withoutUtcNutrition(fact: DashboardDailyFact): DashboardDailyFact {
  return {
    ...fact,
    mealCount: 0,
    totalProtein: 0,
    totalCarbs: 0,
    totalFat: 0,
    totalCalories: 0,
    proteinPctTarget: null,
    caloriePctTarget: null,
  }
}

function hasDailyData(fact: DashboardDailyFact): boolean {
  return fact.workoutCount > 0 || fact.mealCount > 0 ||
    fact.recoveryScore !== null || fact.sleepScore !== null || fact.strain !== null
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

function recentPersonalRecords(rows: PersonalRecordRow[]): DashboardPersonalRecordFact[] {
  const unique = new Map<string, PersonalRecordRow>()

  for (const row of rows) {
    const value = numberOrNull(row.value)
    if (value === null) continue

    const key = row.workout_id
      ? `${row.workout_id}:${row.exercise.trim().toLowerCase()}:${row.pr_type}`
      : `row:${row.id}`
    const existing = unique.get(key)
    if (!existing) {
      unique.set(key, row)
      continue
    }

    const existingValue = numberOrNull(existing.value)
    const isBetter = row.pr_type === 'time'
      ? existingValue === null || value < existingValue
      : existingValue === null || value > existingValue
    if (isBetter) unique.set(key, row)
  }

  return [...unique.values()]
    .map(mapPersonalRecord)
    .filter((record): record is DashboardPersonalRecordFact => record !== null)
    .slice(0, 5)
}

export function createDashboardNarrativeStore(
  supabase: SupabaseServerClient,
): DashboardNarrativeStore {
  return {
    async getTemplate(userId) {
      const { data: userRow, error: userError } = await supabase
        .from('view_templates')
        .select('version, schema_version, template')
        .eq('user_id', userId)
        .eq('view_type', 'dashboard')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (userError) throw new Error(`Failed to fetch dashboard view template: ${userError.message}`)
      const userTemplate = mapTemplate(userRow as TemplateRow | null)
      if (userTemplate) return userTemplate

      const { data: defaultRow, error: defaultError } = await supabase
        .from('view_templates')
        .select('version, schema_version, template')
        .is('user_id', null)
        .eq('view_type', 'dashboard')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (defaultError) throw new Error(`Failed to fetch default dashboard template: ${defaultError.message}`)
      return mapTemplate(defaultRow as TemplateRow | null) ?? {
        version: 1,
        template: DEFAULT_DASHBOARD_VIEW_TEMPLATE,
      }
    },

    async getFacts(userId, localDate, timezoneOffset): Promise<DashboardNarrativeFacts> {
      const firstLocalDate = addUtcDays(localDate, -6)
      const [contextResult, recordsResult, mealsResult, targetsResult] = await Promise.all([
        supabase.rpc('get_programming_readiness_context', {
          p_user_id: userId,
          p_days: 7,
        }),
        supabase
          .from('personal_records')
          .select('id, workout_id, exercise, pr_type, value, achieved_at')
          .eq('user_id', userId)
          .order('achieved_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(50),
        supabase
          .from('meals')
          .select('meal_timestamp, total_protein, total_carbs, total_fat, total_calories')
          .eq('user_id', userId)
          .gte('meal_timestamp', localDateToUTCStart(firstLocalDate, timezoneOffset))
          .lte('meal_timestamp', localDateToUTCEnd(localDate, timezoneOffset))
          .order('meal_timestamp', { ascending: true }),
        supabase
          .from('daily_targets')
          .select('target_protein, target_calories')
          .eq('user_id', userId)
          .maybeSingle(),
      ])

      if (contextResult.error) {
        throw new Error(`Failed to fetch dashboard context: ${contextResult.error.message}`)
      }
      if (recordsResult.error) {
        throw new Error(`Failed to fetch dashboard PRs: ${recordsResult.error.message}`)
      }
      if (mealsResult.error) {
        throw new Error(`Failed to fetch dashboard meals: ${mealsResult.error.message}`)
      }
      if (targetsResult.error) {
        throw new Error(`Failed to fetch dashboard targets: ${targetsResult.error.message}`)
      }

      const daysByDate = new Map<string, DashboardDailyFact>()
      for (const row of (contextResult.data ?? []) as Record<string, unknown>[]) {
        const fact = withoutUtcNutrition(mapDailyFact(row))
        if (fact.date >= firstLocalDate && fact.date <= localDate) {
          daysByDate.set(fact.date, fact)
        }
      }

      for (const meal of (mealsResult.data ?? []) as MealFactRow[]) {
        if (typeof meal.meal_timestamp !== 'string') continue
        const date = formatUTCAsLocalDateWithOffset(meal.meal_timestamp, timezoneOffset)
        if (date < firstLocalDate || date > localDate) continue
        const fact = daysByDate.get(date) ?? emptyDailyFact(date)
        fact.mealCount += 1
        fact.totalProtein += numberOrZero(meal.total_protein)
        fact.totalCarbs += numberOrZero(meal.total_carbs)
        fact.totalFat += numberOrZero(meal.total_fat)
        fact.totalCalories += numberOrZero(meal.total_calories)
        daysByDate.set(date, fact)
      }

      const targetProtein = numberOrNull(targetsResult.data?.target_protein)
      const targetCalories = numberOrNull(targetsResult.data?.target_calories)
      for (const fact of daysByDate.values()) {
        if (fact.mealCount === 0) continue
        fact.proteinPctTarget = targetProtein && targetProtein > 0
          ? roundOneDecimal((fact.totalProtein / targetProtein) * 100)
          : null
        fact.caloriePctTarget = targetCalories && targetCalories > 0
          ? roundOneDecimal((fact.totalCalories / targetCalories) * 100)
          : null
      }

      const days = [...daysByDate.values()]
        .filter(hasDailyData)
        .sort((a, b) => b.date.localeCompare(a.date))
      const personalRecords = recentPersonalRecords(
        (recordsResult.data ?? []) as PersonalRecordRow[],
      )

      return { localDate, days, personalRecords }
    },

    async getCached(key) {
      const { data, error } = await supabase
        .from('view_compositions')
        .select('composition, created_at')
        .eq('user_id', key.userId)
        .eq('view_type', 'dashboard')
        .eq('local_date', key.localDate)
        .eq('template_version', key.templateVersion)
        .eq('template_fingerprint', key.templateFingerprint)
        .eq('facts_fingerprint', key.factsFingerprint)
        .maybeSingle()

      if (error) throw new Error(`Failed to fetch dashboard composition: ${error.message}`)
      if (!data) return null
      return {
        composition: data.composition,
        generatedAt: data.created_at,
      }
    },

    async saveCached(value) {
      const { error } = await supabase
        .from('view_compositions')
        .upsert({
          user_id: value.userId,
          view_type: 'dashboard',
          local_date: value.localDate,
          template_version: value.templateVersion,
          template_fingerprint: value.templateFingerprint,
          facts_fingerprint: value.factsFingerprint,
          composition: value.composition,
          provider: value.provider,
          model: value.model,
          created_at: value.generatedAt,
        }, {
          onConflict: 'user_id,view_type,local_date,template_version,template_fingerprint,facts_fingerprint',
          ignoreDuplicates: true,
        })

      if (error) throw new Error(`Failed to cache dashboard composition: ${error.message}`)
    },
  }
}
