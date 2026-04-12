/**
 * End-to-End Integration Tests for Tab Detection
 *
 * Tests the full flow from date input → tab detection → CSV URL construction
 * using mocked Google Sheets API responses. Exercises all components together:
 * TabNameParser, GoogleSheetsClient, TabCache, TabDetector.
 *
 * Feature: dynamic-sheet-tab-detection
 * Requirements: All requirements
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectCurrentTab } from '@/app/lib/sheets/tab-detector'
import { tabCache } from '@/app/lib/sheets/tab-cache'
import { TabDetectionError } from '@/app/lib/sheets/types'

const SHEET_ID = '1Y0n4WgGu_MzJDDS-6-iAQlaMuZpULj1DIYioSbVW08g'

/**
 * Helper: build a mock Google Sheets API response
 */
function mockSheetsResponse(tabs: Array<{ sheetId: number; title: string; index: number }>) {
  return {
    sheets: tabs.map(t => ({
      properties: { sheetId: t.sheetId, title: t.title, index: t.index }
    }))
  }
}

describe('End-to-End Tab Detection Flow', () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env = { ...originalEnv, GOOGLE_SHEETS_API_KEY: 'test-api-key' }
    tabCache.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = originalEnv
    vi.restoreAllMocks()
    tabCache.clear()
  })

  describe('Happy path: current month detection', () => {
    it('should detect current month tab and produce correct CSV URL', async () => {
      const referenceDate = new Date('2026-02-15T00:00:00')

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSheetsResponse([
          { sheetId: 100, title: 'January 2026', index: 0 },
          { sheetId: 200, title: 'February 2026', index: 1 },
          { sheetId: 300, title: 'March 2026', index: 2 }
        ])
      })

      const result = await detectCurrentTab(SHEET_ID, referenceDate)

      expect(result.sheetGid).toBe('200')
      expect(result.tabName).toBe('February 2026')
      expect(result.confidence).toBe(1.0)
      expect(result.isFallback).toBe(false)
      expect(result.detectedDate).toEqual({ month: 2, year: 2026 })
      expect(result.warning).toBeUndefined()

      // Verify CSV URL construction
      const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${result.sheetGid}`
      expect(csvUrl).toContain('gid=200')
      expect(csvUrl).toContain('format=csv')
      expect(csvUrl).toContain(SHEET_ID)
    })

    it('should pick highest confidence format when multiple match current month', async () => {
      const referenceDate = new Date('2026-03-01T00:00:00')

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSheetsResponse([
          { sheetId: 100, title: '03/2026', index: 0 },      // 0.85
          { sheetId: 200, title: 'March 2026', index: 1 },    // 1.0
          { sheetId: 300, title: '2026-03', index: 2 }         // 0.9
        ])
      })

      const result = await detectCurrentTab(SHEET_ID, referenceDate)

      expect(result.sheetGid).toBe('200')
      expect(result.confidence).toBe(1.0)
      expect(result.isFallback).toBe(false)
    })
  })

  describe('Fallback: most recent dated tab', () => {
    it('should fall back to most recent past month when current month absent', async () => {
      const referenceDate = new Date('2026-04-10T00:00:00')

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSheetsResponse([
          { sheetId: 100, title: 'January 2026', index: 0 },
          { sheetId: 200, title: 'February 2026', index: 1 },
          { sheetId: 300, title: 'March 2026', index: 2 }
        ])
      })

      const result = await detectCurrentTab(SHEET_ID, referenceDate)

      expect(result.sheetGid).toBe('300')
      expect(result.tabName).toBe('March 2026')
      expect(result.isFallback).toBe(true)
      expect(result.warning).toContain('most recent dated tab')
    })
  })

  describe('Fallback: rightmost tab', () => {
    it('should fall back to rightmost tab when no tabs have dates', async () => {
      const referenceDate = new Date('2026-02-01T00:00:00')

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSheetsResponse([
          { sheetId: 100, title: 'Sheet1', index: 0 },
          { sheetId: 200, title: 'Data', index: 1 },
          { sheetId: 300, title: 'Summary', index: 2 }
        ])
      })

      const result = await detectCurrentTab(SHEET_ID, referenceDate)

      expect(result.sheetGid).toBe('300')
      expect(result.tabName).toBe('Summary')
      expect(result.confidence).toBe(0.5)
      expect(result.isFallback).toBe(true)
      expect(result.warning).toContain('No dated tabs found')
    })
  })

  describe('Cache behavior', () => {
    it('should use cache on second call and skip API', async () => {
      const referenceDate = new Date('2026-02-15T00:00:00')
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSheetsResponse([
          { sheetId: 200, title: 'February 2026', index: 0 }
        ])
      })
      global.fetch = fetchMock

      // First call hits API
      const result1 = await detectCurrentTab(SHEET_ID, referenceDate)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // Second call uses cache
      const result2 = await detectCurrentTab(SHEET_ID, referenceDate)
      expect(fetchMock).toHaveBeenCalledTimes(1) // Still 1 — no new API call

      expect(result2.sheetGid).toBe(result1.sheetGid)
      expect(result2.tabName).toBe(result1.tabName)
    })

    it('should not cache fallback results', async () => {
      const referenceDate = new Date('2026-04-15T00:00:00')
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSheetsResponse([
          { sheetId: 100, title: 'March 2026', index: 0 }
        ])
      })
      global.fetch = fetchMock

      // First call — fallback
      await detectCurrentTab(SHEET_ID, referenceDate)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // Second call — should hit API again because fallback was not cached
      await detectCurrentTab(SHEET_ID, referenceDate)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('should invalidate cache when month changes', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSheetsResponse([
          { sheetId: 200, title: 'February 2026', index: 0 },
          { sheetId: 300, title: 'March 2026', index: 1 }
        ])
      })
      global.fetch = fetchMock

      // Call for February
      const febDate = new Date('2026-02-15T00:00:00')
      const result1 = await detectCurrentTab(SHEET_ID, febDate)
      expect(result1.tabName).toBe('February 2026')
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // Call for March — cache should miss because month changed
      const marDate = new Date('2026-03-01T00:00:00')
      const result2 = await detectCurrentTab(SHEET_ID, marDate)
      expect(result2.tabName).toBe('March 2026')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('Error handling', () => {
    it('should throw CONFIG_ERROR when API key is missing', async () => {
      delete process.env.GOOGLE_SHEETS_API_KEY

      try {
        await detectCurrentTab(SHEET_ID)
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(TabDetectionError)
        expect((e as TabDetectionError).code).toBe('CONFIG_ERROR')
      }
    })

    it('should throw API_ERROR when API returns 403', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Forbidden' } })
      })

      try {
        await detectCurrentTab(SHEET_ID)
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(TabDetectionError)
        expect((e as TabDetectionError).code).toBe('API_ERROR')
      }
    })

    it('should throw NO_TABS_FOUND when spreadsheet is empty', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ sheets: [] })
      })

      try {
        await detectCurrentTab(SHEET_ID)
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(TabDetectionError)
        expect((e as TabDetectionError).code).toBe('NO_TABS_FOUND')
      }
    })

    it('should retry and succeed after transient failures', async () => {
      let callCount = 0
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockSheetsResponse([
            { sheetId: 200, title: 'February 2026', index: 0 }
          ])
        })
      })

      const referenceDate = new Date('2026-02-15T00:00:00')
      const result = await detectCurrentTab(SHEET_ID, referenceDate)

      expect(result.sheetGid).toBe('200')
      expect(callCount).toBe(2)
    })
  })

  describe('Full flow: date input → detection → CSV URL', () => {
    it('should handle realistic multi-month spreadsheet', async () => {
      const referenceDate = new Date('2026-06-15T00:00:00')

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSheetsResponse([
          { sheetId: 30816788, title: 'January 2026', index: 0 },
          { sheetId: 12345678, title: 'February 2026', index: 1 },
          { sheetId: 23456789, title: 'March 2026', index: 2 },
          { sheetId: 34567890, title: 'April 2026', index: 3 },
          { sheetId: 45678901, title: 'May 2026', index: 4 },
          { sheetId: 56789012, title: 'June 2026', index: 5 },
          { sheetId: 99999999, title: 'Overview', index: 6 }
        ])
      })

      const result = await detectCurrentTab(SHEET_ID, referenceDate)

      expect(result.sheetGid).toBe('56789012')
      expect(result.tabName).toBe('June 2026')
      expect(result.confidence).toBe(1.0)
      expect(result.isFallback).toBe(false)

      // Construct CSV URL as the API would
      const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${result.sheetGid}`
      const url = new URL(csvUrl)
      expect(url.searchParams.get('format')).toBe('csv')
      expect(url.searchParams.get('gid')).toBe('56789012')
      expect(url.pathname).toContain(SHEET_ID)
    })

    it('should handle year boundary: request for January finds December as fallback', async () => {
      const referenceDate = new Date('2027-01-05T00:00:00')

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSheetsResponse([
          { sheetId: 100, title: 'November 2026', index: 0 },
          { sheetId: 200, title: 'December 2026', index: 1 }
        ])
      })

      const result = await detectCurrentTab(SHEET_ID, referenceDate)

      expect(result.sheetGid).toBe('200')
      expect(result.tabName).toBe('December 2026')
      expect(result.isFallback).toBe(true)
      expect(result.detectedDate).toEqual({ month: 12, year: 2026 })
    })

    it('should handle abbreviated month names in tabs', async () => {
      const referenceDate = new Date('2026-03-20T00:00:00')

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSheetsResponse([
          { sheetId: 100, title: 'Jan 2026', index: 0 },
          { sheetId: 200, title: 'Feb 2026', index: 1 },
          { sheetId: 300, title: 'Mar 2026', index: 2 }
        ])
      })

      const result = await detectCurrentTab(SHEET_ID, referenceDate)

      expect(result.sheetGid).toBe('300')
      expect(result.tabName).toBe('Mar 2026')
      expect(result.confidence).toBe(0.95)
      expect(result.isFallback).toBe(false)
    })

    it('should handle ISO date format tabs', async () => {
      const referenceDate = new Date('2026-04-01T00:00:00')

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSheetsResponse([
          { sheetId: 100, title: '2026-03', index: 0 },
          { sheetId: 200, title: '2026-04', index: 1 },
          { sheetId: 300, title: '2026-05', index: 2 }
        ])
      })

      const result = await detectCurrentTab(SHEET_ID, referenceDate)

      expect(result.sheetGid).toBe('200')
      expect(result.tabName).toBe('2026-04')
      expect(result.confidence).toBe(0.9)
    })
  })
})
