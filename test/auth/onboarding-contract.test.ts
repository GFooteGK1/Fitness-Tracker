import { describe, expect, it } from 'vitest'
import { isOnboardingComplete, validateBodyMetrics } from '@/app/lib/auth/onboarding'

describe('minimal onboarding contract', () => {
  it('accepts an eligible age and goal without inventing measurements', () => {
    expect(isOnboardingComplete({ age: 30 }, ['performance'])).toBe(true)
    expect(validateBodyMetrics({ age: 30 })).toBeNull()
  })
  it.each([undefined, 0, 12, 121, 30.5, NaN])('rejects invalid or missing age %s', age => {
    expect(isOnboardingComplete({ age }, ['performance'])).toBe(false)
    expect(validateBodyMetrics({ age })).toBeTruthy()
  })
  it('requires a goal and validates optional measurements when supplied', () => {
    expect(isOnboardingComplete({ age: 30 }, [])).toBe(false)
    expect(validateBodyMetrics({ age: 30, height_cm: 1 })).toContain('Height')
    expect(validateBodyMetrics({ age: 30, weight_kg: Infinity })).toContain('Weight')
    expect(validateBodyMetrics({ age: 30, height_cm: 180, weight_kg: 80 })).toBeNull()
  })
})
