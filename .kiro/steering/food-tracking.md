---
inclusion: fileMatch
fileMatchPattern: '**/{food-progress,meals,components/Meal*,components/*Progress*,components/Target*}/**/*.{ts,tsx}'
---

# Food Tracking

## Multi-Modal Input Flow
1. **Text/Voice** → `/api/meals/parse-text` → Claude extracts items + macros → Review → Save
2. **Photo** → Compress (max 1200px, 0.8 quality, <1MB) → Upload to `meal-photos/{user_id}/` → Claude Vision analysis → Validate → Save

## Database Schema
```sql
meals: id, user_id, meal_timestamp, photo_url, meal_timing, total_protein/carbs/fat/calories, items(JSONB), created_at
daily_targets: id, user_id, date, target_protein/carbs/fat/calories
daily_summaries: (VIEW) user_id, date, totals, meal_count
```

## Meal Items JSONB
```json
{
  "items": [
    { "name": "Chicken breast", "quantity": "6 oz", "protein": 42, "carbs": 0, "fat": 3, "calories": 195 }
  ]
}
```

## Key Functions

**Image** (`app/lib/imageUtils.ts`):
- `compressImage(file, { maxWidth: 1200, quality: 0.8 })` - Returns compressed base64

**Validation** (`app/lib/macro-validation.ts`):
- `validateMacros({ protein, carbs, fat, calories })` - Returns `{ isValid, errors }`
- Ranges: protein 0-200g, carbs 0-300g, fat 0-150g, calories 0-2000 per meal
- Calorie check: Within 10% of macro-derived calories

**Adherence** (`app/lib/adherence-calculator.ts`):
- `calculateAdherence(totals, targets)` - Returns 0.0-1.0

**Offline** (`app/lib/offline-queue.ts`):
- `addToOfflineQueue({ type: 'meal-upload', data })` - Queue for later upload

## API Endpoints

**POST /api/meals/parse-text**
- Body: `{ text: string, timestamp: string }`
- Returns: `{ mealId, items[], totals, confidence }`

**POST /api/meals/upload**
- Body: `{ imageData: base64, mealTiming?: string }`
- Returns: `{ meal: { id, totals, items[] } }`

**GET /api/meals/daily?date=YYYY-MM-DD**
- Returns: `{ meals[], totals, targets, adherence }`

**PUT /api/meals/[id]** - Update meal
**DELETE /api/meals/[id]** - Delete meal + photo

## Meal Timing
`PRE_WORKOUT | POST_WORKOUT | BREAKFAST | LUNCH | DINNER | SNACK`

## Camera Integration
```typescript
// Environment-facing camera (back camera)
navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
})
```

## Storage RLS (meal-photos bucket)
```sql
-- Users can upload/view/delete only their own photos
-- Path: {user_id}/{filename}
```

## Text Parsing Examples
```
"Chicken breast 6oz, brown rice 1 cup, broccoli 1 cup, olive oil 1 tbsp"
"Grilled salmon with sweet potato and asparagus" (AI estimates portions)
"8oz steak, mashed potatoes, green beans"
```

## Portion Defaults (when not specified)
- Meat: 4-6 oz
- Grains: 1 cup cooked
- Vegetables: 1 cup
- Fats: 1 tbsp
- Nuts/Cheese: 1 oz

## Confidence Scoring
AI assigns 0.0-1.0 based on portion specificity, food clarity, cooking method. Flag <0.7 for review.

## Components
- `MealCameraCapture` - Camera access, preview, compression, offline queue
- `DailyProgressView` - All meals, totals vs targets, progress bars, adherence %
- `MealEntryCard` - Photo, macros, edit/delete, timing indicator
- `MealEditModal` - Edit macros, name, timing
- `TargetManagement` - Set daily targets

## Best Practices
- Always compress images (<1MB target)
- Validate macros before saving
- Handle offline gracefully
- Use meal_timing for workout correlation
- Test camera on mobile (HTTPS required)
- Provide manual edit for AI inaccuracies
- Include portions in text for better accuracy
