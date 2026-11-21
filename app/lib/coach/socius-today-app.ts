import { isValidTimezoneOffset } from '../timezone-utils'
import { CoachingContextError, contextObject } from './coaching-context'
import type { readCoachingContext } from './coaching-context-server'
import { projectTodayRecovery, type createOwnedWorkoutRecoveryReader } from './recovery-today-app'
import { deriveTodayAssessmentGuidance, parseTodayCheckIn, todayCheckInSchema } from './today-assessment-guidance'
import { sociusTodayHtml } from './today-app-ui'
import type { createWorkoutTodayReader } from './workout-today-app'

export const legacySociusTodayResourceUris: readonly string[] = [
  'ui://socius/today.html',
  'ui://socius/today-v2.html',
  'ui://socius/today-v4.html',
  'ui://socius/today-v5.html',
]

export const sociusTodayResource = {
  // ChatGPT uses the URI as a cache key. Bump it when releasing changes to the widget.
  uri: 'ui://socius/today-v6.html',
  name: 'SociusFit Today',
  mimeType: 'text/html;profile=mcp-app',
} as const

const todayIcons = [
  { theme: 'light', stroke: '#216b55' },
  { theme: 'dark', stroke: '#84dbc2' },
].map(({ theme, stroke }) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"
    stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="5.5" width="3" height="9" rx="1"/>
    <rect x="13" y="5.5" width="3" height="9" rx="1"/>
    <path d="M7 10h6M4 10H2m0-2v4m14-2h2m0-2v4"/>
  </svg>`
  return { src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, mimeType: 'image/svg+xml', sizes: ['any'], theme }
})

export const sociusTodayTool = {
  name: 'open_socius_today',
  title: 'SociusFit',
  description: 'Open the private SociusFit Today dashboard or get daily guidance from a quick check-in with a timezone offset.',
  icons: todayIcons,
  inputSchema: {
    type: 'object',
    properties: { tzOffset: { type: 'integer', minimum: -720, maximum: 840 }, checkIn: todayCheckInSchema },
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
type WorkoutToday = Awaited<ReturnType<ReturnType<typeof createWorkoutTodayReader>>>
type WorkoutRecovery = Awaited<ReturnType<ReturnType<typeof createOwnedWorkoutRecoveryReader>>>

function projectToday(context: CoachingContext, workout: WorkoutToday, pairedRecovery: WorkoutRecovery) {
  const { workoutRecommendation, lastWorkout, workoutEvidence } = workout
  const sessions = workoutRecommendation.sessions
  return {
    date: context.localDate,
    readAt: context.readCompletedAt,
    workoutRecommendation,
    lastWorkout,
    // Keep the prior payload keys usable while the host refreshes the installed resource.
    sessionStatus: sessions.length ? 'scheduled' : context.acceptedProgramming ? 'none' : 'unavailable',
    sessions,
    recentStatus: lastWorkout.status,
    recentWork: lastWorkout.movements.map(record => ({ ...record, date: lastWorkout.date })),
    recovery: projectTodayRecovery(context.recovery, workoutEvidence, pairedRecovery),
  }
}

export function createSociusTodayTool(
  readContext: (input: { tzOffset: number; days: number }) => Promise<CoachingContext>,
  options: {
    activityEnabled: boolean
    nutritionEnabled: boolean
    readWorkout: ReturnType<typeof createWorkoutTodayReader>
    readWorkoutRecovery: ReturnType<typeof createOwnedWorkoutRecoveryReader>
  },
) {
  return {
    async call(input: unknown) {
      if (!contextObject(input) || Object.keys(input).some(key => key !== 'tzOffset' && key !== 'checkIn')) {
        throw new CoachingContextError(400, 'Only timezone offset and check-in are supported')
      }
      const content = [{ type: 'text' as const, text: 'SociusFit Today opened.' }]
      const checkIn = 'checkIn' in input ? parseTodayCheckIn(input.checkIn) : null
      if ('checkIn' in input && (!checkIn || !('tzOffset' in input))) {
        throw new CoachingContextError(400, 'A check-in requires stress, fatigue, sleep and a timezone offset')
      }
      // The host opens the global entry point with {}. The app requests data
      // after it can supply the athlete's local offset through the same host.
      if (!('tzOffset' in input)) return { content }
      const { tzOffset } = input
      if (typeof tzOffset !== 'number' || !Number.isInteger(tzOffset) || !isValidTimezoneOffset(tzOffset)) {
        throw new CoachingContextError(400, 'Invalid timezone offset')
      }
      const context = await readContext({ tzOffset, days: 7 })
      const workout = await options.readWorkout(context)
      const pairedRecovery = await options.readWorkoutRecovery(workout.workoutEvidence)
      return { content, _meta: {
        today: {
          ...projectToday(context, workout, pairedRecovery),
          ...(checkIn ? { assessmentGuidance: deriveTodayAssessmentGuidance(checkIn, context, workout) } : {}),
        },
        ...(options.activityEnabled ? { activityEnabled: true } : {}),
        ...(options.nutritionEnabled ? { nutritionEnabled: true } : {}),
      } }
    },
  }
}
