---
inclusion: fileMatch
fileMatchPattern: '**/{log,parse-workout,ocr-workout,transcribe-audio,workouts}/**/*.{ts,tsx}'
---

# Workout Tracking

## Logging Flow
1. **Input** → Text/Photo OCR/Voice → Validate
2. **POST /api/parse-workout** `{ text, date }` → Auth check
3. **AI Parse** → Claude Sonnet 4 (temp=0, deterministic) → Extract blocks, score, RPE, tags
4. **Database** → INSERT workouts, block_scores, benchmark_prs (if applicable)
5. **Response** → `{ parsed, workoutId }` → Update UI

## Database Schema
```sql
workouts: id, user_id, workout_date, input_text, blocks(JSONB), primary_score, total_duration_min, tags[], notes, rpe(1-10), parse_confidence, created_at
block_scores: id, workout_id, block_type, block_title, rounds_completed, extra_reps, time_s, total_reps, tonnage_lb, rx_status, is_pr
benchmark_prs: id, user_id, benchmark_name, date, score_value, score_display, rx_status, is_pr, workout_id
```

## Blocks JSONB Structure
```json
{
  "blocks": [{
    "block_type": "AMRAP|FOR_TIME|EMOM|STRENGTH|CARDIO",
    "duration_min": 12,
    "rounds": 5,
    "movements": [
      { "name": "Pull-up", "reps": 5, "weight": { "value": 225, "unit": "lb" } }
    ],
    "score": { "rounds": 7, "extra_reps": 5, "time_s": 847 },
    "rx_status": "RX|SCALED|RX+"
  }]
}
```

## Block Types
- **AMRAP**: duration_min, movements, score (rounds + extra_reps)
- **FOR_TIME**: rounds, movements, score (time_s)
- **EMOM**: duration_min, movements
- **STRENGTH**: movements with sets/reps/weight

## Benchmark Workouts
**Girls**: Fran, Grace, Helen, Diane, Elizabeth, Annie, Nancy, Karen, Cindy, Mary
**Heroes**: Murph, DT, Kalsu, JT, Badger, Griff, Daniel, Randy, Jason, Nate
**Other**: Fight Gone Bad, The Seven, Filthy Fifty, King Kong

## API Endpoints
- **POST /api/parse-workout** - Parse workout text
- **POST /api/ocr-workout** - Extract text from photo
- **POST /api/transcribe-audio** - Transcribe voice
- **GET /api/workouts?date=YYYY-MM-DD** - Fetch coach programming from Google Sheets

## Parsing Rules
**Aliases**: PU→Pull-up, DL→Deadlift, BS→Back Squat, FS→Front Squat, OHS→Overhead Squat, C&J→Clean and Jerk, S2OH→Shoulder to Overhead

**Weights**: 225#→225 lb, 100kg→100 kg, BW→bodyweight, 95/65→gender-based

**Times**: 12:34→754s, 1:23.45→83.45s, 45s→45s

**Scores**: 7+5→7 rounds + 5 reps, 14:07→847s, 225lb x 5

## RPE Scale (1-10)
1-3: Easy | 4-6: Moderate | 7-8: Hard | 9: Very hard | 10: Maximum

## Tags
Auto-extracted: #strength, #metcon, #cardio, #barbell, #dumbbell, #kettlebell, #bodyweight, #squat, #press, #pull, #hinge, #fran, #grace, #murph

## Common Patterns
```
"12min AMRAP: 5 PU, 10 pushups, 15 squats - Got 7+5 RPE 8"
"5 rounds for time: 10 deadlifts 225#, 15 box jumps - 14:07"
"12min EMOM: 10 thrusters 95#"
"Back Squat: 5x5 @ 315#"
"Fran: 21-15-9 thrusters 95# / pullups - 4:32 Rx"
```

## Best Practices
- Parse deterministically (temp=0)
- Preserve original input_text
- Auto-calculate scores
- Detect benchmarks → create PR records
- Extract RPE from text
- Tag for analytics
- Test with real whiteboard photos
- Support voice for hands-free logging
- Show parse confidence to user
