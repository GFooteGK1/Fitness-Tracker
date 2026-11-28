import { readOwnedWorkoutSummary } from '../owned-workout-summary'
import { formatPRValue, isRepMaxType, LEGACY_PR_TYPES, personalRecordLabels, REP_MAX_TYPES, type PRType } from '../pr-detection'
import { formatUTCAsLocalDateInZone, getZonedDateWindow } from '../timezone-utils'
import { CoachingContextError, contextObject } from './coaching-context'
import { assertVerifiedContextPrincipal, type AuthorizeContextRequest, type ContextToolPolicy } from './coaching-context-tool'

export const sociusTrainingProgressTool = {
  name: 'read_socius_training_progress',
  title: 'Read SociusFit training progress',
  description: 'Read the athlete’s workout counts, training mix, and recent improvements for the Training Activity view.',
  inputSchema: {
    type: 'object',
    properties: { timezone: { type: 'string', maxLength: 100 } },
    required: ['timezone'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: { ui: { visibility: ['app'] } },
} as const

export function createSociusTrainingProgressTool(authorize: AuthorizeContextRequest, policy: ContextToolPolicy) {
  return {
    async call(input: unknown) {
      if (!contextObject(input) || typeof input.timezone !== 'string' || Object.keys(input).length !== 1) {
        throw new CoachingContextError(400, 'Supply a named IANA timezone')
      }

      const { timezone } = input
      const asOf = new Date()
      let month: ReturnType<typeof getZonedDateWindow>
      let repMaxMonth: ReturnType<typeof getZonedDateWindow>
      try {
        const date = formatUTCAsLocalDateInZone(asOf.toISOString(), timezone)
        month = getZonedDateWindow(`${date.slice(0, 7)}-01`, date, timezone, 31)
        repMaxMonth = getZonedDateWindow(month.startDate, month.endDate, 'UTC', 31)
      } catch {
        throw new CoachingContextError(400, 'Supply a named IANA timezone')
      }

      const { principal, db } = await authorize()
      assertVerifiedContextPrincipal(principal, policy)
      const identity = await db.auth.getUser()
      const owner = principal.subject
      if (identity.error || identity.data.user?.id !== owner) throw new CoachingContextError(401, 'Authenticated subject mismatch')

      const [workouts, records, legacyCount, repMaxCount] = await Promise.allSettled([
        readOwnedWorkoutSummary(db, owner, { asOf, timezone }),
        db.from('personal_records').select('user_id, exercise, pr_type, value, achieved_at')
          .eq('user_id', owner).gt('previous_value', 0)
          .order('achieved_at', { ascending: false }).order('id', { ascending: false }).limit(5),
        db.from('personal_records').select('id', { count: 'exact', head: true })
          .eq('user_id', owner).in('pr_type', LEGACY_PR_TYPES).gt('previous_value', 0)
          .gte('achieved_at', month.startUtc).lt('achieved_at', month.endUtcExclusive),
        db.from('personal_records').select('id', { count: 'exact', head: true })
          .eq('user_id', owner).in('pr_type', REP_MAX_TYPES).gt('previous_value', 0)
          .gte('achieved_at', repMaxMonth.startUtc).lt('achieved_at', repMaxMonth.endUtcExclusive),
      ])

      const recordRows = records.status === 'fulfilled' && !records.value.error ? records.value.data : null
      const wrongOwner = recordRows?.some(record => record.user_id !== owner)
      const entries = recordRows && !wrongOwner
        ? recordRows.map(record => ({
          exercise: record.exercise,
          type: personalRecordLabels[record.pr_type as PRType],
          value: formatPRValue(record.pr_type, Number(record.value)),
          date: formatUTCAsLocalDateInZone(record.achieved_at, isRepMaxType(record.pr_type) ? 'UTC' : timezone),
        })) : null
      const monthCounts = [legacyCount, repMaxCount].map(result =>
        result.status === 'fulfilled' && !result.value.error ? result.value.count : null)
      const progress = {
        timezone,
        workouts: workouts.status === 'fulfilled' ? workouts.value : null,
        records: {
          entries,
          monthCount: !wrongOwner && monthCounts.every(value => value !== null)
            ? monthCounts.reduce((sum: number, value) => sum + (value ?? 0), 0)
            : null,
        },
      }

      return {
        content: [{ type: 'text' as const, text: 'SociusFit training progress refreshed.' }],
        _meta: { progress },
      }
    },
  }
}
