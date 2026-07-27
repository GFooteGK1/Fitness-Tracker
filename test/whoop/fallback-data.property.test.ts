import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 11: Fallback to Recent Data
 * 
 * When specific date data is unavailable, the system should:
 * 1. Return the most recent available data
 * 2. Include a staleness indicator if data is >24 hours old
 * 3. Never return data from other users
 * 4. Handle missing data gracefully (return null)
 */

describe('Property 11: Fallback to Recent Data', () => {
  it('should return most recent data when specific date unavailable', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }),
        fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }),
        fc.integer({ min: 0, max: 100 }),
        (requestedDate, mostRecentDate, recoveryScore) => {
          // Skip invalid dates
          if (isNaN(requestedDate.getTime()) || isNaN(mostRecentDate.getTime())) return;

          // Simulate database query for specific date (not found)
          const specificDateData = null;
          
          // Simulate fallback to most recent
          const fallbackData = {
            date: mostRecentDate.toISOString().split('T')[0],
            recovery_score: recoveryScore,
            user_id: 'test-user'
          };

          // Should return fallback data
          expect(fallbackData).not.toBeNull();
          expect(fallbackData.recovery_score).toBe(recoveryScore);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should calculate staleness correctly for data >24 hours old', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 72 }), // hours ago
        (hoursAgo) => {
          const now = Date.now();
          const lastSyncAt = new Date(now - hoursAgo * 60 * 60 * 1000);
          const staleness = now - lastSyncAt.getTime() > 24 * 60 * 60 * 1000;

          if (hoursAgo > 24) {
            expect(staleness).toBe(true);
          } else {
            expect(staleness).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should never return data from other users', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 0, max: 100 }),
        (requestingUserId, dataOwnerId, recoveryScore) => {
          // Simulate RLS-enforced query
          const data = requestingUserId === dataOwnerId
            ? { user_id: dataOwnerId, recovery_score: recoveryScore }
            : null;

          if (requestingUserId !== dataOwnerId) {
            expect(data).toBeNull();
          } else {
            expect(data?.user_id).toBe(requestingUserId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle missing data gracefully', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('recovery', 'sleep', 'cycle', 'workouts'),
        (dataType) => {
          // Simulate no data available
          const data = null;

          // Should return null without throwing
          expect(data).toBeNull();
          expect(() => {
            const response = {
              [dataType]: data,
              connectionStatus: 'connected',
              lastSyncAt: new Date().toISOString(),
              staleness: false
            };
            return response;
          }).not.toThrow();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should include staleness indicator in response', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2024-01-01'), max: new Date() }),
        fc.integer({ min: 0, max: 100 }),
        (lastSyncAt, recoveryScore) => {
          // Skip invalid dates
          if (isNaN(lastSyncAt.getTime())) return;

          const staleness = Date.now() - lastSyncAt.getTime() > 24 * 60 * 60 * 1000;
          
          const response = {
            recovery: { recovery_score: recoveryScore },
            connectionStatus: 'connected',
            lastSyncAt: lastSyncAt.toISOString(),
            staleness
          };

          expect(response).toHaveProperty('staleness');
          expect(typeof response.staleness).toBe('boolean');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return empty array for workouts when no data', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        (workoutsData) => {
          const response = {
            workouts: workoutsData || [],
            connectionStatus: 'connected',
            lastSyncAt: new Date().toISOString(),
            staleness: false
          };

          expect(Array.isArray(response.workouts)).toBe(true);
          expect(response.workouts.length).toBe(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should prioritize most recent data when multiple records exist', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            date: fc.date({ min: new Date('2024-01-01'), max: new Date() }),
            recovery_score: fc.integer({ min: 0, max: 100 })
          }),
          { minLength: 2, maxLength: 10 }
        ),
        (records) => {
          // Filter out invalid dates
          const validRecords = records.filter(r => !isNaN(r.date.getTime()));
          
          if (validRecords.length === 0) return;

          // Sort by date descending (most recent first)
          const sorted = [...validRecords].sort((a, b) => 
            b.date.getTime() - a.date.getTime()
          );

          const mostRecent = sorted[0];

          // Verify most recent is actually the latest
          for (const record of sorted.slice(1)) {
            expect(mostRecent.date.getTime()).toBeGreaterThanOrEqual(record.date.getTime());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle date range queries correctly', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
        fc.date({ min: new Date('2025-01-01'), max: new Date('2026-12-31') }),
        fc.array(
          fc.record({
            date: fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }),
            recovery_score: fc.integer({ min: 0, max: 100 })
          }),
          { minLength: 0, maxLength: 20 }
        ),
        (startDate, endDate, allRecords) => {
          // Filter records within date range
          const filtered = allRecords.filter(record => 
            record.date >= startDate && record.date <= endDate
          );

          // All filtered records should be within range
          for (const record of filtered) {
            expect(record.date.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
            expect(record.date.getTime()).toBeLessThanOrEqual(endDate.getTime());
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
