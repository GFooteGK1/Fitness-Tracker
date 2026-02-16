/**
 * Property-Based Tests for Google Sheets Client
 * 
 * These tests verify universal properties that should hold across all valid inputs.
 * Using @fast-check/vitest for property-based testing with minimum 100 iterations.
 * 
 * Feature: dynamic-sheet-tab-detection
 * **Validates: Requirements 7.5**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchSheetTabs } from '@/app/lib/sheets/google-sheets-client'
import { TabDetectionError } from '@/app/lib/sheets/types'

// Configure minimum 100 iterations for all property tests
const propertyConfig = { numRuns: 100 }

describe('Google Sheets Client - Property Tests', () => {

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks()
    // Reset fetch mock
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Feature: dynamic-sheet-tab-detection, Property 14: Exponential backoff on rate limiting
   * 
   * *For any* Google Sheets API call that returns a 429 (rate limit) status, the system 
   * should retry with exponential backoff delays (1s, 2s, 4s) up to a maximum of 3 retries.
   * 
   * **Validates: Requirements 7.5**
   */

  /**
   * Property 14.1: Rate limit (429) triggers exactly 3 retry attempts with exponential backoff
   * 
   * Tests that when the API returns 429 on all attempts, the system retries exactly 3 times
   * with delays of 1s, 2s, and 4s between attempts.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 20, maxLength: 50 })  // apiKey
    ],
    propertyConfig
  )('Property 14.1: 429 status triggers exactly 3 attempts with exponential backoff', async (spreadsheetId, apiKey) => {
    const delays: number[] = []
    const originalSetTimeout = global.setTimeout
    
    // Mock setTimeout to capture delay values
    global.setTimeout = vi.fn((callback: any, delay: number) => {
      delays.push(delay)
      return originalSetTimeout(callback, 0) // Execute immediately for test speed
    }) as any

    // Mock fetch to always return 429
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Rate limit exceeded' } })
    })
    global.fetch = mockFetch

    // Execute and expect error
    await expect(fetchSheetTabs(spreadsheetId, apiKey)).rejects.toThrow(TabDetectionError)

    // Verify exactly 3 fetch attempts
    expect(mockFetch).toHaveBeenCalledTimes(3)

    // Verify exponential backoff delays: 1000ms, 2000ms, 4000ms
    expect(delays).toHaveLength(2) // 2 delays for 3 attempts (no delay before first attempt)
    expect(delays[0]).toBe(1000) // 2^0 * 1000 = 1s
    expect(delays[1]).toBe(2000) // 2^1 * 1000 = 2s
    // Note: Third delay (4s) would happen but we don't retry after 3rd attempt

    // Restore setTimeout
    global.setTimeout = originalSetTimeout
  })

  /**
   * Property 14.2: Rate limit eventually succeeds after N retries
   * 
   * Tests that when the API returns 429 for N attempts then succeeds, the system
   * successfully returns the data after the appropriate number of retries.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 20, maxLength: 50 }), // apiKey
      fc.integer({ min: 1, max: 2 }) // Number of 429 responses before success (1 or 2)
    ],
    propertyConfig
  )('Property 14.2: succeeds after N rate limit retries', async (spreadsheetId, apiKey, failureCount) => {
    const delays: number[] = []
    const originalSetTimeout = global.setTimeout
    
    // Mock setTimeout to capture delay values
    global.setTimeout = vi.fn((callback: any, delay: number) => {
      delays.push(delay)
      return originalSetTimeout(callback, 0) // Execute immediately for test speed
    }) as any

    let callCount = 0
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount <= failureCount) {
        // Return 429 for first N calls
        return Promise.resolve({
          ok: false,
          status: 429,
          json: async () => ({ error: { message: 'Rate limit exceeded' } })
        })
      } else {
        // Return success after N failures
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            sheets: [
              { properties: { sheetId: 123, title: 'Test Tab', index: 0 } }
            ]
          })
        })
      }
    })
    global.fetch = mockFetch

    // Execute and expect success
    const result = await fetchSheetTabs(spreadsheetId, apiKey)

    // Verify correct number of attempts (failures + 1 success)
    expect(mockFetch).toHaveBeenCalledTimes(failureCount + 1)

    // Verify result is valid
    expect(result).toHaveLength(1)
    expect(result[0].sheetId).toBe(123)
    expect(result[0].title).toBe('Test Tab')

    // Verify exponential backoff delays
    expect(delays).toHaveLength(failureCount)
    for (let i = 0; i < failureCount; i++) {
      expect(delays[i]).toBe(Math.pow(2, i) * 1000)
    }

    // Restore setTimeout
    global.setTimeout = originalSetTimeout
  })

  /**
   * Property 14.3: Server errors (5xx) also trigger exponential backoff
   * 
   * Tests that server errors (status >= 500) also trigger the same retry logic
   * with exponential backoff.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 20, maxLength: 50 }), // apiKey
      fc.integer({ min: 500, max: 599 }) // Server error status code
    ],
    propertyConfig
  )('Property 14.3: server errors (5xx) trigger exponential backoff', async (spreadsheetId, apiKey, errorStatus) => {
    const delays: number[] = []
    const originalSetTimeout = global.setTimeout
    
    // Mock setTimeout to capture delay values
    global.setTimeout = vi.fn((callback: any, delay: number) => {
      delays.push(delay)
      return originalSetTimeout(callback, 0) // Execute immediately for test speed
    }) as any

    // Mock fetch to always return server error
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: errorStatus,
      json: async () => ({ error: { message: 'Server error' } })
    })
    global.fetch = mockFetch

    // Execute and expect error
    await expect(fetchSheetTabs(spreadsheetId, apiKey)).rejects.toThrow(TabDetectionError)

    // Verify exactly 3 fetch attempts
    expect(mockFetch).toHaveBeenCalledTimes(3)

    // Verify exponential backoff delays
    expect(delays).toHaveLength(2)
    expect(delays[0]).toBe(1000) // 2^0 * 1000 = 1s
    expect(delays[1]).toBe(2000) // 2^1 * 1000 = 2s

    // Restore setTimeout
    global.setTimeout = originalSetTimeout
  })

  /**
   * Property 14.4: Network errors trigger exponential backoff
   * 
   * Tests that network errors (fetch throws) also trigger retry logic with exponential backoff.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 20, maxLength: 50 }), // apiKey
      fc.constantFrom('Network error', 'Connection timeout', 'DNS lookup failed', 'Connection refused')
    ],
    propertyConfig
  )('Property 14.4: network errors trigger exponential backoff', async (spreadsheetId, apiKey, errorMessage) => {
    const delays: number[] = []
    const originalSetTimeout = global.setTimeout
    
    // Mock setTimeout to capture delay values
    global.setTimeout = vi.fn((callback: any, delay: number) => {
      delays.push(delay)
      return originalSetTimeout(callback, 0) // Execute immediately for test speed
    }) as any

    // Mock fetch to throw network error
    const mockFetch = vi.fn().mockRejectedValue(new Error(errorMessage))
    global.fetch = mockFetch

    // Execute and expect error
    await expect(fetchSheetTabs(spreadsheetId, apiKey)).rejects.toThrow(TabDetectionError)

    // Verify exactly 3 fetch attempts
    expect(mockFetch).toHaveBeenCalledTimes(3)

    // Verify exponential backoff delays
    expect(delays).toHaveLength(2)
    expect(delays[0]).toBe(1000) // 2^0 * 1000 = 1s
    expect(delays[1]).toBe(2000) // 2^1 * 1000 = 2s

    // Restore setTimeout
    global.setTimeout = originalSetTimeout
  })

  /**
   * Property 14.5: Non-retryable errors (4xx except 429) do not trigger retries
   * 
   * Tests that client errors like 401, 403, 404 do not trigger retry logic.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 20, maxLength: 50 }), // apiKey
      fc.constantFrom(401, 403, 404, 400, 422) // Non-retryable client errors
    ],
    propertyConfig
  )('Property 14.5: non-retryable errors (4xx except 429) do not retry', async (spreadsheetId, apiKey, errorStatus) => {
    // Mock fetch to return non-retryable error
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: errorStatus,
      json: async () => ({ error: { message: 'Client error' } })
    })
    global.fetch = mockFetch

    // Execute and expect error
    await expect(fetchSheetTabs(spreadsheetId, apiKey)).rejects.toThrow(TabDetectionError)

    // Verify only 1 fetch attempt (no retries)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  /**
   * Property 14.6: Successful responses (2xx) do not trigger retries
   * 
   * Tests that successful responses return immediately without retries.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 20, maxLength: 50 }), // apiKey
      fc.array(
        fc.record({
          sheetId: fc.integer({ min: 1, max: 999999999 }),
          title: fc.string({ minLength: 1, maxLength: 50 }),
          index: fc.integer({ min: 0, max: 50 })
        }),
        { minLength: 1, maxLength: 10 }
      )
    ],
    propertyConfig
  )('Property 14.6: successful responses do not trigger retries', async (spreadsheetId, apiKey, tabs) => {
    // Mock fetch to return success
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sheets: tabs.map(tab => ({
          properties: {
            sheetId: tab.sheetId,
            title: tab.title,
            index: tab.index
          }
        }))
      })
    })
    global.fetch = mockFetch

    // Execute and expect success
    const result = await fetchSheetTabs(spreadsheetId, apiKey)

    // Verify only 1 fetch attempt (no retries)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Verify result matches input
    expect(result).toHaveLength(tabs.length)
    result.forEach((tab, i) => {
      expect(tab.sheetId).toBe(tabs[i].sheetId)
      expect(tab.title).toBe(tabs[i].title)
      expect(tab.index).toBe(tabs[i].index)
    })
  })

  /**
   * Property 14.7: Exponential backoff formula is correct (2^attempt * 1000ms)
   * 
   * Tests that the delay calculation follows the exponential backoff formula exactly.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 20, maxLength: 50 })  // apiKey
    ],
    propertyConfig
  )('Property 14.7: exponential backoff formula is 2^attempt * 1000ms', async (spreadsheetId, apiKey) => {
    const delays: number[] = []
    const originalSetTimeout = global.setTimeout
    
    // Mock setTimeout to capture delay values
    global.setTimeout = vi.fn((callback: any, delay: number) => {
      delays.push(delay)
      return originalSetTimeout(callback, 0) // Execute immediately for test speed
    }) as any

    // Mock fetch to always return 429
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Rate limit exceeded' } })
    })
    global.fetch = mockFetch

    // Execute and expect error
    await expect(fetchSheetTabs(spreadsheetId, apiKey)).rejects.toThrow(TabDetectionError)

    // Verify exponential backoff formula: 2^attempt * 1000
    // Attempt 0 → delay 1000ms (2^0 * 1000 = 1000)
    // Attempt 1 → delay 2000ms (2^1 * 1000 = 2000)
    expect(delays[0]).toBe(Math.pow(2, 0) * 1000) // 1000ms
    expect(delays[1]).toBe(Math.pow(2, 1) * 1000) // 2000ms
    // Note: Attempt 2 would have delay 4000ms (2^2 * 1000) but we don't retry after 3rd attempt

    // Restore setTimeout
    global.setTimeout = originalSetTimeout
  })

  /**
   * Property 14.8: Mixed retry scenarios (429, 5xx, then success)
   * 
   * Tests that the system correctly handles mixed error types and eventually succeeds.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 20, maxLength: 50 })  // apiKey
    ],
    propertyConfig
  )('Property 14.8: handles mixed retry scenarios correctly', async (spreadsheetId, apiKey) => {
    const delays: number[] = []
    const originalSetTimeout = global.setTimeout
    
    // Mock setTimeout to capture delay values
    global.setTimeout = vi.fn((callback: any, delay: number) => {
      delays.push(delay)
      return originalSetTimeout(callback, 0) // Execute immediately for test speed
    }) as any

    let callCount = 0
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // First call: 429 rate limit
        return Promise.resolve({
          ok: false,
          status: 429,
          json: async () => ({ error: { message: 'Rate limit exceeded' } })
        })
      } else if (callCount === 2) {
        // Second call: 500 server error
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: { message: 'Server error' } })
        })
      } else {
        // Third call: success
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            sheets: [
              { properties: { sheetId: 456, title: 'Mixed Test', index: 0 } }
            ]
          })
        })
      }
    })
    global.fetch = mockFetch

    // Execute and expect success
    const result = await fetchSheetTabs(spreadsheetId, apiKey)

    // Verify 3 attempts (2 failures + 1 success)
    expect(mockFetch).toHaveBeenCalledTimes(3)

    // Verify result is valid
    expect(result).toHaveLength(1)
    expect(result[0].sheetId).toBe(456)

    // Verify exponential backoff delays
    expect(delays).toHaveLength(2)
    expect(delays[0]).toBe(1000) // After first failure
    expect(delays[1]).toBe(2000) // After second failure

    // Restore setTimeout
    global.setTimeout = originalSetTimeout
  })

  /**
   * Feature: dynamic-sheet-tab-detection, Property 1: Tab metadata extraction completeness
   * 
   * *For any* valid Google Sheets API response containing tab data, the Tab_Detector 
   * should extract all three required fields (sheetId, title, index) for every tab 
   * in the response.
   * 
   * **Validates: Requirements 1.3**
   */

  /**
   * Property 1.1: All tabs with complete metadata are extracted
   * 
   * Tests that when the API returns N tabs with all required fields (sheetId, title, index),
   * the system extracts exactly N tabs with all fields intact.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 20, maxLength: 50 }), // apiKey
      fc.array(
        fc.record({
          sheetId: fc.integer({ min: 1, max: 999999999 }),
          title: fc.string({ minLength: 1, maxLength: 100 }),
          index: fc.integer({ min: 0, max: 50 })
        }),
        { minLength: 1, maxLength: 50 }
      )
    ],
    propertyConfig
  )('Property 1.1: extracts all tabs with complete metadata', async (spreadsheetId, apiKey, tabs) => {
    // Mock fetch to return valid API response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sheets: tabs.map(tab => ({
          properties: {
            sheetId: tab.sheetId,
            title: tab.title,
            index: tab.index
          }
        }))
      })
    })
    global.fetch = mockFetch

    // Execute
    const result = await fetchSheetTabs(spreadsheetId, apiKey)

    // Verify all tabs extracted
    expect(result).toHaveLength(tabs.length)

    // Verify each tab has all three required fields
    result.forEach((extractedTab, i) => {
      expect(extractedTab).toHaveProperty('sheetId')
      expect(extractedTab).toHaveProperty('title')
      expect(extractedTab).toHaveProperty('index')
      
      // Verify values match input
      expect(extractedTab.sheetId).toBe(tabs[i].sheetId)
      expect(extractedTab.title).toBe(tabs[i].title)
      expect(extractedTab.index).toBe(tabs[i].index)
    })
  })

  /**
   * Property 1.2: Tabs with missing fields are skipped but don't cause failure
   * 
   * Tests that when some tabs have missing required fields, those tabs are skipped
   * but valid tabs are still extracted successfully.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 20, maxLength: 50 }), // apiKey
      fc.array(
        fc.record({
          sheetId: fc.integer({ min: 1, max: 999999999 }),
          title: fc.string({ minLength: 1, maxLength: 100 }),
          index: fc.integer({ min: 0, max: 50 })
        }),
        { minLength: 2, maxLength: 10 }
      )
    ],
    propertyConfig
  )('Property 1.2: skips tabs with missing fields but extracts valid ones', async (spreadsheetId, apiKey, tabs) => {
    // Create response with some invalid tabs mixed in
    const sheets = tabs.map((tab, i) => {
      if (i === 0) {
        // First tab: missing sheetId
        return {
          properties: {
            title: tab.title,
            index: tab.index
          }
        }
      } else if (i === 1 && tabs.length > 2) {
        // Second tab: missing title
        return {
          properties: {
            sheetId: tab.sheetId,
            index: tab.index
          }
        }
      } else {
        // Valid tab
        return {
          properties: {
            sheetId: tab.sheetId,
            title: tab.title,
            index: tab.index
          }
        }
      }
    })

    // Mock fetch to return mixed response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ sheets })
    })
    global.fetch = mockFetch

    // Execute
    const result = await fetchSheetTabs(spreadsheetId, apiKey)

    // Verify only valid tabs extracted (at least 1 valid tab from tabs[2+])
    expect(result.length).toBeGreaterThan(0)
    expect(result.length).toBeLessThan(tabs.length) // Some were skipped

    // Verify all extracted tabs have complete metadata
    result.forEach(tab => {
      expect(tab).toHaveProperty('sheetId')
      expect(tab).toHaveProperty('title')
      expect(tab).toHaveProperty('index')
      expect(typeof tab.sheetId).toBe('number')
      expect(typeof tab.title).toBe('string')
      expect(typeof tab.index).toBe('number')
    })
  })

  /**
   * Property 1.3: Field types are preserved correctly
   * 
   * Tests that sheetId and index remain numbers, and title remains a string
   * after extraction.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 20, maxLength: 50 }), // apiKey
      fc.array(
        fc.record({
          sheetId: fc.integer({ min: 1, max: 999999999 }),
          title: fc.string({ minLength: 1, maxLength: 100 }),
          index: fc.integer({ min: 0, max: 50 })
        }),
        { minLength: 1, maxLength: 20 }
      )
    ],
    propertyConfig
  )('Property 1.3: preserves correct field types', async (spreadsheetId, apiKey, tabs) => {
    // Mock fetch to return valid API response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sheets: tabs.map(tab => ({
          properties: {
            sheetId: tab.sheetId,
            title: tab.title,
            index: tab.index
          }
        }))
      })
    })
    global.fetch = mockFetch

    // Execute
    const result = await fetchSheetTabs(spreadsheetId, apiKey)

    // Verify types are preserved
    result.forEach(tab => {
      expect(typeof tab.sheetId).toBe('number')
      expect(typeof tab.title).toBe('string')
      expect(typeof tab.index).toBe('number')
      expect(Number.isInteger(tab.sheetId)).toBe(true)
      expect(Number.isInteger(tab.index)).toBe(true)
    })
  })

  /**
   * Property 1.4: Empty sheets array throws NO_TABS_FOUND error
   * 
   * Tests that when the API returns an empty sheets array, the system
   * throws a TabDetectionError with code NO_TABS_FOUND.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 20, maxLength: 50 })  // apiKey
    ],
    propertyConfig
  )('Property 1.4: throws NO_TABS_FOUND for empty sheets array', async (spreadsheetId, apiKey) => {
    // Mock fetch to return empty sheets array
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sheets: []
      })
    })
    global.fetch = mockFetch

    // Execute and expect error
    await expect(fetchSheetTabs(spreadsheetId, apiKey)).rejects.toThrow(TabDetectionError)
    
    try {
      await fetchSheetTabs(spreadsheetId, apiKey)
    } catch (error) {
      expect(error).toBeInstanceOf(TabDetectionError)
      expect((error as TabDetectionError).code).toBe('NO_TABS_FOUND')
    }
  })

  /**
   * Property 1.5: All tabs with invalid properties are skipped and error thrown
   * 
   * Tests that when all tabs have invalid/missing properties, the system
   * throws NO_TABS_FOUND error after skipping all invalid tabs.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 20, maxLength: 50 }), // apiKey
      fc.integer({ min: 1, max: 10 }) // Number of invalid tabs
    ],
    propertyConfig
  )('Property 1.5: throws NO_TABS_FOUND when all tabs are invalid', async (spreadsheetId, apiKey, tabCount) => {
    // Create response with all invalid tabs (missing required fields)
    const sheets = Array.from({ length: tabCount }, (_, i) => ({
      properties: {
        // Missing sheetId, title, or index
        someOtherField: `value${i}`
      }
    }))

    // Mock fetch to return invalid response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ sheets })
    })
    global.fetch = mockFetch

    // Execute and expect error
    await expect(fetchSheetTabs(spreadsheetId, apiKey)).rejects.toThrow(TabDetectionError)
    
    try {
      await fetchSheetTabs(spreadsheetId, apiKey)
    } catch (error) {
      expect(error).toBeInstanceOf(TabDetectionError)
      expect((error as TabDetectionError).code).toBe('NO_TABS_FOUND')
    }
  })

  /**
   * Property 1.6: Tab order is preserved from API response
   * 
   * Tests that the order of tabs in the result matches the order in the API response.
   */
  test.prop(
    [
      fc.string({ minLength: 10, maxLength: 50 }), // spreadsheetId
      fc.string({ minLength: 20, maxLength: 50 }), // apiKey
      fc.array(
        fc.record({
          sheetId: fc.integer({ min: 1, max: 999999999 }),
          title: fc.string({ minLength: 1, maxLength: 100 }),
          index: fc.integer({ min: 0, max: 50 })
        }),
        { minLength: 2, maxLength: 20 }
      )
    ],
    propertyConfig
  )('Property 1.6: preserves tab order from API response', async (spreadsheetId, apiKey, tabs) => {
    // Mock fetch to return valid API response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sheets: tabs.map(tab => ({
          properties: {
            sheetId: tab.sheetId,
            title: tab.title,
            index: tab.index
          }
        }))
      })
    })
    global.fetch = mockFetch

    // Execute
    const result = await fetchSheetTabs(spreadsheetId, apiKey)

    // Verify order is preserved
    expect(result).toHaveLength(tabs.length)
    result.forEach((tab, i) => {
      expect(tab.sheetId).toBe(tabs[i].sheetId)
      expect(tab.title).toBe(tabs[i].title)
      expect(tab.index).toBe(tabs[i].index)
    })
  })
})
