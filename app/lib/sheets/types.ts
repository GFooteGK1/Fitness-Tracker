/**
 * Type definitions for Dynamic Sheet Tab Detection system
 * 
 * This module contains all TypeScript interfaces and types used across
 * the tab detection components.
 */

/**
 * Represents a single tab (worksheet) within a Google Sheets document
 */
export interface SheetTab {
  /** The unique identifier for the tab (used as GID in CSV export URLs) */
  sheetId: number
  /** The display name of the tab */
  title: string
  /** The zero-based position of the tab in the spreadsheet */
  index: number
}

/**
 * Represents a parsed date extracted from a tab name
 */
export interface ParsedTabDate {
  /** Month number (1-12) */
  month: number
  /** Four-digit year */
  year: number
  /** Confidence score indicating parsing certainty (0.0 - 1.0) */
  confidence: number
  /** The pattern that matched (e.g., "Month YYYY", "YYYY-MM") */
  pattern: string
}

/**
 * Represents a tab with its parsed date and selection score
 * Used internally during tab selection process
 */
export interface ScoredTab {
  /** The tab metadata */
  tab: SheetTab
  /** Parsed date information (null if no date found) */
  parsedDate: ParsedTabDate | null
  /** Combined score for selection (0.0 - 1.0) */
  score: number
}

/**
 * Result of tab detection process
 */
export interface TabDetectionResult {
  /** The selected tab's GID as a string (for CSV URL construction) */
  sheetGid: string
  /** The selected tab's name */
  tabName: string
  /** Confidence score of the selection (0.0 - 1.0) */
  confidence: number
  /** Whether fallback logic was used (no current month match) */
  isFallback: boolean
  /** The detected date (if available) */
  detectedDate?: {
    month: number
    year: number
  }
  /** Warning message (present when fallback is used) */
  warning?: string
}

/**
 * Cached tab detection result
 * Stored in-memory to minimize API calls
 */
export interface CachedTabResult {
  /** The cached tab's GID */
  sheetGid: string
  /** The cached tab's name */
  tabName: string
  /** Confidence score */
  confidence: number
  /** Month of the detected tab (1-12) */
  detectedMonth: number
  /** Year of the detected tab */
  detectedYear: number
  /** Timestamp when the result was cached (milliseconds since epoch) */
  timestamp: number
}

/**
 * Custom error class for tab detection failures
 */
export class TabDetectionError extends Error {
  /**
   * Creates a new TabDetectionError
   * @param message - Human-readable error message
   * @param code - Error code for categorization
   * @param details - Additional error details for debugging
   */
  constructor(
    message: string,
    public code: 'API_ERROR' | 'CONFIG_ERROR' | 'PARSE_ERROR' | 'NO_TABS_FOUND',
    public details?: any
  ) {
    super(message)
    this.name = 'TabDetectionError'
    
    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TabDetectionError)
    }
  }
}

/**
 * Log entry structure for structured logging
 */
export interface TabDetectionLogEntry {
  /** ISO 8601 timestamp */
  timestamp: string
  /** Log level */
  level: 'INFO' | 'WARN' | 'ERROR'
  /** Component that generated the log */
  component: 'TabDetector' | 'TabNameParser' | 'GoogleSheetsClient' | 'TabCache'
  /** Action being performed */
  action: string
  /** Additional details */
  details: {
    spreadsheetId?: string
    selectedTab?: string
    selectedGid?: string
    confidence?: number
    isFallback?: boolean
    errorCode?: string
    errorMessage?: string
    [key: string]: any
  }
}
