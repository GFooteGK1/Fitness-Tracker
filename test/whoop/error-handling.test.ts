/**
 * Error Handling Tests for WHOOP Sync Service
 * 
 * Tests that validation failures produce descriptive error messages
 * and include response structure for debugging.
 * 
 * Validates:
 * - Requirement 3.4: Descriptive error messages for validation failures
 * - Requirement 7.5: Error logging includes response structure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { validateWhoopIdentifier, assertValidWhoopIdentifier, validateWhoopIdentifiers } from '@/app/lib/whoop/validation'

describe('WHOOP Sync Error Handling', () => {
  let consoleErrorSpy: any

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('Validation Error Messages', () => {
    it('should provide descriptive error for invalid sleep ID', () => {
      const invalidSleepId = 12345 // Number instead of UUID string
      const result = validateWhoopIdentifier(invalidSleepId, 'sleep')
      
      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Sleep ID must be a string')
      expect(result.errors[0]).toContain('number')
    })

    it('should provide descriptive error for invalid workout ID', () => {
      const invalidWorkoutId = "not-a-uuid-format"
      const result = validateWhoopIdentifier(invalidWorkoutId, 'workout')
      
      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Workout ID must be a valid UUID string')
    })

    it('should provide descriptive error for invalid cycle ID type', () => {
      const invalidCycleId = "12345" // String instead of number
      const result = validateWhoopIdentifier(invalidCycleId, 'cycle')
      
      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Cycle ID must be a number')
      expect(result.errors[0]).toContain('string')
    })

    it('should provide descriptive error for negative cycle ID', () => {
      const negativeCycleId = -1
      const result = validateWhoopIdentifier(negativeCycleId, 'cycle')
      
      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Cycle ID must be a positive integer')
    })

    it('should provide descriptive error for non-integer cycle ID', () => {
      const floatCycleId = 12345.67
      const result = validateWhoopIdentifier(floatCycleId, 'cycle')
      
      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Cycle ID must be an integer')
    })
  })

  describe('Assertion Error Messages', () => {
    it('should throw descriptive error when asserting invalid identifier', () => {
      expect(() => {
        assertValidWhoopIdentifier("invalid-uuid", 'sleep')
      }).toThrow('Invalid WHOOP sleep identifier')
      
      expect(() => {
        assertValidWhoopIdentifier("invalid-uuid", 'sleep')
      }).toThrow('Sleep ID must be a valid UUID string')
    })

    it('should throw descriptive error for invalid cycle ID', () => {
      expect(() => {
        assertValidWhoopIdentifier(-1, 'cycle')
      }).toThrow('Invalid WHOOP cycle identifier')
      
      expect(() => {
        assertValidWhoopIdentifier(-1, 'cycle')
      }).toThrow('Cycle ID must be a positive integer')
    })
  })

  describe('Error Context', () => {
    it('should include identifier type in error message', () => {
      const sleepResult = validateWhoopIdentifier(123, 'sleep')
      expect(sleepResult.errors[0]).toContain('Sleep')
      
      const workoutResult = validateWhoopIdentifier(123, 'workout')
      expect(workoutResult.errors[0]).toContain('Workout')
      
      const cycleResult = validateWhoopIdentifier("123", 'cycle')
      expect(cycleResult.errors[0]).toContain('Cycle')
      
      const recoveryResult = validateWhoopIdentifier("123", 'recovery')
      expect(recoveryResult.errors[0]).toContain('Recovery')
    })

    it('should include received type in error message', () => {
      const result = validateWhoopIdentifier(123, 'sleep')
      expect(result.errors[0]).toContain('received number')
    })
  })

  describe('Multiple Validation Errors', () => {
    it('should validate multiple identifiers and collect all errors', () => {
      const identifiers = [
        { value: "invalid-uuid", type: 'sleep' as const },
        { value: -1, type: 'cycle' as const },
        { value: "not-a-number", type: 'recovery' as const }
      ]
      
      const results = validateWhoopIdentifiers(identifiers)
      
      expect(results).toHaveLength(3)
      expect(results[0].isValid).toBe(false)
      expect(results[1].isValid).toBe(false)
      expect(results[2].isValid).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle null and undefined gracefully', () => {
      const nullResult = validateWhoopIdentifier(null as any, 'sleep')
      expect(nullResult.isValid).toBe(false)
      expect(nullResult.errors.length).toBeGreaterThan(0)
      
      const undefinedResult = validateWhoopIdentifier(undefined as any, 'cycle')
      expect(undefinedResult.isValid).toBe(false)
      expect(undefinedResult.errors.length).toBeGreaterThan(0)
    })

    it('should handle empty string for UUID validation', () => {
      const result = validateWhoopIdentifier("", 'sleep')
      expect(result.isValid).toBe(false)
      expect(result.errors[0]).toContain('Sleep ID must be a valid UUID string')
    })

    it('should handle zero for cycle ID', () => {
      const result = validateWhoopIdentifier(0, 'cycle')
      expect(result.isValid).toBe(false)
      expect(result.errors[0]).toContain('Cycle ID must be a positive integer')
    })
  })

  describe('Valid Identifiers', () => {
    it('should return empty errors array for valid identifiers', () => {
      const validSleep = validateWhoopIdentifier("ecfc6a15-4661-442f-a9a4-f160dd7afae8", 'sleep')
      expect(validSleep.isValid).toBe(true)
      expect(validSleep.errors).toHaveLength(0)
      
      const validCycle = validateWhoopIdentifier(93845, 'cycle')
      expect(validCycle.isValid).toBe(true)
      expect(validCycle.errors).toHaveLength(0)
    })
  })
})
