---
inclusion: fileMatch
fileMatchPattern: '**/{query,fitness-insights}/**/*.{ts,tsx}'
---

# Holistic Query System Guidelines

## Overview

The holistic query system enables natural language questions that span workout, nutrition, and WHOOP domains with AI-powered intent classification and cross-domain correlation analysis.

## Query Flow

```
1. User submits natural language question
   └── POST /api/query { question: string }

2. Intent Classification
   ├── Classify intent: workout | nutrition | whoop | cross-domain
   └── Extract date range hints

3. Domain-Specific Data Fetching
   ├── Workout: workouts, block_scores, benchmark_prs
   ├── Nutrition: meals, daily_summaries, daily_targets
   ├── WHOOP: whoop_recovery, whoop_sleep, whoop_cycles
   └── Cross-domain: All of the above

4. AI Response Generation
   ├── Select domain-specific prompt template
   ├── Include fetched data as context
   └── Generate natural language response

5. Return response with data citations
```

## Intent Classification

```typescript
// app/api/query/lib/intent-classifier.ts
export type QueryIntent = 'workout' | 'nutrition' | 'whoop' | 'cross-domain'

const INTENT_KEYWORDS = {
  workout: [
    'workout', 'exercise', 'lift', 'pr', 'personal record', 'amrap', 'emom',
    'fran', 'murph', 'grace', 'helen', 'strength', 'metcon', 'wod',
    'deadlift', 'squat', 'bench', 'clean', 'snatch', 'pull-up'
  ],
  nutrition: [
    'protein', 'carbs', 'carbohydrate', 'fat', 'calories', 'macro',
    'meal', 'food', 'eat', 'ate', 'diet', 'nutrition', 'breakfast',
    'lunch', 'dinner', 'snack', 'adherence'
  ],
  whoop: [
    'recovery', 'strain', 'sleep', 'hrv', 'heart rate variability',
    'resting heart rate', 'whoop', 'readiness', 'rest'
  ]
}

export function classifyIntent(question: string): QueryIntent {
  const lowerQuestion = question.toLowerCase()
  
  // Check for cross-domain indicators first
  const crossDomainIndicators = [
    'affect', 'impact', 'correlation', 'relationship', 'between',
    'how does my', 'does my', 'when i eat', 'after eating'
  ]
  
  const hasCrossDomain = crossDomainIndicators.some(ind => 
    lowerQuestion.includes(ind)
  )
  
  // Count keyword matches per domain
  const scores = {
    workout: countMatches(lowerQuestion, INTENT_KEYWORDS.workout),
    nutrition: countMatches(lowerQuestion, INTENT_KEYWORDS.nutrition),
    whoop: countMatches(lowerQuestion, INTENT_KEYWORDS.whoop)
  }
  
  // If cross-domain indicators and multiple domains have matches
  if (hasCrossDomain) {
    const domainsWithMatches = Object.values(scores).filter(s => s > 0).length
    if (domainsWithMatches >= 2) {
      return 'cross-domain'
    }
  }
  
  // Return highest scoring domain
  const maxScore = Math.max(...Object.values(scores))
  if (maxScore === 0) return 'workout' // Default to workout
  
  return Object.entries(scores).find(([_, score]) => score === maxScore)![0] as QueryIntent
}
```

## Domain Fetchers

```typescript
// app/api/query/lib/domain-fetchers.ts
import { createServerClient } from '@/app/lib/auth/supabase-server'

export interface DateRange {
  start: string  // YYYY-MM-DD
  end: string    // YYYY-MM-DD
}

export async function fetchWorkoutContext(
  userId: string,
  dateRange: DateRange
) {
  const supabase = await createServerClient()
  
  const { data: workouts } = await supabase
    .from('workouts')
    .select(`
      *,
      block_scores (*)
    `)
    .eq('user_id', userId)
    .gte('workout_date', dateRange.start)
    .lte('workout_date', dateRange.end)
    .order('workout_date', { ascending: false })
    .limit(50)
  
  const { data: prs } = await supabase
    .from('benchmark_prs')
    .select('*')
    .eq('user_id', userId)
    .eq('is_pr', true)
    .order('date', { ascending: false })
    .limit(20)
  
  return { workouts: workouts || [], prs: prs || [] }
}

export async function fetchNutritionContext(
  userId: string,
  dateRange: DateRange
) {
  const supabase = await createServerClient()
  
  const { data: meals } = await supabase
    .from('meals')
    .select('*')
    .eq('user_id', userId)
    .gte('meal_timestamp', `${dateRange.start}T00:00:00`)
    .lte('meal_timestamp', `${dateRange.end}T23:59:59`)
    .order('meal_timestamp', { ascending: false })
  
  const { data: targets } = await supabase
    .from('daily_targets')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .single()
  
  const { data: dailySummaries } = await supabase
    .from('daily_summaries')
    .select('*')
    .eq('user_id', userId)
    .gte('date', dateRange.start)
    .lte('date', dateRange.end)
  
  return {
    meals: meals || [],
    targets: targets || null,
    dailySummaries: dailySummaries || []
  }
}

export async function fetchWhoopContext(
  userId: string,
  dateRange: DateRange
) {
  const supabase = await createServerClient()
  
  const [recovery, sleep, strain] = await Promise.all([
    supabase
      .from('whoop_recovery')
      .select('*')
      .eq('user_id', userId)
      .gte('date', dateRange.start)
      .lte('date', dateRange.end)
      .order('date', { ascending: false }),
    supabase
      .from('whoop_sleep')
      .select('*')
      .eq('user_id', userId)
      .gte('date', dateRange.start)
      .lte('date', dateRange.end)
      .order('date', { ascending: false }),
    supabase
      .from('whoop_cycles')
      .select('*')
      .eq('user_id', userId)
      .gte('date', dateRange.start)
      .lte('date', dateRange.end)
      .order('date', { ascending: false })
  ])
  
  return {
    recovery: recovery.data || [],
    sleep: sleep.data || [],
    strain: strain.data || []
  }
}

export async function fetchCrossDomainContext(
  userId: string,
  dateRange: DateRange
) {
  const [workout, nutrition, whoop] = await Promise.all([
    fetchWorkoutContext(userId, dateRange),
    fetchNutritionContext(userId, dateRange),
    fetchWhoopContext(userId, dateRange)
  ])
  
  return { workout, nutrition, whoop }
}
```

## Prompt Templates

```typescript
// app/api/query/lib/prompt-templates.ts
export const PROMPT_TEMPLATES = {
  workout: `You are a fitness assistant analyzing workout history.

USER'S WORKOUT DATA:
{workoutData}

USER'S PERSONAL RECORDS:
{prData}

Answer the user's question based on this data. Be specific with dates, weights, and scores.
If the data doesn't contain the answer, say so.`,

  nutrition: `You are a nutrition assistant analyzing meal and macro data.

USER'S MEALS:
{mealData}

USER'S DAILY TARGETS:
{targetData}

USER'S DAILY SUMMARIES:
{summaryData}

Answer the user's question based on this data. Include specific macro values and adherence percentages.`,

  whoop: `You are a recovery and performance assistant analyzing WHOOP data.

RECOVERY DATA:
{recoveryData}

SLEEP DATA:
{sleepData}

STRAIN DATA:
{strainData}

Answer the user's question based on this data. Reference specific scores, HRV values, and trends.`,

  'cross-domain': `You are a holistic fitness assistant analyzing workout, nutrition, and recovery data together.

WORKOUT DATA:
{workoutData}

NUTRITION DATA:
{nutritionData}

WHOOP RECOVERY/SLEEP/STRAIN:
{whoopData}

Analyze correlations between these domains to answer the user's question.
Look for patterns like:
- How nutrition affects workout performance
- How sleep/recovery impacts training quality
- How workout strain affects recovery needs
- Nutrition timing around workouts

Provide insights backed by the data.`
}
```

## Response Generator

```typescript
// app/api/query/lib/response-generator.ts
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function generateResponse(
  question: string,
  intent: QueryIntent,
  context: any
): Promise<string> {
  const template = PROMPT_TEMPLATES[intent]
  const systemPrompt = buildSystemPrompt(template, context)
  
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    temperature: 0.7,  // Slightly creative for natural responses
    system: systemPrompt,
    messages: [
      { role: 'user', content: question }
    ]
  })
  
  return message.content[0].type === 'text' 
    ? message.content[0].text 
    : 'Unable to generate response'
}

function buildSystemPrompt(template: string, context: any): string {
  // Replace placeholders with actual data
  return template
    .replace('{workoutData}', JSON.stringify(context.workout?.workouts || [], null, 2))
    .replace('{prData}', JSON.stringify(context.workout?.prs || [], null, 2))
    .replace('{mealData}', JSON.stringify(context.nutrition?.meals || [], null, 2))
    .replace('{targetData}', JSON.stringify(context.nutrition?.targets || {}, null, 2))
    .replace('{summaryData}', JSON.stringify(context.nutrition?.dailySummaries || [], null, 2))
    .replace('{recoveryData}', JSON.stringify(context.whoop?.recovery || [], null, 2))
    .replace('{sleepData}', JSON.stringify(context.whoop?.sleep || [], null, 2))
    .replace('{strainData}', JSON.stringify(context.whoop?.strain || [], null, 2))
    .replace('{nutritionData}', JSON.stringify(context.nutrition || {}, null, 2))
    .replace('{whoopData}', JSON.stringify(context.whoop || {}, null, 2))
}
```

## API Route Implementation

```typescript
// app/api/query/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { classifyIntent } from './lib/intent-classifier'
import { 
  fetchWorkoutContext, 
  fetchNutritionContext, 
  fetchWhoopContext,
  fetchCrossDomainContext 
} from './lib/domain-fetchers'
import { generateResponse } from './lib/response-generator'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  
  // Auth check
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const { question } = await request.json()
  
  if (!question || typeof question !== 'string') {
    return NextResponse.json({ error: 'Question is required' }, { status: 400 })
  }
  
  try {
    // Classify intent
    const intent = classifyIntent(question)
    
    // Determine date range (default: last 30 days)
    const dateRange = extractDateRange(question) || {
      start: getDateDaysAgo(30),
      end: getTodayDate()
    }
    
    // Fetch domain-specific context
    let context: any
    switch (intent) {
      case 'workout':
        context = { workout: await fetchWorkoutContext(user.id, dateRange) }
        break
      case 'nutrition':
        context = { nutrition: await fetchNutritionContext(user.id, dateRange) }
        break
      case 'whoop':
        context = { whoop: await fetchWhoopContext(user.id, dateRange) }
        break
      case 'cross-domain':
        context = await fetchCrossDomainContext(user.id, dateRange)
        break
    }
    
    // Generate AI response
    const answer = await generateResponse(question, intent, context)
    
    return NextResponse.json({
      answer,
      intent,
      dateRange
    })
  } catch (error) {
    console.error('Query error:', error)
    return NextResponse.json(
      { error: 'Failed to process query' },
      { status: 500 }
    )
  }
}
```

## Example Queries

**Workout Domain:**
- "What's my best Fran time?"
- "When did I last deadlift over 300 lbs?"
- "How many workouts have I done this month?"
- "Show me my recent PRs"

**Nutrition Domain:**
- "How much protein did I eat this week?"
- "What's my average calorie intake?"
- "Am I hitting my macro targets?"
- "What did I eat yesterday?"

**WHOOP Domain:**
- "What's my recovery trend this week?"
- "How much sleep did I get last night?"
- "What's my HRV average?"
- "When was my highest strain day?"

**Cross-Domain:**
- "How does my sleep affect my workout performance?"
- "Do I perform better when I eat more protein?"
- "What's the correlation between my recovery and workout quality?"
- "How does my nutrition timing impact my strain?"

## Date Range Extraction

```typescript
function extractDateRange(question: string): DateRange | null {
  const lowerQ = question.toLowerCase()
  
  // "this week"
  if (lowerQ.includes('this week')) {
    return { start: getStartOfWeek(), end: getTodayDate() }
  }
  
  // "last week"
  if (lowerQ.includes('last week')) {
    return { start: getStartOfLastWeek(), end: getEndOfLastWeek() }
  }
  
  // "this month"
  if (lowerQ.includes('this month')) {
    return { start: getStartOfMonth(), end: getTodayDate() }
  }
  
  // "yesterday"
  if (lowerQ.includes('yesterday')) {
    const yesterday = getDateDaysAgo(1)
    return { start: yesterday, end: yesterday }
  }
  
  // "today"
  if (lowerQ.includes('today')) {
    const today = getTodayDate()
    return { start: today, end: today }
  }
  
  // "last N days"
  const daysMatch = lowerQ.match(/last (\d+) days?/)
  if (daysMatch) {
    return { start: getDateDaysAgo(parseInt(daysMatch[1])), end: getTodayDate() }
  }
  
  return null // Use default (30 days)
}
```

## Best Practices

1. **Classify intent first** to minimize data fetching
2. **Limit query results** (e.g., 50 workouts, 20 PRs) for context window
3. **Use date ranges** to scope data appropriately
4. **Parallel fetch** when cross-domain
5. **Handle missing data** gracefully in responses
6. **Cache classifications** for common question patterns
7. **Log queries** for improving classification accuracy
8. **Rate limit** to prevent abuse
9. **Validate question length** (max 500 chars recommended)
10. **Include data citations** in AI responses

## Testing

Property-based tests cover:
- Intent classification accuracy for each domain
- Cross-domain detection with indicator words
- Domain-specific data fetching returns correct schema
- Prompt template variable replacement
- Authentication enforcement
- Date range extraction from natural language
- Response generation with mock data
- Error handling for missing data
- Empty result handling
