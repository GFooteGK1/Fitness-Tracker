/**
 * Tab Name Parser
 * 
 * Extracts date information from Google Sheets tab names using pattern matching.
 * Supports multiple date formats with confidence scoring.
 * 
 * Supported formats (in priority order):
 * 1. "Month YYYY" (e.g., "January 2026") → confidence: 1.0
 * 2. "Mon YYYY" (e.g., "Jan 2026") → confidence: 0.95
 * 3. "YYYY-MM" (e.g., "2026-01") → confidence: 0.9
 * 4. "MM/YYYY" (e.g., "01/2026") → confidence: 0.85
 * 5. "Month only" (e.g., "January") → confidence: 0.7, assumes current year
 */

import { ParsedTabDate } from './types'

/**
 * Month name to number mapping (1-12)
 * Supports both full names and 3-letter abbreviations
 */
const MONTH_NAMES: Record<string, number> = {
  // Full month names
  'january': 1,
  'february': 2,
  'march': 3,
  'april': 4,
  'may': 5,
  'june': 6,
  'july': 7,
  'august': 8,
  'september': 9,
  'october': 10,
  'november': 11,
  'december': 12,
  // 3-letter abbreviations
  'jan': 1,
  'feb': 2,
  'mar': 3,
  'apr': 4,
  'jun': 6,
  'jul': 7,
  'aug': 8,
  'sep': 9,
  'sept': 9,
  'oct': 10,
  'nov': 11,
  'dec': 12
}

/**
 * Parses a tab name to extract date information
 * 
 * @param tabName - The name of the Google Sheets tab
 * @returns ParsedTabDate object with month, year, confidence, and pattern, or null if no date found
 * 
 * @example
 * parseTabName("January 2026") // { month: 1, year: 2026, confidence: 1.0, pattern: "Month YYYY" }
 * parseTabName("Jan 2026") // { month: 1, year: 2026, confidence: 0.95, pattern: "Mon YYYY" }
 * parseTabName("2026-01") // { month: 1, year: 2026, confidence: 0.9, pattern: "YYYY-MM" }
 * parseTabName("01/2026") // { month: 1, year: 2026, confidence: 0.85, pattern: "MM/YYYY" }
 * parseTabName("January") // { month: 1, year: 2026, confidence: 0.7, pattern: "Month only" }
 * parseTabName("Sheet1") // null
 */
export function parseTabName(tabName: string): ParsedTabDate | null {
  if (!tabName || typeof tabName !== 'string') {
    return null
  }

  const trimmed = tabName.trim()
  
  // Pattern 1: "Month YYYY" (e.g., "January 2026") → confidence: 1.0
  const fullMonthYearMatch = trimmed.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i)
  if (fullMonthYearMatch) {
    const monthName = fullMonthYearMatch[1].toLowerCase()
    const year = parseInt(fullMonthYearMatch[2], 10)
    const month = MONTH_NAMES[monthName]
    
    if (month && isValidYear(year)) {
      return {
        month,
        year,
        confidence: 1.0,
        pattern: 'Month YYYY'
      }
    }
  }

  // Pattern 2: "Mon YYYY" (e.g., "Jan 2026") → confidence: 0.95
  const abbrevMonthYearMatch = trimmed.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{4})\b/i)
  if (abbrevMonthYearMatch) {
    const monthName = abbrevMonthYearMatch[1].toLowerCase()
    const year = parseInt(abbrevMonthYearMatch[2], 10)
    const month = MONTH_NAMES[monthName]
    
    if (month && isValidYear(year)) {
      return {
        month,
        year,
        confidence: 0.95,
        pattern: 'Mon YYYY'
      }
    }
  }

  // Pattern 3: "YYYY-MM" (e.g., "2026-01") → confidence: 0.9
  const isoFormatMatch = trimmed.match(/\b(\d{4})-(\d{2})\b/)
  if (isoFormatMatch) {
    const year = parseInt(isoFormatMatch[1], 10)
    const month = parseInt(isoFormatMatch[2], 10)
    
    if (isValidYear(year) && isValidMonth(month)) {
      return {
        month,
        year,
        confidence: 0.9,
        pattern: 'YYYY-MM'
      }
    }
  }

  // Pattern 4: "MM/YYYY" or "MM-YYYY" (e.g., "01/2026") → confidence: 0.85
  const usFormatMatch = trimmed.match(/\b(\d{1,2})[\/\-](\d{4})\b/)
  if (usFormatMatch) {
    const month = parseInt(usFormatMatch[1], 10)
    const year = parseInt(usFormatMatch[2], 10)
    
    if (isValidMonth(month) && isValidYear(year)) {
      return {
        month,
        year,
        confidence: 0.85,
        pattern: 'MM/YYYY'
      }
    }
  }

  // Pattern 5: "Month only" (e.g., "January") → confidence: 0.7, assumes current year
  const monthOnlyMatch = trimmed.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i)
  if (monthOnlyMatch) {
    const monthName = monthOnlyMatch[1].toLowerCase()
    const month = MONTH_NAMES[monthName]
    const currentYear = new Date().getFullYear()
    
    if (month) {
      return {
        month,
        year: currentYear,
        confidence: 0.7,
        pattern: 'Month only'
      }
    }
  }

  // No recognizable date pattern found
  console.log('[TabDetection] TabNameParser: no date pattern found', { tabName: trimmed })
  return null
}

/**
 * Validates that a month number is in the valid range (1-12)
 */
function isValidMonth(month: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12
}

/**
 * Validates that a year is reasonable (2000-2100)
 * This prevents parsing errors from unrealistic years
 */
function isValidYear(year: number): boolean {
  return Number.isInteger(year) && year >= 2000 && year <= 2100
}
