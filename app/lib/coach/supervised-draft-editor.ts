/** Browser-safe, untrusted editing model. This never grants review authority. */
import { formatUTCAsLocalDateWithOffset, localDateToUTCStart } from '../timezone-utils'
import type { ReviewedWeekRecipe, ReviewedWeekSchedule } from './offline-reviewed-week'
import { REVIEWED_SESSION_DAYS as REVIEWED_WEEK_DAYS } from './reviewed-session-contract'
import { reviewedSessionActivities } from './reviewed-session-contract'
import { parseReviewedRollingWeek } from './reviewed-week-plan-contract'
import { stableStringify } from './rolling-weekly-contracts'

export type SupervisedEditableRecipe = Pick<ReviewedWeekRecipe,
  'sessions' | 'baseSchedule' | 'schedules' | 'protocols' | 'instructions' | 'limitations'>
export interface SupervisedWeekSeed {
  transition: 'same_week' | 'next_week'
  windowStart: string
  sequenceNumber: number
  scheduleId: string
  recipe: SupervisedEditableRecipe
}

/** Reconstruct only editable work, not the old review/source tokens. A compiled
 * week has no complete archive of alternative schedules, so seed its actual one.
 * Current owned source, eligibility and continuity are checked on submission.
 */
export function seedSupervisedWeek(value: unknown, transition: SupervisedWeekSeed['transition']): SupervisedWeekSeed | null {
  const week = parseReviewedRollingWeek(value)
  if (!week || !['same_week', 'next_week'].includes(transition)) return null
  const schedule = Object.fromEntries(REVIEWED_WEEK_DAYS.map(day => [day, null])) as ReviewedWeekSchedule
  const protocols = new Map<string, ReviewedWeekRecipe['protocols'][number]>()
  for (const slot of week.scheduledSessions) {
    if (schedule[slot.prescription.day] !== null) return null
    schedule[slot.prescription.day] = slot.prescription.sessionId
    for (const protocol of slot.prescription.protocols) {
      const existing = protocols.get(protocol.id)
      if (existing && stableStringify(existing) !== stableStringify(protocol)) return null
      protocols.set(protocol.id, structuredClone(protocol))
    }
  }
  const scheduleId = 'proposed-week'
  return {
    transition,
    windowStart: transition === 'same_week' ? week.windowStart
      : formatUTCAsLocalDateWithOffset(new Date(Date.parse(localDateToUTCStart(week.windowEnd, 0)) + 86400000).toISOString(), 0),
    sequenceNumber: week.sequenceNumber + (transition === 'next_week' ? 1 : 0),
    scheduleId,
    recipe: { sessions: week.scheduledSessions.map(slot => structuredClone(slot.prescription.content)),
      baseSchedule: structuredClone(schedule), schedules: [{ id: scheduleId, days: structuredClone(schedule),
        reason: 'Proposed schedule starts from the accepted week. Coach review is required.' }],
      protocols: [...protocols.values()], instructions: [...week.instructions], limitations: [...week.limitations] },
  }
}

/** Move a complete session; an occupied destination swaps the two sessions.
 * Both actual day assignments are explicit in the editor before submission.
 */
export function moveSupervisedSession(seed: SupervisedWeekSeed, sessionId: string, day: keyof ReviewedWeekSchedule): SupervisedWeekSeed {
  const next = structuredClone(seed), schedule = next.recipe.schedules.find(s => s.id === next.scheduleId)
  const previous = schedule && REVIEWED_WEEK_DAYS.find(d => schedule.days[d] === sessionId)
  if (!schedule || !previous || !REVIEWED_WEEK_DAYS.includes(day)) throw new Error('Session schedule could not be verified.')
  const other = schedule.days[day]
  schedule.days[day] = sessionId
  schedule.days[previous] = other
  return next
}

/** Explicit copy operations clone proposed work and its monitoring protocol with
 * new content identities. They never carry review tokens or prescribe a new dose.
 */
export function copySupervisedSession(seed: SupervisedWeekSeed, sourceId: string, day: keyof ReviewedWeekSchedule, newId: () => string): SupervisedWeekSeed {
  const next = structuredClone(seed), source = next.recipe.sessions.find(s => s.id === sourceId)
  const schedule = next.recipe.schedules.find(s => s.id === next.scheduleId)
  if (!source || !schedule || schedule.days[day] !== null) throw new Error('Choose an empty training day for the copied session.')
  const copy = structuredClone(source), mapping = new Map<string, string>(), identity = (old: string) => {
    if (!mapping.has(old)) mapping.set(old, newId())
    return mapping.get(old)!
  }
  copy.id = identity(source.id)
  for (const s of copy.steps) {
    s.id = identity(s.id)
    for (const a of s.kind === 'activity' ? [s] : s.kind === 'preparation_window' ? s.activities : []) {
      a.id = s.kind === 'activity' ? s.id : identity(a.id)
      if (a.protocolId) a.protocolId = identity(a.protocolId)
    }
  }
  if (copy.optionalTail) copy.optionalTail.fromStepId = identity(copy.optionalTail.fromStepId)
  next.recipe.protocols.push(...next.recipe.protocols.filter(p => p.sessionId === sourceId).map(p => ({ ...structuredClone(p),
    id: identity(p.id), sessionId: copy.id, activityId: identity(p.activityId) })))
  // Baseline days describe the prior placement for existing sessions. A move can
  // free a proposed day that is still occupied in that baseline.
  const baselineDay = next.recipe.baseSchedule[day] === null ? day
    : REVIEWED_WEEK_DAYS.find(d => next.recipe.baseSchedule[d] === null)
  if (!baselineDay) throw new Error('No baseline day is available for the copied session.')
  next.recipe.sessions.push(copy); schedule.days[day] = copy.id; next.recipe.baseSchedule[baselineDay] = copy.id
  return next
}

export function removeSupervisedSession(seed: SupervisedWeekSeed, sessionId: string): SupervisedWeekSeed {
  const next = structuredClone(seed)
  if (next.recipe.sessions.length <= 1 || !next.recipe.sessions.some(s => s.id === sessionId)) throw new Error('Keep at least one complete session.')
  next.recipe.sessions = next.recipe.sessions.filter(s => s.id !== sessionId)
  next.recipe.protocols = next.recipe.protocols.filter(p => p.sessionId !== sessionId)
  for (const schedule of [next.recipe.baseSchedule, ...next.recipe.schedules.map(s => s.days)]) {
    for (const day of REVIEWED_WEEK_DAYS) if (schedule[day] === sessionId) schedule[day] = null
  }
  return next
}

export function editSupervisedStep(seed: SupervisedWeekSeed, sessionId: string, stepId: string, operation: 'copy' | 'remove' | 'earlier' | 'later', newId: () => string): SupervisedWeekSeed {
  const next = structuredClone(seed), session = next.recipe.sessions.find(s => s.id === sessionId)
  const index = session?.steps.findIndex(s => s.id === stepId) ?? -1
  if (!session || index < 0) throw new Error('Select an existing step.')
  const selected = session.steps[index]
  if (operation === 'remove') {
    if (session.optionalTail?.fromStepId === stepId) throw new Error('Change the optional-work boundary before removing this step.')
    if (session.steps.length <= 1) throw new Error('Keep a complete session.')
    const remaining = { ...session, steps: session.steps.filter(s => s.id !== stepId) }
    if (!remaining.steps.some(s => s.kind === 'allowance' && s.purpose === 'logging' && s.seconds > 0)) throw new Error('Keep the final logging allowance.')
    if (!reviewedSessionActivities(remaining).some(a => a.role === 'working')) throw new Error('Keep at least one working activity.')
    const activities = selected.kind === 'activity' ? [selected] : selected.kind === 'preparation_window' ? selected.activities : []
    const removed = new Set(activities.map(a => a.id))
    next.recipe.protocols = next.recipe.protocols.filter(p => p.sessionId !== sessionId || !removed.has(p.activityId))
    session.steps.splice(index, 1)
  } else if (operation === 'copy') {
    const copy = structuredClone(selected), mapping = new Map<string, string>(), identity = (old: string) => {
      if (!mapping.has(old)) mapping.set(old, newId())
      return mapping.get(old)!
    }
    copy.id = identity(copy.id)
    const activities = copy.kind === 'activity' ? [copy] : copy.kind === 'preparation_window' ? copy.activities : []
    for (const a of activities) {
      const original = copy.kind === 'activity' ? selected.id : a.id
      a.id = identity(original)
      if (a.protocolId) {
        const protocol = next.recipe.protocols.find(p => p.id === a.protocolId && p.sessionId === sessionId && p.activityId === original)
        if (!protocol) throw new Error('The monitoring protocol could not be copied.')
        const id = identity(a.protocolId); next.recipe.protocols.push({ ...structuredClone(protocol), id, activityId: a.id }); a.protocolId = id
      }
    }
    session.steps.splice(index + 1, 0, copy)
  } else {
    const target = index + (operation === 'earlier' ? -1 : 1)
    if (target < 0 || target >= session.steps.length) return next
    ;[session.steps[index], session.steps[target]] = [session.steps[target], session.steps[index]]
  }
  return next
}
