/** Browser-safe presentation only; the authenticated server verifies the stored receipt. */
export interface ReviewedDoseWeekSummary {
  historical: string
  base: string
  proposed: string
  observedSets: string[]
  preparation: string
  timing: string
  limits: string[]
}
