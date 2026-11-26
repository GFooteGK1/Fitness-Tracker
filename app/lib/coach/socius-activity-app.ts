import type { createActivityHistoryTool } from './activity-history-tool'
import { sociusActivityHtml } from './activity-app-ui'
import { CoachingContextError, contextObject } from './coaching-context'
import type { EvidenceQuantity } from './performed-dose-evidence'

export const legacySociusActivityResourceUri = 'ui://socius/activity.html'
export const sociusActivityResource = {
  uri: 'ui://socius/activity-v2.html',
  name: 'SociusFit Activity',
  mimeType: 'text/html;profile=mcp-app',
} as const

export const sociusActivityTool = {
  name: 'show_socius_activity',
  title: 'Show SociusFit activity',
  description: 'Show saved workouts and logged meals for one local date in an Activity card. Use when the athlete wants to see one day of activity. Use get_activity_history for detailed analysis or multiple days. Logged meals are only the meals the athlete recorded.',
  inputSchema: {
    type: 'object',
    required: ['date', 'timezone'],
    properties: {
      date: { type: 'string', format: 'date' },
      timezone: { type: 'string', maxLength: 100, description: 'The athlete’s named IANA time zone. Ask if unknown.' },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: { ui: { resourceUri: sociusActivityResource.uri, visibility: ['app', 'model'] } },
} as const

export const sociusActivityResourceContents = {
  ...sociusActivityResource,
  text: sociusActivityHtml,
  _meta: {
    ui: { csp: { connectDomains: [], resourceDomains: [] } },
    'openai/ui': { availableDisplayModes: ['inline'] },
  },
}

type ActivityHistoryTool = ReturnType<typeof createActivityHistoryTool>

function quantityText(quantity: EvidenceQuantity, label: string) {
  if (quantity.kind === 'unknown') return []
  return [`${quantity.kind === 'exact' ? quantity.value : `${quantity.min}–${quantity.max}`} ${label}`]
}

function setLines(value: unknown) {
  if (!Array.isArray(value)) return []
  const lines = value.slice(0, 6).flatMap((set, index) => {
    if (!contextObject(set)) return []
    const reps = Number.isSafeInteger(set.reps) && Number(set.reps) >= 0 ? `${set.reps} reps` : null
    const load = contextObject(set.load) && typeof set.load.value === 'number' && Number.isFinite(set.load.value)
      && set.load.value >= 0 && (set.load.unit === 'lb' || set.load.unit === 'kg') ? `${set.load.value} ${set.load.unit}` : null
    const dose = [reps, load].filter(Boolean).join(' at ')
    return dose ? [`Set ${index + 1} · ${dose}`] : []
  })
  if (value.length > 6) lines.push(`+${value.length - 6} more saved set entries`)
  return lines
}

function statusFor(domain: { status: string; retrievalComplete: boolean }) {
  if (domain.status === 'unavailable') return 'unavailable'
  if (domain.status === 'partial' || !domain.retrievalComplete) return 'partial'
  return domain.status === 'no_records' ? 'no_records' : 'available'
}

export function createSociusActivityTool(historyTool: ActivityHistoryTool) {
  return {
    async call(input: unknown) {
      if (!contextObject(input) || Object.keys(input).some(key => key !== 'date' && key !== 'timezone')
        || typeof input.date !== 'string' || typeof input.timezone !== 'string') {
        throw new CoachingContextError(400, 'Supply a local date and a named IANA timezone')
      }
      const result = await historyTool.call({
        startDate: input.date, endDate: input.date, timezone: input.timezone, domains: ['workouts', 'meals'],
      })
      const { window, workouts, meals } = result.structuredContent.history
      if (!('occurrences' in workouts) || !('occurrences' in meals)) {
        throw new CoachingContextError(503, 'Activity is unavailable')
      }

      const activity = {
        date: window.startDate,
        timezone: window.timezone,
        workouts: {
          status: statusFor(workouts),
          entries: workouts.occurrences.map(({ details, revision }) => {
            const performed = details.records.filter(record => record.completionState !== 'explicitly_not_completed')
            const rows = performed.slice(0, 5).flatMap(record => {
              const { quantities } = record
              const loadUnit = 'loadUnit' in record ? record.loadUnit : 'loadUnit' in quantities ? quantities.loadUnit : null
              const metrics = [
                ...quantityText(quantities.sets, 'sets'),
                ...quantityText(quantities.repetitions, 'reps recorded'),
                ...(loadUnit === 'lb' || loadUnit === 'kg' ? quantityText(quantities.load, loadUnit) : []),
                ...quantityText(quantities.durationMinutes, 'min'),
                ...(record.basis === 'estimated_work' ? ['estimated'] : []),
                ...(record.completionState === 'uncertain' ? ['completion uncertain'] : []),
              ]
              const name = record.recordedName?.trim().slice(0, 100) || 'Recorded movement'
              const recorded = 'recordedEvent' in record ? record.recordedEvent.performed : null
              const sets = recorded ? [recorded.sets, recorded.set_details].find(Array.isArray)
                : details.nestedSetContexts.find(set => set.sourcePath === record.sourcePath + '.sets'
                  || set.sourcePath === record.sourcePath + '.set_details')?.recordedSets
              return [metrics.length ? `${name} · ${metrics.join(' · ')}` : name, ...setLines(sets)]
            })
            if (performed.length > 5) rows.push(`+${performed.length - 5} more saved movement entries`)
            if (details.status !== 'available' || !rows.length) rows.push('Some workout details are unavailable.')
            return { label: 'Saved workout', revision, details: rows }
          }),
        },
        meals: {
          status: statusFor(meals),
          entries: meals.occurrences.map(({ mealTiming, items, macros, revision, source }) => {
            const label = typeof mealTiming === 'string' && mealTiming
              ? mealTiming.toLowerCase().replaceAll('_', ' ').replace(/^./, char => char.toUpperCase()).slice(0, 40)
              : 'Logged meal'
            const details = items.flatMap(item => item?.food ? [[item.food, item.portion].filter(Boolean).join(' · ')] : [])
            if (macros.calories !== null) {
              const basis = source.macros?.origin === 'model_estimated' ? 'estimated' : 'recorded'
              details.push(`${macros.calories} kcal ${basis}`)
            }
            return { label, revision, details }
          }),
        },
      }
      return {
        content: [{ type: 'text' as const, text: `SociusFit Activity for ${activity.date}. Use get_activity_history for the underlying records or a text answer.` }],
        _meta: { activity },
      }
    },
  }
}
