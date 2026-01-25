---
inclusion: fileMatch
fileMatchPattern: '**/{log,parse-workout,ocr-workout,transcribe-audio,workouts}/**/*.{ts,tsx}'
---

# Workout Tracking Guidelines

## Workout Logging Flow

```
1. USER INPUT
   ├── Text: Natural language in textarea
   ├── Photo: Camera capture → OCR extraction
   └── Voice: Web Speech API → text transcription

2. FRONTEND VALIDATION
   ├── Check text not empty
   ├── Validate date format
   └── Show loading state

3. API REQUEST: POST /api/parse-workout
   ├── Headers: Authorization (session cookie)
   ├── Body: { text, date }
   └── Timeout: 30s

4. AUTHENTICATION CHECK
   ├── Supabase: auth.getUser()
   ├── If unauthorized: 401 response
   └── If valid: Continue

5. AI PROCESSING (Claude)
   ├── Build system prompt (parsing rules)
   ├── Build user prompt (workout text + date)
   ├── Call Anthropic API
   │   ├── Model: claude-sonnet-4-20250514
   │   ├── Max tokens: 4096
   │   └── Temperature: 0 (deterministic)
   ├── Parse JSON response
   └── Validate structure

6. STRUCTURED DATA EXTRACTION
   ├── blocks: Array of workout blocks
   ├── primary_score: Human-readable summary
   ├── rpe: Rate of perceived exertion
   ├── tags: Extracted tags array
   └── parse_confidence: 0.0 - 1.0

7. DATABASE OPERATIONS (Transaction)
   ├── INSERT INTO workouts
   │   ├── user_id (from auth.uid())
   │   ├── workout_date
   │   ├── input_text
   │   ├── blocks (JSONB)
   │   ├── primary_score
   │   ├── tags
   │   └── rpe
   ├── For each block with score:
   │   └── INSERT INTO block_scores
   └── For benchmark workouts:
       └── INSERT INTO benchmark_prs

8. API RESPONSE
   ├── Status: 200 OK
   └── Body: { parsed, workoutId }

9. FRONTEND UPDATE
   ├── Clear input form
   ├── Show success message
   ├── Display parsed workout summary
   └── Refresh recent workouts list
```

## Workouts Table Schema

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

## Workout Blocks JSONB Structure

```typescript
{
  blocks: [
    {
      block_type: "AMRAP" | "FOR_TIME" | "EMOM" | "STRENGTH" | "CARDIO",
      duration_min?: number,
      rounds?: number,
      movements: [
        {
          name: string,
          reps?: number,
          weight?: { value: number, unit: "lb" | "kg" },
          distance?: { value: number, unit: "m" | "km" | "mi" },
          calories?: number,
          rx_standard?: string
        }
      ],
      score?: {
        rounds?: number,
        extra_reps?: number,
        time_s?: number,
        total_reps?: number,
        tonnage_lb?: number
      },
      rx_status?: "RX" | "SCALED" | "RX+"
    }
  ]
}
```

## Block Types

### AMRAP (As Many Rounds As Possible)
```typescript
{
  block_type: "AMRAP",
  duration_min: 12,
  movements: [
    { name: "Pull-up", reps: 5 },
    { name: "Push-up", reps: 10 },
    { name: "Air Squat", reps: 15 }
  ],
  score: {
    rounds: 7,
    extra_reps: 5
  }
}
```

### FOR_TIME
```typescript
{
  block_type: "FOR_TIME",
  rounds: 5,
  movements: [
    { name: "Deadlift", reps: 10, weight: { value: 225, unit: "lb" } },
    { name: "Box Jump", reps: 15 }
  ],
  score: {
    time_s: 847 // 14:07
  }
}
```

### EMOM (Every Minute On the Minute)
```typescript
{
  block_type: "EMOM",
  duration_min: 12,
  movements: [
    { name: "Thruster", reps: 10, weight: { value: 95, unit: "lb" } }
  ]
}
```

### STRENGTH
```typescript
{
  block_type: "STRENGTH",
  movements: [
    {
      name: "Back Squat",
      sets: 5,
      reps: 5,
      weight: { value: 315, unit: "lb" }
    }
  ]
}
```

## Benchmark Workouts

Common CrossFit benchmarks that should be tracked as PRs:

**Girls:**
- Fran, Grace, Helen, Diane, Elizabeth, Annie, Nancy, Karen, Cindy, Mary

**Heroes:**
- Murph, DT, Kalsu, JT, Badger, Griff, Daniel, Randy, Jason, Nate

**Other:**
- Fight Gone Bad, The Seven, Filthy Fifty, King Kong

## Photo OCR Flow

```
1. User captures photo of whiteboard
2. POST /api/ocr-workout with base64 image
3. Claude Vision extracts text
4. Return extracted text to user
5. User reviews/edits text
6. Submit to /api/parse-workout
```

## Voice Input Flow

```
1. User clicks microphone button
2. Web Speech API starts listening
3. Real-time transcription displayed
4. User stops recording
5. Transcribed text populated in textarea
6. User reviews/edits
7. Submit to /api/parse-workout
```

## API Endpoints

### POST /api/parse-workout
Parse workout text using Claude AI.

**Request:**
```typescript
{
  text: string,
  date: string // YYYY-MM-DD
}
```

**Response:**
```typescript
{
  parsed: {
    blocks: Block[],
    primary_score: string,
    rpe?: number,
    tags?: string[],
    notes?: string
  },
  workoutId: string
}
```

### POST /api/ocr-workout
Extract text from workout photo.

**Request:**
```typescript
{
  imageData: string // base64 encoded
}
```

**Response:**
```typescript
{
  text: string
}
```

### POST /api/transcribe-audio
Transcribe voice input (if using server-side transcription).

**Request:**
```typescript
{
  audioData: string // base64 encoded
}
```

**Response:**
```typescript
{
  text: string
}
```

### GET /api/workouts
Fetch coach programming from Google Sheets.

**Query Params:**
- `date` - YYYY-MM-DD format

**Response:**
```typescript
{
  workout: {
    date: string,
    description: string
  }
}
```

## Parsing Rules

### Movement Aliases
- "PU" → "Pull-up"
- "DL" → "Deadlift"
- "BS" → "Back Squat"
- "FS" → "Front Squat"
- "OHS" → "Overhead Squat"
- "C&J" → "Clean and Jerk"
- "S2OH" → "Shoulder to Overhead"

### Weight Parsing
- "225#" → 225 lb
- "100kg" → 100 kg
- "BW" → bodyweight
- "95/65" → 95 lb for men, 65 lb for women (use user's gender)

### Time Parsing
- "12:34" → 754 seconds
- "1:23.45" → 83.45 seconds
- "45s" → 45 seconds

### Score Parsing
- "7+5" → 7 rounds + 5 reps
- "14:07" → 847 seconds
- "225lb x 5" → 225 lb for 5 reps

## RPE (Rate of Perceived Exertion)

Scale: 1-10
- 1-3: Easy, could do much more
- 4-6: Moderate, sustainable
- 7-8: Hard, challenging but manageable
- 9: Very hard, near maximum effort
- 10: Maximum effort, couldn't do more

## Tags

Auto-extracted tags:
- Workout type: #strength, #metcon, #cardio
- Equipment: #barbell, #dumbbell, #kettlebell, #bodyweight
- Movement patterns: #squat, #press, #pull, #hinge
- Benchmark: #fran, #grace, #murph

## Component Patterns

### Workout Log Page
- Text input area (natural language)
- Photo OCR button
- Voice input button
- Date picker
- Submit button
- Recent workouts display
- Loading states

### Workout Display
- Date and time
- Original input text
- Parsed blocks with movements
- Score display
- RPE indicator
- Tags
- Edit/delete buttons

## Best Practices

1. **Parse deterministically** (temperature: 0)
2. **Preserve original input** in `input_text` field
3. **Calculate scores automatically** when possible
4. **Detect benchmarks** and create PR records
5. **Extract RPE** from text (e.g., "RPE 8")
6. **Tag workouts** for better analytics
7. **Handle ambiguity** gracefully (ask user if unclear)
8. **Test with real whiteboard photos** (various handwriting)
9. **Support voice input** for hands-free logging
10. **Show parse confidence** to user

## Common Parsing Patterns

```typescript
// Simple AMRAP
"12min AMRAP: 5 PU, 10 pushups, 15 squats - Got 7+5 RPE 8"

// For Time
"5 rounds for time: 10 deadlifts 225#, 15 box jumps - 14:07"

// EMOM
"12min EMOM: 10 thrusters 95#"

// Strength
"Back Squat: 5x5 @ 315#"

// Benchmark
"Fran: 21-15-9 thrusters 95# / pullups - 4:32 Rx"
```

## Error Handling

```typescript
// Handle parsing failures gracefully
try {
  const parsed = JSON.parse(claudeResponse)
  
  // Validate structure
  if (!parsed.blocks || !Array.isArray(parsed.blocks)) {
    throw new Error('Invalid workout structure')
  }
  
  return parsed
} catch (error) {
  console.error('Parse error:', error)
  
  // Return partial parse or ask user to clarify
  return {
    blocks: [],
    primary_score: 'Unable to parse',
    notes: 'Please review and edit manually'
  }
}
```
