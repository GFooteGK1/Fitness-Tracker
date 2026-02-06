/**
 * Property-Based Tests for WHOOP Validation Utilities
 * 
 * Tests universal properties of identifier validation across all possible inputs
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  isValidUUID,
  validateWhoopIdentifier,
  validateWhoopIdentifiers,
  assertValidWhoopIdentifier
} from '../../app/lib/whoop/validation'

describe('WHOOP Validation - Property Tests', () => {
  describe('Property 1: UUID Validation for Sleep Records - Feature: whoop-v2-schema-fix', () => {
    it('should accept all valid UUID strings for sleep identifiers', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (uuid) => {
            const result = validateWhoopIdentifier(uuid, 'sleep')
            expect(result.valid).toBe(true)
            expect(result.error).toBeUndefined()
            return result.valid === true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should reject non-string values for sleep identifiers', () => {
      fc.assert(
        fc.property(
          fc.integer(),
          (num) => {
            const result = validateWhoopIdentifier(num as any, 'sleep')
            expect(result.valid).toBe(false)
            expect(result.error).toContain('must be a string')
            return result.valid === false
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should reject invalid UUID formats for sleep identifiers', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !isValidUUID(s)),
          (invalidUuid) => {
            const result = validateWhoopIdentifier(invalidUuid, 'sleep')
            expect(result.valid).toBe(false)
            expect(result.error).toContain('valid UUID format')
            return result.valid === false
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 2: UUID Validation for Workout Records - Feature: whoop-v2-schema-fix', () => {
    it('should accept all valid UUID strings for workout identifiers', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (uuid) => {
            const result = validateWhoopIdentifier(uuid, 'workout')
            expect(result.valid).toBe(true)
            expect(result.error).toBeUndefined()
            return result.valid === true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should reject non-string values for workout identifiers', () => {
      fc.assert(
        fc.property(
          fc.integer(),
          (num) => {
            const result = validateWhoopIdentifier(num as any, 'workout')
            expect(result.valid).toBe(false)
            expect(result.error).toContain('must be a string')
            return result.valid === false
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should reject invalid UUID formats for workout identifiers', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !isValidUUID(s)),
          (invalidUuid) => {
            const result = validateWhoopIdentifier(invalidUuid, 'workout')
            expect(result.valid).toBe(false)
            expect(result.error).toContain('valid UUID format')
            return result.valid === false
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 3: Integer Validation for Cycle Records - Feature: whoop-v2-schema-fix', () => {
    it('should accept all positive integers for cycle identifiers', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
          (cycleId) => {
            const result = validateWhoopIdentifier(cycleId, 'cycle')
            expect(result.valid).toBe(true)
            expect(result.error).toBeUndefined()
            return result.valid === true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should accept all positive integers for recovery identifiers', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
          (cycleId) => {
            const result = validateWhoopIdentifier(cycleId, 'recovery')
            expect(result.valid).toBe(true)
            expect(result.error).toBeUndefined()
            return result.valid === true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should reject non-integer values for cycle identifiers', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.1, max: 1000.9, noNaN: true }),
          (nonInteger) => {
            const result = validateWhoopIdentifier(nonInteger, 'cycle')
            expect(result.valid).toBe(false)
            expect(result.error).toContain('must be an integer')
            return result.valid === false
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should reject zero and negative integers for cycle identifiers', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: Number.MIN_SAFE_INTEGER, max: 0 }),
          (nonPositive) => {
            const result = validateWhoopIdentifier(nonPositive, 'cycle')
            expect(result.valid).toBe(false)
            expect(result.error).toContain('must be a positive integer')
            return result.valid === false
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should reject string values for cycle identifiers', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (str) => {
            const result = validateWhoopIdentifier(str as any, 'cycle')
            expect(result.valid).toBe(false)
            expect(result.error).toContain('must be a number')
            return result.valid === false
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('UUID Format Validation', () => {
    it('should accept all valid UUID formats', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (uuid) => {
            expect(isValidUUID(uuid)).toBe(true)
            return isValidUUID(uuid) === true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should reject strings that are not UUID format', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 10 }),
            fc.string({ minLength: 50, maxLength: 100 }),
            fc.string({ minLength: 32, maxLength: 32 }).filter(s => !s.includes('-')) // no dashes
          ),
          (nonUuid) => {
            expect(isValidUUID(nonUuid)).toBe(false)
            return isValidUUID(nonUuid) === false
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Batch Validation', () => {
    it('should validate multiple identifiers correctly', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              value: fc.oneof(
                fc.uuid(),
                fc.integer({ min: 1, max: 1000000 })
              ),
              type: fc.constantFrom('sleep', 'workout', 'cycle', 'recovery')
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (identifiers) => {
            const results = validateWhoopIdentifiers(identifiers as any)
            expect(results).toHaveLength(identifiers.length)
            
            // Each result should have valid property
            results.forEach(result => {
              expect(result).toHaveProperty('valid')
              expect(typeof result.valid).toBe('boolean')
            })
            
            return results.length === identifiers.length
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  describe('Assert Function', () => {
    it('should not throw for valid identifiers', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (uuid) => {
            expect(() => assertValidWhoopIdentifier(uuid, 'sleep')).not.toThrow()
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should throw for invalid identifiers', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !isValidUUID(s)),
          (invalidUuid) => {
            expect(() => assertValidWhoopIdentifier(invalidUuid, 'sleep')).toThrow()
            return true
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
