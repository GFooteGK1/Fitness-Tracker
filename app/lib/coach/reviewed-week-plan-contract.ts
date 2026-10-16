/** Shared historical read format. No registry authority, source freshness or writes here. */
import { parseReviewedSession, REVIEWED_SESSION_DAYS, type ReviewedSessionPrescription } from './reviewed-session-contract'
import { validateReviewedProgrammingProfile, type ProgrammingProfile } from './programming-schema'
import { stableStringify, validateRollingTrainingDirection, type RollingTrainingDirection } from './rolling-weekly-contracts'
import type { ReviewedWeekSchedule } from './offline-reviewed-week'

export interface ReviewedRollingWeekPlan {
  kind: 'reviewed_week_plan'
  format: 'reviewed_rolling_week_v0_1'
  schemaVersion: 1
  title: string
  sequenceNumber: number
  windowStart: string
  windowEnd: string
  profileSnapshot: ProgrammingProfile
  directionSnapshot: RollingTrainingDirection
  basis: { recipeId: string; recipeHash: string; contextHash: string; scheduleId: string; reason: string }
  baseSchedule: ReviewedWeekSchedule
  scheduledSessions: Array<{ scheduledDate: string; prescription: ReviewedSessionPrescription }>
  spacing: Array<{ from: string; to: string; baseDays: number; selectedDays: number }>
  instructions: string[]
  limitations: string[]
  /** Review/coverage/completion support is not inferred from recorded themes. */
  adaptiveEvaluation: 'unavailable'
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const texts = (value: unknown) => Array.isArray(value) && value.length <= 100 && value.every(text)
function date(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}

export function parseReviewedRollingWeek(value: unknown): ReviewedRollingWeekPlan | null {
  try {
    if (!record(value) || value.kind !== 'reviewed_week_plan' || value.format !== 'reviewed_rolling_week_v0_1'
      || value.schemaVersion !== 1 || !text(value.title) || !Number.isSafeInteger(value.sequenceNumber) || Number(value.sequenceNumber) < 1
      || !date(value.windowStart) || !date(value.windowEnd) || new Date(`${value.windowStart}T00:00:00Z`).getUTCDay() !== 1
      || Date.parse(value.windowEnd) - Date.parse(value.windowStart) !== 6 * 86400000
      || !record(value.profileSnapshot) || !record(value.directionSnapshot) || !record(value.basis)
      || !['recipeId', 'recipeHash', 'contextHash', 'scheduleId', 'reason'].every(key => text(value.basis && (value.basis as Record<string, unknown>)[key]))
      || !Array.isArray(value.scheduledSessions) || !value.scheduledSessions.length || value.scheduledSessions.length > 7
      || !texts(value.instructions) || !texts(value.limitations) || value.adaptiveEvaluation !== 'unavailable' || !Array.isArray(value.spacing)) return null
    const profile = value.profileSnapshot as unknown as ProgrammingProfile
    const basis = value.basis
    if (![basis.recipeHash, basis.contextHash].every(item => typeof item === 'string' && /^[a-f0-9]{64}$/.test(item))
      || !record(value.baseSchedule) || stableStringify(Object.keys(value.baseSchedule).sort()) !== stableStringify([...REVIEWED_SESSION_DAYS].sort())) return null
    const baseSchedule = value.baseSchedule
    if (!validateReviewedProgrammingProfile(profile).ok || profile.startDate !== value.windowStart
      || validateRollingTrainingDirection(value.directionSnapshot as unknown as RollingTrainingDirection, profile).length) return null
    const ids: string[] = [], days: string[] = []
    const sessions = value.scheduledSessions.map(item => {
      if (!record(item) || !date(item.scheduledDate)) throw new Error('Invalid scheduled session')
      const session = parseReviewedSession(item.prescription)
      if (!session || session.source.recipeId !== basis.recipeId || session.source.recipeHash !== basis.recipeHash) throw new Error('Mismatched session source')
      const dayOffset = REVIEWED_SESSION_DAYS.indexOf(session.day)
      if (Date.parse(item.scheduledDate) - Date.parse(value.windowStart as string) !== dayOffset * 86400000
        || profile.sessionAvailability.find(slot => slot.day === session.day)?.minutes !== session.scheduledMinutes) throw new Error('Mismatched schedule')
      ids.push(session.sessionId); days.push(session.day)
      return { scheduledDate: item.scheduledDate, prescription: session }
    })
    if (new Set(ids).size !== ids.length || new Set(days).size !== days.length
      || value.spacing.length !== ids.length * (ids.length - 1) / 2
      || stableStringify(Object.values(baseSchedule).filter(id => id !== null).sort()) !== stableStringify([...ids].sort())) return null
    const pairs = new Set<string>()
    for (const item of value.spacing) {
      if (!record(item) || typeof item.from !== 'string' || typeof item.to !== 'string' || item.from === item.to
        || !ids.includes(item.from) || !ids.includes(item.to) || !Number.isInteger(item.baseDays) || Math.abs(Number(item.baseDays)) > 6) return null
      const from = sessions.find(session => session.prescription.sessionId === item.from)!
      const to = sessions.find(session => session.prescription.sessionId === item.to)!
      if (item.selectedDays !== (Date.parse(to.scheduledDate) - Date.parse(from.scheduledDate)) / 86400000) return null
      const fromBase = REVIEWED_SESSION_DAYS.findIndex(day => baseSchedule[day] === item.from)
      const toBase = REVIEWED_SESSION_DAYS.findIndex(day => baseSchedule[day] === item.to)
      if (item.baseDays !== toBase - fromBase) return null
      const pair = JSON.stringify([item.from, item.to].sort())
      if (pairs.has(pair)) return null
      pairs.add(pair)
    }
    if (sessions.some(session => stableStringify(session.prescription.source) !== stableStringify(sessions[0].prescription.source))) return null
    return structuredClone(value) as unknown as ReviewedRollingWeekPlan
  } catch { return null }
}
