---
inclusion: fileMatch
fileMatchPattern: '**/{food-progress,meals,components/Meal*,components/*Progress*,components/Target*}/**/*.{ts,tsx}'
---

# Food Tracking Guidelines

## Food Tracking Flow

```
1. PHOTO CAPTURE
   ├── User opens camera via MealCameraCapture component
   ├── Take photo (mobile camera API)
   ├── Preview photo
   └── User confirms or retakes

2. CLIENT-SIDE PROCESSING
   ├── Image compression (imageUtils.ts)
   │   ├── Resize to max 1200px width
   │   ├── Quality: 0.8
   │   └── Format: JPEG
   ├── Base64 encode
   └── Check network connectivity

3. PHOTO STORAGE
   ├── Convert base64 to File object
   ├── Generate unique filename: user_id_timestamp.jpg
   ├── Upload to Supabase Storage
   │   ├── Bucket: meal-photos
   │   ├── Path: {user_id}/{filename}
   │   └── RLS: User can only access own photos
   └── Get public URL

4. AI ANALYSIS (Claude Vision)
   ├── Prepare image for Claude API
   ├── Call Anthropic API with vision
   │   ├── Model: claude-sonnet-4-20250514
   │   ├── Image: base64 encoded
   │   └── Prompt: "Analyze meal, estimate macros"
   ├── Parse JSON response
   │   ├── total_protein
   │   ├── total_carbs
   │   ├── total_fat
   │   ├── total_calories
   │   └── items (JSONB with details)
   └── Validate ranges (macro-validation.ts)

5. DATABASE INSERT
   ├── INSERT INTO meals
   │   ├── user_id (from auth.uid())
   │   ├── meal_timestamp (now)
   │   ├── photo_url
   │   ├── meal_timing
   │   ├── total_protein
   │   ├── total_carbs
   │   ├── total_fat
   │   ├── total_calories
   │   └── items (JSONB)
   └── Returns meal_id

6. FRONTEND UPDATE
   ├── Close camera modal
   ├── Show success message
   ├── Add meal to DailyProgressView
   ├── Update macro totals
   └── Recalculate adherence percentage
```

## Meals Table Schema

```sql
meals
├── id (UUID, primary key)
├── user_id (UUID, FK to auth.users)
├── meal_timestamp (TIMESTAMPTZ)
├── photo_url (TEXT) - Supabase Storage URL
├── meal_timing (TEXT) - "PRE_WORKOUT", "POST_WORKOUT", "BREAKFAST", "LUNCH", "DINNER", "SNACK"
├── total_protein (DECIMAL)
├── total_carbs (DECIMAL)
├── total_fat (DECIMAL)
├── total_calories (INTEGER)
├── items (JSONB) - detailed breakdown
└── created_at (TIMESTAMPTZ)
```

## Meal Items JSONB Structure

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
    },
    {
      name: "Brown rice",
      quantity: "1 cup",
      protein: 5,
      carbs: 45,
      fat: 2,
      calories: 216
    }
  ]
}
```

## Image Compression

```typescript
import { compressImage } from '@/app/lib/imageUtils'

// Compress before upload
const compressed = await compressImage(file, {
  maxWidth: 1200,
  maxHeight: 1200,
  quality: 0.8
})

// Should be under 1MB after compression
```

## Macro Validation

```typescript
import { validateMacros } from '@/app/lib/macro-validation'

const result = validateMacros({
  protein: 35,
  carbs: 45,
  fat: 15,
  calories: 450
})

if (!result.isValid) {
  console.error('Invalid macros:', result.errors)
}

// Validation rules:
// - All values must be non-negative
// - Protein: 0-200g per meal
// - Carbs: 0-300g per meal
// - Fat: 0-150g per meal
// - Calories: 0-2000 per meal
// - Calorie calculation within 10% of macro-derived calories
```

## Daily Progress Calculation

```typescript
import { calculateAdherence } from '@/app/lib/adherence-calculator'

// Get today's meals
const meals = await fetchTodaysMeals()

// Calculate totals
const totals = {
  protein: meals.reduce((sum, m) => sum + m.total_protein, 0),
  carbs: meals.reduce((sum, m) => sum + m.total_carbs, 0),
  fat: meals.reduce((sum, m) => sum + m.total_fat, 0),
  calories: meals.reduce((sum, m) => sum + m.total_calories, 0)
}

// Get targets
const targets = await fetchDailyTargets()

// Calculate adherence (0.0 - 1.0)
const adherence = calculateAdherence(totals, targets)
```

## Meal Timing Options

```typescript
type MealTiming = 
  | 'PRE_WORKOUT'
  | 'POST_WORKOUT'
  | 'BREAKFAST'
  | 'LUNCH'
  | 'DINNER'
  | 'SNACK'

// Use for correlation analysis with workouts
```

## Camera Integration

```typescript
// Request camera access (environment-facing for food photos)
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: 'environment', // Back camera on mobile
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  }
})

// Capture photo from video stream
const canvas = document.createElement('canvas')
canvas.width = video.videoWidth
canvas.height = video.videoHeight
const ctx = canvas.getContext('2d')
ctx?.drawImage(video, 0, 0)

// Convert to base64
const imageData = canvas.toDataURL('image/jpeg', 0.8)
```

## Offline Support

```typescript
import { addToOfflineQueue } from '@/app/lib/offline-queue'

// If offline, queue for later upload
if (!navigator.onLine) {
  await addToOfflineQueue({
    type: 'meal-upload',
    data: { imageData, mealName, mealTiming }
  })
  
  showMessage('Saved for upload when online')
  return
}

// On reconnect, process queue
window.addEventListener('online', async () => {
  await processOfflineQueue()
})
```

## Storage Bucket Configuration

**Bucket name:** `meal-photos`

**RLS Policies:**
```sql
-- Users can upload to their own folder
CREATE POLICY "Users can upload own photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'meal-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can view their own photos
CREATE POLICY "Users can view own photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'meal-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own photos
CREATE POLICY "Users can delete own photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'meal-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
```

## API Endpoints

### POST /api/meals/upload
Upload meal photo and perform AI analysis.

**Request:**
```typescript
{
  imageData: string,      // base64 encoded
  mealName?: string,      // optional
  mealTiming?: MealTiming // optional
}
```

**Response:**
```typescript
{
  meal: {
    id: string,
    total_protein: number,
    total_carbs: number,
    total_fat: number,
    total_calories: number,
    items: Array<{
      name: string,
      quantity: string,
      protein: number,
      carbs: number,
      fat: number,
      calories: number
    }>
  }
}
```

### GET /api/meals/daily
Get daily meal summary.

**Query Params:**
- `date` - YYYY-MM-DD format

**Response:**
```typescript
{
  meals: Meal[],
  totals: {
    protein: number,
    carbs: number,
    fat: number,
    calories: number
  },
  targets: {
    protein: number,
    carbs: number,
    fat: number,
    calories: number
  },
  adherence: number // 0.0 - 1.0
}
```

### PUT /api/meals/[id]
Update meal data (manual macro adjustments).

### DELETE /api/meals/[id]
Delete meal and associated photo.

## Component Patterns

### MealCameraCapture
- Camera access and photo capture
- Image preview
- Compression before upload
- Offline queue integration

### DailyProgressView
- Display all meals for selected date
- Show macro totals vs targets
- Progress bars for each macro
- Adherence percentage
- Add meal button

### MealEntryCard
- Photo thumbnail
- Meal name and timestamp
- Macro breakdown
- Edit/delete buttons
- Meal timing indicator

### MealEditModal
- Editable macro values
- Meal name input
- Meal timing selector
- Save/cancel buttons
- Validation

### TargetManagement
- Set daily macro targets
- Calorie calculation
- Save/reset buttons
- Validation

## Best Practices

1. **Always compress images** before upload (target <1MB)
2. **Validate macros** before saving to database
3. **Handle offline scenarios** gracefully
4. **Use meal_timing** for workout correlation analysis
5. **Test camera on actual mobile devices** (HTTPS required)
6. **Provide manual edit capability** for AI inaccuracies
7. **Show progress immediately** after upload
8. **Clean up orphaned photos** periodically
