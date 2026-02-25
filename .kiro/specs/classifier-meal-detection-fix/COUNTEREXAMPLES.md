# Bug Condition Exploration - Counterexamples Found

**Date**: 2026-02-01
**Test File**: `test/agents/classifier-meal-detection-bugfix.property.test.ts`
**Status**: Bug confirmed - 5 out of 6 keyword fallback tests FAILED on unfixed code

## Summary

The bug exists in the **keyword fallback** function (`classifyWithKeywords`), NOT in the LLM classifier. When the LLM classifier works correctly (which it does for these inputs), the bug is hidden. However, when the LLM fails and the system falls back to keyword matching, the bug manifests.

## Test Results

### LLM Classifier Tests (All PASSED ✅)
The LLM classifier (Claude Haiku 4.5) correctly handles all test cases:
- ✅ Yogurt and granola with portions → `meal_log`, confidence >= 0.8
- ✅ Protein shake with fruits → `meal_log`, confidence >= 0.8
- ✅ Avocado and eggs → `meal_log`, confidence >= 0.8
- ✅ Chicken with vegetables → `meal_log`, confidence >= 0.8

**Conclusion**: The LLM classifier is working correctly. The bug is in the keyword fallback.

### Keyword Fallback Tests (5 FAILED ❌, 1 PASSED ✅)

#### Test 1: Yogurt and Granola ❌
**Input**: "I had 170g of 0% greek yogurt and 65g of peanut butter granola"
**Expected**: `meal_log`, confidence >= 0.7, domains: ["nutritionist"]
**Actual**: `unclear`, confidence < 0.7
**Root Cause**: "yogurt" and "granola" are NOT in NUTRITION_KEYWORDS

#### Test 2: Protein Shake with Fruits ❌
**Input**: "Had 2 scoops protein powder, 1 banana, and 1 cup berries"
**Expected**: `meal_log`, confidence >= 0.7, domains: ["nutritionist"]
**Actual**: `mixed`, confidence 0.6, domains: ["trainer", "nutritionist"]
**Root Cause**: 
- "protein" and "powder" are in NUTRITION_KEYWORDS (partial match)
- BUT "banana" and "berries" are NOT in NUTRITION_KEYWORDS
- "scoop" matches workout keyword pattern, causing mixed classification

#### Test 3: Avocado and Eggs ❌
**Input**: "Had 1 avocado and 2 eggs for breakfast"
**Expected**: `meal_log`, confidence >= 0.7, domains: ["nutritionist"], has_portions: true
**Actual**: `meal_log`, confidence 0.7, domains: ["nutritionist"], **has_portions: false**
**Root Cause**: 
- "eggs" and "breakfast" are in NUTRITION_KEYWORDS (works!)
- BUT portions regex `/\d+\s*(oz|g|cup|tbsp|lb|kg|slice|scoop)/i` doesn't match "1 avocado" or "2 eggs"
- The regex requires explicit units (oz, g, cup, etc.) but doesn't handle bare numbers like "1 avocado"

#### Test 4: Chicken with Vegetables ✅
**Input**: "Ate 6oz chicken breast with 1 cup broccoli and spinach"
**Expected**: `meal_log`, confidence >= 0.7, domains: ["nutritionist"], has_portions: true
**Actual**: `meal_log`, confidence 0.7, domains: ["nutritionist"], has_portions: true
**Root Cause**: WORKS because "chicken" is in NUTRITION_KEYWORDS and "6oz" and "1 cup" match portions regex

#### Test 5: Past-tense "had" without existing keywords ❌
**Input**: "Had 100g granola with milk"
**Expected**: `meal_log`, confidence >= 0.7, domains: ["nutritionist"]
**Actual**: `unclear`, confidence 0.3
**Root Cause**: 
- "granola" is NOT in NUTRITION_KEYWORDS
- "milk" is NOT in NUTRITION_KEYWORDS
- Past-tense verb "had" is NOT leveraged as a meal indicator
- Portions are detected but not used to boost confidence

#### Test 6: Past-tense "ate" without existing keywords ❌
**Input**: "Ate 1 banana and some almonds"
**Expected**: `meal_log`, confidence >= 0.7, domains: ["nutritionist"], has_portions: true
**Actual**: `unclear`, confidence 0.3, has_portions: false
**Root Cause**: 
- "banana" is NOT in NUTRITION_KEYWORDS
- "almonds" is NOT in NUTRITION_KEYWORDS
- Past-tense verb "ate" is NOT leveraged as a meal indicator
- "1 banana" doesn't match portions regex (needs explicit units)

## Root Cause Analysis

### 1. Missing Food Items in NUTRITION_KEYWORDS ❌
The current NUTRITION_KEYWORDS array is missing many common food items:
- **Missing**: yogurt, granola, banana, berries, avocado, almonds, milk, broccoli, spinach
- **Present**: protein, calories, carbs, fat, meal, food, ate, eating, macros, diet, nutrition, breakfast, lunch, dinner, snack, chicken, rice, eggs, shake, oatmeal, salmon, steak

### 2. Past-Tense Food Verbs Not Leveraged ❌
The keyword fallback detects "ate" in NUTRITION_KEYWORDS but doesn't recognize:
- "had" as a meal indicator
- "consumed", "drank", "finished" as meal indicators
- These verbs combined with portions should boost confidence

### 3. Portions Regex Too Restrictive ❌
The portions regex `/\d+\s*(oz|g|cup|tbsp|lb|kg|slice|scoop)/i` doesn't match:
- Bare numbers like "1 avocado", "2 eggs", "1 banana"
- Common portion patterns like "some almonds", "a handful of nuts"

### 4. Portions Not Used for Confidence Boosting ❌
When portions are detected, the keyword fallback stores `has_portions: true` in context but doesn't use this to boost confidence for meal classification.

## Recommendations for Fix

Based on the counterexamples, the fix should:

1. **Expand NUTRITION_KEYWORDS** with comprehensive list of common food items:
   - Dairy: yogurt, milk, cheese, cottage cheese, greek yogurt
   - Grains/Cereals: granola, cereal, quinoa, pasta, bread
   - Fruits: banana, apple, berries, strawberries, blueberries, avocado, orange
   - Vegetables: broccoli, spinach, kale, carrots, peppers
   - Proteins: turkey, pork, tuna, shrimp, tofu
   - Fats: peanut butter, almond butter, nuts, almonds, walnuts, olive oil

2. **Add MEAL_VERBS constant** for past-tense food verbs:
   - ["had", "ate", "consumed", "drank", "finished", "eating", "drinking"]

3. **Implement confidence boosting logic**:
   - If portions detected AND (nutrition keywords OR meal verbs) → boost confidence to 0.7
   - If portions detected AND nutrition keywords AND meal verbs → boost confidence to 0.8

4. **Enhance portions regex** (optional):
   - Consider matching bare numbers like "1 avocado", "2 eggs"
   - Or keep current regex and rely on confidence boosting from meal verbs + food keywords

5. **Enhance LLM classifier prompt** with more examples (optional):
   - The LLM already works correctly, but adding examples can make it more robust

## Conclusion

The bug is confirmed and exists in the keyword fallback function. The root cause is:
1. Missing common food items in NUTRITION_KEYWORDS
2. Past-tense food verbs not leveraged as meal indicators
3. Portions detected but not used for confidence boosting

The fix should focus on expanding NUTRITION_KEYWORDS, adding MEAL_VERBS detection, and implementing confidence boosting logic when portions + meal indicators are present.
