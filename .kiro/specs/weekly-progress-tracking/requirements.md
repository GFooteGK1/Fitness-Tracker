# Requirements Document

## Introduction

This feature improves the Weekly Adherence View in SociusFit's nutrition tracking section. The current "Daily Breakdown" grid displays too much information in a cramped 7-column layout, making it difficult to quickly assess weekly progress on mobile. This enhancement introduces:
1. A prominent Week-to-Date section showing cumulative progress against prorated targets based on days elapsed
2. A horizontally-scrollable daily breakdown for cleaner individual day viewing
3. Stricter tracking where missing days count against weekly progress (days elapsed approach)

The goal is to help users quickly understand their cumulative trajectory toward weekly goals and enable "cheat day recovery" insights.

## Glossary

- **Weekly_Adherence_View**: The main React component displaying weekly nutrition adherence data
- **Week_To_Date_Section**: A prominent section showing cumulative actual vs prorated target for days elapsed
- **Daily_Breakdown**: A horizontally-scrollable section showing individual day cards
- **Day_Card**: An individual day's display showing date, score badge, and macro values
- **Prorated_Target**: Daily target multiplied by days elapsed (e.g., 3 days elapsed = daily × 3)
- **Days_Elapsed**: Calendar days from week start (Monday) up to and including today
- **Cumulative_Actual**: Sum of actual macro intake across all logged days in the week
- **Macro**: A macronutrient category (Protein, Carbs, Fat, or Calories)
- **Adherence_Score**: A percentage indicating how close actual intake is to target (100% = within tolerance)
- **Adherence_Calculator**: The service that computes adherence scores and cumulative totals

## Requirements

### Requirement 1: Week-to-Date Progress Section

**User Story:** As a user, I want to see my cumulative progress toward weekly goals based on days elapsed, so that I can understand if I'm on track and can recover from off days.

#### Acceptance Criteria

1. THE Week_To_Date_Section SHALL be displayed prominently at the top of the Weekly_Adherence_View, immediately visible without scrolling
2. THE Adherence_Calculator SHALL compute weekly targets as daily targets multiplied by 7
3. WHEN calculating prorated targets, THE Adherence_Calculator SHALL compute targets as daily target multiplied by days elapsed (calendar days from Monday to today)
4. WHEN displaying week-to-date progress, THE Week_To_Date_Section SHALL show cumulative actual intake versus prorated target for each macro (P/C/F/Cal)
5. THE Week_To_Date_Section SHALL display a visual progress bar for each macro showing actual vs prorated target
6. THE Week_To_Date_Section SHALL show the difference between actual and prorated target in absolute values (e.g., "+15g" or "-200")
7. WHEN cumulative actual is within tolerance of prorated target, THE Week_To_Date_Section SHALL display a positive "on track" indicator
8. WHEN cumulative actual exceeds prorated target beyond tolerance, THE Week_To_Date_Section SHALL indicate over-target status with appropriate color coding
9. WHEN cumulative actual is below prorated target beyond tolerance, THE Week_To_Date_Section SHALL indicate under-target status with appropriate color coding

### Requirement 2: Improved Daily Breakdown Layout

**User Story:** As a user, I want a cleaner daily breakdown display with horizontal scrolling, so that I can quickly scan individual days without information overload.

#### Acceptance Criteria

1. WHEN displaying the daily breakdown on mobile, THE Daily_Breakdown SHALL use a horizontally-scrollable layout allowing users to swipe through day cards
2. WHEN displaying a Day_Card with logged data, THE Day_Card SHALL show the day name, date number, and color-coded adherence score badge prominently
3. WHEN displaying macro details in a Day_Card, THE Day_Card SHALL show P/C/F/Cal values in a compact but readable format
4. WHEN a user taps a Day_Card, THE Day_Card SHALL provide a 44px minimum touch target for the entire card
5. WHEN a day has no logged data, THE Day_Card SHALL display a muted "No data" indicator without macro values
6. WHEN displaying a future day, THE Day_Card SHALL display a muted "Future" indicator
7. WHEN displaying today's Day_Card, THE Day_Card SHALL have a visual highlight distinguishing it from other days

### Requirement 3: Visual Hierarchy and Color Coding

**User Story:** As a user, I want clear visual indicators for good and bad performance, so that I can quickly assess my week at a glance.

#### Acceptance Criteria

1. THE Weekly_Adherence_View SHALL maintain the existing color-coding system (green ≥95%, yellow 85-94%, orange 70-84%, red <70%)
2. WHEN displaying the Week_To_Date_Section, THE Weekly_Adherence_View SHALL use the same color coding to indicate overall weekly trajectory
3. WHEN a macro is significantly under prorated target (>10% deficit), THE Week_To_Date_Section SHALL highlight it for attention
4. WHEN a macro is significantly over prorated target (>10% surplus), THE Week_To_Date_Section SHALL highlight it with a different indicator
5. THE Week_To_Date_Section SHALL show a summary status text (e.g., "On Track", "Behind", "Ahead") for overall weekly progress

### Requirement 4: Mobile-First Responsive Design

**User Story:** As a user checking my nutrition at the gym or kitchen, I want the view optimized for quick mobile glances.

#### Acceptance Criteria

1. THE Weekly_Adherence_View SHALL use touch targets of minimum 44px × 44px for all interactive elements
2. THE Weekly_Adherence_View SHALL use minimum 16px font size for primary readable text
3. THE Daily_Breakdown SHALL support smooth horizontal swipe gestures on touch devices
4. WHEN scrolling the Daily_Breakdown horizontally, THE Week_To_Date_Section SHALL remain visible above
5. THE Weekly_Adherence_View SHALL ensure all progress indicators are readable without zooming on mobile devices

### Requirement 5: Data Calculation Logic

**User Story:** As a user, I want accurate progressive calculations using days elapsed, so that missing days count against my weekly progress.

#### Acceptance Criteria

1. WHEN calculating days elapsed, THE Adherence_Calculator SHALL count calendar days from week start (Monday) up to and including today
2. WHEN calculating cumulative actuals, THE Adherence_Calculator SHALL sum macro values from all days that have logged meal data
3. IF a day has no logged data, THEN THE Adherence_Calculator SHALL treat that day as 0 intake for cumulative calculations (stricter approach)
4. WHEN the week has no logged days, THE Week_To_Date_Section SHALL display a message indicating no data available with 0/prorated target
5. THE Week_To_Date_Section SHALL update calculations when new meal data is logged without requiring page refresh

### Requirement 6: API Enhancement for Cumulative Data

**User Story:** As a developer, I want the API to return cumulative week-to-date data, so that the frontend can display prorated progress.

#### Acceptance Criteria

1. WHEN the weekly adherence API is called, THE API SHALL return cumulative totals for all macros across logged days
2. WHEN the weekly adherence API is called, THE API SHALL return the count of days elapsed (calendar days from Monday to today)
3. WHEN the weekly adherence API is called, THE API SHALL return prorated targets based on days elapsed
4. THE API SHALL compute cumulative adherence percentages comparing actuals to prorated targets
5. THE API SHALL return deviation amounts (actual - prorated target) for each macro
