# Design Document: Timezone Standardization

## Overview

This design establishes a comprehensive timezone handling strategy for the SociusFit application. The core principle is: **always use the user's local device timezone for all date/time operations, store timestamps in UTC in the database, and convert between them consistently using centralized utilities**.

The design introduces a `timezone-utils.ts` module that provides all timezone-related functions, updates API endpoints to accept timezone offsets from clients, and refactors UI components to use local timezone consistently. This ensures that meals, workouts, and WHOOP data appear on the correct calendar days, week-to-date calculations are accurate, and day boundaries are calculated correctly regardless of server timezone.

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Browser)                        │
│  - Runs in user's local timezone                            │
│  - Uses timezone-utils for date operations                  │
│  - Sends timezone offset to server with requests            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ API Request
                       │ (includes tzOffset parameter)
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Server (Vercel/UTC)                       │
│  - Runs in UTC timezone                                     │
│  - Receives timezone offset from client                     │
│  - Uses timezone-utils to calculate UTC boundaries          │
│  - Queries database with UTC timestamps                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Database Query
                       │ (UTC timestamps)
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                Database (Supabase/UTC)                       │
│  - Stores all timestamps as TIMESTAMPTZ (UTC)               │
│  - Stores dates as DATE (no timezone)                       │
│  - Returns data in UTC                                      │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Example: Logging a Meal

```
1. User clicks "Log Meal" at 7:00 PM CST (01:00 AM UTC next day)
   - Client: getLocalDate() → "2026-02-05"
   - Client: getTimezoneOffset() → -360 (CST is UTC-6)

2. Client sends to API:
   POST /api/meals/upload
   {
     photo: <data>,
     timestamp: "2026-02-05T19:00:00-06:00",  // Local time
     tzOffset: -360
   }

3. Server processes:
   - Receives timestamp, converts to UTC: "2026-02-06T01:00:00Z"
   - Stores in database with UTC timestamp
   - meal_timestamp: "2026-02-06T01:00:00Z"

4. User views meals for "2026-02-05":
   GET /api/meals/daily?date=2026-02-05&tzOffset=-360

5. Server calculates UTC boundaries:
   - localDateToUTCStart("2026-02-05", -360) → "2026-02-05T06:00:00Z"
   - localDateToUTCEnd("2026-02-05", -360) → "2026-02-06T05:59:59.999Z"
   - Query: WHERE meal_timestamp >= '2026-02-05T06:00:00Z' 
            AND meal_timestamp < '2026-02-06T06:00:00Z'

6. Meal is returned because 01:00 AM UTC is within the range
```

## Components and Interfaces

### 1. Timezone Utilities Module (`app/lib/timezone-utils.ts`)

This is the central module for all timezone operations.

```typescript
/**
 * Timezone Utilities
 * 
 * Centralized timezone handling for SociusFit application.
 * All date/time operations should use these utilities to ensure consistency.
 * 
 * Core Principles:
 * - Always use local timezone for user-facing operations
 * - Store timestamps in UTC in database
 * - Convert between local and UTC using timezone offset
 * - Use YYYY-MM-DD strings for calendar dates
 * - Use ISO 8601 strings for timestamps
 */

/**
 * Gets the current local date as YYYY-MM-DD string
 * Uses local timezone components to avoid UTC conversion issues
 * 
 * @returns Date string in YYYY-MM-DD format (e.g., "2026-02-05")
 */
export function getLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Gets the timezone offset in minutes for the current locale
 * Negative values indicate west of UTC (e.g., -360 for CST)
 * Positive values indicate east of UTC (e.g., 60 for CET)
 * 
 * @returns Timezone offset in minutes
 */
export function getTimezoneOffset(date: Date = new Date()): number {
  return date.getTimezoneOffset()
}

/**
 * Converts a local date string to UTC start-of-day timestamp
 * 
 * @param dateStr - Local date in YYYY-MM-DD format
 * @param tzOffset - Timezone offset in minutes (from getTimezoneOffset())
 * @returns ISO 8601 UTC timestamp for start of day
 * 
 * @example
 * // For CST (UTC-6, offset = -360)
 * localDateToUTCStart("2026-02-05", -360)
 * // Returns: "2026-02-05T06:00:00.000Z"
 * // (Feb 5 00:00 CST = Feb 5 06:00 UTC)
 */
export function localDateToUTCStart(dateStr: string, tzOffset: number): string {
  const localMidnight = new Date(`${dateStr}T00:00:00`)
  const utcTime = new Date(localMidnight.getTime() + tzOffset * 60000)
  return utcTime.toISOString()
}

/**
 * Converts a local date string to UTC end-of-day timestamp
 * 
 * @param dateStr - Local date in YYYY-MM-DD format
 * @param tzOffset - Timezone offset in minutes
 * @returns ISO 8601 UTC timestamp for end of day (23:59:59.999)
 * 
 * @example
 * // For CST (UTC-6, offset = -360)
 * localDateToUTCEnd("2026-02-05", -360)
 * // Returns: "2026-02-06T05:59:59.999Z"
 * // (Feb 5 23:59:59.999 CST = Feb 6 05:59:59.999 UTC)
 */
export function localDateToUTCEnd(dateStr: string, tzOffset: number): string {
  const localEndOfDay = new Date(`${dateStr}T23:59:59.999`)
  const utcTime = new Date(localEndOfDay.getTime() + tzOffset * 60000)
  return utcTime.toISOString()
}

/**
 * Formats a UTC timestamp as a local date string
 * 
 * @param timestamp - ISO 8601 UTC timestamp
 * @returns Date string in YYYY-MM-DD format
 */
export function formatUTCAsLocalDate(timestamp: string): string {
  const date = new Date(timestamp)
  return getLocalDate(date)
}

/**
 * Formats a UTC timestamp as a local date-time display string
 * 
 * @param timestamp - ISO 8601 UTC timestamp
 * @param options - Intl.DateTimeFormatOptions for formatting
 * @returns Formatted date-time string in local timezone
 * 
 * @example
 * formatUTCAsLocalDateTime("2026-02-06T01:00:00Z")
 * // Returns: "2/5/2026, 7:00 PM" (in CST)
 */
export function formatUTCAsLocalDateTime(
  timestamp: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = new Date(timestamp)
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options
  }
  return date.toLocaleString(undefined, defaultOptions)
}

/**
 * Gets the Monday of the week for a given date (in local timezone)
 * Week starts on Monday (ISO 8601 standard)
 * 
 * @param date - Date to find week start for (defaults to today)
 * @returns Date object set to Monday at 00:00:00 local time
 */
export function getWeekStart(date: Date = new Date()): Date {
  const monday = new Date(date)
  const day = monday.getDay()
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

/**
 * Gets the week start as a YYYY-MM-DD string
 * 
 * @param date - Date to find week start for (defaults to today)
 * @returns Date string for Monday of the week
 */
export function getWeekStartString(date: Date = new Date()): string {
  return getLocalDate(getWeekStart(date))
}

/**
 * Calculates days elapsed from week start to current date (inclusive)
 * Returns 1-7 where Monday = 1, Sunday = 7
 * 
 * @param weekStart - Monday of the week
 * @param currentDate - Current date (defaults to today)
 * @returns Number of days elapsed (1-7)
 * 
 * @example
 * // If today is Wednesday
 * calculateDaysElapsed(mondayDate, new Date())
 * // Returns: 3
 */
export function calculateDaysElapsed(
  weekStart: Date,
  currentDate: Date = new Date()
): number {
  // Normalize to start of day to avoid time-of-day issues
  const start = new Date(weekStart)
  start.setHours(0, 0, 0, 0)
  
  const current = new Date(currentDate)
  current.setHours(0, 0, 0, 0)
  
  // Calculate difference in days
  const diffTime = current.getTime() - start.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  // Days elapsed is diffDays + 1 (inclusive of start day)
  // Clamp to 1-7 range
  return Math.max(1, Math.min(7, diffDays + 1))
}

/**
 * Checks if two dates are the same calendar day (in local timezone)
 * 
 * @param date1 - First date (Date object or YYYY-MM-DD string)
 * @param date2 - Second date (Date object or YYYY-MM-DD string)
 * @returns True if same calendar day
 */
export function isSameDay(date1: Date | string, date2: Date | string): boolean {
  const str1 = typeof date1 === 'string' ? date1.split('T')[0] : getLocalDate(date1)
  const str2 = typeof date2 === 'string' ? date2.split('T')[0] : getLocalDate(date2)
  return str1 === str2
}

/**
 * Checks if a date is today (in local timezone)
 * 
 * @param date - Date to check (Date object or YYYY-MM-DD string)
 * @returns True if date is today
 */
export function isToday(date: Date | string): boolean {
  return isSameDay(date, new Date())
}

/**
 * Checks if a date is in the future (in local timezone)
 * 
 * @param date - Date to check (Date object or YYYY-MM-DD string)
 * @returns True if date is after today
 */
export function isFuture(date: Date | string): boolean {
  const dateStr = typeof date === 'string' ? date.split('T')[0] : getLocalDate(date)
  const todayStr = getLocalDate()
  return dateStr > todayStr
}

/**
 * Validates timezone offset is within valid range
 * Valid range: -720 to 840 minutes (UTC-12 to UTC+14)
 * 
 * @param tzOffset - Timezone offset in minutes
 * @returns True if valid
 */
export function isValidTimezoneOffset(tzOffset: number): boolean {
  return tzOffset >= -720 && tzOffset <= 840
}

/**
 * Parses a date string and returns a Date object
 * Handles YYYY-MM-DD format without timezone conversion
 * 
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Date object at local midnight
 */
export function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

/**
 * Gets an array of dates for a week (Monday through Sunday)
 * 
 * @param weekStart - Monday of the week
 * @returns Array of 7 Date objects
 */
export function getWeekDays(weekStart: Date): Date[] {
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart)
    day.setDate(weekStart.getDate() + i)
    days.push(day)
  }
  return days
}
```

### 2. Updated API Endpoints

All API endpoints that deal with dates must be updated to accept and use timezone offsets.

#### Pattern for API Routes

```typescript
// app/api/meals/daily/route.ts
export async function GET(request: Request) {
  const supabase = await createServerClient()
  
  // 1. Authenticate
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // 2. Parse query parameters
  const { searchParams } = new URL(request.url)
  const dateStr = searchParams.get('date')
  const tzOffsetStr = searchParams.get('tzOffset')
  
  if (!dateStr) {
    return NextResponse.json(
      { error: 'date parameter required (YYYY-MM-DD)' },
      { status: 400 }
    )
  }
  
  // 3. Validate and parse timezone offset
  const tzOffset = tzOffsetStr ? parseInt(tzOffsetStr, 10) : 0
  if (!isValidTimezoneOffset(tzOffset)) {
    return NextResponse.json(
      { error: 'Invalid timezone offset' },
      { status: 400 }
    )
  }
  
  // 4. Calculate UTC boundaries for the local date
  const startUTC = localDateToUTCStart(dateStr, tzOffset)
  const endUTC = localDateToUTCEnd(dateStr, tzOffset)
  
  // 5. Query database with UTC boundaries
  const { data: meals, error: mealsError } = await supabase
    .from('meals')
    .select('*')
    .gte('meal_timestamp', startUTC)
    .lt('meal_timestamp', endUTC)
    .order('meal_timestamp', { ascending: true })
  
  // 6. Return data
  return NextResponse.json({ meals, date: dateStr })
}
```

### 3. Updated UI Components

UI components must use timezone utilities and pass timezone offset to API calls.

#### Pattern for Client Components

```typescript
// app/components/DailyProgressView.tsx
'use client'

import { useState, useEffect } from 'react'
import { getLocalDate, getTimezoneOffset } from '@/app/lib/timezone-utils'

export default function DailyProgressView() {
  const [selectedDate, setSelectedDate] = useState(getLocalDate())
  const [meals, setMeals] = useState([])
  
  useEffect(() => {
    async function fetchMeals() {
      const tzOffset = getTimezoneOffset()
      const response = await fetch(
        `/api/meals/daily?date=${selectedDate}&tzOffset=${tzOffset}`
      )
      const data = await response.json()
      setMeals(data.meals)
    }
    
    fetchMeals()
  }, [selectedDate])
  
  return (
    <div>
      <input
        type="date"
        value={selectedDate}
        onChange={(e) => setSelectedDate(e.target.value)}
      />
      {/* Display meals */}
    </div>
  )
}
```

### 4. Updated Adherence Calculator

The adherence calculator must use timezone-aware date operations.

```typescript
// app/lib/adherence-calculator.ts
import { 
  getWeekStart, 
  calculateDaysElapsed,
  getLocalDate 
} from './timezone-utils'

export function calculateDaysElapsedInWeek(): number {
  const weekStart = getWeekStart()
  const today = new Date()
  return calculateDaysElapsed(weekStart, today)
}

export function calculateWeeklyAdherence(
  dailySummaries: DailySummary[],
  targets: DailyTargets
): WeeklyAdherenceScore {
  const weekStart = getWeekStart()
  const daysElapsed = calculateDaysElapsedInWeek()
  
  // Calculate prorated targets
  const proratedTargets = {
    protein: targets.targetProtein * daysElapsed,
    carbs: targets.targetCarbs * daysElapsed,
    fat: targets.targetFat * daysElapsed,
    calories: targets.targetCalories * daysElapsed
  }
  
  // ... rest of calculation
}
```

## Data Models

### Timezone-Related Types

```typescript
// app/lib/types/timezone.types.ts

/**
 * Date string in YYYY-MM-DD format representing a local calendar date
 */
export type DateString = string

/**
 * ISO 8601 timestamp string in UTC
 */
export type UTCTimestamp = string

/**
 * Timezone offset in minutes
 * Negative values = west of UTC (e.g., -360 for CST)
 * Positive values = east of UTC (e.g., 60 for CET)
 */
export type TimezoneOffset = number

/**
 * Date range with timezone context
 */
export interface DateRange {
  startDate: DateString
  endDate: DateString
  tzOffset: TimezoneOffset
}

/**
 * UTC boundaries for a local date
 */
export interface UTCBoundaries {
  startUTC: UTCTimestamp
  endUTC: UTCTimestamp
}
```

### Database Schema Considerations

No changes to database schema are required. The existing schema already stores timestamps correctly:

```sql
-- Timestamps stored as TIMESTAMPTZ (UTC)
meals.meal_timestamp TIMESTAMPTZ
meals.created_at TIMESTAMPTZ

-- Dates stored as DATE (no timezone)
workouts.workout_date DATE
whoop_recovery.date DATE
whoop_sleep.date DATE
whoop_cycles.date DATE
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Now I'll perform the prework analysis to identify testable properties:


### Property Reflection

After analyzing all acceptance criteria, I've identified the following redundancies:

**Redundant Properties:**
- 3.3 (Week_Start determination) is redundant with 1.5 (same function)
- 6.2 (weekly summaries use Week_Start) is redundant with 3.3/1.5
- 8.2 (API uses offset for UTC boundaries) is redundant with 2.7
- 8.6 (converting local dates to UTC boundaries) is redundant with 2.7
- 10.4 (querying by timestamp ranges) is redundant with 2.7

**Properties to Combine:**
- 2.4, 4.3, 5.3, 6.3, 9.3 (all about displaying dates in local timezone) → Single property about date formatting
- 2.3, 4.4, 6.4 (all about grouping by local calendar date) → Single property about data aggregation
- 4.5 and 2.8 (preserving user's intended date) → Single round-trip property

**Final Property Set:**
After reflection, we have 25 unique, non-redundant properties to implement.

### Correctness Properties

**Property 1: Local date extraction**
*For any* Date object, calling getLocalDate() should return a string in YYYY-MM-DD format that matches the date's local year, month, and day components.
**Validates: Requirements 1.1**

**Property 2: UTC start-of-day conversion**
*For any* valid date string and timezone offset, localDateToUTCStart() should return a UTC timestamp that represents midnight (00:00:00) in the local timezone.
**Validates: Requirements 1.2**

**Property 3: UTC end-of-day conversion**
*For any* valid date string and timezone offset, localDateToUTCEnd() should return a UTC timestamp that represents 23:59:59.999 in the local timezone.
**Validates: Requirements 1.3**

**Property 4: Timezone offset validity**
*For any* Date object, getTimezoneOffset() should return a value between -720 and 840 (inclusive), representing valid timezone offsets.
**Validates: Requirements 1.4**

**Property 5: Week start is always Monday**
*For any* date, getWeekStart() should return a Date object where getDay() equals 1 (Monday) and the date is within 6 days before the input date.
**Validates: Requirements 1.5, 3.3, 6.2**

**Property 6: Days elapsed bounds**
*For any* week start date and current date within the same week, calculateDaysElapsed() should return an integer between 1 and 7 (inclusive).
**Validates: Requirements 1.6, 3.5**

**Property 7: Days elapsed calculation correctness**
*For any* week start date, if the current date is N days after week start, then calculateDaysElapsed() should return N + 1 (inclusive counting).
**Validates: Requirements 1.6, 3.1**

**Property 8: Timestamp to date string formatting**
*For any* valid UTC timestamp, formatUTCAsLocalDate() should return a string in YYYY-MM-DD format representing the local calendar date.
**Validates: Requirements 1.7**

**Property 9: Timestamp to datetime formatting**
*For any* valid UTC timestamp, formatUTCAsLocalDateTime() should return a human-readable string containing date and time components.
**Validates: Requirements 1.8**

**Property 10: Meal date preservation (round-trip)**
*For any* meal logged on local date D with timezone offset T, querying for date D with offset T should return that meal.
**Validates: Requirements 2.8, 4.5**

**Property 11: UTC boundary calculation correctness**
*For any* local date string and timezone offset, the UTC start boundary should be exactly 24 hours before the UTC end boundary.
**Validates: Requirements 2.7, 8.2**

**Property 12: Date grouping consistency**
*For any* set of records with timestamps, grouping by local calendar date should place all records with timestamps in the same local day into the same group.
**Validates: Requirements 2.3, 4.4, 6.4**

**Property 13: Date display formatting consistency**
*For any* timestamp displayed in the UI, the formatted date should match the local calendar date when the timestamp occurred.
**Validates: Requirements 2.4, 4.3, 5.3, 6.3, 9.3**

**Property 14: Prorated target calculation**
*For any* daily target value and days elapsed (1-7), the prorated target should equal the daily target multiplied by days elapsed.
**Validates: Requirements 3.2**

**Property 15: Weekly date range coverage**
*For any* week start date, querying with that week's date range should return all records with local dates from Monday through Sunday of that week.
**Validates: Requirements 3.4**

**Property 16: Date string comparison**
*For any* two dates with the same local calendar date, isSameDay() should return true regardless of time-of-day or timezone.
**Validates: Requirements 4.2, 5.2**

**Property 17: WHOOP date conversion**
*For any* WHOOP API date, converting to the user's local timezone should preserve the calendar date meaning (e.g., recovery for "2026-02-05" should appear on Feb 5 in user's calendar).
**Validates: Requirements 5.5**

**Property 18: Cross-domain date matching**
*For any* workout and WHOOP data with the same local calendar date, correlation logic should match them together.
**Validates: Requirements 5.4**

**Property 19: Today determination**
*For any* point in time, determining "today" should return the current local calendar date, not the UTC date.
**Validates: Requirements 6.1, 7.1**

**Property 20: Date range query consistency**
*For any* date range query, all returned records should have local dates within the specified range (inclusive).
**Validates: Requirements 7.3, 7.4**

**Property 21: API date string preservation**
*For any* date string sent to an API endpoint, the server should treat it as a local date without timezone conversion.
**Validates: Requirements 8.1**

**Property 22: API response format**
*For any* API response containing dates, calendar dates should be returned as YYYY-MM-DD strings and timestamps should be returned as ISO 8601 UTC strings.
**Validates: Requirements 8.3, 8.4**

**Property 23: Timezone offset validation**
*For any* timezone offset value, isValidTimezoneOffset() should return true only if the value is between -720 and 840 (inclusive).
**Validates: Requirements 8.7**

**Property 24: UI date selection format**
*For any* date selected in a date picker, the captured value should be a string in YYYY-MM-DD format.
**Validates: Requirements 9.2**

**Property 25: Relative date calculation**
*For any* date, determining if it is "today", "yesterday", or "future" should use local calendar date comparison, not UTC comparison.
**Validates: Requirements 9.4, 9.6, 9.7**

## Error Handling

### Timezone Offset Validation

```typescript
// Validate timezone offset before use
if (!isValidTimezoneOffset(tzOffset)) {
  return NextResponse.json(
    { 
      error: 'Invalid timezone offset',
      details: 'Offset must be between -720 and 840 minutes'
    },
    { status: 400 }
  )
}
```

### Date String Validation

```typescript
// Validate date string format
const dateRegex = /^\d{4}-\d{2}-\d{2}$/
if (!dateRegex.test(dateStr)) {
  return NextResponse.json(
    { 
      error: 'Invalid date format',
      details: 'Date must be in YYYY-MM-DD format'
    },
    { status: 400 }
  )
}
```

### Missing Timezone Offset Handling

```typescript
// Default to UTC (offset = 0) if not provided, but log warning
const tzOffset = tzOffsetStr ? parseInt(tzOffsetStr, 10) : 0
if (!tzOffsetStr) {
  console.warn('No timezone offset provided, defaulting to UTC')
}
```

### Daylight Saving Time Transitions

The timezone utilities handle DST transitions automatically because they use JavaScript's built-in Date object, which accounts for DST. No special handling is required.

### Edge Cases

1. **Midnight boundary**: Ensure queries at 23:59:59 and 00:00:00 are handled correctly
2. **Week boundary**: Ensure Sunday to Monday transition is handled correctly
3. **Month/year boundary**: Ensure date calculations work across month and year boundaries
4. **Leap years**: JavaScript Date handles leap years automatically
5. **Invalid dates**: Validate date strings before parsing

## Testing Strategy

### Unit Tests

Unit tests will verify specific examples and edge cases:

1. **Timezone utility functions**
   - Test getLocalDate() with known dates
   - Test localDateToUTCStart/End() with various timezones
   - Test getWeekStart() for each day of the week
   - Test calculateDaysElapsed() at day boundaries
   - Test date comparison functions (isSameDay, isToday, isFuture)

2. **API endpoint timezone handling**
   - Test that endpoints accept tzOffset parameter
   - Test that endpoints validate tzOffset range
   - Test that endpoints calculate UTC boundaries correctly
   - Test that endpoints return correct date formats

3. **Edge cases**
   - Midnight boundary (23:59:59 vs 00:00:00)
   - Week boundary (Sunday to Monday)
   - Month boundary (last day to first day)
   - Year boundary (Dec 31 to Jan 1)
   - Daylight saving time transitions

### Property-Based Tests

Property-based tests will verify universal properties across many generated inputs (minimum 100 iterations per test):

1. **Property 1: Local date extraction** (Requirements 1.1)
   - Generate random Date objects
   - Verify getLocalDate() returns YYYY-MM-DD matching local components

2. **Property 2: UTC start-of-day conversion** (Requirements 1.2)
   - Generate random date strings and timezone offsets
   - Verify localDateToUTCStart() represents midnight in local timezone

3. **Property 3: UTC end-of-day conversion** (Requirements 1.3)
   - Generate random date strings and timezone offsets
   - Verify localDateToUTCEnd() represents 23:59:59.999 in local timezone

4. **Property 4: Timezone offset validity** (Requirements 1.4)
   - Generate random Date objects
   - Verify getTimezoneOffset() returns value in valid range

5. **Property 5: Week start is always Monday** (Requirements 1.5, 3.3, 6.2)
   - Generate random dates
   - Verify getWeekStart() returns Monday within 6 days before input

6. **Property 6: Days elapsed bounds** (Requirements 1.6, 3.5)
   - Generate random week starts and dates within same week
   - Verify calculateDaysElapsed() returns 1-7

7. **Property 7: Days elapsed calculation** (Requirements 1.6, 3.1)
   - Generate random week starts and offsets
   - Verify calculateDaysElapsed() equals offset + 1

8. **Property 8: Timestamp to date string** (Requirements 1.7)
   - Generate random UTC timestamps
   - Verify formatUTCAsLocalDate() returns YYYY-MM-DD

9. **Property 9: Timestamp to datetime** (Requirements 1.8)
   - Generate random UTC timestamps
   - Verify formatUTCAsLocalDateTime() returns readable string

10. **Property 10: Meal date preservation** (Requirements 2.8, 4.5)
    - Generate random meals with local dates
    - Verify round-trip: log on date D, query date D returns meal

11. **Property 11: UTC boundary calculation** (Requirements 2.7, 8.2)
    - Generate random date strings and offsets
    - Verify end boundary is 24 hours after start boundary

12. **Property 12: Date grouping consistency** (Requirements 2.3, 4.4, 6.4)
    - Generate random records with timestamps
    - Verify grouping by local date is consistent

13. **Property 13: Date display formatting** (Requirements 2.4, 4.3, 5.3, 6.3, 9.3)
    - Generate random timestamps
    - Verify formatted date matches local calendar date

14. **Property 14: Prorated target calculation** (Requirements 3.2)
    - Generate random targets and days elapsed
    - Verify prorated = daily × days

15. **Property 15: Weekly date range coverage** (Requirements 3.4)
    - Generate random week starts
    - Verify weekly query returns all records in that week

16. **Property 16: Date string comparison** (Requirements 4.2, 5.2)
    - Generate random dates with same calendar date
    - Verify isSameDay() returns true

17. **Property 17: WHOOP date conversion** (Requirements 5.5)
    - Generate random WHOOP dates
    - Verify conversion preserves calendar date meaning

18. **Property 18: Cross-domain date matching** (Requirements 5.4)
    - Generate random workout and WHOOP data
    - Verify matching by local date works correctly

19. **Property 19: Today determination** (Requirements 6.1, 7.1)
    - Generate random points in time
    - Verify "today" matches local calendar, not UTC

20. **Property 20: Date range query consistency** (Requirements 7.3, 7.4)
    - Generate random date ranges and records
    - Verify all returned records are within range

21. **Property 21: API date string preservation** (Requirements 8.1)
    - Generate random date strings
    - Verify API treats them as local dates

22. **Property 22: API response format** (Requirements 8.3, 8.4)
    - Generate random API responses
    - Verify dates are YYYY-MM-DD, timestamps are ISO 8601 UTC

23. **Property 23: Timezone offset validation** (Requirements 8.7)
    - Generate random offset values
    - Verify isValidTimezoneOffset() returns correct result

24. **Property 24: UI date selection format** (Requirements 9.2)
    - Generate random date selections
    - Verify captured value is YYYY-MM-DD string

25. **Property 25: Relative date calculation** (Requirements 9.4, 9.6, 9.7)
    - Generate random dates
    - Verify relative date determination uses local calendar

### Integration Tests

Integration tests will verify end-to-end timezone handling:

1. **Meal logging and retrieval**
   - Log meal at specific local time
   - Query for that local date
   - Verify meal is returned

2. **Week-to-date calculations**
   - Log meals throughout a week
   - Query weekly adherence
   - Verify days elapsed and prorated targets are correct

3. **Cross-timezone scenarios**
   - Simulate users in different timezones
   - Verify each user sees correct local dates

4. **Dashboard aggregations**
   - Log data across multiple days
   - Verify dashboard shows correct daily/weekly summaries

### Test Configuration

All property-based tests will:
- Run minimum 100 iterations
- Use fast-check library for property testing
- Include tags referencing design properties
- Tag format: `Feature: timezone-standardization, Property {number}: {property_text}`

Example test structure:

```typescript
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getLocalDate, localDateToUTCStart } from '@/app/lib/timezone-utils'

describe('Timezone Utilities', () => {
  it('Property 1: Local date extraction', () => {
    // Feature: timezone-standardization, Property 1: Local date extraction
    fc.assert(
      fc.property(
        fc.date(),
        (date) => {
          const result = getLocalDate(date)
          
          // Verify format
          expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
          
          // Verify matches local components
          const [year, month, day] = result.split('-').map(Number)
          expect(year).toBe(date.getFullYear())
          expect(month).toBe(date.getMonth() + 1)
          expect(day).toBe(date.getDate())
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
```

## Migration Strategy

### Phase 1: Create Timezone Utilities (No Breaking Changes)

1. Create `app/lib/timezone-utils.ts` with all utility functions
2. Add comprehensive tests for timezone utilities
3. Update `app/lib/types/timezone.types.ts` with new types
4. No changes to existing code yet

### Phase 2: Update API Endpoints (Backward Compatible)

1. Update API endpoints to accept optional `tzOffset` parameter
2. If `tzOffset` is provided, use new timezone-aware logic
3. If `tzOffset` is not provided, fall back to existing logic (with deprecation warning)
4. Update API documentation

Endpoints to update:
- `/api/meals/daily`
- `/api/meals/upload`
- `/api/adherence/weekly`
- `/api/query`
- `/api/fitness-insights`
- `/api/dashboard-stats`

### Phase 3: Update UI Components

1. Update components to use timezone utilities
2. Update components to pass `tzOffset` to API calls
3. Update date pickers to use `getLocalDate()`
4. Update date displays to use formatting functions

Components to update:
- `DailyProgressView`
- `WeeklyProgressView`
- `DailyBreakdown`
- `DayCard`
- `WeekToDateSection`
- `MealCameraCapture`
- `WorkoutLogForm`

### Phase 4: Update Business Logic

1. Update `adherence-calculator.ts` to use timezone utilities
2. Update query system domain fetchers
3. Update WHOOP sync logic
4. Update dashboard statistics calculations

### Phase 5: Remove Deprecated Code

1. Remove fallback logic from API endpoints
2. Make `tzOffset` parameter required
3. Remove old date handling code
4. Update all documentation

### Phase 6: Verification

1. Run full test suite
2. Manual testing in different timezones
3. Verify historical data displays correctly
4. Monitor for timezone-related issues

### Rollback Plan

If issues are discovered:
1. Phase 1-2: No rollback needed (backward compatible)
2. Phase 3-4: Revert UI components to previous version
3. Phase 5: Restore fallback logic in API endpoints

### Data Migration

No database migration is required. Existing timestamps are already stored in UTC and will work correctly with the new timezone handling.

### Testing During Migration

1. Run existing tests after each phase
2. Add new tests for timezone handling
3. Test in multiple timezones (CST, EST, PST, UTC, CET)
4. Test at day boundaries (23:59, 00:00)
5. Test at week boundaries (Sunday/Monday)

## Documentation Updates

### AGENTS.md Updates

Add timezone handling section:

```markdown
## Timezone Handling

**Core Principle:** Always use local timezone for user-facing operations, store in UTC.

### Timezone Utilities

```typescript
import {
  getLocalDate,
  getTimezoneOffset,
  localDateToUTCStart,
  localDateToUTCEnd,
  getWeekStart,
  calculateDaysElapsed
} from '@/app/lib/timezone-utils'

// Get current local date
const today = getLocalDate() // "2026-02-05"

// Get timezone offset
const tzOffset = getTimezoneOffset() // -360 for CST

// Convert local date to UTC boundaries
const startUTC = localDateToUTCStart("2026-02-05", -360)
const endUTC = localDateToUTCEnd("2026-02-05", -360)

// Get week start
const weekStart = getWeekStart() // Monday of current week

// Calculate days elapsed
const daysElapsed = calculateDaysElapsed(weekStart, new Date())
```

### API Timezone Pattern

```typescript
// Client side
const tzOffset = getTimezoneOffset()
const response = await fetch(
  `/api/meals/daily?date=${dateStr}&tzOffset=${tzOffset}`
)

// Server side
const tzOffset = parseInt(searchParams.get('tzOffset') || '0', 10)
const startUTC = localDateToUTCStart(dateStr, tzOffset)
const endUTC = localDateToUTCEnd(dateStr, tzOffset)
```

### Common Pitfalls

❌ **Don't use toISOString().split('T')[0] for local dates**
```typescript
// Wrong - uses UTC date
const date = new Date().toISOString().split('T')[0]
```

✅ **Use getLocalDate() instead**
```typescript
// Correct - uses local date
const date = getLocalDate()
```

❌ **Don't use Date.setDate() for date arithmetic**
```typescript
// Wrong - can cause timezone issues
const tomorrow = new Date()
tomorrow.setDate(tomorrow.getDate() + 1)
```

✅ **Use timezone utilities for date operations**
```typescript
// Correct - handles timezone properly
const today = getLocalDate()
const tomorrow = getLocalDate(new Date(Date.now() + 86400000))
```
```

### API Development Guidelines Updates

Add timezone section to `api-development.md`:

```markdown
## Timezone Handling in APIs

All API endpoints that deal with dates must:

1. Accept `tzOffset` query parameter (in minutes)
2. Validate timezone offset is in valid range (-720 to 840)
3. Use timezone utilities to calculate UTC boundaries
4. Return dates as YYYY-MM-DD strings
5. Return timestamps as ISO 8601 UTC strings

Example:

```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const dateStr = searchParams.get('date')
  const tzOffsetStr = searchParams.get('tzOffset')
  
  // Validate
  if (!dateStr) {
    return NextResponse.json({ error: 'date required' }, { status: 400 })
  }
  
  const tzOffset = tzOffsetStr ? parseInt(tzOffsetStr, 10) : 0
  if (!isValidTimezoneOffset(tzOffset)) {
    return NextResponse.json({ error: 'Invalid timezone offset' }, { status: 400 })
  }
  
  // Calculate UTC boundaries
  const startUTC = localDateToUTCStart(dateStr, tzOffset)
  const endUTC = localDateToUTCEnd(dateStr, tzOffset)
  
  // Query with UTC boundaries
  const { data } = await supabase
    .from('meals')
    .select('*')
    .gte('meal_timestamp', startUTC)
    .lt('meal_timestamp', endUTC)
  
  return NextResponse.json({ meals: data, date: dateStr })
}
```
```

### Component Patterns Updates

Add timezone section to `component-patterns.md`:

```markdown
## Timezone Handling in Components

Client components must:

1. Use timezone utilities for date operations
2. Pass timezone offset to API calls
3. Display dates in local timezone

Example:

```typescript
'use client'
import { useState, useEffect } from 'react'
import { getLocalDate, getTimezoneOffset } from '@/app/lib/timezone-utils'

export default function DailyView() {
  const [date, setDate] = useState(getLocalDate())
  const [data, setData] = useState([])
  
  useEffect(() => {
    async function fetchData() {
      const tzOffset = getTimezoneOffset()
      const response = await fetch(
        `/api/meals/daily?date=${date}&tzOffset=${tzOffset}`
      )
      const result = await response.json()
      setData(result.meals)
    }
    fetchData()
  }, [date])
  
  return (
    <div>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      {/* Display data */}
    </div>
  )
}
```
```

## Performance Considerations

### Caching Timezone Offset

The timezone offset rarely changes (only during DST transitions), so it can be cached:

```typescript
// Cache timezone offset for the session
let cachedTzOffset: number | null = null

export function getTimezoneOffset(date: Date = new Date()): number {
  if (cachedTzOffset === null) {
    cachedTzOffset = date.getTimezoneOffset()
  }
  return cachedTzOffset
}

// Clear cache on DST transition (optional)
export function clearTimezoneCache() {
  cachedTzOffset = null
}
```

### Database Query Optimization

Existing indexes on date columns will continue to work efficiently:

```sql
-- Existing indexes (no changes needed)
CREATE INDEX idx_meals_user_timestamp ON meals(user_id, meal_timestamp);
CREATE INDEX idx_workouts_user_date ON workouts(user_id, workout_date);
```

### Client-Side Date Calculations

Most date calculations happen client-side, reducing server load:
- Week start calculation
- Days elapsed calculation
- Date formatting
- Relative date determination

Only UTC boundary calculations happen server-side.

## Security Considerations

### Timezone Offset Validation

Always validate timezone offset to prevent injection attacks:

```typescript
if (!isValidTimezoneOffset(tzOffset)) {
  return NextResponse.json(
    { error: 'Invalid timezone offset' },
    { status: 400 }
  )
}
```

### Date String Validation

Validate date strings to prevent SQL injection:

```typescript
const dateRegex = /^\d{4}-\d{2}-\d{2}$/
if (!dateRegex.test(dateStr)) {
  return NextResponse.json(
    { error: 'Invalid date format' },
    { status: 400 }
  )
}
```

### No User-Controlled Timezone Names

Never accept timezone names (e.g., "America/Chicago") from users. Only accept numeric offsets, which are safer and simpler to validate.

## Future Enhancements

### User Timezone Preference

Currently, the system uses the device's timezone. Future enhancement could allow users to set a preferred timezone:

```typescript
// Store in user_profiles table
user_profiles.preferred_timezone_offset INTEGER

// Use preferred timezone if set, otherwise use device timezone
const tzOffset = user.preferredTimezoneOffset ?? getTimezoneOffset()
```

### Timezone Display in UI

Show the user's current timezone in the UI:

```typescript
function getTimezoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// Display: "Your timezone: America/Chicago (CST)"
```

### Historical Timezone Handling

For users who travel, consider storing the timezone offset with each record:

```sql
ALTER TABLE meals ADD COLUMN timezone_offset INTEGER;
ALTER TABLE workouts ADD COLUMN timezone_offset INTEGER;
```

This would allow accurate display of historical data even if the user's timezone changes.
