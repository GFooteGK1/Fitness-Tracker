/** Calendar reconciliation does not authorize dose progression or a new phase. */
import { formatUTCAsLocalDateWithOffset, localDateToUTCStart } from '../timezone-utils'
import { doseContentHash } from './initial-dose-policy'
import type { ProgrammingProfile } from './programming-schema'

export interface ReviewedWeekWindow { windowStart: string; windowEnd: string; sequenceNumber: number }
export interface ReviewedWeekTransition {
  schemaVersion: 1
  kind: 'same_week' | 'next_week'
  basePlanVersionId: string
  sourceWindow: ReviewedWeekWindow
  targetWindow: ReviewedWeekWindow
  baseProfileHash: string
  targetProfileHash: string
}

export function reconcileReviewedWeekWindow(input: { basePlanVersionId: string; base: ReviewedWeekWindow;
  profile: ProgrammingProfile; target: { windowStart: string; sequenceNumber: number }; kind: ReviewedWeekTransition['kind'] }) {
  const plusDays = (date: string, days: number) => formatUTCAsLocalDateWithOffset(
    new Date(Date.parse(localDateToUTCStart(date, 0)) + days * 86400000).toISOString(), 0)
  const { base, target } = input
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base.windowStart) || plusDays(base.windowStart, 0) !== base.windowStart
    || new Date(localDateToUTCStart(base.windowStart, 0)).getUTCDay() !== 1
    || !Number.isSafeInteger(base.sequenceNumber) || base.sequenceNumber < 1 || input.profile.startDate !== base.windowStart
    || plusDays(base.windowStart, 6) !== base.windowEnd) throw new Error('Accepted week window/profile is inconsistent')
  const expectedStart = input.kind === 'same_week' ? base.windowStart : plusDays(base.windowEnd, 1)
  const expectedSequence = base.sequenceNumber + (input.kind === 'next_week' ? 1 : 0)
  if (!['same_week', 'next_week'].includes(input.kind) || target.windowStart !== expectedStart
    || target.sequenceNumber !== expectedSequence || !Number.isSafeInteger(expectedSequence)) {
    throw new Error('Reviewed target must be the same week or the explicitly reviewed adjacent week')
  }
  // Retain every other profile field. The trusted recipe must match this exact dated copy.
  const profile = { ...structuredClone(input.profile), startDate: target.windowStart }
  const transition: ReviewedWeekTransition = { schemaVersion: 1, kind: input.kind, basePlanVersionId: input.basePlanVersionId,
    sourceWindow: { windowStart: base.windowStart, windowEnd: base.windowEnd, sequenceNumber: base.sequenceNumber },
    targetWindow: { windowStart: target.windowStart, windowEnd: plusDays(target.windowStart, 6), sequenceNumber: target.sequenceNumber },
    baseProfileHash: doseContentHash(input.profile), targetProfileHash: doseContentHash(profile) }
  return { profile, transition }
}
