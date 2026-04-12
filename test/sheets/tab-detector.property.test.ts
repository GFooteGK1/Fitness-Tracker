/**
 * Property-Based Tests for Tab Detector
 * 
 * These tests verify universal properties that should hold across all valid inputs.
 * Using @fast-check/vitest for property-based testing with minimum 100 iterations.
 * 
 * Feature: dynamic-sheet-tab-detection
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect } from 'vitest'
import { selectBestTab } from '@/app/lib/sheets/tab-detector'
import type { SheetTab } from '@/app/lib/sheets/types'

// Configure minimum 100 iterations for all property tests
const propertyConfig = { numRuns: 100 }

// Month names for generating test data
const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const ABBREV_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

/**
 * Arbitrary generator for SheetTab with a specific month/year in the title
 */
const tabWithDate = (month: number, year: number, index: number): fc.Arbitrary<SheetTab> => {
  return fc.constantFrom(
    // Pattern 1: "Month YYYY" (confidence 1.0)
    {
      sheetId: Math.floor(Math.random() * 1000000),
      title: `${FULL_MONTH_NAMES[month - 1]} ${year}`,
      index
    },
    // Pattern 2: "Mon YYYY" (confidence 0.95)
    {
      sheetId: Math.floor(Math.random() * 1000000),
      title: `${ABBREV_MONTH_NAMES[month - 1]} ${year}`,
      index
    },
    // Pattern 3: "YYYY-MM" (confidence 0.9)
    {
      sheetId: Math.floor(Math.random() * 1000000),
      title: `${year}-${month.toString().padStart(2, '0')}`,
      index
    },
    // Pattern 4: "MM/YYYY" (confidence 0.85)
    {
      sheetId: Math.floor(Math.random() * 1000000),
      title: `${month.toString().padStart(2, '0')}/${year}`,
      index
    }
  )
}

/**
 * Arbitrary generator for SheetTab with a different month/year
 */
const tabWithDifferentDate = (
  excludeMonth: number,
  excludeYear: number,
  index: number
): fc.Arbitrary<SheetTab> => {
  return fc.record({
    month: fc.integer({ min: 1, max: 12 }),
    year: fc.integer({ min: 2020, max: 2030 })
  })
    .filter(({ month, year }) => month !== excludeMonth || year !== excludeYear)
    .chain(({ month, year }) => tabWithDate(month, year, index))
}

/**
 * Arbitrary generator for SheetTab without a date
 */
const tabWithoutDate = (index: number): fc.Arbitrary<SheetTab> => {
  return fc.constantFrom(
    'Sheet1', 'Sheet2', 'Data', 'Summary', 'Report',
    'Main', 'Backup', 'Archive', 'Template', 'Example',
    'Q1', 'Q2', 'Week 1', 'Tab A', 'Untitled'
  ).map(title => ({
    sheetId: Math.floor(Math.random() * 1000000),
    title,
    index
  }))
}

describe('Tab Detector - Property Tests', () => {

  /**
   * Feature: dynamic-sheet-tab-detection, Property 4: Current month tab selection
   * 
   * *For any* set of tabs where at least one tab matches the current month and year,
   * the Tab_Detector should select a tab matching the current month (not a past or
   * future month).
   * 
   * **Validates: Requirements 3.1**
   */

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }), // currentYear
      fc.integer({ min: 0, max: 5 }), // number of tabs before current month tab
      fc.integer({ min: 0, max: 5 })  // number of tabs after current month tab
    ],
    propertyConfig
  )('Property 4.1: selects current month tab when present among other tabs', 
    (currentMonth, currentYear, numBefore, numAfter) => {
    // Generate tabs before the current month tab (different dates)
    const tabsBefore: SheetTab[] = []
    for (let i = 0; i < numBefore; i++) {
      const month = ((currentMonth - numBefore + i - 1 + 12) % 12) + 1
      const year = month > currentMonth ? currentYear - 1 : currentYear
      tabsBefore.push({
        sheetId: 1000 + i,
        title: `${FULL_MONTH_NAMES[month - 1]} ${year}`,
        index: i
      })
    }
    
    // Generate current month tab
    const currentMonthTab: SheetTab = {
      sheetId: 5000,
      title: `${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear}`,
      index: numBefore
    }
    
    // Generate tabs after the current month tab (different dates)
    const tabsAfter: SheetTab[] = []
    for (let i = 0; i < numAfter; i++) {
      const month = ((currentMonth + i) % 12) + 1
      const year = month < currentMonth ? currentYear + 1 : currentYear
      tabsAfter.push({
        sheetId: 6000 + i,
        title: `${FULL_MONTH_NAMES[month - 1]} ${year}`,
        index: numBefore + 1 + i
      })
    }
    
    const allTabs = [...tabsBefore, currentMonthTab, ...tabsAfter]
    
    const result = selectBestTab(allTabs, currentMonth, currentYear)
    
    // Should select the current month tab
    expect(result.isFallback).toBe(false)
    expect(result.detectedDate).toBeDefined()
    expect(result.detectedDate!.month).toBe(currentMonth)
    expect(result.detectedDate!.year).toBe(currentYear)
    expect(result.sheetGid).toBe(currentMonthTab.sheetId.toString())
  })

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }), // currentYear
      fc.integer({ min: 1, max: 10 }) // number of non-current-month tabs
    ],
    propertyConfig
  )('Property 4.2: selects current month tab even with many other dated tabs', 
    (currentMonth, currentYear, numOtherTabs) => {
    // Generate current month tab at a random position
    const currentMonthIndex = Math.floor(Math.random() * (numOtherTabs + 1))
    
    const tabs: SheetTab[] = []
    let tabIndex = 0
    
    // Add tabs before current month tab
    for (let i = 0; i < currentMonthIndex; i++) {
      // Generate past or future months (not current)
      const monthOffset = i < currentMonthIndex / 2 ? -(i + 1) : (i + 1)
      let month = currentMonth + monthOffset
      let year = currentYear
      
      // Handle month overflow/underflow
      while (month < 1) {
        month += 12
        year -= 1
      }
      while (month > 12) {
        month -= 12
        year += 1
      }
      
      tabs.push({
        sheetId: 1000 + i,
        title: `${FULL_MONTH_NAMES[month - 1]} ${year}`,
        index: tabIndex++
      })
    }
    
    // Add current month tab
    const currentMonthTab: SheetTab = {
      sheetId: 5000,
      title: `${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear}`,
      index: tabIndex++
    }
    tabs.push(currentMonthTab)
    
    // Add tabs after current month tab
    for (let i = currentMonthIndex; i < numOtherTabs; i++) {
      const monthOffset = (i - currentMonthIndex + 1)
      let month = currentMonth + monthOffset
      let year = currentYear
      
      while (month > 12) {
        month -= 12
        year += 1
      }
      
      tabs.push({
        sheetId: 6000 + i,
        title: `${FULL_MONTH_NAMES[month - 1]} ${year}`,
        index: tabIndex++
      })
    }
    
    const result = selectBestTab(tabs, currentMonth, currentYear)
    
    // Should select the current month tab, not past or future months
    expect(result.isFallback).toBe(false)
    expect(result.detectedDate).toBeDefined()
    expect(result.detectedDate!.month).toBe(currentMonth)
    expect(result.detectedDate!.year).toBe(currentYear)
    expect(result.sheetGid).toBe(currentMonthTab.sheetId.toString())
  })

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }), // currentYear
      fc.integer({ min: 0, max: 5 }) // number of non-dated tabs
    ],
    propertyConfig
  )('Property 4.3: selects current month tab when mixed with non-dated tabs', 
    (currentMonth, currentYear, numNonDatedTabs) => {
    const tabs: SheetTab[] = []
    
    // Add some non-dated tabs
    for (let i = 0; i < numNonDatedTabs; i++) {
      tabs.push({
        sheetId: 1000 + i,
        title: `Sheet${i + 1}`,
        index: i
      })
    }
    
    // Add current month tab
    const currentMonthTab: SheetTab = {
      sheetId: 5000,
      title: `${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear}`,
      index: numNonDatedTabs
    }
    tabs.push(currentMonthTab)
    
    // Add more non-dated tabs
    for (let i = 0; i < numNonDatedTabs; i++) {
      tabs.push({
        sheetId: 2000 + i,
        title: `Data${i + 1}`,
        index: numNonDatedTabs + 1 + i
      })
    }
    
    const result = selectBestTab(tabs, currentMonth, currentYear)
    
    // Should select the current month tab, ignoring non-dated tabs
    expect(result.isFallback).toBe(false)
    expect(result.detectedDate).toBeDefined()
    expect(result.detectedDate!.month).toBe(currentMonth)
    expect(result.detectedDate!.year).toBe(currentYear)
    expect(result.sheetGid).toBe(currentMonthTab.sheetId.toString())
  })

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }), // currentYear
      fc.constantFrom('Month YYYY', 'Mon YYYY', 'YYYY-MM', 'MM/YYYY') // format
    ],
    propertyConfig
  )('Property 4.4: selects current month tab regardless of date format', 
    (currentMonth, currentYear, format) => {
    let currentMonthTitle: string
    
    switch (format) {
      case 'Month YYYY':
        currentMonthTitle = `${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear}`
        break
      case 'Mon YYYY':
        currentMonthTitle = `${ABBREV_MONTH_NAMES[currentMonth - 1]} ${currentYear}`
        break
      case 'YYYY-MM':
        currentMonthTitle = `${currentYear}-${currentMonth.toString().padStart(2, '0')}`
        break
      case 'MM/YYYY':
        currentMonthTitle = `${currentMonth.toString().padStart(2, '0')}/${currentYear}`
        break
      default:
        currentMonthTitle = `${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear}`
    }
    
    // Use a future month that cannot collide with the current month.
    // Pick a month+year that is guaranteed different from currentMonth/currentYear.
    const futureMonth = (currentMonth % 12) + 1 // Next month (wraps 12→1)
    const futureYear = futureMonth <= currentMonth ? currentYear + 1 : currentYear

    const tabs: SheetTab[] = [
      {
        sheetId: 1000,
        title: 'January 2019', // Past month (guaranteed different)
        index: 0
      },
      {
        sheetId: 5000,
        title: currentMonthTitle, // Current month in specified format
        index: 1
      },
      {
        sheetId: 2000,
        title: `${FULL_MONTH_NAMES[futureMonth - 1]} ${futureYear}`, // Future month (no collision)
        index: 2
      }
    ]

    const result = selectBestTab(tabs, currentMonth, currentYear)

    // Should select the current month tab regardless of format
    expect(result.isFallback).toBe(false)
    expect(result.detectedDate).toBeDefined()
    expect(result.detectedDate!.month).toBe(currentMonth)
    expect(result.detectedDate!.year).toBe(currentYear)
    expect(result.sheetGid).toBe('5000')
  })

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }), // currentYear
      fc.integer({ min: 1, max: 5 }) // years in the past
    ],
    propertyConfig
  )('Property 4.5: prefers current month over same month in past years', 
    (currentMonth, currentYear, yearsInPast) => {
    const tabs: SheetTab[] = []
    
    // Add tabs for the same month in past years
    for (let i = 1; i <= yearsInPast; i++) {
      tabs.push({
        sheetId: 1000 + i,
        title: `${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear - i}`,
        index: i - 1
      })
    }
    
    // Add current month/year tab
    const currentMonthTab: SheetTab = {
      sheetId: 5000,
      title: `${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear}`,
      index: yearsInPast
    }
    tabs.push(currentMonthTab)
    
    const result = selectBestTab(tabs, currentMonth, currentYear)
    
    // Should select current year, not past years
    expect(result.isFallback).toBe(false)
    expect(result.detectedDate).toBeDefined()
    expect(result.detectedDate!.month).toBe(currentMonth)
    expect(result.detectedDate!.year).toBe(currentYear)
    expect(result.sheetGid).toBe(currentMonthTab.sheetId.toString())
  })

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }), // currentYear
      fc.integer({ min: 1, max: 5 }) // years in the future
    ],
    propertyConfig
  )('Property 4.6: prefers current month over same month in future years', 
    (currentMonth, currentYear, yearsInFuture) => {
    const tabs: SheetTab[] = []
    
    // Add current month/year tab
    const currentMonthTab: SheetTab = {
      sheetId: 5000,
      title: `${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear}`,
      index: 0
    }
    tabs.push(currentMonthTab)
    
    // Add tabs for the same month in future years
    for (let i = 1; i <= yearsInFuture; i++) {
      tabs.push({
        sheetId: 1000 + i,
        title: `${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear + i}`,
        index: i
      })
    }
    
    const result = selectBestTab(tabs, currentMonth, currentYear)
    
    // Should select current year, not future years
    expect(result.isFallback).toBe(false)
    expect(result.detectedDate).toBeDefined()
    expect(result.detectedDate!.month).toBe(currentMonth)
    expect(result.detectedDate!.year).toBe(currentYear)
    expect(result.sheetGid).toBe(currentMonthTab.sheetId.toString())
  })

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }) // currentYear
    ],
    propertyConfig
  )('Property 4.7: never selects fallback when current month tab exists', 
    (currentMonth, currentYear) => {
    // Create a mix of tabs including current month
    const tabs: SheetTab[] = [
      {
        sheetId: 1000,
        title: 'Sheet1', // Non-dated
        index: 0
      },
      {
        sheetId: 2000,
        title: `${FULL_MONTH_NAMES[(currentMonth % 12)]} ${currentYear}`, // Next month
        index: 1
      },
      {
        sheetId: 5000,
        title: `${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear}`, // Current month
        index: 2
      },
      {
        sheetId: 3000,
        title: `${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear - 1}`, // Same month, past year
        index: 3
      }
    ]
    
    const result = selectBestTab(tabs, currentMonth, currentYear)
    
    // Should NOT use fallback when current month exists
    expect(result.isFallback).toBe(false)
    expect(result.warning).toBeUndefined()
    expect(result.detectedDate).toBeDefined()
    expect(result.detectedDate!.month).toBe(currentMonth)
    expect(result.detectedDate!.year).toBe(currentYear)
  })

  /**
   * Feature: dynamic-sheet-tab-detection, Property 5: Highest confidence selection with tiebreaker
   * 
   * *For any* set of tabs with multiple tabs matching the current month, the Tab_Detector
   * should select the tab with the highest confidence score, and if multiple tabs have equal
   * confidence, it should select the tab with the highest index (rightmost).
   * 
   * **Validates: Requirements 3.3, 3.4**
   */

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }) // currentYear
    ],
    propertyConfig
  )('Property 5.1: selects highest confidence when multiple current month tabs exist', 
    (currentMonth, currentYear) => {
    const tabs: SheetTab[] = [
      {
        sheetId: 1000,
        title: `${currentMonth.toString().padStart(2, '0')}/${currentYear}`, // MM/YYYY (confidence 0.85)
        index: 0
      },
      {
        sheetId: 2000,
        title: `${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear}`, // Month YYYY (confidence 1.0)
        index: 1
      },
      {
        sheetId: 3000,
        title: `${currentYear}-${currentMonth.toString().padStart(2, '0')}`, // YYYY-MM (confidence 0.9)
        index: 2
      }
    ]
    
    const result = selectBestTab(tabs, currentMonth, currentYear)
    
    // Should select the tab with highest confidence (Month YYYY = 1.0)
    expect(result.sheetGid).toBe('2000')
    expect(result.confidence).toBe(1.0)
    expect(result.isFallback).toBe(false)
  })

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }), // currentYear
      fc.integer({ min: 2, max: 5 }) // number of tabs with same confidence
    ],
    propertyConfig
  )('Property 5.2: uses index as tiebreaker when confidence scores are equal', 
    (currentMonth, currentYear, numTabs) => {
    // Create multiple tabs with same format (same confidence)
    const tabs: SheetTab[] = []
    for (let i = 0; i < numTabs; i++) {
      tabs.push({
        sheetId: 1000 + i,
        title: `${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear}`, // All same format
        index: i
      })
    }
    
    const result = selectBestTab(tabs, currentMonth, currentYear)
    
    // Should select the rightmost tab (highest index)
    expect(result.sheetGid).toBe((1000 + numTabs - 1).toString())
    expect(result.tabName).toBe(`${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear}`)
    expect(result.isFallback).toBe(false)
  })

  test.prop(
    [
      // Exclude month 5 (May) because "May" is both full and abbreviated form,
      // so it matches "Month YYYY" (confidence 1.0) instead of "Mon YYYY" (0.95).
      fc.constantFrom(1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12), // currentMonth (not May)
      fc.integer({ min: 2020, max: 2030 }) // currentYear
    ],
    propertyConfig
  )('Property 5.3: prefers higher confidence over higher index',
    (currentMonth, currentYear) => {
    const tabs: SheetTab[] = [
      {
        sheetId: 1000,
        title: `${ABBREV_MONTH_NAMES[currentMonth - 1]} ${currentYear}`, // Mon YYYY (confidence 0.95)
        index: 0
      },
      {
        sheetId: 2000,
        title: `${currentYear}-${currentMonth.toString().padStart(2, '0')}`, // YYYY-MM (confidence 0.9)
        index: 1
      },
      {
        sheetId: 3000,
        title: `${currentMonth.toString().padStart(2, '0')}/${currentYear}`, // MM/YYYY (confidence 0.85)
        index: 2 // Highest index but lowest confidence
      }
    ]

    const result = selectBestTab(tabs, currentMonth, currentYear)

    // Should select highest confidence (0.95), not highest index
    expect(result.sheetGid).toBe('1000')
    expect(result.confidence).toBe(0.95)
    expect(result.isFallback).toBe(false)
  })

  /**
   * Feature: dynamic-sheet-tab-detection, Property 6: Fallback to most recent dated tab
   * 
   * *For any* set of tabs where no tab matches the current month but at least one tab
   * contains a recognizable date, the Tab_Detector should select the most recently dated
   * tab and mark the result as fallback.
   * 
   * **Validates: Requirements 3.5, 4.1, 4.4**
   */

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }), // currentYear
      fc.integer({ min: 1, max: 6 }) // months in the past
    ],
    propertyConfig
  )('Property 6.1: selects most recent past month when current month not found', 
    (currentMonth, currentYear, monthsInPast) => {
    const tabs: SheetTab[] = []
    
    // Create tabs for past months
    for (let i = monthsInPast; i >= 1; i--) {
      let month = currentMonth - i
      let year = currentYear
      
      while (month < 1) {
        month += 12
        year -= 1
      }
      
      tabs.push({
        sheetId: 1000 + i,
        title: `${FULL_MONTH_NAMES[month - 1]} ${year}`,
        index: monthsInPast - i
      })
    }
    
    const result = selectBestTab(tabs, currentMonth, currentYear)
    
    // Should select the most recent (closest to current month)
    const expectedMonth = currentMonth - 1 < 1 ? 12 : currentMonth - 1
    const expectedYear = currentMonth - 1 < 1 ? currentYear - 1 : currentYear
    
    expect(result.isFallback).toBe(true)
    expect(result.warning).toContain('most recent dated tab')
    expect(result.detectedDate).toBeDefined()
    expect(result.detectedDate!.month).toBe(expectedMonth)
    expect(result.detectedDate!.year).toBe(expectedYear)
  })

  test.prop(
    [
      // Exclude month 12 (December) because "December YYYY" would be the current
      // month — a direct match, not a fallback.
      fc.integer({ min: 1, max: 11 }), // currentMonth (not December)
      fc.integer({ min: 2020, max: 2029 }) // currentYear (not 2030 to allow future)
    ],
    propertyConfig
  )('Property 6.2: selects most recent dated tab from mixed past and future dates',
    (currentMonth, currentYear) => {
    const tabs: SheetTab[] = [
      {
        sheetId: 1000,
        title: `January ${currentYear - 1}`, // Past year
        index: 0
      },
      {
        sheetId: 2000,
        title: `December ${currentYear}`, // Future month (current is 1–11, so Dec is after)
        index: 1
      },
      {
        sheetId: 3000,
        title: `March ${currentYear + 1}`, // Future
        index: 2
      }
    ]

    const result = selectBestTab(tabs, currentMonth, currentYear)

    // Should be fallback because none match current month
    expect(result.isFallback).toBe(true)
    expect(result.warning).toContain('most recent dated tab')
    expect(result.detectedDate).toBeDefined()

    // Most recent past tab is January of previous year if currentMonth <= 1,
    // otherwise the detector picks the closest past month. With Jan(prev year)
    // being the only past tab, it will be selected for months 1. For months 2-11,
    // January(prev year) is still the only past tab available.
    // Actually: the fallback prefers past dates. Jan(prev year) is past.
    // Dec(currentYear) is future when currentMonth < 12.
    // Mar(next year) is future.
    // So fallback picks Jan(prev year) as most recent past.
    expect(result.detectedDate!.year).toBe(currentYear - 1)
    expect(result.detectedDate!.month).toBe(1)
  })

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }), // currentYear
      fc.integer({ min: 2, max: 4 }) // number of tabs with same date
    ],
    propertyConfig
  )('Property 6.3: uses index as tiebreaker for fallback tabs with same date', 
    (currentMonth, currentYear, numTabs) => {
    // Create multiple tabs with same past date
    const pastMonth = currentMonth === 1 ? 12 : currentMonth - 1
    const pastYear = currentMonth === 1 ? currentYear - 1 : currentYear
    
    const tabs: SheetTab[] = []
    for (let i = 0; i < numTabs; i++) {
      tabs.push({
        sheetId: 1000 + i,
        title: `${FULL_MONTH_NAMES[pastMonth - 1]} ${pastYear}`,
        index: i
      })
    }
    
    const result = selectBestTab(tabs, currentMonth, currentYear)
    
    // Should select rightmost tab (highest index) as tiebreaker
    expect(result.isFallback).toBe(true)
    expect(result.sheetGid).toBe((1000 + numTabs - 1).toString())
  })

  /**
   * Feature: dynamic-sheet-tab-detection, Property 7: Fallback to rightmost tab
   * 
   * *For any* set of tabs where no tab contains recognizable date information,
   * the Tab_Detector should select the rightmost tab (highest index) and mark
   * the result as fallback.
   * 
   * **Validates: Requirements 4.2, 4.4**
   */

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }), // currentYear
      fc.integer({ min: 1, max: 10 }) // number of non-dated tabs
    ],
    propertyConfig
  )('Property 7.1: selects rightmost tab when no dates found', 
    (currentMonth, currentYear, numTabs) => {
    const nonDateTitles = ['Sheet1', 'Data', 'Summary', 'Main', 'Backup', 'Archive', 'Q1', 'Q2', 'Report', 'Template']
    
    const tabs: SheetTab[] = []
    for (let i = 0; i < numTabs; i++) {
      tabs.push({
        sheetId: 1000 + i,
        title: nonDateTitles[i % nonDateTitles.length] + (i > 0 ? i : ''),
        index: i
      })
    }
    
    const result = selectBestTab(tabs, currentMonth, currentYear)
    
    // Should select rightmost tab
    expect(result.isFallback).toBe(true)
    expect(result.sheetGid).toBe((1000 + numTabs - 1).toString())
    expect(result.warning).toContain('No dated tabs found')
    expect(result.confidence).toBe(0.5)
  })

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }) // currentYear
    ],
    propertyConfig
  )('Property 7.2: rightmost tab selection is deterministic', 
    (currentMonth, currentYear) => {
    const tabs: SheetTab[] = [
      { sheetId: 1000, title: 'Sheet1', index: 0 },
      { sheetId: 2000, title: 'Sheet2', index: 1 },
      { sheetId: 3000, title: 'Sheet3', index: 2 },
      { sheetId: 4000, title: 'Sheet4', index: 3 }
    ]
    
    // Run selection multiple times
    const result1 = selectBestTab(tabs, currentMonth, currentYear)
    const result2 = selectBestTab(tabs, currentMonth, currentYear)
    
    // Should always select the same tab (rightmost)
    expect(result1.sheetGid).toBe(result2.sheetGid)
    expect(result1.sheetGid).toBe('4000')
    expect(result1.isFallback).toBe(true)
  })

  /**
   * Feature: dynamic-sheet-tab-detection, Property 15: Fallback response includes warning
   * 
   * *For any* tab detection result where isFallback is true, the response should
   * include a warning field explaining why fallback mode was used.
   * 
   * **Validates: Requirements 4.3, 8.6**
   */

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }) // currentYear
    ],
    propertyConfig
  )('Property 15.1: fallback with dated tabs includes appropriate warning', 
    (currentMonth, currentYear) => {
    // Create tabs with dates but not current month
    const pastMonth = currentMonth === 1 ? 12 : currentMonth - 1
    const pastYear = currentMonth === 1 ? currentYear - 1 : currentYear
    
    const tabs: SheetTab[] = [
      {
        sheetId: 1000,
        title: `${FULL_MONTH_NAMES[pastMonth - 1]} ${pastYear}`,
        index: 0
      }
    ]
    
    const result = selectBestTab(tabs, currentMonth, currentYear)
    
    // Should have fallback flag and warning
    expect(result.isFallback).toBe(true)
    expect(result.warning).toBeDefined()
    expect(result.warning).toContain('most recent dated tab')
  })

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }) // currentYear
    ],
    propertyConfig
  )('Property 15.2: fallback without dated tabs includes appropriate warning', 
    (currentMonth, currentYear) => {
    const tabs: SheetTab[] = [
      { sheetId: 1000, title: 'Sheet1', index: 0 },
      { sheetId: 2000, title: 'Data', index: 1 }
    ]
    
    const result = selectBestTab(tabs, currentMonth, currentYear)
    
    // Should have fallback flag and warning about no dates
    expect(result.isFallback).toBe(true)
    expect(result.warning).toBeDefined()
    expect(result.warning).toContain('No dated tabs found')
  })

  test.prop(
    [
      fc.integer({ min: 1, max: 12 }), // currentMonth
      fc.integer({ min: 2020, max: 2030 }) // currentYear
    ],
    propertyConfig
  )('Property 15.3: non-fallback results do not include warning', 
    (currentMonth, currentYear) => {
    const tabs: SheetTab[] = [
      {
        sheetId: 1000,
        title: `${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear}`,
        index: 0
      }
    ]
    
    const result = selectBestTab(tabs, currentMonth, currentYear)
    
    // Should NOT have fallback flag or warning
    expect(result.isFallback).toBe(false)
    expect(result.warning).toBeUndefined()
  })
})
