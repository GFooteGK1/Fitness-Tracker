# Design Document: Multi-Agent System

## Overview

This design transforms SociusFit from a collection of separate tools into a unified conversational experience powered by three specialized agents (Trainer, Nutritionist, Socius) orchestrated by a fast Classifier. The architecture follows a passive-context approach — each agent receives pre-built context in its system prompt rather than fetching data on demand. A new `/v2` route provides a mobile-first chat interface while existing routes remain untouched.

Key design decisions:
- **Classifier uses Claude Haiku** for speed (~$0.001/call, <1s latency) while agents use Claude Sonnet 4 for quality
- **Passive context over active retrieval** — context is assembled once per request and injected into the system prompt, avoiding mid-conversation tool calls
- **Chat compaction** — older messages are summarized to keep context windows manageable
- **Sequential pipeline for multi-domain** — when multiple agents are needed, they run in sequence so later agents can see earlier responses
- **Branch-safe coexistence** — all new code lives under `/v2`, `/api/agent/`, and `app/lib/agents/` without touching existing routes
- **Inheritance-based context types** — `PassiveContext` as shared base, domain-specific contexts extend it with additional fields
- **Numeric confidence** — all confidence values are `number` (0.0–1.0), no string-based confidence levels
- **Function-based prompt builders** — prompts are functions that take typed context objects and return interpolated strings, not placeholder-based templates

## Architecture

```mermaid
flowchart TD
    subgraph V2_UI["V2 Chat UI (/v2)"]
        INPUT[Input Bar: text / voice / camera / file]
        CHAT[Chat Message Area]
        TABS[Bottom Nav: Chat | Insights | PRs]
    end

    INPUT -->|POST /api/agent/process| ROUTER[Agent Router]
    
    ROUTER --> AUTH{Auth Check}
    AUTH -->|401| REJECT[Reject]
    AUTH -->|OK| CLASSIFY[Classifier - Haiku]
    
    CLASSIFY -->|JSON classification| ROUTE{Route Decision}
    
    ROUTE -->|single domain, conf > 0.7| SINGLE[Single Agent]
    ROUTE -->|multi domain| PIPELINE[Sequential Pipeline]
    ROUTE -->|conf < 0.5| CLARIFY[Ask Clarification]
    
    SINGLE --> CTX_BUILD[Context Builder]
    PIPELINE --> CTX_BUILD
    
    CTX_BUILD -->|parallel DB queries| DB[(Supabase)]
    CTX_BUILD -->|assembled context| AGENT_CALL[Agent LLM Call - Sonnet 4]
    
    AGENT_CALL --> PERSIST[Chat Persistence Layer]
    PERSIST --> DB
    PERSIST --> RESPONSE[Response to Client]
    
    RESPONSE --> CHAT
    
    AGENT_CALL -->|workout/meal logged| SOCIUS_BG[Socius Background Check]
    SOCIUS_BG -->|pattern detected| INSIGHTS_DB[(insights table)]
    INSIGHTS_DB -->|urgent| BANNER[Insight Banner in UI]

    subgraph AGENTS["Domain Agents"]
        TRAINER[🏋️ Trainer]
        NUTRI[🥗 Nutritionist]
        SOCIUS[🔮 Socius]
    end
    
    AGENT_CALL --> TRAINER
    AGENT_CALL --> NUTRI
    AGENT_CALL --> SOCIUS
```

### Request Flow

1. User submits input via V2_UI (text, voice transcription, photo, or file)
2. `POST /api/agent/process` receives the request
3. Auth check via Supabase `getUser()`
4. Classifier (Haiku) analyzes input → returns `ClassificationResult`
5. Router evaluates confidence and domain(s)
6. Context Builder assembles passive context via `buildPassiveContext()` base + domain extension (parallel DB queries)
7. Check for urgent pending insights — prepend to response if found
8. Agent(s) called with system prompt containing full typed context
9. Agent response parsed — if it includes a structured action (log workout, log meal), execute it
10. All messages persisted to `chat_messages` (with both `input_mode` and `input_type`)
11. If a workout or meal was logged, trigger Socius background analysis (fire-and-forget)
12. Response returned to client

### Multi-Domain Pipeline

For inputs classified as multi-domain (~20% of requests):
1. Classify which domains are relevant (e.g., [trainer, nutritionist])
2. Call first agent with full context
3. Call second agent with full context + first agent's response appended
4. Return both responses as separate attributed messages

## Components and Interfaces

### Type Definitions (`app/lib/agents/types.ts`)

```typescript
// ─── Enums & Literal Types ───────────────────────────────────────────

/** How the user submitted input */
export type InputMode = 'text' | 'voice' | 'photo' | 'file'

/** What the classifier determined the input to be */
export type InputType = 'workout_log' | 'meal_log' | 'question' | 'mixed' | 'unclear'

/** Domains for routing */
export type AgentDomain = 'trainer' | 'nutritionist' | 'socius'

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

export interface RecentInsight {
  id: string
  pattern_id: PatternId
  priority: InsightPriority
  confidence: number
  content: string
  created_at: string
}

// ─── Context Types (Inheritance-Based) ───────────────────────────────

/** Shared base context assembled for every agent call */
export interface PassiveContext {
  user_id: string
  targets: MacroTargets
  today: UserDailyState
  week: UserWeeklyState
  recent_chat: ChatMessage[]
  pending_insights: RecentInsight[]
  current_time: string        // ISO timestamp
  day_of_week: string         // e.g., "Monday"
  has_whoop: boolean
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
  photo_data?: string        // Base64 or storage URL
  audio_data?: string        // Base64 audio for transcription
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
```

### Constants (`app/lib/agents/constants.ts`)

```typescript
/** Common CrossFit movement aliases for the Trainer */
export const MOVEMENT_ALIASES: Record<string, string> = {
  'PU': 'Pull-up', 'DL': 'Deadlift', 'BS': 'Back Squat',
  'FS': 'Front Squat', 'OHS': 'Overhead Squat', 'C&J': 'Clean and Jerk',
  'S2OH': 'Shoulder to Overhead', 'T2B': 'Toes to Bar',
  'K2E': 'Knees to Elbows', 'HSPU': 'Handstand Push-up',
  'MU': 'Muscle-up', 'DU': 'Double Under', 'SU': 'Single Under',
  'WB': 'Wall Ball', 'KB': 'Kettlebell Swing', 'GHD': 'GHD Sit-up',
  'PC': 'Power Clean', 'SC': 'Squat Clean', 'HPC': 'Hang Power Clean',
  'PP': 'Push Press', 'PJ': 'Push Jerk', 'SJ': 'Split Jerk',
  'RDL': 'Romanian Deadlift', 'SDHP': 'Sumo Deadlift High Pull',
  'BMU': 'Bar Muscle-up', 'RMU': 'Ring Muscle-up',
  'C2B': 'Chest to Bar', 'TTB': 'Toes to Bar'
}

/** Standard portion defaults for the Nutritionist */
export const PORTION_DEFAULTS: Record<string, string> = {
  'chicken breast': '6 oz (170g)',
  'rice': '1 cup cooked (200g)',
  'broccoli': '1 cup (150g)',
  'salmon': '6 oz (170g)',
  'sweet potato': '1 medium (150g)',
  'eggs': '2 large',
  'oatmeal': '1/2 cup dry (40g)',
  'greek yogurt': '1 cup (227g)',
  'banana': '1 medium (120g)',
  'avocado': '1/2 medium (75g)',
  'olive oil': '1 tbsp (14g)',
  'almonds': '1 oz (28g)',
  'steak': '8 oz (225g)',
  'ground beef': '6 oz (170g)',
  'pasta': '2 oz dry (56g)',
  'bread': '1 slice (30g)',
  'protein shake': '1 scoop (30g powder)'
}
```

### Classifier (`app/lib/agents/classifier.ts`)

Uses Claude Haiku for fast, cheap classification. Returns structured JSON only — no conversational output.

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { ClassificationResult, InputMode } from './types'

const CLASSIFIER_MODEL = 'claude-haiku-3-20241022'

export async function classifyInput(
  content: string,
  inputMode: InputMode
): Promise<ClassificationResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  
  const message = await anthropic.messages.create({
    model: CLASSIFIER_MODEL,
    max_tokens: 256,
    temperature: 0,
    system: CLASSIFIER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildClassifierInput(content, inputMode) }]
  })
  
  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return parseClassificationResult(text)
}
```

The classifier system prompt instructs the model to return JSON matching `ClassificationResult`. It includes examples of each input type and routing rules.

### Context Builder (`app/lib/agents/context-builder.ts`)

Assembles domain-specific context using an inheritance pattern. `buildPassiveContext()` is the base builder that all domain builders extend. All database queries run in parallel for minimal latency.

```typescript
import { createServerClient } from '@/app/lib/auth/supabase-server'
import {
  PassiveContext, TrainerContext, NutritionistContext, SociusContext,
  MacroTotals, UserDailyState, UserWeeklyState, MealSummary, RecentWorkout,
  BenchmarkPR, ThirtyDaySummary, DataAvailability, RecentInsight, ChatMessage
} from './types'
import { MOVEMENT_ALIASES, PORTION_DEFAULTS } from './constants'

// ─── Base Context Builder ────────────────────────────────────────────

export async function buildPassiveContext(userId: string): Promise<PassiveContext> {
  const supabase = await createServerClient()
  
  const [targets, todaysMeals, todaysWorkouts, whoopRecovery, whoopStrain,
         recentChat, pendingInsights, weekSummaries] = await Promise.all([
    fetchDailyTargets(supabase, userId),
    fetchTodaysMeals(supabase, userId),
    fetchTodaysWorkouts(supabase, userId),
    fetchLatestWhoopRecovery(supabase, userId),
    fetchLatestWhoopStrain(supabase, userId),
    fetchRecentChat(supabase, userId, 20),
    fetchPendingInsights(supabase, userId),
    fetchWeekToDateSummaries(supabase, userId)
  ])
  
  const consumed = aggregateMacros(todaysMeals)
  const remaining = calculateRemaining(consumed, targets)
  const week = calculateWeekAdherence(weekSummaries, targets)
  const now = new Date()
  
  return {
    user_id: userId,
    targets,
    today: {
      meals_logged: todaysMeals.length,
      macros_consumed: consumed,
      macros_remaining: remaining,
      workouts_logged: todaysWorkouts.length,
      latest_whoop_recovery: whoopRecovery?.score ?? null,
      latest_whoop_strain: whoopStrain?.score ?? null
    },
    week,
    recent_chat: recentChat,
    pending_insights: pendingInsights,
    current_time: now.toISOString(),
    day_of_week: now.toLocaleDateString('en-US', { weekday: 'long' }),
    has_whoop: whoopRecovery !== null || whoopStrain !== null
  }
}

// ─── Domain-Specific Builders ────────────────────────────────────────

export async function buildTrainerContext(userId: string): Promise<TrainerContext> {
  const supabase = await createServerClient()
  
  const [passive, recentWorkouts, benchmarkPrs, todaysProgram] = await Promise.all([
    buildPassiveContext(userId),
    fetchRecentWorkouts(supabase, userId, 7),
    fetchBenchmarkPRs(supabase, userId),
    fetchTodaysProgram(userId)
  ])
  
  return {
    ...passive,
    recent_workouts: recentWorkouts,
    benchmark_prs: benchmarkPrs,
    todays_program: todaysProgram,
    movement_aliases: MOVEMENT_ALIASES
  }
}

export async function buildNutritionistContext(userId: string): Promise<NutritionistContext> {
  const supabase = await createServerClient()
  
  const [passive, todaysMeals, portionHistory] = await Promise.all([
    buildPassiveContext(userId),
    fetchTodaysMealDetails(supabase, userId),
    fetchUserPortionHistory(supabase, userId)
  ])
  
  return {
    ...passive,
    todays_meals: todaysMeals,
    portion_defaults: PORTION_DEFAULTS,
    user_portion_history: portionHistory
  }
}

export async function buildSociusContext(userId: string): Promise<SociusContext> {
  const supabase = await createServerClient()
  
  const [passive, thirtyDaySummary, recentInsights, dataAvailability] = await Promise.all([
    buildPassiveContext(userId),
    fetchThirtyDaySummary(supabase, userId),
    fetchRecentInsightsDetailed(supabase, userId),
    fetchDataAvailability(supabase, userId)
  ])
  
  return {
    ...passive,
    thirty_day_summary: thirtyDaySummary,
    recent_insights: recentInsights,
    data_availability: dataAvailability
  }
}

// ─── Utility Functions ───────────────────────────────────────────────

export function aggregateMacros(meals: MealSummary[]): MacroTotals {
  return meals.reduce(
    (acc, m) => ({
      protein: acc.protein + m.totals.protein,
      carbs: acc.carbs + m.totals.carbs,
      fat: acc.fat + m.totals.fat,
      calories: acc.calories + m.totals.calories
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  )
}

export function calculateRemaining(consumed: MacroTotals, targets: MacroTargets): MacroTotals {
  return {
    protein: targets.protein - consumed.protein,
    carbs: targets.carbs - consumed.carbs,
    fat: targets.fat - consumed.fat,
    calories: targets.calories - consumed.calories
  }
}

export function calculateWeekAdherence(
  weekSummaries: MacroTotals[],
  targets: MacroTargets
): UserWeeklyState {
  const daysElapsed = weekSummaries.length || 1
  const actual = weekSummaries.reduce(
    (acc, d) => ({
      protein: acc.protein + d.protein,
      carbs: acc.carbs + d.carbs,
      fat: acc.fat + d.fat,
      calories: acc.calories + d.calories
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  )
  const prorated = {
    protein: targets.protein * daysElapsed,
    carbs: targets.carbs * daysElapsed,
    fat: targets.fat * daysElapsed,
    calories: targets.calories * daysElapsed
  }
  const pct = {
    protein: prorated.protein > 0 ? (actual.protein / prorated.protein) * 100 : 0,
    carbs: prorated.carbs > 0 ? (actual.carbs / prorated.carbs) * 100 : 0,
    fat: prorated.fat > 0 ? (actual.fat / prorated.fat) * 100 : 0,
    calories: prorated.calories > 0 ? (actual.calories / prorated.calories) * 100 : 0
  }
  const avgPct = (pct.protein + pct.carbs + pct.fat + pct.calories) / 4
  const tol = targets.tolerance_pct
  const overall_status = avgPct >= (100 - tol) && avgPct <= (100 + tol)
    ? 'on-track' : avgPct > (100 + tol) ? 'ahead' : 'behind'
  
  return { days_elapsed: daysElapsed, actual, prorated_target: prorated, adherence_pct: pct, overall_status }
}

export function calculateRecoveryTrend(recoveryScores: number[]): 'improving' | 'declining' | 'stable' {
  if (recoveryScores.length < 3) return 'stable'
  const recent = recoveryScores.slice(-3)
  const earlier = recoveryScores.slice(0, 3)
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
  const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length
  if (recentAvg - earlierAvg > 5) return 'improving'
  if (earlierAvg - recentAvg > 5) return 'declining'
  return 'stable'
}

export function getWeekStart(): Date {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday start
  const weekStart = new Date(now)
  weekStart.setDate(diff)
  weekStart.setHours(0, 0, 0, 0)
  return weekStart
}
```

### Agent Prompts (`app/lib/agents/prompts/`)

Each agent has a dedicated prompt file that exports a function-based prompt builder. The builder receives the full typed context object and returns an interpolated prompt string — no placeholder substitution.

**Trainer** (`prompts/trainer.ts`):
```typescript
import { TrainerContext } from '../types'

export function buildTrainerPrompt(ctx: TrainerContext): string {
  const workoutList = ctx.recent_workouts
    .map(w => `- ${w.date}: ${w.input_text} (RPE: ${w.rpe ?? 'N/A'})`)
    .join('\n')
  
  const prList = ctx.benchmark_prs
    .map(pr => `- ${pr.benchmark_name}: ${pr.score_display} (${pr.rx_status}, ${pr.date})`)
    .join('\n')
  
  const aliases = Object.entries(ctx.movement_aliases)
    .map(([k, v]) => `${k} → ${v}`)
    .join(', ')

  return `You are the SociusFit Trainer — an expert CrossFit and functional fitness coach.
You are encouraging but direct. You speak like a knowledgeable training partner.

## Current State
- Today: ${ctx.day_of_week}, ${ctx.current_time}
- Workouts logged today: ${ctx.today.workouts_logged}
- WHOOP Recovery: ${ctx.today.latest_whoop_recovery ?? 'N/A'}
- WHOOP Strain: ${ctx.today.latest_whoop_strain ?? 'N/A'}

## Recent Workouts (Last 7 Days)
${workoutList || 'No recent workouts'}

## Benchmark PRs
${prList || 'No PRs recorded yet'}

## Today's Program
${ctx.todays_program ?? 'No program loaded'}

## Movement Aliases
${aliases}

## Instructions
- Parse workouts into structured blocks (AMRAP, FOR_TIME, EMOM, STRENGTH, CARDIO)
- Detect benchmark workouts and check for new PRs against the PR list above
- If RPE is missing, estimate from workout intensity and flag as a smart default
- If weight is missing for a movement, check recent workouts for the last used weight
- Always clearly indicate any assumed/defaulted values
- For questions about workout history, answer conversationally using the data above
- Return a JSON action block when logging a workout, plus conversational text`
}
```

**Nutritionist** (`prompts/nutritionist.ts`):
```typescript
import { NutritionistContext } from '../types'

export function buildNutritionistPrompt(ctx: NutritionistContext): string {
  const mealList = ctx.todays_meals
    .map(m => {
      const items = m.items.map(i => `${i.food} (${i.portion})`).join(', ')
      return `- ${m.timing ?? 'unspecified'}: ${items} — P:${m.totals.protein}g C:${m.totals.carbs}g F:${m.totals.fat}g (${m.totals.calories} cal)`
    })
    .join('\n')

  return `You are the SociusFit Nutritionist — a sports nutritionist focused on performance fueling.
You are supportive and consistency-oriented. You focus on the bigger picture, not perfection.

## Current State
- Today: ${ctx.day_of_week}, ${ctx.current_time}
- Meals logged today: ${ctx.today.meals_logged}

## Daily Targets
- Protein: ${ctx.targets.protein}g | Carbs: ${ctx.targets.carbs}g | Fat: ${ctx.targets.fat}g | Calories: ${ctx.targets.calories}
- Tolerance: ±${ctx.targets.tolerance_pct}%

## Today's Meals
${mealList || 'No meals logged yet today'}

## Remaining Budget
- Protein: ${ctx.today.macros_remaining.protein}g | Carbs: ${ctx.today.macros_remaining.carbs}g | Fat: ${ctx.today.macros_remaining.fat}g | Calories: ${ctx.today.macros_remaining.calories}

## Week-to-Date (${ctx.week.days_elapsed} days)
- Status: ${ctx.week.overall_status}
- Protein: ${ctx.week.adherence_pct.protein.toFixed(0)}% | Carbs: ${ctx.week.adherence_pct.carbs.toFixed(0)}% | Fat: ${ctx.week.adherence_pct.fat.toFixed(0)}% | Calories: ${ctx.week.adherence_pct.calories.toFixed(0)}%

## Portion Defaults
${Object.entries(ctx.portion_defaults).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Instructions
- Parse meals and estimate macros from descriptions or photos
- When portions are missing, apply standard portion defaults and flag as smart defaults
- Always include remaining daily budget in your response
- Include week-to-date adherence status
- When on-track: brief reinforcing feedback
- When off-track: constructive guidance focused on getting back on track
- When a full week is available (7 days): provide end-of-week summary
- Infer meal_timing from time of day and workout proximity if not specified
- Validate macros (range checks, calorie consistency within 10%)
- Return a JSON action block when logging a meal, plus conversational text`
}
```

**Socius** (`prompts/socius.ts`):
```typescript
import { SociusContext } from '../types'

export function buildSociusPrompt(ctx: SociusContext): string {
  const summary = ctx.thirty_day_summary
  const avail = ctx.data_availability

  return `You are Socius — the SociusFit cross-domain analyst.
You are data-driven but approachable. You synthesize across workouts, nutrition, and recovery.

## Current State
- Today: ${ctx.day_of_week}, ${ctx.current_time}
- Data available: Workouts(${avail.workout_days}d) Meals(${avail.meal_days}d) WHOOP(${ctx.has_whoop ? 'yes' : 'no'})

## 30-Day Summary
- Workouts: ${summary.workout_count} (Metcon: ${summary.workout_types.metcon}, Strength: ${summary.workout_types.strength}, Cardio: ${summary.workout_types.cardio}, EMOM: ${summary.workout_types.emom})
- Avg RPE: ${summary.avg_rpe ?? 'N/A'}
- Meals: ${summary.total_meals} | Avg daily protein: ${summary.avg_daily_protein}g | Avg daily calories: ${summary.avg_daily_calories}
- PRs: ${summary.pr_count}
- WHOOP Avg Recovery: ${summary.whoop_avg_recovery ?? 'N/A'} | Avg Sleep Score: ${summary.whoop_avg_sleep_score ?? 'N/A'}

## Recent Insights
${ctx.recent_insights.map(i => `- [${i.priority}] ${i.pattern_id}: ${i.content}`).join('\n') || 'No recent insights'}

## Week-to-Date
- Status: ${ctx.week.overall_status}
- Adherence: P:${ctx.week.adherence_pct.protein.toFixed(0)}% C:${ctx.week.adherence_pct.carbs.toFixed(0)}% F:${ctx.week.adherence_pct.fat.toFixed(0)}% Cal:${ctx.week.adherence_pct.calories.toFixed(0)}%

## Pattern Library
CAL_DEF (caloric deficit on high-strain day), OVER_TRN (high volume + low recovery),
NUT_PERF (nutrition-performance correlation), REC_VOL (recovery-volume mismatch),
PRO_REC (protein-recovery link), SLEEP_PERF (sleep-performance link),
HRV_TREND (HRV trending), STRAIN_NUT (strain-nutrition mismatch),
HYDRA (hydration pattern), CON_PROG (consistent progression)

## Instructions
- Synthesize across all domains when answering questions
- For broad questions ("How am I doing?"), give a high-level summary across all domains
- For workout summaries, aggregate by type (metcon, strength, cardio) with counts and frequency
- For trend questions, analyze data over the requested period with supporting data points
- Cite specific data points to support your observations`
}
```


### Agent Router (`app/api/agent/process/route.ts`)

The unified endpoint that orchestrates the full flow, including urgent insight prepending, multi-domain handling, and async Socius triggering.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { AgentRequest, AgentResponse, AgentMessage, ClassificationResult } from '@/app/lib/agents/types'
import { classifyInput } from '@/app/lib/agents/classifier'
import { buildTrainerContext, buildNutritionistContext, buildSociusContext } from '@/app/lib/agents/context-builder'
import { persistMessages, fetchPendingUrgentInsights } from '@/app/lib/agents/chat-persistence'
import { triggerSociusBackground } from '@/app/lib/agents/socius-background'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const supabase = await createServerClient()
  
  // 1. Auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  // 2. Parse & validate request
  const body: AgentRequest = await request.json()
  const validationError = validateRequest(body)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })
  
  // 3. Pre-process: transcribe voice, handle photo
  const processedContent = await preprocessInput(body)
  
  // 4. Classify
  const classification = await classifyInput(processedContent, body.input_mode)
  
  // 5. Handle low confidence
  if (classification.confidence < 0.5) {
    return clarificationResponse(classification)
  }
  
  // 6. Check for urgent pending insights — prepend to response
  const urgentInsights = await fetchPendingUrgentInsights(supabase, user.id)
  
  // 7. Build context + call agent(s)
  const agentMessages = await routeToAgents(user.id, processedContent, classification, body)
  
  // 8. Prepend urgent insight messages if any
  const messages: AgentMessage[] = []
  for (const insight of urgentInsights) {
    messages.push({
      role: 'socius',
      content: `⚠️ ${insight.content}`,
      domain: 'socius',
      related_entity_id: insight.id,
      related_entity_type: 'insight'
    })
    // Mark as surfaced
    await supabase.from('insights').update({ surfaced_at: new Date().toISOString() }).eq('id', insight.id)
  }
  messages.push(...agentMessages)
  
  // 9. Execute actions (persist workout/meal if applicable)
  const enrichedMessages = await executeActions(supabase, user.id, messages)
  
  // 10. Persist chat messages (with both input_mode and input_type)
  await persistMessages(supabase, user.id, body, enrichedMessages, classification)
  
  // 11. Trigger Socius background check if something was logged
  if (hasLogAction(enrichedMessages)) {
    triggerSociusBackground(user.id).catch(console.error) // fire-and-forget
  }
  
  // 12. Return response
  const elapsed = Date.now() - startTime
  return NextResponse.json({
    messages: enrichedMessages,
    classification,
    processing_time_ms: elapsed
  } satisfies AgentResponse)
}

async function routeToAgents(
  userId: string,
  content: string,
  classification: ClassificationResult,
  request: AgentRequest
): Promise<AgentMessage[]> {
  const messages: AgentMessage[] = []
  
  for (const domain of classification.domains) {
    const context = domain === 'trainer'
      ? await buildTrainerContext(userId)
      : domain === 'nutritionist'
      ? await buildNutritionistContext(userId)
      : await buildSociusContext(userId)
    
    const agentResponse = await callAgent(domain, context, content, request, messages)
    messages.push(...agentResponse)
  }
  
  return messages
}
```

### Chat Persistence & Compaction (`app/lib/agents/chat-persistence.ts`)

```typescript
import { SupabaseClient } from '@supabase/supabase-js'
import { AgentRequest, AgentMessage, ClassificationResult, ChatMessage } from './types'

/** Persist user message + agent responses to chat_messages table */
export async function persistMessages(
  supabase: SupabaseClient,
  userId: string,
  userInput: AgentRequest,
  agentMessages: AgentMessage[],
  classification: ClassificationResult
): Promise<void> {
  const rows = [
    // User message — stores both input_mode and input_type
    {
      user_id: userId,
      role: 'user',
      content: userInput.content,
      input_mode: userInput.input_mode,
      input_type: classification.input_type,
      domain: null,
      confidence: classification.confidence,
      is_compacted: false
    },
    // Agent messages
    ...agentMessages.map(msg => ({
      user_id: userId,
      role: msg.role,
      content: msg.content,
      input_mode: null,
      input_type: null,
      domain: msg.domain || null,
      confidence: msg.confidence || null,
      related_entity_id: msg.related_entity_id || null,
      related_entity_type: msg.related_entity_type || null,
      is_compacted: false
    }))
  ]
  
  await supabase.from('chat_messages').insert(rows)
}

/** Fetch recent chat for context (respects compaction) */
export async function fetchRecentChat(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 20
): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  return (data || []).reverse()
}

/** Fetch urgent insights that haven't been surfaced yet */
export async function fetchPendingUrgentInsights(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; content: string }[]> {
  const { data } = await supabase
    .from('insights')
    .select('id, content')
    .eq('user_id', userId)
    .eq('priority', 'urgent')
    .is('surfaced_at', null)
    .order('created_at', { ascending: false })
  
  return data || []
}

/** Compact old messages into summaries */
export async function compactOldMessages(
  supabase: SupabaseClient,
  userId: string,
  threshold: number = 100
): Promise<void> {
  const { count } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_compacted', false)
  
  if (!count || count <= threshold) return
  
  const messagesToCompact = count - threshold
  const { data: oldMessages } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', userId)
    .eq('is_compacted', false)
    .order('created_at', { ascending: true })
    .limit(messagesToCompact)
  
  if (!oldMessages || oldMessages.length === 0) return
  
  const keyFacts = extractKeyFacts(oldMessages)
  const summary = await generateCompactionSummary(oldMessages, keyFacts)
  
  await supabase.from('chat_messages').insert({
    user_id: userId,
    role: 'system',
    content: summary,
    is_compacted: true
  })
  
  const oldIds = oldMessages.map(m => m.id)
  await supabase
    .from('chat_messages')
    .update({ is_compacted: true })
    .in('id', oldIds)
}

function extractKeyFacts(messages: ChatMessage[]): string[] {
  const facts: string[] = []
  for (const msg of messages) {
    if (msg.related_entity_type === 'workout') facts.push(`Logged workout: ${msg.related_entity_id}`)
    if (msg.related_entity_type === 'meal') facts.push(`Logged meal: ${msg.related_entity_id}`)
    if (msg.content.toLowerCase().includes('pr') || msg.content.toLowerCase().includes('personal record')) {
      facts.push(`PR mentioned: ${msg.content.substring(0, 100)}`)
    }
  }
  return facts
}
```

### Socius Background Analysis (`app/lib/agents/socius-background.ts`)

Runs asynchronously after a workout or meal is logged. Checks for known patterns and creates insights with numeric confidence.

```typescript
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { buildSociusContext } from './context-builder'
import { SociusContext, PatternId, InsightPriority } from './types'

interface DetectedPattern {
  pattern_id: PatternId
  priority: InsightPriority
  confidence: number         // 0.0–1.0
  content: string
  data_context: Record<string, unknown>
}

export async function triggerSociusBackground(userId: string): Promise<void> {
  const supabase = await createServerClient()
  const context = await buildSociusContext(userId)
  
  const checkers = [
    checkCaloricDeficit(context),
    checkOvertraining(context),
    checkNutritionPerformance(context),
    checkRecoveryVolume(context),
    checkProteinRecovery(context),
    checkSleepPerformance(context),
    checkHRVTrend(context),
    checkStrainNutrition(context),
    checkConsistentProgression(context)
  ]
  
  const detectedPatterns = checkers.filter(
    (p): p is DetectedPattern => p !== null && p.confidence > 0.6
  )
  
  for (const pattern of detectedPatterns) {
    await supabase.from('insights').insert({
      user_id: userId,
      pattern_id: pattern.pattern_id,
      priority: pattern.priority,
      confidence: pattern.confidence,
      content: pattern.content,
      data_context: pattern.data_context
    })
  }
}

function checkCaloricDeficit(context: SociusContext): DetectedPattern | null {
  const strain = context.today.latest_whoop_strain
  const calories = context.today.macros_consumed.calories
  
  if (strain === null || calories === 0) return null
  
  // High strain (≥14) with low calories (<1500) = urgent
  if (strain >= 14 && calories < 1500) {
    return {
      pattern_id: 'CAL_DEF',
      priority: 'urgent',
      confidence: 0.8,
      content: `High strain day (${strain}) with only ${calories} calories logged. Consider fueling up to support recovery.`,
      data_context: { strain, calories }
    }
  }
  return null
}

// Additional pattern checkers: checkOvertraining, checkNutritionPerformance,
// checkRecoveryVolume, checkProteinRecovery, checkSleepPerformance,
// checkHRVTrend, checkStrainNutrition, checkConsistentProgression
// Each returns DetectedPattern | null with numeric confidence
```

## Data Models

### New Database Tables

#### chat_messages
```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'trainer', 'nutritionist', 'socius', 'system')),
  content TEXT NOT NULL,
  input_mode TEXT CHECK (input_mode IN ('text', 'voice', 'photo', 'file')),
  input_type TEXT CHECK (input_type IN ('workout_log', 'meal_log', 'question', 'mixed', 'unclear')),
  domain TEXT CHECK (domain IN ('trainer', 'nutritionist', 'socius')),
  confidence DECIMAL,
  related_entity_id UUID,
  related_entity_type TEXT CHECK (related_entity_type IN ('workout', 'meal', 'insight')),
  is_compacted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own messages"
  ON chat_messages FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_user_created ON chat_messages(user_id, created_at DESC);
CREATE INDEX idx_chat_messages_compacted ON chat_messages(user_id, is_compacted);
```

#### insights
```sql
CREATE TABLE insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  pattern_id TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('urgent', 'notable', 'informational')),
  confidence DECIMAL NOT NULL,
  content TEXT NOT NULL,
  data_context JSONB NOT NULL DEFAULT '{}',
  surfaced_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own insights"
  ON insights FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_insights_user_id ON insights(user_id);
CREATE INDEX idx_insights_user_priority ON insights(user_id, priority, created_at DESC);
CREATE INDEX idx_insights_unsurfaced ON insights(user_id, surfaced_at) WHERE surfaced_at IS NULL;
```

### Existing Tables Used (No Modifications)

- `workouts` — Trainer writes parsed workouts here
- `block_scores` — Trainer writes block-level scores here
- `benchmark_prs` — Trainer writes PR records here
- `meals` — Nutritionist writes analyzed meals here
- `daily_targets` — Nutritionist reads targets for budget calculation
- `user_profiles` — Context builders read user profile
- `whoop_recovery`, `whoop_sleep`, `whoop_cycles` — Socius reads WHOOP data


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Classifier output structure completeness

*For any* text input and input mode, the Classifier output SHALL contain a valid `input_type` (one of the defined enum values), a non-empty `domains` array, a `confidence` score between 0.0 and 1.0, and an `extracted_context` object with all required boolean fields (`has_portions`, `has_score`, `is_benchmark`).

**Validates: Requirements 1.1, 1.7**

### Property 2: Router behavior matches classification

*For any* `ClassificationResult`, the Agent Router SHALL:
- Call exactly one agent when `domains` has length 1 and `confidence` > 0.7
- Call agents sequentially (one per domain) when `domains` has length > 1
- Return a clarification message (no agent calls) when `confidence` < 0.5

**Validates: Requirements 1.2, 1.3, 1.4**

### Property 3: Multi-domain responses contain one message per domain

*For any* multi-domain `ClassificationResult` with N domains, the response `messages` array SHALL contain exactly N agent messages, each attributed to a distinct domain.

**Validates: Requirements 1.3, 7.6**

### Property 4: Trainer parse output structure

*For any* workout text input routed to the Trainer, the Trainer output SHALL contain at least one structured block with a valid `block_type`, a `movements` array, and a `confidence` score between 0.0 and 1.0.

**Validates: Requirements 2.1, 2.2**

### Property 5: PR detection correctness

*For any* benchmark workout score and existing PR history, the PR detection logic SHALL identify the score as a new PR if and only if the score is strictly better than all existing scores for that benchmark (lower time for FOR_TIME, higher rounds+reps for AMRAP).

**Validates: Requirements 2.3**

### Property 6: Smart default application

*For any* workout input missing RPE or movement weight where historical data exists, the Trainer SHALL include a `smart_defaults` array in its response with entries for each assumed value, and each entry SHALL contain `field`, `assumed_value`, and `source`.

**Validates: Requirements 2.5, 2.6, 2.7**

### Property 7: Workout persistence round-trip

*For any* successfully parsed workout, inserting it into the `workouts` table and then reading it back by ID SHALL produce a record with matching `input_text`, `blocks`, `primary_score`, and `workout_date`.

**Validates: Requirements 2.9**

### Property 8: Nutritionist parse output with portion defaults

*For any* meal text input routed to the Nutritionist, the output SHALL contain at least one food item with non-negative `protein`, `carbs`, `fat`, and `calories` values. When the input lacks specific portion sizes, the output SHALL include `smart_defaults` entries for the assumed portions.

**Validates: Requirements 3.2, 3.3**

### Property 9: Remaining macro budget calculation

*For any* set of today's meals (with non-negative macros) and daily targets (with positive values), the remaining budget SHALL equal `target - sum(meals)` for each macro (protein, carbs, fat, calories). The remaining value MAY be negative (indicating over-target).

**Validates: Requirements 3.4**

### Property 10: Meal persistence round-trip

*For any* successfully analyzed meal, inserting it into the `meals` table and then reading it back by ID SHALL produce a record with matching `items`, `total_protein`, `total_carbs`, `total_fat`, `total_calories`, and `meal_timing`.

**Validates: Requirements 3.8**

### Property 11: Meal timing inference

*For any* time of day and set of logged workouts, the inferred `meal_timing` SHALL be:
- `PRE_WORKOUT` if a workout is logged within 2 hours after the meal time
- `POST_WORKOUT` if a workout is logged within 2 hours before the meal time
- One of `BREAKFAST`, `LUNCH`, `DINNER`, `SNACK` based on time-of-day rules otherwise

**Validates: Requirements 3.9**

### Property 12: Week-to-date adherence calculation

*For any* set of daily meal summaries, daily targets with positive values, and days elapsed (1–7), the week-to-date adherence percentages SHALL equal `(actual_cumulative / (daily_target × days_elapsed)) × 100` for each macro, and the `overall_status` SHALL be `on-track` when average adherence is within tolerance, `ahead` when above, and `behind` when below.

**Validates: Requirements 3.10**

### Property 13: Insight creation threshold

*For any* pattern detection result with `confidence` > 0.6, the Socius SHALL create an Insight record containing all required fields: `pattern_id`, `priority`, `confidence` (numeric 0.0–1.0), `content`, and `data_context`. Pattern results with `confidence` ≤ 0.6 SHALL NOT produce Insight records.

**Validates: Requirements 4.3, 4.6**

### Property 14: Caloric deficit urgency classification

*For any* day where WHOOP strain score ≥ 14 and total logged calories < 1500, the CAL_DEF pattern detection SHALL classify the resulting Insight as `urgent` priority.

**Validates: Requirements 4.5**

### Property 15: Workout type aggregation

*For any* set of workouts with known `block_type` values, the aggregation SHALL count AMRAP and FOR_TIME blocks as `metcon`, STRENGTH blocks as `strength`, CARDIO blocks as `cardio`, and EMOM blocks as `emom`, and the `total` SHALL equal the sum of all categories.

**Validates: Requirements 4.8**

### Property 16: Trainer context time window

*For any* user with workouts spanning multiple weeks, the Trainer context SHALL include only workouts from the last 7 days and exclude all older workouts.

**Validates: Requirements 5.2**

### Property 17: Nutritionist context daily scope

*For any* user with meals spanning multiple days, the Nutritionist context SHALL include only today's meals (based on user timezone) and exclude meals from other days.

**Validates: Requirements 5.3**

### Property 18: Socius context completeness

*For any* user with data across all domains, the Socius context SHALL contain non-null `thirty_day_summary`, `recent_insights`, and `data_availability` fields. If WHOOP data exists, `has_whoop` SHALL be true.

**Validates: Requirements 5.4**

### Property 19: Chat message persistence round-trip

*For any* user message and agent response, persisting them to `chat_messages` and then fetching recent messages SHALL return records with matching `role`, `content`, `input_mode`, `input_type`, `domain`, and `related_entity_id`/`related_entity_type` (when present).

**Validates: Requirements 6.1, 6.2, 6.5**

### Property 20: Chat retrieval ordering

*For any* set of persisted chat messages, fetching recent messages SHALL return them in chronological order (oldest first within the result set).

**Validates: Requirements 6.3**

### Property 21: Chat compaction threshold

*For any* user with more than the configured threshold of non-compacted messages, running compaction SHALL reduce the non-compacted message count to at most the threshold, and the compacted summary SHALL contain references to all entity IDs and PR mentions from the original messages.

**Validates: Requirements 6.6, 6.7**

### Property 22: Authentication enforcement

*For any* request to `/api/agent/process` without a valid Supabase auth session, the endpoint SHALL return HTTP 401 and SHALL NOT invoke the Classifier or any agent.

**Validates: Requirements 7.2**

### Property 23: Error response structure

*For any* failure in the Classifier or agent pipeline, the endpoint SHALL return a JSON response containing an `error` field with a non-empty string message and an appropriate HTTP status code (4xx or 5xx).

**Validates: Requirements 7.5**

### Property 24: Insight sorting

*For any* set of insights, the Insights tab display order SHALL sort by priority (urgent > notable > informational) first, then by `created_at` descending within the same priority level.

**Validates: Requirements 8.8**

## Error Handling

### Classifier Failures
- If the Classifier LLM call times out or returns invalid JSON, the Agent Router falls back to keyword-based classification (reusing the existing `classifyIntent` logic from `app/api/query/lib/intent-classifier.ts`)
- If fallback also fails, return a system message asking the user to rephrase

### Agent Failures
- If an agent LLM call fails, return a structured error message attributed to that agent's role: `{ role: "trainer", content: "I couldn't process that. Try again?" }`
- If the agent returns unparseable JSON for a log action, skip the persistence step and return the conversational text only with a warning
- Retry once on transient errors (429, 503) with exponential backoff

### Database Failures
- If chat persistence fails, log the error but still return the agent response to the user (non-blocking)
- If context building fails (DB query error), proceed with empty context and include a system note that context may be incomplete
- If workout/meal persistence fails, return the agent response with an error note and do not mark the entity as logged

### Background Analysis Failures
- Socius background analysis is fire-and-forget — failures are logged but never surface to the user
- If insight persistence fails, the pattern is lost (acceptable for background analysis)

### Input Validation
- Text content: max 5000 characters
- Photo data: max 5MB (base64)
- Audio data: max 10MB (base64)
- Invalid input returns 400 with descriptive error message

## Testing Strategy

### Property-Based Testing

Use `fast-check` (already in the project) for property-based tests. Each property test runs a minimum of 100 iterations.

**Classifier Properties (Properties 1–3)**:
- Generate random input strings with known keywords/patterns
- Generate random `ClassificationResult` objects and verify routing decisions
- Tag: `Feature: agent-system, Property N: {title}`

**Trainer Properties (Properties 4–7)**:
- Generate random workout block structures for round-trip testing
- Generate random benchmark scores and PR histories for detection logic
- Generate random smart default scenarios

**Nutritionist Properties (Properties 8–12)**:
- Generate random meal items with/without portions
- Generate random daily targets and meal sets for budget calculation
- Generate random weekly data for adherence calculation
- Generate random times and workout schedules for timing inference

**Socius Properties (Properties 13–15)**:
- Generate random pattern detection results with varying confidence
- Generate random strain/calorie combinations for urgency classification
- Generate random workout sets with known block types for aggregation

**Context Builder Properties (Properties 16–18)**:
- Generate random workout/meal sets spanning multiple dates
- Verify time-window filtering logic

**Persistence Properties (Properties 19–21)**:
- Generate random chat messages and verify round-trip
- Generate random message sets and verify ordering
- Generate message sets above/below threshold and verify compaction

**API Properties (Properties 22–24)**:
- Generate random auth states and verify 401 enforcement
- Generate random error scenarios and verify response structure
- Generate random insight sets and verify sort order

### Unit Testing

Unit tests complement property tests for specific examples and edge cases:

- Classifier: known input → expected classification (e.g., "Did Fran in 4:32" → workout_log, trainer)
- PR detection: specific benchmark comparisons (lower time = better for FOR_TIME, higher rounds = better for AMRAP)
- Macro budget: zero meals → full budget remaining; over-target → negative remaining
- Meal timing: 6am → BREAKFAST, 12pm → LUNCH, 7pm → DINNER
- Compaction: messages with PR mentions → key facts preserved
- Error handling: each error type → correct HTTP status code

### Integration Testing

- Full pipeline: text input → classification → context → agent → persistence → response
- Multi-domain: input touching both workout and nutrition → both agents called
- Photo flow: base64 image → classification → nutritionist → meal persisted
- Background analysis: log workout → Socius triggered → insight created (if pattern detected)

### Test Configuration

```typescript
// vitest.config.ts additions
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: true,
    environment: 'node',
    setupFiles: ['test/setup.ts']
  }
})
```

Property-based test library: `fast-check` (already installed)
Each property test tagged with: `Feature: agent-system, Property {N}: {title}`
Minimum 100 iterations per property test.
