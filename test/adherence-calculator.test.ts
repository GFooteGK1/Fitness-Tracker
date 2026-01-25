/**
 * Unit Tests for Adherence Calculator Functions
 * 
 * Tests for calculateCumulativeAdherence, isWithinTolerance, and determineOverallStatus
 * 
 * **Validates: Requirements 1.2, 1.3, 1.7, 1.8, 1.9, 5.2, 5.3, 6.4**
 */

import { describe, it, expect } from 'vitest'
import { 
  calculateCumulativeAdherence,
  isWithinTolerance,
  determineOverallStatus
} from '@/app/lib/adherence-calculator'
import { DailySummary, DailyTargets, CumulativeAdherenceData } from '@/app/lib/types/food-tracking'

// Helper to create a mock DailySummary
function createDailySummary(overrides: Partial<DailySummary> = {}): DailySummary {
  return {
    userId: 'test-user',
    date: new Date('2025-01-20'),
    totalProtein: 150,
    totalCarbs: 200,
    totalFat: 60,
    totalCalories: 2000,
    mealCount: 3,
    ...overrides
  }
}

// Helper to create mock DailyTargets
function createDailyTargets(overrides: Partial<DailyTargets> = {}): DailyTargets {
  return {
    userId: 'test-user',
    targetProtein: 150,
    targetCarbs: 200,
    targetFat: 60,
    targetCalories: 2000,
    tolerancePct: 10,
    updatedAt: new Date(),
    ...overrides
  }
}

describe('isWithinTolerance', () => {
  it('should return true when actual equals target', () => {
    expect(isWithinTolerance(100, 100, 10)).toBe(true)
  })

  it('should return true when actual is within positive tolerance', () => {
    // 10% of 100 = 10, so 110 is exactly at the boundary
    expect(isWithinTolerance(110, 100, 10)).toBe(true)
    expect(isWithinTolerance(105, 100, 10)).toBe(true)
  })

  it('should return true when actual is within negative tolerance', () => {
    // 10% of 100 = 10, so 90 is exactly at the boundary
    expect(isWithinTolerance(90, 100, 10)).toBe(true)
    expect(isWithinTolerance(95, 100, 10)).toBe(true)
  })

  it('should return false when actual exceeds positive tolerance', () => {
    expect(isWithinTolerance(111, 100, 10)).toBe(false)
    expect(isWithinTolerance(150, 100, 10)).toBe(false)
  })

  it('should return false when actual is below negative tolerance', () => {
    expect(isWithinTolerance(89, 100, 10)).toBe(false)
    expect(isWithinTolerance(50, 100, 10)).toBe(false)
  })

  it('should handle zero target correctly', () => {
    expect(isWithinTolerance(0, 0, 10)).toBe(true)
    expect(isWithinTolerance(5, 0, 10)).toBe(false)
  })

  it('should handle zero tolerance', () => {
    expect(isWithinTolerance(100, 100, 0)).toBe(true)
    expect(isWithinTolerance(101, 100, 0)).toBe(false)
    expect(isWithinTolerance(99, 100, 0)).toBe(false)
  })
})

describe('determineOverallStatus', () => {
  it('should return on-track when average adherence is within tolerance of 100%', () => {
    const data: CumulativeAdherenceData = {
      totalProtein: 150,
      totalCarbs: 200,
      totalFat: 60,
      totalCalories: 2000,
      proratedProteinTarget: 150,
      proratedCarbsTarget: 200,
      proratedFatTarget: 60,
      proratedCaloriesTarget: 2000,
      proteinAdherence: 100,
      carbsAdherence: 100,
      fatAdherence: 100,
      caloriesAdherence: 100,
      proteinWithinTolerance: true,
      carbsWithinTolerance: true,
      fatWithinTolerance: true,
      caloriesWithinTolerance: true,
      proteinDeviation: 0,
      carbsDeviation: 0,
      fatDeviation: 0,
      caloriesDeviation: 0,
      overallStatus: 'on-track'
    }
    
    expect(determineOverallStatus(data, 10)).toBe('on-track')
  })

  it('should return ahead when average adherence exceeds upper tolerance', () => {
    const data: CumulativeAdherenceData = {
      totalProtein: 180,
      totalCarbs: 240,
      totalFat: 72,
      totalCalories: 2400,
      proratedProteinTarget: 150,
      proratedCarbsTarget: 200,
      proratedFatTarget: 60,
      proratedCaloriesTarget: 2000,
      proteinAdherence: 120,
      carbsAdherence: 120,
      fatAdherence: 120,
      caloriesAdherence: 120,
      proteinWithinTolerance: false,
      carbsWithinTolerance: false,
      fatWithinTolerance: false,
      caloriesWithinTolerance: false,
      proteinDeviation: 30,
      carbsDeviation: 40,
      fatDeviation: 12,
      caloriesDeviation: 400,
      overallStatus: 'on-track'
    }
    
    expect(determineOverallStatus(data, 10)).toBe('ahead')
  })

  it('should return behind when average adherence is below lower tolerance', () => {
    const data: CumulativeAdherenceData = {
      totalProtein: 120,
      totalCarbs: 160,
      totalFat: 48,
      totalCalories: 1600,
      proratedProteinTarget: 150,
      proratedCarbsTarget: 200,
      proratedFatTarget: 60,
      proratedCaloriesTarget: 2000,
      proteinAdherence: 80,
      carbsAdherence: 80,
      fatAdherence: 80,
      caloriesAdherence: 80,
      proteinWithinTolerance: false,
      carbsWithinTolerance: false,
      fatWithinTolerance: false,
      caloriesWithinTolerance: false,
      proteinDeviation: -30,
      carbsDeviation: -40,
      fatDeviation: -12,
      caloriesDeviation: -400,
      overallStatus: 'on-track'
    }
    
    expect(determineOverallStatus(data, 10)).toBe('behind')
  })
})

describe('calculateCumulativeAdherence', () => {
  it('should calculate correct cumulative totals from daily summaries', () => {
    const summaries: DailySummary[] = [
      createDailySummary({ totalProtein: 140, totalCarbs: 190, totalFat: 55, totalCalories: 1900 }),
      createDailySummary({ totalProtein: 160, totalCarbs: 210, totalFat: 65, totalCalories: 2100 })
    ]
    const targets = createDailyTargets()
    
    const result = calculateCumulativeAdherence(summaries, targets, 2)
    
    // Sum of totals
    expect(result.totalProtein).toBe(300) // 140 + 160
    expect(result.totalCarbs).toBe(400) // 190 + 210
    expect(result.totalFat).toBe(120) // 55 + 65
    expect(result.totalCalories).toBe(4000) // 1900 + 2100
  })

  it('should calculate correct prorated targets based on days elapsed', () => {
    const summaries: DailySummary[] = [createDailySummary()]
    const targets = createDailyTargets()
    
    const result = calculateCumulativeAdherence(summaries, targets, 3)
    
    // Prorated = daily × daysElapsed
    expect(result.proratedProteinTarget).toBe(450) // 150 × 3
    expect(result.proratedCarbsTarget).toBe(600) // 200 × 3
    expect(result.proratedFatTarget).toBe(180) // 60 × 3
    expect(result.proratedCaloriesTarget).toBe(6000) // 2000 × 3
  })

  it('should calculate correct adherence percentages', () => {
    const summaries: DailySummary[] = [
      createDailySummary({ totalProtein: 150, totalCarbs: 200, totalFat: 60, totalCalories: 2000 })
    ]
    const targets = createDailyTargets()
    
    const result = calculateCumulativeAdherence(summaries, targets, 1)
    
    // 100% adherence when actual equals target
    expect(result.proteinAdherence).toBe(100)
    expect(result.carbsAdherence).toBe(100)
    expect(result.fatAdherence).toBe(100)
    expect(result.caloriesAdherence).toBe(100)
  })

  it('should calculate correct deviations', () => {
    const summaries: DailySummary[] = [
      createDailySummary({ totalProtein: 160, totalCarbs: 180, totalFat: 70, totalCalories: 2100 })
    ]
    const targets = createDailyTargets()
    
    const result = calculateCumulativeAdherence(summaries, targets, 1)
    
    // Deviation = actual - prorated target
    expect(result.proteinDeviation).toBe(10) // 160 - 150
    expect(result.carbsDeviation).toBe(-20) // 180 - 200
    expect(result.fatDeviation).toBe(10) // 70 - 60
    expect(result.caloriesDeviation).toBe(100) // 2100 - 2000
  })

  it('should determine tolerance status correctly', () => {
    const summaries: DailySummary[] = [
      createDailySummary({ totalProtein: 155, totalCarbs: 180, totalFat: 60, totalCalories: 2000 })
    ]
    const targets = createDailyTargets({ tolerancePct: 10 })
    
    const result = calculateCumulativeAdherence(summaries, targets, 1)
    
    // Protein: 155 vs 150, deviation = 5, tolerance = 15 (10% of 150) → within
    expect(result.proteinWithinTolerance).toBe(true)
    // Carbs: 180 vs 200, deviation = -20, tolerance = 20 (10% of 200) → within (exactly at boundary)
    expect(result.carbsWithinTolerance).toBe(true)
    // Fat: 60 vs 60, deviation = 0 → within
    expect(result.fatWithinTolerance).toBe(true)
    // Calories: 2000 vs 2000, deviation = 0 → within
    expect(result.caloriesWithinTolerance).toBe(true)
  })

  it('should handle zero days elapsed edge case', () => {
    const summaries: DailySummary[] = [createDailySummary()]
    const targets = createDailyTargets()
    
    const result = calculateCumulativeAdherence(summaries, targets, 0)
    
    expect(result.totalProtein).toBe(0)
    expect(result.proratedProteinTarget).toBe(0)
    expect(result.proteinAdherence).toBe(0)
    expect(result.overallStatus).toBe('on-track')
  })

  it('should handle empty daily summaries (no logged days)', () => {
    const summaries: DailySummary[] = []
    const targets = createDailyTargets()
    
    const result = calculateCumulativeAdherence(summaries, targets, 3)
    
    // No data logged, so totals are 0
    expect(result.totalProtein).toBe(0)
    expect(result.totalCarbs).toBe(0)
    expect(result.totalFat).toBe(0)
    expect(result.totalCalories).toBe(0)
    
    // Prorated targets still calculated
    expect(result.proratedProteinTarget).toBe(450)
    
    // Adherence is 0% (0 / 450 × 100)
    expect(result.proteinAdherence).toBe(0)
    
    // Status should be behind (0% adherence)
    expect(result.overallStatus).toBe('behind')
  })

  it('should handle zero targets edge case', () => {
    const summaries: DailySummary[] = [createDailySummary({ totalProtein: 100, totalCarbs: 100, totalFat: 50, totalCalories: 1500 })]
    const targets = createDailyTargets({
      targetProtein: 0,
      targetCarbs: 0,
      targetFat: 0,
      targetCalories: 0
    })
    
    const result = calculateCumulativeAdherence(summaries, targets, 1)
    
    // Prorated targets are 0 (0 × 1)
    expect(result.proratedProteinTarget).toBe(0)
    expect(result.proratedCarbsTarget).toBe(0)
    expect(result.proratedFatTarget).toBe(0)
    expect(result.proratedCaloriesTarget).toBe(0)
    
    // Adherence should be 0 (safe division by zero returns 0)
    expect(result.proteinAdherence).toBe(0)
    expect(result.carbsAdherence).toBe(0)
    expect(result.fatAdherence).toBe(0)
    expect(result.caloriesAdherence).toBe(0)
    
    // Should not throw or return NaN
    expect(Number.isNaN(result.proteinAdherence)).toBe(false)
    expect(Number.isNaN(result.carbsAdherence)).toBe(false)
    
    // Totals should still be calculated from summaries
    expect(result.totalProtein).toBe(100)
    expect(result.totalCarbs).toBe(100)
  })

  it('should calculate overall status correctly', () => {
    const summaries: DailySummary[] = [
      createDailySummary({ totalProtein: 150, totalCarbs: 200, totalFat: 60, totalCalories: 2000 })
    ]
    const targets = createDailyTargets({ tolerancePct: 10 })
    
    const result = calculateCumulativeAdherence(summaries, targets, 1)
    
    // 100% adherence across all macros → on-track
    expect(result.overallStatus).toBe('on-track')
  })

  it('should return behind status when significantly under target', () => {
    const summaries: DailySummary[] = [
      createDailySummary({ totalProtein: 75, totalCarbs: 100, totalFat: 30, totalCalories: 1000 })
    ]
    const targets = createDailyTargets({ tolerancePct: 10 })
    
    const result = calculateCumulativeAdherence(summaries, targets, 1)
    
    // 50% adherence across all macros → behind
    expect(result.overallStatus).toBe('behind')
  })

  it('should return ahead status when significantly over target', () => {
    const summaries: DailySummary[] = [
      createDailySummary({ totalProtein: 225, totalCarbs: 300, totalFat: 90, totalCalories: 3000 })
    ]
    const targets = createDailyTargets({ tolerancePct: 10 })
    
    const result = calculateCumulativeAdherence(summaries, targets, 1)
    
    // 150% adherence across all macros → ahead
    expect(result.overallStatus).toBe('ahead')
  })
})
