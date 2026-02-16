/**
 * Unit Tests for Tab Name Parser
 * 
 * These tests verify specific examples and edge cases work correctly.
 * Complements property-based tests with concrete examples.
 * 
 * Feature: dynamic-sheet-tab-detection
 * Task: 2.4 Write unit tests for specific date formats
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.7**
 */

import { describe, it, expect } from 'vitest'
import { parseTabName } from '@/app/lib/sheets/tab-name-parser'

describe('Tab Name Parser - Unit Tests', () => {
  
  describe('Specific Date Format Examples', () => {
    
    /**
     * Test "January 2026" → confidence 1.0
     * Pattern: Month YYYY (full month name)
     * **Validates: Requirements 2.1, 10.1**
     */
    it('should parse "January 2026" with confidence 1.0', () => {
      const result = parseTabName('January 2026')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(1)
      expect(result!.year).toBe(2026)
      expect(result!.confidence).toBe(1.0)
      expect(result!.pattern).toBe('Month YYYY')
    })
    
    /**
     * Test "Jan 2026" → confidence 0.95
     * Pattern: Mon YYYY (abbreviated month name)
     * **Validates: Requirements 2.2, 10.2**
     */
    it('should parse "Jan 2026" with confidence 0.95', () => {
      const result = parseTabName('Jan 2026')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(1)
      expect(result!.year).toBe(2026)
      expect(result!.confidence).toBe(0.95)
      expect(result!.pattern).toBe('Mon YYYY')
    })
    
    /**
     * Test "2026-01" → confidence 0.9
     * Pattern: YYYY-MM (ISO format)
     * **Validates: Requirements 2.3, 10.3**
     */
    it('should parse "2026-01" with confidence 0.9', () => {
      const result = parseTabName('2026-01')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(1)
      expect(result!.year).toBe(2026)
      expect(result!.confidence).toBe(0.9)
      expect(result!.pattern).toBe('YYYY-MM')
    })
    
    /**
     * Test "01/2026" → confidence 0.85
     * Pattern: MM/YYYY (US format)
     * **Validates: Requirements 2.4, 10.4**
     */
    it('should parse "01/2026" with confidence 0.85', () => {
      const result = parseTabName('01/2026')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(1)
      expect(result!.year).toBe(2026)
      expect(result!.confidence).toBe(0.85)
      expect(result!.pattern).toBe('MM/YYYY')
    })
    
    /**
     * Test "January" → confidence 0.7, current year
     * Pattern: Month only (assumes current year)
     * **Validates: Requirements 2.4, 10.5**
     */
    it('should parse "January" with confidence 0.7 and current year', () => {
      const currentYear = new Date().getFullYear()
      const result = parseTabName('January')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(1)
      expect(result!.year).toBe(currentYear)
      expect(result!.confidence).toBe(0.7)
      expect(result!.pattern).toBe('Month only')
    })
    
    /**
     * Test "Sheet1" → null
     * Non-date tab name should return null
     * **Validates: Requirements 2.7, 10.7**
     */
    it('should return null for "Sheet1"', () => {
      const result = parseTabName('Sheet1')
      
      expect(result).toBeNull()
    })
  })
  
  describe('Additional Specific Examples', () => {
    
    it('should parse "February 2026" correctly', () => {
      const result = parseTabName('February 2026')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(2)
      expect(result!.year).toBe(2026)
      expect(result!.confidence).toBe(1.0)
    })
    
    it('should parse "Dec 2025" correctly', () => {
      const result = parseTabName('Dec 2025')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(12)
      expect(result!.year).toBe(2025)
      expect(result!.confidence).toBe(0.95)
    })
    
    it('should parse "2025-12" correctly', () => {
      const result = parseTabName('2025-12')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(12)
      expect(result!.year).toBe(2025)
      expect(result!.confidence).toBe(0.9)
    })
    
    it('should parse "12/2025" correctly', () => {
      const result = parseTabName('12/2025')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(12)
      expect(result!.year).toBe(2025)
      expect(result!.confidence).toBe(0.85)
    })
    
    it('should parse "December" with current year', () => {
      const currentYear = new Date().getFullYear()
      const result = parseTabName('December')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(12)
      expect(result!.year).toBe(currentYear)
      expect(result!.confidence).toBe(0.7)
    })
  })
  
  describe('Common Non-Date Tab Names', () => {
    
    it('should return null for "Sheet1"', () => {
      expect(parseTabName('Sheet1')).toBeNull()
    })
    
    it('should return null for "Data"', () => {
      expect(parseTabName('Data')).toBeNull()
    })
    
    it('should return null for "Summary"', () => {
      expect(parseTabName('Summary')).toBeNull()
    })
    
    it('should return null for "Main"', () => {
      expect(parseTabName('Main')).toBeNull()
    })
    
    it('should return null for "Q1"', () => {
      expect(parseTabName('Q1')).toBeNull()
    })
    
    it('should return null for "Week 1"', () => {
      expect(parseTabName('Week 1')).toBeNull()
    })
  })
  
  describe('Edge Cases', () => {
    
    it('should handle case insensitivity for "JANUARY 2026"', () => {
      const result = parseTabName('JANUARY 2026')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(1)
      expect(result!.year).toBe(2026)
      expect(result!.confidence).toBe(1.0)
    })
    
    it('should handle case insensitivity for "january 2026"', () => {
      const result = parseTabName('january 2026')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(1)
      expect(result!.year).toBe(2026)
      expect(result!.confidence).toBe(1.0)
    })
    
    it('should handle extra whitespace "  January 2026  "', () => {
      const result = parseTabName('  January 2026  ')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(1)
      expect(result!.year).toBe(2026)
      expect(result!.confidence).toBe(1.0)
    })
    
    it('should handle tab names with surrounding text "Programming - January 2026"', () => {
      const result = parseTabName('Programming - January 2026')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(1)
      expect(result!.year).toBe(2026)
      expect(result!.confidence).toBe(1.0)
    })
    
    it('should return null for empty string', () => {
      expect(parseTabName('')).toBeNull()
    })
    
    it('should return null for whitespace only', () => {
      expect(parseTabName('   ')).toBeNull()
    })
    
    it('should return null for null input', () => {
      expect(parseTabName(null as any)).toBeNull()
    })
    
    it('should return null for undefined input', () => {
      expect(parseTabName(undefined as any)).toBeNull()
    })
  })
  
  describe('Pattern Priority', () => {
    
    it('should prefer full month name over abbreviated when both present', () => {
      // "January 2026 (Jan)" should match "January 2026" pattern first
      const result = parseTabName('January 2026 (Jan)')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(1)
      expect(result!.year).toBe(2026)
      expect(result!.confidence).toBe(1.0)
      expect(result!.pattern).toBe('Month YYYY')
    })
    
    it('should prefer ISO format over month-only when year is present', () => {
      // "2026-01 January" should match "2026-01" pattern first
      const result = parseTabName('2026-01 January')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(1)
      expect(result!.year).toBe(2026)
      // Should match full month name pattern which appears first in the string
      expect(result!.confidence).toBeGreaterThanOrEqual(0.9)
    })
  })
  
  describe('All Months Coverage', () => {
    
    const monthTests = [
      { name: 'January', abbrev: 'Jan', num: 1 },
      { name: 'February', abbrev: 'Feb', num: 2 },
      { name: 'March', abbrev: 'Mar', num: 3 },
      { name: 'April', abbrev: 'Apr', num: 4 },
      { name: 'May', abbrev: 'May', num: 5 },
      { name: 'June', abbrev: 'Jun', num: 6 },
      { name: 'July', abbrev: 'Jul', num: 7 },
      { name: 'August', abbrev: 'Aug', num: 8 },
      { name: 'September', abbrev: 'Sep', num: 9 },
      { name: 'October', abbrev: 'Oct', num: 10 },
      { name: 'November', abbrev: 'Nov', num: 11 },
      { name: 'December', abbrev: 'Dec', num: 12 }
    ]
    
    monthTests.forEach(({ name, abbrev, num }) => {
      it(`should parse "${name} 2026" correctly`, () => {
        const result = parseTabName(`${name} 2026`)
        expect(result).not.toBeNull()
        expect(result!.month).toBe(num)
        expect(result!.year).toBe(2026)
        expect(result!.confidence).toBe(1.0)
      })
      
      // Skip May for abbreviated test since it's the same as full name
      if (abbrev !== 'May') {
        it(`should parse "${abbrev} 2026" correctly`, () => {
          const result = parseTabName(`${abbrev} 2026`)
          expect(result).not.toBeNull()
          expect(result!.month).toBe(num)
          expect(result!.year).toBe(2026)
          expect(result!.confidence).toBe(0.95)
        })
      }
    })
  })
  
  describe('Year Validation', () => {
    
    it('should accept year 2000', () => {
      const result = parseTabName('January 2000')
      expect(result).not.toBeNull()
      expect(result!.year).toBe(2000)
    })
    
    it('should accept year 2100', () => {
      const result = parseTabName('January 2100')
      expect(result).not.toBeNull()
      expect(result!.year).toBe(2100)
    })
    
    it('should reject year 1999 in ISO format', () => {
      const result = parseTabName('1999-01')
      // Year 1999 is out of valid range (2000-2100)
      expect(result).toBeNull()
    })
    
    it('should reject year 2101', () => {
      const result = parseTabName('2101-01')
      expect(result).toBeNull()
    })
  })
  
  describe('Month Validation', () => {
    
    it('should reject month 0', () => {
      const result = parseTabName('2026-00')
      expect(result).toBeNull()
    })
    
    it('should reject month 13', () => {
      const result = parseTabName('2026-13')
      expect(result).toBeNull()
    })
    
    it('should accept month 1', () => {
      const result = parseTabName('2026-01')
      expect(result).not.toBeNull()
      expect(result!.month).toBe(1)
    })
    
    it('should accept month 12', () => {
      const result = parseTabName('2026-12')
      expect(result).not.toBeNull()
      expect(result!.month).toBe(12)
    })
  })
  
  describe('Alternative Separators', () => {
    
    it('should parse "01-2026" with dash separator', () => {
      const result = parseTabName('01-2026')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(1)
      expect(result!.year).toBe(2026)
      expect(result!.confidence).toBe(0.85)
    })
    
    it('should parse "1/2026" with single-digit month', () => {
      const result = parseTabName('1/2026')
      
      expect(result).not.toBeNull()
      expect(result!.month).toBe(1)
      expect(result!.year).toBe(2026)
      expect(result!.confidence).toBe(0.85)
    })
  })
})
