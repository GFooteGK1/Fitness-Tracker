# Implementation Plan

## Overview

This task list implements the fix for the classifier meal detection bug using the exploratory bugfix workflow. The bug manifests when users provide meal descriptions with portions and common food items (e.g., "I had 170g of 0% greek yogurt and 65g of peanut butter granola") — the classifier incorrectly returns `unclear` or confidence < 0.5 instead of confidently classifying as `meal_log`.

The fix involves three targeted improvements:
1. Expand NUTRITION_KEYWORDS with comprehensive list of common food items
2. Improve keyword fallback logic to leverage portions + past-tense food verbs
3. Enhance LLM classifier prompt with meal examples containing portions

## Task List

- [x] 1. Write bug condition exploration test
  - **Property 1: Fault Condition** - Meal Inputs with Portions Classified Correctly
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Test concrete failing cases (yogurt+granola, protein+fruits, avocado+eggs, chicken+vegetables) to ensure reproducibility
  - Test implementation details from Fault Condition in design:
    - Input: "I had 170g of 0% greek yogurt and 65g of peanut butter granola"
    - Input: "Had 2 scoops protein powder, 1 banana, and 1 cup berries"
    - Input: "Had 1 avocado and 2 eggs for breakfast"
    - Input: "Ate 6oz chicken breast with 1 cup broccoli and spinach"
  - The test assertions should match the Expected Behavior Properties from design:
    - Assert result.input_type === 'meal_log'
    - Assert result.confidence >= 0.8
    - Assert result.domains includes 'nutritionist'
    - Assert result.context.has_portions === true
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause:
    - Which inputs return `unclear`?
    - Which inputs have confidence < 0.5?
    - Does the LLM classifier fail or the keyword fallback?
    - Which food items are not recognized?
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Meal Input Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Workout log: "5 rounds: 10 DL 225#, 15 BJ — 14:07" → observe classification
    - Question: "What's my best Fran time?" → observe classification
    - Cross-domain question: "How does my protein intake affect my recovery?" → observe classification
    - Mixed input: "Had a protein shake after my deadlift session" → observe classification
    - Unclear input: "hey" → observe classification
    - Meal without portions: "Had a protein shake and banana" → observe classification
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements:
    - Test workout logs continue to return `workout_log` with confidence >= 0.9
    - Test questions continue to return `question` with appropriate domains
    - Test cross-domain questions continue to return `question` with domains `["socius"]`
    - Test mixed inputs continue to return `mixed` with domains `["nutritionist", "trainer"]`
    - Test unclear inputs continue to return `unclear` with confidence < 0.5
    - Test meal logs without portions continue to return `meal_log` with confidence >= 0.8
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix for classifier meal detection bug

  - [x] 3.1 Expand NUTRITION_KEYWORDS array in classifier.ts
    - Add dairy products: "yogurt", "milk", "cheese", "cottage cheese", "greek yogurt"
    - Add grains/cereals: "granola", "cereal", "quinoa", "pasta", "bread", "bagel", "tortilla"
    - Add fruits: "banana", "apple", "berries", "strawberries", "blueberries", "avocado", "orange", "grapes", "mango"
    - Add vegetables: "broccoli", "spinach", "kale", "carrots", "peppers", "tomato", "cucumber", "lettuce"
    - Add proteins: "turkey", "pork", "tuna", "shrimp", "tofu", "beef", "fish"
    - Add fats: "peanut butter", "almond butter", "nuts", "almonds", "walnuts", "olive oil", "butter", "oil"
    - Add common meal descriptors: "smoothie", "salad", "sandwich", "wrap", "bowl"
    - _Bug_Condition: isBugCondition(input) where containsPortions(input) AND containsCommonFoodItems(input) AND (classifyInput(input).confidence < 0.8 OR classifyInput(input).input_type != 'meal_log')_
    - _Expected_Behavior: For inputs with portions and common food items, classifier SHALL return meal_log with confidence >= 0.8_
    - _Preservation: Existing classification behavior for workouts, questions, mixed inputs, unclear inputs, and meals without portions SHALL remain unchanged_
    - _Requirements: 1.3, 2.3_

  - [x] 3.2 Add MEAL_VERBS constant and detection logic in classifier.ts
    - Create MEAL_VERBS array: ["had", "ate", "consumed", "drank", "finished", "eating", "drinking"]
    - Add helper function to detect meal verbs in input text
    - _Bug_Condition: isBugCondition(input) where input contains past-tense food verbs but keyword fallback doesn't leverage them_
    - _Expected_Behavior: Keyword fallback SHALL detect meal verbs and use them as meal indicators_
    - _Preservation: Existing keyword fallback logic for workouts and questions SHALL remain unchanged_
    - _Requirements: 1.4, 2.4_

  - [x] 3.3 Implement confidence boosting logic in classifyWithKeywords function
    - If portions detected AND (nutrition keywords OR meal verbs) → boost confidence to 0.7
    - If portions detected AND nutrition keywords AND meal verbs → boost confidence to 0.8
    - Ensure logic only applies when classifying as meal_log (not workout_log or question)
    - Preserve existing confidence levels for non-meal classifications
    - _Bug_Condition: isBugCondition(input) where portions are detected but not leveraged for confidence boosting_
    - _Expected_Behavior: Keyword fallback SHALL boost confidence to >= 0.7 when portions + meal indicators are present_
    - _Preservation: Existing confidence levels for workouts, questions, and unclear inputs SHALL remain unchanged_
    - _Requirements: 1.4, 2.4_

  - [x] 3.4 Enhance CLASSIFIER_SYSTEM_PROMPT with meal examples containing portions
    - Add example: "I had 170g of 0% greek yogurt and 65g of peanut butter granola" → {"input_type":"meal_log","domains":["nutritionist"],"confidence":0.9,"context":{"has_portions":true,"has_score":false,"is_benchmark":false}}
    - Add example: "Ate 2 scoops protein powder, 1 banana, and 1 cup berries" → {"input_type":"meal_log","domains":["nutritionist"],"confidence":0.9,"context":{"has_portions":true,"has_score":false,"is_benchmark":false}}
    - Add example: "Had 1 avocado and 2 eggs for breakfast" → {"input_type":"meal_log","domains":["nutritionist"],"confidence":0.95,"context":{"has_portions":true,"has_score":false,"is_benchmark":false,"meal_timing":"BREAKFAST"}}
    - Place examples in the Examples section of the prompt
    - Preserve all existing examples (workout logs, questions, mixed inputs, unclear inputs)
    - _Bug_Condition: isBugCondition(input) where LLM lacks examples of meal inputs with portions_
    - _Expected_Behavior: LLM classifier SHALL learn to confidently identify meal inputs with portions from examples_
    - _Preservation: Existing LLM classification behavior for workouts, questions, mixed inputs, and unclear inputs SHALL remain unchanged_
    - _Requirements: 2.5_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Meal Inputs with Portions Classified Correctly
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - Verify all test cases pass:
      - "I had 170g of 0% greek yogurt and 65g of peanut butter granola" → meal_log, confidence >= 0.8
      - "Had 2 scoops protein powder, 1 banana, and 1 cup berries" → meal_log, confidence >= 0.8
      - "Had 1 avocado and 2 eggs for breakfast" → meal_log, confidence >= 0.8
      - "Ate 6oz chicken breast with 1 cup broccoli and spinach" → meal_log, confidence >= 0.8
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Meal Input Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix:
      - Workout logs still classified as `workout_log` with confidence >= 0.9
      - Questions still classified as `question` with appropriate domains
      - Cross-domain questions still classified as `question` with domains `["socius"]`
      - Mixed inputs still classified as `mixed` with domains `["nutritionist", "trainer"]`
      - Unclear inputs still classified as `unclear` with confidence < 0.5
      - Meal logs without portions still classified as `meal_log` with confidence >= 0.8
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to verify no regressions
  - Verify bug condition exploration test passes (confirms bug is fixed)
  - Verify preservation tests pass (confirms no regressions)
  - Test manually with real meal inputs containing portions and common food items
  - Ask the user if questions arise or if additional testing is needed

## Notes

- This bugfix follows the exploratory workflow: Explore → Preserve → Implement → Validate
- Task 1 (exploration test) MUST FAIL on unfixed code - this confirms the bug exists
- Task 2 (preservation tests) MUST PASS on unfixed code - this establishes baseline behavior
- Tasks 3.5 and 3.6 re-run the same tests from tasks 1 and 2 to verify the fix works and preserves existing behavior
- The fix is targeted and minimal - only affects meal classification with portions and common food items
- All other classification behavior (workouts, questions, mixed, unclear) remains unchanged
