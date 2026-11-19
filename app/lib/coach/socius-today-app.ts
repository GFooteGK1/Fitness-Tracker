import { CoachingContextError, contextObject } from './coaching-context'
import type { readCoachingContext } from './coaching-context-server'
import type { EvidenceQuantity } from './performed-dose-evidence'
import { sociusTodayHtml } from './today-app-ui'

export const sociusTodayResource = {
  uri: 'ui://socius/today.html',
  name: 'SociusFit Today',
  mimeType: 'text/html;profile=mcp-app',
} as const

export const sociusTodayTool = {
  name: 'open_socius_today',
  title: 'SociusFit',
  description: 'Open the private read-only SociusFit Today dashboard.',
  inputSchema: {
    type: 'object',
    properties: { tzOffset: { type: 'integer', minimum: -720, maximum: 840 } },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: {
    ui: { resourceUri: sociusTodayResource.uri, visibility: ['app'] },
    'openai/ui': { entrypoints: [{ type: 'global' }] },
  },
} as const

export const sociusTodayResourceContents = {
  ...sociusTodayResource,
  text: sociusTodayHtml,
  _meta: {
    ui: { csp: { connectDomains: [], resourceDomains: [] } },
    'openai/ui': { availableDisplayModes: ['fullscreen'] },
  },
}

type CoachingContext = Awaited<ReturnType<typeof readCoachingContext>>

function displayText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) || null : null
}

function measurement(quantity: EvidenceQuantity, unit: string) {
  if (quantity.kind === 'unknown') return []
  const value = quantity.kind === 'exact' ? String(quantity.value) : `${quantity.min}–${quantity.max}`
  return [`${value} ${unit}`]
}

function projectToday(context: CoachingContext) {
  const programming = context.acceptedProgramming
  const sessions = (programming?.todaySessions ?? []).slice(0, 6).flatMap(row => {
    const { status, prescription } = row
    if ((status !== 'planned' && status !== 'completed' && status !== 'skipped') || !contextObject(prescription)) return []
    return [{
      title: displayText(prescription.title, 100) ?? displayText(prescription.session_title, 100),
      focus: displayText(prescription.intent, 180),
      status,
    }]
  })
  const work = context.performedWork
  // The source provides movement/event records, not a count of workout sessions.
  const recentWork = (work?.records ?? [])
    .filter(record => record.completionState !== 'explicitly_not_completed')
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.capturedAt ?? '').localeCompare(String(a.capturedAt ?? '')))
    .slice(0, 6)
    .map(record => {
      const quantities = record.quantities
      const loadUnit = 'loadUnit' in record ? record.loadUnit : 'loadUnit' in quantities ? quantities.loadUnit : null
      return {
        date: record.date,
        name: displayText(record.recordedName, 100) ?? 'Recorded movement',
        measurements: [
          ...measurement(quantities.sets, 'sets'),
          ...measurement(quantities.repetitions, 'reps recorded'),
          ...(loadUnit === 'lb' || loadUnit === 'kg' ? measurement(quantities.load, loadUnit) : []),
          ...measurement(quantities.durationMinutes, 'min'),
          ...(record.basis === 'estimated_work' ? ['Estimated'] : []),
          ...(record.completionState === 'uncertain' ? ['Completion uncertain'] : []),
        ],
      }
    })
  const recovery = context.recovery
  const metric = recovery.metrics.recovery
  return {
    date: context.localDate,
    readAt: context.readCompletedAt,
    sessionStatus: sessions.length ? 'scheduled' : programming ? 'none' : 'unavailable',
    sessions,
    recentStatus: !work || work.status === 'unavailable' ? 'unavailable'
      : work.status === 'partial' ? 'partial' : recentWork.length ? 'available' : 'empty',
    recentWork,
    recovery: {
      status: recovery.connected === false ? 'disconnected' : metric.status === 'stale' ? 'stale'
        : metric.status === 'timing_unverified' || metric.status === 'sync_ineligible' ? 'unverified' : 'unavailable',
      lastSyncAt: recovery.batch.lastSuccessfulBatchAt && recovery.batch.timeStatus === 'recorded'
        ? recovery.batch.lastSuccessfulBatchAt : null,
      storedDate: metric.storedDateStatus === 'same_utc_label' || metric.storedDateStatus === 'historical_label'
        ? metric.storedDate : null,
    },
  }
}

export function createSociusTodayTool(readContext: (input: { tzOffset: number; days: number }) => Promise<CoachingContext>) {
  return {
    async call(input: unknown) {
      if (!contextObject(input) || Object.keys(input).some(key => key !== 'tzOffset')) {
        throw new CoachingContextError(400, 'Only an optional timezone offset is supported')
      }
      const content = [{ type: 'text' as const, text: 'SociusFit Today opened.' }]
      // The host opens the global entry point with {}. The app requests data
      // after it can supply the athlete's local offset through the same host.
      if (!('tzOffset' in input)) return { content }
      const { tzOffset } = input
      if (typeof tzOffset !== 'number' || !Number.isInteger(tzOffset)) throw new CoachingContextError(400, 'Invalid timezone offset')
      const context = await readContext({ tzOffset, days: 7 })
      return { content, _meta: { today: projectToday(context) } }
    },
  }
}
