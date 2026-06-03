# Implementation Plan: Upgrade to Haiku 4.5

## Overview

This plan implements the upgrade of all Claude AI models in SociusFit from their current versions to Claude Haiku 4.5 (claude-haiku-4-5-20251001). The upgrade involves simple string constant changes across 4 agent files and 6 legacy API routes, with comprehensive testing to ensure zero regression. The primary goals are cost reduction (50%+), performance improvement (30%+ faster), and fixing the meal detection classification bug.

## Tasks

- [ ] 1. Update agent model constants
  - [x] 1.1 Update Classifier model constant to Haiku 4.5
    - Change `CLASSIFIER_MODEL` constant in `app/lib/agents/classifier.ts` from 'claude-haiku-3-20241022' to 'claude-haiku-4-5-20251001'
    - Verify temperature remains 0 and max_tokens remains 256
    - _Requirements: 1.1, 1.3, 1.4_

  - [x] 1.2 Update Trainer Agent model constant to Haiku 4.5
    - Change `TRAINER_MODEL` constant in `app/lib/agents/trainer-agent.ts` from 'claude-sonnet-4-20250514' to 'claude-haiku-4-5-20251001'
    - Verify temperature remains 0 and max_tokens remains 4096
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 1.3 Update Nutritionist Agent model constant to Haiku 4.5
    - Change `NUTRITIONIST_MODEL` constant in `app/lib/agents/nutritionist-agent.ts` from 'claude-sonnet-4-20250514' to 'claude-haiku-4-5-20251001'
    - Verify temperature remains 0 and max_tokens remains 2048
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 1.4 Update Socius Agent model constant to Haiku 4.5
    - Change `SOCIUS_MODEL` constant in `app/lib/agents/socius-agent.ts` from 'claude-sonnet-4-20250514' to 'claude-haiku-4-5-20251001'
    - Verify temperature remains 0.7 and max_tokens remains 2000
    - _Requirements: 4.1, 4.2, 4.3_

- [ ] 2. Update legacy API route model strings
  - [x] 2.1 Update parse-workout route model string to Haiku 4.5
    - Change model string in `app/api/parse-workout/route.ts` anthropic.messages.create() call from 'claude-sonnet-4-20250514' to 'claude-haiku-4-5-20251001'
    - Verify temperature remains 0 (default) and max_tokens remains 4096
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 2.2 Update meals/upload route model string to Haiku 4.5
    - Change model string in `app/api/meals/upload/route.ts` anthropic.messages.create() call from 'claude-sonnet-4-20250514' to 'claude-haiku-4-5-20251001'
    - Verify temperature remains 0 (default) and max_tokens configuration
    - _Requirements: 6.1, 6.4, 6.5_

  - [x] 2.3 Update additional meal routes model strings to Haiku 4.5 (if they exist)
    - Check for and update `app/api/meals/parse-text/route.ts` if it exists
    - Check for and update `app/api/meals/refine/route.ts` if it exists
    - Change model strings from 'claude-sonnet-4-20250514' to 'claude-haiku-4-5-20251001'
    - _Requirements: 6.2, 6.3_

  - [x] 2.4 Update ocr-workout route model string to Haiku 4.5
    - Change model string in `app/api/ocr-workout/route.ts` anthropic.messages.create() call from 'claude-sonnet-4-20250514' to 'claude-haiku-4-5-20251001'
    - Verify temperature remains 0 (default) and max_tokens remains 2000
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 2.5 Update query response generator model string to Haiku 4.5
    - Change model string in `app/api/query/lib/response-generator.ts` anthropic.messages.create() call from 'claude-sonnet-4-20250514' to 'claude-haiku-4-5-20251001'
    - Verify temperature remains 0.7 and max_tokens remains 2000
    - _Requirements: 8.1, 8.2, 8.3_

- [ ] 3. Update documentation
  - [x] 3.1 Update AGENTS.md with Haiku 4.5 references
    - Update Tech Stack section to reference 'claude-haiku-4-5-20251001'
    - Update Models section for Classifier and all Agents
    - _Requirements: 10.2_

  - [x] 3.2 Update steering files with Haiku 4.5 references
    - Update `.kiro/steering/project-overview.md` Tech Stack section
    - Update `.kiro/steering/agent-system.md` Models section
    - Update `.kiro/steering/quick-reference.md` code examples
    - _Requirements: 10.3, 10.4, 10.5_

- [ ] 4. Create comprehensive test suite
  - [x] 4.1 Create model constant verification tests
    - Create `test/upgrade-haiku-4-5/model-constants.test.ts`
    - Test that all 4 agent files use 'claude-haiku-4-5-20251001'
    - Test that all 6 legacy API routes use 'claude-haiku-4-5-20251001'
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 6.2, 6.3, 7.1, 8.1_

  - [x] 4.2 Create configuration preservation tests
    - Create `test/upgrade-haiku-4-5/configuration.test.ts`
    - Test temperature and max_tokens values for all agents and routes
    - Verify Classifier (temp 0, tokens 256), Trainer (temp 0, tokens 4096), Nutritionist (temp 0, tokens 2048), Socius (temp 0.7, tokens 2000)
    - _Requirements: 1.3, 1.4, 2.2, 2.3, 3.2, 3.3, 4.2, 4.3, 5.2, 5.3, 6.4, 6.5, 7.2, 7.3, 8.2, 8.3_

  - [x] 4.3 Create classification preservation property tests
    - Create `test/upgrade-haiku-4-5/classification-preservation.property.test.ts`
    - **Property 3: Classification Preservation**
    - **Validates: Requirements 1.5, 9.1**
    - Use fast-check to generate diverse user inputs (workout, meal, query, mixed)
    - Verify classification results are valid and equivalent or better than previous model
    - Run 100+ iterations

  - [x] 4.4 Create meal detection accuracy property tests
    - Create `test/upgrade-haiku-4-5/meal-detection.property.test.ts`
    - **Property 4: Meal Detection Accuracy**
    - **Validates: Requirements 1.2, 11.3**
    - Use fast-check to generate obvious meal descriptions with food names, portions, timing
    - Verify input_type is 'meal_log' and NOT 'unclear'
    - This tests the bug fix
    - Run 100+ iterations

  - [x] 4.5 Create workout parsing preservation property tests
    - Create `test/upgrade-haiku-4-5/workout-parsing-preservation.property.test.ts`
    - **Property 5: Workout Parsing Preservation**
    - **Validates: Requirements 2.4, 2.5, 5.4, 5.5, 9.2**
    - Use fast-check to generate workout descriptions (AMRAP, FOR_TIME, EMOM, STRENGTH, CARDIO)
    - Verify parsed output conforms to WorkoutParseResult schema
    - Verify movements, scores, and blocks are extracted correctly
    - Run 100+ iterations

  - [x] 4.6 Create meal analysis preservation property tests
    - Create `test/upgrade-haiku-4-5/meal-analysis-preservation.property.test.ts`
    - **Property 6: Meal Analysis Preservation**
    - **Validates: Requirements 3.4, 3.5, 6.6, 9.3**
    - Use fast-check to generate meal descriptions with multiple food items
    - Verify parsed output conforms to MealAnalysisResult schema
    - Verify macros are within validation ranges (protein 0-200g, carbs 0-300g, fat 0-150g, calories 0-2000)
    - Verify calorie consistency within 10%
    - Run 100+ iterations

  - [x] 4.7 Create query response preservation property tests
    - Create `test/upgrade-haiku-4-5/query-preservation.property.test.ts`
    - **Property 7: Cross-Domain Query Preservation**
    - **Validates: Requirements 4.4, 4.5, 8.4, 8.5, 9.4**
    - Use fast-check to generate queries (workout-only, nutrition-only, WHOOP-only, cross-domain)
    - Verify responses are coherent and reference appropriate data domains
    - Verify response quality is equivalent or better
    - Run 100+ iterations

  - [x] 4.8 Create test idempotence property tests
    - Create `test/upgrade-haiku-4-5/idempotence.property.test.ts`
    - **Property 8: Test Idempotence**
    - **Validates: Requirements 9.6, 12.6**
    - Run same deterministic operations (temperature 0) 10 times with identical input
    - Verify outputs are identical across all runs
    - Test classification, workout parsing, and meal analysis
    - Run 20 iterations (each with 10 internal runs)

  - [x] 4.9 Create integration tests
    - Create `test/upgrade-haiku-4-5/integration.test.ts`
    - Test complete workout logging flow (classify → parse → persist)
    - Test complete meal logging flow (classify → analyze → validate → persist)
    - Test complete query flow (classify → generate response)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 4.10 Create performance tests
    - Create `test/upgrade-haiku-4-5/performance.test.ts`
    - Test classification response time < 5s
    - Test workout parsing response time < 10s
    - Test meal analysis response time < 10s
    - _Requirements: 11.2_

- [x] 5. Checkpoint - Run test suite and verify all tests pass
  - Run all upgrade-specific tests: `npm run test test/upgrade-haiku-4-5/`
  - Run all existing tests to ensure no regressions: `npm run test`
  - Verify all tests pass before proceeding to deployment
  - Ask the user if questions arise

- [ ] 6. Deploy and monitor
  - [~] 6.1 Deploy to staging environment
    - Deploy changes to staging
    - Run smoke tests on staging
    - Monitor error rates for 1 hour
    - Monitor response times for 1 hour
    - Test meal detection bug fix with real inputs
    - _Requirements: 11.1, 11.2, 11.3_

  - [~] 6.2 Deploy to production
    - Merge feature branch to main
    - Deploy to production via Vercel
    - Run smoke tests in production
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [~] 6.3 Monitor production metrics
    - Monitor error rates for 24 hours (target < 5%)
    - Monitor response times for 24 hours (target 30%+ improvement)
    - Monitor API costs for 7 days (target 50%+ reduction)
    - Check for meal detection false "unclear" classifications in logs
    - Collect user feedback on classification accuracy
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 7. Final checkpoint - Verify deployment success
  - Confirm all metrics meet success criteria
  - Document deployment results in session notes
  - Update troubleshooting guide if needed
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster deployment
- All code changes are simple string constant replacements
- No changes to temperature, max_tokens, prompts, or parsing logic
- Comprehensive testing ensures zero regression
- Atomic deployment across all 10 files
- Clear rollback plan: revert commit and redeploy if error rate > 10%
- Property tests use fast-check with 100+ iterations for thorough validation
- Integration tests verify end-to-end flows work correctly
- Performance tests verify speed improvements
- Staging validation required before production deployment
