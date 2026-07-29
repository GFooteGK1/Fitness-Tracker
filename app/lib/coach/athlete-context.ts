import type { SupabaseClient } from '@supabase/supabase-js'
import { COACH_REFERENCE_MANIFEST } from './reference'
import { COMPLETE_PROGRAMMING_POLICY_VERSION } from './programming-policy'
import type {
  ActiveCoachProgramSummary,
  CoachMemorySummary,
  CoachRuntimeContext,
  CoachStrengthAssessmentSummary,
  EightWeekIntent,
  EightWeekRole,
  LoadUnit,
  SupportedRepMax
} from './types'

const MAX_ASSESSMENTS = 20
const MAX_MEMORIES = 30
const MAX_UPCOMING_SESSIONS = 16

interface StrengthAssessmentRow {
  id: string
  movement: string
  variation: string | null
  load: number | string
  unit: string
  reps: number | string
  assessed_on: string
  is_true_rep_max: boolean
  rir: number | string | null
  rpe: number | string | null
  athlete_confidence: number | string
  estimated_1rm: number | string
  estimate_kind: string
  calculator_version: string
}

interface CoachMemoryRow {
  id: string
  memory_key: string
  kind: string
  content: unknown
  confidence: number | string
  confirmed_at: string
  version: number | string
}

interface TrainingProgramRow {
  id: string
  title: string
  goal_summary: string
  start_date: string
  end_date: string
  active_plan_version_id: string | null
}

interface TrainingPlanVersionRow {
  id: string
  version: number | string
  reference_version: string
  policy_version: string
  intent: unknown
}

interface PrescribedSessionRow {
  id: string
  week_number: number | string
  session_index: number | string
  scheduled_date: string | null
  prescription: unknown
  status: string
}

export async function fetchCoachRuntimeContext(
  supabase: SupabaseClient,
  userId: string,
  referenceDate = new Date()
): Promise<CoachRuntimeContext> {
  const [assessmentResult, memoryResult, programResult] = await Promise.all([
    supabase
      .from('coach_strength_assessments')
      .select(`
        id,
        movement,
        variation,
        load,
        unit,
        reps,
        assessed_on,
        is_true_rep_max,
        rir,
        rpe,
        athlete_confidence,
        estimated_1rm,
        estimate_kind,
        calculator_version
      `)
      .eq('user_id', userId)
      .order('assessed_on', { ascending: false })
      .limit(MAX_ASSESSMENTS),
    supabase
      .from('coach_memories')
      .select('id, memory_key, kind, content, confidence, confirmed_at, version')
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false })
      .limit(MAX_MEMORIES),
    supabase
      .from('training_programs')
      .select('id, title, goal_summary, start_date, end_date, active_plan_version_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('start_date', { ascending: false })
      .limit(1)
  ])

  const storageAvailable = !assessmentResult.error && !memoryResult.error && !programResult.error

  const assessments = assessmentResult.error
    ? []
    : ((assessmentResult.data ?? []) as StrengthAssessmentRow[])
      .map(normalizeAssessment)
      .filter((assessment): assessment is CoachStrengthAssessmentSummary => assessment !== null)

  const memories = memoryResult.error
    ? []
    : ((memoryResult.data ?? []) as CoachMemoryRow[])
      .map(normalizeMemory)
      .filter((memory): memory is CoachMemorySummary => memory !== null)

  const program = !programResult.error && programResult.data
    ? (programResult.data[0] as TrainingProgramRow | undefined)
    : undefined

  const activeProgram = program?.active_plan_version_id
    ? await fetchActiveProgram(supabase, userId, program, referenceDate)
    : null

  return {
    generatedAt: new Date().toISOString(),
    storageAvailable: storageAvailable && (!program?.active_plan_version_id || activeProgram !== null),
    doctrineVersion: COACH_REFERENCE_MANIFEST.doctrineVersion,
    policyVersion: COMPLETE_PROGRAMMING_POLICY_VERSION,
    assessments,
    memories,
    activeProgram
  }
}

export function emptyCoachRuntimeContext(): CoachRuntimeContext {
  return {
    generatedAt: new Date().toISOString(),
    storageAvailable: false,
    doctrineVersion: COACH_REFERENCE_MANIFEST.doctrineVersion,
    policyVersion: COMPLETE_PROGRAMMING_POLICY_VERSION,
    assessments: [],
    memories: [],
    activeProgram: null
  }
}

async function fetchActiveProgram(
  supabase: SupabaseClient,
  userId: string,
  program: TrainingProgramRow,
  referenceDate: Date
): Promise<ActiveCoachProgramSummary | null> {
  if (!program.active_plan_version_id) return null

  const [versionResult, sessionResult] = await Promise.all([
    supabase
      .from('training_plan_versions')
      .select('id, version, reference_version, policy_version, intent')
      .eq('id', program.active_plan_version_id)
      .eq('user_id', userId)
      .limit(1),
    supabase
      .from('prescribed_sessions')
      .select('id, week_number, session_index, scheduled_date, prescription, status')
      .eq('plan_version_id', program.active_plan_version_id)
      .eq('user_id', userId)
      .order('week_number', { ascending: true })
      .order('session_index', { ascending: true })
      .limit(MAX_UPCOMING_SESSIONS)
  ])

  if (versionResult.error || sessionResult.error || !versionResult.data?.[0]) {
    return null
  }

  const version = versionResult.data[0] as TrainingPlanVersionRow
  const weeks = normalizeWeeks(version.intent)
  const currentWeek = calculateCurrentWeek(program.start_date, program.end_date, referenceDate)
  const currentWeekRole: EightWeekRole | null = currentWeek === null
    ? null
    : weeks.find(week => week.week === currentWeek)?.role ?? null

  return {
    id: program.id,
    title: program.title,
    goalSummary: program.goal_summary,
    startDate: program.start_date,
    endDate: program.end_date,
    activePlanVersionId: program.active_plan_version_id,
    planVersion: toFiniteNumber(version.version) ?? 0,
    currentWeek,
    currentWeekRole,
    referenceVersion: version.reference_version,
    policyVersion: version.policy_version,
    weeks,
    upcomingSessions: ((sessionResult.data ?? []) as PrescribedSessionRow[])
      .map(normalizeSession)
      .filter((session): session is ActiveCoachProgramSummary['upcomingSessions'][number] => session !== null)
  }
}

function normalizeWeeks(value: unknown): EightWeekIntent[] {
  if (!isRecord(value) || !Array.isArray(value.weeks)) return []

  const roles: readonly EightWeekRole[] = [
    'establish',
    'build',
    'develop',
    'deload_review',
    'reestablish',
    'deload_assess'
  ]
  const weeks = value.weeks.flatMap((week): EightWeekIntent[] => {
    if (
      !isRecord(week)
      || !Number.isInteger(week.week)
      || (week.week as number) < 1
      || (week.week as number) > 8
      || !roles.includes(week.role as EightWeekRole)
      || typeof week.intent !== 'string'
      || typeof week.reviewRequired !== 'boolean'
    ) return []

    return [{
      week: week.week as number,
      role: week.role as EightWeekRole,
      intent: week.intent,
      reviewRequired: week.reviewRequired
    }]
  })

  return weeks.length === 8 && new Set(weeks.map(week => week.week)).size === 8
    ? weeks.sort((a, b) => a.week - b.week)
    : []
}

function normalizeAssessment(row: StrengthAssessmentRow): CoachStrengthAssessmentSummary | null {
  const load = toFiniteNumber(row.load)
  const reps = toFiniteNumber(row.reps)
  const confidence = toFiniteNumber(row.athlete_confidence)
  const estimatedOneRepMax = toFiniteNumber(row.estimated_1rm)

  if (
    !row.id
    || !row.movement
    || load === null
    || ![1, 3, 5].includes(reps ?? 0)
    || confidence === null
    || estimatedOneRepMax === null
    || (row.unit !== 'lb' && row.unit !== 'kg')
  ) {
    return null
  }

  return {
    id: row.id,
    movement: row.movement,
    variation: row.variation,
    load,
    unit: row.unit as LoadUnit,
    reps: reps as SupportedRepMax,
    assessedOn: row.assessed_on,
    isTrueRepMax: row.is_true_rep_max,
    rir: toFiniteNumber(row.rir),
    rpe: toFiniteNumber(row.rpe),
    athleteConfidence: confidence,
    estimatedOneRepMax,
    estimateKind: row.estimate_kind === 'reported_1rm' ? 'reported_1rm' : 'estimated_1rm',
    calculatorVersion: row.calculator_version
  }
}

function normalizeMemory(row: CoachMemoryRow): CoachMemorySummary | null {
  const confidence = toFiniteNumber(row.confidence)
  const version = toFiniteNumber(row.version)

  if (!row.id || !row.memory_key || confidence === null || version === null) {
    return null
  }

  return {
    id: row.id,
    memoryKey: row.memory_key,
    kind: row.kind,
    content: isRecord(row.content) ? row.content : {},
    confidence,
    confirmedAt: row.confirmed_at,
    version
  }
}

function normalizeSession(
  row: PrescribedSessionRow
): ActiveCoachProgramSummary['upcomingSessions'][number] | null {
  const weekNumber = toFiniteNumber(row.week_number)
  const sessionIndex = toFiniteNumber(row.session_index)

  if (!row.id || weekNumber === null || sessionIndex === null) return null

  return {
    id: row.id,
    weekNumber,
    sessionIndex,
    scheduledDate: row.scheduled_date,
    prescription: isRecord(row.prescription) ? row.prescription : {},
    status: row.status
  }
}

function calculateCurrentWeek(
  startDate: string,
  endDate: string,
  referenceDate: Date
): number | null {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  if (!start || !end) return null

  const referenceUtc = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate()
  )

  if (referenceUtc < start || referenceUtc > end) return null

  const elapsedDays = Math.floor((referenceUtc - start) / 86_400_000)
  return Math.min(8, Math.floor(elapsedDays / 7) + 1)
}

function parseDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = Date.parse(`${value}T00:00:00Z`)
  return Number.isNaN(parsed) ? null : parsed
}

function toFiniteNumber(value: number | string | null): number | null {
  if (value === null) return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
