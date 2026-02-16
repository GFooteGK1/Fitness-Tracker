---
inclusion: fileMatch
fileMatchPattern: '**/{query,fitness-insights}/**/*.{ts,tsx}'
---

# Holistic Query System

## Flow
1. User question → `POST /api/query { question }`
2. Classify intent: workout | nutrition | whoop | cross-domain
3. Fetch domain data (limit: 50 workouts, 20 PRs, 30 days default)
4. Generate AI response with context
5. Return answer with intent & date range

## Intent Classification (`app/api/query/lib/intent-classifier.ts`)
```typescript
type QueryIntent = 'workout' | 'nutrition' | 'whoop' | 'cross-domain'

// Keywords per domain
workout: ['workout', 'exercise', 'pr', 'fran', 'murph', 'deadlift', 'squat', ...]
nutrition: ['protein', 'carbs', 'calories', 'macro', 'meal', 'food', 'diet', ...]
whoop: ['recovery', 'strain', 'sleep', 'hrv', 'resting heart rate', ...]

// Cross-domain indicators
['affect', 'impact', 'correlation', 'relationship', 'between', 'how does my', ...]

classifyIntent(question) // Returns intent based on keyword matches + cross-domain indicators
```

## Domain Fetchers (`app/api/query/lib/domain-fetchers.ts`)
```typescript
fetchWorkoutContext(userId, dateRange) // workouts + block_scores, benchmark_prs
fetchNutritionContext(userId, dateRange) // meals, daily_targets, daily_summaries
fetchWhoopContext(userId, dateRange) // recovery, sleep, strain (parallel)
fetchCrossDomainContext(userId, dateRange) // All of the above (parallel)
```

## Prompt Templates (`app/api/query/lib/prompt-templates.ts`)
- **workout**: Analyze workout history, PRs, specific dates/weights/scores
- **nutrition**: Analyze meals, macros, targets, adherence percentages
- **whoop**: Analyze recovery, sleep, strain scores, HRV, trends
- **cross-domain**: Correlate workout ↔ nutrition ↔ recovery patterns

## Response Generator
```typescript
generateResponse(question, intent, context)
// Model: claude-sonnet-4-20250514
// Temperature: 0.7 (slightly creative for natural responses)
// Max tokens: 1024
```

## Date Range Extraction
Patterns: "this week", "last week", "this month", "yesterday", "today", "last N days"
Default: Last 30 days

## Example Queries
**Workout**: "What's my best Fran time?", "When did I last deadlift over 300 lbs?"
**Nutrition**: "How much protein did I eat this week?", "Am I hitting my macro targets?"
**WHOOP**: "What's my recovery trend this week?", "What's my HRV average?"
**Cross-Domain**: "How does my sleep affect workout performance?", "Do I perform better when I eat more protein?"

## API Route (`app/api/query/route.ts`)
```typescript
POST /api/query
Auth: Required
Body: { question: string }
Response: { answer: string, intent: QueryIntent, dateRange: DateRange }
```

## Best Practices
- Classify intent first (minimize data fetching)
- Limit query results (context window constraints)
- Use date ranges to scope data
- Parallel fetch for cross-domain
- Handle missing data gracefully
- Rate limit to prevent abuse
- Validate question length (max 500 chars)
- Log queries for improving classification
