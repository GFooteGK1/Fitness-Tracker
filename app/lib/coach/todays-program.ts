import type { CoachRuntimeContext } from './types'

/** Read stored prescriptions only. Never generate or substitute a plan here. */
export function projectTodaysProgram(context: CoachRuntimeContext, date: string, includePrescription = false): string {
  if (!context.storageAvailable) return 'Your accepted program is temporarily unavailable. Open Program to retry.'
  const program = context.activeProgram
  if (!program) return 'No accepted program yet. Open Program to review and accept a plan.'
  const sessions = program.upcomingSessions.filter(session => session.scheduledDate === date)
  if (!sessions.length) return 'No session is scheduled today in your accepted program.'
  return sessions.map(session => {
    const p = session.prescription
    const title = typeof p.title === 'string' ? p.title
      : typeof p.session_title === 'string' ? p.session_title : 'Accepted session'
    const intent = typeof p.intent === 'string' ? p.intent : ''
    const details = includePrescription ? `\nStored accepted prescription: ${JSON.stringify(p)}` : ''
    return `${title} — ${session.status}${intent ? `\n${intent}` : ''}${details}`
  }).join('\n\n')
}
