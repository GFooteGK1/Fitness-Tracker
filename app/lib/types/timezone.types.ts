/**
 * Timezone Types
 * 
 * Type definitions for timezone handling across the SociusFit application.
 */

/**
 * Date string in YYYY-MM-DD format representing a local calendar date
 * @example "2026-02-05"
 */
export type DateString = string

/**
 * ISO 8601 timestamp string in UTC
 * @example "2026-02-06T01:00:00.000Z"
 */
export type UTCTimestamp = string

/**
 * Timezone offset in minutes
 * Negative values = west of UTC (e.g., -360 for CST)
 * Positive values = east of UTC (e.g., 60 for CET)
 * Valid range: -720 to 840 (UTC-12 to UTC+14)
 */
export type TimezoneOffset = number

/**
 * Date range with timezone context
 */
export interface DateRange {
  startDate: DateString
  endDate: DateString
  tzOffset: TimezoneOffset
}

/**
 * UTC boundaries for a local date
 */
export interface UTCBoundaries {
  startUTC: UTCTimestamp
  endUTC: UTCTimestamp
}
