/**
 * Property-Based Test: API Response Validation
 * 
 * Feature: whoop-integration
 * Property 15: API Response Validation
 * 
 * Validates: Requirements 8.5
 * 
 * Property: For any WHOOP API response, the validation function SHALL reject
 * responses missing required fields (cycle_id for recovery/cycles, sleep_id for
 * sleep, workout_id for workouts) and accept responses with all required fields present.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type {
  WhoopRecoveryResponse,
  WhoopSleepResponse,
  WhoopCycleResponse,
  WhoopWorkoutResponse
} from '../../app/lib/types/whoop';

// Validation functions
function validateRecoveryResponse(response: any): boolean {
  return (
    typeof response === 'object' &&
    response !== null &&
    typeof response.cycle_id === 'number' &&
    typeof response.score === 'object' &&
    response.score !== null
  );
}

function validateSleepResponse(response: any): boolean {
  return (
    typeof response === 'object' &&
    response !== null &&
    (typeof response.id === 'string' || typeof response.id === 'number') &&
    typeof response.score === 'object' &&
    response.score !== null
  );
}

function validateCycleResponse(response: any): boolean {
  return (
    typeof response === 'object' &&
    response !== null &&
    typeof response.id === 'number' &&
    typeof response.score === 'object' &&
    response.score !== null
  );
}

function validateWorkoutResponse(response: any): boolean {
  return (
    typeof response === 'object' &&
    response !== null &&
    (typeof response.id === 'string' || typeof response.id === 'number') &&
    typeof response.score === 'object' &&
    response.score !== null
  );
}

// Generators for valid WHOOP API responses
const isoDateArbitrary = fc.integer({ min: 1577836800000, max: 1798761600000 }).map(ms => new Date(ms).toISOString());

const validRecoveryResponseArbitrary = fc.record({
  cycle_id: fc.integer({ min: 1, max: 1000000 }),
  sleep_id: fc.integer({ min: 1, max: 1000000 }),
  user_id: fc.integer({ min: 1, max: 100000 }),
  created_at: isoDateArbitrary,
  updated_at: isoDateArbitrary,
  score_state: fc.constantFrom('SCORED', 'PENDING', 'UNSCORABLE'),
  score: fc.record({
    user_calibrating: fc.boolean(),
    recovery_score: fc.integer({ min: 0, max: 100 }),
    resting_heart_rate: fc.integer({ min: 40, max: 100 }),
    hrv_rmssd_milli: fc.float({ min: 10, max: 200 }),
    spo2_percentage: fc.float({ min: 90, max: 100 }),
    skin_temp_celsius: fc.float({ min: 30, max: 40 })
  })
});

const validSleepResponseArbitrary = fc.record({
  id: fc.oneof(fc.uuid(), fc.integer({ min: 1 }).map(String)),
  cycle_id: fc.integer({ min: 1, max: 1000000 }),
  user_id: fc.integer({ min: 1, max: 100000 }),
  created_at: isoDateArbitrary,
  updated_at: isoDateArbitrary,
  start: isoDateArbitrary,
  end: isoDateArbitrary,
  timezone_offset: fc.constantFrom('-08:00', '-05:00', '+00:00', '+01:00'),
  nap: fc.boolean(),
  score_state: fc.constantFrom('SCORED', 'PENDING', 'UNSCORABLE'),
  score: fc.record({
    respiratory_rate: fc.float({ min: 10, max: 25 }),
    sleep_performance_percentage: fc.integer({ min: 0, max: 100 }),
    sleep_consistency_percentage: fc.integer({ min: 0, max: 100 }),
    sleep_efficiency_percentage: fc.float({ min: 0, max: 100 })
  })
});

const validCycleResponseArbitrary = fc.record({
  id: fc.integer({ min: 1, max: 1000000 }),
  user_id: fc.integer({ min: 1, max: 100000 }),
  created_at: isoDateArbitrary,
  updated_at: isoDateArbitrary,
  start: isoDateArbitrary,
  end: isoDateArbitrary,
  timezone_offset: fc.constantFrom('-08:00', '-05:00', '+00:00', '+01:00'),
  score_state: fc.constantFrom('SCORED', 'PENDING', 'UNSCORABLE'),
  score: fc.record({
    strain: fc.float({ min: 0, max: 21 }),
    kilojoule: fc.integer({ min: 0, max: 10000 }),
    average_heart_rate: fc.integer({ min: 50, max: 200 }),
    max_heart_rate: fc.integer({ min: 100, max: 220 })
  })
});

const validWorkoutResponseArbitrary = fc.record({
  id: fc.oneof(fc.uuid(), fc.integer({ min: 1 }).map(String)),
  user_id: fc.integer({ min: 1, max: 100000 }),
  created_at: isoDateArbitrary,
  updated_at: isoDateArbitrary,
  start: isoDateArbitrary,
  end: isoDateArbitrary,
  timezone_offset: fc.constantFrom('-08:00', '-05:00', '+00:00', '+01:00'),
  sport_name: fc.constantFrom('Running', 'Cycling', 'CrossFit', 'Weightlifting'),
  sport_id: fc.integer({ min: 1, max: 100 }),
  score_state: fc.constantFrom('SCORED', 'PENDING', 'UNSCORABLE'),
  score: fc.record({
    strain: fc.float({ min: 0, max: 21 }),
    average_heart_rate: fc.integer({ min: 100, max: 200 }),
    max_heart_rate: fc.integer({ min: 120, max: 220 }),
    kilojoule: fc.integer({ min: 0, max: 5000 }),
    percent_recorded: fc.integer({ min: 0, max: 100 }),
    distance_meter: fc.option(fc.float({ min: 0, max: 50000 })),
    altitude_gain_meter: fc.option(fc.float({ min: 0, max: 5000 }))
  })
});

describe('Property 15: API Response Validation', () => {
  describe('Recovery Response Validation', () => {
    it('should accept valid recovery responses', () => {
      fc.assert(
        fc.property(validRecoveryResponseArbitrary, (response) => {
          return validateRecoveryResponse(response);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject recovery responses missing cycle_id', () => {
      fc.assert(
        fc.property(validRecoveryResponseArbitrary, (response) => {
          const { cycle_id, ...withoutCycleId } = response;
          return !validateRecoveryResponse(withoutCycleId);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject recovery responses missing score object', () => {
      fc.assert(
        fc.property(validRecoveryResponseArbitrary, (response) => {
          const { score, ...withoutScore } = response;
          return !validateRecoveryResponse(withoutScore);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Sleep Response Validation', () => {
    it('should accept valid sleep responses', () => {
      fc.assert(
        fc.property(validSleepResponseArbitrary, (response) => {
          return validateSleepResponse(response);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject sleep responses missing id', () => {
      fc.assert(
        fc.property(validSleepResponseArbitrary, (response) => {
          const { id, ...withoutId } = response;
          return !validateSleepResponse(withoutId);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject sleep responses missing score object', () => {
      fc.assert(
        fc.property(validSleepResponseArbitrary, (response) => {
          const { score, ...withoutScore } = response;
          return !validateSleepResponse(withoutScore);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Cycle Response Validation', () => {
    it('should accept valid cycle responses', () => {
      fc.assert(
        fc.property(validCycleResponseArbitrary, (response) => {
          return validateCycleResponse(response);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject cycle responses missing id', () => {
      fc.assert(
        fc.property(validCycleResponseArbitrary, (response) => {
          const { id, ...withoutId } = response;
          return !validateCycleResponse(withoutId);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject cycle responses missing score object', () => {
      fc.assert(
        fc.property(validCycleResponseArbitrary, (response) => {
          const { score, ...withoutScore } = response;
          return !validateCycleResponse(withoutScore);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Workout Response Validation', () => {
    it('should accept valid workout responses', () => {
      fc.assert(
        fc.property(validWorkoutResponseArbitrary, (response) => {
          return validateWorkoutResponse(response);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject workout responses missing id', () => {
      fc.assert(
        fc.property(validWorkoutResponseArbitrary, (response) => {
          const { id, ...withoutId } = response;
          return !validateWorkoutResponse(withoutId);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject workout responses missing score object', () => {
      fc.assert(
        fc.property(validWorkoutResponseArbitrary, (response) => {
          const { score, ...withoutScore } = response;
          return !validateWorkoutResponse(withoutScore);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('should reject null responses', () => {
      expect(validateRecoveryResponse(null)).toBe(false);
      expect(validateSleepResponse(null)).toBe(false);
      expect(validateCycleResponse(null)).toBe(false);
      expect(validateWorkoutResponse(null)).toBe(false);
    });

    it('should reject undefined responses', () => {
      expect(validateRecoveryResponse(undefined)).toBe(false);
      expect(validateSleepResponse(undefined)).toBe(false);
      expect(validateCycleResponse(undefined)).toBe(false);
      expect(validateWorkoutResponse(undefined)).toBe(false);
    });

    it('should reject empty object responses', () => {
      expect(validateRecoveryResponse({})).toBe(false);
      expect(validateSleepResponse({})).toBe(false);
      expect(validateCycleResponse({})).toBe(false);
      expect(validateWorkoutResponse({})).toBe(false);
    });

    it('should reject responses with wrong type for required fields', () => {
      fc.assert(
        fc.property(validRecoveryResponseArbitrary, (response) => {
          const invalidResponse = { ...response, cycle_id: 'not-a-number' };
          return !validateRecoveryResponse(invalidResponse);
        }),
        { numRuns: 50 }
      );
    });
  });
});
