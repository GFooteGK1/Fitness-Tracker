import { BodyMetrics } from './types'

/** Age eligibility and an explicit goal are the minimum setup contract. */
export function isOnboardingComplete(bodyMetrics: BodyMetrics | undefined, goals: unknown): boolean {
  const age = bodyMetrics?.age
  return typeof age === 'number' && Number.isInteger(age) && age >= 13 && age <= 120 && Array.isArray(goals) && goals.length > 0
}

export function validateBodyMetrics(metrics: BodyMetrics): string | null {
  if (!isOnboardingComplete(metrics, ['goal'])) return 'Age must be a whole number between 13 and 120 years'
  if (metrics.height_cm !== undefined && (typeof metrics.height_cm !== 'number' || !Number.isFinite(metrics.height_cm) || metrics.height_cm < 50 || metrics.height_cm > 300)) return 'Height must be between 50 and 300 cm'
  if (metrics.weight_kg !== undefined && (typeof metrics.weight_kg !== 'number' || !Number.isFinite(metrics.weight_kg) || metrics.weight_kg < 20 || metrics.weight_kg > 500)) return 'Weight must be between 20 and 500 kg'
  if (metrics.gender !== undefined && !['male', 'female', 'other'].includes(metrics.gender)) return 'Gender must be male, female, or other'
  return null
}
