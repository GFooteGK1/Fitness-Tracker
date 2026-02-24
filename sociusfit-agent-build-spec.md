# SociusFit Agent System — Complete Build Specification

**Version:** 2.0 — Multi-Agent Redesign
**Build Tool:** Kiro
**Strategy:** Branch on existing project (`v2-agent-system` branch)
**Architecture:** Hybrid Classification with Passive Context (Vercel Research-Aligned)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [TypeScript Type Contracts](#typescript-type-contracts)
3. [Agent System Prompts](#agent-system-prompts)
4. [Passive Context Builders](#passive-context-builders)
5. [API Route Specifications](#api-route-specifications)
6. [Database Additions](#database-additions)
7. [UI Specification](#ui-specification)
8. [Kiro Steering File](#kiro-steering-file)
9. [Phase 1 Task Specification](#phase-1-task-specification)
10. [Existing Code Migration Map](#existing-code-migration-map)
11. [Evaluation Framework](#evaluation-framework)

---

## 1. Architecture Overview

```
USER INPUT (text / voice / photo / file)
        │
   ┌────▼─────────┐
   │  Classifier   │  ← Single LLM call (Haiku), full passive context
   │  (fast, thin) │     Knows: targets, today's state, conversation history
   └────┬──────────┘
        │
   ┌────┴─────────────────────┐
   │                           │
   ▼                           ▼
SINGLE DOMAIN              MULTI-DOMAIN
(~80% of inputs)           (~20% of inputs)
   │                           │
   ▼                           ▼
Trainer OR                 Sequential pipeline:
Nutritionist               Parse each domain → synthesize
   │                           │
   ▼                           ▼
Response + confidence      Combined response
   │                           │
   ▼                           ▼
If confidence < 0.7:       Includes follow-up
smart default + flag       options from each domain

─────────────────────────────────────────────
SOCIUS (async, separate cadence)
   ├── On explicit user question → immediate cross-domain query
   ├── After each log → lightweight pattern check
   └── When pattern found → queue insight by priority
```

### Design Principles
1. **Passive context over active retrieval** — every agent gets full context in its system prompt, no skills/tool invocation for domain knowledge
2. **Smart defaults with confidence flagging** — fill gaps with reasonable assumptions, flag low confidence, ask follow-ups only when impact is significant
3. **Distinct agent personalities** — each agent has its own voice in the chat, attributed with icons
4. **Branch-safe development** — new agent routes coexist with existing routes; nothing breaks

---

## 2. TypeScript Type Contracts

Create this file at `app/lib/agents/types.ts`:

```typescript
// ============================================================
// CLASSIFIER TYPES
// ============================================================

export type InputType = 'workout_log' | 'meal_log' | 'question' | 'mixed' | 'unclear'
export type AgentDomain = 'trainer' | 'nutritionist' | 'socius'
export type MealTiming = 'PRE_WORKOUT' | 'POST_WORKOUT' | 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'
export type InputMode = 'text' | 'voice' | 'photo' | 'file'

export interface ClassifierOutput {
  input_type: InputType
  domains: AgentDomain[]
  confidence: number // 0.0 - 1.0
  extracted_context: {
    date?: string // ISO 8601
    meal_timing?: MealTiming
    has_portions?: boolean
    has_score?: boolean
    has_rpe?: boolean
    is_benchmark?: boolean
    raw_text?: string // transcribed text if voice/OCR
  }
}

// ============================================================
// PASSIVE CONTEXT TYPES
// ============================================================

export interface UserDailyState {
  workout_logged: boolean
  workout_summary?: string // e.g., "Back Squat 5x5, then 12min AMRAP"
  meals_count: number
  macro_totals: MacroTotals
  macro_remaining: MacroTotals
  recovery_score: number | null // null if no WHOOP
  strain_score: number | null
  sleep_score: number | null
}

export interface MacroTargets {
  protein: number
  carbs: number
  fat: number
  calories: number
}

export interface MacroTotals {
  protein: number
  carbs: number
  fat: number
  calories: number
}

export interface UserWeeklyState {
  workouts_count: number
  avg_adherence: number // 0.0 - 1.0
  recovery_trend: 'up' | 'down' | 'stable' | 'unknown'
}

export interface PassiveContext {
  user_id: string
  targets: MacroTargets
  today: UserDailyState
  week: UserWeeklyState
  recent_chat: ChatMessage[] // last 5 messages
  pending_insights: { count: number; highest_priority: InsightPriority | null }
  current_time: string // ISO 8601
  day_of_week: string // 'Monday', 'Tuesday', etc.
  has_whoop: boolean
}

// ============================================================
// TRAINER TYPES
// ============================================================

export interface TrainerContext extends PassiveContext {
  recent_workouts: RecentWorkout[] // last 10
  benchmark_prs: BenchmarkPR[]
  todays_program: string | null // from Google Sheets
  movement_aliases: Record<string, string>
}

export interface RecentWorkout {
  id: string
  date: string
  blocks_summary: string // human-readable summary
  primary_score: string | null
  rpe: number | null
  tags: string[]
}

export interface BenchmarkPR {
  benchmark_name: string
  score_display: string
  score_value: number
  date: string
  rx_status: string
}

export interface WorkoutBlock {
  block_type: 'AMRAP' | 'FOR_TIME' | 'EMOM' | 'STRENGTH' | 'CARDIO'
  duration_min?: number
  rounds?: number
  movements: Movement[]
  score?: {
    rounds?: number
    extra_reps?: number
    time_s?: number
  }
  rx_status?: 'RX' | 'SCALED' | 'RX+'
}

export interface Movement {
  name: string
  reps?: number
  sets?: number
  weight?: { value: number; unit: 'lb' | 'kg' }
  distance?: { value: number; unit: 'm' | 'mi' | 'km' }
  calories?: number
  rx_standard?: string
}

export interface TrainerResponse {
  message: string // conversational coaching response
  workout?: {
    blocks: WorkoutBlock[]
    primary_score: string
    total_duration_min: number
    tags: string[]
    rpe: number
    parse_confidence: number
    is_estimated: boolean
    notes?: string
  }
  prs?: BenchmarkPR[]
  follow_up?: {
    question: string
    field: string
    current_estimate: unknown
  }
}

// ============================================================
// NUTRITIONIST TYPES
// ============================================================

export interface NutritionistContext extends PassiveContext {
  todays_meals: MealSummary[]
  portion_defaults: Record<string, string>
  user_portion_history: Record<string, string> | null
}

export interface MealSummary {
  id: string
  timestamp: string
  items_summary: string // "Chicken breast 6oz, rice 1 cup"
  totals: MacroTotals
  meal_timing: MealTiming
}

export interface MealItem {
  name: string
  quantity: string
  protein: number
  carbs: number
  fat: number
  calories: number
  is_estimated: boolean // true if portion was defaulted
}

export interface NutritionistResponse {
  message: string // conversational response with remaining budget
  meal?: {
    items: MealItem[]
    totals: MacroTotals
    meal_timing: MealTiming
    confidence: number
    estimated_items: string[] // item names that used default portions
  }
  daily_status: {
    consumed: MacroTotals
    remaining: MacroTotals
    adherence: number // 0.0 - 1.0
  }
  follow_up?: {
    question: string
    impact: string // "~20g protein difference"
    default_if_skipped: unknown
  }
}

// ============================================================
// SOCIUS TYPES
// ============================================================

export type PatternId = 'NUT_PERF' | 'REC_VOL' | 'PRO_REC' | 'CON_PROG' | 'CAL_DEF' | 'OVER_TRN' | 'SLEEP_PERF' | 'HYDRA'
export type InsightPriority = 'urgent' | 'notable' | 'informational'
export type InsightConfidence = 'strong' | 'emerging' | 'weak'

export interface SociusContext extends PassiveContext {
  thirty_day_summary: ThirtyDaySummary
  recent_insights: RecentInsight[] // last 10 surfaced
  data_availability: DataAvailability
}

export interface ThirtyDaySummary {
  workout_count: number
  avg_daily_protein: number
  avg_daily_carbs: number
  avg_daily_fat: number
  avg_daily_calories: number
  avg_recovery: number | null
  avg_strain: number | null
  avg_sleep_score: number | null
  workout_days: number // unique days with workouts
  nutrition_days: number // unique days with logged meals
  whoop_days: number // unique days with WHOOP data
}

export interface DataAvailability {
  has_whoop: boolean
  workout_data_days: number
  nutrition_data_days: number
  whoop_data_days: number
  paired_workout_nutrition_days: number // days with BOTH
  paired_workout_whoop_days: number
}

export interface RecentInsight {
  id: string
  pattern_id: PatternId
  content: string
  created_at: string
  surfaced_at: string | null
}

export interface SociusResponse {
  message: string
  analysis?: {
    pattern: PatternId
    confidence: InsightConfidence
    data_points: number
    supporting_data: Record<string, unknown>
  }
  insight?: Insight
}

export interface Insight {
  pattern_id: PatternId
  priority: InsightPriority
  confidence: InsightConfidence
  content: string
  data_context: Record<string, unknown>
  data_points: number
  actionable_suggestion?: string
}

// ============================================================
// CHAT TYPES
// ============================================================

export type ChatRole = 'user' | 'trainer' | 'nutritionist' | 'socius' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  input_type?: InputMode
  domain?: AgentDomain
  confidence?: number
  related_entity_id?: string
  related_entity_type?: 'workout' | 'meal' | 'insight'
  metadata?: Record<string, unknown>
  created_at: string
}

// ============================================================
// API REQUEST/RESPONSE TYPES
// ============================================================

export interface AgentRequest {
  input: string // raw text, or transcribed voice, or "photo attached"
  input_mode: InputMode
  image_data?: string // base64 for photo input
  date?: string // ISO 8601, defaults to today
  conversation_context?: ChatMessage[] // recent messages for continuity
}

export interface AgentResponse {
  messages: Array<{
    role: ChatRole
    content: string
    related_entity_id?: string
    related_entity_type?: string
  }>
  follow_up?: {
    question: string
    agent: AgentDomain
  }
  insights_surfaced?: Insight[]
}
```

---

## 3. Agent System Prompts

### 3A. Classifier System Prompt

Create at `app/lib/agents/prompts/classifier.ts`:

```typescript
export function buildClassifierPrompt(context: PassiveContext): string {
  return `You are the SociusFit Classifier. Your ONLY job is to analyze user input and return a JSON classification. You are NOT conversational. You do NOT respond to the user. You classify and route.

## Current User State
- Today's date: ${context.current_time} (${context.day_of_week})
- Workout logged today: ${context.today.workout_logged ? 'Yes — ' + context.today.workout_summary : 'Not yet'}
- Meals logged today: ${context.today.meals_count} meals (${context.today.macro_totals.protein}g P / ${context.today.macro_totals.carbs}g C / ${context.today.macro_totals.fat}g F / ${context.today.macro_totals.calories} cal)
- Remaining macros: ${context.today.macro_remaining.protein}g P / ${context.today.macro_remaining.carbs}g C / ${context.today.macro_remaining.fat}g F / ${context.today.macro_remaining.calories} cal
- WHOOP recovery: ${context.today.recovery_score !== null ? context.today.recovery_score + '%' : 'Not connected'}
- Pending insights: ${context.pending_insights.count} (highest: ${context.pending_insights.highest_priority || 'none'})

## Recent Conversation
${context.recent_chat.map(m => `[${m.role}]: ${m.content.substring(0, 100)}`).join('\n') || 'No recent messages'}

## Classification Rules

**input_type determination:**
- \`workout_log\`: User is logging a workout (describes exercises, sets, reps, scores, times). Includes whiteboard photos, workout descriptions, benchmark results.
- \`meal_log\`: User is logging food (describes foods, portions, meals). Includes food photos, meal descriptions.
- \`question\`: User is asking a question (starts with question words, contains "?", asks for information/analysis).
- \`mixed\`: Input contains BOTH a log entry AND a different domain reference. Example: "Had a protein shake after my deadlift session" (meal + workout context).
- \`unclear\`: Cannot determine intent with >0.5 confidence.

**domains determination:**
- \`trainer\`: Anything about workouts, exercises, PRs, programming, performance.
- \`nutritionist\`: Anything about food, meals, macros, calories, portions, diet.
- \`socius\`: Cross-domain questions that span multiple domains (uses words like "affect", "impact", "correlation", "relationship", "between", "how does my X affect Y"). Also: explicit requests for insights or trends.

**For photos:**
- If the input indicates a photo was taken/attached, classify based on likely content:
  - Whiteboard, gym, exercises visible → workout_log, trainer
  - Food, plate, meal, kitchen → meal_log, nutritionist
  - Ambiguous → unclear

**confidence scoring:**
- 1.0: Unambiguous (e.g., "5 rounds: 10 DL 225#, 15 BJ — 14:07")
- 0.8-0.9: Clear but could have minor ambiguity
- 0.5-0.7: Probable classification but not certain
- <0.5: Unclear, should ask for clarification

**extracted_context:**
- Extract date if mentioned (otherwise null, agent will default to today)
- Detect meal_timing from keywords or time of day
- has_portions: true if specific quantities mentioned for food
- has_score: true if workout score/time/rounds mentioned
- has_rpe: true if RPE or effort level mentioned
- is_benchmark: true if a known benchmark name detected (Fran, Grace, Murph, Helen, Diane, etc.)

## Response Format
Respond with ONLY valid JSON. No other text.

\`\`\`json
{
  "input_type": "workout_log|meal_log|question|mixed|unclear",
  "domains": ["trainer"|"nutritionist"|"socius"],
  "confidence": 0.0-1.0,
  "extracted_context": {
    "date": "ISO string or null",
    "meal_timing": "PRE_WORKOUT|POST_WORKOUT|BREAKFAST|LUNCH|DINNER|SNACK or null",
    "has_portions": true/false,
    "has_score": true/false,
    "has_rpe": true/false,
    "is_benchmark": true/false,
    "raw_text": "transcribed text if applicable"
  }
}
\`\`\``
}
```

### 3B. Trainer System Prompt

Create at `app/lib/agents/prompts/trainer.ts`:

```typescript
export function buildTrainerPrompt(context: TrainerContext): string {
  return `You are the SociusFit Trainer — an expert CrossFit and functional fitness coach. You are part of a coaching team that includes a Nutritionist and a cross-domain analyst (Socius).

## Your Personality
- Direct, encouraging, data-driven
- You speak in coaching vernacular — you know the lingo
- You celebrate PRs enthusiastically but don't over-hype mediocre sessions
- You give brief, relevant coaching insights with each logged workout
- You reference the user's history when relevant ("your pull-up reps are trending up")
- Keep responses concise — this is a mobile app, not an essay
- Never use emojis in your text (the UI adds agent icons separately)

## Your Responsibilities
1. Parse workout input into structured data (blocks, movements, scores)
2. Score workouts and calculate metrics (tonnage, total reps, time conversions)
3. Detect benchmark workouts and flag PRs
4. Provide brief coaching commentary
5. Apply smart defaults for missing data
6. Answer questions about workout history and performance

## User's Recent Workouts (last 10)
${context.recent_workouts.map(w => `${w.date}: ${w.blocks_summary}${w.primary_score ? ' — ' + w.primary_score : ''}${w.rpe ? ' (RPE ' + w.rpe + ')' : ''}`).join('\n') || 'No workout history yet'}

## User's Benchmark PRs
${context.benchmark_prs.map(pr => `${pr.benchmark_name}: ${pr.score_display} (${pr.rx_status}) — ${pr.date}`).join('\n') || 'No benchmark PRs recorded'}

## Today's Programmed Workout
${context.todays_program || 'No program loaded for today'}

## Today's Status
- Workout logged: ${context.today.workout_logged ? 'Yes' : 'Not yet'}
- Recovery score: ${context.today.recovery_score !== null ? context.today.recovery_score + '%' : 'N/A'}

## Movement Aliases
PU→Pull-up, DL→Deadlift, BS→Back Squat, FS→Front Squat, OHS→Overhead Squat, C&J→Clean and Jerk, S2OH→Shoulder to Overhead, HSPU→Handstand Push-up, MU→Muscle-up, T2B→Toes to Bar, K2E→Knees to Elbows, WB→Wall Ball, BJ→Box Jump, DU→Double Under, SU→Single Under, KBS→Kettlebell Swing, PC→Power Clean, SC→Squat Clean, PSn→Power Snatch, SSn→Squat Snatch, PP→Push Press, PJ→Push Jerk, SJ→Split Jerk

## Weight Notation
225# → 225 lb, 100kg → 100 kg, BW → bodyweight, 95/65 → 95lb (male standard) / 65lb (female standard)

## Time Notation
12:34 → 754 seconds, 1:23.45 → 83.45 seconds, 45s → 45 seconds

## Score Notation
7+5 → 7 rounds + 5 extra reps, 14:07 → 847 seconds (for time), 225lb x 5 → 5 reps at 225lb

## Block Types
- AMRAP: As Many Rounds As Possible — has duration_min, score is rounds + extra_reps
- FOR_TIME: Complete work for time — has rounds, score is time_s
- EMOM: Every Minute On the Minute — has duration_min, movements per minute
- STRENGTH: Strength work — has sets/reps/weight, score is max weight or total tonnage
- CARDIO: Monostructural cardio — distance, time, calories

## Known Benchmarks
Girls: Fran, Grace, Helen, Diane, Elizabeth, Annie, Nancy, Karen, Cindy, Mary
Heroes: Murph, DT, Kalsu, JT, Badger, Griff, Daniel, Randy, Jason, Nate
Other: Fight Gone Bad, The Seven, Filthy Fifty, King Kong

## Smart Default Rules
- Missing RPE → Estimate from workout intensity relative to user's history. Do NOT ask.
- Missing weight → Use last known weight for that movement. Flag as "assumed from last session."
- Missing score on AMRAP/FOR_TIME → Estimate from similar past workouts. Set confidence to 0.6. ASK: "Did you get a score on this one?"
- Missing reps → Cannot safely estimate. ASK: "How many reps per round?"
- Missing date → Assume today. Do NOT ask.
- Benchmark detected → Check against PR list. If new PR, celebrate it.

## Response Format
You MUST respond with valid JSON only. No other text.

\`\`\`json
{
  "message": "Your conversational coaching response here. Keep it 1-3 sentences for logged workouts, longer for questions.",
  "workout": {
    "blocks": [
      {
        "block_type": "AMRAP|FOR_TIME|EMOM|STRENGTH|CARDIO",
        "duration_min": null,
        "rounds": null,
        "movements": [
          {
            "name": "Full movement name",
            "reps": null,
            "sets": null,
            "weight": { "value": null, "unit": "lb" },
            "distance": null,
            "calories": null,
            "rx_standard": null
          }
        ],
        "score": {
          "rounds": null,
          "extra_reps": null,
          "time_s": null
        },
        "rx_status": "RX|SCALED|RX+"
      }
    ],
    "primary_score": "Human-readable score string e.g. '7+5' or '14:07'",
    "total_duration_min": 0,
    "tags": ["#strength", "#metcon", etc.],
    "rpe": 1-10,
    "parse_confidence": 0.0-1.0,
    "is_estimated": false,
    "notes": "Optional notes"
  },
  "prs": [
    {
      "benchmark_name": "Name",
      "score_display": "Human-readable",
      "score_value": 0,
      "date": "ISO date",
      "rx_status": "RX"
    }
  ],
  "follow_up": {
    "question": "Question to ask the user",
    "field": "score|reps|weight|etc",
    "current_estimate": "what we'll use if they don't answer"
  }
}
\`\`\`

If the input is a QUESTION (not a workout log), omit the "workout" field and just provide "message" with your answer. Reference specific data from the user's history when answering.

If there's no follow_up needed, omit that field.
If no PRs detected, set "prs" to [].`
}
```

### 3C. Nutritionist System Prompt

Create at `app/lib/agents/prompts/nutritionist.ts`:

```typescript
export function buildNutritionistPrompt(context: NutritionistContext): string {
  return `You are the SociusFit Nutritionist — a sports nutritionist specializing in performance fueling. You are part of a coaching team that includes a Trainer and a cross-domain analyst (Socius).

## Your Personality
- Practical, not preachy — you think in terms of "fueling training" not "dieting"
- You frame everything around performance impact
- You're specific with numbers — always tell the user their remaining macro budget
- You speak naturally about food — "that's a solid post-workout plate" not "your macronutrient intake is adequate"
- Keep responses concise — mobile app, not a nutrition textbook
- Never use emojis in your text (the UI adds agent icons separately)

## Your Responsibilities
1. Parse meal input (text, voice transcript, or photo analysis) into structured items with macros
2. Track running daily totals against targets
3. Apply smart defaults for missing portions
4. Always report remaining macro budget after logging a meal
5. Suggest meal timing relative to workout schedule
6. Answer questions about nutrition, macros, and fueling

## User's Daily Targets
- Protein: ${context.targets.protein}g
- Carbs: ${context.targets.carbs}g
- Fat: ${context.targets.fat}g
- Calories: ${context.targets.calories}

## Today's Meals So Far
${context.todays_meals.length > 0 ? context.todays_meals.map(m => `${m.meal_timing} (${m.timestamp}): ${m.items_summary} → ${m.totals.protein}g P / ${m.totals.carbs}g C / ${m.totals.fat}g F / ${m.totals.calories} cal`).join('\n') : 'No meals logged yet today'}

## Running Totals
- Consumed: ${context.today.macro_totals.protein}g P / ${context.today.macro_totals.carbs}g C / ${context.today.macro_totals.fat}g F / ${context.today.macro_totals.calories} cal
- Remaining: ${context.today.macro_remaining.protein}g P / ${context.today.macro_remaining.carbs}g C / ${context.today.macro_remaining.fat}g F / ${context.today.macro_remaining.calories} cal

## Today's Workout Status
${context.today.workout_logged ? 'Workout completed: ' + context.today.workout_summary : 'No workout logged yet'}

## Portion Defaults (use when user doesn't specify portions)
- Meat/Fish: 5 oz (midpoint of 4-6 oz range)
- Grains (rice, pasta, etc.): 1 cup cooked
- Vegetables: 1 cup
- Cooking fats/oils: 1 tbsp
- Nuts: 1 oz
- Cheese: 1 oz
- Eggs: 1 large
- Bread: 1 slice
- Fruit: 1 medium piece or 1 cup

## Macro Validation Ranges (per meal)
- Protein: 0-200g (flag if >100g for a single meal)
- Carbs: 0-300g (flag if >150g)
- Fat: 0-150g (flag if >80g)
- Calories: 0-2000 (flag if >1200)
- Calorie cross-check: calculated calories must be within 10% of (protein*4 + carbs*4 + fat*9)

## Meal Timing Rules
- Infer from time of day if not specified:
  - Before 10am → BREAKFAST
  - 10am-2pm → LUNCH or PRE_WORKOUT (if workout scheduled/not yet done)
  - 2pm-5pm → SNACK
  - 5pm-9pm → DINNER or POST_WORKOUT (if workout just completed)
  - After 9pm → SNACK
- If user specifies timing explicitly, use that

## Smart Default Rules
- Missing portion → Use default from list above. Mark item as is_estimated: true. Only ASK if the difference would swing protein by >15g OR calories by >100.
- Missing cooking method → Assume grilled/baked (lean preparation). Only ASK if fried vs. grilled would change fat by >10g.
- Ambiguous food item → List what you identified. ASK about unclear items only.
- Missing meal timing → Infer from time of day. Do NOT ask.
- Photo with unclear items → Identify what you can. ASK only about items you truly cannot identify.
- Number of servings → Assume 1 unless photo clearly shows multiple portions.

## Confidence Scoring
- 1.0: Specific items with exact portions ("6oz chicken breast, 1 cup brown rice")
- 0.8-0.9: Specific items, portions estimated but reasonable
- 0.6-0.7: General items, significant estimation ("grilled chicken with rice" — no portions)
- <0.6: Unclear items or very rough estimation

## Response Format
Respond with ONLY valid JSON. No other text.

\`\`\`json
{
  "message": "Your conversational response. Always include remaining macro budget. 1-3 sentences for meal logs, longer for questions.",
  "meal": {
    "items": [
      {
        "name": "Food item name",
        "quantity": "Amount with unit e.g. '6 oz'",
        "protein": 0,
        "carbs": 0,
        "fat": 0,
        "calories": 0,
        "is_estimated": false
      }
    ],
    "totals": { "protein": 0, "carbs": 0, "fat": 0, "calories": 0 },
    "meal_timing": "PRE_WORKOUT|POST_WORKOUT|BREAKFAST|LUNCH|DINNER|SNACK",
    "confidence": 0.0-1.0,
    "estimated_items": ["item names where portions were defaulted"]
  },
  "daily_status": {
    "consumed": { "protein": 0, "carbs": 0, "fat": 0, "calories": 0 },
    "remaining": { "protein": 0, "carbs": 0, "fat": 0, "calories": 0 },
    "adherence": 0.0-1.0
  },
  "follow_up": {
    "question": "Question to ask the user",
    "impact": "e.g. ~20g protein difference",
    "default_if_skipped": "what we'll use if they don't answer"
  }
}
\`\`\`

If the input is a QUESTION (not a meal log), omit the "meal" field and just provide "message" and "daily_status".

If no follow_up needed, omit that field.`
}
```

### 3D. Socius System Prompt

Create at `app/lib/agents/prompts/socius.ts`:

```typescript
export function buildSociusPrompt(context: SociusContext): string {
  return `You are Socius — the cross-domain analyst on the SociusFit coaching team. You work alongside a Trainer and a Nutritionist. Your job is to find meaningful correlations between training, nutrition, and recovery data.

## Your Personality
- Thoughtful and measured — you don't speak often, but when you do, it's backed by data
- You distinguish between strong correlations (>10 data points, clear trend) and emerging signals (<10 data points)
- You're specific: "15% higher" not "better", "12 points higher" not "improved"
- You provide actionable suggestions when the data supports them
- You never overstate weak signals — "early signal worth watching" is fine
- You're genuinely curious about patterns — this comes through in how you present findings
- Never use emojis in your text (the UI adds agent icons separately)

## Your Activation Modes
1. **Explicit query**: User asks a cross-domain question → provide detailed analysis
2. **Background check**: Called after a log entry → check for pattern matches → queue insights

## Data Availability
- Workout data: ${context.data_availability.workout_data_days} days
- Nutrition data: ${context.data_availability.nutrition_data_days} days
- WHOOP data: ${context.data_availability.whoop_data_days} days
- Days with workout + nutrition: ${context.data_availability.paired_workout_nutrition_days}
- Days with workout + WHOOP: ${context.data_availability.paired_workout_whoop_days}

## 30-Day Summary
- Workouts: ${context.thirty_day_summary.workout_count} across ${context.thirty_day_summary.workout_days} days
- Avg daily macros: ${context.thirty_day_summary.avg_daily_protein}g P / ${context.thirty_day_summary.avg_daily_carbs}g C / ${context.thirty_day_summary.avg_daily_fat}g F / ${context.thirty_day_summary.avg_daily_calories} cal
- Avg recovery: ${context.thirty_day_summary.avg_recovery ?? 'N/A'}
- Avg strain: ${context.thirty_day_summary.avg_strain ?? 'N/A'}
- Avg sleep: ${context.thirty_day_summary.avg_sleep_score ?? 'N/A'}

## Recently Surfaced Insights (avoid repeating these)
${context.recent_insights.map(i => `[${i.pattern_id}] ${i.content.substring(0, 80)}... (${i.created_at})`).join('\n') || 'No recent insights'}

## Pattern Detection Library

### URGENT PATTERNS (push to chat immediately)

**CAL_DEF — Caloric Deficit Alert**
- Minimum data: 7 days nutrition
- Trigger: <70% calorie target for 5+ of last 7 days
- Priority: urgent

**OVER_TRN — Overtraining Signal**
- Minimum data: 7 days with WHOOP + workout
- Trigger: High volume (>4 workouts/week) + declining recovery (3+ consecutive drops or avg <40)
- Priority: urgent

**HYDRA — Dehydration/Sleep Quality Flag**
- Minimum data: 7 days with WHOOP
- Trigger: Sustained low HRV (<user's 30-day avg minus 15%) + declining sleep efficiency (<70% for 3+ days)
- Priority: urgent

### NOTABLE PATTERNS (show at start of next interaction)

**NUT_PERF — Nutrition → Performance**
- Minimum data: 5 workouts with pre-workout meal data
- Analysis: Compare workout scores when pre-workout carbs >30g vs <30g (within 2hrs)
- Priority: notable (if >10 data points), informational (if 5-10)

**REC_VOL — Recovery → Volume Tolerance**
- Minimum data: 7 days with WHOOP + workout
- Analysis: Correlate recovery score with same-day workout score/completion
- Priority: notable

**PRO_REC — Protein → Recovery**
- Minimum data: 14 days with nutrition + WHOOP
- Analysis: Correlate protein adherence % with next-day recovery score
- Priority: notable

### INFORMATIONAL PATTERNS (accumulate in insights section)

**CON_PROG — Consistency → Progress**
- Minimum data: 30 days of workout data
- Analysis: Detect frequency streaks, correlate with benchmark improvements
- Priority: informational

**SLEEP_PERF — Sleep → Performance**
- Minimum data: 10 days with WHOOP + workout
- Analysis: Correlate sleep score with next-day workout performance
- Priority: informational

## Response Format for Explicit Queries
Respond with ONLY valid JSON.

\`\`\`json
{
  "message": "Your analytical response. Be specific with numbers and data. Distinguish strong vs emerging signals.",
  "analysis": {
    "pattern": "NUT_PERF|REC_VOL|PRO_REC|CON_PROG|CAL_DEF|OVER_TRN|SLEEP_PERF|HYDRA",
    "confidence": "strong|emerging|weak",
    "data_points": 0,
    "supporting_data": {
      "description of relevant data points and comparisons"
    }
  }
}
\`\`\`

## Response Format for Background Pattern Checks
When called in background mode, check ALL patterns whose minimum data requirements are met. Return any detected insights.

\`\`\`json
{
  "insights": [
    {
      "pattern_id": "CAL_DEF",
      "priority": "urgent|notable|informational",
      "confidence": "strong|emerging|weak",
      "content": "The specific insight message to show the user",
      "data_points": 0,
      "data_context": { "supporting data" },
      "actionable_suggestion": "Optional concrete suggestion"
    }
  ]
}
\`\`\`

If no patterns detected, return: { "insights": [] }`
}
```

---

## 4. Passive Context Builders

Create at `app/lib/agents/context-builder.ts`:

```typescript
import { createServerClient } from '@/app/lib/auth/supabase-server'
import type {
  PassiveContext, TrainerContext, NutritionistContext, SociusContext,
  MacroTotals, MacroTargets, UserDailyState, UserWeeklyState,
  RecentWorkout, BenchmarkPR, MealSummary, ThirtyDaySummary,
  DataAvailability, RecentInsight, ChatMessage, InsightPriority
} from './types'

// ============================================================
// BASE CONTEXT (shared by all agents)
// ============================================================

export async function buildPassiveContext(userId: string): Promise<PassiveContext> {
  const supabase = await createServerClient()
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const weekStart = getWeekStart(now).toISOString().split('T')[0]

  // Parallel fetch all base context data
  const [
    targets,
    todaysMeals,
    todaysWorkout,
    whoopToday,
    weekWorkouts,
    weekMeals,
    recentChat,
    pendingInsights
  ] = await Promise.all([
    fetchDailyTargets(supabase, userId, today),
    fetchTodaysMeals(supabase, userId, today),
    fetchTodaysWorkout(supabase, userId, today),
    fetchTodaysWhoop(supabase, userId, today),
    fetchWeekWorkouts(supabase, userId, weekStart, today),
    fetchWeekMeals(supabase, userId, weekStart, today),
    fetchRecentChat(supabase, userId, 5),
    fetchPendingInsights(supabase, userId)
  ])

  const mealTotals = aggregateMacros(todaysMeals)
  const macroRemaining = calculateRemaining(targets, mealTotals)

  const todayState: UserDailyState = {
    workout_logged: todaysWorkout !== null,
    workout_summary: todaysWorkout?.summary || undefined,
    meals_count: todaysMeals.length,
    macro_totals: mealTotals,
    macro_remaining: macroRemaining,
    recovery_score: whoopToday?.recovery_score ?? null,
    strain_score: whoopToday?.strain_score ?? null,
    sleep_score: whoopToday?.sleep_score ?? null
  }

  const weekState: UserWeeklyState = {
    workouts_count: weekWorkouts.length,
    avg_adherence: calculateWeekAdherence(weekMeals, targets),
    recovery_trend: calculateRecoveryTrend(whoopToday?.recent_recovery || [])
  }

  return {
    user_id: userId,
    targets,
    today: todayState,
    week: weekState,
    recent_chat: recentChat,
    pending_insights: {
      count: pendingInsights.length,
      highest_priority: pendingInsights[0]?.priority ?? null
    },
    current_time: now.toISOString(),
    day_of_week: now.toLocaleDateString('en-US', { weekday: 'long' }),
    has_whoop: whoopToday !== null
  }
}

// ============================================================
// TRAINER CONTEXT
// ============================================================

export async function buildTrainerContext(userId: string): Promise<TrainerContext> {
  const [base, supabase] = await Promise.all([
    buildPassiveContext(userId),
    createServerClient()
  ])

  const [recentWorkouts, benchmarkPrs, todaysProgram] = await Promise.all([
    fetchRecentWorkouts(supabase, userId, 10),
    fetchBenchmarkPRs(supabase, userId),
    fetchTodaysProgram() // from Google Sheets
  ])

  return {
    ...base,
    recent_workouts: recentWorkouts,
    benchmark_prs: benchmarkPrs,
    todays_program: todaysProgram,
    movement_aliases: MOVEMENT_ALIASES
  }
}

// ============================================================
// NUTRITIONIST CONTEXT
// ============================================================

export async function buildNutritionistContext(userId: string): Promise<NutritionistContext> {
  const [base, supabase] = await Promise.all([
    buildPassiveContext(userId),
    createServerClient()
  ])

  const todaysMeals = await fetchTodaysMealDetails(supabase, userId)

  return {
    ...base,
    todays_meals: todaysMeals,
    portion_defaults: PORTION_DEFAULTS,
    user_portion_history: null // TODO: build from historical meal data
  }
}

// ============================================================
// SOCIUS CONTEXT
// ============================================================

export async function buildSociusContext(userId: string): Promise<SociusContext> {
  const [base, supabase] = await Promise.all([
    buildPassiveContext(userId),
    createServerClient()
  ])

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

  const [summary, availability, recentInsights] = await Promise.all([
    fetchThirtyDaySummary(supabase, userId, thirtyDaysAgoStr),
    fetchDataAvailability(supabase, userId, thirtyDaysAgoStr),
    fetchRecentInsights(supabase, userId, 10)
  ])

  return {
    ...base,
    thirty_day_summary: summary,
    data_availability: availability,
    recent_insights: recentInsights
  }
}

// ============================================================
// DATA FETCHERS (implement these using existing Supabase patterns)
// ============================================================

async function fetchDailyTargets(supabase: any, userId: string, date: string): Promise<MacroTargets> {
  const { data } = await supabase
    .from('daily_targets')
    .select('target_protein, target_carbs, target_fat, target_calories')
    .eq('date', date)
    .single()

  return data ? {
    protein: data.target_protein,
    carbs: data.target_carbs,
    fat: data.target_fat,
    calories: data.target_calories
  } : { protein: 0, carbs: 0, fat: 0, calories: 0 }
}

async function fetchTodaysMeals(supabase: any, userId: string, date: string): Promise<any[]> {
  const startOfDay = `${date}T00:00:00`
  const endOfDay = `${date}T23:59:59`
  const { data } = await supabase
    .from('meals')
    .select('total_protein, total_carbs, total_fat, total_calories')
    .gte('meal_timestamp', startOfDay)
    .lte('meal_timestamp', endOfDay)
  return data || []
}

async function fetchTodaysMealDetails(supabase: any, userId: string): Promise<MealSummary[]> {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('meals')
    .select('id, meal_timestamp, items, total_protein, total_carbs, total_fat, total_calories, meal_timing')
    .gte('meal_timestamp', `${today}T00:00:00`)
    .lte('meal_timestamp', `${today}T23:59:59`)
    .order('meal_timestamp', { ascending: true })

  return (data || []).map((m: any) => ({
    id: m.id,
    timestamp: m.meal_timestamp,
    items_summary: (m.items?.items || []).map((i: any) => `${i.name} ${i.quantity || ''}`).join(', '),
    totals: { protein: m.total_protein, carbs: m.total_carbs, fat: m.total_fat, calories: m.total_calories },
    meal_timing: m.meal_timing || 'SNACK'
  }))
}

async function fetchTodaysWorkout(supabase: any, userId: string, date: string): Promise<any> {
  const { data } = await supabase
    .from('workouts')
    .select('id, blocks, primary_score, total_duration_min, tags')
    .eq('workout_date', date)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) return null
  const blockSummaries = (data.blocks?.blocks || data.blocks || [])
    .map((b: any) => `${b.block_type}${b.duration_min ? ' ' + b.duration_min + 'min' : ''}`)
    .join(', ')
  return { ...data, summary: blockSummaries + (data.primary_score ? ' — ' + data.primary_score : '') }
}

async function fetchTodaysWhoop(supabase: any, userId: string, date: string): Promise<any> {
  const { data: recovery } = await supabase
    .from('whoop_recovery')
    .select('recovery_score')
    .eq('date', date)
    .single()

  if (!recovery) return null

  const { data: strain } = await supabase
    .from('whoop_cycles')
    .select('strain_score')
    .eq('date', date)
    .single()

  const { data: sleep } = await supabase
    .from('whoop_sleep')
    .select('score')
    .eq('date', date)
    .single()

  // Fetch last 7 days recovery for trend
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const { data: recentRecovery } = await supabase
    .from('whoop_recovery')
    .select('recovery_score, date')
    .gte('date', sevenDaysAgo.toISOString().split('T')[0])
    .order('date', { ascending: true })

  return {
    recovery_score: recovery.recovery_score,
    strain_score: strain?.strain_score ?? null,
    sleep_score: sleep?.score ?? null,
    recent_recovery: recentRecovery || []
  }
}

async function fetchWeekWorkouts(supabase: any, userId: string, weekStart: string, today: string): Promise<any[]> {
  const { data } = await supabase
    .from('workouts')
    .select('id, workout_date')
    .gte('workout_date', weekStart)
    .lte('workout_date', today)
  return data || []
}

async function fetchWeekMeals(supabase: any, userId: string, weekStart: string, today: string): Promise<any[]> {
  const { data } = await supabase
    .from('daily_summaries')
    .select('*')
    .gte('date', weekStart)
    .lte('date', today)
  return data || []
}

async function fetchRecentChat(supabase: any, userId: string, limit: number): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data || []).reverse() // oldest first
}

async function fetchPendingInsights(supabase: any, userId: string): Promise<any[]> {
  const { data } = await supabase
    .from('insights')
    .select('id, priority, pattern_id')
    .is('surfaced_at', null)
    .order('created_at', { ascending: false })
  return data || []
}

async function fetchRecentWorkouts(supabase: any, userId: string, limit: number): Promise<RecentWorkout[]> {
  const { data } = await supabase
    .from('workouts')
    .select('id, workout_date, blocks, primary_score, rpe, tags')
    .order('workout_date', { ascending: false })
    .limit(limit)

  return (data || []).map((w: any) => ({
    id: w.id,
    date: w.workout_date,
    blocks_summary: (w.blocks?.blocks || w.blocks || [])
      .map((b: any) => {
        const movements = (b.movements || []).map((m: any) => m.name).join(', ')
        return `${b.block_type}: ${movements}`
      }).join(' | '),
    primary_score: w.primary_score,
    rpe: w.rpe,
    tags: w.tags || []
  }))
}

async function fetchBenchmarkPRs(supabase: any, userId: string): Promise<BenchmarkPR[]> {
  const { data } = await supabase
    .from('benchmark_prs')
    .select('benchmark_name, score_display, score_value, date, rx_status')
    .eq('is_pr', true)
    .order('date', { ascending: false })
    .limit(20)
  return data || []
}

async function fetchTodaysProgram(): Promise<string | null> {
  // TODO: Integrate with existing Google Sheets fetch
  // Uses GOOGLE_SHEETS_API_KEY and existing /api/workouts pattern
  return null
}

async function fetchThirtyDaySummary(supabase: any, userId: string, since: string): Promise<ThirtyDaySummary> {
  const [workouts, meals, whoop] = await Promise.all([
    supabase.from('workouts').select('id, workout_date').gte('workout_date', since),
    supabase.from('daily_summaries').select('*').gte('date', since),
    supabase.from('whoop_recovery').select('recovery_score, date').gte('date', since)
  ])

  const workoutData = workouts.data || []
  const mealData = meals.data || []
  const whoopData = whoop.data || []

  const avgMacros = mealData.length > 0 ? {
    protein: Math.round(mealData.reduce((s: number, d: any) => s + (d.total_protein || 0), 0) / mealData.length),
    carbs: Math.round(mealData.reduce((s: number, d: any) => s + (d.total_carbs || 0), 0) / mealData.length),
    fat: Math.round(mealData.reduce((s: number, d: any) => s + (d.total_fat || 0), 0) / mealData.length),
    calories: Math.round(mealData.reduce((s: number, d: any) => s + (d.total_calories || 0), 0) / mealData.length)
  } : { protein: 0, carbs: 0, fat: 0, calories: 0 }

  return {
    workout_count: workoutData.length,
    avg_daily_protein: avgMacros.protein,
    avg_daily_carbs: avgMacros.carbs,
    avg_daily_fat: avgMacros.fat,
    avg_daily_calories: avgMacros.calories,
    avg_recovery: whoopData.length > 0
      ? Math.round(whoopData.reduce((s: number, d: any) => s + d.recovery_score, 0) / whoopData.length)
      : null,
    avg_strain: null, // TODO: fetch from whoop_cycles
    avg_sleep_score: null, // TODO: fetch from whoop_sleep
    workout_days: new Set(workoutData.map((w: any) => w.workout_date)).size,
    nutrition_days: mealData.length,
    whoop_days: whoopData.length
  }
}

async function fetchDataAvailability(supabase: any, userId: string, since: string): Promise<DataAvailability> {
  const [workouts, meals, whoop] = await Promise.all([
    supabase.from('workouts').select('workout_date').gte('workout_date', since),
    supabase.from('daily_summaries').select('date').gte('date', since),
    supabase.from('whoop_recovery').select('date').gte('date', since)
  ])

  const workoutDates = new Set((workouts.data || []).map((w: any) => w.workout_date))
  const mealDates = new Set((meals.data || []).map((m: any) => m.date))
  const whoopDates = new Set((whoop.data || []).map((w: any) => w.date))

  let pairedWN = 0, pairedWW = 0
  workoutDates.forEach(d => {
    if (mealDates.has(d)) pairedWN++
    if (whoopDates.has(d)) pairedWW++
  })

  return {
    has_whoop: whoopDates.size > 0,
    workout_data_days: workoutDates.size,
    nutrition_data_days: mealDates.size,
    whoop_data_days: whoopDates.size,
    paired_workout_nutrition_days: pairedWN,
    paired_workout_whoop_days: pairedWW
  }
}

async function fetchRecentInsights(supabase: any, userId: string, limit: number): Promise<RecentInsight[]> {
  const { data } = await supabase
    .from('insights')
    .select('id, pattern_id, content, created_at, surfaced_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function aggregateMacros(meals: any[]): MacroTotals {
  return meals.reduce((acc, m) => ({
    protein: acc.protein + (m.total_protein || 0),
    carbs: acc.carbs + (m.total_carbs || 0),
    fat: acc.fat + (m.total_fat || 0),
    calories: acc.calories + (m.total_calories || 0)
  }), { protein: 0, carbs: 0, fat: 0, calories: 0 })
}

function calculateRemaining(targets: MacroTargets, consumed: MacroTotals): MacroTotals {
  return {
    protein: Math.max(0, targets.protein - consumed.protein),
    carbs: Math.max(0, targets.carbs - consumed.carbs),
    fat: Math.max(0, targets.fat - consumed.fat),
    calories: Math.max(0, targets.calories - consumed.calories)
  }
}

function calculateWeekAdherence(dailySummaries: any[], targets: MacroTargets): number {
  if (dailySummaries.length === 0) return 0
  const adherences = dailySummaries.map(d => {
    const proteinAdh = Math.min(1, (d.total_protein || 0) / Math.max(1, targets.protein))
    const carbsAdh = Math.min(1, (d.total_carbs || 0) / Math.max(1, targets.carbs))
    const fatAdh = Math.min(1, (d.total_fat || 0) / Math.max(1, targets.fat))
    return proteinAdh * 0.4 + carbsAdh * 0.3 + fatAdh * 0.3
  })
  return adherences.reduce((s, a) => s + a, 0) / adherences.length
}

function calculateRecoveryTrend(recentRecovery: any[]): 'up' | 'down' | 'stable' | 'unknown' {
  if (recentRecovery.length < 3) return 'unknown'
  const recent3 = recentRecovery.slice(-3)
  const avg = recent3.reduce((s: number, r: any) => s + r.recovery_score, 0) / 3
  const older = recentRecovery.slice(0, -3)
  if (older.length === 0) return 'stable'
  const olderAvg = older.reduce((s: number, r: any) => s + r.recovery_score, 0) / older.length
  if (avg > olderAvg + 5) return 'up'
  if (avg < olderAvg - 5) return 'down'
  return 'stable'
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday start
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// ============================================================
// CONSTANTS
// ============================================================

const MOVEMENT_ALIASES: Record<string, string> = {
  'PU': 'Pull-up', 'DL': 'Deadlift', 'BS': 'Back Squat', 'FS': 'Front Squat',
  'OHS': 'Overhead Squat', 'C&J': 'Clean and Jerk', 'S2OH': 'Shoulder to Overhead',
  'HSPU': 'Handstand Push-up', 'MU': 'Muscle-up', 'T2B': 'Toes to Bar',
  'K2E': 'Knees to Elbows', 'WB': 'Wall Ball', 'BJ': 'Box Jump',
  'DU': 'Double Under', 'SU': 'Single Under', 'KBS': 'Kettlebell Swing',
  'PC': 'Power Clean', 'SC': 'Squat Clean', 'PSn': 'Power Snatch',
  'SSn': 'Squat Snatch', 'PP': 'Push Press', 'PJ': 'Push Jerk', 'SJ': 'Split Jerk'
}

const PORTION_DEFAULTS: Record<string, string> = {
  'meat': '5 oz', 'fish': '5 oz', 'chicken': '5 oz', 'beef': '5 oz',
  'rice': '1 cup cooked', 'pasta': '1 cup cooked', 'bread': '1 slice',
  'vegetables': '1 cup', 'broccoli': '1 cup', 'spinach': '1 cup',
  'oil': '1 tbsp', 'butter': '1 tbsp', 'nuts': '1 oz', 'cheese': '1 oz',
  'eggs': '1 large', 'fruit': '1 medium', 'potato': '1 medium',
  'sweet potato': '1 medium', 'avocado': '1/2 medium'
}
```

---

## 5. API Route Specifications

### POST /api/agent/process (Unified Entry Point)

This is the single endpoint the UI calls. It handles classification, routing, and response assembly.

Create at `app/api/agent/process/route.ts`:

```typescript
// Pseudocode structure — Kiro implements the full version

import { createServerClient } from '@/app/lib/auth/supabase-server'
import { NextResponse } from 'next/server'
import { buildClassifierPrompt } from '@/app/lib/agents/prompts/classifier'
import { buildTrainerPrompt } from '@/app/lib/agents/prompts/trainer'
import { buildNutritionistPrompt } from '@/app/lib/agents/prompts/nutritionist'
import { buildSociusPrompt } from '@/app/lib/agents/prompts/socius'
import { buildPassiveContext, buildTrainerContext, buildNutritionistContext, buildSociusContext } from '@/app/lib/agents/context-builder'
import type { AgentRequest, AgentResponse, ClassifierOutput } from '@/app/lib/agents/types'

export async function POST(request: Request) {
  const supabase = await createServerClient()

  // 1. Authenticate
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse request
  const body: AgentRequest = await request.json()

  // 3. Save user message to chat_messages
  await supabase.from('chat_messages').insert({
    role: 'user',
    content: body.input,
    input_type: body.input_mode
  })

  // 4. Build passive context + classify
  const passiveContext = await buildPassiveContext(user.id)
  const classification = await runClassifier(body, passiveContext)

  // 5. Check for pending urgent insights to prepend
  const urgentInsights = await getUrgentInsights(supabase, user.id)

  // 6. Route to appropriate agent(s)
  const responses: AgentResponse = { messages: [], insights_surfaced: urgentInsights }

  // Prepend urgent insights
  for (const insight of urgentInsights) {
    responses.messages.push({
      role: 'socius',
      content: `Heads up: ${insight.content}`,
      related_entity_type: 'insight'
    })
    // Mark as surfaced
    await supabase.from('insights').update({ surfaced_at: new Date().toISOString() }).eq('id', insight.id)
  }

  if (classification.input_type === 'unclear' && classification.confidence < 0.5) {
    // Ask clarification
    responses.messages.push({
      role: 'system',
      content: 'I\'m not sure what you\'d like to log. Could you clarify — is this a workout, a meal, or a question?'
    })
  } else if (classification.domains.includes('trainer') && !classification.domains.includes('nutritionist')) {
    // Single domain: Trainer
    const trainerContext = await buildTrainerContext(user.id)
    const trainerResponse = await runTrainer(body, classification, trainerContext)

    // Save workout to database if applicable
    if (trainerResponse.workout) {
      const workoutId = await saveWorkout(supabase, trainerResponse, body, classification)
      responses.messages.push({
        role: 'trainer',
        content: trainerResponse.message,
        related_entity_id: workoutId,
        related_entity_type: 'workout'
      })
    } else {
      responses.messages.push({ role: 'trainer', content: trainerResponse.message })
    }

    if (trainerResponse.follow_up) {
      responses.follow_up = { question: trainerResponse.follow_up.question, agent: 'trainer' }
    }

    // Trigger async Socius pattern check
    triggerSociusCheck(user.id, 'workout_logged')

  } else if (classification.domains.includes('nutritionist') && !classification.domains.includes('trainer')) {
    // Single domain: Nutritionist
    const nutritionistContext = await buildNutritionistContext(user.id)
    const nutritionistResponse = await runNutritionist(body, classification, nutritionistContext)

    // Save meal to database if applicable
    if (nutritionistResponse.meal) {
      const mealId = await saveMeal(supabase, nutritionistResponse, body)
      responses.messages.push({
        role: 'nutritionist',
        content: nutritionistResponse.message,
        related_entity_id: mealId,
        related_entity_type: 'meal'
      })
    } else {
      responses.messages.push({ role: 'nutritionist', content: nutritionistResponse.message })
    }

    if (nutritionistResponse.follow_up) {
      responses.follow_up = { question: nutritionistResponse.follow_up.question, agent: 'nutritionist' }
    }

    // Trigger async Socius pattern check
    triggerSociusCheck(user.id, 'meal_logged')

  } else if (classification.domains.includes('socius')) {
    // Socius query
    const sociusContext = await buildSociusContext(user.id)
    const sociusResponse = await runSocius(body, sociusContext)
    responses.messages.push({ role: 'socius', content: sociusResponse.message })

  } else if (classification.domains.length > 1) {
    // Multi-domain: run sequentially, synthesize
    // Process trainer first (if applicable), then nutritionist
    // Both responses included in messages array
    // Kiro: implement based on single-domain patterns above
  }

  // 7. Save agent responses to chat_messages
  for (const msg of responses.messages) {
    await supabase.from('chat_messages').insert({
      role: msg.role,
      content: msg.content,
      domain: msg.role === 'system' ? null : msg.role,
      related_entity_id: msg.related_entity_id,
      related_entity_type: msg.related_entity_type
    })
  }

  return NextResponse.json(responses)
}
```

---

## 6. Database Additions

Run these migrations in Supabase SQL Editor:

```sql
-- ============================================================
-- INSIGHTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  pattern_id TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('urgent', 'notable', 'informational')),
  confidence TEXT CHECK (confidence IN ('strong', 'emerging', 'weak')),
  content TEXT NOT NULL,
  data_context JSONB,
  data_points INTEGER,
  actionable_suggestion TEXT,
  surfaced_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own insights"
  ON insights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own insights"
  ON insights FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own insights"
  ON insights FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own insights"
  ON insights FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_insights_user_pending ON insights(user_id) WHERE surfaced_at IS NULL;
CREATE INDEX idx_insights_user_priority ON insights(user_id, priority) WHERE surfaced_at IS NULL;
CREATE INDEX idx_insights_user_id ON insights(user_id);

-- ============================================================
-- CHAT MESSAGES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'trainer', 'nutritionist', 'socius', 'system')),
  content TEXT NOT NULL,
  input_type TEXT CHECK (input_type IN ('text', 'voice', 'photo', 'file')),
  domain TEXT CHECK (domain IN ('trainer', 'nutritionist', 'socius')),
  confidence FLOAT,
  related_entity_id UUID,
  related_entity_type TEXT CHECK (related_entity_type IN ('workout', 'meal', 'insight')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own messages"
  ON chat_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own messages"
  ON chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own messages"
  ON chat_messages FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_chat_user_recent ON chat_messages(user_id, created_at DESC);
CREATE INDEX idx_chat_user_id ON chat_messages(user_id);
```

---

## 7. UI Specification

### Single-Page Layout (`app/v2/page.tsx`)

```
┌─────────────────────────────────────┐
│ HEADER                              │
│ SociusFit                    [⚡ 73]│  Recovery badge (green/yellow/red)
├─────────────────────────────────────┤
│                                     │
│ TODAY'S WORKOUT CARD (collapsible)  │  Fetched from Google Sheets
│ ┌─────────────────────────────────┐ │  Shows program text
│ │ Back Squat 5x5                  │ │  Status: [Logged ✓] or [Not yet]
│ │ Then: 12min AMRAP: 5 PU, 10... │ │  Tapping "Not yet" scrolls to input
│ └─────────────────────────────────┘ │
│                                     │
│ URGENT INSIGHT BANNER (if any)      │  Red-tinted card
│ ┌─────────────────────────────────┐ │  Socius urgent insight
│ │ ⚠ You've been under calories... │ │  [Dismiss] button
│ └─────────────────────────────────┘ │
│                                     │
│ CHAT AREA (scrollable)              │
│ ┌─────────────────────────────────┐ │
│ │ 🏋️ Trainer                      │ │  Agent icon + name in small label
│ │ Solid session. 7+5 on that      │ │  Message body
│ │ AMRAP — consistent with your    │ │
│ │ recent 12-min pieces.           │ │
│ │                          10:32a │ │  Timestamp
│ │                                 │ │
│ │ 🍽️ Nutritionist                 │ │
│ │ Got it — 42g P, 55g C, 12g F.  │ │
│ │ You've got 45g P and 60g C     │ │
│ │ left for the day.              │ │
│ │                          12:15p │ │
│ │                                 │ │
│ │ You                             │ │  User messages aligned right
│ │           How does my protein   │ │
│ │           affect my recovery?   │ │
│ │                          2:30p  │ │
│ │                                 │ │
│ │ 📊 Socius                       │ │
│ │ Looking at the last 3 weeks,    │ │
│ │ days where you hit 80%+ of     │ │
│ │ your protein target show...    │ │
│ │                          2:31p  │ │
│ └─────────────────────────────────┘ │
│                                     │
├─────────────────────────────────────┤
│ INPUT BAR (always visible)          │
│ [🎤] [  Type a workout, meal...  ] │  Placeholder text
│       [📷] [📁]                     │  Camera, file picker
├─────────────────────────────────────┤
│ BOTTOM NAV                          │
│ [💬 Chat] [📊 Insights 3] [🏆 PRs] │  Badge on Insights = unread count
└─────────────────────────────────────┘
```

### Agent Icons & Colors
| Agent | Icon | Label Color | Message Bg |
|-------|------|-------------|------------|
| Trainer | 🏋️ | `text-blue-700` | `bg-blue-50` |
| Nutritionist | 🍽️ | `text-green-700` | `bg-green-50` |
| Socius | 📊 | `text-purple-700` | `bg-purple-50` |
| System | ⚙️ | `text-gray-500` | `bg-gray-50` |
| User | — | `text-gray-900` | `bg-white` (right-aligned) |

### Bottom Nav Tabs

**Chat** (default): The main conversation view described above.

**Insights**: List of Socius insights, sorted by priority then date. Each card shows pattern type, content, data points, confidence level, and a dismiss button. Unread badge shows count of unsurfaced notable + informational insights.

**PRs**: Benchmark PR board. List of benchmarks with best score, date, rx status. Sorted by most recent PR first.

---

## 8. Kiro Steering File

Create this as `.kiro/steering/agent-system.md` in the project:

```markdown
---
inclusion: fileMatch
fileMatchPattern: '**/{agent,agents,v2}/**/*.{ts,tsx}'
---

# Agent System Development Guide

## CRITICAL: Read Before Making Changes

This project is implementing a multi-agent system following the Vercel AGENTS.md research findings.
The core principle: **passive context embedded in system prompts beats on-demand skill invocation**.

## Architecture Rules — DO NOT VIOLATE

1. **Every agent gets full passive context in its system prompt.** Never require an agent to "decide" to fetch information. If it might need it, include it.
2. **The Classifier is NOT conversational.** It returns JSON only. It does not talk to the user.
3. **Agents return JSON.** The API route assembles responses. Agents do not format for the UI.
4. **Smart defaults over follow-up questions.** Only ask the user when the impact of the ambiguity exceeds the thresholds defined in each agent's prompt.
5. **Socius pattern checks are async.** They do not block the user's response. Fire and forget after logging.

## File Structure

```
app/
├── api/
│   ├── agent/
│   │   └── process/route.ts       ← Unified entry point (classify → route → respond)
│   ├── parse-workout/             ← EXISTING: DO NOT MODIFY (keep as fallback)
│   ├── meals/                     ← EXISTING: DO NOT MODIFY (keep as fallback)
│   ├── query/                     ← EXISTING: DO NOT MODIFY (will be replaced by Socius)
│   └── whoop/                     ← EXISTING: DO NOT MODIFY
├── lib/
│   ├── agents/
│   │   ├── types.ts               ← All TypeScript interfaces for agent system
│   │   ├── context-builder.ts     ← Builds passive context for each agent
│   │   └── prompts/
│   │       ├── classifier.ts      ← Classifier system prompt builder
│   │       ├── trainer.ts         ← Trainer system prompt builder
│   │       ├── nutritionist.ts    ← Nutritionist system prompt builder
│   │       └── socius.ts          ← Socius system prompt builder
│   ├── auth/                      ← EXISTING: DO NOT MODIFY
│   ├── whoop/                     ← EXISTING: DO NOT MODIFY
│   └── ...existing utils          ← EXISTING: USE these (imageUtils, macro-validation, etc.)
└── v2/
    ├── page.tsx                   ← Single-page mobile UI
    └── components/
        ├── ChatArea.tsx
        ├── ChatMessage.tsx
        ├── InputBar.tsx
        ├── TodaysWorkoutCard.tsx
        ├── UrgentInsightBanner.tsx
        ├── InsightsTab.tsx
        └── PRsTab.tsx
```

## Existing Code to REUSE (do not rewrite)

- `app/lib/auth/*` — Authentication (createServerClient, createClient, AuthContext, ProtectedRoute)
- `app/lib/imageUtils.ts` — Image compression (compressImage)
- `app/lib/macro-validation.ts` — Macro validation (validateMacros)
- `app/lib/adherence-calculator.ts` — Adherence calculations
- `app/lib/offline-queue.ts` — Offline support
- `app/lib/whoop/*` — All WHOOP integration code
- `app/api/whoop/*` — All WHOOP API routes
- `app/api/ocr-workout/route.ts` — OCR extraction (call from Trainer agent for photo input)
- `app/api/transcribe-audio/route.ts` — Voice transcription (call from Classifier for voice input)

## Existing Code to NOT MODIFY (keep working as fallback)

- `app/api/parse-workout/route.ts` — Keep functional until Trainer agent is proven
- `app/api/meals/*` — Keep functional until Nutritionist agent is proven
- `app/api/query/route.ts` — Keep functional until Socius is proven

## API Patterns (follow existing conventions)

- Every route: authenticate first with createServerClient → auth.getUser()
- Error handling: try/catch with console.error and NextResponse.json
- Claude API: use Anthropic SDK, model 'claude-sonnet-4-20250514' for agents, 'claude-haiku-3-20241022' for classifier
- Supabase: RLS automatically filters by user_id
- Response format: { data, message } for success, { error, details } for failure

## Database

- Two new tables: `insights` and `chat_messages` (see migration SQL in build spec)
- All existing tables unchanged
- RLS enabled on both new tables
- Indexes on user_id columns

## Mobile-First UI Rules

- Touch targets: minimum 44px × 44px
- Font sizes: minimum 16px for inputs
- Use Tailwind CSS (existing project convention)
- Test on actual mobile device
- Input bar always visible (use sticky positioning)
- Chat area scrollable with overflow-y-auto
```

---

## 9. Phase 1 Task Specification

### Phase 1: Foundation — Classifier + Chat UI

**Goal:** User can interact through the new single-page UI. The Classifier routes input to existing endpoints. Chat messages are persisted and attributed to agents.

**Acceptance Criteria:**
- [ ] New route at `/v2` renders single-page mobile UI
- [ ] Input bar accepts text, triggers voice recording, opens camera, opens file picker
- [ ] Text input is classified and routed to existing `/api/parse-workout` or `/api/meals/parse-text`
- [ ] Responses appear in chat area with correct agent attribution (Trainer or Nutritionist icon)
- [ ] Chat messages are persisted in `chat_messages` table
- [ ] Chat history loads on page refresh (last 20 messages)
- [ ] Today's workout card shows program from Google Sheets (or "No program today")
- [ ] Bottom nav switches between Chat, Insights (empty for now), and PRs
- [ ] PRs tab shows data from `benchmark_prs` table
- [ ] Existing app at `/dashboard` continues to work unchanged

**Tasks (in order):**

1. **Database migration** — Run SQL to create `insights` and `chat_messages` tables
2. **Create `app/lib/agents/types.ts`** — All TypeScript interfaces
3. **Create `app/lib/agents/context-builder.ts`** — Passive context builders (can be simplified for Phase 1 — only `buildPassiveContext` needed for Classifier)
4. **Create `app/lib/agents/prompts/classifier.ts`** — Classifier prompt
5. **Create `app/api/agent/process/route.ts`** — Unified endpoint that:
   - Authenticates
   - Builds passive context
   - Calls Classifier (Claude Haiku)
   - Routes to existing `/api/parse-workout` or `/api/meals/parse-text` internally (call the handler functions directly, not via HTTP)
   - Wraps response with agent attribution
   - Saves messages to `chat_messages`
   - Returns `AgentResponse`
6. **Create `app/v2/page.tsx`** — Single-page layout with:
   - Header with app name
   - Today's workout card (fetch from existing Google Sheets endpoint)
   - Chat area (fetch from `chat_messages`, new messages via API response)
   - Input bar (text input, voice button, camera button, file button)
   - Bottom nav (Chat, Insights placeholder, PRs)
7. **Create chat components** — `ChatArea`, `ChatMessage`, `InputBar`
8. **Create bottom nav tabs** — `InsightsTab` (empty state), PRs tab (reads `benchmark_prs`)
9. **Test on mobile** — Verify touch targets, input bar visibility, scroll behavior

**What Phase 1 does NOT include:**
- Custom agent prompts (Trainer/Nutritionist/Socius) — uses existing parsing logic
- Smart defaults or follow-up questions
- Socius pattern detection
- Insights functionality
- Urgent insight banners
- Voice/photo input processing (just the UI buttons — actual processing in Phase 2)

---

## 10. Existing Code Migration Map

| Current Component | Phase 1 | Phase 2 | Phase 3 | Final State |
|------------------|---------|---------|---------|-------------|
| `/api/parse-workout` | Called by Classifier via internal function call | Replaced by Trainer agent route | — | Deprecated, can remove |
| `/api/meals/parse-text` | Called by Classifier via internal function call | Replaced by Nutritionist agent route | — | Deprecated, can remove |
| `/api/meals/upload` | Unchanged | Merged into Nutritionist (photo path) | — | Deprecated, can remove |
| `/api/query` | Unchanged (old UI still works) | Unchanged | Replaced by Socius | Deprecated, can remove |
| `/api/ocr-workout` | Unchanged | Called by Trainer for photo input | — | Utility, keep |
| `/api/transcribe-audio` | Unchanged | Called by Classifier for voice input | — | Utility, keep |
| `/api/whoop/*` | Unchanged | Unchanged | Unchanged | Keep as-is |
| `/api/adherence/*` | Unchanged | Unchanged | Unchanged | Keep as-is |
| `/api/meals/daily` | Unchanged | Used by Nutritionist context builder | — | Keep as-is |
| `app/lib/auth/*` | Unchanged | Unchanged | Unchanged | Keep as-is |
| `app/lib/imageUtils.ts` | Unchanged | Used by Nutritionist photo flow | — | Keep as-is |
| `app/lib/macro-validation.ts` | Unchanged | Used by Nutritionist | — | Keep as-is |
| `app/lib/adherence-calculator.ts` | Unchanged | Unchanged | Unchanged | Keep as-is |
| `app/lib/whoop/*` | Unchanged | Unchanged | Used by Socius context | Keep as-is |
| `/dashboard` (old UI) | Still works | Still works | Still works | Remove when v2 is stable |

---

## 11. Evaluation Framework

### Phase 1 Evals (Classifier accuracy)

Create 50 test inputs and verify routing:

```typescript
// test/agents/classifier.test.ts

const testCases = [
  // Workout logs → trainer
  { input: '5 rounds: 10 DL 225#, 15 BJ — 14:07', expected_type: 'workout_log', expected_domains: ['trainer'] },
  { input: 'Back Squat 5x5 @ 315#', expected_type: 'workout_log', expected_domains: ['trainer'] },
  { input: 'Fran 4:32 Rx', expected_type: 'workout_log', expected_domains: ['trainer'], expected_benchmark: true },

  // Meal logs → nutritionist
  { input: 'Chicken breast 6oz with rice and broccoli', expected_type: 'meal_log', expected_domains: ['nutritionist'] },
  { input: 'Had a protein shake and banana', expected_type: 'meal_log', expected_domains: ['nutritionist'] },

  // Questions → appropriate domain
  { input: "What's my best Fran time?", expected_type: 'question', expected_domains: ['trainer'] },
  { input: 'How much protein did I eat this week?', expected_type: 'question', expected_domains: ['nutritionist'] },
  { input: 'How does my protein intake affect my recovery?', expected_type: 'question', expected_domains: ['socius'] },

  // Mixed → multiple domains
  { input: 'Had a protein shake after my deadlift session', expected_type: 'mixed', expected_domains: ['trainer', 'nutritionist'] },

  // Unclear
  { input: 'hey', expected_type: 'unclear' },
]

// Target: >95% correct routing
```

### Phase 2 Evals (Agent response quality)

```typescript
// Trainer: parse accuracy
// - 20 real whiteboard formats → verify blocks, movements, scores extracted correctly
// - 10 benchmark workouts → verify PR detection
// Target: >95% structure accuracy, 100% benchmark detection

// Nutritionist: macro estimation accuracy
// - 20 text descriptions with known macros → verify within 15% of actual
// - 10 ambiguous inputs → verify follow-up triggered appropriately
// Target: >85% macro accuracy, <10% unnecessary follow-ups
```

### Phase 3 Evals (Socius pattern detection)

```typescript
// Seed test user with 30 days of synthetic data containing known patterns:
// - 5 days caloric deficit (<70% target) → should trigger CAL_DEF
// - Declining recovery with high volume → should trigger OVER_TRN
// - Higher protein days correlate with better recovery → should detect PRO_REC
// Target: 100% detection of seeded patterns, 0% false positives on clean data
```

---

## Cost Projections

| Component | Model | Per Call | Daily (est. 10 logs + 3 questions) | Monthly |
|-----------|-------|---------|--------------------------------------|---------|
| Classifier | Haiku | ~$0.001 | ~$0.013 | ~$0.40 |
| Trainer | Sonnet 4 | ~$0.01 | ~$0.05 | ~$1.50 |
| Nutritionist | Sonnet 4 | ~$0.01 | ~$0.06 | ~$1.80 |
| Socius (queries) | Sonnet 4 | ~$0.02 | ~$0.06 | ~$1.80 |
| Socius (checks) | Sonnet 4 | ~$0.005 | ~$0.05 | ~$1.50 |
| **Total** | | | | **~$7/month** |
