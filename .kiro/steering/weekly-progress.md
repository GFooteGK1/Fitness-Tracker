---
inclusion: fileMatch
fileMatchPattern: '**/{adherence,WeekToDate,DailyBreakdown,DayCard,weekly}/**/*.{ts,tsx}'
---

# Weekly Progress Tracking

## Architecture
```
WeeklyAdherenceView
├── WeekToDateSection (cumulative: actual vs prorated target, deviation, status)
└── DailyBreakdown (horizontal scroll: 7 DayCards with macros, adherence %, deviation)
```

## Core Calculations

**Prorated Targets**: `dailyTarget × daysElapsed` (Monday=1, Sunday=7)

**Cumulative Adherence**: Weighted average - protein 40%, carbs 30%, fat 30% (capped at 100% per macro)

**Deviation**: `actual - proratedTarget` (positive = ahead, negative = behind)

**Tolerance Status**: Within 5% = on-track, >5% = ahead/behind

**Highlight Threshold**: >10% deviation from target

## Key Functions (`app/lib/adherence-calculator.ts`)
- `calculateProratedTargets(dailyTarget, daysElapsed)`
- `getDaysElapsedInWeek(currentDate)` - Returns 1-7 (Mon-Sun)
- `calculateCumulativeTotals(dailyTotals)` - Sum all days
- `calculateDeviation(actual, proratedTarget)`
- `calculateCumulativeAdherence(actual, proratedTarget)`
- `getToleranceStatus(actual, target, tolerancePercent=5)`
- `formatDeviation(value, unit)` - Adds +/- sign

## Color Coding
- **Adherence**: ≥90% green, ≥70% yellow, ≥50% orange, <50% red
- **Status**: on-track green, ahead blue, behind orange
- **Deviation**: >10% highlighted in orange

## API: GET /api/adherence/weekly
**Query**: `?weekStart=YYYY-MM-DD`
**Returns**: `{ weekStart, weekEnd, daysElapsed, targets, dailySummaries, cumulative, proratedTarget, deviation, adherencePercent }`

## Mobile Optimization
- Horizontal scroll container: `overflow-x-auto` with `min-width: max-content`
- Day cards: `min-w-[140px]` for touch-friendly sizing
- Compact macro display: Single line per macro with label abbreviations (P/C/F/Cal)

## Types
```typescript
interface MacroTargets { protein, carbs, fat, calories: number }
interface MacroTotals { protein, carbs, fat, calories: number }
interface MacroDeviation { protein, carbs, fat, calories: number }
interface DayData { date: string, totals: MacroTotals, mealCount: number }
```

## Best Practices
- Use prorated targets (don't compare partial week to full week)
- Week starts Monday (fitness industry standard)
- Cap adherence at 100% (don't penalize exceeding)
- 5% tolerance prevents anxiety over small deviations
- Highlight >10% deviations for attention
- Show empty days as 0% adherence
