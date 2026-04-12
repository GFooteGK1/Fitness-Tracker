/**
 * Unit Tests for Timezone Utilities
 *
 * Tests for getLocalDate, localDateToUTCStart, localDateToUTCEnd, getWeekStart,
 * isValidTimezoneOffset, parseDateString, isSameDay, calculateDaysElapsed, etc.
 *
 * Validates: Timezone standardization spec requirements
 */

import { describe, it, expect } from 'vitest'
import {
  getLocalDate,
  localDateToUTCStart,
  localDateToUTCEnd,
  getWeekStart,
  getWeekStartString,
  calculateDaysElapsed,
  isSameDay,
  isToday,
  isFuture,
  isValidTimezoneOffset,
  parseDateString,
  getWeekDays,
  formatUTCAsLocalDate,
} from '@/app/lib/timezone-utils'

describe('getLocalDate', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = getLocalDate(new Date(2026, 0, 5)) // Jan 5, 2026
    expect(result).toBe('2026-01-05')
  })

  it('pads single-digit months and days', () => {
    const result = getLocalDate(new Date(2026, 2, 3)) // Mar 3, 2026
    expect(result).toBe('2026-03-03')
  })

  it('handles Dec 31 correctly', () => {
    const result = getLocalDate(new Date(2025, 11, 31)) // Dec 31, 2025
    expect(result).toBe('2025-12-31')
  })

  it('handles Jan 1 correctly', () => {
    const result = getLocalDate(new Date(2026, 0, 1)) // Jan 1, 2026
    expect(result).toBe('2026-01-01')
  })

  it('uses local date components, not UTC', () => {
    // 11 PM on Feb 5 local time. In UTC this might be Feb 6.
    // getLocalDate should return the LOCAL date, not UTC.
    const d = new Date(2026, 1, 5, 23, 30, 0) // Feb 5, 2026 11:30 PM local
    expect(getLocalDate(d)).toBe('2026-02-05')
  })
})

describe('localDateToUTCStart', () => {
  it('converts local midnight to UTC for CST (offset 360)', () => {
    // CST (UTC-6): getTimezoneOffset() returns 360
    // Local midnight Feb 5 = Feb 5 06:00 UTC
    const result = localDateToUTCStart('2026-02-05', 360)
    expect(result).toContain('2026-02-05T06:00:00')
  })

  it('converts local midnight to UTC for EST (offset 300)', () => {
    // EST (UTC-5): getTimezoneOffset() returns 300
    // Local midnight Feb 5 = Feb 5 05:00 UTC
    const result = localDateToUTCStart('2026-02-05', 300)
    expect(result).toContain('2026-02-05T05:00:00')
  })

  it('converts local midnight to UTC for CET (offset -60)', () => {
    // CET (UTC+1): getTimezoneOffset() returns -60
    // Local midnight Feb 5 = Feb 4 23:00 UTC
    const result = localDateToUTCStart('2026-02-05', -60)
    expect(result).toContain('2026-02-04T23:00:00')
  })

  it('handles UTC (offset 0)', () => {
    const result = localDateToUTCStart('2026-02-05', 0)
    expect(result).toContain('2026-02-05T00:00:00')
  })

  it('handles IST (offset -330)', () => {
    // IST (UTC+5:30): getTimezoneOffset() returns -330
    // Local midnight Feb 5 = Feb 4 18:30 UTC
    const result = localDateToUTCStart('2026-02-05', -330)
    expect(result).toContain('2026-02-04T18:30:00')
  })
})

describe('localDateToUTCEnd', () => {
  it('converts local end-of-day to UTC for CST (offset 360)', () => {
    // CST: local 23:59:59.999 Feb 5 = Feb 6 05:59:59.999 UTC
    const result = localDateToUTCEnd('2026-02-05', 360)
    expect(result).toContain('2026-02-06T05:59:59')
  })

  it('handles UTC (offset 0)', () => {
    const result = localDateToUTCEnd('2026-02-05', 0)
    expect(result).toContain('2026-02-05T23:59:59')
  })
})

describe('localDateToUTCStart/End round-trip', () => {
  it('UTC boundaries span exactly 24 hours', () => {
    const start = new Date(localDateToUTCStart('2026-02-05', 360))
    const end = new Date(localDateToUTCEnd('2026-02-05', 360))
    const diffMs = end.getTime() - start.getTime()
    // 24 hours minus 1 millisecond
    expect(diffMs).toBe(24 * 60 * 60 * 1000 - 1)
  })

  it('start of next day equals end of current day + 1ms', () => {
    const end = new Date(localDateToUTCEnd('2026-02-05', 300))
    const nextStart = new Date(localDateToUTCStart('2026-02-06', 300))
    expect(nextStart.getTime() - end.getTime()).toBe(1)
  })
})

describe('isValidTimezoneOffset', () => {
  it('accepts valid offsets', () => {
    expect(isValidTimezoneOffset(0)).toBe(true)    // UTC
    expect(isValidTimezoneOffset(360)).toBe(true)   // CST
    expect(isValidTimezoneOffset(-60)).toBe(true)   // CET
    expect(isValidTimezoneOffset(-330)).toBe(true)  // IST
    expect(isValidTimezoneOffset(-720)).toBe(true)  // UTC-12
    expect(isValidTimezoneOffset(840)).toBe(true)   // UTC+14
  })

  it('rejects out-of-range offsets', () => {
    expect(isValidTimezoneOffset(-721)).toBe(false)
    expect(isValidTimezoneOffset(841)).toBe(false)
    expect(isValidTimezoneOffset(1000)).toBe(false)
    expect(isValidTimezoneOffset(-1000)).toBe(false)
  })
})

describe('getWeekStart', () => {
  it('returns Monday for a Wednesday', () => {
    // Feb 5, 2026 is a Thursday
    const thursday = new Date(2026, 1, 5) // Feb 5
    const monday = getWeekStart(thursday)
    expect(monday.getDay()).toBe(1) // Monday
    expect(getLocalDate(monday)).toBe('2026-02-02')
  })

  it('returns same day for a Monday', () => {
    const monday = new Date(2026, 1, 2) // Feb 2, 2026 is Monday
    const result = getWeekStart(monday)
    expect(getLocalDate(result)).toBe('2026-02-02')
  })

  it('returns previous Monday for a Sunday', () => {
    const sunday = new Date(2026, 1, 8) // Feb 8, 2026 is Sunday
    const result = getWeekStart(sunday)
    expect(getLocalDate(result)).toBe('2026-02-02')
  })

  it('sets time to midnight', () => {
    const date = new Date(2026, 1, 5, 15, 30, 45) // Feb 5, 2026 3:30 PM
    const result = getWeekStart(date)
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })
})

describe('getWeekStartString', () => {
  it('returns YYYY-MM-DD for Monday of the week', () => {
    const thursday = new Date(2026, 1, 5) // Feb 5, 2026
    expect(getWeekStartString(thursday)).toBe('2026-02-02')
  })
})

describe('calculateDaysElapsed', () => {
  it('returns 1 for Monday (same day as week start)', () => {
    const monday = new Date(2026, 1, 2)
    expect(calculateDaysElapsed(monday, monday)).toBe(1)
  })

  it('returns 3 for Wednesday', () => {
    const monday = new Date(2026, 1, 2)
    const wednesday = new Date(2026, 1, 4)
    expect(calculateDaysElapsed(monday, wednesday)).toBe(3)
  })

  it('returns 7 for Sunday', () => {
    const monday = new Date(2026, 1, 2)
    const sunday = new Date(2026, 1, 8)
    expect(calculateDaysElapsed(monday, sunday)).toBe(7)
  })

  it('clamps to max 7', () => {
    const monday = new Date(2026, 1, 2)
    const nextTuesday = new Date(2026, 1, 10) // 8 days later
    expect(calculateDaysElapsed(monday, nextTuesday)).toBe(7)
  })

  it('clamps to min 1', () => {
    const monday = new Date(2026, 1, 2)
    const previousSunday = new Date(2026, 1, 1)
    expect(calculateDaysElapsed(monday, previousSunday)).toBe(1)
  })
})

describe('isSameDay', () => {
  it('returns true for same date strings', () => {
    expect(isSameDay('2026-02-05', '2026-02-05')).toBe(true)
  })

  it('returns false for different date strings', () => {
    expect(isSameDay('2026-02-05', '2026-02-06')).toBe(false)
  })

  it('compares Date objects by local date', () => {
    const d1 = new Date(2026, 1, 5, 10, 0, 0)
    const d2 = new Date(2026, 1, 5, 22, 0, 0)
    expect(isSameDay(d1, d2)).toBe(true)
  })

  it('handles mixed string and Date comparison', () => {
    const d = new Date(2026, 1, 5, 15, 0, 0)
    expect(isSameDay('2026-02-05', d)).toBe(true)
  })
})

describe('parseDateString', () => {
  it('parses YYYY-MM-DD to local midnight', () => {
    const result = parseDateString('2026-02-05')
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(1) // Feb = 1
    expect(result.getDate()).toBe(5)
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
  })
})

describe('getWeekDays', () => {
  it('returns 7 consecutive days starting from week start', () => {
    const monday = new Date(2026, 1, 2) // Feb 2, 2026
    const days = getWeekDays(monday)
    expect(days).toHaveLength(7)
    expect(getLocalDate(days[0])).toBe('2026-02-02') // Monday
    expect(getLocalDate(days[6])).toBe('2026-02-08') // Sunday
  })
})

describe('DST edge cases', () => {
  it('UTC boundary calculation is consistent regardless of DST', () => {
    // The key property: for the same offset value, the math is deterministic
    // Spring forward day: March 8, 2026 (2nd Sunday in March for US)
    // Before DST: CST offset = 360
    // After DST: CDT offset = 300
    // Each should produce valid 24-hour boundaries
    const cstStart = new Date(localDateToUTCStart('2026-03-08', 360))
    const cstEnd = new Date(localDateToUTCEnd('2026-03-08', 360))
    expect(cstEnd.getTime() - cstStart.getTime()).toBe(24 * 60 * 60 * 1000 - 1)

    const cdtStart = new Date(localDateToUTCStart('2026-03-08', 300))
    const cdtEnd = new Date(localDateToUTCEnd('2026-03-08', 300))
    expect(cdtEnd.getTime() - cdtStart.getTime()).toBe(24 * 60 * 60 * 1000 - 1)
  })

  it('different offsets produce different UTC times for same local date', () => {
    const cstStart = localDateToUTCStart('2026-03-08', 360)
    const cdtStart = localDateToUTCStart('2026-03-08', 300)
    // CST midnight = UTC 06:00, CDT midnight = UTC 05:00
    expect(cstStart).not.toBe(cdtStart)
  })
})
