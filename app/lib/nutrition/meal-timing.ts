/** Match the meals table's workout-relative timing categories. */
export function normalizeMealTiming(timing: string | undefined): 'pre_workout' | 'post_workout' | 'general' | 'recovery' {
  if (!timing) return 'general'
  switch (timing.toUpperCase()) {
    case 'PRE_WORKOUT': return 'pre_workout'
    case 'POST_WORKOUT': return 'post_workout'
    case 'RECOVERY': return 'recovery'
    default: return 'general'
  }
}
