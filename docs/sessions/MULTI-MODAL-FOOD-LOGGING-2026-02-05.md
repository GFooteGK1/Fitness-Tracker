# Multi-Modal Food Logging Implementation

**Date:** February 5, 2026  
**Status:** Phase 1 Complete - Ready for Testing  
**Approach:** Gradual Migration (Option 1)

## Overview

Added multi-modal food logging (text, voice, photo) to SociusFit while preserving the existing photo-based food tracking flow with portion selection and refinement.

## Implementation Strategy

### Phase 1: New Parallel Page ✅

Created `/food-log` page alongside existing `/food-progress` page to:
- Test new multi-modal input without breaking existing flow
- Allow gradual user migration
- Validate text/voice parsing before full integration

### Phase 2: Testing & Validation (Next)

- Test text input parsing accuracy
- Test voice transcription quality
- Verify portion selection works for all input types
- Ensure refine API works correctly

### Phase 3: Merge (Future)

- If successful, merge into `/food-progress`
- Deprecate separate pages
- Single unified food logging experience

## What Was Created

### 1. New Page: `/food-log`

**File:** `app/food-log/page.tsx`

**Features:**
- Text input (natural language meal descriptions)
- Voice input (Web Speech API)
- Photo input (reuses existing upload flow)
- Same UI patterns as workout logging
- Mobile-first responsive design
- Dark mode support

**Input Methods:**
```
┌─────────────────────────────────┐
│  📷 Photo    │  🎤 Voice        │
│  Snap meal   │  Speak meal      │
├─────────────────────────────────┤
│  Text Area (all modes)          │
│  - Photo: AI results            │
│  - Voice: Transcript            │
│  - Text: Direct input           │
└─────────────────────────────────┘
```

### 2. New API: `/api/meals/parse-text`

**File:** `app/api/meals/parse-text/route.ts`

**Purpose:** Parse natural language meal descriptions into structured nutritional data

**Input:**
```typescript
{
  text: "Chicken breast 6oz, brown rice 1 cup, broccoli",
  timestamp: "2026-02-05T12:00:00Z"
}
```

**Output:**
```typescript
{
  mealId: "uuid",
  items: [
    { food: "Chicken breast", portion: "6 oz", protein: 42, carbs: 0, fat: 3, calories: 195 },
    { food: "Brown rice", portion: "1 cup", protein: 5, carbs: 45, fat: 2, calories: 216 },
    { food: "Broccoli", portion: "1 cup", protein: 3, carbs: 6, fat: 0, calories: 31 }
  ],
  totals: { protein: 50, carbs: 51, fat: 5, calories: 442 },
  confidence: 0.9
}
```

**AI Prompt Strategy:**
- Uses Claude Sonnet 4 (same as workout parsing)
- Temperature: 0 (deterministic)
- USDA nutritional data guidelines
- Portion size defaults when not specified
- Confidence scoring based on specificity

### 3. Navigation Update

**File:** `app/components/Navigation.tsx`

Added "Log Meal" link next to "Log Workout" in desktop and mobile navigation.

## Preserved Existing Flow

### Current Food Progress Flow (Untouched)

```
/food-progress?view=camera
  ↓
MealCameraCapture component
  ↓
Photo capture → Upload
  ↓
/api/meals/upload (Claude Vision)
  ↓
Portion Selection (PortionSelector)
  ↓
/api/meals/refine (with portion specs)
  ↓
Save to database
```

**No changes made to:**
- `app/food-progress/page.tsx`
- `app/components/MealCameraCapture.tsx`
- `app/components/PortionSelector.tsx`
- `app/api/meals/upload/route.ts`
- `app/api/meals/refine/route.ts`

## Design Patterns Reused from Workout Logging

### 1. UI Layout
- Same date picker at top
- Same status message banner (success/error/info)
- Same 2x2 input method grid
- Same textarea for review/edit
- Same Clear + Submit buttons

### 2. Voice Recording
- Web Speech API (identical implementation)
- Real-time transcription display
- Start/stop toggle
- Error handling for permissions

### 3. Photo Capture
- File input with `capture="environment"`
- Image compression (`compressImage()`)
- Preview with retake/analyze options
- Progress indicators

### 4. API Pattern
- Auth check first (Supabase SSR)
- Input validation
- Claude AI parsing (temperature: 0)
- JSON response parsing
- Database save with RLS
- Structured response

### 5. Mobile-First Design
- 44px touch targets
- 16px minimum font size (prevents iOS zoom)
- Responsive breakpoints (sm:, lg:)
- Dark mode support
- Sticky bottom buttons on mobile

## Database Schema (No Changes)

The existing `meals` table already supports all input types:

```sql
meals
├── id (UUID)
├── user_id (UUID)
├── meal_timestamp (TIMESTAMPTZ)
├── input_text (TEXT) ← Stores original text/voice input
├── photo_url (TEXT) ← NULL for text/voice entries
├── items (JSONB) ← Same structure for all input types
├── total_protein (DECIMAL)
├── total_carbs (DECIMAL)
├── total_fat (DECIMAL)
├── total_calories (INTEGER)
├── ai_confidence (DECIMAL)
├── needs_review (BOOLEAN)
└── created_at (TIMESTAMPTZ)
```

## Future Enhancements

### Phase 2 Additions (Optional)

1. **Portion Selection for Text/Voice**
   - After parsing, show PortionSelector
   - Allow user to refine portions
   - Call `/api/meals/refine` with adjustments

2. **Meal Timing Selection**
   - Add dropdown: PRE_WORKOUT, POST_WORKOUT, BREAKFAST, LUNCH, DINNER, SNACK
   - Store in `meal_timing` column
   - Use for workout correlation analysis

3. **Quick Meal Templates**
   - Save frequently logged meals
   - One-tap logging of common meals
   - "Log same as yesterday"

4. **Barcode Scanning**
   - Use device camera to scan food barcodes
   - Look up nutritional data from database
   - Auto-populate macros

### Phase 3 Merge Strategy

When ready to merge into `/food-progress`:

1. Add input method selector to food-progress page
2. Replace camera-only view with multi-modal view
3. Update breadcrumbs and navigation
4. Deprecate `/food-log` page
5. Redirect old URLs to new unified page

## Testing Checklist

### Text Input
- [ ] Parse simple meals: "Chicken breast 6oz, rice 1 cup"
- [ ] Parse without portions: "Grilled salmon with vegetables"
- [ ] Parse with cooking methods: "Fried chicken, baked potato"
- [ ] Handle ambiguous input gracefully
- [ ] Validate macro ranges
- [ ] Check confidence scoring

### Voice Input
- [ ] Test on Chrome (desktop/mobile)
- [ ] Test on Safari (iOS)
- [ ] Test with background noise
- [ ] Test with food-specific vocabulary
- [ ] Verify transcript accuracy
- [ ] Handle permission denials

### Photo Input
- [ ] Verify existing upload flow still works
- [ ] Check compression works
- [ ] Verify AI analysis
- [ ] Test portion selection
- [ ] Test refine API
- [ ] Check offline queuing

### Integration
- [ ] All input types save to same database table
- [ ] Meals appear in food-progress view
- [ ] Daily totals calculate correctly
- [ ] Adherence calculations work
- [ ] Cross-domain queries include all meal types

### Mobile Testing
- [ ] Test on actual iOS device
- [ ] Test on actual Android device
- [ ] Verify touch targets (44px minimum)
- [ ] Check font sizes (16px minimum)
- [ ] Test camera permissions
- [ ] Test microphone permissions
- [ ] Verify offline behavior

## Success Metrics

**Phase 1 Success Criteria:**
- Text parsing accuracy > 85%
- Voice transcription accuracy > 80%
- Photo analysis maintains current accuracy
- No regressions in existing food-progress flow
- Mobile UX matches workout logging quality

**Phase 2 Success Criteria:**
- Users adopt text/voice input (>30% of meals)
- Portion refinement works for all input types
- User feedback is positive
- No increase in support requests

**Phase 3 Success Criteria:**
- Unified page has feature parity
- User migration is smooth
- No data loss or corruption
- Performance remains fast (<200ms API responses)

## Known Limitations

1. **Voice Input Browser Support**
   - Chrome: Full support
   - Safari: Full support
   - Firefox: Limited support
   - Edge: Full support

2. **Text Parsing Accuracy**
   - Depends on portion specificity
   - May struggle with unusual foods
   - Cooking methods affect accuracy
   - Regional food names may vary

3. **Photo Analysis**
   - Requires good lighting
   - Works best with single-plate meals
   - May struggle with mixed dishes
   - Portion estimation is approximate

## Related Documentation

- **Workout Logging:** `app/log/page.tsx` (reference implementation)
- **Food Tracking:** `.kiro/steering/food-tracking.md`
- **Workout Tracking:** `.kiro/steering/workout-tracking.md`
- **API Development:** `.kiro/steering/api-development.md`
- **Component Patterns:** `.kiro/steering/component-patterns.md`

## Next Steps

1. **Test the new `/food-log` page**
   - Try text input with various meal descriptions
   - Test voice input on mobile device
   - Verify photo input still works

2. **Gather feedback**
   - Which input method is preferred?
   - Is text parsing accurate enough?
   - Does voice transcription work well?

3. **Iterate based on feedback**
   - Improve AI prompts if needed
   - Add portion selection for text/voice
   - Enhance error messages

4. **Plan Phase 2**
   - Decide on merge timeline
   - Plan migration strategy
   - Update documentation

---

**Implementation Complete:** Phase 1 ✅  
**Ready for Testing:** Yes  
**Breaking Changes:** None  
**Deployment Risk:** Low (new page, no changes to existing flow)
