---
inclusion: fileMatch
fileMatchPattern: '**/{adherence,WeekToDate,DailyBreakdown,DayCard,weekly}/**/*.{ts,tsx}'
---

# Weekly Progress Tracking Guidelines

## Overview

The weekly progress tracking system provides cumulative adherence views with prorated targets, deviation tracking, and a mobile-optimized horizontally-scrollable daily breakdown.

## Key Components

```
WeeklyAdherenceView (container)
├── WeekToDateSection (cumulative adherence)
│   ├── Prorated target display
│   ├── Actual vs target comparison
│   ├── Deviation with +/- formatting
│   └── Overall status indicator
└── DailyBreakdown (horizontal scroll)
    └── DayCard × 7 (one per day)
        ├── Date header
        ├── Macro breakdown (P/C/F/Cal)
        ├── Adherence percentage
        └── Deviation highlighting (>10%)
```

## Calculation Logic

### Prorated Targets

```typescript
// app/lib/adherence-calculator.ts

/**
 * Calculate prorated targets based on days elapsed in the week
 * Week starts on Monday
 */
export function calculateProratedTargets(
  dailyTarget: MacroTargets,
  daysElapsed: number
): MacroTargets {
  return {
    protein: dailyTarget.protein * daysElapsed,
    carbs: dailyTarget.carbs * daysElapsed,
    fat: dailyTarget.fat * daysElapsed,
    calories: dailyTarget.calories * daysElapsed
  }
}

/**
 * Calculate days elapsed in current week (Monday = day 1)
 */
export function getDaysElapsedInWeek(currentDate: Date = new Date()): number {
  const dayOfWeek = currentDate.getDay()
  // Convert Sunday (0) to 7, keep others as-is
  const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek
  return adjustedDay
}
```

### Cumulative Totals

```typescript
/**
 * Sum all daily totals for the week
 */
export function calculateCumulativeTotals(
  dailyTotals: DailyTotal[]
): MacroTotals {
  return dailyTotals.reduce(
    (acc, day) => ({
      protein: acc.protein + day.protein,
      carbs: acc.carbs + day.carbs,
      fat: acc.fat + day.fat,
      calories: acc.calories + day.calories
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  )
}
```

### Deviation Calculation

```typescript
/**
 * Calculate deviation from prorated targets
 * Positive = ahead, Negative = behind
 */
export function calculateDeviation(
  actual: MacroTotals,
  proratedTarget: MacroTargets
): MacroDeviation {
  return {
    protein: actual.protein - proratedTarget.protein,
    carbs: actual.carbs - proratedTarget.carbs,
    fat: actual.fat - proratedTarget.fat,
    calories: actual.calories - proratedTarget.calories
  }
}

/**
 * Format deviation with +/- sign
 */
export function formatDeviation(value: number, unit: string = 'g'): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${Math.round(value)}${unit}`
}
```

### Adherence Percentage

```typescript
/**
 * Calculate cumulative adherence percentage
 * Uses weighted average: protein 40%, carbs 30%, fat 30%
 */
export function calculateCumulativeAdherence(
  actual: MacroTotals,
  proratedTarget: MacroTargets
): number {
  // Cap each macro at 100% (don't penalize for going over)
  const proteinAdh = Math.min(actual.protein / proratedTarget.protein, 1)
  const carbsAdh = Math.min(actual.carbs / proratedTarget.carbs, 1)
  const fatAdh = Math.min(actual.fat / proratedTarget.fat, 1)
  
  // Weighted average (protein emphasized for fitness goals)
  return (proteinAdh * 0.4) + (carbsAdh * 0.3) + (fatAdh * 0.3)
}
```

### Tolerance Status

```typescript
export type ToleranceStatus = 'on-track' | 'ahead' | 'behind'

/**
 * Determine tolerance status (within 5% = on-track)
 */
export function getToleranceStatus(
  actual: number,
  target: number,
  tolerancePercent: number = 5
): ToleranceStatus {
  const deviation = actual - target
  const toleranceAmount = target * (tolerancePercent / 100)
  
  if (Math.abs(deviation) <= toleranceAmount) {
    return 'on-track'
  }
  return deviation > 0 ? 'ahead' : 'behind'
}
```

## UI Components

### WeekToDateSection

```typescript
// app/components/WeekToDateSection.tsx
interface WeekToDateSectionProps {
  cumulative: MacroTotals
  proratedTarget: MacroTargets
  deviation: MacroDeviation
  adherencePercent: number
  daysElapsed: number
}

export function WeekToDateSection({
  cumulative,
  proratedTarget,
  deviation,
  adherencePercent,
  daysElapsed
}: WeekToDateSectionProps) {
  const overallStatus = getOverallStatus(adherencePercent)
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">Week to Date</h3>
        <span className="text-sm text-gray-500">
          Day {daysElapsed} of 7
        </span>
      </div>
      
      {/* Adherence percentage with color */}
      <div className="text-center mb-4">
        <span className={`text-3xl font-bold ${getAdherenceColor(adherencePercent)}`}>
          {Math.round(adherencePercent * 100)}%
        </span>
        <span className={`ml-2 text-sm ${getStatusColor(overallStatus)}`}>
          {overallStatus}
        </span>
      </div>
      
      {/* Macro breakdown */}
      <div className="grid grid-cols-4 gap-2 text-sm">
        {(['protein', 'carbs', 'fat', 'calories'] as const).map(macro => (
          <MacroColumn
            key={macro}
            label={macro}
            actual={cumulative[macro]}
            target={proratedTarget[macro]}
            deviation={deviation[macro]}
          />
        ))}
      </div>
    </div>
  )
}
```

### DailyBreakdown

```typescript
// app/components/DailyBreakdown.tsx
interface DailyBreakdownProps {
  weekDays: DayData[]
  targets: MacroTargets
}

export function DailyBreakdown({ weekDays, targets }: DailyBreakdownProps) {
  return (
    <div className="overflow-x-auto pb-4 -mx-4 px-4">
      <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
        {weekDays.map((day, index) => (
          <DayCard
            key={day.date}
            day={day}
            targets={targets}
            isToday={index === weekDays.length - 1}
          />
        ))}
      </div>
    </div>
  )
}
```

### DayCard

```typescript
// app/components/DayCard.tsx
interface DayCardProps {
  day: DayData
  targets: MacroTargets
  isToday: boolean
}

export function DayCard({ day, targets, isToday }: DayCardProps) {
  const adherence = calculateDailyAdherence(day.totals, targets)
  
  return (
    <div className={`
      min-w-[140px] p-3 rounded-lg border
      ${isToday ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}
    `}>
      {/* Date header */}
      <div className="text-center mb-2">
        <div className="text-xs text-gray-500">
          {formatDayOfWeek(day.date)}
        </div>
        <div className="font-medium">
          {formatShortDate(day.date)}
        </div>
      </div>
      
      {/* Adherence score */}
      <div className={`text-center text-lg font-bold mb-2 ${getScoreColor(adherence)}`}>
        {Math.round(adherence * 100)}%
      </div>
      
      {/* Compact macro display */}
      <div className="space-y-1 text-xs">
        <MacroRow
          label="P"
          value={day.totals.protein}
          target={targets.protein}
          highlight={shouldHighlight(day.totals.protein, targets.protein)}
        />
        <MacroRow
          label="C"
          value={day.totals.carbs}
          target={targets.carbs}
          highlight={shouldHighlight(day.totals.carbs, targets.carbs)}
        />
        <MacroRow
          label="F"
          value={day.totals.fat}
          target={targets.fat}
          highlight={shouldHighlight(day.totals.fat, targets.fat)}
        />
        <MacroRow
          label="Cal"
          value={day.totals.calories}
          target={targets.calories}
          highlight={shouldHighlight(day.totals.calories, targets.calories)}
          unit=""
        />
      </div>
    </div>
  )
}
```

## Color Coding

### Adherence Score Colors

```typescript
export function getScoreColor(adherence: number): string {
  if (adherence >= 0.9) return 'text-green-600 dark:text-green-400'
  if (adherence >= 0.7) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

export function getAdherenceColor(adherence: number): string {
  if (adherence >= 0.9) return 'text-green-500'
  if (adherence >= 0.7) return 'text-yellow-500'
  if (adherence >= 0.5) return 'text-orange-500'
  return 'text-red-500'
}
```

### Status Colors

```typescript
export function getStatusColor(status: ToleranceStatus): string {
  switch (status) {
    case 'on-track': return 'text-green-600'
    case 'ahead': return 'text-blue-600'
    case 'behind': return 'text-orange-600'
  }
}
```

### Deviation Highlighting

```typescript
/**
 * Highlight macros with >10% deviation from target
 */
export function shouldHighlight(actual: number, target: number): boolean {
  if (target === 0) return false
  const deviationPercent = Math.abs((actual - target) / target) * 100
  return deviationPercent > 10
}
```

## API Endpoint

### GET /api/adherence/weekly

```typescript
// app/api/adherence/weekly/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'

export async function GET(request: NextRequest) {
  const supabase = await createServerClient()
  
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const { searchParams } = new URL(request.url)
  const weekStart = searchParams.get('weekStart') || getStartOfWeek()
  
  // Get user's daily targets
  const { data: targets } = await supabase
    .from('daily_targets')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(1)
    .single()
  
  // Get daily summaries for the week
  const weekEnd = getEndOfWeek(weekStart)
  const { data: dailySummaries } = await supabase
    .from('daily_summaries')
    .select('*')
    .eq('user_id', user.id)
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .order('date', { ascending: true })
  
  // Calculate cumulative data
  const daysElapsed = getDaysElapsedInWeek()
  const cumulative = calculateCumulativeTotals(dailySummaries || [])
  const proratedTarget = calculateProratedTargets(targets, daysElapsed)
  const deviation = calculateDeviation(cumulative, proratedTarget)
  const adherencePercent = calculateCumulativeAdherence(cumulative, proratedTarget)
  
  return NextResponse.json({
    weekStart,
    weekEnd,
    daysElapsed,
    targets,
    dailySummaries: dailySummaries || [],
    cumulative,
    proratedTarget,
    deviation,
    adherencePercent
  })
}
```

## Data Types

```typescript
// app/lib/types/adherence.types.ts

export interface MacroTargets {
  protein: number
  carbs: number
  fat: number
  calories: number
}

export interface MacroTotals {
  protein: number
  carbs: number
  fat: number
  calories: number
}

export interface MacroDeviation {
  protein: number
  carbs: number
  fat: number
  calories: number
}

export interface DayData {
  date: string  // YYYY-MM-DD
  totals: MacroTotals
  mealCount: number
}

export interface WeeklyAdherenceData {
  weekStart: string
  weekEnd: string
  daysElapsed: number
  targets: MacroTargets
  dailySummaries: DayData[]
  cumulative: MacroTotals
  proratedTarget: MacroTargets
  deviation: MacroDeviation
  adherencePercent: number
}
```

## Mobile Optimization

### Horizontal Scroll

```tsx
{/* Container with horizontal scroll */}
<div className="overflow-x-auto pb-4 -mx-4 px-4">
  {/* Content wider than viewport */}
  <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
    {/* Day cards */}
  </div>
</div>
```

### Touch-Friendly Cards

```css
/* Minimum card width for touch */
.day-card {
  min-width: 140px;
  padding: 12px;
}

/* Swipe hint indicator */
.scroll-container::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 20px;
  background: linear-gradient(to right, transparent, white);
  pointer-events: none;
}
```

### Compact Macro Display

```tsx
{/* Single line per macro */}
<div className="flex justify-between text-xs">
  <span className="text-gray-500">P</span>
  <span className={highlight ? 'text-orange-600 font-medium' : ''}>
    {Math.round(value)}g
  </span>
</div>
```

## Testing

Property-based tests cover:

1. **Prorated target calculation** - targets × days = prorated
2. **Tolerance status determination** - within 5% = on-track
3. **Deviation calculation** - actual - target = deviation
4. **Score color mapping** - ≥90% green, ≥70% yellow, else red
5. **Deviation highlighting threshold** - >10% triggers highlight
6. **Days elapsed calculation** - Monday=1, Sunday=7
7. **Cumulative totals summation** - sum of daily values
8. **Cumulative adherence percentage** - weighted average
9. **Day card content completeness** - date, macros, adherence
10. **API response completeness** - all required fields present

```typescript
// test/weekly-progress.test.ts
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  calculateProratedTargets,
  getToleranceStatus,
  calculateDeviation,
  getScoreColor,
  shouldHighlight
} from '@/app/lib/adherence-calculator'

describe('Weekly Progress Calculations', () => {
  it('prorated targets scale linearly with days', () => {
    fc.assert(
      fc.property(
        fc.record({
          protein: fc.integer({ min: 50, max: 300 }),
          carbs: fc.integer({ min: 100, max: 500 }),
          fat: fc.integer({ min: 30, max: 150 }),
          calories: fc.integer({ min: 1200, max: 4000 })
        }),
        fc.integer({ min: 1, max: 7 }),
        (dailyTarget, days) => {
          const prorated = calculateProratedTargets(dailyTarget, days)
          return (
            prorated.protein === dailyTarget.protein * days &&
            prorated.carbs === dailyTarget.carbs * days &&
            prorated.fat === dailyTarget.fat * days &&
            prorated.calories === dailyTarget.calories * days
          )
        }
      )
    )
  })
  
  it('deviation is actual minus target', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (actual, target) => {
          const deviation = actual - target
          return calculateDeviation(
            { protein: actual, carbs: 0, fat: 0, calories: 0 },
            { protein: target, carbs: 0, fat: 0, calories: 0 }
          ).protein === deviation
        }
      )
    )
  })
})
```

## Best Practices

1. **Use prorated targets** - don't compare partial week to full week targets
2. **Start week on Monday** - consistent with fitness industry standard
3. **Cap adherence at 100%** - don't penalize for exceeding targets
4. **Weight protein higher** - 40% for fitness-focused users
5. **Use 5% tolerance** - on-track status prevents anxiety over small deviations
6. **Highlight >10% deviations** - draw attention to significant gaps
7. **Mobile-first scroll** - horizontal cards work better than vertical list
8. **Show current day** - highlight today's card
9. **Include empty days** - show days with no meals as 0%
10. **Cache weekly data** - recalculate only when meals change
