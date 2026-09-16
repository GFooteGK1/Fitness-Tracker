/** Server-controlled rollout. Do not read this flag from client components. */
export function exercisePreferencesEnabled(): boolean {
  return process.env.COACH_EXERCISE_PREFERENCES_ENABLED === 'true'
}
