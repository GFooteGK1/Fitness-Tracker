# Data Migration Instructions

This guide will help you migrate your existing workout data from the CSV file to Supabase.

## Prerequisites

1. Make sure your Supabase database is set up with all tables (run the migration SQL if you haven't)
2. Your `.env.local` file should have the correct Supabase credentials
3. The CSV file `BetterBoard_-_Parsed_Workouts.csv` should be in the parent directory

## Migration Steps

### 1. Prepare the CSV file
Make sure `BetterBoard_-_Parsed_Workouts.csv` is in the parent directory (one level up from the fitness-tracker folder).

### 2. Run the migration
```bash
cd fitness-tracker
npm run migrate
```

### 3. What gets migrated

The script will import:
- **Workouts**: All your workout sessions with dates, scores, and metadata
- **Movements**: Unique exercise movements (Pull-up, Back Squat, etc.)
- **Block Scores**: Individual scores for each workout block (AMRAP, For Time, etc.)
- **Benchmark PRs**: Personal records for known CrossFit benchmarks (Fran, Grace, etc.)

### 4. Data mapping

Your CSV data maps to Supabase tables as follows:

**workouts table:**
- `session_id` → `id`
- `workout_date` → `workout_date`
- `input_text` → `input_text`
- `primary_score` → `primary_score`
- `total_duration_min` → `total_duration_min`
- `tags` → `tags` (array)
- `notes` → `notes`
- `rpe` → `rpe`
- `parse_confidence` → `parse_confidence`

**movements table:**
- Extracted from `blocks_json` → `name`
- Auto-categorized → `category`

**block_scores table:**
- Parsed from `blocks_json` → individual block performance data

**benchmark_prs table:**
- Filtered from blocks where `is_pr: true` and title matches known benchmarks

## Troubleshooting

### Common Issues:

1. **File not found**: Make sure the CSV is in the correct location
2. **Database connection**: Verify your `.env.local` Supabase credentials
3. **Duplicate data**: The script uses `upsert` so it's safe to run multiple times

### Check your data after migration:

1. Go to your Supabase dashboard
2. Check the Tables section
3. Verify data in: workouts, movements, block_scores, benchmark_prs

### Query examples:

```sql
-- Check total workouts imported
SELECT COUNT(*) FROM workouts;

-- Check movements
SELECT name, category FROM movements ORDER BY name;

-- Check recent workouts
SELECT workout_date, primary_score, tags 
FROM workouts 
ORDER BY workout_date DESC 
LIMIT 10;
```

## Next Steps

After successful migration:
1. Test the app to make sure data displays correctly
2. Try logging a new workout to ensure everything works
3. Use the query feature to search your historical data

Your workout history is now in Supabase and ready to use with the new app! 🎉