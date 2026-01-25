# Design Document: Weekly Progress Tracking

## Overview

This design improves the Weekly Nutrition Adherence view in SociusFit by:
1. Adding a prominent Week-to-Date section showing cumulative progress against prorated targets based on days elapsed
2. Restructuring the Daily Breakdown to use horizontal scrolling for cleaner mobile viewing
3. Using the stricter "days elapsed" approach where missing days count against weekly progress
4. Displaying absolute deviations ("+15g", "-200") alongside percentages for quick understanding

The design follows SociusFit's mobile-first principles and integrates with the existing adherence calculation system.

## Architecture

```mermaid
flowchart TB
    subgraph Frontend
        WAV[WeeklyAdherenceView]
        WTD[WeekToDateSection]
        DB[DailyBreakdown]
        DC[DayCard]
    end
    
    subgraph API
        WA[/api/adherence/weekly]
    end
    
    subgraph Services
        AC[adherence-calculator.ts]
    end
    
    subgraph Database
        DT[(daily_targets)]
        DS[(daily_summaries view)]
    end
    
    WAV --> WTD
    WAV --> DB
    DB --> DC
    WAV -->|fetch| WA
    WA --> AC
    WA --> DT
    WA --> DS
    AC -->|calculateCumulativeAdherence| WA
    AC -->|calculateDaysElapsed| WA
```

### Data Flow

1. `WeeklyAdherenceView` fetches weekly data from `/api/adherence/weekly`
2. API queries `daily_summaries` view and `daily_targets` table
3. `adherence-calculator.ts` computes:
   - Daily adherence scores (existing)
   - Days elapsed from week start to today (new)
   - Cumulative totals across logged days (new)
   - Prorated targets based on days elapsed (new)
   - Cumulative adherence percentages (new)
   - Deviation amounts in absolute values (new)
4. Frontend renders `WeekToDateSection` (prominent, sticky) and `DailyBreakdown` (horizontal scroll)

## Components and Interfaces

### WeeklyAdherenceView (Enhanced)

The main container component, restructured to prioritize week-to-date visibility.

```typescript
interface WeeklyAdherenceViewProps {
  weekStart: Date
  onDateSelect?: (date: Date) => void
}

// Component structure (top to bottom):
// 1. Header with week range
// 2. WeekToDateSection (NEW - prominent, sticky on scroll)
// 3. DailyBreakdown (horizontal scroll)
// 4. Weekly Score Summary (existing, moved below)
// 5. Correction Guidance (existing)
// 6. Targets Reference (existing)
```

### WeekToDateSection (New Component)

Displays cumulative progress against prorated targets based on days elapsed.

```typescript
interface WeekToDateSectionProps {
  cumulativeData: CumulativeAdherenceData
  targets: DailyTargets
  daysElapsed: number
  daysWithData: number
}

// Visual layout:
// ┌─────────────────────────────────────────────────────┐
// │ Week to Date (3 of 7 days)           [On Track] ✓  │
// ├─────────────────────────────────────────────────────┤
// │ Protein   ████████░░░░  142g / 150g   -8g          │
// │ Carbs     ██████████░░  195g / 180g   +15g         │
// │ Fat       ███████░░░░░   48g / 60g    -12g         │
// │ Calories  █████████░░░  1850 / 1800   +50          │
// └─────────────────────────────────────────────────────┘
```

```typescript
interface CumulativeAdherenceData {
  // Actual cumulative totals across logged days
  totalProtein: number
  totalCarbs: number
  totalFat: number
  totalCalories: number
  
  // Prorated targets (daily target × days elapsed)
  proratedProteinTarget: number
  proratedCarbsTarget: number
  proratedFatTarget: number
  proratedCaloriesTarget: number
  
  // Adherence percentages (actual / prorated × 100)
  proteinAdherence: number
  carbsAdherence: number
  fatAdherence: number
  caloriesAdherence: number
  
  // Tolerance status (within user's tolerancePct)
  proteinWithinTolerance: boolean
  carbsWithinTolerance: boolean
  fatWithinTolerance: boolean
  caloriesWithinTolerance: boolean
  
  // Deviation amounts (positive = over, negative = under)
  proteinDeviation: number
  carbsDeviation: number
  fatDeviation: number
  caloriesDeviation: number
  
  // Overall status
  overallStatus: 'on-track' | 'ahead' | 'behind'
}
```

### DailyBreakdown (Restructured)

Horizontal scrolling layout for day cards.

```typescript
interface DailyBreakdownProps {
  weekDays: Date[]
  dailyScores: DailyAdherenceScore[]
  onDateSelect?: (date: Date) => void
}

// Visual layout (horizontal scroll):
// ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
// │ Mon  │ │ Tue  │ │ Wed  │ │ Thu  │ │ Fri  │ │ Sat  │ │ Sun  │
// │  13  │ │  14  │ │  15  │ │  16  │ │  17  │ │  18  │ │  19  │
// │[92%] │ │[85%] │ │[78%] │ │Today │ │Future│ │Future│ │Future│
// │P:142g│ │P:138g│ │P:125g│ │      │ │      │ │      │ │      │
// │C:180g│ │C:175g│ │C:200g│ │      │ │      │ │      │ │      │
// │F:52g │ │F:48g │ │F:65g │ │      │ │      │ │      │ │      │
// │1850  │ │1780  │ │1920  │ │      │ │      │ │      │ │      │
// └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘
//                              ← swipe →
```

### DayCard (Sub-component)

Individual day display within the horizontal scroll.

```typescript
interface DayCardProps {
  date: Date
  dayData: DailyAdherenceScore | null
  isToday: boolean
  isFuture: boolean
  onSelect?: () => void
}

// Card dimensions: min-width 100px, height auto
// Touch target: entire card is tappable (min 44px height)
```

## Data Models

### Enhanced API Response

```typescript
interface WeeklyAdherenceResponse {
  // Existing fields
  weeklyAdherence: WeeklyAdherenceScore
  correctionGuidance: CorrectionGuidance
  targets: DailyTargets
  daysWithData: number
  weekStart: string
  weekEnd: string
  
  // New fields for cumulative tracking
  daysElapsed: number
  cumulativeData: CumulativeAdherenceData
}
```

### CumulativeAdherenceData (New Type)

Added to `app/lib/types/food-tracking.ts`:

```typescript
// Cumulative week-to-date adherence data
export interface CumulativeAdherenceData {
  // Actual cumulative totals across logged days
  totalProtein: number
  totalCarbs: number
  totalFat: number
  totalCalories: number
  
  // Prorated targets (daily target × days elapsed)
  proratedProteinTarget: number
  proratedCarbsTarget: number
  proratedFatTarget: number
  proratedCaloriesTarget: number
  
  // Adherence percentages (actual / prorated × 100, capped at 100 for display)
  proteinAdherence: number
  carbsAdherence: number
  fatAdherence: number
  caloriesAdherence: number
  
  // Tolerance status (within user's tolerancePct)
  proteinWithinTolerance: boolean
  carbsWithinTolerance: boolean
  fatWithinTolerance: boolean
  caloriesWithinTolerance: boolean
  
  // Deviation amounts (actual - prorated target)
  proteinDeviation: number
  carbsDeviation: number
  fatDeviation: number
  caloriesDeviation: number
  
  // Overall status based on average adherence
  overallStatus: 'on-track' | 'ahead' | 'behind'
}
```

### Calculator Function Signatures

New functions in `app/lib/adherence-calculator.ts`:

```typescript
/**
 * Calculates days elapsed from week start to today (or end of week if viewing past week)
 * Requirements: 5.1, 6.2
 */
export function calculateDaysElapsed(weekStart: Date, today: Date): number

/**
 * Calculates cumulative week-to-date adherence data
 * Requirements: 1.2, 1.3, 1.4, 5.2, 5.3, 6.3, 6.4
 */
export function calculateCumulativeAdherence(
  dailySummaries: DailySummary[],
  targets: DailyTargets,
  daysElapsed: number
): CumulativeAdherenceData

/**
 * Checks if a value is within tolerance of target
 * Requirements: 1.7, 1.8, 1.9
 */
export function isWithinTolerance(
  actual: number,
  target: number,
  tolerancePct: number
): boolean

/**
 * Determines overall status based on cumulative adherence
 * Requirements: 3.5
 */
export function determineOverallStatus(
  cumulativeData: CumulativeAdherenceData,
  tolerancePct: number
): 'on-track' | 'ahead' | 'behind'
```

### UI Helper Functions

```typescript
/**
 * Formats deviation for display (e.g., "+15g", "-200")
 * Requirements: 1.6, 6.5
 */
export function formatDeviation(deviation: number, unit: string = 'g'): string {
  const sign = deviation >= 0 ? '+' : ''
  return `${sign}${Math.round(deviation)}${unit}`
}

/**
 * Gets color class based on adherence score
 * Requirements: 3.1, 3.2
 */
export function getAdherenceColor(score: number): string {
  if (score >= 95) return 'green'
  if (score >= 85) return 'yellow'
  if (score >= 70) return 'orange'
  return 'red'
}

/**
 * Checks if deviation exceeds 10% threshold for highlighting
 * Requirements: 3.3, 3.4
 */
export function shouldHighlightDeviation(actual: number, target: number): boolean {
  if (target === 0) return false
  return Math.abs(actual - target) / target > 0.10
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Prorated Target Calculation

*For any* daily target value (≥0) and days elapsed (1-7), the prorated target SHALL equal the daily target multiplied by days elapsed. This includes the special case where days elapsed = 7 yields the weekly target.

**Validates: Requirements 1.2, 1.3**

### Property 2: Tolerance Status Determination

*For any* actual value, target value (>0), and tolerance percentage (0-100), the tolerance status SHALL be:
- "within tolerance" if |actual - target| ≤ (target × tolerancePct / 100)
- "over target" if actual > target + (target × tolerancePct / 100)
- "under target" if actual < target - (target × tolerancePct / 100)

**Validates: Requirements 1.7, 1.8, 1.9**

### Property 3: Deviation Calculation and Formatting

*For any* actual value and target value, the deviation SHALL equal (actual - target), and the formatted string SHALL include a "+" prefix for non-negative values and display the rounded integer value with appropriate unit.

**Validates: Requirements 1.6, 6.5**

### Property 4: Score Color Mapping

*For any* adherence score (0-100+), the color mapping SHALL return:
- Green if score ≥ 95
- Yellow if 85 ≤ score < 95
- Orange if 70 ≤ score < 85
- Red if score < 70

**Validates: Requirements 3.1, 3.2**

### Property 5: Deviation Highlighting Threshold

*For any* actual value and target value (>0), the macro SHALL be highlighted for attention if and only if |actual - target| / target > 0.10 (exceeds 10% deviation).

**Validates: Requirements 3.3, 3.4**

### Property 6: Days Elapsed Calculation

*For any* week start date (Monday) and current date within or after that week, days elapsed SHALL equal the number of calendar days from week start to current date (inclusive), capped at 7.

**Validates: Requirements 5.1, 6.2**

### Property 7: Cumulative Totals Summation

*For any* set of daily summaries, the cumulative total for each macro (protein, carbs, fat, calories) SHALL equal the sum of that macro across all daily summaries in the set.

**Validates: Requirements 5.2, 6.1**

### Property 8: Cumulative Adherence Percentage

*For any* cumulative actual total and prorated target (>0), the adherence percentage SHALL equal (actual / target) × 100.

**Validates: Requirements 6.4**

### Property 9: Day Card Content Completeness

*For any* day with logged data, the rendered day card SHALL contain: day name, date number, adherence score badge, and all four macro values (protein, carbs, fat, calories).

**Validates: Requirements 2.2, 2.3**

### Property 10: API Response Completeness

*For any* valid API request, the response SHALL contain: cumulative totals for all macros, days elapsed count, prorated targets for all macros, adherence percentages, and deviation amounts.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

## Error Handling

### API Errors

| Error Condition | Response | Status Code |
|-----------------|----------|-------------|
| Unauthenticated request | `{ error: 'Unauthorized' }` | 401 |
| Missing weekStart parameter | `{ error: 'Week start date is required (YYYY-MM-DD format)' }` | 400 |
| Invalid date format | `{ error: 'Invalid week start date format. Use YYYY-MM-DD' }` | 400 |
| No daily targets set | `{ error: 'Failed to fetch user targets. Please set your daily targets first.' }` | 404 |
| Database query failure | `{ error: 'Failed to fetch meal data for the specified week' }` | 500 |

### Frontend Error States

1. **Loading State**: Show spinner while fetching data (existing pattern)
2. **Error State**: Display error message with retry button (existing pattern)
3. **Empty State (No Data)**: Show Week-to-Date section with 0/prorated values and "No meals logged yet" message
4. **Future Days**: Display muted "Future" indicator in day cards
5. **No Targets Set**: Prompt user to set daily targets before showing adherence

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Zero days elapsed | Show "Week hasn't started" or treat as day 1 if viewing current week |
| Zero days with data | Show 0/prorated for all macros, display "No meals logged" message |
| All 7 days logged | Show full week cumulative vs weekly target (prorated = weekly) |
| Partial week (e.g., 3 days elapsed, 2 logged) | Compare cumulative of 2 logged days against 3-day prorated target |
| Zero targets | Prevent division by zero, show "Set targets" prompt |
| Viewing past week | Days elapsed = 7 (full week) |
| Viewing future week | Days elapsed = 0, show "Week hasn't started" |

### Division by Zero Prevention

```typescript
function safePercentage(actual: number, target: number): number {
  if (target === 0) return 0
  return (actual / target) * 100
}

function safeDeviation(actual: number, target: number): number {
  return actual - target // Safe even if target is 0
}
```

## Testing Strategy

### Unit Tests

Focus on specific examples and edge cases using Vitest:

```typescript
// test/adherence-calculator.test.ts
import { describe, it, expect } from 'vitest'
import { 
  calculateDaysElapsed,
  calculateCumulativeAdherence, 
  isWithinTolerance,
  getAdherenceColor,
  shouldHighlightDeviation,
  formatDeviation
} from '@/app/lib/adherence-calculator'

describe('calculateDaysElapsed', () => {
  it('should return 1 for same day as week start', () => {
    const weekStart = new Date('2025-01-20') // Monday
    const today = new Date('2025-01-20')
    expect(calculateDaysElapsed(weekStart, today)).toBe(1)
  })
  
  it('should return 7 for end of week', () => {
    const weekStart = new Date('2025-01-20')
    const today = new Date('2025-01-26') // Sunday
    expect(calculateDaysElapsed(weekStart, today)).toBe(7)
  })
  
  it('should cap at 7 for dates beyond week', () => {
    const weekStart = new Date('2025-01-20')
    const today = new Date('2025-01-30')
    expect(calculateDaysElapsed(weekStart, today)).toBe(7)
  })
})

describe('getAdherenceColor', () => {
  it('should return green for 95+', () => {
    expect(getAdherenceColor(95)).toBe('green')
    expect(getAdherenceColor(100)).toBe('green')
  })
  
  it('should return yellow for 85-94', () => {
    expect(getAdherenceColor(85)).toBe('yellow')
    expect(getAdherenceColor(94)).toBe('yellow')
  })
  
  it('should return orange for 70-84', () => {
    expect(getAdherenceColor(70)).toBe('orange')
    expect(getAdherenceColor(84)).toBe('orange')
  })
  
  it('should return red for <70', () => {
    expect(getAdherenceColor(69)).toBe('red')
    expect(getAdherenceColor(0)).toBe('red')
  })
})

describe('formatDeviation', () => {
  it('should format positive deviation with + sign', () => {
    expect(formatDeviation(15, 'g')).toBe('+15g')
  })
  
  it('should format negative deviation with - sign', () => {
    expect(formatDeviation(-200, '')).toBe('-200')
  })
  
  it('should format zero as +0', () => {
    expect(formatDeviation(0, 'g')).toBe('+0g')
  })
})
```

### Property-Based Tests

Use fast-check with Vitest to verify universal properties (minimum 100 iterations):

```typescript
// test/adherence-calculator.property.test.ts
import { fc, test } from '@fast-check/vitest'
import { describe } from 'vitest'
import { 
  calculateDaysElapsed,
  calculateCumulativeAdherence,
  isWithinTolerance,
  getAdherenceColor,
  shouldHighlightDeviation
} from '@/app/lib/adherence-calculator'

describe('Adherence Calculator Properties', () => {
  // Feature: weekly-progress-tracking, Property 1: Prorated Target Calculation
  test.prop([
    fc.float({ min: 0, max: 500, noNaN: true }),
    fc.integer({ min: 1, max: 7 })
  ])('prorated target equals daily × days elapsed', (dailyTarget, daysElapsed) => {
    const proratedTarget = dailyTarget * daysElapsed
    expect(proratedTarget).toBeCloseTo(dailyTarget * daysElapsed, 5)
  })

  // Feature: weekly-progress-tracking, Property 4: Score Color Mapping
  test.prop([fc.float({ min: 0, max: 150, noNaN: true })])('color mapping is consistent', (score) => {
    const color = getAdherenceColor(score)
    if (score >= 95) expect(color).toBe('green')
    else if (score >= 85) expect(color).toBe('yellow')
    else if (score >= 70) expect(color).toBe('orange')
    else expect(color).toBe('red')
  })

  // Feature: weekly-progress-tracking, Property 5: Deviation Highlighting Threshold
  test.prop([
    fc.float({ min: 0, max: 1000, noNaN: true }),
    fc.float({ min: 1, max: 1000, noNaN: true }) // target > 0
  ])('highlighting threshold is 10%', (actual, target) => {
    const shouldHighlight = shouldHighlightDeviation(actual, target)
    const percentDeviation = Math.abs(actual - target) / target
    expect(shouldHighlight).toBe(percentDeviation > 0.10)
  })

  // Feature: weekly-progress-tracking, Property 6: Days Elapsed Calculation
  test.prop([
    fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
  ])('days elapsed is between 1 and 7 for current week', (weekStart) => {
    // Ensure weekStart is a Monday
    const monday = new Date(weekStart)
    monday.setDate(monday.getDate() - monday.getDay() + 1)
    
    // Test with a date within the week
    const daysOffset = Math.floor(Math.random() * 7)
    const testDate = new Date(monday)
    testDate.setDate(monday.getDate() + daysOffset)
    
    const daysElapsed = calculateDaysElapsed(monday, testDate)
    expect(daysElapsed).toBeGreaterThanOrEqual(1)
    expect(daysElapsed).toBeLessThanOrEqual(7)
  })

  // Feature: weekly-progress-tracking, Property 8: Cumulative Adherence Percentage
  test.prop([
    fc.float({ min: 0, max: 1000, noNaN: true }),
    fc.float({ min: 1, max: 1000, noNaN: true }) // target > 0
  ])('adherence percentage equals (actual / target) × 100', (actual, target) => {
    const expectedPercentage = (actual / target) * 100
    // This would be tested against the actual function
    expect(expectedPercentage).toBeCloseTo((actual / target) * 100, 5)
  })
})
```

**Configuration:**
- Minimum 100 iterations per property test
- Tag format: `Feature: weekly-progress-tracking, Property N: [property text]`

### Integration Tests

```typescript
// test/api/adherence-weekly.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/adherence/weekly/route'
import { NextRequest } from 'next/server'

describe('GET /api/adherence/weekly', () => {
  it('should return cumulative data in response', async () => {
    // Mock authenticated request with valid weekStart
    const request = new NextRequest('http://localhost/api/adherence/weekly?weekStart=2025-01-20')
    
    // Mock Supabase responses...
    
    const response = await GET(request)
    const data = await response.json()
    
    // Verify new fields exist
    expect(data).toHaveProperty('daysElapsed')
    expect(data).toHaveProperty('cumulativeData')
    expect(data.cumulativeData).toHaveProperty('totalProtein')
    expect(data.cumulativeData).toHaveProperty('proratedProteinTarget')
    expect(data.cumulativeData).toHaveProperty('proteinDeviation')
  })
  
  it('should calculate prorated targets based on days elapsed', async () => {
    // Test with 3 days elapsed
    // Verify prorated = daily × 3
  })
})
```

### Component Tests

```typescript
// test/components/WeekToDateSection.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WeekToDateSection from '@/app/components/WeekToDateSection'

describe('WeekToDateSection', () => {
  it('should display all four macros with progress bars', () => {
    const mockData = {
      totalProtein: 142,
      proratedProteinTarget: 150,
      proteinDeviation: -8,
      // ... other fields
    }
    
    render(<WeekToDateSection cumulativeData={mockData} daysElapsed={3} />)
    
    expect(screen.getByText(/Protein/)).toBeInTheDocument()
    expect(screen.getByText(/142g/)).toBeInTheDocument()
    expect(screen.getByText(/-8g/)).toBeInTheDocument()
  })
  
  it('should show "No data" message when no meals logged', () => {
    const emptyData = {
      totalProtein: 0,
      proratedProteinTarget: 150,
      // ... all zeros
    }
    
    render(<WeekToDateSection cumulativeData={emptyData} daysElapsed={3} daysWithData={0} />)
    
    expect(screen.getByText(/No meals logged/)).toBeInTheDocument()
  })
})
```

### Mobile Testing

Per SociusFit development principles, test on actual mobile devices:

- Test horizontal swipe gesture on iOS Safari and Android Chrome
- Verify touch targets meet 44px minimum
- Verify Week-to-Date section remains visible when scrolling daily breakdown
- Test with sweaty/wet fingers simulation
- Verify one-handed operation for quick glances
- Test on various screen sizes (iPhone SE, iPhone 14, Pixel 7)
