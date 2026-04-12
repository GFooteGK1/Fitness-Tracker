/**
 * Unit Tests for Tab Detector
 * 
 * These tests verify specific scenarios and edge cases for tab selection logic.
 * Tests cover current month selection, confidence-based selection, tiebreakers,
 * fallback scenarios, and logging behavior.
 * 
 * Feature: dynamic-sheet-tab-detection
 * Requirements: 3.1, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 8.1, 8.2, 8.4, 8.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { selectBestTab } from '@/app/lib/sheets/tab-detector'
import type { SheetTab } from '@/app/lib/sheets/types'

describe('Tab Detector - Unit Tests', () => {
  // Spy on console methods to verify logging behavior
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe('Current Month Tab Selection', () => {
    it('should select current month tab when available', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'January 2026', index: 0 },
        { sheetId: 2000, title: 'February 2026', index: 1 },
        { sheetId: 3000, title: 'March 2026', index: 2 }
      ]

      const result = selectBestTab(tabs, 2, 2026) // February 2026

      expect(result.sheetGid).toBe('2000')
      expect(result.tabName).toBe('February 2026')
      expect(result.confidence).toBe(1.0)
      expect(result.isFallback).toBe(false)
      expect(result.detectedDate).toEqual({ month: 2, year: 2026 })
      expect(result.warning).toBeUndefined()
    })

    it('should select current month tab from mixed dated and non-dated tabs', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'Sheet1', index: 0 },
        { sheetId: 2000, title: 'Data', index: 1 },
        { sheetId: 3000, title: 'February 2026', index: 2 },
        { sheetId: 4000, title: 'Summary', index: 3 }
      ]

      const result = selectBestTab(tabs, 2, 2026)

      expect(result.sheetGid).toBe('3000')
      expect(result.tabName).toBe('February 2026')
      expect(result.isFallback).toBe(false)
    })

    it('should select current month tab with different date formats', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: '2026-02', index: 0 }, // YYYY-MM format
        { sheetId: 2000, title: 'January 2026', index: 1 },
        { sheetId: 3000, title: 'March 2026', index: 2 }
      ]

      const result = selectBestTab(tabs, 2, 2026)

      expect(result.sheetGid).toBe('1000')
      expect(result.tabName).toBe('2026-02')
      expect(result.confidence).toBe(0.9) // YYYY-MM format confidence
      expect(result.isFallback).toBe(false)
    })
  })

  describe('Highest Confidence Selection', () => {
    it('should select highest confidence when multiple current month tabs exist', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: '02/2026', index: 0 }, // MM/YYYY (confidence 0.85)
        { sheetId: 2000, title: 'February 2026', index: 1 }, // Month YYYY (confidence 1.0)
        { sheetId: 3000, title: '2026-02', index: 2 }, // YYYY-MM (confidence 0.9)
        { sheetId: 4000, title: 'Feb 2026', index: 3 } // Mon YYYY (confidence 0.95)
      ]

      const result = selectBestTab(tabs, 2, 2026)

      expect(result.sheetGid).toBe('2000')
      expect(result.tabName).toBe('February 2026')
      expect(result.confidence).toBe(1.0)
      expect(result.isFallback).toBe(false)
    })

    it('should prefer higher confidence over higher index', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'February 2026', index: 0 }, // Confidence 1.0
        { sheetId: 2000, title: '2026-02', index: 1 }, // Confidence 0.9
        { sheetId: 3000, title: '02/2026', index: 2 } // Confidence 0.85, highest index
      ]

      const result = selectBestTab(tabs, 2, 2026)

      // Should select highest confidence (1.0), not highest index
      expect(result.sheetGid).toBe('1000')
      expect(result.confidence).toBe(1.0)
    })
  })

  describe('Tiebreaker by Index', () => {
    it('should use index as tiebreaker when confidence scores are equal', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'February 2026', index: 0 },
        { sheetId: 2000, title: 'February 2026', index: 1 },
        { sheetId: 3000, title: 'February 2026', index: 2 }
      ]

      const result = selectBestTab(tabs, 2, 2026)

      // Should select rightmost tab (highest index)
      expect(result.sheetGid).toBe('3000')
      expect(result.tabName).toBe('February 2026')
      expect(result.confidence).toBe(1.0)
    })

    it('should select rightmost when multiple tabs have same format', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'Feb 2026', index: 0 }, // Mon YYYY
        { sheetId: 2000, title: 'Feb 2026', index: 1 }, // Mon YYYY
        { sheetId: 3000, title: 'Feb 2026', index: 2 } // Mon YYYY
      ]

      const result = selectBestTab(tabs, 2, 2026)

      expect(result.sheetGid).toBe('3000')
      expect(result.confidence).toBe(0.95)
    })
  })

  describe('Fallback to Most Recent Dated Tab', () => {
    it('should fallback to most recent dated tab when current month not found', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'December 2025', index: 0 },
        { sheetId: 2000, title: 'January 2026', index: 1 },
        { sheetId: 3000, title: 'March 2026', index: 2 }
      ]

      const result = selectBestTab(tabs, 2, 2026) // February 2026 not present

      // Should select January 2026 (most recent before current month)
      expect(result.sheetGid).toBe('2000')
      expect(result.tabName).toBe('January 2026')
      expect(result.isFallback).toBe(true)
      expect(result.warning).toContain('most recent dated tab')
      expect(result.detectedDate).toEqual({ month: 1, year: 2026 })
    })

    it('should select most recent from past months only', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'November 2025', index: 0 },
        { sheetId: 2000, title: 'December 2025', index: 1 },
        { sheetId: 3000, title: 'January 2026', index: 2 }
      ]

      const result = selectBestTab(tabs, 2, 2026)

      // Should select January 2026 (most recent)
      expect(result.sheetGid).toBe('3000')
      expect(result.tabName).toBe('January 2026')
      expect(result.isFallback).toBe(true)
    })

    it('should handle year boundary correctly in fallback', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'November 2025', index: 0 },
        { sheetId: 2000, title: 'December 2025', index: 1 }
      ]

      const result = selectBestTab(tabs, 1, 2026) // January 2026

      // Should select December 2025 (most recent)
      expect(result.sheetGid).toBe('2000')
      expect(result.tabName).toBe('December 2025')
      expect(result.isFallback).toBe(true)
      expect(result.detectedDate).toEqual({ month: 12, year: 2025 })
    })

    it('should use index as tiebreaker for fallback tabs with same date', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'January 2026', index: 0 },
        { sheetId: 2000, title: 'January 2026', index: 1 },
        { sheetId: 3000, title: 'January 2026', index: 2 }
      ]

      const result = selectBestTab(tabs, 2, 2026)

      // Should select rightmost tab as tiebreaker
      expect(result.sheetGid).toBe('3000')
      expect(result.isFallback).toBe(true)
    })
  })

  describe('Fallback to Rightmost Tab', () => {
    it('should fallback to rightmost tab when no dates found', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'Sheet1', index: 0 },
        { sheetId: 2000, title: 'Data', index: 1 },
        { sheetId: 3000, title: 'Summary', index: 2 }
      ]

      const result = selectBestTab(tabs, 2, 2026)

      expect(result.sheetGid).toBe('3000')
      expect(result.tabName).toBe('Summary')
      expect(result.confidence).toBe(0.5)
      expect(result.isFallback).toBe(true)
      expect(result.warning).toContain('No dated tabs found')
      expect(result.detectedDate).toBeUndefined()
    })

    it('should select rightmost from various non-dated tab names', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'Main', index: 0 },
        { sheetId: 2000, title: 'Backup', index: 1 },
        { sheetId: 3000, title: 'Q1', index: 2 },
        { sheetId: 4000, title: 'Archive', index: 3 }
      ]

      const result = selectBestTab(tabs, 2, 2026)

      expect(result.sheetGid).toBe('4000')
      expect(result.tabName).toBe('Archive')
      expect(result.isFallback).toBe(true)
    })

    it('should handle single non-dated tab', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'Sheet1', index: 0 }
      ]

      const result = selectBestTab(tabs, 2, 2026)

      expect(result.sheetGid).toBe('1000')
      expect(result.tabName).toBe('Sheet1')
      expect(result.isFallback).toBe(true)
      expect(result.warning).toContain('No dated tabs found')
    })
  })

  describe('Logging Behavior', () => {
    it('should log INFO when current month tab is selected', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'February 2026', index: 0 }
      ]

      selectBestTab(tabs, 2, 2026)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[TabDetection] TabDetector: tab_detected',
        expect.objectContaining({
          level: 'INFO',
          component: 'TabDetector',
          action: 'tab_detected',
          details: expect.objectContaining({
            selectedTab: 'February 2026',
            selectedGid: '1000',
            confidence: 1.0,
            isFallback: false
          })
        })
      )
    })

    it('should log WARN when fallback to most recent dated tab', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'January 2026', index: 0 }
      ]

      selectBestTab(tabs, 2, 2026)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[TabDetection] TabDetector: fallback_activated',
        expect.objectContaining({
          level: 'WARN',
          component: 'TabDetector',
          action: 'fallback_activated',
          details: expect.objectContaining({
            selectedTab: 'January 2026',
            selectedGid: '1000',
            isFallback: true,
            reason: expect.stringContaining('most recent dated tab')
          })
        })
      )
    })

    it('should log WARN when fallback to rightmost tab', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'Sheet1', index: 0 },
        { sheetId: 2000, title: 'Sheet2', index: 1 }
      ]

      selectBestTab(tabs, 2, 2026)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[TabDetection] TabDetector: fallback_activated',
        expect.objectContaining({
          level: 'WARN',
          component: 'TabDetector',
          action: 'fallback_activated',
          details: expect.objectContaining({
            selectedTab: 'Sheet2',
            selectedGid: '2000',
            confidence: 0.5,
            isFallback: true,
            reason: expect.stringContaining('No dated tabs found')
          })
        })
      )
    })

    it('should include timestamp in all logs', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'February 2026', index: 0 }
      ]

      selectBestTab(tabs, 2, 2026)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TabDetection]'),
        expect.objectContaining({
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
        })
      )
    })
  })

  describe('Edge Cases', () => {
    it('should handle tabs with same month but different years', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'February 2025', index: 0 },
        { sheetId: 2000, title: 'February 2026', index: 1 },
        { sheetId: 3000, title: 'February 2027', index: 2 }
      ]

      const result = selectBestTab(tabs, 2, 2026)

      // Should select exact year match
      expect(result.sheetGid).toBe('2000')
      expect(result.tabName).toBe('February 2026')
      expect(result.isFallback).toBe(false)
    })

    it('should handle December to January year transition', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'December 2025', index: 0 },
        { sheetId: 2000, title: 'January 2026', index: 1 }
      ]

      const result = selectBestTab(tabs, 1, 2026)

      expect(result.sheetGid).toBe('2000')
      expect(result.tabName).toBe('January 2026')
      expect(result.isFallback).toBe(false)
    })

    it('should handle tabs with mixed confidence levels', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'February', index: 0 }, // Month only (0.7)
        { sheetId: 2000, title: '02/2026', index: 1 }, // MM/YYYY (0.85)
        { sheetId: 3000, title: 'Feb 2026', index: 2 } // Mon YYYY (0.95)
      ]

      const result = selectBestTab(tabs, 2, 2026)

      // Should select highest confidence
      expect(result.sheetGid).toBe('3000')
      expect(result.confidence).toBe(0.95)
    })

    it('should handle single tab that matches current month', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'February 2026', index: 0 }
      ]

      const result = selectBestTab(tabs, 2, 2026)

      expect(result.sheetGid).toBe('1000')
      expect(result.isFallback).toBe(false)
    })

    it('should handle tabs with future dates only', () => {
      const tabs: SheetTab[] = [
        { sheetId: 1000, title: 'March 2026', index: 0 },
        { sheetId: 2000, title: 'April 2026', index: 1 },
        { sheetId: 3000, title: 'May 2026', index: 2 }
      ]

      const result = selectBestTab(tabs, 2, 2026)

      // Should select most recent (which is March, closest to February)
      expect(result.sheetGid).toBe('3000')
      expect(result.tabName).toBe('May 2026')
      expect(result.isFallback).toBe(true)
    })
  })
})
