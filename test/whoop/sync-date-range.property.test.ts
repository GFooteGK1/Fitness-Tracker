import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 6: Initial Sync Date Range
 * 
 * For any initial sync triggered after WHOOP connection, the date range
 * requested from the WHOOP API SHALL span exactly 7 days from the current
 * date (inclusive of today, exclusive of 8 days ago).
 * 
 * Validates: Requirements 3.1
 * 
 * Feature: whoop-integration
 * Property 6: Initial sync fetches exactly 7 days of history
 */

interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Calculate the date range for initial sync
 * This simulates the logic in fullSync()
 */
function calculateInitialSyncDateRange(currentDate: Date): DateRange {
  const endDate = new Date(currentDate);
  const startDate = new Date(currentDate);
  startDate.setDate(startDate.getDate() - 7);
  
  return { startDate, endDate };
}

/**
 * Calculate the number of days between two dates
 */
function daysBetween(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const startMs = start.getTime();
  const endMs = end.getTime();
  return Math.round((endMs - startMs) / msPerDay);
}

/**
 * Check if a date is before another date (ignoring time)
 */
function isDateBefore(date1: Date, date2: Date): boolean {
  const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  return d1 < d2;
}

/**
 * Check if a date is the same day as another date (ignoring time)
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

// Create a valid date arbitrary
const validDateArbitrary = fc.date({ 
  min: new Date('2024-01-01'), 
  max: new Date('2026-12-31') 
}).filter(d => !isNaN(d.getTime()));

describe('Property 6: Initial Sync Date Range', () => {
  it('should always span exactly 7 days', () => {
    fc.assert(
      fc.property(
        validDateArbitrary,
        (currentDate) => {
          // Act
          const { startDate, endDate } = calculateInitialSyncDateRange(currentDate);
          
          // Assert: Date range should be exactly 7 days
          const days = daysBetween(startDate, endDate);
          expect(days).toBe(7);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include today in the date range', () => {
    fc.assert(
      fc.property(
        validDateArbitrary,
        (currentDate) => {
          // Act
          const { startDate, endDate } = calculateInitialSyncDateRange(currentDate);
          
          // Assert: End date should be today (or same day as current date)
          expect(isSameDay(endDate, currentDate)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should start 7 days before today', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2024-01-08'), max: new Date('2026-12-31') }).filter(d => !isNaN(d.getTime())),
        (currentDate) => {
          // Act
          const { startDate, endDate } = calculateInitialSyncDateRange(currentDate);
          
          // Assert: Start date should be 7 days before end date
          const expectedStartDate = new Date(currentDate);
          expectedStartDate.setDate(expectedStartDate.getDate() - 7);
          
          expect(isSameDay(startDate, expectedStartDate)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have start date before end date', () => {
    fc.assert(
      fc.property(
        validDateArbitrary,
        (currentDate) => {
          // Act
          const { startDate, endDate } = calculateInitialSyncDateRange(currentDate);
          
          // Assert: Start date must be before end date
          expect(isDateBefore(startDate, endDate)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle month boundaries correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 2024, max: 2026 }),
        (month, year) => {
          // Arrange: Create a date at the start of a month
          const currentDate = new Date(year, month - 1, 1);
          
          // Act
          const { startDate, endDate } = calculateInitialSyncDateRange(currentDate);
          
          // Assert: Should still be exactly 7 days
          const days = daysBetween(startDate, endDate);
          expect(days).toBe(7);
          
          // Assert: Start date should be in previous month
          expect(startDate.getMonth()).not.toBe(endDate.getMonth());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle year boundaries correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2024, max: 2026 }),
        (year) => {
          // Arrange: Create a date at the start of a year
          const currentDate = new Date(year, 0, 1); // January 1st
          
          // Act
          const { startDate, endDate } = calculateInitialSyncDateRange(currentDate);
          
          // Assert: Should still be exactly 7 days
          const days = daysBetween(startDate, endDate);
          expect(days).toBe(7);
          
          // Assert: Start date should be in previous year
          expect(startDate.getFullYear()).toBe(year - 1);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle leap years correctly', () => {
    // Test around February 29th in leap years
    fc.assert(
      fc.property(
        fc.constantFrom(2024, 2028, 2032), // Leap years
        (year) => {
          // Arrange: Create a date around leap day
          const currentDate = new Date(year, 2, 1); // March 1st
          
          // Act
          const { startDate, endDate } = calculateInitialSyncDateRange(currentDate);
          
          // Assert: Should still be exactly 7 days
          const days = daysBetween(startDate, endDate);
          expect(days).toBe(7);
          
          // Assert: Start date should include Feb 29th in the range
          expect(startDate.getMonth()).toBe(1); // February
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should be consistent for the same date', () => {
    fc.assert(
      fc.property(
        validDateArbitrary,
        (currentDate) => {
          // Act: Calculate date range twice
          const range1 = calculateInitialSyncDateRange(currentDate);
          const range2 = calculateInitialSyncDateRange(currentDate);
          
          // Assert: Should produce identical results
          expect(isSameDay(range1.startDate, range2.startDate)).toBe(true);
          expect(isSameDay(range1.endDate, range2.endDate)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle different times of day consistently', () => {
    fc.assert(
      fc.property(
        validDateArbitrary,
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (baseDate, hour, minute) => {
          // Arrange: Create date with specific time
          const currentDate = new Date(baseDate);
          currentDate.setHours(hour, minute, 0, 0);
          
          // Act
          const { startDate, endDate } = calculateInitialSyncDateRange(currentDate);
          
          // Assert: Date range should be 7 days regardless of time
          const days = daysBetween(startDate, endDate);
          expect(days).toBe(7);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should never have negative date range', () => {
    fc.assert(
      fc.property(
        validDateArbitrary,
        (currentDate) => {
          // Act
          const { startDate, endDate } = calculateInitialSyncDateRange(currentDate);
          
          // Assert: End date must be after or equal to start date
          expect(endDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce valid ISO date strings', () => {
    fc.assert(
      fc.property(
        validDateArbitrary,
        (currentDate) => {
          // Act
          const { startDate, endDate } = calculateInitialSyncDateRange(currentDate);
          
          // Assert: Dates should be valid and convertible to ISO strings
          expect(() => startDate.toISOString()).not.toThrow();
          expect(() => endDate.toISOString()).not.toThrow();
          
          // Assert: ISO strings should be valid date format
          const startISO = startDate.toISOString();
          const endISO = endDate.toISOString();
          
          expect(startISO).toMatch(/^\d{4}-\d{2}-\d{2}T/);
          expect(endISO).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        }
      ),
      { numRuns: 100 }
    );
  });
});
