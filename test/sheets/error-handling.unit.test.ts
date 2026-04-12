/**
 * Unit Tests for Error Handling across Tab Detection System
 *
 * Tests TabDetectionError class behavior, error scenarios in each component,
 * and structured logging output.
 *
 * Feature: dynamic-sheet-tab-detection
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TabDetectionError } from '@/app/lib/sheets/types'
import { fetchSheetTabs } from '@/app/lib/sheets/google-sheets-client'
import { TabCache } from '@/app/lib/sheets/tab-cache'
import { selectBestTab, detectCurrentTab } from '@/app/lib/sheets/tab-detector'
import { parseTabName } from '@/app/lib/sheets/tab-name-parser'
import type { SheetTab } from '@/app/lib/sheets/types'

describe('TabDetectionError class', () => {
  it('should create error with API_ERROR code', () => {
    const error = new TabDetectionError('API failed', 'API_ERROR', { status: 500 })

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(TabDetectionError)
    expect(error.name).toBe('TabDetectionError')
    expect(error.message).toBe('API failed')
    expect(error.code).toBe('API_ERROR')
    expect(error.details).toEqual({ status: 500 })
  })

  it('should create error with CONFIG_ERROR code', () => {
    const error = new TabDetectionError('Missing key', 'CONFIG_ERROR')

    expect(error.code).toBe('CONFIG_ERROR')
    expect(error.details).toBeUndefined()
  })

  it('should create error with PARSE_ERROR code', () => {
    const error = new TabDetectionError('Bad JSON', 'PARSE_ERROR', { raw: 'foo' })

    expect(error.code).toBe('PARSE_ERROR')
    expect(error.details).toEqual({ raw: 'foo' })
  })

  it('should create error with NO_TABS_FOUND code', () => {
    const error = new TabDetectionError('No tabs', 'NO_TABS_FOUND')

    expect(error.code).toBe('NO_TABS_FOUND')
  })

  it('should have a stack trace', () => {
    const error = new TabDetectionError('test', 'API_ERROR')

    expect(error.stack).toBeDefined()
    expect(error.stack).toContain('TabDetectionError')
  })

  it('should be catchable as an Error', () => {
    let caught: Error | undefined
    try {
      throw new TabDetectionError('test throw', 'CONFIG_ERROR')
    } catch (e) {
      caught = e as Error
    }

    expect(caught).toBeDefined()
    expect(caught).toBeInstanceOf(Error)
    expect(caught!.message).toBe('test throw')
  })

  it('should preserve code and details after serialization', () => {
    const error = new TabDetectionError('err', 'API_ERROR', { retries: 3 })
    const json = JSON.parse(JSON.stringify({
      message: error.message,
      code: error.code,
      details: error.details
    }))

    expect(json.message).toBe('err')
    expect(json.code).toBe('API_ERROR')
    expect(json.details.retries).toBe(3)
  })
})

describe('Google Sheets Client - error scenarios', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('should throw CONFIG_ERROR when both spreadsheetId and apiKey are empty', async () => {
    try {
      await fetchSheetTabs('', '')
      expect.fail('Should have thrown')
    } catch (e) {
      const error = e as TabDetectionError
      expect(error.code).toBe('CONFIG_ERROR')
      expect(error.details).toEqual({ spreadsheetId: false, apiKey: false })
    }
  })

  it('should throw PARSE_ERROR when response JSON is invalid', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token') }
    })

    try {
      await fetchSheetTabs('sheet-id', 'key')
      expect.fail('Should have thrown')
    } catch (e) {
      const error = e as TabDetectionError
      expect(error.code).toBe('PARSE_ERROR')
      expect(error.message).toContain('Failed to parse')
    }
  })

  it('should throw NO_TABS_FOUND when response has null data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => null
    })

    try {
      await fetchSheetTabs('sheet-id', 'key')
      expect.fail('Should have thrown')
    } catch (e) {
      const error = e as TabDetectionError
      expect(error.code).toBe('PARSE_ERROR')
    }
  })

  it('should throw NO_TABS_FOUND when all sheets have invalid properties', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sheets: [
          { properties: { sheetId: 'not-a-number', title: 123, index: 'wrong' } },
          { properties: null }
        ]
      })
    })

    try {
      await fetchSheetTabs('sheet-id', 'key')
      expect.fail('Should have thrown')
    } catch (e) {
      const error = e as TabDetectionError
      expect(error.code).toBe('NO_TABS_FOUND')
      expect(error.message).toContain('No valid tabs found')
    }
  })

  it('should throw API_ERROR with details for unknown HTTP status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 418,
      statusText: "I'm a teapot",
      json: async () => ({ error: { message: 'teapot' } })
    })

    try {
      await fetchSheetTabs('sheet-id', 'key')
      expect.fail('Should have thrown')
    } catch (e) {
      const error = e as TabDetectionError
      expect(error.code).toBe('API_ERROR')
      expect(error.message).toContain('418')
    }
  })
})

describe('Tab Cache - error scenarios', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('should log cache miss for unknown spreadsheet', () => {
    const cache = new TabCache()
    const result = cache.get('unknown-id', 1, 2026)

    expect(result).toBeNull()
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[TabDetection] TabCache: cache miss',
      expect.objectContaining({ spreadsheetId: 'unknown-id' })
    )
  })

  it('should log cache invalidation on TTL expiry', () => {
    const cache = new TabCache()
    cache.set('test-id', {
      sheetGid: '123',
      tabName: 'Jan 2026',
      confidence: 1.0,
      detectedMonth: 1,
      detectedYear: 2026,
      timestamp: Date.now() - 5 * 60 * 60 * 1000 // 5 hours ago
    })

    const result = cache.get('test-id', 1, 2026)

    expect(result).toBeNull()
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[TabDetection] TabCache: cache invalidated',
      expect.objectContaining({ reason: 'TTL expired' })
    )
  })

  it('should log cache invalidation on month change', () => {
    const cache = new TabCache()
    cache.set('test-id', {
      sheetGid: '123',
      tabName: 'Jan 2026',
      confidence: 1.0,
      detectedMonth: 1,
      detectedYear: 2026,
      timestamp: Date.now()
    })

    const result = cache.get('test-id', 2, 2026) // Different month

    expect(result).toBeNull()
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[TabDetection] TabCache: cache invalidated',
      expect.objectContaining({ reason: 'month changed' })
    )
  })

  it('should log cache hit', () => {
    const cache = new TabCache()
    cache.set('test-id', {
      sheetGid: '123',
      tabName: 'Jan 2026',
      confidence: 1.0,
      detectedMonth: 1,
      detectedYear: 2026,
      timestamp: Date.now()
    })

    cache.get('test-id', 1, 2026)

    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[TabDetection] TabCache: cache hit',
      expect.objectContaining({ spreadsheetId: 'test-id', tabName: 'Jan 2026' })
    )
  })
})

describe('Tab Name Parser - error scenarios', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('should return null and log for empty string', () => {
    expect(parseTabName('')).toBeNull()
  })

  it('should return null for undefined input', () => {
    expect(parseTabName(undefined as any)).toBeNull()
  })

  it('should return null for numeric-only string', () => {
    expect(parseTabName('12345')).toBeNull()
  })

  it('should return null and log for non-date tab names', () => {
    const result = parseTabName('Sheet1')

    expect(result).toBeNull()
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[TabDetection] TabNameParser: no date pattern found',
      expect.objectContaining({ tabName: 'Sheet1' })
    )
  })
})

describe('Tab Detector - error scenarios', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('should throw CONFIG_ERROR when GOOGLE_SHEETS_API_KEY is missing', async () => {
    const env = { ...process.env }
    delete env.GOOGLE_SHEETS_API_KEY
    process.env = env

    try {
      await detectCurrentTab('test-sheet-id')
      expect.fail('Should have thrown')
    } catch (e) {
      const error = e as TabDetectionError
      expect(error.code).toBe('CONFIG_ERROR')
      expect(error.message).toContain('GOOGLE_SHEETS_API_KEY')
    }
  })

  it('should log error when API key is missing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const env = { ...process.env }
    delete env.GOOGLE_SHEETS_API_KEY
    process.env = env

    try {
      await detectCurrentTab('test-sheet-id')
    } catch {
      // expected
    }

    expect(errorSpy).toHaveBeenCalledWith(
      '[TabDetection] TabDetector: missing API key',
      expect.objectContaining({ spreadsheetId: 'test-sheet-id' })
    )
  })

  it('should propagate API errors from fetchSheetTabs', async () => {
    process.env = { ...process.env, GOOGLE_SHEETS_API_KEY: 'test-key' }
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid key' } })
    })

    try {
      await detectCurrentTab('test-sheet-id')
      expect.fail('Should have thrown')
    } catch (e) {
      const error = e as TabDetectionError
      expect(error.code).toBe('CONFIG_ERROR')
      expect(error.message).toContain('Invalid Google Sheets API key')
    }

    global.fetch = globalThis.fetch
  })
})

describe('Logging format consistency', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('should use [TabDetection] prefix in tab detector logs', () => {
    const tabs: SheetTab[] = [
      { sheetId: 1000, title: 'February 2026', index: 0 }
    ]

    selectBestTab(tabs, 2, 2026)

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[TabDetection]'),
      expect.any(Object)
    )
  })

  it('should use [TabDetection] prefix in fallback warning logs', () => {
    const tabs: SheetTab[] = [
      { sheetId: 1000, title: 'Sheet1', index: 0 }
    ]

    selectBestTab(tabs, 2, 2026)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[TabDetection]'),
      expect.any(Object)
    )
  })

  it('should include timestamp in structured log objects', () => {
    const tabs: SheetTab[] = [
      { sheetId: 1000, title: 'February 2026', index: 0 }
    ]

    selectBestTab(tabs, 2, 2026)

    expect(logSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
      })
    )
  })

  it('should include component name in structured log objects', () => {
    const tabs: SheetTab[] = [
      { sheetId: 1000, title: 'February 2026', index: 0 }
    ]

    selectBestTab(tabs, 2, 2026)

    expect(logSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        component: 'TabDetector'
      })
    )
  })
})
