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

type SupabaseServerClient = Awaited<ReturnType<typeof createServerClient>>

interface TemplateRow {
  version: number
  schema_version: number
  template: unknown
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

    async getFacts(userId, localDate): Promise<DashboardNarrativeFacts> {
      const [contextResult, recordsResult] = await Promise.all([
        supabase.rpc('get_programming_readiness_context', {
          p_user_id: userId,
          p_days: 7,
        }),
        supabase
          .from('personal_records')
          .select('exercise, pr_type, value, achieved_at')
          .eq('user_id', userId)
          .order('achieved_at', { ascending: false })
          .limit(5),
      ])

      if (contextResult.error) {
        throw new Error(`Failed to fetch dashboard context: ${contextResult.error.message}`)
      }
      if (recordsResult.error) {
        throw new Error(`Failed to fetch dashboard PRs: ${recordsResult.error.message}`)
      }

      const days = ((contextResult.data ?? []) as Record<string, unknown>[]).map(mapDailyFact)
      const personalRecords = ((recordsResult.data ?? []) as Record<string, unknown>[])
        .map(mapPersonalRecord)
        .filter((record): record is DashboardPersonalRecordFact => record !== null)

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
