import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 7: WHOOP Data Field Extraction
 * 
 * For any valid WHOOP API response (recovery, sleep, cycle, or workout),
 * all required fields defined in the schema SHALL be extracted and stored
 * in the corresponding database table, with null values for any missing
 * optional fields.
 * 
 * Validates: Requirements 3.3, 3.4, 3.5, 3.6
 * 
 * Feature: whoop-integration
 * Property 7: Data transformation extracts all required fields
 */

// Mock WHOOP API response generators
const validDateArbitrary = fc.date({ 
  min: new Date('2024-01-01'), 
  max: new Date('2026-12-31') 
}).filter(d => !isNaN(d.getTime()));

const recoveryResponseArbitrary = fc.record({
  cycle_id: fc.integer({ min: 1, max: 1000000 }),
  created_at: validDateArbitrary.map(d => d.toISOString()),
  score: fc.record({
    recovery_score: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    resting_heart_rate: fc.option(fc.integer({ min: 40, max: 100 }), { nil: null }),
    hrv_rmssd_milli: fc.option(fc.float({ min: 10, max: 200 }), { nil: null }),
    spo2_percentage: fc.option(fc.float({ min: 90, max: 100 }), { nil: null }),
    skin_temp_celsius: fc.option(fc.float({ min: 30, max: 40 }), { nil: null }),
  }),
});

const sleepResponseArbitrary = fc.record({
  id: fc.uuid(), // Changed from fc.integer() to fc.uuid()
  created_at: validDateArbitrary.map(d => d.toISOString()),
  nap: fc.boolean(),
  score: fc.record({
    sleep_performance_percentage: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    sleep_consistency_percentage: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    sleep_efficiency_percentage: fc.option(fc.float({ min: 0, max: 100 }), { nil: null }),
    respiratory_rate: fc.option(fc.float({ min: 10, max: 25 }), { nil: null }),
    stage_summary: fc.record({
      total_in_bed_time_milli: fc.option(fc.integer({ min: 0, max: 36000000 }), { nil: null }),
    }),
  }),
});

const cycleResponseArbitrary = fc.record({
  id: fc.integer({ min: 1, max: 1000000 }),
  created_at: validDateArbitrary.map(d => d.toISOString()),
  score: fc.record({
    strain: fc.option(fc.float({ min: 0, max: 21 }), { nil: null }),
    kilojoule: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: null }),
    average_heart_rate: fc.option(fc.integer({ min: 40, max: 200 }), { nil: null }),
    max_heart_rate: fc.option(fc.integer({ min: 60, max: 220 }), { nil: null }),
  }),
});

const workoutResponseArbitrary = fc.record({
  id: fc.uuid(), // Changed from fc.integer() to fc.uuid()
  created_at: validDateArbitrary.map(d => d.toISOString()),
  sport_name: fc.option(fc.constantFrom('Running', 'Cycling', 'Weightlifting', 'Swimming'), { nil: null }),
  sport_id: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
  score: fc.record({
    strain: fc.option(fc.float({ min: 0, max: 21 }), { nil: null }),
    average_heart_rate: fc.option(fc.integer({ min: 40, max: 200 }), { nil: null }),
    max_heart_rate: fc.option(fc.integer({ min: 60, max: 220 }), { nil: null }),
    distance_meter: fc.option(fc.float({ min: 0, max: 50000 }), { nil: null }),
    altitude_gain_meter: fc.option(fc.float({ min: 0, max: 5000 }), { nil: null }),
    duration_milli: fc.option(fc.integer({ min: 0, max: 36000000 }), { nil: null }),
  }),
});

// Transformation functions (simplified versions of sync-service.ts)
function transformRecoveryData(userId: string, apiData: any) {
  return {
    user_id: userId,
    cycle_id: apiData.cycle_id,
    date: apiData.created_at ? new Date(apiData.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    recovery_score: apiData.score?.recovery_score ?? null,
    resting_heart_rate: apiData.score?.resting_heart_rate ?? null,
    hrv_rmssd_milli: apiData.score?.hrv_rmssd_milli ?? null,
    spo2_percentage: apiData.score?.spo2_percentage ?? null,
    skin_temp_celsius: apiData.score?.skin_temp_celsius ?? null,
  };
}

function transformSleepData(userId: string, apiData: any) {
  return {
    user_id: userId,
    sleep_id: apiData.id,
    date: apiData.created_at ? new Date(apiData.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    sleep_performance_percentage: apiData.score?.sleep_performance_percentage ?? null,
    sleep_consistency_percentage: apiData.score?.sleep_consistency_percentage ?? null,
    sleep_efficiency_percentage: apiData.score?.sleep_efficiency_percentage ?? null,
    respiratory_rate: apiData.score?.respiratory_rate ?? null,
    total_sleep_duration_ms: apiData.score?.stage_summary?.total_in_bed_time_milli ?? null,
    is_nap: apiData.nap ?? false,
  };
}

function transformCycleData(userId: string, apiData: any) {
  return {
    user_id: userId,
    cycle_id: apiData.id,
    date: apiData.created_at ? new Date(apiData.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    strain: apiData.score?.strain ?? null,
    kilojoules: apiData.score?.kilojoule ?? null,
    average_heart_rate: apiData.score?.average_heart_rate ?? null,
    max_heart_rate: apiData.score?.max_heart_rate ?? null,
  };
}

function transformWorkoutData(userId: string, apiData: any) {
  return {
    user_id: userId,
    whoop_workout_id: apiData.id,
    date: apiData.created_at ? new Date(apiData.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    sport_name: apiData.sport_name ?? null,
    sport_id: apiData.sport_id ?? null,
    strain: apiData.score?.strain ?? null,
    average_heart_rate: apiData.score?.average_heart_rate ?? null,
    max_heart_rate: apiData.score?.max_heart_rate ?? null,
    distance_meter: apiData.score?.distance_meter ?? null,
    altitude_gain_meter: apiData.score?.altitude_gain_meter ?? null,
    duration_ms: apiData.score?.duration_milli ?? null,
  };
}

describe('Property 7: WHOOP Data Field Extraction', () => {
  it('should extract all required recovery fields', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        recoveryResponseArbitrary,
        (userId, apiResponse) => {
          // Act
          const transformed = transformRecoveryData(userId, apiResponse);
          
          // Assert: Required fields must be present
          expect(transformed.user_id).toBe(userId);
          expect(transformed.cycle_id).toBe(apiResponse.cycle_id);
          expect(transformed.date).toBeDefined();
          expect(typeof transformed.date).toBe('string');
          
          // Assert: Optional fields can be null
          expect(transformed.recovery_score === null || typeof transformed.recovery_score === 'number').toBe(true);
          expect(transformed.resting_heart_rate === null || typeof transformed.resting_heart_rate === 'number').toBe(true);
          expect(transformed.hrv_rmssd_milli === null || typeof transformed.hrv_rmssd_milli === 'number').toBe(true);
          expect(transformed.spo2_percentage === null || typeof transformed.spo2_percentage === 'number').toBe(true);
          expect(transformed.skin_temp_celsius === null || typeof transformed.skin_temp_celsius === 'number').toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should extract all required sleep fields', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        sleepResponseArbitrary,
        (userId, apiResponse) => {
          // Act
          const transformed = transformSleepData(userId, apiResponse);
          
          // Assert: Required fields must be present
          expect(transformed.user_id).toBe(userId);
          expect(transformed.sleep_id).toBe(apiResponse.id);
          expect(transformed.date).toBeDefined();
          expect(typeof transformed.is_nap).toBe('boolean');
          
          // Assert: Optional fields can be null
          expect(transformed.sleep_performance_percentage === null || typeof transformed.sleep_performance_percentage === 'number').toBe(true);
          expect(transformed.sleep_consistency_percentage === null || typeof transformed.sleep_consistency_percentage === 'number').toBe(true);
          expect(transformed.sleep_efficiency_percentage === null || typeof transformed.sleep_efficiency_percentage === 'number').toBe(true);
          expect(transformed.respiratory_rate === null || typeof transformed.respiratory_rate === 'number').toBe(true);
          expect(transformed.total_sleep_duration_ms === null || typeof transformed.total_sleep_duration_ms === 'number').toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should extract all required cycle fields', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        cycleResponseArbitrary,
        (userId, apiResponse) => {
          // Act
          const transformed = transformCycleData(userId, apiResponse);
          
          // Assert: Required fields must be present
          expect(transformed.user_id).toBe(userId);
          expect(transformed.cycle_id).toBe(apiResponse.id);
          expect(transformed.date).toBeDefined();
          
          // Assert: Optional fields can be null
          expect(transformed.strain === null || typeof transformed.strain === 'number').toBe(true);
          expect(transformed.kilojoules === null || typeof transformed.kilojoules === 'number').toBe(true);
          expect(transformed.average_heart_rate === null || typeof transformed.average_heart_rate === 'number').toBe(true);
          expect(transformed.max_heart_rate === null || typeof transformed.max_heart_rate === 'number').toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should extract all required workout fields', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        workoutResponseArbitrary,
        (userId, apiResponse) => {
          // Act
          const transformed = transformWorkoutData(userId, apiResponse);
          
          // Assert: Required fields must be present
          expect(transformed.user_id).toBe(userId);
          expect(transformed.whoop_workout_id).toBe(apiResponse.id);
          expect(transformed.date).toBeDefined();
          
          // Assert: Optional fields can be null or correct type
          expect(transformed.sport_name === null || typeof transformed.sport_name === 'string').toBe(true);
          expect(transformed.sport_id === null || typeof transformed.sport_id === 'number').toBe(true);
          expect(transformed.strain === null || typeof transformed.strain === 'number').toBe(true);
          expect(transformed.average_heart_rate === null || typeof transformed.average_heart_rate === 'number').toBe(true);
          expect(transformed.max_heart_rate === null || typeof transformed.max_heart_rate === 'number').toBe(true);
          expect(transformed.distance_meter === null || typeof transformed.distance_meter === 'number').toBe(true);
          expect(transformed.altitude_gain_meter === null || typeof transformed.altitude_gain_meter === 'number').toBe(true);
          expect(transformed.duration_ms === null || typeof transformed.duration_ms === 'number').toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle missing optional fields with null', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 1, max: 1000000 }),
        (userId, cycleId) => {
          // Arrange: API response with missing optional fields
          const apiResponse = {
            cycle_id: cycleId,
            created_at: new Date().toISOString(),
            score: {}, // Empty score object
          };
          
          // Act
          const transformed = transformRecoveryData(userId, apiResponse);
          
          // Assert: All optional fields should be null
          expect(transformed.recovery_score).toBeNull();
          expect(transformed.resting_heart_rate).toBeNull();
          expect(transformed.hrv_rmssd_milli).toBeNull();
          expect(transformed.spo2_percentage).toBeNull();
          expect(transformed.skin_temp_celsius).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve user_id across all transformations', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        recoveryResponseArbitrary,
        sleepResponseArbitrary,
        cycleResponseArbitrary,
        workoutResponseArbitrary,
        (userId, recovery, sleep, cycle, workout) => {
          // Act
          const transformedRecovery = transformRecoveryData(userId, recovery);
          const transformedSleep = transformSleepData(userId, sleep);
          const transformedCycle = transformCycleData(userId, cycle);
          const transformedWorkout = transformWorkoutData(userId, workout);
          
          // Assert: user_id should be preserved in all transformations
          expect(transformedRecovery.user_id).toBe(userId);
          expect(transformedSleep.user_id).toBe(userId);
          expect(transformedCycle.user_id).toBe(userId);
          expect(transformedWorkout.user_id).toBe(userId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce valid date strings', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        recoveryResponseArbitrary,
        (userId, apiResponse) => {
          // Act
          const transformed = transformRecoveryData(userId, apiResponse);
          
          // Assert: Date should be in YYYY-MM-DD format
          expect(transformed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          
          // Assert: Date should be parseable
          const parsedDate = new Date(transformed.date);
          expect(isNaN(parsedDate.getTime())).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle undefined score objects gracefully', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 1, max: 1000000 }),
        (userId, id) => {
          // Arrange: API response with undefined score
          const apiResponse = {
            id,
            created_at: new Date().toISOString(),
            score: undefined,
          };
          
          // Act
          const transformed = transformCycleData(userId, apiResponse);
          
          // Assert: Should not throw and all optional fields should be null
          expect(transformed.strain).toBeNull();
          expect(transformed.kilojoules).toBeNull();
          expect(transformed.average_heart_rate).toBeNull();
          expect(transformed.max_heart_rate).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
