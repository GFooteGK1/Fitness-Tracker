# User ID Linkage for Cross-Domain AI Analysis

## Overview

For SociusFit's AI to provide holistic fitness insights, all user data tables must have proper `user_id` linkage. This enables efficient cross-domain queries that correlate workouts, nutrition, and WHOOP metrics.

## Critical Tables Requiring user_id

### Core Fitness Data
1. **workouts** - User's workout history
2. **block_scores** - Individual workout block performance
3. **benchmark_prs** - Personal records for benchmark workouts
4. **meals** - Nutrition tracking data
5. **daily_targets** - User's nutritional goals

### User Context
6. **user_profiles** - Fitness goals, body metrics, preferences
7. **fitness_correlations** - AI-generated insights

### WHOOP Integration
8. **whoop_tokens** - OAuth tokens
9. **whoop_recovery** - Daily recovery scores
10. **whoop_sleep** - Sleep performance
11. **whoop_cycles** - Daily strain
12. **whoop_workouts** - WHOOP-tracked workouts
13. **whoop_sync_status** - Sync tracking

## Why user_id in block_scores?

**Problem:** Originally, `block_scores` only had `workout_id` (foreign key to workouts).

**Issue:** AI queries need to efficiently fetch all block scores for a user without joining through workouts table.

**Solution:** Add `user_id` directly to `block_scores` for:
- Faster queries (no join required)
- Simpler RLS policies
- Better query optimization
- Consistent data access patterns

## Cross-Domain Query Examples

### Example 1: Recovery Impact on Performance
```sql
-- Find correlation between WHOOP recovery and workout performance
SELECT 
  wr.recovery_score,
  bs.block_type,
  AVG(bs.rounds_completed) as avg_rounds,
  AVG(bs.time_s) as avg_time
FROM whoop_recovery wr
JOIN workouts w ON DATE(w.workout_date) = wr.date AND w.user_id = wr.user_id
JOIN block_scores bs ON bs.workout_id = w.id AND bs.user_id = w.user_id
WHERE wr.user_id = 'user-uuid'
  AND wr.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY wr.recovery_score, bs.block_type;
```

### Example 2: Nutrition Impact on Strength
```sql
-- Correlate protein intake with strength performance
SELECT 
  DATE(m.meal_timestamp) as date,
  SUM(m.total_protein) as daily_protein,
  AVG(bs.tonnage_lb) as avg_tonnage
FROM meals m
JOIN workouts w ON DATE(w.workout_date) = DATE(m.meal_timestamp) AND w.user_id = m.user_id
JOIN block_scores bs ON bs.workout_id = w.id AND bs.user_id = w.user_id
WHERE m.user_id = 'user-uuid'
  AND bs.block_type = 'STRENGTH'
  AND m.meal_timestamp >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(m.meal_timestamp);
```

### Example 3: Holistic Daily Summary
```sql
-- Get complete daily picture for AI analysis
SELECT 
  w.workout_date as date,
  -- Workout data
  COUNT(DISTINCT w.id) as workout_count,
  json_agg(DISTINCT jsonb_build_object(
    'type', bs.block_type,
    'score', bs.rounds_completed
  )) as workout_blocks,
  -- Nutrition data
  (SELECT SUM(total_protein) FROM meals 
   WHERE user_id = w.user_id 
   AND DATE(meal_timestamp) = w.workout_date) as daily_protein,
  (SELECT SUM(total_calories) FROM meals 
   WHERE user_id = w.user_id 
   AND DATE(meal_timestamp) = w.workout_date) as daily_calories,
  -- WHOOP data
  (SELECT recovery_score FROM whoop_recovery 
   WHERE user_id = w.user_id 
   AND date = w.workout_date) as recovery_score,
  (SELECT strain FROM whoop_cycles 
   WHERE user_id = w.user_id 
   AND date = w.workout_date) as strain
FROM workouts w
JOIN block_scores bs ON bs.workout_id = w.id AND bs.user_id = w.user_id
WHERE w.user_id = 'user-uuid'
  AND w.workout_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY w.workout_date, w.user_id;
```

## Data Integrity Rules

### 1. All User Data Tables Must Have user_id
- **Type:** UUID
- **Constraint:** NOT NULL, REFERENCES auth.users(id)
- **Index:** Always indexed for performance
- **RLS:** Row-level security policy using auth.uid()

### 2. Cascade Deletes
```sql
REFERENCES auth.users(id) ON DELETE CASCADE
```
When a user is deleted, all their data is automatically removed.

### 3. Consistent Naming
- Always use `user_id` (not `userId`, `user`, or `uid`)
- Always UUID type (not integer or text)
- Always foreign key to `auth.users(id)`

## Migration Checklist

When adding a new user data table:

- [ ] Add `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- [ ] Create index: `CREATE INDEX idx_tablename_user_id ON tablename(user_id)`
- [ ] Enable RLS: `ALTER TABLE tablename ENABLE ROW LEVEL SECURITY`
- [ ] Add RLS policy: `CREATE POLICY "Users can only access their own data" ON tablename FOR ALL USING (auth.uid() = user_id)`
- [ ] Update TypeScript types to include `user_id`
- [ ] Update API routes to filter by authenticated user
- [ ] Test cross-domain queries

## AI Query Patterns

### Pattern 1: Time-Series Correlation
```typescript
// Fetch all user data for a date range
const { data } = await supabase
  .from('workouts')
  .select(`
    *,
    block_scores(*),
    meals:meals!inner(date, total_protein, total_calories),
    whoop:whoop_recovery!inner(date, recovery_score)
  `)
  .eq('user_id', userId)
  .gte('workout_date', startDate)
  .lte('workout_date', endDate);
```

### Pattern 2: Aggregate Analysis
```typescript
// Get user's complete fitness profile
const profile = await supabase.rpc('get_user_fitness_profile', {
  p_user_id: userId,
  p_days: 30
});
```

### Pattern 3: Real-Time Insights
```typescript
// Today's holistic view
const today = await supabase
  .from('workouts')
  .select(`
    *,
    block_scores(*),
    meals:meals(total_protein, total_carbs, total_fat),
    whoop_recovery(recovery_score, hrv_rmssd_milli),
    whoop_sleep(sleep_performance_percentage)
  `)
  .eq('user_id', userId)
  .eq('workout_date', new Date().toISOString().split('T')[0])
  .single();
```

## Performance Considerations

### Indexes
All user data tables should have:
```sql
CREATE INDEX idx_tablename_user_id ON tablename(user_id);
CREATE INDEX idx_tablename_user_date ON tablename(user_id, date DESC);
```

### Query Optimization
- Always filter by `user_id` first (uses index)
- Use date ranges to limit result sets
- Avoid SELECT * in production (specify columns)
- Use EXPLAIN ANALYZE to verify query plans

## Security Benefits

### Row-Level Security (RLS)
With proper `user_id` linkage, RLS policies automatically:
- Prevent users from seeing other users' data
- Eliminate need for application-level filtering
- Provide defense-in-depth security
- Enable safe direct database access

### Example RLS Policy
```sql
CREATE POLICY "Users can only access their own data"
  ON tablename FOR ALL
  USING (auth.uid() = user_id);
```

This single policy handles:
- SELECT (read)
- INSERT (create)
- UPDATE (modify)
- DELETE (remove)

## Troubleshooting

### Issue: NULL user_id values
**Symptom:** Data exists but doesn't show up for user
**Cause:** Records created before user_id was properly set
**Fix:** Run `docs/migrations/audit-and-fix-user-ids.sql`

### Issue: Slow cross-domain queries
**Symptom:** AI insights take >1 second to generate
**Cause:** Missing indexes on user_id columns
**Fix:** Add indexes on all user_id and date columns

### Issue: RLS policy violations
**Symptom:** "permission denied" errors
**Cause:** Missing or incorrect RLS policies
**Fix:** Verify policies exist and use `auth.uid() = user_id`

## Maintenance

### Regular Audits
Run quarterly to ensure data integrity:
```sql
-- Check for orphaned records (user_id doesn't exist)
SELECT 'workouts' as table_name, COUNT(*) as orphaned
FROM workouts w
LEFT JOIN auth.users u ON u.id = w.user_id
WHERE u.id IS NULL;
```

### Monitoring
Track these metrics:
- Records with NULL user_id (should be 0)
- Query performance for cross-domain queries
- RLS policy violations in logs
- User data distribution across tables
