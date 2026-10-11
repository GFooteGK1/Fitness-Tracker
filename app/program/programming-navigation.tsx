import type { WeeklyCoachState } from './weekly-program-view'

export function ProgrammingNavigation({ state }: { state: WeeklyCoachState | null }) {
  const reviewed = state?.currentWeek?.intent.format === 'reviewed_weekly_intent_v0_1'
  const destination = reviewed && state.program
    ? `/program/reviewed/plans/${encodeURIComponent(state.program.id)}`
    : '/program/first-reviewed'
  return <nav aria-label="Programming" className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
    <a href={destination} className="app-primary inline-flex min-h-11 items-center px-4 py-3">Review your next week</a>
    <p className="app-muted">Check your current setup and training history, then review a complete week before accepting it. Your accepted sessions stay in your plan.</p>
    <a href="/program/supervised" className="inline-flex min-h-11 items-center underline">Coach workspace</a>
  </nav>
}
