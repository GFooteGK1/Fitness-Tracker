---
inclusion: fileMatch
fileMatchPattern: '**/{lib,api}/**/*.{ts,sql}'
---

# Database Patterns & Schema

## Core Tables

### workouts
```sql
workouts
├── id (UUID, primary key)
├── user_id (UUID, FK to auth.users)
├── workout_date (DATE)
├── input_text (TEXT) - original user input
├── blocks (JSONB) - structured workout data
├── primary_score (TEXT) - human-readable score
├── total_duration_min (INTEGER)
├── tags (TEXT[])
├── notes (TEXT)
├── rpe (INTEGER, 1-10)
├── parse_confidence (DECIMAL)
└── created_at (TIMESTAMPTZ)
```

### meals
```sql
meals
├── id (UUID, primary key)
├── user_id (UUID, FK to auth.users)
├── meal_timestamp (TIMESTAMPTZ)
├── photo_url (TEXT) - Supabase Storage URL
├── meal_timing (TEXT) - "PRE_WORKOUT", "POST_WORKOUT", etc.
├── total_protein (DECIMAL)
├── total_carbs (DECIMAL)
├── total_fat (DECIMAL)
├── total_calories (INTEGER)
├── items (JSONB) - detailed breakdown
└── created_at (TIMESTAMPTZ)
```

### block_scores
```sql
block_scores
├── id (UUID, primary key)
├── workout_id (UUID, FK to workouts)
├── block_type (TEXT) - "AMRAP", "FOR_TIME", etc.
├── block_title (TEXT)
├── rounds_completed (INTEGER)
├── extra_reps (INTEGER)
├── time_s (INTEGER)
├── total_reps (INTEGER)
├── tonnage_lb (DECIMAL)
├── rx_status (TEXT) - "RX", "SCALED"
├── is_pr (BOOLEAN)
└── created_at (TIMESTAMPTZ)
```

### benchmark_prs
```sql
benchmark_prs
├── id (UUID, primary key)
├── user_id (UUID, FK to auth.users)
├── benchmark_name (TEXT) - "Fran", "Grace", etc.
├── date (DATE)
├── score_value (DECIMAL) - for comparison
├── score_display (TEXT) - "9:47"
├── rx_status (TEXT)
├── is_pr (BOOLEAN)
├── workout_id (UUID, FK to workouts)
└── notes (TEXT)
```

## Row Level Security (RLS)

**All user tables have RLS enabled:**

```sql
-- Standard policy pattern
CREATE POLICY "Users can only access their own data"
  ON table_name
  FOR ALL
  USING (auth.uid() = user_id);
```

**Enabled on:**
- user_profiles
- workouts
- block_scores
- benchmark_prs
- meals
- daily_targets
- fitness_correlations

**Performance indexes:**
```sql
CREATE INDEX idx_workouts_user_id ON workouts(user_id);
CREATE INDEX idx_meals_user_id ON meals(user_id);
CREATE INDEX idx_block_scores_workout_id ON block_scores(workout_id);
```

## Database Views

### daily_summaries (SECURITY INVOKER)
```sql
-- Aggregates daily nutrition data
SELECT
  user_id,
  DATE(meal_timestamp) as date,
  SUM(total_protein) as total_protein,
  SUM(total_carbs) as total_carbs,
  SUM(total_fat) as total_fat,
  SUM(total_calories) as total_calories,
  COUNT(*) as meal_count
FROM meals
GROUP BY user_id, DATE(meal_timestamp)
```

## Query Patterns

### Get Recent Workouts
```typescript
const { data, error } = await supabase
  .from('workouts')
  .select('*')
  .order('workout_date', { ascending: false })
  .limit(10)
```

### Get Today's Meals
```typescript
const { data, error } = await supabase
  .from('meals')
  .select('*')
  .gte('meal_timestamp', startOfDay)
  .lte('meal_timestamp', endOfDay)
  .order('meal_timestamp', { ascending: true })
```

### Get Daily Summary with Timezone
```typescript
const { data, error } = await supabase
  .from('daily_summaries')
  .select('*')
  .eq('date', localDate)
  .single()
```

### Insert with Automatic user_id
```typescript
// RLS automatically sets user_id from auth.uid()
const { data, error } = await supabase
  .from('workouts')
  .insert({
    workout_date: date,
    input_text: text,
    blocks: parsedBlocks
  })
  .select()
  .single()
```

## JSONB Patterns

### Workout Blocks Structure
```typescript
{
  blocks: [
    {
      block_type: "AMRAP",
      duration_min: 12,
      movements: [
        {
          name: "Pull-up",
          reps: 5,
          rx_standard: "strict"
        }
      ],
      score: {
        rounds: 7,
        extra_reps: 5
      }
    }
  ]
}
```

### Meal Items Structure
```typescript
{
  items: [
    {
      name: "Chicken breast",
      quantity: "6 oz",
      protein: 42,
      carbs: 0,
      fat: 3,
      calories: 195
    }
  ]
}
```

## Common Queries

```sql
-- Get user's recent workouts
SELECT * FROM workouts
WHERE user_id = auth.uid()
ORDER BY workout_date DESC
LIMIT 10;

-- Get today's meals
SELECT * FROM meals
WHERE user_id = auth.uid()
  AND DATE(meal_timestamp) = CURRENT_DATE;

-- Get workout type breakdown
SELECT
  jsonb_array_elements(blocks)->>'block_type' as type,
  COUNT(*) as count
FROM workouts
WHERE user_id = auth.uid()
GROUP BY type;

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'workouts';

-- Verify current user
SELECT auth.uid(), auth.email();
```

## Migration Best Practices

1. Write migration SQL in `docs/migrations/`
2. Test in Supabase SQL Editor first
3. Apply to database
4. Update TypeScript types if needed
5. Document in session notes
6. Add RLS policies for new tables
7. Create indexes for user_id columns
