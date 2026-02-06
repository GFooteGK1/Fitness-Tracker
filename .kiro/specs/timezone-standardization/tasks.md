# Implementation Plan: Timezone Standardization

## Overview

This implementation plan follows a phased approach to introduce timezone standardization across the SociusFit application. The strategy is designed to be backward compatible during migration, allowing for safe rollout and easy rollback if issues arise.

The implementation starts with creating centralized timezone utilities, then updates API endpoints to accept timezone offsets, updates UI components to use the utilities, and finally removes deprecated code. Each phase builds on the previous one and includes comprehensive testing.

## Tasks

- [x] 1. Create timezone utilities module and types
  - Create `app/lib/timezone-utils.ts` with all utility functions
  - Create `app/lib/types/timezone.types.ts` with timezone-related types
  - Add JSDoc comments documenting each function
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 13.3_

- [ ]* 2. Write property tests for timezone utilities
  - [ ]* 2.1 Write property test for local date extraction
    - **Property 1: Local date extraction**
    - **Validates: Requirements 1.1**
  
  - [ ]* 2.2 Write property test for UTC start-of-day conversion
    - **Property 2: UTC start-of-day conversion**
    - **Validates: Requirements 1.2**
  
  - [ ]* 2.3 Write property test for UTC end-of-day conversion
    - **Property 3: UTC end-of-day conversion**
    - **Validates: Requirements 1.3**
  
  - [ ]* 2.4 Write property test for timezone offset validity
    - **Property 4: Timezone offset validity**
    - **Validates: Requirements 1.4**
  
  - [ ]* 2.5 Write property test for week start calculation
    - **Property 5: Week start is always Monday**
    - **Validates: Requirements 1.5, 3.3, 6.2**
  
  - [ ]* 2.6 Write property test for days elapsed bounds
    - **Property 6: Days elapsed bounds**
    - **Validates: Requirements 1.6, 3.5**
  
  - [ ]* 2.7 Write property test for days elapsed calculation
    - **Property 7: Days elapsed calculation correctness**
    - **Validates: Requirements 1.6, 3.1**
  
  - [ ]* 2.8 Write property test for timestamp to date string formatting
    - **Property 8: Timestamp to date string formatting**
    - **Validates: Requirements 1.7**
  
  - [ ]* 2.9 Write property test for timestamp to datetime formatting
    - **Property 9: Timestamp to datetime formatting**
    - **Validates: Requirements 1.8**

- [ ]* 3. Write unit tests for timezone utilities edge cases
  - Test midnight boundary (23:59:59 vs 00:00:00)
  - Test week boundary (Sunday to Monday transition)
  - Test month boundary (last day to first day)
  - Test year boundary (Dec 31 to Jan 1)
  - Test date comparison functions (isSameDay, isToday, isFuture)
  - _Requirements: 11.3, 11.7_

- [x] 4. Update meals API endpoints for timezone support
  - [x] 4.1 Update `/api/meals/daily` to accept tzOffset parameter
    - Add tzOffset query parameter parsing
    - Add timezone offset validation
    - Use localDateToUTCStart/End for query boundaries
    - Maintain backward compatibility (default to 0 if not provided)
    - Add deprecation warning when tzOffset not provided
    - _Requirements: 2.2, 2.5, 2.7, 8.1, 8.2, 8.7_
  
  - [x] 4.2 Update `/api/meals/upload` to handle timezone-aware timestamps
    - Accept timestamp with timezone information
    - Store in UTC in database
    - _Requirements: 2.1, 2.8_
  
  - [x] 4.3 Update `/api/meals/parse-text` to handle timezone-aware timestamps
    - Accept timestamp parameter with timezone
    - Store in UTC in database
    - _Requirements: 2.1, 2.8_

- [ ]* 5. Write integration tests for meals API timezone handling
  - Test meal logging and retrieval with various timezones
  - Test that meal logged on date D is returned when querying date D
  - Test UTC boundary calculations are correct
  - _Requirements: 2.8, 11.1, 11.2_

- [x] 6. Update adherence API endpoints for timezone support
  - [x] 6.1 Update `/api/adherence/weekly` to accept tzOffset parameter
    - Add tzOffset query parameter parsing
    - Use timezone utilities for week start calculation
    - Use timezone utilities for days elapsed calculation
    - Calculate UTC boundaries for weekly date range
    - Update daily summaries query to use UTC boundaries
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 8.1, 8.2_
  
  - [x] 6.2 Update adherence calculator to use timezone utilities
    - Import timezone utilities
    - Replace manual date calculations with utility functions
    - Update calculateDaysElapsed to use timezone-aware logic
    - Update week start calculations
    - _Requirements: 3.1, 3.3, 3.5_

- [ ]* 7. Write property tests for adherence calculations
  - [ ]* 7.1 Write property test for prorated target calculation
    - **Property 14: Prorated target calculation**
    - **Validates: Requirements 3.2**
  
  - [ ]* 7.2 Write property test for weekly date range coverage
    - **Property 15: Weekly date range coverage**
    - **Validates: Requirements 3.4**
  
  - [ ]* 7.3 Write unit test for days elapsed at day boundaries
    - Test Monday at 11:59 PM returns 1
    - Test Tuesday at 12:01 AM returns 2
    - _Requirements: 3.6, 3.7, 11.7_

- [ ] 8. Update workout API endpoints for timezone support
  - [ ] 8.1 Update `/api/parse-workout` to preserve local workout date
    - Accept workout_date as YYYY-MM-DD string
    - Store as DATE type in database (no timezone conversion)
    - _Requirements: 4.1, 4.5_
  
  - [ ] 8.2 Update workout query endpoints to use date string comparison
    - Use DATE comparison for workout_date queries
    - No timezone conversion needed (already DATE type)
    - _Requirements: 4.2_

- [ ]* 9. Write property tests for workout date handling
  - [ ]* 9.1 Write property test for workout date preservation
    - **Property 10: Meal date preservation (round-trip)** (applies to workouts too)
    - **Validates: Requirements 4.5**
  
  - [ ]* 9.2 Write property test for date string comparison
    - **Property 16: Date string comparison**
    - **Validates: Requirements 4.2**

- [ ] 10. Update WHOOP integration for timezone support
  - [ ] 10.1 Update `/api/whoop/sync` to convert WHOOP dates to local timezone
    - Parse WHOOP API dates
    - Convert to user's local timezone
    - Store as DATE type in database
    - _Requirements: 5.1, 5.5_
  
  - [ ] 10.2 Update WHOOP query endpoints to use date string comparison
    - Use DATE comparison for WHOOP date queries
    - _Requirements: 5.2_
  
  - [ ] 10.3 Update cross-domain correlation logic
    - Match workouts and WHOOP data by local calendar date
    - Use isSameDay() for date comparison
    - _Requirements: 5.4_

- [ ]* 11. Write property tests for WHOOP date handling
  - [ ]* 11.1 Write property test for WHOOP date conversion
    - **Property 17: WHOOP date conversion**
    - **Validates: Requirements 5.5**
  
  - [ ]* 11.2 Write property test for cross-domain date matching
    - **Property 18: Cross-domain date matching**
    - **Validates: Requirements 5.4**

- [ ] 12. Update dashboard and analytics endpoints
  - [ ] 12.1 Update `/api/dashboard-stats` to accept tzOffset parameter
    - Add tzOffset parameter
    - Use timezone utilities for "today" determination
    - Use timezone utilities for date range calculations
    - _Requirements: 6.1, 6.3, 6.4, 6.5_
  
  - [ ] 12.2 Update `/api/fitness-insights` to accept tzOffset parameter
    - Add tzOffset parameter
    - Use timezone utilities for date range calculations
    - Ensure consistent timezone handling across all queries
    - _Requirements: 6.3, 6.4, 6.5_

- [ ]* 13. Write property tests for dashboard timezone handling
  - [ ]* 13.1 Write property test for "today" determination
    - **Property 19: Today determination**
    - **Validates: Requirements 6.1, 7.1**
  
  - [ ]* 13.2 Write property test for date range query consistency
    - **Property 20: Date range query consistency**
    - **Validates: Requirements 7.3, 7.4**

- [ ] 14. Update query system for timezone support
  - [ ] 14.1 Update `/api/query` to accept tzOffset parameter
    - Add tzOffset parameter
    - Pass tzOffset to domain-specific data fetchers
    - Use timezone utilities for date interpretation
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [ ] 14.2 Update domain fetchers to use timezone-aware queries
    - Update `fetchWorkoutContext` to use timezone utilities
    - Update `fetchNutritionContext` to use timezone utilities
    - Update `fetchWhoopContext` to use timezone utilities
    - _Requirements: 7.4, 7.5_

- [ ] 15. Checkpoint - Ensure all API tests pass
  - Run all API endpoint tests
  - Verify backward compatibility
  - Verify timezone offset validation works
  - Ask user if questions arise

- [x] 16. Update UI components to use timezone utilities
  - [x] 16.1 Update `DailyProgressView` component
    - Import timezone utilities
    - Use getLocalDate() for date state
    - Pass getTimezoneOffset() to API calls
    - _Requirements: 9.1, 9.2_
  
  - [x] 16.2 Update `WeeklyProgressView` component
    - Import timezone utilities
    - Use getWeekStartString() for week state
    - Pass getTimezoneOffset() to API calls
    - _Requirements: 9.1, 9.2_
  
  - [x] 16.3 Update `DailyBreakdown` component
    - Import timezone utilities
    - Use isToday() for highlighting today's card
    - Use isFuture() for future indicators
    - _Requirements: 9.6, 9.7_
  
  - [x] 16.4 Update `DayCard` component
    - Import timezone utilities
    - Use date formatting functions for display
    - _Requirements: 9.3, 9.4_
  
  - [x] 16.5 Update `WeekToDateSection` component
    - Import timezone utilities
    - Use date formatting functions for display
    - _Requirements: 9.3_
  
  - [x] 16.6 Update `MealCameraCapture` component
    - Use getLocalDate() for default date
    - Pass timezone-aware timestamp to API
    - _Requirements: 9.1_
  
  - [x] 16.7 Update `MealInputEnhanced` component
    - Use getLocalDate() for default date
    - Pass timezone-aware timestamp to API
    - _Requirements: 9.1_

- [ ]* 17. Write property tests for UI timezone handling
  - [ ]* 17.1 Write property test for UI date selection format
    - **Property 24: UI date selection format**
    - **Validates: Requirements 9.2**
  
  - [ ]* 17.2 Write property test for relative date calculation
    - **Property 25: Relative date calculation**
    - **Validates: Requirements 9.4, 9.6, 9.7**

- [ ] 18. Update page components to use timezone utilities
  - [x] 18.1 Update `app/food-progress/page.tsx`
    - Import timezone utilities
    - Use getLocalDate() for date state
    - Use getWeekStart() for week calculations
    - Pass tzOffset to API calls
    - _Requirements: 9.1, 9.2_
  
  - [x] 18.2 Update `app/food-log/page.tsx`
    - Import timezone utilities
    - Use getLocalDate() for date state
    - Pass tzOffset to API calls
    - _Requirements: 9.1, 9.2_
  
  - [ ] 18.3 Update `app/log/page.tsx`
    - Import timezone utilities
    - Use getLocalDate() for date state
    - Pass tzOffset to API calls
    - _Requirements: 9.1, 9.2_
  
  - [ ] 18.4 Update `app/program/page.tsx`
    - Import timezone utilities
    - Use getLocalDate() for date state
    - Use date formatting functions
    - _Requirements: 9.1, 9.3_
  
  - [ ] 18.5 Update `app/query/page.tsx`
    - Import timezone utilities
    - Pass tzOffset to query API
    - _Requirements: 9.2_

- [ ] 19. Checkpoint - Ensure all UI tests pass
  - Run all component tests
  - Verify date pickers show correct local dates
  - Verify "today" highlighting works correctly
  - Verify future indicators work correctly
  - Ask user if questions arise

- [ ]* 20. Write integration tests for end-to-end timezone handling
  - Test meal logging and retrieval across timezones
  - Test week-to-date calculations with various timezones
  - Test dashboard aggregations with timezone-aware data
  - Test cross-domain correlations with timezone-aware dates
  - _Requirements: 11.1, 11.2, 11.4, 11.5_

- [ ]* 21. Write property tests for API response formats
  - [ ]* 21.1 Write property test for API date string preservation
    - **Property 21: API date string preservation**
    - **Validates: Requirements 8.1**
  
  - [ ]* 21.2 Write property test for API response format
    - **Property 22: API response format**
    - **Validates: Requirements 8.3, 8.4**
  
  - [ ]* 21.3 Write property test for timezone offset validation
    - **Property 23: Timezone offset validation**
    - **Validates: Requirements 8.7**

- [ ]* 22. Write property tests for data operations
  - [ ]* 22.1 Write property test for UTC boundary calculation
    - **Property 11: UTC boundary calculation correctness**
    - **Validates: Requirements 2.7, 8.2**
  
  - [ ]* 22.2 Write property test for date grouping consistency
    - **Property 12: Date grouping consistency**
    - **Validates: Requirements 2.3, 4.4, 6.4**
  
  - [ ]* 22.3 Write property test for date display formatting
    - **Property 13: Date display formatting consistency**
    - **Validates: Requirements 2.4, 4.3, 5.3, 6.3, 9.3**

- [ ] 23. Update documentation
  - [ ] 23.1 Update AGENTS.md with timezone handling section
    - Add timezone utilities documentation
    - Add API timezone pattern
    - Add common pitfalls section
    - _Requirements: 13.1, 13.2, 13.5_
  
  - [ ] 23.2 Update api-development.md with timezone guidelines
    - Add timezone handling requirements for APIs
    - Add example API endpoint with timezone support
    - _Requirements: 13.4_
  
  - [ ] 23.3 Update component-patterns.md with timezone guidelines
    - Add timezone handling requirements for components
    - Add example component with timezone support
    - _Requirements: 13.4_
  
  - [ ] 23.4 Create migration guide document
    - Document migration phases
    - Document rollback procedures
    - Document testing procedures
    - _Requirements: 12.5, 13.2_

- [ ] 24. Audit existing code for timezone issues
  - Search for `toISOString().split('T')[0]` usage
  - Search for `new Date().toLocaleDateString()` usage
  - Search for manual date arithmetic
  - Search for hardcoded timezone assumptions
  - Create list of files to update
  - _Requirements: 12.1_

- [ ] 25. Remove deprecated code and enforce timezone offset
  - [ ] 25.1 Make tzOffset parameter required in all API endpoints
    - Remove default value fallback
    - Return 400 error if tzOffset not provided
    - Update API documentation
    - _Requirements: 8.2_
  
  - [ ] 25.2 Remove old date handling code
    - Remove manual date calculations
    - Remove timezone-unaware date operations
    - _Requirements: 12.2_
  
  - [ ] 25.3 Update all remaining code to use timezone utilities
    - Replace all manual date operations
    - Ensure consistent timezone handling
    - _Requirements: 12.2, 12.3_

- [ ] 26. Final verification and testing
  - [ ] 26.1 Run full test suite
    - Run all unit tests
    - Run all property tests
    - Run all integration tests
    - Verify all tests pass
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_
  
  - [ ] 26.2 Manual testing in different timezones
    - Test in CST (UTC-6)
    - Test in EST (UTC-5)
    - Test in PST (UTC-8)
    - Test in UTC (UTC+0)
    - Test in CET (UTC+1)
    - _Requirements: 12.4_
  
  - [ ] 26.3 Test at day boundaries
    - Test at 23:59:59 local time
    - Test at 00:00:00 local time
    - Test at 00:00:01 local time
    - _Requirements: 11.7_
  
  - [ ] 26.4 Test at week boundaries
    - Test on Sunday at 23:59:59
    - Test on Monday at 00:00:00
    - _Requirements: 11.7_
  
  - [ ] 26.5 Verify historical data displays correctly
    - Check existing meals display on correct dates
    - Check existing workouts display on correct dates
    - Check existing WHOOP data displays on correct dates
    - _Requirements: 12.4_

- [ ] 27. Final checkpoint - Production readiness
  - All tests passing
  - Documentation complete
  - Manual testing complete
  - Historical data verified
  - Ask user for final approval before deployment

## Notes

- Tasks marked with `*` are optional test-related sub-tasks that can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end flows
- The implementation is designed to be backward compatible during migration
- Rollback is possible at any phase by reverting code changes
- No database migration is required
