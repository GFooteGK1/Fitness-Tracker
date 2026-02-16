/**
 * Tab Cache - In-memory caching for tab detection results
 * 
 * Minimizes Google Sheets API calls by caching tab detection results
 * with TTL-based and month-based invalidation.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { CachedTabResult } from './types'

/**
 * In-memory cache for tab detection results
 * 
 * Cache invalidation rules:
 * 1. TTL expired (default 4 hours, configurable via GOOGLE_SHEETS_CACHE_TTL_HOURS)
 * 2. Current month changed (new month started)
 * 3. Manual clear (for testing/debugging)
 */
export class TabCache {
  private cache: Map<string, CachedTabResult> = new Map()

  /**
   * Retrieves a cached tab result if valid
   * 
   * @param spreadsheetId - The Google Sheets spreadsheet ID
   * @param currentMonth - Current month (1-12)
   * @param currentYear - Current year (4-digit)
   * @returns Cached result if valid, null if cache miss or expired
   * 
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4
   */
  get(
    spreadsheetId: string,
    currentMonth: number,
    currentYear: number
  ): CachedTabResult | null {
    const cached = this.cache.get(spreadsheetId)
    
    // Cache miss
    if (!cached) {
      return null
    }

    // Check TTL expiration
    const ttlHours = parseInt(process.env.GOOGLE_SHEETS_CACHE_TTL_HOURS || '4', 10)
    const ttlMs = ttlHours * 60 * 60 * 1000
    const isExpired = Date.now() - cached.timestamp > ttlMs

    // Check if month changed
    const monthChanged =
      cached.detectedMonth !== currentMonth ||
      cached.detectedYear !== currentYear

    // Invalidate if expired or month changed
    if (isExpired || monthChanged) {
      this.cache.delete(spreadsheetId)
      return null
    }

    return cached
  }

  /**
   * Stores a tab detection result in cache
   * 
   * @param spreadsheetId - The Google Sheets spreadsheet ID
   * @param result - The tab detection result to cache
   * 
   * Validates: Requirements 5.1
   */
  set(spreadsheetId: string, result: CachedTabResult): void {
    this.cache.set(spreadsheetId, result)
  }

  /**
   * Clears all cached results
   * 
   * Used for testing/debugging or manual cache invalidation
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Checks if a cached result is expired based on TTL
   * 
   * @param timestamp - The timestamp when the result was cached (ms since epoch)
   * @param ttlHours - Time-to-live in hours
   * @returns true if expired, false otherwise
   * 
   * Validates: Requirements 5.2
   */
  isExpired(timestamp: number, ttlHours: number): boolean {
    const ttlMs = ttlHours * 60 * 60 * 1000
    return Date.now() - timestamp > ttlMs
  }
}

/**
 * Singleton instance of TabCache
 * 
 * Shared across all tab detection calls to maintain cache state
 * 
 * Validates: Requirements 5.6 (in-memory storage)
 */
export const tabCache = new TabCache()
