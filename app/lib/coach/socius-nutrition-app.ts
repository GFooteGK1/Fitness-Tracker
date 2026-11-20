import type { MacroTotals } from '../types/food-tracking'
import { formatUTCAsLocalDateInZone, getZonedDateWindow } from '../timezone-utils'
import { readOwnedCurrentTargets, readOwnedMealTotals } from '../owned-nutrition-read'
import { CoachingContextError, contextObject } from './coaching-context'
import { assertVerifiedContextPrincipal, type AuthorizeContextRequest, type ContextToolPolicy } from './coaching-context-tool'

export const sociusNutritionTool = {
  name: 'read_socius_nutrition',
  title: 'Read today’s SociusFit nutrition',
  description: 'Read the athlete’s current macro targets and totals from their saved meals for today in their local time zone.',
  inputSchema: {
    type: 'object',
    properties: { timezone: { type: 'string', maxLength: 100 } },
    required: ['timezone'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: { ui: { visibility: ['app'] } },
} as const

type NutritionView = {
  date: string
  timezone: string
  readAt: string
  mealStatus: 'no_records' | 'available' | 'partial' | 'unavailable'
  mealCount: number | null
  totals: MacroTotals | null
  targetStatus: 'available' | 'not_configured' | 'unavailable'
  targets: MacroTotals | null
}

export function createSociusNutritionTool(authorize: AuthorizeContextRequest, policy: ContextToolPolicy) {
  return {
    async call(input: unknown) {
      if (!contextObject(input) || typeof input.timezone !== 'string' || Object.keys(input).length !== 1) {
        throw new CoachingContextError(400, 'Supply a named IANA timezone')
      }
      const { timezone } = input
      const readAt = new Date().toISOString()
      let window: ReturnType<typeof getZonedDateWindow>
      try {
        const date = formatUTCAsLocalDateInZone(readAt, timezone)
        window = getZonedDateWindow(date, date, timezone, 1)
      } catch {
        throw new CoachingContextError(400, 'Supply a named IANA timezone')
      }

      const { principal, db } = await authorize()
      assertVerifiedContextPrincipal(principal, policy)
      const identity = await db.auth.getUser()
      if (identity.error || identity.data.user?.id !== principal.subject) throw new CoachingContextError(401, 'Authenticated subject mismatch')
      const [meals, targets] = await Promise.all([
        readOwnedMealTotals(db, principal.subject, window),
        readOwnedCurrentTargets(db, principal.subject),
      ])
      const current = targets.status === 'available' ? targets.targets : null
      const nutrition: NutritionView = {
        date: window.startDate,
        timezone: window.timezone,
        readAt,
        mealStatus: meals.status,
        mealCount: meals.count,
        totals: meals.totals,
        targetStatus: targets.status,
        targets: current ? {
          protein: current.targetProtein, carbs: current.targetCarbs, fat: current.targetFat, calories: current.targetCalories,
        } : null,
      }
      return {
        content: [{ type: 'text' as const, text: 'SociusFit nutrition refreshed.' }],
        _meta: { nutrition },
      }
    },
  }
}
