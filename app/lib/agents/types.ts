// ─── Enums & Literal Types ───────────────────────────────────────────

/** How the user submitted input */
export type InputMode = 'text' | 'voice' | 'photo' | 'file'

/** What the classifier determined the input to be */
export type InputType = 'workout_log' | 'meal_log' | 'question' | 'mixed' | 'unclear'

/** Domains for routing */
export type AgentDomain = 'trainer' | 'nutritionist' | 'socius'

/** Manager-level intent used for routing and context selection */
export type ManagerIntent =
  | 'log_workout'
  | 'log_meal'
  | 'ask_question'
  | 'programming_request'
  | 'mixed'
  | 'unclear'

/** Chat message roles */
export type ChatRole = 'user' | 'trainer' | 'nutritionist' | 'socius' | 'system'

/** Priority levels for Socius insights */
export type InsightPriority = 'urgent' | 'notable' | 'informational'

/** Meal timing options */
export type MealTiming = 'PRE_WORKOUT' | 'POST_WORKOUT' | 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'

/** Unified cross-domain pattern identifiers */
export type PatternId =
  | 'CAL_DEF'     // Caloric deficit on high-strain day
  | 'OVER_TRN'    // High volume + low recovery
  | 'NUT_PERF'    // Nutrition-performance correlation
  | 'REC_VOL'     // Recovery-volume mismatch
  | 'PRO_REC'     // Protein-recovery link
  | 'SLEEP_PERF'  // Sleep quality affecting performance
  | 'HRV_TREND'   // HRV trending up/down
  | 'STRAIN_NUT'  // Strain-nutrition mismatch
  | 'HYDRA'       // Hydration pattern
  | 'CON_PROG'    // Consistent progression

// ─── Supporting Data Types ───────────────────────────────────────────

export interface MacroTargets {
  protein: number
  carbs: number
  fat: number
  calories: number
  tolerance_pct: number
}

export interface MacroTotals {
  protein: number
  carbs: number
  fat: number
  calories: number
}

export interface UserDailyState {
  meals_logged: number
  macros_consumed: MacroTotals
  macros_remaining: MacroTotals
  workouts_logged: number
  latest_whoop_recovery: number | null
  latest_whoop_strain: number | null
}

export interface UserWeeklyState {
  days_elapsed: number
  actual: MacroTotals
  prorated_target: MacroTotals
  adherence_pct: { protein: number; carbs: number; fat: number; calories: number }
  overall_status: 'on-track' | 'ahead' | 'behind'
}

export interface MealItem {
  food: string
  portion: string
  protein: number
  carbs: number
  fat: number
  calories: number
}

export interface MealSummary {
  id: string
  timestamp: string
  timing: MealTiming | null
  items: MealItem[]
  totals: MacroTotals
}

export interface Movement {
  name: string
  reps?: number
  weight?: string
  distance?: string
}

export interface WorkoutBlock {
  block_type: 'AMRAP' | 'FOR_TIME' | 'EMOM' | 'STRENGTH' | 'CARDIO'
  duration_min?: number
  movements: Movement[]
  score?: { rounds?: number; extra_reps?: number; time_s?: number }
  rx_status?: 'RX' | 'SCALED'
}

export interface RecentWorkout {
  id: string
  date: string
  input_text: string
  blocks: WorkoutBlock[]
  primary_score: string | null
  rpe: number | null
  tags: string[]
}

export interface BenchmarkPR {
  benchmark_name: string
  score_value: number
  score_display: string
  date: string
  rx_status: string
}

export interface ThirtyDaySummary {
  workout_count: number
  workout_types: { metcon: number; strength: number; cardio: number; emom: number }
  avg_rpe: number | null
  total_meals: number
  avg_daily_protein: number
  avg_daily_calories: number
  pr_count: number
  whoop_avg_recovery: number | null
  whoop_avg_sleep_score: number | null
}

export interface DataAvailability {
  has_workouts: boolean
  has_meals: boolean
  has_whoop: boolean
  has_targets: boolean
  workout_days: number
  meal_days: number
}

/** Manager-selected retrieval request for downstream agents */
export interface ManagerContextRequest {
  user_goals: boolean
  recent_training_days: number
  recent_nutrition_days: number
  recent_recovery_days: number
  include_prs: boolean
  include_today_program: boolean
  include_daily_context: boolean
}

/** Manager output: routing plus explicit context budget */
export interface ManagerDecision {
  intent: ManagerIntent
  agents: AgentDomain[]
  context_request: ManagerContextRequest
  follow_up_needed: boolean
  follow_up_reason?: string
  confidence: number
}

/** One compact daily row for programming decisions */
export interface DailyProgrammingContext {
  date: string
  workout_count: number
  workout_summary: string | null
  strength_blocks: number
  metcon_blocks: number
  cardio_blocks: number
  avg_rpe: number | null
  total_protein: number
  total_carbs: number
  total_fat: number
  total_calories: number
  protein_pct_target: number | null
  calorie_pct_target: number | null
  recovery_score: number | null
  hrv_rmssd_milli: number | null
  resting_heart_rate: number | null
  sleep_score: number | null
  sleep_efficiency_pct: number | null
  strain: number | null
}

/** Structured context used by Socius and future programming synthesis */
export interface ProgrammingReadinessContext {
  generated_at: string
  days: DailyProgrammingContext[]
  summary: {
    day_count: number
    workout_days: number
    nutrition_days: number
    recovery_days: number
    avg_recovery: number | null
    avg_sleep_score: number | null
    avg_strain: number | null
    avg_protein_pct_target: number | null
    avg_calorie_pct_target: number | null
  }
}

export interface RecentInsight {
  id: string
  pattern_id: PatternId
  priority: InsightPriority
  confidence: number
  content: string
  created_at: string
}

// ─── Context Types (Inheritance-Based) ───────────────────────────────

/** User profile data for personalized agent responses */
export interface UserProfile {
  fitness_goals: string[]
  activity_level: string
  body_metrics: Record<string, unknown>
  preferences: Record<string, unknown>
}

/** Shared base context assembled for every agent call */
export interface PassiveContext {
  user_id: string
  targets: MacroTargets
  today: UserDailyState
  week: UserWeeklyState
  recent_chat: ChatMessage[]
  pending_insights: RecentInsight[]
  current_time: string        // e.g., "6:30 PM" (local time)
  day_of_week: string         // e.g., "Monday"
  current_date: string        // e.g., "2026-02-28" (YYYY-MM-DD, user's local date)
  has_whoop: boolean
  user_profile?: UserProfile  // User's goals, activity level, body metrics
}

/** Trainer gets workout history, PRs, program, and movement aliases */
export interface TrainerContext extends PassiveContext {
  recent_workouts: RecentWorkout[]
  benchmark_prs: BenchmarkPR[]
  todays_program: string | null
  movement_aliases: Record<string, string>
}

/** Nutritionist gets today's meals, portion defaults, and user portion history */
export interface NutritionistContext extends PassiveContext {
  todays_meals: MealSummary[]
  portion_defaults: Record<string, string>
  user_portion_history: Record<string, string> | null
}

/** Socius gets 30-day summary, recent insights, and data availability */
export interface SociusContext extends PassiveContext {
  thirty_day_summary: ThirtyDaySummary
  recent_insights: RecentInsight[]
  data_availability: DataAvailability
  programming_context?: ProgrammingReadinessContext
}

// ─── Classifier Types ────────────────────────────────────────────────

/** Metadata extracted by the Classifier */
export interface ExtractedContext {
  date?: string              // ISO date if mentioned
  meal_timing?: MealTiming
  has_portions: boolean
  has_score: boolean
  is_benchmark: boolean
  benchmark_name?: string
}

/** Classifier output */
export interface ClassificationResult {
  input_type: InputType
  domains: AgentDomain[]
  confidence: number         // 0.0–1.0 numeric
  context: ExtractedContext
}

// ─── Request/Response Types ──────────────────────────────────────────

/** What the client sends to /api/agent/process */
export interface AgentRequest {
  content: string            // Text content or transcription
  input_mode: InputMode
  input_type?: InputType     // Optional hint: 'workout_log', 'meal_log', 'query', etc.
  photo_url?: string         // Public URL of an already-uploaded photo
  photo_data?: string        // Base64 or storage URL
  audio_data?: string        // Base64 audio for transcription
  tz_offset?: number         // User's local timezone offset in minutes (local − UTC, e.g. CST = -360)
  manager_decision?: ManagerDecision // Server-attached routing/context contract
}

/** Smart default that was applied */
export interface SmartDefault {
  field: string              // e.g., "rpe", "weight", "portion"
  assumed_value: string      // e.g., "8", "225 lb", "1 palm"
  source: string             // e.g., "estimated from intensity", "last session"
}

/** Individual message in the response */
export interface AgentMessage {
  role: ChatRole
  content: string
  domain?: AgentDomain
  confidence?: number
  related_entity_id?: string
  related_entity_type?: 'workout' | 'meal' | 'insight'
  smart_defaults?: SmartDefault[]
}

/** Full response from /api/agent/process */
export interface AgentResponse {
  messages: AgentMessage[]
  classification: ClassificationResult
  manager_decision?: ManagerDecision
  processing_time_ms: number
}

// ─── Agent-Specific Response Types ───────────────────────────────────

export interface TrainerResponse {
  message: string
  workout?: {
    blocks: WorkoutBlock[]
    primary_score: string | null
    rpe: number | null
    tags: string[]
  }
  new_prs?: BenchmarkPR[]
  smart_defaults?: SmartDefault[]
  confidence: number
}

export interface NutritionistResponse {
  message: string
  meal?: {
    items: MealItem[]
    totals: MacroTotals
    timing: MealTiming
  }
  remaining_budget: MacroTotals
  week_status: UserWeeklyState
  smart_defaults?: SmartDefault[]
  confidence: number
}

export interface SociusResponse {
  message: string
  insights?: RecentInsight[]
  data_points?: Record<string, unknown>
  confidence: number
}

// ─── Chat Persistence Types ──────────────────────────────────────────

/** Persisted chat message (maps to chat_messages table) */
export interface ChatMessage {
  id: string
  user_id: string
  role: ChatRole
  content: string
  input_mode: InputMode | null
  input_type: InputType | null
  domain: AgentDomain | null
  confidence: number | null
  related_entity_id: string | null
  related_entity_type: string | null
  is_compacted: boolean
  created_at: string
}

/** Persisted insight (maps to insights table) */
export interface Insight {
  id: string
  user_id: string
  pattern_id: PatternId
  priority: InsightPriority
  confidence: number         // 0.0–1.0 numeric
  content: string
  data_context: Record<string, unknown>
  surfaced_at: string | null
  dismissed_at: string | null
  created_at: string
}

/** Compacted chat summary */
export interface ChatCompactionSummary {
  original_message_count: number
  summary: string
  key_facts: string[]       // PRs, corrections, important decisions
  compacted_at: string
}
