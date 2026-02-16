/**
 * Property-Based Tests for Tab Cache
 * 
 * These tests verify universal properties that should hold across all valid inputs.
 * Using @fast-check/vitest for property-based testing with minimum 100 iterations.
 * 
 * Feature: dynamic-sheet-tab-detection
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect, beforeEach } from 'vitest'
import { TabCache } from '@/app/lib/sheets/tab-cache'
import type { CachedTabResult } from '@/app/lib/sheets/types'

// Configure minimum 100 iterations for all property tests
const propertyConfig = { numRuns: 100 }

describe('Tab Cache - Property Tests', () => {

  let cache: TabCache

  beforeEach(() => {
    // Create fresh cache instance for each test
    cache = new TabCache()
  })

  /**
   * Feature: dynamic-sheet-tab-detection, Property 8: Cache hit avoids API call
   * 
   * *For any* spreadsheet where a valid cached result exists (within TTL and matching 
   * current month), calling detectCurrentTab should return the cached result without 
   * making a Google Sheets API call.
   * 
   * **Validates: Requirements 5.1, 5.3**
   */

  /**
   * Property 8.1: Cache returns stored result when within TTL and same month
   * 
   * Tests that for any valid cached result within TTL and matching the current month,
   * the cache returns the exact same result without requiring an API call.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 1, maxLength: 10 }).map(s => s.replace(/\s/g, '')), // sheetGid
      fc.string({ minLength: 1, maxLength: 100 }), // tabName
      fc.double({ min: 0.0, max: 1.0 }), // confidence
      fc.integer({ min: 1, max: 12 }), // month
      fc.integer({ min: 2020, max: 2030 }), // year
      fc.integer({ min: 0, max: 3 * 60 * 60 * 1000 }) // timeElapsed (0 to 3 hours in ms)
    ],
    propertyConfig
  )('Property 8.1: returns cached result when within TTL and same month', (
    spreadsheetId,
    sheetGid,
    tabName,
    confidence,
    month,
    year,
    timeElapsed
  ) => {
    // Create cached result with timestamp in the past (but within TTL)
    const cachedResult: CachedTabResult = {
      sheetGid,
      tabName,
      confidence,
      detectedMonth: month,
      detectedYear: year,
      timestamp: Date.now() - timeElapsed
    }

    // Store in cache
    cache.set(spreadsheetId, cachedResult)

    // Retrieve from cache with same month/year
    const retrieved = cache.get(spreadsheetId, month, year)

    // Should return the cached result
    expect(retrieved).not.toBeNull()
    expect(retrieved!.sheetGid).toBe(sheetGid)
    expect(retrieved!.tabName).toBe(tabName)
    expect(retrieved!.confidence).toBe(confidence)
    expect(retrieved!.detectedMonth).toBe(month)
    expect(retrieved!.detectedYear).toBe(year)
    expect(retrieved!.timestamp).toBe(cachedResult.timestamp)
  })

  /**
   * Property 8.2: Cache returns null when TTL expired
   * 
   * Tests that for any cached result where TTL has expired (>4 hours by default),
   * the cache returns null, forcing a fresh API call.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 1, maxLength: 10 }).map(s => s.replace(/\s/g, '')), // sheetGid
      fc.string({ minLength: 1, maxLength: 100 }), // tabName
      fc.double({ min: 0.0, max: 1.0 }), // confidence
      fc.integer({ min: 1, max: 12 }), // month
      fc.integer({ min: 2020, max: 2030 }), // year
      fc.integer({ min: 5 * 60 * 60 * 1000, max: 24 * 60 * 60 * 1000 }) // timeElapsed (5-24 hours)
    ],
    propertyConfig
  )('Property 8.2: returns null when TTL expired (>4 hours)', (
    spreadsheetId,
    sheetGid,
    tabName,
    confidence,
    month,
    year,
    timeElapsed
  ) => {
    // Create cached result with timestamp beyond TTL (>4 hours ago)
    const cachedResult: CachedTabResult = {
      sheetGid,
      tabName,
      confidence,
      detectedMonth: month,
      detectedYear: year,
      timestamp: Date.now() - timeElapsed
    }

    // Store in cache
    cache.set(spreadsheetId, cachedResult)

    // Retrieve from cache with same month/year
    const retrieved = cache.get(spreadsheetId, month, year)

    // Should return null (cache expired)
    expect(retrieved).toBeNull()
  })

  /**
   * Property 8.3: Cache returns null when month changed
   * 
   * Tests that for any cached result from a different month, the cache returns null
   * even if within TTL, forcing detection for the new month.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 1, maxLength: 10 }).map(s => s.replace(/\s/g, '')), // sheetGid
      fc.string({ minLength: 1, maxLength: 100 }), // tabName
      fc.double({ min: 0.0, max: 1.0 }), // confidence
      fc.integer({ min: 1, max: 12 }), // cachedMonth
      fc.integer({ min: 2020, max: 2030 }), // year
      fc.integer({ min: 0, max: 3 * 60 * 60 * 1000 }) // timeElapsed (within TTL)
    ],
    propertyConfig
  )('Property 8.3: returns null when month changed', (
    spreadsheetId,
    sheetGid,
    tabName,
    confidence,
    cachedMonth,
    year,
    timeElapsed
  ) => {
    // Create cached result for one month
    const cachedResult: CachedTabResult = {
      sheetGid,
      tabName,
      confidence,
      detectedMonth: cachedMonth,
      detectedYear: year,
      timestamp: Date.now() - timeElapsed
    }

    // Store in cache
    cache.set(spreadsheetId, cachedResult)

    // Try to retrieve for a different month
    const differentMonth = cachedMonth === 12 ? 1 : cachedMonth + 1

    const retrieved = cache.get(spreadsheetId, differentMonth, year)

    // Should return null (month changed)
    expect(retrieved).toBeNull()
  })

  /**
   * Property 8.4: Cache returns null when year changed
   * 
   * Tests that for any cached result from a different year, the cache returns null
   * even if within TTL and same month number.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 1, maxLength: 10 }).map(s => s.replace(/\s/g, '')), // sheetGid
      fc.string({ minLength: 1, maxLength: 100 }), // tabName
      fc.double({ min: 0.0, max: 1.0 }), // confidence
      fc.integer({ min: 1, max: 12 }), // month
      fc.integer({ min: 2020, max: 2029 }), // cachedYear
      fc.integer({ min: 0, max: 3 * 60 * 60 * 1000 }) // timeElapsed (within TTL)
    ],
    propertyConfig
  )('Property 8.4: returns null when year changed', (
    spreadsheetId,
    sheetGid,
    tabName,
    confidence,
    month,
    cachedYear,
    timeElapsed
  ) => {
    // Create cached result for one year
    const cachedResult: CachedTabResult = {
      sheetGid,
      tabName,
      confidence,
      detectedMonth: month,
      detectedYear: cachedYear,
      timestamp: Date.now() - timeElapsed
    }

    // Store in cache
    cache.set(spreadsheetId, cachedResult)

    // Try to retrieve for a different year
    const differentYear = cachedYear + 1

    const retrieved = cache.get(spreadsheetId, month, differentYear)

    // Should return null (year changed)
    expect(retrieved).toBeNull()
  })

  /**
   * Property 8.5: Cache miss returns null for non-existent spreadsheet
   * 
   * Tests that for any spreadsheet ID that hasn't been cached, the cache returns null.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 10, maxLength: 50 }), // differentSpreadsheetId
      fc.string({ minLength: 1, maxLength: 10 }).map(s => s.replace(/\s/g, '')), // sheetGid
      fc.string({ minLength: 1, maxLength: 100 }), // tabName
      fc.double({ min: 0.0, max: 1.0 }), // confidence
      fc.integer({ min: 1, max: 12 }), // month
      fc.integer({ min: 2020, max: 2030 }) // year
    ],
    propertyConfig
  )('Property 8.5: returns null for non-existent spreadsheet', (
    spreadsheetId,
    differentSpreadsheetId,
    sheetGid,
    tabName,
    confidence,
    month,
    year
  ) => {
    // Ensure the two IDs are different
    fc.pre(spreadsheetId !== differentSpreadsheetId)

    // Create cached result for one spreadsheet
    const cachedResult: CachedTabResult = {
      sheetGid,
      tabName,
      confidence,
      detectedMonth: month,
      detectedYear: year,
      timestamp: Date.now()
    }

    // Store in cache for spreadsheetId
    cache.set(spreadsheetId, cachedResult)

    // Try to retrieve for a different spreadsheet
    const retrieved = cache.get(differentSpreadsheetId, month, year)

    // Should return null (cache miss)
    expect(retrieved).toBeNull()
  })

  /**
   * Property 8.6: Cache isolation - multiple spreadsheets don't interfere
   * 
   * Tests that caching results for multiple spreadsheets doesn't cause interference,
   * and each spreadsheet's cache is independent.
   */
  test.prop(
    [
      fc.array(
        fc.record({
          spreadsheetId: fc.string({ minLength: 10, maxLength: 50 }),
          sheetGid: fc.string({ minLength: 1, maxLength: 10 }).map(s => s.replace(/\s/g, '')),
          tabName: fc.string({ minLength: 1, maxLength: 100 }),
          confidence: fc.double({ min: 0.0, max: 1.0 }),
          month: fc.integer({ min: 1, max: 12 }),
          year: fc.integer({ min: 2020, max: 2030 })
        }),
        { minLength: 2, maxLength: 10 }
      )
    ],
    propertyConfig
  )('Property 8.6: multiple spreadsheets have isolated caches', (spreadsheets) => {
    // Ensure all spreadsheet IDs are unique
    const uniqueIds = new Set(spreadsheets.map(s => s.spreadsheetId))
    fc.pre(uniqueIds.size === spreadsheets.length)

    // Store all results in cache
    spreadsheets.forEach(sheet => {
      const cachedResult: CachedTabResult = {
        sheetGid: sheet.sheetGid,
        tabName: sheet.tabName,
        confidence: sheet.confidence,
        detectedMonth: sheet.month,
        detectedYear: sheet.year,
        timestamp: Date.now()
      }
      cache.set(sheet.spreadsheetId, cachedResult)
    })

    // Verify each can be retrieved independently
    spreadsheets.forEach(sheet => {
      const retrieved = cache.get(sheet.spreadsheetId, sheet.month, sheet.year)
      
      expect(retrieved).not.toBeNull()
      expect(retrieved!.sheetGid).toBe(sheet.sheetGid)
      expect(retrieved!.tabName).toBe(sheet.tabName)
      expect(retrieved!.confidence).toBe(sheet.confidence)
      expect(retrieved!.detectedMonth).toBe(sheet.month)
      expect(retrieved!.detectedYear).toBe(sheet.year)
    })
  })

  /**
   * Property 8.7: Cache update overwrites previous value
   * 
   * Tests that setting a new value for the same spreadsheet ID overwrites the previous value.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 1, maxLength: 10 }).map(s => s.replace(/\s/g, '')), // oldSheetGid
      fc.string({ minLength: 1, maxLength: 10 }).map(s => s.replace(/\s/g, '')), // newSheetGid
      fc.string({ minLength: 1, maxLength: 100 }), // oldTabName
      fc.string({ minLength: 1, maxLength: 100 }), // newTabName
      fc.integer({ min: 1, max: 12 }), // month
      fc.integer({ min: 2020, max: 2030 }) // year
    ],
    propertyConfig
  )('Property 8.7: cache update overwrites previous value', (
    spreadsheetId,
    oldSheetGid,
    newSheetGid,
    oldTabName,
    newTabName,
    month,
    year
  ) => {
    // Ensure old and new values are different
    fc.pre(oldSheetGid !== newSheetGid || oldTabName !== newTabName)

    // Store initial result
    const oldResult: CachedTabResult = {
      sheetGid: oldSheetGid,
      tabName: oldTabName,
      confidence: 0.8,
      detectedMonth: month,
      detectedYear: year,
      timestamp: Date.now()
    }
    cache.set(spreadsheetId, oldResult)

    // Store new result (overwrite)
    const newResult: CachedTabResult = {
      sheetGid: newSheetGid,
      tabName: newTabName,
      confidence: 0.9,
      detectedMonth: month,
      detectedYear: year,
      timestamp: Date.now()
    }
    cache.set(spreadsheetId, newResult)

    // Retrieve and verify it's the new value
    const retrieved = cache.get(spreadsheetId, month, year)

    expect(retrieved).not.toBeNull()
    expect(retrieved!.sheetGid).toBe(newSheetGid)
    expect(retrieved!.tabName).toBe(newTabName)
    expect(retrieved!.confidence).toBe(0.9)
  })

  /**
   * Property 8.8: Cache clear removes all entries
   * 
   * Tests that calling clear() removes all cached entries for all spreadsheets.
   */
  test.prop(
    [
      fc.array(
        fc.record({
          spreadsheetId: fc.string({ minLength: 10, maxLength: 50 }),
          sheetGid: fc.string({ minLength: 1, maxLength: 10 }).map(s => s.replace(/\s/g, '')),
          tabName: fc.string({ minLength: 1, maxLength: 100 }),
          confidence: fc.double({ min: 0.0, max: 1.0 }),
          month: fc.integer({ min: 1, max: 12 }),
          year: fc.integer({ min: 2020, max: 2030 })
        }),
        { minLength: 1, maxLength: 10 }
      )
    ],
    propertyConfig
  )('Property 8.8: clear removes all cached entries', (spreadsheets) => {
    // Store all results in cache
    spreadsheets.forEach(sheet => {
      const cachedResult: CachedTabResult = {
        sheetGid: sheet.sheetGid,
        tabName: sheet.tabName,
        confidence: sheet.confidence,
        detectedMonth: sheet.month,
        detectedYear: sheet.year,
        timestamp: Date.now()
      }
      cache.set(sheet.spreadsheetId, cachedResult)
    })

    // Clear cache
    cache.clear()

    // Verify all entries are gone
    spreadsheets.forEach(sheet => {
      const retrieved = cache.get(sheet.spreadsheetId, sheet.month, sheet.year)
      expect(retrieved).toBeNull()
    })
  })

  /**
   * Property 8.9: isExpired method correctly identifies expired timestamps
   * 
   * Tests that the isExpired helper method correctly identifies timestamps
   * that exceed the TTL.
   */
  test.prop(
    [
      fc.integer({ min: 1, max: 24 }), // ttlHours
      fc.integer({ min: 0, max: 48 * 60 * 60 * 1000 }) // timeElapsed (0-48 hours in ms)
    ],
    propertyConfig
  )('Property 8.9: isExpired correctly identifies expired timestamps', (ttlHours, timeElapsed) => {
    const timestamp = Date.now() - timeElapsed
    const isExpired = cache.isExpired(timestamp, ttlHours)

    const ttlMs = ttlHours * 60 * 60 * 1000
    const expectedExpired = timeElapsed > ttlMs

    expect(isExpired).toBe(expectedExpired)
  })

  /**
   * Property 8.10: Cache respects custom TTL from environment variable
   * 
   * Tests that when GOOGLE_SHEETS_CACHE_TTL_HOURS is set, the cache respects
   * the custom TTL value.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 1, maxLength: 10 }).map(s => s.replace(/\s/g, '')), // sheetGid
      fc.string({ minLength: 1, maxLength: 100 }), // tabName
      fc.integer({ min: 1, max: 12 }), // month
      fc.integer({ min: 2020, max: 2030 }), // year
      fc.integer({ min: 1, max: 12 }), // customTTL (hours)
      fc.integer({ min: 0, max: 24 * 60 * 60 * 1000 }) // timeElapsed (0-24 hours in ms)
    ],
    propertyConfig
  )('Property 8.10: respects custom TTL from environment variable', (
    spreadsheetId,
    sheetGid,
    tabName,
    month,
    year,
    customTTL,
    timeElapsed
  ) => {
    // Set custom TTL environment variable
    const originalTTL = process.env.GOOGLE_SHEETS_CACHE_TTL_HOURS
    process.env.GOOGLE_SHEETS_CACHE_TTL_HOURS = customTTL.toString()

    try {
      // Create cached result with timestamp in the past
      const cachedResult: CachedTabResult = {
        sheetGid,
        tabName,
        confidence: 0.9,
        detectedMonth: month,
        detectedYear: year,
        timestamp: Date.now() - timeElapsed
      }

      // Store in cache
      cache.set(spreadsheetId, cachedResult)

      // Retrieve from cache
      const retrieved = cache.get(spreadsheetId, month, year)

      // Determine if should be expired based on custom TTL
      const customTTLMs = customTTL * 60 * 60 * 1000
      const shouldBeExpired = timeElapsed > customTTLMs

      if (shouldBeExpired) {
        expect(retrieved).toBeNull()
      } else {
        expect(retrieved).not.toBeNull()
        expect(retrieved!.sheetGid).toBe(sheetGid)
      }
    } finally {
      // Restore original TTL
      if (originalTTL !== undefined) {
        process.env.GOOGLE_SHEETS_CACHE_TTL_HOURS = originalTTL
      } else {
        delete process.env.GOOGLE_SHEETS_CACHE_TTL_HOURS
      }
    }
  })
})
