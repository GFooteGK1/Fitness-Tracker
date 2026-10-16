/** Server-only switch. No environment value changes the global numerical policy. */
export const isSupervisedProgrammingEnabled = () => process.env.COACH_SUPERVISED_PROGRAMMING_ENABLED === 'true'
