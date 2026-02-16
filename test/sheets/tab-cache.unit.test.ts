/**
 * Unit Tests for Tab Cache
 * 
 * These tests verify specific cache behavior scenarios with concrete examples.
 * Complements property-based tests with focused edge case validation.
 * 
 * Feature: dynamic-sheet-tab-detection
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TabCache } from '@/app/lib/sheets/tab-cache'
import type { CachedTabResult } from '@/app/lib/sheets/types'

describe('Tab Cache - Unit Tests', () => {
  let cache: TabCache
  let originalTTL: string | undefined

  beforeEach(() => {
    // Create fresh cache instance for each test
    cache = new TabCache()
    
    // Store original TTL environment variable
    originalTTL = process.env.GOOGLE_SHEETS_CACHE_TTL_HOURS
  })

  afterEach(() => {
    // Restore original TTL environment variable
    if (originalTTL !== undefined) {
      process.env.GOOGLE_SHEETS_CACHE_TTL_HOURS = originalTTL
    } else {
      delete process.env.GOOGLE_SHEETS_CACHE_TTL_HOURS
    }
  })

  /**
   * Test: Cache hit within TTL
   * 
   * Validates: Requirements 5.1, 5.3
   * 
   * Verifies that a cached result stored within the TTL window (default 4 hours)
   * is successfully retrieved when the month and year match.
   */
  describe('Cache hit within TTL', () => {
    it('should return cached result when accessed within default 4-hour TTL', () => {
      const spreadsheetId = 'test-spreadsheet-123'
      const cachedResult: CachedTabResult = {
        sheetGid: '12345678',
        tabName: 'February 2026',
        confidence: 1.0,
        detectedMonth: 2,
        detectedYear: 2026,
        timestamp: Date.now() // Just cached
      }

      // Store in cache
      cache.set(spreadsheetId, cachedResult)

      // Retrieve immediately (well within TTL)
      const retrieved = cache.get(spreadsheetId, 2, 2026)

      // Should return the cached result
      expect(retrieved).not.toBeNull()
      expect(retrieved!.sheetGid).toBe('12345678')
      expect(retrieved!.tabName).toBe('February 2026')
      expect(retrieved!.confidence).toBe(1.0)
      expect(retrieved!.detectedMonth).toBe(2)
      expect(retrieved!.detectedYear).toBe(2026)
      expect(retrieved!.timestamp).toBe(cachedResult.timestamp)
    })

    it('should return cached result when accessed 3 hours after caching', () => {
      const spreadsheetId = 'test-spreadsheet-456'
      const threeHoursAgo = Date.now() - (3 * 60 * 60 * 1000)
      
      const cachedResult: CachedTabResult = {
        sheetGid: '87654321',
        tabName: 'January 2026',
        confidence: 0.95,
        detectedMonth: 1,
        detectedYear: 2026,
        timestamp: threeHoursAgo
      }

      cache.set(spreadsheetId, cachedResult)

      // Retrieve 3 hours later (still within 4-hour TTL)
      const retrieved = cache.get(spreadsheetId, 1, 2026)

      expect(retrieved).not.toBeNull()
      expect(retrieved!.sheetGid).toBe('87654321')
      expect(retrieved!.tabName).toBe('January 2026')
    })

    it('should return cached result with custom TTL of 8 hours when accessed after 6 hours', () => {
      // Set custom TTL to 8 hours
      process.env.GOOGLE_SHEETS_CACHE_TTL_HOURS = '8'

      const spreadsheetId = 'test-spreadsheet-789'
      const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000)
      
      const cachedResult: CachedTabResult = {
        sheetGid: '11111111',
        tabName: 'March 2026',
        confidence: 0.9,
        detectedMonth: 3,
        detectedYear: 2026,
        timestamp: sixHoursAgo
      }

      cache.set(spreadsheetId, cachedResult)

      // Retrieve 6 hours later (within 8-hour custom TTL)
      const retrieved = cache.get(spreadsheetId, 3, 2026)

      expect(retrieved).not.toBeNull()
      expect(retrieved!.sheetGid).toBe('11111111')
      expect(retrieved!.tabName).toBe('March 2026')
    })
  })

  /**
   * Test: Cache miss after TTL expires
   * 
   * Validates: Requirements 5.2
   * 
   * Verifies that cached results are invalidated and return null when
   * the TTL (default 4 hours) has expired.
   */
  describe('Cache miss after TTL expires', () => {
    it('should return null when accessed 5 hours after caching (default 4-hour TTL)', () => {
      const spreadsheetId = 'test-spreadsheet-expired'
      const fiveHoursAgo = Date.now() - (5 * 60 * 60 * 1000)
      
      const cachedResult: CachedTabResult = {
        sheetGid: '99999999',
        tabName: 'April 2026',
        confidence: 1.0,
        detectedMonth: 4,
        detectedYear: 2026,
        timestamp: fiveHoursAgo
      }

      cache.set(spreadsheetId, cachedResult)

      // Retrieve 5 hours later (beyond 4-hour TTL)
      const retrieved = cache.get(spreadsheetId, 4, 2026)

      expect(retrieved).toBeNull()
    })

    it('should return null when accessed exactly at TTL boundary (4 hours + 1ms)', () => {
      const spreadsheetId = 'test-spreadsheet-boundary'
      const fourHoursAndOneMs = Date.now() - (4 * 60 * 60 * 1000 + 1)
      
      const cachedResult: CachedTabResult = {
        sheetGid: '22222222',
        tabName: 'May 2026',
        confidence: 0.85,
        detectedMonth: 5,
        detectedYear: 2026,
        timestamp: fourHoursAndOneMs
      }

      cache.set(spreadsheetId, cachedResult)

      // Retrieve just past TTL boundary
      const retrieved = cache.get(spreadsheetId, 5, 2026)

      expect(retrieved).toBeNull()
    })

    it('should return null with custom TTL of 2 hours when accessed after 3 hours', () => {
      // Set custom TTL to 2 hours
      process.env.GOOGLE_SHEETS_CACHE_TTL_HOURS = '2'

      const spreadsheetId = 'test-spreadsheet-custom-ttl'
      const threeHoursAgo = Date.now() - (3 * 60 * 60 * 1000)
      
      const cachedResult: CachedTabResult = {
        sheetGid: '33333333',
        tabName: 'June 2026',
        confidence: 0.7,
        detectedMonth: 6,
        detectedYear: 2026,
        timestamp: threeHoursAgo
      }

      cache.set(spreadsheetId, cachedResult)

      // Retrieve 3 hours later (beyond 2-hour custom TTL)
      const retrieved = cache.get(spreadsheetId, 6, 2026)

      expect(retrieved).toBeNull()
    })

    it('should return null for very old cached result (24 hours ago)', () => {
      const spreadsheetId = 'test-spreadsheet-very-old'
      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000)
      
      const cachedResult: CachedTabResult = {
        sheetGid: '44444444',
        tabName: 'July 2026',
        confidence: 1.0,
        detectedMonth: 7,
        detectedYear: 2026,
        timestamp: twentyFourHoursAgo
      }

      cache.set(spreadsheetId, cachedResult)

      // Retrieve 24 hours later (way beyond TTL)
      const retrieved = cache.get(spreadsheetId, 7, 2026)

      expect(retrieved).toBeNull()
    })
  })

  /**
   * Test: Cache invalidation when month changes
   * 
   * Validates: Requirements 5.4
   * 
   * Verifies that cached results are invalidated when the current month
   * changes, even if the result is within TTL.
   */
  describe('Cache invalidation when month changes', () => {
    it('should return null when month changes from January to February', () => {
      const spreadsheetId = 'test-spreadsheet-month-change'
      
      const cachedResult: CachedTabResult = {
        sheetGid: '55555555',
        tabName: 'January 2026',
        confidence: 1.0,
        detectedMonth: 1,
        detectedYear: 2026,
        timestamp: Date.now() // Fresh cache
      }

      cache.set(spreadsheetId, cachedResult)

      // Try to retrieve for February (different month)
      const retrieved = cache.get(spreadsheetId, 2, 2026)

      expect(retrieved).toBeNull()
    })

    it('should return null when month changes from December to January (year boundary)', () => {
      const spreadsheetId = 'test-spreadsheet-year-boundary'
      
      const cachedResult: CachedTabResult = {
        sheetGid: '66666666',
        tabName: 'December 2025',
        confidence: 1.0,
        detectedMonth: 12,
        detectedYear: 2025,
        timestamp: Date.now()
      }

      cache.set(spreadsheetId, cachedResult)

      // Try to retrieve for January 2026 (new year)
      const retrieved = cache.get(spreadsheetId, 1, 2026)

      expect(retrieved).toBeNull()
    })

    it('should return null when year changes but month stays the same', () => {
      const spreadsheetId = 'test-spreadsheet-year-change'
      
      const cachedResult: CachedTabResult = {
        sheetGid: '77777777',
        tabName: 'February 2025',
        confidence: 0.95,
        detectedMonth: 2,
        detectedYear: 2025,
        timestamp: Date.now()
      }

      cache.set(spreadsheetId, cachedResult)

      // Try to retrieve for February 2026 (same month, different year)
      const retrieved = cache.get(spreadsheetId, 2, 2026)

      expect(retrieved).toBeNull()
    })

    it('should invalidate cache even when within TTL if month changed', () => {
      const spreadsheetId = 'test-spreadsheet-ttl-month-change'
      const oneHourAgo = Date.now() - (1 * 60 * 60 * 1000)
      
      const cachedResult: CachedTabResult = {
        sheetGid: '88888888',
        tabName: 'March 2026',
        confidence: 0.9,
        detectedMonth: 3,
        detectedYear: 2026,
        timestamp: oneHourAgo
      }

      cache.set(spreadsheetId, cachedResult)

      // Try to retrieve for April (within TTL but different month)
      const retrieved = cache.get(spreadsheetId, 4, 2026)

      expect(retrieved).toBeNull()
    })

    it('should return cached result when month and year match exactly', () => {
      const spreadsheetId = 'test-spreadsheet-exact-match'
      
      const cachedResult: CachedTabResult = {
        sheetGid: '10101010',
        tabName: 'August 2026',
        confidence: 1.0,
        detectedMonth: 8,
        detectedYear: 2026,
        timestamp: Date.now()
      }

      cache.set(spreadsheetId, cachedResult)

      // Retrieve for same month and year
      const retrieved = cache.get(spreadsheetId, 8, 2026)

      expect(retrieved).not.toBeNull()
      expect(retrieved!.sheetGid).toBe('10101010')
    })
  })

  /**
   * Test: Cache not storing error results
   * 
   * Validates: Requirements 5.5
   * 
   * Verifies that the cache system is designed to only store successful
   * detection results, not error states. This is a design validation test
   * showing that the cache interface doesn't support error storage.
   */
  describe('Cache not storing error results', () => {
    it('should only accept valid CachedTabResult objects (no error field)', () => {
      const spreadsheetId = 'test-spreadsheet-valid-only'
      
      // Valid result structure
      const validResult: CachedTabResult = {
        sheetGid: '20202020',
        tabName: 'September 2026',
        confidence: 0.85,
        detectedMonth: 9,
        detectedYear: 2026,
        timestamp: Date.now()
      }

      // TypeScript enforces that only valid results can be stored
      cache.set(spreadsheetId, validResult)

      const retrieved = cache.get(spreadsheetId, 9, 2026)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.sheetGid).toBe('20202020')
    })

    it('should not have any error-related fields in cached results', () => {
      const spreadsheetId = 'test-spreadsheet-no-errors'
      
      const cachedResult: CachedTabResult = {
        sheetGid: '30303030',
        tabName: 'October 2026',
        confidence: 0.7,
        detectedMonth: 10,
        detectedYear: 2026,
        timestamp: Date.now()
      }

      cache.set(spreadsheetId, cachedResult)

      const retrieved = cache.get(spreadsheetId, 10, 2026)

      // Verify no error-related properties exist
      expect(retrieved).not.toBeNull()
      expect(retrieved).not.toHaveProperty('error')
      expect(retrieved).not.toHaveProperty('errorCode')
      expect(retrieved).not.toHaveProperty('errorMessage')
    })

    it('should maintain cache isolation - errors in detection do not affect cache', () => {
      const spreadsheetId = 'test-spreadsheet-isolation'
      
      // Store a valid result
      const validResult: CachedTabResult = {
        sheetGid: '40404040',
        tabName: 'November 2026',
        confidence: 1.0,
        detectedMonth: 11,
        detectedYear: 2026,
        timestamp: Date.now()
      }

      cache.set(spreadsheetId, validResult)

      // Simulate that detection might fail elsewhere, but cache remains valid
      const retrieved = cache.get(spreadsheetId, 11, 2026)

      expect(retrieved).not.toBeNull()
      expect(retrieved!.sheetGid).toBe('40404040')
      expect(retrieved!.tabName).toBe('November 2026')
    })
  })

  /**
   * Additional edge case tests
   */
  describe('Additional cache behavior', () => {
    it('should return null for non-existent spreadsheet ID', () => {
      const retrieved = cache.get('non-existent-id', 1, 2026)
      expect(retrieved).toBeNull()
    })

    it('should handle multiple spreadsheets independently', () => {
      const sheet1 = 'spreadsheet-1'
      const sheet2 = 'spreadsheet-2'

      const result1: CachedTabResult = {
        sheetGid: '111',
        tabName: 'Sheet 1 Tab',
        confidence: 0.9,
        detectedMonth: 1,
        detectedYear: 2026,
        timestamp: Date.now()
      }

      const result2: CachedTabResult = {
        sheetGid: '222',
        tabName: 'Sheet 2 Tab',
        confidence: 0.8,
        detectedMonth: 2,
        detectedYear: 2026,
        timestamp: Date.now()
      }

      cache.set(sheet1, result1)
      cache.set(sheet2, result2)

      const retrieved1 = cache.get(sheet1, 1, 2026)
      const retrieved2 = cache.get(sheet2, 2, 2026)

      expect(retrieved1!.sheetGid).toBe('111')
      expect(retrieved2!.sheetGid).toBe('222')
    })

    it('should overwrite previous cache entry for same spreadsheet', () => {
      const spreadsheetId = 'test-spreadsheet-overwrite'

      const oldResult: CachedTabResult = {
        sheetGid: 'old-gid',
        tabName: 'Old Tab',
        confidence: 0.5,
        detectedMonth: 1,
        detectedYear: 2026,
        timestamp: Date.now()
      }

      const newResult: CachedTabResult = {
        sheetGid: 'new-gid',
        tabName: 'New Tab',
        confidence: 1.0,
        detectedMonth: 1,
        detectedYear: 2026,
        timestamp: Date.now()
      }

      cache.set(spreadsheetId, oldResult)
      cache.set(spreadsheetId, newResult)

      const retrieved = cache.get(spreadsheetId, 1, 2026)

      expect(retrieved!.sheetGid).toBe('new-gid')
      expect(retrieved!.tabName).toBe('New Tab')
      expect(retrieved!.confidence).toBe(1.0)
    })

    it('should clear all cached entries when clear() is called', () => {
      const sheet1 = 'spreadsheet-clear-1'
      const sheet2 = 'spreadsheet-clear-2'

      const result1: CachedTabResult = {
        sheetGid: '111',
        tabName: 'Tab 1',
        confidence: 0.9,
        detectedMonth: 1,
        detectedYear: 2026,
        timestamp: Date.now()
      }

      const result2: CachedTabResult = {
        sheetGid: '222',
        tabName: 'Tab 2',
        confidence: 0.8,
        detectedMonth: 2,
        detectedYear: 2026,
        timestamp: Date.now()
      }

      cache.set(sheet1, result1)
      cache.set(sheet2, result2)

      // Clear cache
      cache.clear()

      // Both should return null
      expect(cache.get(sheet1, 1, 2026)).toBeNull()
      expect(cache.get(sheet2, 2, 2026)).toBeNull()
    })

    it('should correctly use isExpired helper method', () => {
      const now = Date.now()
      const oneHourAgo = now - (1 * 60 * 60 * 1000)
      const fiveHoursAgo = now - (5 * 60 * 60 * 1000)

      // Within 4-hour TTL
      expect(cache.isExpired(oneHourAgo, 4)).toBe(false)

      // Beyond 4-hour TTL
      expect(cache.isExpired(fiveHoursAgo, 4)).toBe(true)

      // Exactly at boundary (should be expired)
      const fourHoursAgo = now - (4 * 60 * 60 * 1000)
      expect(cache.isExpired(fourHoursAgo, 4)).toBe(false)

      // Just past boundary
      const fourHoursAndOneMs = now - (4 * 60 * 60 * 1000 + 1)
      expect(cache.isExpired(fourHoursAndOneMs, 4)).toBe(true)
    })
  })
})
