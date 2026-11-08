import type { AdherenceStatus, DailyAdherenceResult, MacroTotals } from '../types/food-tracking'

export type DailyComparison = DailyAdherenceResult |
  { adherenceAvailability: 'unverified'; adherence: null }

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function isDailyTotals(value: unknown): value is MacroTotals {
  return record(value) && ['protein', 'carbs', 'fat', 'calories'].every(key =>
    typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0)
}

/** Old servers and inconsistent variants cannot authorize a comparison. */
export function readDailyComparison(value: unknown): DailyComparison {
  if (record(value)) {
    const availability = value.adherenceAvailability
    if ((availability === 'not_configured' || availability === 'unavailable') && value.adherence === null) {
      return { adherenceAvailability: availability, adherence: null }
    }
    if (availability === 'available' && record(value.adherence)) {
      const adherence = value.adherence
      if (typeof adherence.withinTolerance === 'boolean' &&
        ['proteinAdherence', 'carbsAdherence', 'fatAdherence', 'caloriesAdherence', 'overallScore'].every(key =>
          typeof adherence[key] === 'number' && Number.isFinite(adherence[key]) && adherence[key] >= 0 && adherence[key] <= 100)) {
        return { adherenceAvailability: availability, adherence: adherence as unknown as AdherenceStatus }
      }
    }
  }
  return { adherenceAvailability: 'unverified', adherence: null }
}
