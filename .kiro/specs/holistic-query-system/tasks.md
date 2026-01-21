# Implementation Plan: Holistic Query System

## Overview

This plan transforms the existing workout-only query system into a unified, cross-domain fitness intelligence platform. The implementation follows a modular approach, building the intent classifier, domain fetchers, and prompt templates as separate components before integrating them into the refactored query route.

## Tasks

- [x] 1. Set up project structure and types
  - Create `app/api/query/lib/` directory structure
  - Define TypeScript interfaces for QueryIntent, ClassificationResult, WorkoutData, NutritionData, CrossDomainData
  - Export shared types from `types.ts`
  - Update `app/lib/types/index.ts` to export cross-domain types
  - Reference existing types from `cross-domain.ts` where applicable
  - _Requirements: 1.1, 2.1, 2.2, 2.3_

- [x] 2. Implement Intent Classifier
  - [x] 2.1 Create intent classification logic with keyword detection
    - Implement `classifyIntent(question: string): Promise<ClassificationResult>`
    - Define workout keywords array: "workout", "exercise", "lift", "deadlift", "squat", "bench", "PR", "AMRAP", "EMOM", "reps", "sets", "weight", "strength", "metcon", "WOD"
    - Define nutrition keywords array: "protein", "calories", "carbs", "fat", "meal", "food", "ate", "eating", "macros", "diet", "nutrition", "breakfast", "lunch", "dinner"
    - Define cross-domain triggers: "affect", "impact", "correlation", "relationship", "before workout", "after workout", "performance and", "energy", "fuel"
    - Return CROSS_DOMAIN as default for ambiguous questions
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 2.2 Write property tests for intent classifier
    - **Property 1: Intent classification returns valid type**
    - **Property 2: Intent classification respects keyword domains**
    - **Property 3: Ambiguous questions default to CROSS_DOMAIN**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

- [x] 3. Implement Domain Fetchers
  - [x] 3.1 Create workout data fetcher
    - Implement `fetchWorkoutData(supabase, userId, timeWindow): Promise<WorkoutData>`
    - Query workouts table for: workout_date, input_text, primary_score, blocks, rpe, tags
    - Query benchmark_prs table for: benchmark_name, date, score_value, score_display, rx_status
    - Apply time window filter and user_id filter
    - _Requirements: 2.1, 2.4, 2.5, 2.6_

  - [x] 3.2 Create nutrition data fetcher
    - Implement `fetchNutritionData(supabase, userId, timeWindow): Promise<NutritionData>`
    - Query meals table for: meal_timestamp, meal_name, total_protein, total_carbs, total_fat, total_calories, meal_timing
    - Query daily_targets for current targets
    - Query daily_summaries view for aggregated data
    - Apply time window filter and user_id filter
    - _Requirements: 2.2, 2.4, 2.5, 2.7_

  - [x] 3.3 Create cross-domain data fetcher
    - Implement `fetchCrossDomainData(supabase, userId, timeWindow): Promise<CrossDomainData>`
    - Combine workout and nutrition fetchers
    - Ensure meal_timing is included for correlation analysis
    - Reference patterns from existing `/api/fitness-insights/route.ts`
    - _Requirements: 2.3, 5.6_

  - [x] 3.4 Write property tests for domain fetchers
    - **Property 4: Domain fetcher returns correct data scope for intent**
    - **Property 5: Fetched data respects user authentication**
    - **Property 6: Fetched data respects time window**
    - **Property 7: Fetched data contains required fields**
    - **Property 9: Cross-domain data includes meal_timing**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 5.6**

- [x] 4. Implement Prompt Templates
  - [x] 4.1 Create domain-specific prompt templates
    - Define WORKOUT_SYSTEM_PROMPT with workout analysis instructions
    - Define NUTRITION_SYSTEM_PROMPT with nutrition analysis instructions
    - Define CROSS_DOMAIN_SYSTEM_PROMPT with correlation analysis instructions
    - Implement `getPromptForIntent(intent: QueryIntent): string`
    - _Requirements: 3.1, 4.1_

  - [x] 4.2 Write property tests for prompt selection
    - **Property 8: Prompt selection matches intent type**
    - **Validates: Requirements 3.1, 4.1**

- [x] 5. Implement Response Generator
  - [x] 5.1 Create response generation orchestrator
    - Implement `generateResponse(params: GenerateResponseParams): Promise<string>`
    - Select appropriate prompt based on intent
    - Format data context for Claude
    - Call Anthropic API with assembled prompt and context
    - Handle API errors gracefully
    - _Requirements: 3.1, 4.1, 6.1, 6.2, 7.3_

  - [x] 5.2 Write unit tests for response generator
    - Test prompt selection for each intent type
    - Test error handling for API failures
    - Test data formatting
    - _Requirements: 3.1, 4.1, 7.3_

- [x] 6. Checkpoint - Verify component tests pass
  - Ensure all property tests pass
  - Ensure all unit tests pass
  - Ask the user if questions arise

- [x] 7. Refactor Query API Route
  - [x] 7.1 Integrate components into query route
    - Import intent classifier, domain fetchers, prompt templates, response generator
    - Add authentication check at start of handler
    - Classify intent from user question
    - Fetch data based on classified intent
    - Generate response using appropriate prompt
    - Return response with optional metadata
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 7.4_

  - [x] 7.2 Add error handling and validation
    - Validate question is present and not empty
    - Validate question length (max 2000 chars)
    - Handle authentication errors with 401
    - Handle AI provider errors with appropriate status codes
    - Handle empty data scenarios with helpful messages
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 7.3 Write property test for authentication
    - **Property 10: Unauthenticated requests are rejected**
    - **Validates: Requirements 7.4**

- [x] 8. Integration Testing
  - [x] 8.1 Write integration tests for full query flow
    - Test workout-only query end-to-end
    - Test nutrition-only query end-to-end
    - Test cross-domain query end-to-end
    - Test error scenarios (no auth, no data, API failure)
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 7.1, 7.3, 7.4_

- [x] 9. Update Query Page UI
  - [x] 9.1 Add nutrition and cross-domain quick questions
    - Add quick questions like "How much protein did I eat this week?"
    - Add cross-domain questions like "How does my diet affect my workout performance?"
    - Keep existing workout quick questions
    - _Requirements: 1.2, 1.3, 1.4_

- [x] 10. Final Checkpoint - Ensure all tests pass
  - Run full test suite
  - Verify all property tests pass with 100+ iterations
  - Ensure all unit and integration tests pass
  - Ask the user if questions arise

## Notes

- All tasks including tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The existing `/api/query/route.ts` will be refactored, not replaced, to maintain backward compatibility
