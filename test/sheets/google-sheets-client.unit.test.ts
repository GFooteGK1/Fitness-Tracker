/**
 * Unit Tests: Google Sheets Client API Error Handling
 * 
 * Tests specific error handling scenarios for the Google Sheets API client.
 * Validates Requirements: 1.2, 7.4, 7.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchSheetTabs } from '@/app/lib/sheets/google-sheets-client'
import { TabDetectionError } from '@/app/lib/sheets/types'

describe('Google Sheets Client - Unit Tests: API Error Handling', () => {
  const TEST_SPREADSHEET_ID = 'test-spreadsheet-id'
  const TEST_API_KEY = 'test-api-key'

  // Store original fetch
  const originalFetch = global.fetch

  beforeEach(() => {
    // Reset fetch mock before each test
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch
  })

  describe('401 Unauthorized Error', () => {
    it('should throw CONFIG_ERROR for 401 unauthorized', async () => {
      // Mock fetch to return 401
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            message: 'Invalid API key'
          }
        })
      })

      await expect(fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY))
        .rejects.toThrow(TabDetectionError)

      try {
        await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)
      } catch (error) {
        expect(error).toBeInstanceOf(TabDetectionError)
        expect((error as TabDetectionError).code).toBe('CONFIG_ERROR')
        expect((error as TabDetectionError).message).toContain('Invalid Google Sheets API key')
        expect((error as TabDetectionError).details).toMatchObject({
          status: 401,
          spreadsheetId: TEST_SPREADSHEET_ID
        })
      }
    })

    it('should include troubleshooting guidance in error message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Unauthorized' } })
      })

      try {
        await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)
      } catch (error) {
        expect((error as TabDetectionError).message).toContain('GOOGLE_SHEETS_API_KEY')
      }
    })
  })

  describe('403 Forbidden Error', () => {
    it('should throw API_ERROR for 403 forbidden', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            message: 'The caller does not have permission'
          }
        })
      })

      await expect(fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY))
        .rejects.toThrow(TabDetectionError)

      try {
        await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)
      } catch (error) {
        expect(error).toBeInstanceOf(TabDetectionError)
        expect((error as TabDetectionError).code).toBe('API_ERROR')
        expect((error as TabDetectionError).message).toContain('Access forbidden')
        expect((error as TabDetectionError).details).toMatchObject({
          status: 403,
          spreadsheetId: TEST_SPREADSHEET_ID
        })
      }
    })

    it('should include permissions guidance in error details', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Forbidden' } })
      })

      try {
        await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)
      } catch (error) {
        expect((error as TabDetectionError).details.troubleshooting).toContain('spreadsheet sharing settings')
        expect((error as TabDetectionError).details.troubleshooting).toContain('API key restrictions')
      }
    })
  })

  describe('404 Not Found Error', () => {
    it('should throw API_ERROR for 404 not found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          error: {
            message: 'Requested entity was not found'
          }
        })
      })

      await expect(fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY))
        .rejects.toThrow(TabDetectionError)

      try {
        await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)
      } catch (error) {
        expect(error).toBeInstanceOf(TabDetectionError)
        expect((error as TabDetectionError).code).toBe('CONFIG_ERROR')
        expect((error as TabDetectionError).message).toContain('Spreadsheet not found')
        expect((error as TabDetectionError).message).toContain(TEST_SPREADSHEET_ID)
        expect((error as TabDetectionError).details).toMatchObject({
          status: 404,
          spreadsheetId: TEST_SPREADSHEET_ID
        })
      }
    })
  })

  describe('429 Rate Limit Error', () => {
    it('should retry with exponential backoff on 429', async () => {
      let callCount = 0
      const startTime = Date.now()

      global.fetch = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount < 3) {
          return Promise.resolve({
            ok: false,
            status: 429,
            json: async () => ({ error: { message: 'Rate limit exceeded' } })
          })
        }
        // Third attempt succeeds
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            sheets: [
              {
                properties: {
                  sheetId: 123,
                  title: 'Test Tab',
                  index: 0
                }
              }
            ]
          })
        })
      })

      const result = await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)

      expect(callCount).toBe(3)
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Test Tab')

      // Verify exponential backoff delays occurred (1s + 2s = ~3s minimum)
      const elapsed = Date.now() - startTime
      expect(elapsed).toBeGreaterThanOrEqual(3000)
    })

    it('should throw API_ERROR after max retries on 429', async () => {
      let callCount = 0

      global.fetch = vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve({
          ok: false,
          status: 429,
          json: async () => ({ error: { message: 'Rate limit exceeded' } })
        })
      })

      try {
        await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(TabDetectionError)
        expect((error as TabDetectionError).code).toBe('API_ERROR')
        expect((error as TabDetectionError).message).toContain('rate limit')
        expect((error as TabDetectionError).details.troubleshooting).toContain('Wait a few minutes')
        expect(callCount).toBe(3) // MAX_RETRIES
      }
    }, 10000)
  })

  describe('500 Server Error', () => {
    it('should retry with exponential backoff on 500', async () => {
      let callCount = 0

      global.fetch = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount < 2) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({ error: { message: 'Internal server error' } })
          })
        }
        // Second attempt succeeds
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            sheets: [
              {
                properties: {
                  sheetId: 456,
                  title: 'Server Recovery Tab',
                  index: 0
                }
              }
            ]
          })
        })
      })

      const result = await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)

      expect(callCount).toBe(2)
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Server Recovery Tab')
    })

    it('should throw API_ERROR after max retries on 500', async () => {
      let callCount = 0

      global.fetch = vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: { message: 'Internal server error' } })
        })
      })

      try {
        await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(TabDetectionError)
        expect((error as TabDetectionError).code).toBe('API_ERROR')
        expect((error as TabDetectionError).message).toContain('server error')
        expect(callCount).toBe(3) // MAX_RETRIES
      }
    }, 10000)

    it('should retry on 502 Bad Gateway', async () => {
      let callCount = 0

      global.fetch = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 502,
            json: async () => ({ error: { message: 'Bad Gateway' } })
          })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            sheets: [
              {
                properties: {
                  sheetId: 789,
                  title: 'Gateway Recovery',
                  index: 0
                }
              }
            ]
          })
        })
      })

      const result = await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)

      expect(callCount).toBe(2)
      expect(result[0].title).toBe('Gateway Recovery')
    })

    it('should retry on 503 Service Unavailable', async () => {
      let callCount = 0

      global.fetch = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 503,
            json: async () => ({ error: { message: 'Service Unavailable' } })
          })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            sheets: [
              {
                properties: {
                  sheetId: 101,
                  title: 'Service Recovery',
                  index: 0
                }
              }
            ]
          })
        })
      })

      const result = await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)

      expect(callCount).toBe(2)
      expect(result[0].title).toBe('Service Recovery')
    })
  })

  describe('Network Errors', () => {
    it('should retry on network failure', async () => {
      let callCount = 0

      global.fetch = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.reject(new Error('Network request failed'))
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            sheets: [
              {
                properties: {
                  sheetId: 999,
                  title: 'Network Recovery',
                  index: 0
                }
              }
            ]
          })
        })
      })

      const result = await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)

      expect(callCount).toBe(2)
      expect(result[0].title).toBe('Network Recovery')
    })

    it('should throw API_ERROR after max retries on network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network request failed'))

      try {
        await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(TabDetectionError)
        expect((error as TabDetectionError).code).toBe('API_ERROR')
        expect((error as TabDetectionError).message).toContain('Failed to fetch sheet tabs after 3 attempts')
      }
    }, 10000)
  })

  describe('Configuration Errors', () => {
    it('should throw CONFIG_ERROR for missing spreadsheet ID', async () => {
      await expect(fetchSheetTabs('', TEST_API_KEY))
        .rejects.toThrow(TabDetectionError)

      try {
        await fetchSheetTabs('', TEST_API_KEY)
      } catch (error) {
        expect((error as TabDetectionError).code).toBe('CONFIG_ERROR')
        expect((error as TabDetectionError).message).toContain('Missing required configuration')
      }
    })

    it('should throw CONFIG_ERROR for missing API key', async () => {
      await expect(fetchSheetTabs(TEST_SPREADSHEET_ID, ''))
        .rejects.toThrow(TabDetectionError)

      try {
        await fetchSheetTabs(TEST_SPREADSHEET_ID, '')
      } catch (error) {
        expect((error as TabDetectionError).code).toBe('CONFIG_ERROR')
        expect((error as TabDetectionError).message).toContain('Missing required configuration')
      }
    })
  })

  describe('Response Parsing Errors', () => {
    it('should throw PARSE_ERROR for invalid JSON response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON')
        }
      })

      await expect(fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY))
        .rejects.toThrow(TabDetectionError)

      try {
        await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)
      } catch (error) {
        expect((error as TabDetectionError).code).toBe('PARSE_ERROR')
        expect((error as TabDetectionError).message).toContain('Failed to parse')
      }
    })

    it('should throw NO_TABS_FOUND for empty sheets array', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sheets: []
        })
      })

      await expect(fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY))
        .rejects.toThrow(TabDetectionError)

      try {
        await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)
      } catch (error) {
        expect((error as TabDetectionError).code).toBe('NO_TABS_FOUND')
        expect((error as TabDetectionError).message).toContain('contains no tabs')
      }
    })

    it('should throw NO_TABS_FOUND for missing sheets property', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          // Missing sheets property
        })
      })

      await expect(fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY))
        .rejects.toThrow(TabDetectionError)

      try {
        await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)
      } catch (error) {
        expect((error as TabDetectionError).code).toBe('NO_TABS_FOUND')
      }
    })
  })

  describe('Exponential Backoff Timing', () => {
    it('should use correct delay intervals (1s, 2s)', async () => {
      const delays: number[] = []
      let callCount = 0
      let lastCallTime = Date.now()

      global.fetch = vi.fn().mockImplementation(() => {
        const now = Date.now()
        if (callCount > 0) {
          delays.push(now - lastCallTime)
        }
        lastCallTime = now
        callCount++

        if (callCount < 3) {
          return Promise.resolve({
            ok: false,
            status: 429,
            json: async () => ({ error: { message: 'Rate limit' } })
          })
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            sheets: [
              {
                properties: {
                  sheetId: 1,
                  title: 'Test',
                  index: 0
                }
              }
            ]
          })
        })
      })

      await fetchSheetTabs(TEST_SPREADSHEET_ID, TEST_API_KEY)

      expect(callCount).toBe(3)
      expect(delays).toHaveLength(2)
      
      // First delay should be ~1000ms (allow 100ms tolerance)
      expect(delays[0]).toBeGreaterThanOrEqual(900)
      expect(delays[0]).toBeLessThanOrEqual(1100)
      
      // Second delay should be ~2000ms (allow 100ms tolerance)
      expect(delays[1]).toBeGreaterThanOrEqual(1900)
      expect(delays[1]).toBeLessThanOrEqual(2100)
    }, 10000)
  })
})
