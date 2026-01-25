# Implementation Plan: Weekly Progress Tracking

## Overview

This implementation enhances the Weekly Adherence View with a prominent Week-to-Date section and horizontally-scrollable daily breakdown. The approach is:
1. Add new TypeScript types for cumulative data
2. Extend the adherence calculator with new functions
3. Update the API to return cumulative data
4. Create new UI components (WeekToDateSection, DailyBreakdown, DayCard)
5. Integrate into existing WeeklyAdherenceView

## Tasks

- [x] 1. Add TypeScript types and utility functions
  - [x] 1.1 Add CumulativeAdherenceData interface to food-tracking.ts
    - Add interface with all cumulative fields (totals, prorated targets, adherence percentages, deviations, overallStatus)
    - _Requirements: 1.4, 6.1, 6.3, 6.4, 6.5_
  
  - [x] 1.2 Add utility functions to adherence-calculator.ts
    - Implement `calculateDaysElapsed(weekStart, today)` - returns 1-7
    - Implement `formatDeviation(deviation, unit)` - returns "+15g" or "-200"
    - Implement `getAdherenceColor(score)` - returns green/yellow/orange/red
    - Implement `shouldHighlightDeviation(actual, target)` - returns boolean for >10% threshold
    - _Requirements: 5.1, 1.6, 3.1, 3.3, 3.4_
  
  - [x] 1.3 Write property tests for utility functions
    - **Property 4: Score Color Mapping**
    - **Property 5: Deviation Highlighting Threshold**
    - **Property 6: Days Elapsed Calculation**
    - **Validates: Requirements 3.1, 3.3, 3.4, 5.1**

- [x] 2. Implement cumulative adherence calculation
  - [x] 2.1 Add calculateCumulativeAdherence function to adherence-calculator.ts
    - Sum macro totals from daily summaries
    - Calculate prorated targets (daily × daysElapsed)
    - Calculate adherence percentages (actual / prorated × 100)
    - Calculate deviations (actual - prorated)
    - Determine tolerance status for each macro
    - Determine overall status (on-track, ahead, behind)
    - Handle edge cases: zero targets, zero days
    - _Requirements: 1.2, 1.3, 1.7, 1.8, 1.9, 5.2, 5.3, 6.4_
  
  - [x] 2.2 Write property tests for cumulative calculation
    - **Property 1: Prorated Target Calculation**
    - **Property 2: Tolerance Status Determination**
    - **Property 3: Deviation Calculation**
    - **Property 7: Cumulative Totals Summation**
    - **Property 8: Cumulative Adherence Percentage**
    - **Validates: Requirements 1.2, 1.3, 1.6, 1.7, 5.2, 6.4, 6.5**

- [x] 3. Checkpoint - Ensure calculator tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update API to return cumulative data
  - [x] 4.1 Modify /api/adherence/weekly/route.ts
    - Calculate daysElapsed using new function
    - Call calculateCumulativeAdherence with daily summaries, targets, daysElapsed
    - Add daysElapsed and cumulativeData to response
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 4.2 Write integration tests for API
    - **Property 10: API Response Completeness**
    - Test response contains all new fields
    - Test prorated calculation with various days elapsed
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

- [x] 5. Create WeekToDateSection component
  - [x] 5.1 Create app/components/WeekToDateSection.tsx
    - Display "Week to Date (X of 7 days)" header with overall status badge
    - Render progress bar for each macro (P/C/F/Cal)
    - Show actual vs prorated target values
    - Show deviation with +/- formatting
    - Apply color coding based on adherence percentage
    - Highlight macros with >10% deviation
    - Handle empty state (no meals logged)
    - Mobile-first styling with 16px min font
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 3.2, 3.3, 3.4, 3.5, 4.2, 5.4_

- [x] 6. Create DayCard component
  - [x] 6.1 Create app/components/DayCard.tsx
    - Display day name, date number, score badge
    - Show P/C/F/Cal values in compact format
    - Apply color coding to score badge
    - Handle "No data" state for days without meals
    - Handle "Future" state for future days
    - Highlight today's card
    - 44px minimum touch target
    - onClick handler for date selection
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 4.1_
  
  - [x] 6.2 Write component tests for DayCard
    - **Property 9: Day Card Content Completeness**
    - Test all states: with data, no data, future, today
    - **Validates: Requirements 2.2, 2.3, 2.5, 2.6, 2.7**

- [x] 7. Create DailyBreakdown component
  - [x] 7.1 Create app/components/DailyBreakdown.tsx
    - Horizontal scrollable container with overflow-x-auto
    - Render 7 DayCard components
    - Support smooth swipe gestures (scroll-snap)
    - Pass onDateSelect handler to cards
    - _Requirements: 2.1, 4.3_

- [x] 8. Checkpoint - Ensure component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Integrate into WeeklyAdherenceView
  - [x] 9.1 Update app/components/WeeklyAdherenceView.tsx
    - Update WeeklyAdherenceResponse interface to include daysElapsed and cumulativeData
    - Add WeekToDateSection at top (sticky positioning)
    - Replace existing daily grid with DailyBreakdown component
    - Ensure Week-to-Date stays visible when scrolling daily breakdown
    - Maintain existing Weekly Score Summary, Correction Guidance, and Targets Reference sections
    - _Requirements: 1.1, 4.4, 4.5_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Test on mobile device for touch interactions and readability

## Notes

- All tasks including tests are required for comprehensive implementation
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- Mobile testing should be done on actual devices per SociusFit development principles
