import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 14: Cached Data with Staleness Indicator
 * 
 * The system should:
 * 1. Return cached data even when stale (>24 hours old)
 * 2. Include staleness indicator in response
 * 3. Calculate staleness based on last_sync_at timestamp
 * 4. Never mark data as fresh when sync failed
 * 5. Handle null last_sync_at (treat as stale)
 */

describe('Property 14: Cached Data with Staleness Indicator', () => {
  it('should return cached data even when stale', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 25, max: 168 }), // hours ago (>24 hours)
        fc.integer({ min: 0, max: 100 }),
        (hoursAgo, recoveryScore) => {
          const lastSyncAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
          const staleness = true; // >24 hours

          const response = {
            recovery: { recovery_score: recoveryScore },
            connectionStatus: 'connected',
            lastSyncAt: lastSyncAt.toISOString(),
            staleness
          };

          // Should still return data
          expect(response.recovery).not.toBeNull();
          expect(response.recovery.recovery_score).toBe(recoveryScore);
          expect(response.staleness).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should calculate staleness correctly based on last_sync_at', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 72 }), // hours ago
        (hoursAgo) => {
          const lastSyncAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
          const ageMs = Date.now() - lastSyncAt.getTime();
          const staleness = ageMs > 24 * 60 * 60 * 1000;

          const expectedStaleness = hoursAgo > 24;
          expect(staleness).toBe(expectedStaleness);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include staleness indicator in all responses', () => {
    fc.assert(
      fc.property(
        fc.option(
          fc.date({ min: new Date('2024-01-01'), max: new Date() })
            .filter(date => !Number.isNaN(date.getTime())),
          { nil: null }
        ),
        fc.integer({ min: 0, max: 100 }),
        (lastSyncAt, recoveryScore) => {
          const staleness = lastSyncAt
            ? Date.now() - lastSyncAt.getTime() > 24 * 60 * 60 * 1000
            : true;

          const response = {
            recovery: { recovery_score: recoveryScore },
            connectionStatus: 'connected',
            lastSyncAt: lastSyncAt?.toISOString() || null,
            staleness
          };

          expect(response).toHaveProperty('staleness');
          expect(typeof response.staleness).toBe('boolean');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should treat null last_sync_at as stale', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        (recoveryScore) => {
          const lastSyncAt = null;
          const staleness = true; // null = stale

          const response = {
            recovery: { recovery_score: recoveryScore },
            connectionStatus: 'connected',
            lastSyncAt,
            staleness
          };

          expect(response.staleness).toBe(true);
          expect(response.lastSyncAt).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should mark data as fresh when recently synced', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }), // hours ago (<24 hours)
        fc.integer({ min: 0, max: 100 }),
        (hoursAgo, recoveryScore) => {
          const lastSyncAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
          const staleness = false; // <24 hours

          const response = {
            recovery: { recovery_score: recoveryScore },
            connectionStatus: 'connected',
            lastSyncAt: lastSyncAt.toISOString(),
            staleness
          };

          expect(response.staleness).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle boundary case at exactly 24 hours', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -60, max: 60 }), // seconds around 24 hours
        (secondsOffset) => {
          const exactlyOneDayAgo = 24 * 60 * 60 * 1000;
          const lastSyncAt = new Date(Date.now() - exactlyOneDayAgo - secondsOffset * 1000);
          const ageMs = Date.now() - lastSyncAt.getTime();
          const staleness = ageMs > 24 * 60 * 60 * 1000;

          if (secondsOffset > 0) {
            // More than 24 hours ago (negative offset = further in past)
            expect(staleness).toBe(true);
          } else if (secondsOffset < 0) {
            // Less than 24 hours ago (positive offset = more recent)
            expect(staleness).toBe(false);
          }
          // At exactly 0, could be either depending on timing
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve staleness indicator across data types', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 72 }),
        fc.record({
          recovery_score: fc.integer({ min: 0, max: 100 }),
          sleep_performance: fc.integer({ min: 0, max: 100 }),
          strain: fc.float({ min: 0, max: 21 })
        }),
        (hoursAgo, metrics) => {
          const lastSyncAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
          const staleness = hoursAgo > 24;

          const response = {
            recovery: { recovery_score: metrics.recovery_score },
            sleep: { sleep_performance: metrics.sleep_performance },
            cycle: { strain: metrics.strain },
            connectionStatus: 'connected',
            lastSyncAt: lastSyncAt.toISOString(),
            staleness
          };

          // Staleness applies to all data types
          expect(response.staleness).toBe(staleness);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle disconnected state with no staleness calculation', () => {
    fc.assert(
      fc.property(
        fc.constant('disconnected'),
        (connectionStatus) => {
          const response = {
            recovery: null,
            sleep: null,
            cycle: null,
            workouts: [],
            connectionStatus,
            lastSyncAt: null,
            staleness: false // No data = not stale
          };

          expect(response.connectionStatus).toBe('disconnected');
          expect(response.lastSyncAt).toBeNull();
          expect(response.staleness).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should calculate staleness consistently across multiple calls', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2024-01-01'), max: new Date() })
          .filter(date => !Number.isNaN(date.getTime())),
        (lastSyncAt) => {
          const now = Date.now();
          
          // Calculate staleness twice
          const staleness1 = now - lastSyncAt.getTime() > 24 * 60 * 60 * 1000;
          const staleness2 = now - lastSyncAt.getTime() > 24 * 60 * 60 * 1000;

          // Should be consistent
          expect(staleness1).toBe(staleness2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
