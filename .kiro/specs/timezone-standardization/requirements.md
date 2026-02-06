# Requirements Document: Timezone Standardization

## Introduction

The SociusFit application currently has inconsistent date/time handling across different features, leading to incorrect day boundaries, week-to-date calculations, and data display issues. This feature will establish a consistent timezone handling strategy that uses the user's local device timezone for all date/time operations while storing timestamps in UTC in the database.

The core problem is that some parts of the application use server timezone (UTC), while others use local device time, causing meals, workouts, and WHOOP data to appear on incorrect dates and week-to-date calculations to show wrong values later in the day.

## Glossary

- **Local_Timezone**: The timezone of the user's device (e.g., America/Chicago, Europe/London)
- **UTC**: Coordinated Universal Time, the standard timezone for database storage
- **Day_Boundary**: The transition point between calendar days (midnight in local timezone)
- **Week_Start**: Monday at 00:00:00 in local timezone
- **Timezone_Offset**: The difference in minutes between local time and UTC (e.g., -360 for CST)
- **Date_String**: A date in YYYY-MM-DD format representing a local calendar date
- **Timestamp**: A point in time stored as ISO 8601 string in UTC
- **Prorated_Target**: A weekly target multiplied by days elapsed in the current week
- **Days_Elapsed**: Number of days from week start to current day (inclusive, 1-7)
- **Timezone_Utility**: A centralized module providing timezone conversion functions
- **Client_Component**: A React component that runs in the browser with access to local timezone
- **Server_Component**: A React component or API route that runs on the server in UTC
- **Date_Range_Query**: A database query filtering by date boundaries in local timezone

## Requirements

### Requirement 1: Centralized Timezone Utilities

**User Story:** As a developer, I want centralized timezone utility functions, so that all date/time operations are consistent across the application.

#### Acceptance Criteria

1. THE Timezone_Utility SHALL provide a function to get the current local date as a Date_String
2. THE Timezone_Utility SHALL provide a function to convert a Date_String to UTC start-of-day Timestamp
3. THE Timezone_Utility SHALL provide a function to convert a Date_String to UTC end-of-day Timestamp
4. THE Timezone_Utility SHALL provide a function to get the current Timezone_Offset in minutes
5. THE Timezone_Utility SHALL provide a function to get Week_Start date for a given local date
6. THE Timezone_Utility SHALL provide a function to calculate Days_Elapsed from Week_Start to current date
7. THE Timezone_Utility SHALL provide a function to format Timestamp as local Date_String
8. THE Timezone_Utility SHALL provide a function to format Timestamp as local date-time display string
9. THE Timezone_Utility SHALL handle all date operations using local timezone components (getFullYear, getMonth, getDate)
10. THE Timezone_Utility SHALL never use toISOString().split('T')[0] for local date extraction

### Requirement 2: Food Tracking Timezone Consistency

**User Story:** As a user, I want my meals to appear on the correct calendar day, so that my daily nutrition tracking is accurate.

#### Acceptance Criteria

1. WHEN a user logs a meal, THE System SHALL store the meal_timestamp in UTC
2. WHEN a user views daily meals, THE System SHALL query using Day_Boundary calculated in Local_Timezone
3. WHEN calculating daily totals, THE System SHALL group meals by local calendar date
4. WHEN displaying meal timestamps, THE System SHALL format them in Local_Timezone
5. THE System SHALL accept Timezone_Offset from client for all daily meal queries
6. WHEN a user selects a date in the UI, THE System SHALL use that Date_String for queries without timezone conversion
7. THE System SHALL calculate UTC query boundaries on the server using client-provided Timezone_Offset
8. WHEN a meal is created with a specific date, THE System SHALL preserve that local date regardless of server timezone

### Requirement 3: Week-to-Date Calculation Fixes

**User Story:** As a user, I want week-to-date calculations to show the correct number of days elapsed, so that my prorated targets are accurate throughout the day.

#### Acceptance Criteria

1. WHEN calculating Days_Elapsed, THE System SHALL use Local_Timezone to determine current day
2. WHEN calculating Prorated_Target, THE System SHALL multiply daily target by Days_Elapsed in Local_Timezone
3. WHEN determining Week_Start, THE System SHALL find Monday at 00:00:00 in Local_Timezone
4. WHEN fetching weekly data, THE System SHALL query using Week_Start and week end in Local_Timezone
5. THE System SHALL calculate Days_Elapsed as an integer from 1 to 7 (inclusive)
6. WHEN it is Monday at 11:59 PM local time, THE System SHALL report Days_Elapsed as 1
7. WHEN it is Tuesday at 12:01 AM local time, THE System SHALL report Days_Elapsed as 2
8. THE System SHALL never use server time for Days_Elapsed calculation

### Requirement 4: Workout Tracking Timezone Consistency

**User Story:** As a user, I want my workouts to appear on the correct calendar day, so that my training log is accurate.

#### Acceptance Criteria

1. WHEN a user logs a workout, THE System SHALL store workout_date as a Date_String in local timezone
2. WHEN querying workouts by date range, THE System SHALL use Date_String comparison
3. WHEN displaying workout dates, THE System SHALL show them in Local_Timezone
4. WHEN calculating workout statistics by day, THE System SHALL group by local calendar date
5. THE System SHALL preserve the user's intended workout date regardless of server timezone

### Requirement 5: WHOOP Integration Timezone Consistency

**User Story:** As a user, I want my WHOOP data to appear on the correct calendar day, so that I can correlate recovery with workouts and nutrition.

#### Acceptance Criteria

1. WHEN syncing WHOOP data, THE System SHALL store dates as Date_String in local timezone
2. WHEN querying WHOOP data by date range, THE System SHALL use Date_String comparison
3. WHEN displaying WHOOP metrics, THE System SHALL show dates in Local_Timezone
4. WHEN correlating WHOOP data with workouts, THE System SHALL match by local calendar date
5. THE System SHALL handle WHOOP API dates (which may be in different timezone) by converting to user's Local_Timezone

### Requirement 6: Dashboard and Analytics Timezone Consistency

**User Story:** As a user, I want dashboard statistics to reflect my local calendar days, so that daily and weekly summaries are accurate.

#### Acceptance Criteria

1. WHEN displaying "today's" data, THE System SHALL use current local date
2. WHEN calculating weekly summaries, THE System SHALL use Week_Start in Local_Timezone
3. WHEN showing date ranges, THE System SHALL display dates in Local_Timezone
4. WHEN aggregating data by day, THE System SHALL group by local calendar date
5. THE System SHALL ensure all dashboard queries use consistent timezone handling

### Requirement 7: Query System Timezone Consistency

**User Story:** As a user, I want natural language queries about my data to use correct date boundaries, so that query results match my expectations.

#### Acceptance Criteria

1. WHEN a user asks about "today", THE System SHALL interpret it as current local date
2. WHEN a user asks about "this week", THE System SHALL use Week_Start in Local_Timezone
3. WHEN a user asks about a date range, THE System SHALL use Local_Timezone boundaries
4. WHEN fetching context for queries, THE System SHALL apply timezone-aware date filtering
5. THE System SHALL pass Timezone_Offset to all domain-specific data fetchers

### Requirement 8: API Endpoint Timezone Handling

**User Story:** As a developer, I want API endpoints to handle timezone conversions consistently, so that client-server communication is reliable.

#### Acceptance Criteria

1. WHEN an API endpoint receives a Date_String, THE System SHALL treat it as a local date
2. WHEN an API endpoint receives a Timezone_Offset, THE System SHALL use it for UTC boundary calculations
3. WHEN an API endpoint returns dates, THE System SHALL return Date_String for calendar dates
4. WHEN an API endpoint returns timestamps, THE System SHALL return ISO 8601 UTC strings
5. THE System SHALL document timezone expectations in API endpoint comments
6. WHEN calculating date ranges for queries, THE System SHALL convert local dates to UTC boundaries using Timezone_Offset
7. THE System SHALL validate that Timezone_Offset is within valid range (-720 to 840 minutes)

### Requirement 9: UI Component Timezone Handling

**User Story:** As a user, I want date pickers and date displays to show my local dates, so that the interface matches my calendar.

#### Acceptance Criteria

1. WHEN displaying a date picker, THE System SHALL default to current local date
2. WHEN a user selects a date, THE System SHALL capture it as a Date_String
3. WHEN displaying dates in lists, THE System SHALL format them in Local_Timezone
4. WHEN showing relative dates (e.g., "Today", "Yesterday"), THE System SHALL use Local_Timezone
5. THE System SHALL use toLocaleDateString('en-CA') for YYYY-MM-DD format in date inputs
6. WHEN highlighting "today" in UI, THE System SHALL compare using local Date_String
7. WHEN showing "future" indicators, THE System SHALL compare using local Date_String

### Requirement 10: Database Schema Timezone Considerations

**User Story:** As a developer, I want the database schema to support timezone-aware queries, so that data retrieval is efficient and correct.

#### Acceptance Criteria

1. THE System SHALL store all timestamps as TIMESTAMPTZ (UTC) in the database
2. THE System SHALL store workout_date as DATE type (no timezone)
3. THE System SHALL store WHOOP dates as DATE type (no timezone)
4. WHEN querying by timestamp ranges, THE System SHALL use UTC boundaries calculated from local dates
5. THE System SHALL maintain indexes on date columns for efficient querying
6. THE System SHALL document timezone handling in database migration comments

### Requirement 11: Testing and Validation

**User Story:** As a developer, I want comprehensive tests for timezone handling, so that edge cases are caught before production.

#### Acceptance Criteria

1. THE System SHALL include property-based tests for timezone utility functions
2. THE System SHALL test Day_Boundary calculations across different timezones
3. THE System SHALL test Week_Start calculations for all days of the week
4. THE System SHALL test Days_Elapsed calculations at day boundaries
5. THE System SHALL test date range queries with various Timezone_Offset values
6. THE System SHALL test edge cases like daylight saving time transitions
7. THE System SHALL test midnight boundary conditions (23:59:59 vs 00:00:00)

### Requirement 12: Migration and Backward Compatibility

**User Story:** As a developer, I want existing data to work correctly after timezone standardization, so that users don't lose historical data accuracy.

#### Acceptance Criteria

1. THE System SHALL audit existing code for timezone-related bugs
2. THE System SHALL update all date/time handling to use Timezone_Utility
3. THE System SHALL verify that existing timestamps in database remain valid
4. THE System SHALL test that historical data displays correctly with new timezone handling
5. THE System SHALL document any breaking changes in migration notes
6. WHEN migrating, THE System SHALL preserve the semantic meaning of existing dates

### Requirement 13: Documentation and Developer Guidance

**User Story:** As a developer, I want clear documentation on timezone handling, so that future code maintains consistency.

#### Acceptance Criteria

1. THE System SHALL document timezone handling patterns in AGENTS.md
2. THE System SHALL provide code examples for common timezone operations
3. THE System SHALL document the Timezone_Utility API with JSDoc comments
4. THE System SHALL include timezone considerations in API development guidelines
5. THE System SHALL document common pitfalls and how to avoid them
6. THE System SHALL provide a decision tree for when to use Date vs Date_String vs Timestamp
