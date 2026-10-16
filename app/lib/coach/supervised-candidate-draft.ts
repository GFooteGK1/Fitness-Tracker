/** Browser-safe untrusted input contract. Source/approval never come from input. */
import { isValidTimezoneOffset } from '../timezone-utils'
import type { ReviewedWeekRecipe } from './offline-reviewed-week'

export interface SupervisedCandidateDraft {
  candidateId: string; enrollmentId: string; programId: string; basePlanVersionId: string
  historyDays: number; tzOffset: number; transition: 'same_week' | 'next_week'
  windowStart: string; sequenceNumber: number
  recipe: Pick<ReviewedWeekRecipe, 'sessions' | 'baseSchedule' | 'schedules' | 'protocols' | 'instructions' | 'limitations'>
  scheduleId: string; rationale: string
}
export function isSupervisedJson(value: unknown, depth = 0): boolean {
  if (depth > 50) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(v => isSupervisedJson(v, depth + 1))
  return !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
    && Object.values(value).every(v => isSupervisedJson(v, depth + 1))
}
const uuid = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: Record<string, unknown>, fields: string[]) => Object.keys(v).sort().join(',') === [...fields].sort().join(',')
export function parseSupervisedCandidateDraft(value: unknown): SupervisedCandidateDraft | null {
  try {
    if (!isSupervisedJson(value) || !record(value) || !exact(value, ['candidateId', 'enrollmentId', 'programId', 'basePlanVersionId',
      'historyDays', 'tzOffset', 'transition', 'windowStart', 'sequenceNumber', 'recipe', 'scheduleId', 'rationale'])
      || ![value.candidateId, value.enrollmentId, value.programId, value.basePlanVersionId].every(uuid)
      || !Number.isSafeInteger(value.historyDays) || Number(value.historyDays) < 1 || Number(value.historyDays) > 180
      || typeof value.tzOffset !== 'number' || !isValidTimezoneOffset(value.tzOffset)
      || !['same_week', 'next_week'].includes(String(value.transition)) || typeof value.windowStart !== 'string'
      || !Number.isSafeInteger(value.sequenceNumber) || Number(value.sequenceNumber) < 1
      || !record(value.recipe) || !exact(value.recipe, ['sessions', 'baseSchedule', 'schedules', 'protocols', 'instructions', 'limitations'])
      || typeof value.scheduleId !== 'string' || !value.scheduleId.trim() || value.scheduleId.length > 200
      || typeof value.rationale !== 'string' || !value.rationale.trim() || value.rationale.length > 4000
      || JSON.stringify(value).length > 500000) return null
    return structuredClone(value) as unknown as SupervisedCandidateDraft
  } catch { return null }
}
