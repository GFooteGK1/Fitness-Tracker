/**
 * Property-Based Tests for Adherence Calculator Utility Functions
 * 
 * These tests verify universal properties that should hold across all valid inputs.
 * Using @fast-check/vitest for property-based testing with minimum 100 iterations.
 * 
 * **Validates: Requirements 3.1, 3.3, 3.4, 5.1**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect } from 'vitest'
import { 
  calculateDaysElapsed,
  getAdherenceColor,
  shouldHighlightDeviation
} from '@/app/lib/adherence-calculator'

// Configure minimum 100 iterations for all property tests
const propertyConfig = { numRuns: 100 }

describe('Adherence Calculator Properties', () => {
  
  /**
   * Feature: weekly-progress-tracking, Property 4: Score Color Mapping
   * 
   * *For any* adherence score (0-100+), the color mapping SHALL return:
   * - Green if score ≥ 95
   * - Yellow if 85 ≤ score < 95
   * - Orange if 70 ≤ score < 85
   * - Red if score < 70
   * 
   * **Validates: Requirements 3.1, 3.2**
   */
  test.prop(
    [fc.float({ min: Math.fround(0), max: Math.fround(150), noNaN: true })],
    propertyConfig
  )('Property 4: color mapping is consistent with score thresholds', (score) => {
    const color = getAdherenceColor(score)
    
    if (score >= 95) {
      expect(color).toBe('green')
    } else if (score >= 85) {
      expect(color).toBe('yellow')
    } else if (score >= 70) {
      expect(color).toBe('orange')
    } else {
      expect(color).toBe('red')
    }
  })

  /**
   * Feature: weekly-progress-tracking, Property 4 (additional): Color mapping returns valid colors
   * 
   * For any score, the function should always return one of the four valid colors.
   * 
   * **Validates: Requirements 3.1**
   */
  test.prop(
    [fc.float({ min: Math.fround(-100), max: Math.fround(200), noNaN: true })],
    propertyConfig
  )('Property 4: color mapping always returns a valid color', (score) => {
    const color = getAdherenceColor(score)
    expect(['green', 'yellow', 'orange', 'red']).toContain(color)
  })

  /**
   * Feature: weekly-progress-tracking, Property 5: Deviation Highlighting Threshold
   * 
   * *For any* actual value and target value (>0), the macro SHALL be highlighted 
   * for attention if and only if |actual - target| / target > 0.10 (exceeds 10% deviation).
   * 
   * **Validates: Requirements 3.3, 3.4**
   */
  test.prop(
    [
      fc.float({ min: Math.fround(0), max: Math.fround(1000), noNaN: true }),
      fc.float({ min: Math.fround(1), max: Math.fround(1000), noNaN: true }) // target > 0 to avoid division by zero
    ],
    propertyConfig
  )('Property 5: highlighting threshold is exactly 10%', (actual, target) => {
    const shouldHighlight = shouldHighlightDeviation(actual, target)
    const percentDeviation = Math.abs(actual - target) / target
    
    // Should highlight if deviation exceeds 10%
    expect(shouldHighlight).toBe(percentDeviation > 0.10)
  })

  /**
   * Feature: weekly-progress-tracking, Property 5 (edge case): Zero target handling
   * 
   * When target is zero, the function should return false to avoid division by zero.
   * 
   * **Validates: Requirements 3.3, 3.4**
   */
  test.prop(
    [fc.float({ min: Math.fround(0), max: Math.fround(1000), noNaN: true })],
    propertyConfig
  )('Property 5: zero target returns false (no highlighting)', (actual) => {
    const shouldHighlight = shouldHighlightDeviation(actual, 0)
    expect(shouldHighlight).toBe(false)
  })

  /**
   * Feature: weekly-progress-tracking, Property 6: Days Elapsed Calculation
   * 
   * *For any* week start date (Monday) and current date within or after that week,
   * days elapsed SHALL equal the number of calendar days from week start to current 
   * date (inclusive), capped at 7.
   * 
   * **Validates: Requirements 5.1, 6.2**
   */
  test.prop(
    [fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).filter(d => !isNaN(d.getTime()))],
    propertyConfig
  )('Property 6: days elapsed is always between 1 and 7', (randomDate) => {
    // Normalize to a Monday (week start)
    const monday = new Date(randomDate)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)) // Adjust to Monday
    monday.setHours(0, 0, 0, 0)
    
    // Generate a random offset within the week (0-6 days)
    const daysOffset = Math.floor(Math.random() * 7)
    const testDate = new Date(monday)
    testDate.setDate(monday.getDate() + daysOffset)
    
    const daysElapsed = calculateDaysElapsed(monday, testDate)
    
    // Days elapsed should always be between 1 and 7
    expect(daysElapsed).toBeGreaterThanOrEqual(1)
    expect(daysElapsed).toBeLessThanOrEqual(7)
  })

  /**
   * Feature: weekly-progress-tracking, Property 6 (additional): Days elapsed calculation accuracy
   * 
   * For dates within the same week, days elapsed should equal (daysDiff + 1).
   * 
   * **Validates: Requirements 5.1**
   */
  test.prop(
    [
      fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).filter(d => !isNaN(d.getTime())),
      fc.integer({ min: 0, max: 6 }) // Days offset within week
    ],
    propertyConfig
  )('Property 6: days elapsed equals days difference + 1 (inclusive)', (randomDate, daysOffset) => {
    // Normalize to a Monday (week start)
    const monday = new Date(randomDate)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)
    
    // Create test date with known offset
    const testDate = new Date(monday)
    testDate.setDate(monday.getDate() + daysOffset)
    testDate.setHours(0, 0, 0, 0)
    
    const daysElapsed = calculateDaysElapsed(monday, testDate)
    
    // Days elapsed should be offset + 1 (inclusive of start day)
    expect(daysElapsed).toBe(daysOffset + 1)
  })

  /**
   * Feature: weekly-progress-tracking, Property 6 (edge case): Days beyond week are capped at 7
   * 
   * For dates more than 7 days after week start, days elapsed should be capped at 7.
   * 
   * **Validates: Requirements 5.1**
   */
  test.prop(
    [
      fc.date({ min: new Date('2020-01-01'), max: new Date('2030-06-01') }).filter(d => !isNaN(d.getTime())),
      fc.integer({ min: 7, max: 30 }) // Days offset beyond week
    ],
    propertyConfig
  )('Property 6: days elapsed is capped at 7 for dates beyond week', (randomDate, daysOffset) => {
    // Normalize to a Monday (week start)
    const monday = new Date(randomDate)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)
    
    // Create test date beyond the week
    const testDate = new Date(monday)
    testDate.setDate(monday.getDate() + daysOffset)
    testDate.setHours(0, 0, 0, 0)
    
    const daysElapsed = calculateDaysElapsed(monday, testDate)
    
    // Days elapsed should be capped at 7
    expect(daysElapsed).toBe(7)
  })

  /**
   * Feature: weekly-progress-tracking, Property 6 (edge case): Same day returns 1
   * 
   * When the test date is the same as week start, days elapsed should be 1.
   * 
   * **Validates: Requirements 5.1**
   */
  test.prop(
    [fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).filter(d => !isNaN(d.getTime()))],
    propertyConfig
  )('Property 6: same day as week start returns 1', (randomDate) => {
    // Normalize to a Monday (week start)
    const monday = new Date(randomDate)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)
    
    const daysElapsed = calculateDaysElapsed(monday, monday)
    
    expect(daysElapsed).toBe(1)
  })
})


/**
 * Property-Based Tests for Cumulative Adherence Calculation
 * 
 * These tests verify universal properties for cumulative week-to-date calculations.
 * Using @fast-check/vitest for property-based testing with minimum 100 iterations.
 * 
 * **Validates: Requirements 1.2, 1.3, 1.6, 1.7, 5.2, 6.4, 6.5**
 */

import { 
  calculateCumulativeAdherence,
  isWithinTolerance,
  formatDeviation
} from '@/app/lib/adherence-calculator'
import { DailySummary, DailyTargets } from '@/app/lib/types/food-tracking'

describe('Cumulative Adherence Calculation Properties', () => {

  /**
   * Feature: weekly-progress-tracking, Property 1: Prorated Target Calculation
   * 
   * *For any* daily target value (≥0) and days elapsed (1-7), the prorated target 
   * SHALL equal the daily target multiplied by days elapsed.
   * 
   * **Validates: Requirements 1.2, 1.3**
   */
  test.prop(
    [
      fc.record({
        targetProtein: fc.float({ min: Math.fround(0), max: Math.fround(500), noNaN: true }),
        targetCarbs: fc.float({ min: Math.fround(0), max: Math.fround(500), noNaN: true }),
        targetFat: fc.float({ min: Math.fround(0), max: Math.fround(200), noNaN: true }),
        targetCalories: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }),
        tolerancePct: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true })
      }),
      fc.integer({ min: 1, max: 7 })
    ],
    propertyConfig
  )('Property 1: prorated target equals daily target × days elapsed', (targetValues, daysElapsed) => {
    const targets: DailyTargets = {
      userId: 'test-user',
      targetProtein: targetValues.targetProtein,
      targetCarbs: targetValues.targetCarbs,
      targetFat: targetValues.targetFat,
      targetCalories: targetValues.targetCalories,
      tolerancePct: targetValues.tolerancePct,
      updatedAt: new Date()
    }

    // Empty daily summaries to isolate prorated target calculation
    const dailySummaries: DailySummary[] = []

    const result = calculateCumulativeAdherence(dailySummaries, targets, daysElapsed)

    // Verify prorated targets equal daily × daysElapsed
    expect(result.proratedProteinTarget).toBeCloseTo(targets.targetProtein * daysElapsed, 5)
    expect(result.proratedCarbsTarget).toBeCloseTo(targets.targetCarbs * daysElapsed, 5)
    expect(result.proratedFatTarget).toBeCloseTo(targets.targetFat * daysElapsed, 5)
    expect(result.proratedCaloriesTarget).toBeCloseTo(targets.targetCalories * daysElapsed, 5)
  })

  /**
   * Feature: weekly-progress-tracking, Property 1 (special case): Weekly target when days elapsed = 7
   * 
   * When days elapsed = 7, prorated target equals the full weekly target (daily × 7).
   * 
   * **Validates: Requirements 1.2**
   */
  test.prop(
    [
      fc.record({
        targetProtein: fc.float({ min: Math.fround(0), max: Math.fround(500), noNaN: true }),
        targetCarbs: fc.float({ min: Math.fround(0), max: Math.fround(500), noNaN: true }),
        targetFat: fc.float({ min: Math.fround(0), max: Math.fround(200), noNaN: true }),
        targetCalories: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }),
        tolerancePct: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true })
      })
    ],
    propertyConfig
  )('Property 1: full week (7 days) prorated target equals weekly target', (targetValues) => {
    const targets: DailyTargets = {
      userId: 'test-user',
      targetProtein: targetValues.targetProtein,
      targetCarbs: targetValues.targetCarbs,
      targetFat: targetValues.targetFat,
      targetCalories: targetValues.targetCalories,
      tolerancePct: targetValues.tolerancePct,
      updatedAt: new Date()
    }

    const dailySummaries: DailySummary[] = []
    const daysElapsed = 7

    const result = calculateCumulativeAdherence(dailySummaries, targets, daysElapsed)

    // Weekly target = daily × 7
    expect(result.proratedProteinTarget).toBeCloseTo(targets.targetProtein * 7, 5)
    expect(result.proratedCarbsTarget).toBeCloseTo(targets.targetCarbs * 7, 5)
    expect(result.proratedFatTarget).toBeCloseTo(targets.targetFat * 7, 5)
    expect(result.proratedCaloriesTarget).toBeCloseTo(targets.targetCalories * 7, 5)
  })

  /**
   * Feature: weekly-progress-tracking, Property 2: Tolerance Status Determination
   * 
   * *For any* actual value, target value (>0), and tolerance percentage (0-100), 
   * the tolerance status SHALL be:
   * - "within tolerance" if |actual - target| ≤ (target × tolerancePct / 100)
   * - "over target" if actual > target + (target × tolerancePct / 100)
   * - "under target" if actual < target - (target × tolerancePct / 100)
   * 
   * **Validates: Requirements 1.7, 1.8, 1.9**
   */
  test.prop(
    [
      fc.float({ min: Math.fround(0), max: Math.fround(1000), noNaN: true }),
      fc.float({ min: Math.fround(1), max: Math.fround(1000), noNaN: true }), // target > 0
      fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true })
    ],
    propertyConfig
  )('Property 2: tolerance status is correctly determined', (actual, target, tolerancePct) => {
    const toleranceAmount = target * (tolerancePct / 100)
    const withinTolerance = isWithinTolerance(actual, target, tolerancePct)
    const deviation = actual - target

    if (Math.abs(deviation) <= toleranceAmount) {
      // Within tolerance
      expect(withinTolerance).toBe(true)
    } else if (deviation > toleranceAmount) {
      // Over target (beyond tolerance)
      expect(withinTolerance).toBe(false)
    } else {
      // Under target (beyond tolerance)
      expect(withinTolerance).toBe(false)
    }
  })

  /**
   * Feature: weekly-progress-tracking, Property 2 (boundary): Exact tolerance boundary
   * 
   * When actual equals exactly target ± tolerance amount, it should be within tolerance.
   * Uses values that result in exact floating-point representations to avoid precision issues.
   * 
   * **Validates: Requirements 1.7**
   */
  test.prop(
    [
      fc.constantFrom(100, 200, 400, 500, 800, 1000), // targets that work well with percentages
      fc.constantFrom(10, 20, 25, 50), // tolerancePct values that divide evenly into 100
      fc.boolean() // true = upper bound, false = lower bound
    ],
    propertyConfig
  )('Property 2: exact tolerance boundary is within tolerance', (target, tolerancePct, isUpperBound) => {
    const toleranceAmount = target * (tolerancePct / 100)
    const actual = isUpperBound 
      ? target + toleranceAmount 
      : target - toleranceAmount

    const withinTolerance = isWithinTolerance(actual, target, tolerancePct)
    expect(withinTolerance).toBe(true)
  })

  /**
   * Feature: weekly-progress-tracking, Property 2 (edge case): Zero target handling
   * 
   * When target is zero, within tolerance should return true only if actual is also zero.
   * 
   * **Validates: Requirements 1.7**
   */
  test.prop(
    [
      fc.float({ min: Math.fround(0), max: Math.fround(1000), noNaN: true }),
      fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true })
    ],
    propertyConfig
  )('Property 2: zero target returns true only if actual is zero', (actual, tolerancePct) => {
    const withinTolerance = isWithinTolerance(actual, 0, tolerancePct)
    expect(withinTolerance).toBe(actual === 0)
  })

  /**
   * Feature: weekly-progress-tracking, Property 3: Deviation Calculation and Formatting
   * 
   * *For any* actual value and target value, the deviation SHALL equal (actual - target),
   * and the formatted string SHALL include a "+" prefix for non-negative values.
   * Note: Uses integer values to avoid edge cases where very small negative floats round to 0.
   * 
   * **Validates: Requirements 1.6, 6.5**
   */
  test.prop(
    [
      fc.integer({ min: -1000, max: 1000 }),
      fc.constantFrom('g', '', 'kcal')
    ],
    propertyConfig
  )('Property 3: deviation formatting includes + prefix for non-negative values', (deviation, unit) => {
    const formatted = formatDeviation(deviation, unit)
    const roundedDeviation = Math.round(deviation)
    
    if (roundedDeviation >= 0) {
      expect(formatted.startsWith('+')).toBe(true)
    } else {
      expect(formatted.startsWith('-')).toBe(true)
    }
    
    // Verify the rounded value is in the string
    expect(formatted).toContain(Math.abs(roundedDeviation).toString())
    
    // Verify unit is appended
    expect(formatted.endsWith(unit)).toBe(true)
  })

  /**
   * Feature: weekly-progress-tracking, Property 3 (calculation): Deviation equals actual - target
   * 
   * The deviation calculation in cumulative adherence should equal actual - prorated target.
   * 
   * **Validates: Requirements 6.5**
   */
  test.prop(
    [
      fc.array(
        fc.record({
          totalProtein: fc.float({ min: Math.fround(0), max: Math.fround(200), noNaN: true }),
          totalCarbs: fc.float({ min: Math.fround(0), max: Math.fround(300), noNaN: true }),
          totalFat: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
          totalCalories: fc.float({ min: Math.fround(0), max: Math.fround(3000), noNaN: true })
        }),
        { minLength: 0, maxLength: 7 }
      ),
      fc.record({
        targetProtein: fc.float({ min: Math.fround(1), max: Math.fround(200), noNaN: true }),
        targetCarbs: fc.float({ min: Math.fround(1), max: Math.fround(300), noNaN: true }),
        targetFat: fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }),
        targetCalories: fc.float({ min: Math.fround(1), max: Math.fround(3000), noNaN: true }),
        tolerancePct: fc.float({ min: Math.fround(1), max: Math.fround(50), noNaN: true })
      }),
      fc.integer({ min: 1, max: 7 })
    ],
    propertyConfig
  )('Property 3: deviation equals actual - prorated target', (summaryValues, targetValues, daysElapsed) => {
    const dailySummaries: DailySummary[] = summaryValues.map((s, i) => ({
      userId: 'test-user',
      date: new Date(2025, 0, 20 + i),
      totalProtein: s.totalProtein,
      totalCarbs: s.totalCarbs,
      totalFat: s.totalFat,
      totalCalories: s.totalCalories,
      mealCount: 1
    }))

    const targets: DailyTargets = {
      userId: 'test-user',
      targetProtein: targetValues.targetProtein,
      targetCarbs: targetValues.targetCarbs,
      targetFat: targetValues.targetFat,
      targetCalories: targetValues.targetCalories,
      tolerancePct: targetValues.tolerancePct,
      updatedAt: new Date()
    }

    const result = calculateCumulativeAdherence(dailySummaries, targets, daysElapsed)

    // Deviation = actual - prorated target
    expect(result.proteinDeviation).toBeCloseTo(result.totalProtein - result.proratedProteinTarget, 5)
    expect(result.carbsDeviation).toBeCloseTo(result.totalCarbs - result.proratedCarbsTarget, 5)
    expect(result.fatDeviation).toBeCloseTo(result.totalFat - result.proratedFatTarget, 5)
    expect(result.caloriesDeviation).toBeCloseTo(result.totalCalories - result.proratedCaloriesTarget, 5)
  })

  /**
   * Feature: weekly-progress-tracking, Property 7: Cumulative Totals Summation
   * 
   * *For any* set of daily summaries, the cumulative total for each macro 
   * SHALL equal the sum of that macro across all daily summaries.
   * 
   * **Validates: Requirements 5.2, 6.1**
   */
  test.prop(
    [
      fc.array(
        fc.record({
          totalProtein: fc.float({ min: Math.fround(0), max: Math.fround(200), noNaN: true }),
          totalCarbs: fc.float({ min: Math.fround(0), max: Math.fround(300), noNaN: true }),
          totalFat: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
          totalCalories: fc.float({ min: Math.fround(0), max: Math.fround(3000), noNaN: true })
        }),
        { minLength: 0, maxLength: 7 }
      ),
      fc.integer({ min: 1, max: 7 })
    ],
    propertyConfig
  )('Property 7: cumulative totals equal sum of daily summaries', (summaryValues, daysElapsed) => {
    const dailySummaries: DailySummary[] = summaryValues.map((s, i) => ({
      userId: 'test-user',
      date: new Date(2025, 0, 20 + i),
      totalProtein: s.totalProtein,
      totalCarbs: s.totalCarbs,
      totalFat: s.totalFat,
      totalCalories: s.totalCalories,
      mealCount: 1
    }))

    const targets: DailyTargets = {
      userId: 'test-user',
      targetProtein: 150,
      targetCarbs: 200,
      targetFat: 60,
      targetCalories: 2000,
      tolerancePct: 10,
      updatedAt: new Date()
    }

    const result = calculateCumulativeAdherence(dailySummaries, targets, daysElapsed)

    // Calculate expected sums
    const expectedProtein = summaryValues.reduce((sum, s) => sum + s.totalProtein, 0)
    const expectedCarbs = summaryValues.reduce((sum, s) => sum + s.totalCarbs, 0)
    const expectedFat = summaryValues.reduce((sum, s) => sum + s.totalFat, 0)
    const expectedCalories = summaryValues.reduce((sum, s) => sum + s.totalCalories, 0)

    // Verify cumulative totals equal the sum
    expect(result.totalProtein).toBeCloseTo(expectedProtein, 5)
    expect(result.totalCarbs).toBeCloseTo(expectedCarbs, 5)
    expect(result.totalFat).toBeCloseTo(expectedFat, 5)
    expect(result.totalCalories).toBeCloseTo(expectedCalories, 5)
  })

  /**
   * Feature: weekly-progress-tracking, Property 7 (empty): Empty summaries yield zero totals
   * 
   * When there are no daily summaries, cumulative totals should be zero.
   * 
   * **Validates: Requirements 5.2, 5.3**
   */
  test.prop(
    [fc.integer({ min: 1, max: 7 })],
    propertyConfig
  )('Property 7: empty daily summaries yield zero cumulative totals', (daysElapsed) => {
    const dailySummaries: DailySummary[] = []

    const targets: DailyTargets = {
      userId: 'test-user',
      targetProtein: 150,
      targetCarbs: 200,
      targetFat: 60,
      targetCalories: 2000,
      tolerancePct: 10,
      updatedAt: new Date()
    }

    const result = calculateCumulativeAdherence(dailySummaries, targets, daysElapsed)

    expect(result.totalProtein).toBe(0)
    expect(result.totalCarbs).toBe(0)
    expect(result.totalFat).toBe(0)
    expect(result.totalCalories).toBe(0)
  })

  /**
   * Feature: weekly-progress-tracking, Property 8: Cumulative Adherence Percentage
   * 
   * *For any* cumulative actual total and prorated target (>0), 
   * the adherence percentage SHALL equal (actual / target) × 100.
   * 
   * **Validates: Requirements 6.4**
   */
  test.prop(
    [
      fc.array(
        fc.record({
          totalProtein: fc.float({ min: Math.fround(0), max: Math.fround(200), noNaN: true }),
          totalCarbs: fc.float({ min: Math.fround(0), max: Math.fround(300), noNaN: true }),
          totalFat: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
          totalCalories: fc.float({ min: Math.fround(0), max: Math.fround(3000), noNaN: true })
        }),
        { minLength: 1, maxLength: 7 }
      ),
      fc.record({
        targetProtein: fc.float({ min: Math.fround(1), max: Math.fround(200), noNaN: true }),
        targetCarbs: fc.float({ min: Math.fround(1), max: Math.fround(300), noNaN: true }),
        targetFat: fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }),
        targetCalories: fc.float({ min: Math.fround(1), max: Math.fround(3000), noNaN: true }),
        tolerancePct: fc.float({ min: Math.fround(1), max: Math.fround(50), noNaN: true })
      }),
      fc.integer({ min: 1, max: 7 })
    ],
    propertyConfig
  )('Property 8: adherence percentage equals (actual / prorated target) × 100', (summaryValues, targetValues, daysElapsed) => {
    const dailySummaries: DailySummary[] = summaryValues.map((s, i) => ({
      userId: 'test-user',
      date: new Date(2025, 0, 20 + i),
      totalProtein: s.totalProtein,
      totalCarbs: s.totalCarbs,
      totalFat: s.totalFat,
      totalCalories: s.totalCalories,
      mealCount: 1
    }))

    const targets: DailyTargets = {
      userId: 'test-user',
      targetProtein: targetValues.targetProtein,
      targetCarbs: targetValues.targetCarbs,
      targetFat: targetValues.targetFat,
      targetCalories: targetValues.targetCalories,
      tolerancePct: targetValues.tolerancePct,
      updatedAt: new Date()
    }

    const result = calculateCumulativeAdherence(dailySummaries, targets, daysElapsed)

    // Calculate expected adherence percentages
    const expectedProteinAdherence = (result.totalProtein / result.proratedProteinTarget) * 100
    const expectedCarbsAdherence = (result.totalCarbs / result.proratedCarbsTarget) * 100
    const expectedFatAdherence = (result.totalFat / result.proratedFatTarget) * 100
    const expectedCaloriesAdherence = (result.totalCalories / result.proratedCaloriesTarget) * 100

    // Verify adherence percentages
    expect(result.proteinAdherence).toBeCloseTo(expectedProteinAdherence, 5)
    expect(result.carbsAdherence).toBeCloseTo(expectedCarbsAdherence, 5)
    expect(result.fatAdherence).toBeCloseTo(expectedFatAdherence, 5)
    expect(result.caloriesAdherence).toBeCloseTo(expectedCaloriesAdherence, 5)
  })

  /**
   * Feature: weekly-progress-tracking, Property 8 (edge case): Zero prorated target yields zero adherence
   * 
   * When prorated target is zero (due to zero daily target), adherence should be 0%.
   * 
   * **Validates: Requirements 6.4**
   */
  test.prop(
    [
      fc.array(
        fc.record({
          totalProtein: fc.float({ min: Math.fround(0), max: Math.fround(200), noNaN: true }),
          totalCarbs: fc.float({ min: Math.fround(0), max: Math.fround(300), noNaN: true }),
          totalFat: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
          totalCalories: fc.float({ min: Math.fround(0), max: Math.fround(3000), noNaN: true })
        }),
        { minLength: 1, maxLength: 7 }
      ),
      fc.integer({ min: 1, max: 7 })
    ],
    propertyConfig
  )('Property 8: zero prorated target yields zero adherence percentage', (summaryValues, daysElapsed) => {
    const dailySummaries: DailySummary[] = summaryValues.map((s, i) => ({
      userId: 'test-user',
      date: new Date(2025, 0, 20 + i),
      totalProtein: s.totalProtein,
      totalCarbs: s.totalCarbs,
      totalFat: s.totalFat,
      totalCalories: s.totalCalories,
      mealCount: 1
    }))

    // Zero targets
    const targets: DailyTargets = {
      userId: 'test-user',
      targetProtein: 0,
      targetCarbs: 0,
      targetFat: 0,
      targetCalories: 0,
      tolerancePct: 10,
      updatedAt: new Date()
    }

    const result = calculateCumulativeAdherence(dailySummaries, targets, daysElapsed)

    // Zero target should yield zero adherence (safe division)
    expect(result.proteinAdherence).toBe(0)
    expect(result.carbsAdherence).toBe(0)
    expect(result.fatAdherence).toBe(0)
    expect(result.caloriesAdherence).toBe(0)
  })

  /**
   * Feature: weekly-progress-tracking, Property 8 (100% adherence): Perfect adherence
   * 
   * When actual equals prorated target exactly, adherence should be 100%.
   * 
   * **Validates: Requirements 6.4**
   */
  test.prop(
    [
      fc.record({
        targetProtein: fc.float({ min: Math.fround(1), max: Math.fround(200), noNaN: true }),
        targetCarbs: fc.float({ min: Math.fround(1), max: Math.fround(300), noNaN: true }),
        targetFat: fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }),
        targetCalories: fc.float({ min: Math.fround(1), max: Math.fround(3000), noNaN: true }),
        tolerancePct: fc.float({ min: Math.fround(1), max: Math.fround(50), noNaN: true })
      }),
      fc.integer({ min: 1, max: 7 })
    ],
    propertyConfig
  )('Property 8: exact match yields 100% adherence', (targetValues, daysElapsed) => {
    // Create daily summaries that exactly match daily targets
    const dailySummaries: DailySummary[] = Array.from({ length: daysElapsed }, (_, i) => ({
      userId: 'test-user',
      date: new Date(2025, 0, 20 + i),
      totalProtein: targetValues.targetProtein,
      totalCarbs: targetValues.targetCarbs,
      totalFat: targetValues.targetFat,
      totalCalories: targetValues.targetCalories,
      mealCount: 1
    }))

    const targets: DailyTargets = {
      userId: 'test-user',
      targetProtein: targetValues.targetProtein,
      targetCarbs: targetValues.targetCarbs,
      targetFat: targetValues.targetFat,
      targetCalories: targetValues.targetCalories,
      tolerancePct: targetValues.tolerancePct,
      updatedAt: new Date()
    }

    const result = calculateCumulativeAdherence(dailySummaries, targets, daysElapsed)

    // When actual = prorated target, adherence should be 100%
    expect(result.proteinAdherence).toBeCloseTo(100, 5)
    expect(result.carbsAdherence).toBeCloseTo(100, 5)
    expect(result.fatAdherence).toBeCloseTo(100, 5)
    expect(result.caloriesAdherence).toBeCloseTo(100, 5)
  })
})
