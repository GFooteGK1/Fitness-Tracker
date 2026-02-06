/**
 * Property-Based Tests: Test Generator Validity
 * 
 * Tests Properties 10-11:
 * - Property 10: UUID Generator Validity
 * - Property 11: Integer Generator Validity
 * 
 * Validates: Requirements 5.1, 5.2
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

/**
 * Property 10: UUID Generator Validity
 * 
 * For all generated UUIDs used in tests:
 * - Must match UUID format (8-4-4-4-12 hex digits)
 * - Must be valid strings
 * - Must be unique across generations
 */
describe('Property 10: UUID Generator Validity', () => {
  it('should generate valid UUID format for sleep_id', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (sleepId) => {
          // Must be a string
          expect(typeof sleepId).toBe('string')
          
          // Must match UUID format
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(sleepId)).toBe(true)
          
          // Must have correct length (36 characters including dashes)
          expect(sleepId.length).toBe(36)
          
          // Must have dashes in correct positions
          expect(sleepId[8]).toBe('-')
          expect(sleepId[13]).toBe('-')
          expect(sleepId[18]).toBe('-')
          expect(sleepId[23]).toBe('-')
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should generate valid UUID format for whoop_workout_id', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (workoutId) => {
          // Must be a string
          expect(typeof workoutId).toBe('string')
          
          // Must match UUID format
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(workoutId)).toBe(true)
          
          // Must contain only valid hex characters and dashes
          const validChars = /^[0-9a-f-]+$/i
          expect(validChars.test(workoutId)).toBe(true)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should generate unique UUIDs across multiple generations', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 100, maxLength: 100 }),
        (uuids) => {
          // All UUIDs should be unique
          const uniqueUuids = new Set(uuids)
          expect(uniqueUuids.size).toBe(uuids.length)
          
          // All should be valid UUIDs
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          uuids.forEach(uuid => {
            expect(uuidRegex.test(uuid)).toBe(true)
          })
          
          return true
        }
      ),
      { numRuns: 10 }
    )
  })
  
  it('should generate UUIDs compatible with database TEXT columns', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (uuid) => {
          // Should not contain special SQL characters
          expect(uuid).not.toContain("'")
          expect(uuid).not.toContain('"')
          expect(uuid).not.toContain(';')
          expect(uuid).not.toContain('\\')
          
          // Should be safe for JSON serialization
          const jsonSafe = JSON.stringify({ id: uuid })
          const parsed = JSON.parse(jsonSafe)
          expect(parsed.id).toBe(uuid)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should generate UUIDs that preserve case-insensitive comparison', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (uuid) => {
          // UUID should be lowercase or case-insensitive comparable
          const lowercase = uuid.toLowerCase()
          const uppercase = uuid.toUpperCase()
          
          // Both should match UUID format
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(lowercase)).toBe(true)
          expect(uuidRegex.test(uppercase)).toBe(true)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 11: Integer Generator Validity
 * 
 * For all generated integers used in tests:
 * - Must be positive integers for cycle_id
 * - Must be within valid range (1 to 2^31-1)
 * - Must be actual integers (not floats)
 */
describe('Property 11: Integer Generator Validity', () => {
  it('should generate valid positive integers for cycle_id', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2147483647 }),
        (cycleId) => {
          // Must be a number
          expect(typeof cycleId).toBe('number')
          
          // Must be an integer
          expect(Number.isInteger(cycleId)).toBe(true)
          
          // Must be positive
          expect(cycleId).toBeGreaterThan(0)
          
          // Must be within PostgreSQL INTEGER range
          expect(cycleId).toBeLessThanOrEqual(2147483647)
          expect(cycleId).toBeGreaterThanOrEqual(1)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should generate valid positive integers for recovery cycle_id', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2147483647 }),
        (cycleId) => {
          // Must be a number
          expect(typeof cycleId).toBe('number')
          
          // Must be an integer (not a float)
          expect(cycleId % 1).toBe(0)
          
          // Must be positive
          expect(cycleId).toBeGreaterThan(0)
          
          // Must not be NaN or Infinity
          expect(Number.isFinite(cycleId)).toBe(true)
          expect(Number.isNaN(cycleId)).toBe(false)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should generate integers that are safe for database operations', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2147483647 }),
        (id) => {
          // Should be safe for SQL (no special characters when converted to string)
          const idString = id.toString()
          expect(idString).toMatch(/^\d+$/)
          
          // Should be safe for JSON serialization
          const jsonSafe = JSON.stringify({ id })
          const parsed = JSON.parse(jsonSafe)
          expect(parsed.id).toBe(id)
          
          // Should maintain value through string conversion
          expect(parseInt(idString, 10)).toBe(id)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should generate integers with uniform distribution', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1000, maxLength: 1000 }),
        (integers) => {
          // Check that we get a reasonable distribution
          const uniqueValues = new Set(integers)
          
          // With 1000 samples from 1-100, we should see most values
          // (statistically, we expect to see most values at least once)
          expect(uniqueValues.size).toBeGreaterThan(50)
          
          // All values should be in range
          integers.forEach(n => {
            expect(n).toBeGreaterThanOrEqual(1)
            expect(n).toBeLessThanOrEqual(100)
          })
          
          return true
        }
      ),
      { numRuns: 5 }
    )
  })
  
  it('should generate integers that preserve mathematical operations', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000000 }),
        fc.integer({ min: 1, max: 1000000 }),
        (id1, id2) => {
          // Addition should work correctly
          const sum = id1 + id2
          expect(Number.isInteger(sum)).toBe(true)
          
          // Comparison should work correctly
          if (id1 < id2) {
            expect(id1).toBeLessThan(id2)
          } else if (id1 > id2) {
            expect(id1).toBeGreaterThan(id2)
          } else {
            expect(id1).toBe(id2)
          }
          
          // Equality should be transitive
          expect(id1 === id1).toBe(true)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should not generate zero or negative integers for identifiers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2147483647 }),
        (id) => {
          // Must never be zero
          expect(id).not.toBe(0)
          
          // Must never be negative
          expect(id).toBeGreaterThan(0)
          
          // Must be at least 1
          expect(id).toBeGreaterThanOrEqual(1)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Cross-validation: UUID vs Integer Generators
 * 
 * Ensures that UUID and integer generators produce distinct types
 * that cannot be confused in the codebase
 */
describe('Cross-validation: UUID vs Integer Generators', () => {
  it('should generate distinct types for sleep (UUID) vs cycle (integer)', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 1, max: 2147483647 }),
        (sleepId, cycleId) => {
          // Types must be different
          expect(typeof sleepId).toBe('string')
          expect(typeof cycleId).toBe('number')
          
          // UUID must match UUID format
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(sleepId)).toBe(true)
          
          // Integer must be a positive integer
          expect(Number.isInteger(cycleId)).toBe(true)
          expect(cycleId).toBeGreaterThan(0)
          
          // They should never be equal (different types)
          expect(sleepId).not.toBe(cycleId)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should maintain type safety across test data generation', () => {
    fc.assert(
      fc.property(
        fc.record({
          sleep_id: fc.uuid(),
          workout_id: fc.uuid(),
          cycle_id: fc.integer({ min: 1, max: 2147483647 }),
          recovery_cycle_id: fc.integer({ min: 1, max: 2147483647 })
        }),
        (record) => {
          // UUID fields must be strings
          expect(typeof record.sleep_id).toBe('string')
          expect(typeof record.workout_id).toBe('string')
          
          // Integer fields must be numbers
          expect(typeof record.cycle_id).toBe('number')
          expect(typeof record.recovery_cycle_id).toBe('number')
          
          // UUID fields must match UUID format
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(record.sleep_id)).toBe(true)
          expect(uuidRegex.test(record.workout_id)).toBe(true)
          
          // Integer fields must be positive integers
          expect(Number.isInteger(record.cycle_id)).toBe(true)
          expect(Number.isInteger(record.recovery_cycle_id)).toBe(true)
          expect(record.cycle_id).toBeGreaterThan(0)
          expect(record.recovery_cycle_id).toBeGreaterThan(0)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
