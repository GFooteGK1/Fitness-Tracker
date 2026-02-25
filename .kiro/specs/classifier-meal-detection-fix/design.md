# Classifier Meal Detection Bugfix Design

## Overview

This bugfix addresses the classifier's failure to confidently identify obvious meal inputs containing portions and common food items. The issue manifests when users provide natural meal descriptions like "I had 170g of 0% greek yogurt and 65g of peanut butter granola" — the classifier returns `unclear` or confidence < 0.5, triggering an unnecessary clarification flow.

The fix involves three targeted improvements:
1. **Expand NUTRITION_KEYWORDS** — Add comprehensive list of common food items to the keyword fallback
2. **Improve Keyword Fallback Logic** — Leverage portions + past-tense food verbs as strong meal indicators
3. **Enhance LLM Classifier Prompt** — Add meal examples with portions to help the LLM learn the pattern

This approach maintains backward compatibility while significantly improving meal detection accuracy for the most common user inputs.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when meal inputs with portions and common food items fail to be classified as `meal_log` with confidence >= 0.8
- **Property (P)**: The desired behavior when meal inputs with portions are provided - classifier should return `meal_log` with confidence >= 0.8
- **Preservation**: Existing classification behavior for workouts, questions, mixed inputs, and unclear inputs that must remain unchanged
- **classifyInput**: The main classifier function in `app/lib/agents/classifier.ts` that orchestrates LLM classification with keyword fallback
- **classifyWithKeywords**: The keyword-based fallback function that runs when the LLM classifier fails
- **NUTRITION_KEYWORDS**: The array of nutrition-related keywords used by the keyword fallback
- **CLASSIFIER_SYSTEM_PROMPT**: The system prompt in `app/lib/agents/prompts/classifier.ts` that instructs the LLM how to classify inputs
- **Confidence Threshold**: The 0.5 threshold below which the router triggers clarification

## Bug Details

### Fault Condition

The bug manifests when users provide meal descriptions with portions and common food items. The classifier (both LLM and keyword fallback) fails to recognize these as confident meal logs, resulting in unnecessary clarification requests.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type string (user message content)
  OUTPUT: boolean
  
  RETURN containsPortions(input)
         AND containsCommonFoodItems(input)
         AND (classifyInput(input, 'text').confidence < 0.8
              OR classifyInput(input, 'text').input_type != 'meal_log')
         
  WHERE:
    containsPortions(input) = input matches /\d+\s*(oz|g|cup|tbsp|lb|kg|slice|scoop)/i
    containsCommonFoodItems(input) = input contains words like "yogurt", "granola", 
                                     "peanut butter", "banana", "avocado", "berries", etc.
END FUNCTION
```

### Examples

- **Example 1**: "I had 170g of 0% greek yogurt and 65g of peanut butter granola"
  - **Expected**: `meal_log`, confidence >= 0.8, domains: `["nutritionist"]`
  - **Actual (buggy)**: `unclear`, confidence < 0.5, domains: `[]`
  - **Why it fails**: "yogurt" and "granola" are not in NUTRITION_KEYWORDS, LLM may not have enough examples with portions

- **Example 2**: "Had 2 scoops protein powder, 1 banana, and 1 cup berries"
  - **Expected**: `meal_log`, confidence >= 0.8, domains: `["nutritionist"]`
  - **Actual (buggy)**: `unclear` or low confidence
  - **Why it fails**: "banana" and "berries" not in NUTRITION_KEYWORDS, past-tense "had" not leveraged

- **Example 3**: "Ate 6oz chicken breast with 1 cup rice and broccoli"
  - **Expected**: `meal_log`, confidence >= 0.9, domains: `["nutritionist"]`
  - **Actual (buggy)**: May work if "chicken" and "rice" are in keywords, but confidence may be lower than expected
  - **Why it fails**: Past-tense "ate" + portions should boost confidence but doesn't

- **Edge Case**: "Had 1 avocado and 2 eggs for breakfast"
  - **Expected**: `meal_log`, confidence >= 0.9, domains: `["nutritionist"]`, context: `{meal_timing: "BREAKFAST"}`
  - **Actual (buggy)**: May fail if "avocado" not in keywords
  - **Why it fails**: "avocado" is a common food item but not in NUTRITION_KEYWORDS

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Workout logs with clear exercise patterns must continue to be classified as `workout_log` with confidence >= 0.9
- Cross-domain questions with trigger words like "affect", "correlation" must continue to be classified as `question` with domains `["socius"]`
- Mixed inputs containing both workout and meal references must continue to be classified as `mixed`
- Ambiguous inputs like "hey" or "hello" must continue to be classified as `unclear` with confidence < 0.5
- Meal inputs without portions (e.g., "Had a protein shake and banana") must continue to be classified as `meal_log` with confidence >= 0.8

**Scope:**
All inputs that do NOT involve meal descriptions with portions and common food items should be completely unaffected by this fix. This includes:
- Workout logs (e.g., "5 rounds: 10 DL 225#, 15 BJ — 14:07")
- Questions (e.g., "What's my best Fran time?")
- Cross-domain questions (e.g., "How does my protein intake affect my recovery?")
- Mixed logs (e.g., "Had a protein shake after my deadlift session")
- Unclear inputs (e.g., "hey", "hello")
- Meal logs without portions (e.g., "Had a protein shake")

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **Incomplete NUTRITION_KEYWORDS List**: The current list includes basic terms like "protein", "calories", "meal", "food", "chicken", "rice", "eggs", "shake", "oatmeal", "salmon", "steak" but is missing many common food items that users naturally mention:
   - Dairy: "yogurt", "milk", "cheese", "cottage cheese"
   - Grains/Cereals: "granola", "cereal", "quinoa", "pasta", "bread"
   - Fruits: "banana", "apple", "berries", "strawberries", "blueberries", "avocado", "orange"
   - Vegetables: "broccoli", "spinach", "kale", "carrots", "peppers"
   - Proteins: "turkey", "pork", "tuna", "shrimp", "tofu"
   - Fats: "peanut butter", "almond butter", "nuts", "almonds", "walnuts", "olive oil"

2. **Keyword Fallback Doesn't Leverage Portions**: The current `classifyWithKeywords` function detects portions via regex (`has_portions: /\d+\s*(oz|g|cup|tbsp|lb|kg|slice|scoop)/i.test(content)`) but only stores this in context — it doesn't use it to boost confidence for meal classification. When portions are present alongside food-related words, this is a very strong signal for meal logging.

3. **Keyword Fallback Doesn't Leverage Past-Tense Food Verbs**: Common meal logging patterns include past-tense verbs like "had", "ate", "consumed", "drank". When combined with portions, these are extremely strong meal indicators. The current fallback doesn't check for these patterns.

4. **LLM Classifier Lacks Portion Examples**: The CLASSIFIER_SYSTEM_PROMPT includes examples like "Chicken breast 6oz with rice and broccoli" and "Had a protein shake and banana", but could benefit from more examples that specifically demonstrate the portions + common food items pattern that users frequently use.

## Correctness Properties

Property 1: Fault Condition - Meal Inputs with Portions Classified Correctly

_For any_ input where the bug condition holds (contains portions and common food items), the fixed classifier SHALL return `meal_log` with confidence >= 0.8 and domains `["nutritionist"]`, enabling direct routing to the nutritionist agent without clarification.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Non-Meal Input Behavior

_For any_ input that is NOT a meal description with portions and common food items (workout logs, questions, mixed inputs, unclear inputs, meal logs without portions), the fixed classifier SHALL produce exactly the same classification result as the original classifier, preserving all existing routing behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `app/lib/agents/classifier.ts`

**Function**: `classifyWithKeywords`

**Specific Changes**:

1. **Expand NUTRITION_KEYWORDS Array**: Add comprehensive list of common food items
   - Add dairy products: "yogurt", "milk", "cheese", "cottage cheese", "greek yogurt"
   - Add grains/cereals: "granola", "cereal", "quinoa", "pasta", "bread", "bagel", "tortilla"
   - Add fruits: "banana", "apple", "berries", "strawberries", "blueberries", "avocado", "orange", "grapes", "mango"
   - Add vegetables: "broccoli", "spinach", "kale", "carrots", "peppers", "tomato", "cucumber", "lettuce"
   - Add proteins: "turkey", "pork", "tuna", "shrimp", "tofu", "beef", "fish"
   - Add fats: "peanut butter", "almond butter", "nuts", "almonds", "walnuts", "olive oil", "butter", "oil"
   - Add common meal descriptors: "smoothie", "salad", "sandwich", "wrap", "bowl"

2. **Add Past-Tense Food Verb Detection**: Create a new constant for meal action verbs
   - Add MEAL_VERBS array: ["had", "ate", "consumed", "drank", "finished", "eating", "drinking"]
   - Check for these verbs in the input text

3. **Implement Confidence Boosting Logic**: Enhance the keyword fallback to boost confidence when strong meal indicators are present
   - If portions detected AND (nutrition keywords OR meal verbs) → boost confidence to 0.7
   - If portions detected AND nutrition keywords AND meal verbs → boost confidence to 0.8
   - This ensures meal inputs with portions get routed directly without clarification

4. **Preserve Existing Logic**: Ensure all other classification paths remain unchanged
   - Workout classification logic unchanged
   - Question detection logic unchanged
   - Cross-domain trigger logic unchanged
   - Mixed input logic unchanged

**File**: `app/lib/agents/prompts/classifier.ts`

**Constant**: `CLASSIFIER_SYSTEM_PROMPT`

**Specific Changes**:

5. **Add More Meal Examples with Portions**: Enhance the examples section to include more meal inputs with portions and common food items
   - Add example: "I had 170g of 0% greek yogurt and 65g of peanut butter granola" → `meal_log`, confidence 0.9
   - Add example: "Ate 2 scoops protein powder, 1 banana, and 1 cup berries" → `meal_log`, confidence 0.9
   - Add example: "Had 1 avocado and 2 eggs for breakfast" → `meal_log`, confidence 0.95, meal_timing: "BREAKFAST"
   - These examples teach the LLM to recognize the portions + common food items pattern

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Fault Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate meal inputs with portions and common food items, then assert that the classifier returns `meal_log` with confidence >= 0.8. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Yogurt and Granola Test**: Input "I had 170g of 0% greek yogurt and 65g of peanut butter granola" (will fail on unfixed code - returns unclear or low confidence)
2. **Protein Shake with Fruits Test**: Input "Had 2 scoops protein powder, 1 banana, and 1 cup berries" (will fail on unfixed code - banana and berries not recognized)
3. **Avocado and Eggs Test**: Input "Had 1 avocado and 2 eggs for breakfast" (may fail on unfixed code - avocado not in keywords)
4. **Chicken with Vegetables Test**: Input "Ate 6oz chicken breast with 1 cup broccoli and spinach" (may partially work but confidence may be lower than expected)

**Expected Counterexamples**:
- Classifier returns `unclear` or confidence < 0.5 for obvious meal inputs
- Possible causes: missing food items in NUTRITION_KEYWORDS, portions not leveraged for confidence boosting, past-tense verbs not recognized

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed classifier produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := classifyInput_fixed(input, 'text')
  ASSERT result.input_type = 'meal_log'
  ASSERT result.confidence >= 0.8
  ASSERT result.domains = ['nutritionist']
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed classifier produces the same result as the original classifier.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT classifyInput_original(input, mode) = classifyInput_fixed(input, mode)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for workout logs, questions, mixed inputs, and unclear inputs, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Workout Log Preservation**: Observe that "5 rounds: 10 DL 225#, 15 BJ — 14:07" returns `workout_log` with confidence >= 0.9 on unfixed code, then write test to verify this continues after fix
2. **Question Preservation**: Observe that "What's my best Fran time?" returns `question` with domains `["trainer"]` on unfixed code, then write test to verify this continues after fix
3. **Cross-Domain Question Preservation**: Observe that "How does my protein intake affect my recovery?" returns `question` with domains `["socius"]` on unfixed code, then write test to verify this continues after fix
4. **Mixed Input Preservation**: Observe that "Had a protein shake after my deadlift session" returns `mixed` with domains `["nutritionist", "trainer"]` on unfixed code, then write test to verify this continues after fix
5. **Unclear Input Preservation**: Observe that "hey" returns `unclear` with confidence < 0.5 on unfixed code, then write test to verify this continues after fix
6. **Meal Without Portions Preservation**: Observe that "Had a protein shake and banana" returns `meal_log` with confidence >= 0.8 on unfixed code, then write test to verify this continues after fix

### Unit Tests

- Test expanded NUTRITION_KEYWORDS array includes all common food items
- Test MEAL_VERBS array detection for past-tense food verbs
- Test confidence boosting logic for portions + nutrition keywords
- Test confidence boosting logic for portions + meal verbs
- Test confidence boosting logic for portions + nutrition keywords + meal verbs
- Test edge cases (portions without food items, food items without portions)

### Property-Based Tests

- Generate random meal inputs with portions and common food items, verify classifier returns `meal_log` with confidence >= 0.8
- Generate random workout inputs, verify classifier continues to return `workout_log` with high confidence
- Generate random question inputs, verify classifier continues to return `question` with appropriate domains
- Generate random mixed inputs, verify classifier continues to return `mixed` with appropriate domains
- Test across many input variations to ensure preservation of existing behavior

### Integration Tests

- Test full agent routing flow with meal inputs containing portions and common food items
- Test that nutritionist agent receives correctly classified meal inputs
- Test that clarification flow is NOT triggered for obvious meal inputs
- Test that existing workout logging flow continues to work correctly
- Test that existing question answering flow continues to work correctly
