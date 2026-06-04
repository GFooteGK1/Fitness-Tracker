/**
 * Timezone Utilities
 * 
 * Centralized timezone handling for SociusFit application.
 * All date/time operations should use these utilities to ensure consistency.
 * 
 * Core Principles:
 * - Always use local timezone for user-facing operations
 * - Store timestamps in UTC in database
 * - Convert between local and UTC using timezone offset
 * - Use YYYY-MM-DD strings for calendar dates
 * - Use ISO 8601 strings for timestamps
 */

import type { DateString, UTCTimestamp, TimezoneOffset } from './types/timezone.types'

/**
 * Gets the current local date as YYYY-MM-DD string
 * Uses local timezone components to avoid UTC conversion issues
 * 
 * @param date - Date object (defaults to current date)
 * @returns Date string in YYYY-MM-DD format (e.g., "2026-02-05")
 * 
 * @example
 * getLocalDate() // "2026-02-05"
 * getLocalDate(new Date('2026-02-05T19:00:00')) // "2026-02-05"
 */
export function getLocalDate(date: Date = new Date()): DateString {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Gets the timezone offset in minutes for the current locale using
 * Date#getTimezoneOffset() semantics.
 * Positive values indicate west of UTC (e.g., 360 for CST)
 * Negative values indicate east of UTC (e.g., -60 for CET)
 * 
 * @param date - Date object (defaults to current date)
 * @returns Timezone offset in minutes
 * 
 * @example
 * getTimezoneOffset() // 360 (for CST)
 * getTimezoneOffset() // -60 (for CET)
 */
export function getTimezoneOffset(date: Date = new Date()): TimezoneOffset {
  return date.getTimezoneOffset()
}

function parseDateParts(dateStr: DateString): { year: number; monthIndex: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number)
  return { year, monthIndex: month - 1, day }
}

/**
 * Converts a local date string to UTC start-of-day timestamp
 * 
 * @param dateStr - Local date in YYYY-MM-DD format
 * @param tzOffset - Timezone offset in minutes (from getTimezoneOffset())
 * @returns ISO 8601 UTC timestamp for start of day
 * 
 * @example
 * // For CST (UTC-6, offset = 360)
 * localDateToUTCStart("2026-02-05", 360)
 * // Returns: "2026-02-05T06:00:00.000Z"
 * // (Feb 5 00:00 CST = Feb 5 06:00 UTC)
 */
export function localDateToUTCStart(dateStr: DateString, tzOffset: TimezoneOffset): UTCTimestamp {
  const { year, monthIndex, day } = parseDateParts(dateStr)
  const utcTime = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0) + tzOffset * 60000)
  return utcTime.toISOString()
}

/**
 * Converts a local date string to UTC end-of-day timestamp
 * 
 * @param dateStr - Local date in YYYY-MM-DD format
 * @param tzOffset - Timezone offset in minutes
 * @returns ISO 8601 UTC timestamp for end of day (23:59:59.999)
 * 
 * @example
 * // For CST (UTC-6, offset = 360)
 * localDateToUTCEnd("2026-02-05", 360)
 * // Returns: "2026-02-06T05:59:59.999Z"
 * // (Feb 5 23:59:59.999 CST = Feb 6 05:59:59.999 UTC)
 */
export function localDateToUTCEnd(dateStr: DateString, tzOffset: TimezoneOffset): UTCTimestamp {
  const { year, monthIndex, day } = parseDateParts(dateStr)
  const utcTime = new Date(Date.UTC(year, monthIndex, day, 23, 59, 59, 999) + tzOffset * 60000)
  return utcTime.toISOString()
}

/**
 * Formats a UTC timestamp as a local date string
 * 
 * @param timestamp - ISO 8601 UTC timestamp
 * @returns Date string in YYYY-MM-DD format
 * 
 * @example
 * formatUTCAsLocalDate("2026-02-06T01:00:00Z")
 * // Returns: "2026-02-05" (in CST)
 */
export function formatUTCAsLocalDate(timestamp: UTCTimestamp): DateString {
  const date = new Date(timestamp)
  return getLocalDate(date)
}

/**
 * Formats a UTC timestamp as a local date string using an explicit timezone offset.
 * Use this in server-side code where the runtime timezone is not the user's timezone.
 *
 * @param timestamp - ISO 8601 UTC timestamp
 * @param tzOffset - Timezone offset in minutes from Date#getTimezoneOffset()
 * @returns Date string in YYYY-MM-DD format for the user's local calendar date
 *
 * @example
 * // CST (UTC-6): getTimezoneOffset() returns 360
 * formatUTCAsLocalDateWithOffset("2026-04-02T01:00:00Z", 360)
 * // Returns: "2026-04-01"
 */
export function formatUTCAsLocalDateWithOffset(
  timestamp: UTCTimestamp,
  tzOffset: TimezoneOffset
): DateString {
  const utcTimestamp = new Date(timestamp)
  const localTimestamp = new Date(utcTimestamp.getTime() - tzOffset * 60000)
  const year = localTimestamp.getUTCFullYear()
  const month = String(localTimestamp.getUTCMonth() + 1).padStart(2, '0')
  const day = String(localTimestamp.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Formats a UTC timestamp as a local date-time display string
 * 
 * @param timestamp - ISO 8601 UTC timestamp
 * @param options - Intl.DateTimeFormatOptions for formatting
 * @returns Formatted date-time string in local timezone
 * 
 * @example
 * formatUTCAsLocalDateTime("2026-02-06T01:00:00Z")
 * // Returns: "2/5/2026, 7:00 PM" (in CST)
 */
export function formatUTCAsLocalDateTime(
  timestamp: UTCTimestamp,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = new Date(timestamp)
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options
  }
  return date.toLocaleString(undefined, defaultOptions)
}

/**
 * Gets the Monday of the week for a given date (in local timezone)
 * Week starts on Monday (ISO 8601 standard)
 * 
 * @param date - Date to find week start for (defaults to today)
 * @returns Date object set to Monday at 00:00:00 local time
 * 
 * @example
 * // If today is Wednesday, Feb 5, 2026
 * getWeekStart()
 * // Returns: Date for Monday, Feb 3, 2026 at 00:00:00
 */
export function getWeekStart(date: Date = new Date()): Date {
  const monday = new Date(date)
  const day = monday.getDay()
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

/**
 * Gets the week start as a YYYY-MM-DD string
 * 
 * @param date - Date to find week start for (defaults to today)
 * @returns Date string for Monday of the week
 * 
 * @example
 * // If today is Wednesday, Feb 5, 2026
 * getWeekStartString()
 * // Returns: "2026-02-03"
 */
export function getWeekStartString(date: Date = new Date()): DateString {
  return getLocalDate(getWeekStart(date))
}

/**
 * Calculates days elapsed from week start to current date (inclusive)
 * Returns 1-7 where Monday = 1, Sunday = 7
 * 
 * @param weekStart - Monday of the week
 * @param currentDate - Current date (defaults to today)
 * @returns Number of days elapsed (1-7)
 * 
 * @example
 * // If today is Wednesday
 * const monday = getWeekStart()
 * calculateDaysElapsed(monday, new Date())
 * // Returns: 3
 */
export function calculateDaysElapsed(
  weekStart: Date,
  currentDate: Date = new Date()
): number {
  // Normalize to start of day to avoid time-of-day issues
  const start = new Date(weekStart)
  start.setHours(0, 0, 0, 0)
  
  const current = new Date(currentDate)
  current.setHours(0, 0, 0, 0)
  
  // Calculate difference in days
  const diffTime = current.getTime() - start.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  // Days elapsed is diffDays + 1 (inclusive of start day)
  // Clamp to 1-7 range
  return Math.max(1, Math.min(7, diffDays + 1))
}

/**
 * Checks if two dates are the same calendar day (in local timezone)
 * 
 * @param date1 - First date (Date object or YYYY-MM-DD string)
 * @param date2 - Second date (Date object or YYYY-MM-DD string)
 * @returns True if same calendar day
 * 
 * @example
 * isSameDay("2026-02-05", "2026-02-05") // true
 * isSameDay(new Date("2026-02-05T10:00:00"), new Date("2026-02-05T22:00:00")) // true
 */
export function isSameDay(date1: Date | DateString, date2: Date | DateString): boolean {
  const str1 = typeof date1 === 'string' ? date1.split('T')[0] : getLocalDate(date1)
  const str2 = typeof date2 === 'string' ? date2.split('T')[0] : getLocalDate(date2)
  return str1 === str2
}

/**
 * Checks if a date is today (in local timezone)
 * 
 * @param date - Date to check (Date object or YYYY-MM-DD string)
 * @returns True if date is today
 * 
 * @example
 * isToday("2026-02-05") // true if today is Feb 5, 2026
 * isToday(new Date()) // true
 */
export function isToday(date: Date | DateString): boolean {
  return isSameDay(date, new Date())
}

/**
 * Checks if a date is in the future (in local timezone)
 * 
 * @param date - Date to check (Date object or YYYY-MM-DD string)
 * @returns True if date is after today
 * 
 * @example
 * isFuture("2026-02-10") // true if today is before Feb 10, 2026
 * isFuture("2026-02-01") // false if today is after Feb 1, 2026
 */
export function isFuture(date: Date | DateString): boolean {
  const dateStr = typeof date === 'string' ? date.split('T')[0] : getLocalDate(date)
  const todayStr = getLocalDate()
  return dateStr > todayStr
}

/**
 * Validates timezone offset is within valid range
 * Valid range: -720 to 840 minutes (UTC-12 to UTC+14)
 * 
 * @param tzOffset - Timezone offset in minutes
 * @returns True if valid
 * 
 * @example
 * isValidTimezoneOffset(-360) // true (CST)
 * isValidTimezoneOffset(1000) // false (out of range)
 */
export function isValidTimezoneOffset(tzOffset: TimezoneOffset): boolean {
  return tzOffset >= -720 && tzOffset <= 840
}

/**
 * Parses a date string and returns a Date object
 * Handles YYYY-MM-DD format without timezone conversion
 * 
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Date object at local midnight
 * 
 * @example
 * parseDateString("2026-02-05")
 * // Returns: Date object for Feb 5, 2026 at 00:00:00 local time
 */
export function parseDateString(dateStr: DateString): Date {
  const { year, monthIndex, day } = parseDateParts(dateStr)
  return new Date(year, monthIndex, day, 0, 0, 0, 0)
}

/**
 * Gets an array of dates for a week (Monday through Sunday)
 * 
 * @param weekStart - Monday of the week
 * @returns Array of 7 Date objects
 * 
 * @example
 * const monday = getWeekStart()
 * const weekDays = getWeekDays(monday)
 * // Returns: [Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday]
 */
export function getWeekDays(weekStart: Date): Date[] {
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart)
    day.setDate(weekStart.getDate() + i)
    days.push(day)
  }
  return days
}
