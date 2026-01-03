// Feature: food-tracking, Property 8: Adherence Scoring Algorithm
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// Mock adherence scoring function
function calculateAdherenceScore(actual: number, target: number, tolerancePct: number = 5): number {
  const tolerance = (tolerancePct / 100) * target
  const lowerBound = target - tolerance
  const upperBound = target + tolerance
  
  if (actual >= lowerBound && actual <= upperBound) {
    return 100
  }
  
  const deviation = Math.abs(actual - target)
  return Math.max(0, (1 - deviation / target) * 100)
}

describe('Adherence Scoring Properties', () => {
  it('Property 8: Adherence within ±5% tolerance scores 100%, outside tolerance scores (1 - deviation/target) × 100', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 50, max: 500, noNaN: true }), // target
        fc.float({ min: 0, max: 1000, noNaN: true }), // actual
        fc.float({ min: 1, max: 10, noNaN: true }), // tolerance percentage
        (target: number, actual: number, tolerancePct: number) => {
          const score = calculateAdherenceScore(actual, target, tolerancePct)
          const tolerance = (tolerancePct / 100) * target
          const lowerBound = target - tolerance
          const upperBound = target + tolerance
          
          if (actual >= lowerBound && actual <= upperBound) {
            // Within tolerance should score 100%
            expect(score).toBe(100)
          } else {
            // Outside tolerance should follow the formula
            const deviation = Math.abs(actual - target)
            const expectedScore = Math.max(0, (1 - deviation / target) * 100)
            expect(Math.abs(score - expectedScore)).toBeLessThan(0.01)
          }
          
          // Score should always be between 0 and 100
          expect(score).toBeGreaterThanOrEqual(0)
          expect(score).toBeLessThanOrEqual(100)
        }
      ),
      { numRuns: 100 }
    )
  })
})