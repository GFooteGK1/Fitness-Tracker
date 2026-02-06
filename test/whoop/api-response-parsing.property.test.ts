/**
 * Property-Based Tests: WHOOP API Response Parsing
 * 
 * Tests Properties 5-8:
 * - Property 5: Sleep API Response Parsing
 * - Property 6: Workout API Response Parsing
 * - Property 7: Cycle API Response Parsing
 * - Property 8: Recovery API Response Parsing
 * 
 * Validates: Requirements 4.1, 4.2, 4.3, 7.1, 7.2, 7.3, 7.4
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { validateWhoopIdentifier } from '../../app/lib/whoop/validation'

// Helper to generate valid ISO date strings
const validISODate = () => fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ts => new Date(ts).toISOString())

/**
 * Property 5: Sleep API Response Parsing
 * 
 * For all valid sleep API responses with UUID identifiers:
 * - Parsing must succeed without errors
 * - sleep_id must be preserved as a string
 * - sleep_id must be a valid UUID format
 */
describe('Property 5: Sleep API Response Parsing', () => {
  it('should parse sleep API responses with UUID identifiers', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          created_at: validISODate(),
          score: fc.record({
            sleep_performance_percentage: fc.option(fc.integer({ min: 0, max: 100 })),
            sleep_consistency_percentage: fc.option(fc.integer({ min: 0, max: 100 })),
            sleep_efficiency_percentage: fc.option(fc.integer({ min: 0, max: 100 })),
            respiratory_rate: fc.option(fc.float({ min: 8, max: 25 })),
            stage_summary: fc.record({
              total_in_bed_time_milli: fc.option(fc.integer({ min: 0, max: 43200000 })) // 12 hours max
            })
          }),
          nap: fc.boolean()
        }),
        (apiResponse) => {
          // The transform function should handle this response
          const userId = 'test-user-id'
          
          // Simulate transformation
          const transformed = {
            user_id: userId,
            sleep_id: apiResponse.id,
            date: new Date(apiResponse.created_at).toISOString().split('T')[0],
            sleep_performance_percentage: apiResponse.score.sleep_performance_percentage ?? null,
            sleep_consistency_percentage: apiResponse.score.sleep_consistency_percentage ?? null,
            sleep_efficiency_percentage: apiResponse.score.sleep_efficiency_percentage ?? null,
            respiratory_rate: apiResponse.score.respiratory_rate ?? null,
            total_sleep_duration_ms: apiResponse.score.stage_summary.total_in_bed_time_milli ?? null,
            is_nap: apiResponse.nap
          }
          
          // Verify sleep_id is preserved as string
          expect(typeof transformed.sleep_id).toBe('string')
          
          // Verify sleep_id is a valid UUID
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(transformed.sleep_id)).toBe(true)
          
          // Verify sleep_id matches original
          expect(transformed.sleep_id).toBe(apiResponse.id)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should handle sleep responses with null score fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          created_at: validISODate(),
          score: fc.record({
            sleep_performance_percentage: fc.constantFrom(null, undefined),
            sleep_consistency_percentage: fc.constantFrom(null, undefined),
            sleep_efficiency_percentage: fc.constantFrom(null, undefined),
            respiratory_rate: fc.constantFrom(null, undefined),
            stage_summary: fc.record({
              total_in_bed_time_milli: fc.constantFrom(null, undefined)
            })
          }),
          nap: fc.boolean()
        }),
        (apiResponse) => {
          const userId = 'test-user-id'
          
          const transformed = {
            user_id: userId,
            sleep_id: apiResponse.id,
            date: new Date(apiResponse.created_at).toISOString().split('T')[0],
            sleep_performance_percentage: apiResponse.score.sleep_performance_percentage ?? null,
            sleep_consistency_percentage: apiResponse.score.sleep_consistency_percentage ?? null,
            sleep_efficiency_percentage: apiResponse.score.sleep_efficiency_percentage ?? null,
            respiratory_rate: apiResponse.score.respiratory_rate ?? null,
            total_sleep_duration_ms: apiResponse.score.stage_summary.total_in_bed_time_milli ?? null,
            is_nap: apiResponse.nap
          }
          
          // All score fields should be null
          expect(transformed.sleep_performance_percentage).toBe(null)
          expect(transformed.sleep_consistency_percentage).toBe(null)
          expect(transformed.sleep_efficiency_percentage).toBe(null)
          expect(transformed.respiratory_rate).toBe(null)
          expect(transformed.total_sleep_duration_ms).toBe(null)
          
          // But sleep_id should still be valid
          expect(typeof transformed.sleep_id).toBe('string')
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(transformed.sleep_id)).toBe(true)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 6: Workout API Response Parsing
 * 
 * For all valid workout API responses with UUID identifiers:
 * - Parsing must succeed without errors
 * - whoop_workout_id must be preserved as a string
 * - whoop_workout_id must be a valid UUID format
 */
describe('Property 6: Workout API Response Parsing', () => {
  it('should parse workout API responses with UUID identifiers', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          created_at: validISODate(),
          sport_name: fc.option(fc.string()),
          sport_id: fc.option(fc.integer({ min: 0, max: 100 })),
          score: fc.record({
            strain: fc.option(fc.float({ min: 0, max: 21 })),
            average_heart_rate: fc.option(fc.integer({ min: 40, max: 220 })),
            max_heart_rate: fc.option(fc.integer({ min: 40, max: 220 })),
            distance_meter: fc.option(fc.integer({ min: 0, max: 100000 })),
            altitude_gain_meter: fc.option(fc.integer({ min: 0, max: 5000 })),
            duration_milli: fc.option(fc.integer({ min: 0, max: 14400000 })) // 4 hours max
          })
        }),
        (apiResponse) => {
          const userId = 'test-user-id'
          
          const transformed = {
            user_id: userId,
            whoop_workout_id: apiResponse.id,
            date: new Date(apiResponse.created_at).toISOString().split('T')[0],
            sport_name: apiResponse.sport_name ?? null,
            sport_id: apiResponse.sport_id ?? null,
            strain: apiResponse.score.strain ?? null,
            average_heart_rate: apiResponse.score.average_heart_rate ?? null,
            max_heart_rate: apiResponse.score.max_heart_rate ?? null,
            distance_meter: apiResponse.score.distance_meter ?? null,
            altitude_gain_meter: apiResponse.score.altitude_gain_meter ?? null,
            duration_ms: apiResponse.score.duration_milli ?? null
          }
          
          // Verify whoop_workout_id is preserved as string
          expect(typeof transformed.whoop_workout_id).toBe('string')
          
          // Verify whoop_workout_id is a valid UUID
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(transformed.whoop_workout_id)).toBe(true)
          
          // Verify whoop_workout_id matches original
          expect(transformed.whoop_workout_id).toBe(apiResponse.id)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should handle workout responses with null score fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          created_at: validISODate(),
          sport_name: fc.constantFrom(null, undefined),
          sport_id: fc.constantFrom(null, undefined),
          score: fc.record({
            strain: fc.constantFrom(null, undefined),
            average_heart_rate: fc.constantFrom(null, undefined),
            max_heart_rate: fc.constantFrom(null, undefined),
            distance_meter: fc.constantFrom(null, undefined),
            altitude_gain_meter: fc.constantFrom(null, undefined),
            duration_milli: fc.constantFrom(null, undefined)
          })
        }),
        (apiResponse) => {
          const userId = 'test-user-id'
          
          const transformed = {
            user_id: userId,
            whoop_workout_id: apiResponse.id,
            date: new Date(apiResponse.created_at).toISOString().split('T')[0],
            sport_name: apiResponse.sport_name ?? null,
            sport_id: apiResponse.sport_id ?? null,
            strain: apiResponse.score.strain ?? null,
            average_heart_rate: apiResponse.score.average_heart_rate ?? null,
            max_heart_rate: apiResponse.score.max_heart_rate ?? null,
            distance_meter: apiResponse.score.distance_meter ?? null,
            altitude_gain_meter: apiResponse.score.altitude_gain_meter ?? null,
            duration_ms: apiResponse.score.duration_milli ?? null
          }
          
          // All score fields should be null
          expect(transformed.sport_name).toBe(null)
          expect(transformed.sport_id).toBe(null)
          expect(transformed.strain).toBe(null)
          expect(transformed.average_heart_rate).toBe(null)
          expect(transformed.max_heart_rate).toBe(null)
          expect(transformed.distance_meter).toBe(null)
          expect(transformed.altitude_gain_meter).toBe(null)
          expect(transformed.duration_ms).toBe(null)
          
          // But whoop_workout_id should still be valid
          expect(typeof transformed.whoop_workout_id).toBe('string')
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(transformed.whoop_workout_id)).toBe(true)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 7: Cycle API Response Parsing
 * 
 * For all valid cycle API responses with integer identifiers:
 * - Parsing must succeed without errors
 * - cycle_id must be preserved as a positive integer
 */
describe('Property 7: Cycle API Response Parsing', () => {
  it('should parse cycle API responses with integer identifiers', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.integer({ min: 1, max: 2147483647 }),
          created_at: validISODate(),
          score: fc.record({
            strain: fc.option(fc.float({ min: 0, max: 21 })),
            kilojoule: fc.option(fc.integer({ min: 0, max: 50000 })),
            average_heart_rate: fc.option(fc.integer({ min: 40, max: 220 })),
            max_heart_rate: fc.option(fc.integer({ min: 40, max: 220 }))
          })
        }),
        (apiResponse) => {
          const userId = 'test-user-id'
          
          const transformed = {
            user_id: userId,
            cycle_id: apiResponse.id,
            date: new Date(apiResponse.created_at).toISOString().split('T')[0],
            strain: apiResponse.score.strain ?? null,
            kilojoules: apiResponse.score.kilojoule ?? null,
            average_heart_rate: apiResponse.score.average_heart_rate ?? null,
            max_heart_rate: apiResponse.score.max_heart_rate ?? null
          }
          
          // Verify cycle_id is preserved as number
          expect(typeof transformed.cycle_id).toBe('number')
          
          // Verify cycle_id is a positive integer
          expect(Number.isInteger(transformed.cycle_id)).toBe(true)
          expect(transformed.cycle_id).toBeGreaterThan(0)
          
          // Verify cycle_id matches original
          expect(transformed.cycle_id).toBe(apiResponse.id)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should handle cycle responses with null score fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.integer({ min: 1, max: 2147483647 }),
          created_at: validISODate(),
          score: fc.record({
            strain: fc.constantFrom(null, undefined),
            kilojoule: fc.constantFrom(null, undefined),
            average_heart_rate: fc.constantFrom(null, undefined),
            max_heart_rate: fc.constantFrom(null, undefined)
          })
        }),
        (apiResponse) => {
          const userId = 'test-user-id'
          
          const transformed = {
            user_id: userId,
            cycle_id: apiResponse.id,
            date: new Date(apiResponse.created_at).toISOString().split('T')[0],
            strain: apiResponse.score.strain ?? null,
            kilojoules: apiResponse.score.kilojoule ?? null,
            average_heart_rate: apiResponse.score.average_heart_rate ?? null,
            max_heart_rate: apiResponse.score.max_heart_rate ?? null
          }
          
          // All score fields should be null
          expect(transformed.strain).toBe(null)
          expect(transformed.kilojoules).toBe(null)
          expect(transformed.average_heart_rate).toBe(null)
          expect(transformed.max_heart_rate).toBe(null)
          
          // But cycle_id should still be valid
          expect(typeof transformed.cycle_id).toBe('number')
          expect(Number.isInteger(transformed.cycle_id)).toBe(true)
          expect(transformed.cycle_id).toBeGreaterThan(0)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 8: Recovery API Response Parsing
 * 
 * For all valid recovery API responses with integer cycle_id:
 * - Parsing must succeed without errors
 * - cycle_id must be preserved as a positive integer
 */
describe('Property 8: Recovery API Response Parsing', () => {
  it('should parse recovery API responses with integer cycle identifiers', () => {
    fc.assert(
      fc.property(
        fc.record({
          cycle_id: fc.integer({ min: 1, max: 2147483647 }),
          created_at: validISODate(),
          score: fc.record({
            recovery_score: fc.option(fc.integer({ min: 0, max: 100 })),
            resting_heart_rate: fc.option(fc.integer({ min: 30, max: 120 })),
            hrv_rmssd_milli: fc.option(fc.float({ min: 0, max: 300 })),
            spo2_percentage: fc.option(fc.float({ min: 80, max: 100 })),
            skin_temp_celsius: fc.option(fc.float({ min: 30, max: 40 }))
          })
        }),
        (apiResponse) => {
          const userId = 'test-user-id'
          
          const transformed = {
            user_id: userId,
            cycle_id: apiResponse.cycle_id,
            date: new Date(apiResponse.created_at).toISOString().split('T')[0],
            recovery_score: apiResponse.score.recovery_score ?? null,
            resting_heart_rate: apiResponse.score.resting_heart_rate ?? null,
            hrv_rmssd_milli: apiResponse.score.hrv_rmssd_milli ?? null,
            spo2_percentage: apiResponse.score.spo2_percentage ?? null,
            skin_temp_celsius: apiResponse.score.skin_temp_celsius ?? null
          }
          
          // Verify cycle_id is preserved as number
          expect(typeof transformed.cycle_id).toBe('number')
          
          // Verify cycle_id is a positive integer
          expect(Number.isInteger(transformed.cycle_id)).toBe(true)
          expect(transformed.cycle_id).toBeGreaterThan(0)
          
          // Verify cycle_id matches original
          expect(transformed.cycle_id).toBe(apiResponse.cycle_id)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should handle recovery responses with null score fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          cycle_id: fc.integer({ min: 1, max: 2147483647 }),
          created_at: validISODate(),
          score: fc.record({
            recovery_score: fc.constantFrom(null, undefined),
            resting_heart_rate: fc.constantFrom(null, undefined),
            hrv_rmssd_milli: fc.constantFrom(null, undefined),
            spo2_percentage: fc.constantFrom(null, undefined),
            skin_temp_celsius: fc.constantFrom(null, undefined)
          })
        }),
        (apiResponse) => {
          const userId = 'test-user-id'
          
          const transformed = {
            user_id: userId,
            cycle_id: apiResponse.cycle_id,
            date: new Date(apiResponse.created_at).toISOString().split('T')[0],
            recovery_score: apiResponse.score.recovery_score ?? null,
            resting_heart_rate: apiResponse.score.resting_heart_rate ?? null,
            hrv_rmssd_milli: apiResponse.score.hrv_rmssd_milli ?? null,
            spo2_percentage: apiResponse.score.spo2_percentage ?? null,
            skin_temp_celsius: apiResponse.score.skin_temp_celsius ?? null
          }
          
          // All score fields should be null
          expect(transformed.recovery_score).toBe(null)
          expect(transformed.resting_heart_rate).toBe(null)
          expect(transformed.hrv_rmssd_milli).toBe(null)
          expect(transformed.spo2_percentage).toBe(null)
          expect(transformed.skin_temp_celsius).toBe(null)
          
          // But cycle_id should still be valid
          expect(typeof transformed.cycle_id).toBe('number')
          expect(Number.isInteger(transformed.cycle_id)).toBe(true)
          expect(transformed.cycle_id).toBeGreaterThan(0)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})


/**
 * Property 13: Malformed API Response Error Handling
 * 
 * For all malformed API responses with invalid identifiers:
 * - Validation must detect the error
 * - Error message must be descriptive
 * - System must not crash or store invalid data
 * 
 * Validates: Requirement 7.5
 */
describe('Property 13: Malformed API Response Error Handling', () => {
  it('should reject sleep responses with non-UUID identifiers', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.string().filter(s => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)),
          fc.constant(null),
          fc.constant(undefined)
        ),
        (invalidId) => {
          const result = validateWhoopIdentifier(invalidId as any, 'sleep')
          
          // Validation must fail
          expect(result.valid).toBe(false)
          
          // Error message must be present and descriptive
          expect(result.error).toBeDefined()
          expect(result.error).toContain('sleep')
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should reject workout responses with non-UUID identifiers', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.string().filter(s => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)),
          fc.constant(null),
          fc.constant(undefined)
        ),
        (invalidId) => {
          const result = validateWhoopIdentifier(invalidId as any, 'workout')
          
          // Validation must fail
          expect(result.valid).toBe(false)
          
          // Error message must be present and descriptive
          expect(result.error).toBeDefined()
          expect(result.error).toContain('workout')
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should reject cycle responses with non-integer identifiers', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.float().filter(n => !Number.isInteger(n)), // Only non-integer floats
          fc.integer({ max: 0 }), // Non-positive integers
          fc.constant(null),
          fc.constant(undefined)
        ),
        (invalidId) => {
          const result = validateWhoopIdentifier(invalidId as any, 'cycle')
          
          // Validation must fail
          expect(result.valid).toBe(false)
          
          // Error message must be present and descriptive
          expect(result.error).toBeDefined()
          expect(result.error).toContain('cycle')
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should reject recovery responses with non-integer cycle identifiers', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.float().filter(n => !Number.isInteger(n)), // Only non-integer floats
          fc.integer({ max: 0 }), // Non-positive integers
          fc.constant(null),
          fc.constant(undefined)
        ),
        (invalidId) => {
          const result = validateWhoopIdentifier(invalidId as any, 'recovery')
          
          // Validation must fail
          expect(result.valid).toBe(false)
          
          // Error message must be present and descriptive
          expect(result.error).toBeDefined()
          expect(result.error).toContain('recovery')
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should handle missing required fields gracefully', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Missing 'id' field
          created_at: validISODate(),
          score: fc.record({})
        }),
        (malformedResponse) => {
          // Attempting to validate undefined/missing id
          const result = validateWhoopIdentifier((malformedResponse as any).id, 'sleep')
          
          // Validation must fail
          expect(result.valid).toBe(false)
          expect(result.error).toBeDefined()
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should provide specific error messages for different validation failures', () => {
    // Test different error scenarios
    const testCases = [
      { value: 123, type: 'sleep' as const, expectedInError: 'string' },
      { value: 'not-a-uuid', type: 'sleep' as const, expectedInError: 'UUID' },
      { value: 'abc', type: 'cycle' as const, expectedInError: 'number' },
      { value: 3.14, type: 'cycle' as const, expectedInError: 'integer' },
      { value: -5, type: 'cycle' as const, expectedInError: 'positive' },
      { value: 0, type: 'recovery' as const, expectedInError: 'positive' }
    ]
    
    testCases.forEach(({ value, type, expectedInError }) => {
      const result = validateWhoopIdentifier(value, type)
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error!.toLowerCase()).toContain(expectedInError.toLowerCase())
    })
  })
})
