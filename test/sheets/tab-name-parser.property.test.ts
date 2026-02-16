/**
 * Property-Based Tests for Tab Name Parser
 * 
 * These tests verify universal properties that should hold across all valid inputs.
 * Using @fast-check/vitest for property-based testing with minimum 100 iterations.
 * 
 * Feature: dynamic-sheet-tab-detection
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6, 10.1, 10.2, 10.3, 10.4, 10.5**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect } from 'vitest'
import { parseTabName } from '@/app/lib/sheets/tab-name-parser'

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

describe('Tab Name Parser - Property Tests', () => {

  /**
   * Feature: dynamic-sheet-tab-detection, Property 2: Date format parsing with confidence scoring
   * 
   * *For any* tab name containing a date in a recognized format (Month YYYY, Mon YYYY, 
   * YYYY-MM, MM/YYYY, or Month only), the Tab_Name_Parser should extract the correct 
   * month and year and assign the appropriate confidence score (1.0, 0.95, 0.9, 0.85, 
   * or 0.7 respectively).
   * 
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6, 10.1, 10.2, 10.3, 10.4, 10.5**
   */

  // Pattern 1: "Month YYYY" format → confidence 1.0
  test.prop(
    [
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 2020, max: 2030 })
    ],
    propertyConfig
  )('Property 2.1: "Month YYYY" format extracts correct date with confidence 1.0', (month, year) => {
    const monthName = FULL_MONTH_NAMES[month - 1]
    const tabName = `${monthName} ${year}`
    
    const result = parseTabName(tabName)
    
    expect(result).not.toBeNull()
    expect(result!.month).toBe(month)
    expect(result!.year).toBe(year)
    expect(result!.confidence).toBe(1.0)
    expect(result!.pattern).toBe('Month YYYY')
  })

  // Pattern 1 with surrounding text
  test.prop(
    [
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 2020, max: 2030 }),
      fc.string({ minLength: 0, maxLength: 20 }),
      fc.string({ minLength: 0, maxLength: 20 })
    ],
    propertyConfig
  )('Property 2.1b: "Month YYYY" format works with surrounding text', (month, year, prefix, suffix) => {
    const monthName = FULL_MONTH_NAMES[month - 1]
    const tabName = `${prefix} ${monthName} ${year} ${suffix}`
    
    const result = parseTabName(tabName)
    
    expect(result).not.toBeNull()
    expect(result!.month).toBe(month)
    expect(result!.year).toBe(year)
    expect(result!.confidence).toBe(1.0)
  })

  // Pattern 2: "Mon YYYY" format → confidence 0.95
  // Note: May is both a full month name and abbreviation, so we exclude it from this test
  test.prop(
    [
      fc.integer({ min: 1, max: 12 }).filter(m => m !== 5), // Exclude May (month 5)
      fc.integer({ min: 2020, max: 2030 })
    ],
    propertyConfig
  )('Property 2.2: "Mon YYYY" format extracts correct date with confidence 0.95', (month, year) => {
    const monthAbbrev = ABBREV_MONTH_NAMES[month - 1]
    const tabName = `${monthAbbrev} ${year}`
    
    const result = parseTabName(tabName)
    
    expect(result).not.toBeNull()
    expect(result!.month).toBe(month)
    expect(result!.year).toBe(year)
    expect(result!.confidence).toBe(0.95)
    expect(result!.pattern).toBe('Mon YYYY')
  })

  // Pattern 2 with surrounding text
  // Note: May is both a full month name and abbreviation, so we exclude it from this test
  test.prop(
    [
      fc.integer({ min: 1, max: 12 }).filter(m => m !== 5), // Exclude May (month 5)
      fc.integer({ min: 2020, max: 2030 }),
      fc.string({ minLength: 0, maxLength: 20 }),
      fc.string({ minLength: 0, maxLength: 20 })
    ],
    propertyConfig
  )('Property 2.2b: "Mon YYYY" format works with surrounding text', (month, year, prefix, suffix) => {
    const monthAbbrev = ABBREV_MONTH_NAMES[month - 1]
    const tabName = `${prefix} ${monthAbbrev} ${year} ${suffix}`
    
    const result = parseTabName(tabName)
    
    expect(result).not.toBeNull()
    expect(result!.month).toBe(month)
    expect(result!.year).toBe(year)
    expect(result!.confidence).toBe(0.95)
  })

  // Pattern 3: "YYYY-MM" format → confidence 0.9
  test.prop(
    [
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 2020, max: 2030 })
    ],
    propertyConfig
  )('Property 2.3: "YYYY-MM" format extracts correct date with confidence 0.9', (month, year) => {
    const monthStr = month.toString().padStart(2, '0')
    const tabName = `${year}-${monthStr}`
    
    const result = parseTabName(tabName)
    
    expect(result).not.toBeNull()
    expect(result!.month).toBe(month)
    expect(result!.year).toBe(year)
    expect(result!.confidence).toBe(0.9)
    expect(result!.pattern).toBe('YYYY-MM')
  })

  // Pattern 3 with surrounding text
  test.prop(
    [
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 2020, max: 2030 }),
      fc.string({ minLength: 0, maxLength: 20 }),
      fc.string({ minLength: 0, maxLength: 20 })
    ],
    propertyConfig
  )('Property 2.3b: "YYYY-MM" format works with surrounding text', (month, year, prefix, suffix) => {
    const monthStr = month.toString().padStart(2, '0')
    const tabName = `${prefix} ${year}-${monthStr} ${suffix}`
    
    const result = parseTabName(tabName)
    
    expect(result).not.toBeNull()
    expect(result!.month).toBe(month)
    expect(result!.year).toBe(year)
    expect(result!.confidence).toBe(0.9)
  })

  // Pattern 4: "MM/YYYY" format → confidence 0.85
  test.prop(
    [
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 2020, max: 2030 })
    ],
    propertyConfig
  )('Property 2.4: "MM/YYYY" format extracts correct date with confidence 0.85', (month, year) => {
    const monthStr = month.toString().padStart(2, '0')
    const tabName = `${monthStr}/${year}`
    
    const result = parseTabName(tabName)
    
    expect(result).not.toBeNull()
    expect(result!.month).toBe(month)
    expect(result!.year).toBe(year)
    expect(result!.confidence).toBe(0.85)
    expect(result!.pattern).toBe('MM/YYYY')
  })

  // Pattern 4 with single-digit month
  test.prop(
    [
      fc.integer({ min: 1, max: 9 }),
      fc.integer({ min: 2020, max: 2030 })
    ],
    propertyConfig
  )('Property 2.4b: "M/YYYY" format (single digit) extracts correct date', (month, year) => {
    const tabName = `${month}/${year}`
    
    const result = parseTabName(tabName)
    
    expect(result).not.toBeNull()
    expect(result!.month).toBe(month)
    expect(result!.year).toBe(year)
    expect(result!.confidence).toBe(0.85)
  })

  // Pattern 4 with dash separator
  test.prop(
    [
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 2020, max: 2030 })
    ],
    propertyConfig
  )('Property 2.4c: "MM-YYYY" format (dash) extracts correct date', (month, year) => {
    const monthStr = month.toString().padStart(2, '0')
    const tabName = `${monthStr}-${year}`
    
    const result = parseTabName(tabName)
    
    expect(result).not.toBeNull()
    expect(result!.month).toBe(month)
    expect(result!.year).toBe(year)
    expect(result!.confidence).toBe(0.85)
  })

  // Pattern 5: "Month only" format → confidence 0.7, assumes current year
  test.prop(
    [fc.integer({ min: 1, max: 12 })],
    propertyConfig
  )('Property 2.5: "Month only" format extracts month with current year and confidence 0.7', (month) => {
    const monthName = FULL_MONTH_NAMES[month - 1]
    const tabName = monthName
    const currentYear = new Date().getFullYear()
    
    const result = parseTabName(tabName)
    
    expect(result).not.toBeNull()
    expect(result!.month).toBe(month)
    expect(result!.year).toBe(currentYear)
    expect(result!.confidence).toBe(0.7)
    expect(result!.pattern).toBe('Month only')
  })

  // Pattern 5 with surrounding text
  test.prop(
    [
      fc.integer({ min: 1, max: 12 }),
      fc.string({ minLength: 0, maxLength: 20 }),
      fc.string({ minLength: 0, maxLength: 20 })
    ],
    propertyConfig
  )('Property 2.5b: "Month only" format works with surrounding text', (month, prefix, suffix) => {
    const monthName = FULL_MONTH_NAMES[month - 1]
    const tabName = `${prefix} ${monthName} ${suffix}`
    const currentYear = new Date().getFullYear()
    
    const result = parseTabName(tabName)
    
    expect(result).not.toBeNull()
    expect(result!.month).toBe(month)
    expect(result!.year).toBe(currentYear)
    expect(result!.confidence).toBe(0.7)
  })

  /**
   * Property 2 (case insensitivity): Month names should be case-insensitive
   * 
   * **Validates: Requirements 2.6**
   */
  test.prop(
    [
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 2020, max: 2030 }),
      fc.constantFrom('lower', 'upper', 'mixed')
    ],
    propertyConfig
  )('Property 2.6: month names are case-insensitive', (month, year, caseType) => {
    let monthName = FULL_MONTH_NAMES[month - 1]
    
    // Apply case transformation
    if (caseType === 'lower') {
      monthName = monthName.toLowerCase()
    } else if (caseType === 'upper') {
      monthName = monthName.toUpperCase()
    } else {
      // Mixed case (e.g., "jAnUaRy")
      monthName = monthName.split('').map((c, i) => 
        i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()
      ).join('')
    }
    
    const tabName = `${monthName} ${year}`
    
    const result = parseTabName(tabName)
    
    expect(result).not.toBeNull()
    expect(result!.month).toBe(month)
    expect(result!.year).toBe(year)
    expect(result!.confidence).toBe(1.0)
  })

  /**
   * Property 2 (year validation): Years outside valid range should be rejected
   * 
   * This test verifies that when a year outside the valid range appears in a format
   * that ONLY contains the year (not month-only patterns), it should be rejected.
   * 
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
   */
  test.prop(
    [
      fc.integer({ min: 1, max: 12 }),
      fc.oneof(
        fc.integer({ min: 1900, max: 1999 }),
        fc.integer({ min: 2101, max: 2200 })
      )
    ],
    propertyConfig
  )('Property 2.7: years outside 2000-2100 range are rejected in YYYY-MM format', (month, year) => {
    // Use YYYY-MM format which requires explicit year validation
    const monthStr = month.toString().padStart(2, '0')
    const tabName = `${year}-${monthStr}`
    
    const result = parseTabName(tabName)
    
    // Should return null for years outside valid range
    expect(result).toBeNull()
  })

  /**
   * Property 2 (month validation): Invalid month numbers should be rejected
   * 
   * **Validates: Requirements 2.3, 2.4**
   */
  test.prop(
    [
      fc.oneof(
        fc.integer({ min: 0, max: 0 }),
        fc.integer({ min: 13, max: 99 })
      ),
      fc.integer({ min: 2020, max: 2030 })
    ],
    propertyConfig
  )('Property 2.8: invalid month numbers (0 or >12) are rejected', (month, year) => {
    const monthStr = month.toString().padStart(2, '0')
    const tabName = `${year}-${monthStr}`
    
    const result = parseTabName(tabName)
    
    // Should return null for invalid month numbers
    expect(result).toBeNull()
  })

  /**
   * Property 2 (priority): Higher confidence patterns should take precedence
   * 
   * When multiple patterns match, the highest confidence pattern should be selected.
   * 
   * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**
   */
  test.prop(
    [
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 2020, max: 2030 })
    ],
    propertyConfig
  )('Property 2.9: full month name takes precedence over abbreviated', (month, year) => {
    const fullMonthName = FULL_MONTH_NAMES[month - 1]
    const abbrevMonthName = ABBREV_MONTH_NAMES[month - 1]
    
    // Tab name contains both full and abbreviated month names
    const tabName = `${fullMonthName} ${year} (${abbrevMonthName})`
    
    const result = parseTabName(tabName)
    
    expect(result).not.toBeNull()
    expect(result!.month).toBe(month)
    expect(result!.year).toBe(year)
    // Should match full month name pattern (confidence 1.0) not abbreviated (0.95)
    expect(result!.confidence).toBe(1.0)
    expect(result!.pattern).toBe('Month YYYY')
  })

  /**
   * Property 2 (completeness): All valid date formats should be recognized
   * 
   * For any valid month and year, at least one format should successfully parse.
   * 
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6**
   */
  test.prop(
    [
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 2020, max: 2030 })
    ],
    propertyConfig
  )('Property 2.10: at least one format successfully parses any valid month/year', (month, year) => {
    const formats = [
      `${FULL_MONTH_NAMES[month - 1]} ${year}`,
      `${ABBREV_MONTH_NAMES[month - 1]} ${year}`,
      `${year}-${month.toString().padStart(2, '0')}`,
      `${month.toString().padStart(2, '0')}/${year}`,
      FULL_MONTH_NAMES[month - 1]
    ]
    
    // At least one format should parse successfully
    const results = formats.map(format => parseTabName(format))
    const successfulParses = results.filter(r => r !== null)
    
    expect(successfulParses.length).toBeGreaterThan(0)
    
    // All successful parses should extract the correct month
    successfulParses.forEach(result => {
      expect(result!.month).toBe(month)
    })
  })

  /**
   * Feature: dynamic-sheet-tab-detection, Property 3: Non-date tab names return null
   * 
   * *For any* tab name containing no recognizable date information, the Tab_Name_Parser 
   * should return null (or confidence 0.0).
   * 
   * **Validates: Requirements 2.7, 10.7**
   */

  /**
   * Property 3.1: Random strings without date patterns return null
   * 
   * Generates random strings that don't contain month names or date patterns.
   */
  test.prop(
    [
      fc.string({ minLength: 1, maxLength: 30 }).filter(str => {
        // Filter out strings that might accidentally contain month names or date patterns
        const lower = str.toLowerCase()
        const hasMonthName = FULL_MONTH_NAMES.some(m => lower.includes(m.toLowerCase())) ||
                            ABBREV_MONTH_NAMES.some(m => lower.includes(m.toLowerCase()))
        const hasYearPattern = /\d{4}/.test(str)
        const hasDatePattern = /\d{1,2}[\/\-]\d{4}/.test(str)
        
        return !hasMonthName && !hasYearPattern && !hasDatePattern && str.trim().length > 0
      })
    ],
    propertyConfig
  )('Property 3.1: random strings without date patterns return null', (tabName) => {
    const result = parseTabName(tabName)
    
    // Should return null for non-date tab names
    expect(result).toBeNull()
  })

  /**
   * Property 3.2: Common non-date tab names return null
   * 
   * Tests common tab names that don't contain dates.
   */
  test.prop(
    [
      fc.constantFrom(
        'Sheet1', 'Sheet2', 'Sheet3',
        'Data', 'Summary', 'Report',
        'Main', 'Backup', 'Archive',
        'Template', 'Example', 'Test',
        'Notes', 'Info', 'Details',
        'Q1', 'Q2', 'Q3', 'Q4',
        'Week 1', 'Week 2', 'Week 3',
        'Day 1', 'Day 2', 'Day 3',
        'Tab A', 'Tab B', 'Tab C',
        'Untitled', 'New Sheet', 'Copy of Sheet'
      )
    ],
    propertyConfig
  )('Property 3.2: common non-date tab names return null', (tabName) => {
    const result = parseTabName(tabName)
    
    // Should return null for non-date tab names
    expect(result).toBeNull()
  })

  /**
   * Property 3.3: Numeric-only tab names (without valid dates) return null
   * 
   * Tests tab names that contain only numbers but don't form valid date patterns.
   */
  test.prop(
    [
      fc.oneof(
        fc.integer({ min: 1, max: 999 }).map(n => n.toString()),
        fc.integer({ min: 1, max: 99 }).map(n => `${n}${n}`),
        fc.tuple(fc.integer({ min: 1, max: 99 }), fc.integer({ min: 1, max: 99 }))
          .map(([a, b]) => `${a} ${b}`)
      )
    ],
    propertyConfig
  )('Property 3.3: numeric-only tab names without valid dates return null', (tabName) => {
    const result = parseTabName(tabName)
    
    // Should return null for numeric strings that don't form valid dates
    expect(result).toBeNull()
  })

  /**
   * Property 3.4: Tab names with special characters only return null
   */
  test.prop(
    [
      fc.array(
        fc.constantFrom('!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '=', '[', ']', '{', '}', '|', '\\', ';', ':', '"', "'", '<', '>', ',', '.', '?', '/', '~', '`'),
        { minLength: 1, maxLength: 20 }
      ).map(chars => chars.join(''))
    ],
    propertyConfig
  )('Property 3.4: tab names with special characters only return null', (tabName) => {
    const result = parseTabName(tabName)
    
    // Should return null for special character strings
    expect(result).toBeNull()
  })

  /**
   * Property 3.5: Empty or whitespace-only tab names return null
   */
  test.prop(
    [
      fc.oneof(
        fc.constant(''),
        fc.constant('   '),
        fc.constant('\t'),
        fc.constant('\n'),
        fc.array(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 }).map(chars => chars.join(''))
      )
    ],
    propertyConfig
  )('Property 3.5: empty or whitespace-only tab names return null', (tabName) => {
    const result = parseTabName(tabName)
    
    // Should return null for empty or whitespace strings
    expect(result).toBeNull()
  })

  /**
   * Property 3.6: Tab names with partial date info (incomplete patterns) return null
   * 
   * Tests strings that have numbers or partial patterns but don't form complete dates.
   */
  test.prop(
    [
      fc.constantFrom(
        'Week 1-4',
        'Days 1-7',
        'Block 1',
        'Phase 2',
        'Cycle 3',
        'Round 4',
        'Set 5',
        'Rep 6',
        'Level 7',
        'Stage 8',
        'Step 9',
        'Part 10'
      )
    ],
    propertyConfig
  )('Property 3.6: tab names with partial date info return null', (tabName) => {
    const result = parseTabName(tabName)
    
    // Should return null for incomplete date patterns
    expect(result).toBeNull()
  })
})

