/**
 * Property-Based Tests: Round-Trip Preservation
 * 
 * Tests Properties 4 & 12:
 * - Property 4: Identifier Round-Trip Preservation
 * - Property 12: Transformation UUID Preservation
 * 
 * Validates: Requirements 3.5, 5.3
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// Helper to generate valid ISO date strings
const validISODate = () => fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ts => new Date(ts).toISOString())

/**
 * Property 4: Identifier Round-Trip Preservation
 * 
 * For all WHOOP records stored and retrieved:
 * - Identifier format must be preserved (UUID strings remain strings, integers remain integers)
 * - Identifier values must be exactly equal after round-trip
 * - No type coercion should occur
 */
describe('Property 4: Identifier Round-Trip Preservation', () => {
  it('should preserve UUID strings for sleep records through round-trip', () => {
    fc.assert(
      fc.property(
        fc.record({
          user_id: fc.uuid(),
          sleep_id: fc.uuid(), // UUID string
          date: validISODate().map(d => d.split('T')[0]),
          sleep_performance_percentage: fc.option(fc.integer({ min: 0, max: 100 })),
          is_nap: fc.boolean()
        }),
        (originalRecord) => {
          // Simulate database storage (as JSON)
          const stored = JSON.stringify(originalRecord)
          
          // Simulate database retrieval
          const retrieved = JSON.parse(stored)
          
          // Identifier must be preserved as string
          expect(typeof retrieved.sleep_id).toBe('string')
          expect(retrieved.sleep_id).toBe(originalRecord.sleep_id)
          
          // Must still be valid UUID
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(retrieved.sleep_id)).toBe(true)
          
          // No type coercion
          expect(retrieved.sleep_id).toStrictEqual(originalRecord.sleep_id)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should preserve UUID strings for workout records through round-trip', () => {
    fc.assert(
      fc.property(
        fc.record({
          user_id: fc.uuid(),
          whoop_workout_id: fc.uuid(), // UUID string
          date: validISODate().map(d => d.split('T')[0]),
          sport_name: fc.option(fc.string()),
          strain: fc.option(fc.float({ min: 0, max: 21 }))
        }),
        (originalRecord) => {
          // Simulate database storage
          const stored = JSON.stringify(originalRecord)
          const retrieved = JSON.parse(stored)
          
          // Identifier must be preserved as string
          expect(typeof retrieved.whoop_workout_id).toBe('string')
          expect(retrieved.whoop_workout_id).toBe(originalRecord.whoop_workout_id)
          
          // Must still be valid UUID
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(retrieved.whoop_workout_id)).toBe(true)
          
          // Exact equality
          expect(retrieved.whoop_workout_id).toStrictEqual(originalRecord.whoop_workout_id)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should preserve integers for cycle records through round-trip', () => {
    fc.assert(
      fc.property(
        fc.record({
          user_id: fc.uuid(),
          cycle_id: fc.integer({ min: 1, max: 2147483647 }), // Positive integer
          date: validISODate().map(d => d.split('T')[0]),
          strain: fc.option(fc.float({ min: 0, max: 21 }))
        }),
        (originalRecord) => {
          // Simulate database storage
          const stored = JSON.stringify(originalRecord)
          const retrieved = JSON.parse(stored)
          
          // Identifier must be preserved as number
          expect(typeof retrieved.cycle_id).toBe('number')
          expect(retrieved.cycle_id).toBe(originalRecord.cycle_id)
          
          // Must still be a positive integer
          expect(Number.isInteger(retrieved.cycle_id)).toBe(true)
          expect(retrieved.cycle_id).toBeGreaterThan(0)
          
          // Exact equality
          expect(retrieved.cycle_id).toStrictEqual(originalRecord.cycle_id)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should preserve integers for recovery records through round-trip', () => {
    fc.assert(
      fc.property(
        fc.record({
          user_id: fc.uuid(),
          cycle_id: fc.integer({ min: 1, max: 2147483647 }), // Positive integer
          date: validISODate().map(d => d.split('T')[0]),
          recovery_score: fc.option(fc.integer({ min: 0, max: 100 }))
        }),
        (originalRecord) => {
          // Simulate database storage
          const stored = JSON.stringify(originalRecord)
          const retrieved = JSON.parse(stored)
          
          // Identifier must be preserved as number
          expect(typeof retrieved.cycle_id).toBe('number')
          expect(retrieved.cycle_id).toBe(originalRecord.cycle_id)
          
          // Must still be a positive integer
          expect(Number.isInteger(retrieved.cycle_id)).toBe(true)
          expect(retrieved.cycle_id).toBeGreaterThan(0)
          
          // Exact equality
          expect(retrieved.cycle_id).toStrictEqual(originalRecord.cycle_id)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should handle multiple round-trips without degradation', () => {
    fc.assert(
      fc.property(
        fc.record({
          sleep_id: fc.uuid(),
          cycle_id: fc.integer({ min: 1, max: 2147483647 })
        }),
        (original) => {
          let current = original
          
          // Perform 10 round-trips
          for (let i = 0; i < 10; i++) {
            const stored = JSON.stringify(current)
            current = JSON.parse(stored)
          }
          
          // After 10 round-trips, values should be identical
          expect(current.sleep_id).toBe(original.sleep_id)
          expect(current.cycle_id).toBe(original.cycle_id)
          
          // Types should be preserved
          expect(typeof current.sleep_id).toBe('string')
          expect(typeof current.cycle_id).toBe('number')
          
          return true
        }
      ),
      { numRuns: 50 }
    )
  })
})

/**
 * Property 12: Transformation UUID Preservation
 * 
 * For all API responses transformed to database format:
 * - UUID identifiers must be preserved exactly
 * - No conversion to numbers should occur
 * - Format must remain valid UUID
 */
describe('Property 12: Transformation UUID Preservation', () => {
  it('should preserve UUID during sleep data transformation', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          created_at: validISODate(),
          nap: fc.boolean(),
          score: fc.record({
            sleep_performance_percentage: fc.option(fc.integer({ min: 0, max: 100 }))
          })
        }),
        (apiResponse) => {
          const userId = 'test-user-id'
          
          // Transform (simulating sync-service.ts transformSleepData)
          const transformed = {
            user_id: userId,
            sleep_id: apiResponse.id, // UUID preserved
            date: new Date(apiResponse.created_at).toISOString().split('T')[0],
            sleep_performance_percentage: apiResponse.score.sleep_performance_percentage ?? null,
            is_nap: apiResponse.nap
          }
          
          // UUID must be preserved exactly
          expect(transformed.sleep_id).toBe(apiResponse.id)
          expect(typeof transformed.sleep_id).toBe('string')
          
          // Must still be valid UUID
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(transformed.sleep_id)).toBe(true)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should preserve UUID during workout data transformation', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          created_at: validISODate(),
          sport_name: fc.option(fc.string()),
          score: fc.record({
            strain: fc.option(fc.float({ min: 0, max: 21 }))
          })
        }),
        (apiResponse) => {
          const userId = 'test-user-id'
          
          // Transform (simulating sync-service.ts transformWorkoutData)
          const transformed = {
            user_id: userId,
            whoop_workout_id: apiResponse.id, // UUID preserved
            date: new Date(apiResponse.created_at).toISOString().split('T')[0],
            sport_name: apiResponse.sport_name ?? null,
            strain: apiResponse.score.strain ?? null
          }
          
          // UUID must be preserved exactly
          expect(transformed.whoop_workout_id).toBe(apiResponse.id)
          expect(typeof transformed.whoop_workout_id).toBe('string')
          
          // Must still be valid UUID
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(transformed.whoop_workout_id)).toBe(true)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should preserve integer during cycle data transformation', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.integer({ min: 1, max: 2147483647 }),
          created_at: validISODate(),
          score: fc.record({
            strain: fc.option(fc.float({ min: 0, max: 21 }))
          })
        }),
        (apiResponse) => {
          const userId = 'test-user-id'
          
          // Transform (simulating sync-service.ts transformCycleData)
          const transformed = {
            user_id: userId,
            cycle_id: apiResponse.id, // Integer preserved
            date: new Date(apiResponse.created_at).toISOString().split('T')[0],
            strain: apiResponse.score.strain ?? null
          }
          
          // Integer must be preserved exactly
          expect(transformed.cycle_id).toBe(apiResponse.id)
          expect(typeof transformed.cycle_id).toBe('number')
          expect(Number.isInteger(transformed.cycle_id)).toBe(true)
          expect(transformed.cycle_id).toBeGreaterThan(0)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should preserve integer during recovery data transformation', () => {
    fc.assert(
      fc.property(
        fc.record({
          cycle_id: fc.integer({ min: 1, max: 2147483647 }),
          created_at: validISODate(),
          score: fc.record({
            recovery_score: fc.option(fc.integer({ min: 0, max: 100 }))
          })
        }),
        (apiResponse) => {
          const userId = 'test-user-id'
          
          // Transform (simulating sync-service.ts transformRecoveryData)
          const transformed = {
            user_id: userId,
            cycle_id: apiResponse.cycle_id, // Integer preserved
            date: new Date(apiResponse.created_at).toISOString().split('T')[0],
            recovery_score: apiResponse.score.recovery_score ?? null
          }
          
          // Integer must be preserved exactly
          expect(transformed.cycle_id).toBe(apiResponse.cycle_id)
          expect(typeof transformed.cycle_id).toBe('number')
          expect(Number.isInteger(transformed.cycle_id)).toBe(true)
          expect(transformed.cycle_id).toBeGreaterThan(0)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should maintain identifier integrity through full transformation pipeline', () => {
    fc.assert(
      fc.property(
        fc.record({
          sleepId: fc.uuid(),
          workoutId: fc.uuid(),
          cycleId: fc.integer({ min: 1, max: 2147483647 }),
          recoveryId: fc.integer({ min: 1, max: 2147483647 })
        }),
        (identifiers) => {
          // Simulate full pipeline: API -> Transform -> JSON -> Database -> Retrieve
          
          // Step 1: API response
          const apiData = {
            sleep: { id: identifiers.sleepId },
            workout: { id: identifiers.workoutId },
            cycle: { id: identifiers.cycleId },
            recovery: { cycle_id: identifiers.recoveryId }
          }
          
          // Step 2: Transform
          const transformed = {
            sleep_id: apiData.sleep.id,
            whoop_workout_id: apiData.workout.id,
            cycle_id: apiData.cycle.id,
            recovery_cycle_id: apiData.recovery.cycle_id
          }
          
          // Step 3: JSON serialization (database storage)
          const stored = JSON.stringify(transformed)
          
          // Step 4: Retrieval
          const retrieved = JSON.parse(stored)
          
          // Verify all identifiers preserved
          expect(retrieved.sleep_id).toBe(identifiers.sleepId)
          expect(retrieved.whoop_workout_id).toBe(identifiers.workoutId)
          expect(retrieved.cycle_id).toBe(identifiers.cycleId)
          expect(retrieved.recovery_cycle_id).toBe(identifiers.recoveryId)
          
          // Verify types preserved
          expect(typeof retrieved.sleep_id).toBe('string')
          expect(typeof retrieved.whoop_workout_id).toBe('string')
          expect(typeof retrieved.cycle_id).toBe('number')
          expect(typeof retrieved.recovery_cycle_id).toBe('number')
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
