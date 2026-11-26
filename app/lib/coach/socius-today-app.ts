import { formatUTCAsLocalDateWithOffset, isValidTimezoneOffset } from '../timezone-utils'
import { CoachingContextError, contextObject } from './coaching-context'
import type { readCoachingContext } from './coaching-context-server'
import { assertVerifiedContextPrincipal, type AuthorizeContextRequest, type ContextToolPolicy } from './coaching-context-tool'
import type { readDailySessionDraft } from './daily-session-draft'
import {
  dailyCheckInSchema, legacyDailyCheckInSchema, parseDailyCheckIn, parseLegacyDailyCheckIn,
  saveDailyCheckIn, toLegacyDailyCheckIn,
} from './daily-check-in'
import { projectTodayRecovery, type createOwnedWorkoutRecoveryReader } from './recovery-today-app'
import { projectSessionDraftRequirement } from './session-draft-evidence'
import { readStoredSessionDraft, sessionDraftSafetyBinding } from './session-draft-tools'
import { sociusTodayHtml } from './today-app-ui'
import type { createWorkoutTodayReader } from './workout-today-app'

export const legacySociusTodayResourceUris: readonly string[] = [
  'ui://socius/today.html',
  'ui://socius/today-v2.html',
  'ui://socius/today-v4.html',
  'ui://socius/today-v5.html',
  'ui://socius/today-v6.html',
  'ui://socius/today-v7.html',
  'ui://socius/today-v8.html',
  'ui://socius/today-v9.html',
  'ui://socius/today-v10.html',
  'ui://socius/today-v11.html',
  'ui://socius/today-v12.html',
  'ui://socius/today-v13.html',
  'ui://socius/today-v14.html',
  'ui://socius/today-v15.html',
  'ui://socius/today-v16.html',
]

export const sociusTodayResource = {
  // ChatGPT uses the URI as a cache key. Bump it when releasing changes to the widget.
  uri: 'ui://socius/today-v17.html',
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
  description: 'Open the private SociusFit Today dashboard for the saved check-in, training session draft and recovery.',
  icons: todayIcons,
  inputSchema: {
    type: 'object',
    properties: {
      tzOffset: { type: 'integer', minimum: -720, maximum: 840 },
      sessionDraftOnly: { type: 'boolean', const: true, description: 'Refresh only the saved session draft for the same local date.' },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: {
    ui: { resourceUri: sociusTodayResource.uri, visibility: ['app'] },
    'openai/ui': { entrypoints: [{ type: 'global' }, { type: 'thread' }] },
  },
} as const

export const saveSociusTodayCheckInTool = {
  name: 'save_socius_today_check_in',
  title: 'Save Today check-in',
  description: 'Save the athlete’s explicit check-in for their local date. Each of the five ratings is from 1 (worst) to 5 (best). Cached Today widgets may send the previous relative answers.',
  inputSchema: {
    type: 'object',
    properties: {
      date: { type: 'string', format: 'date' },
      tzOffset: { type: 'integer', minimum: -720, maximum: 840 },
      checkIn: { anyOf: [dailyCheckInSchema, legacyDailyCheckInSchema] },
    },
    required: ['date', 'tzOffset', 'checkIn'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  _meta: { ui: { visibility: ['app'] } },
} as const

function validOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && isValidTimezoneOffset(value)
}

export function createSaveSociusTodayCheckInTool(authorize: AuthorizeContextRequest, policy: ContextToolPolicy) {
  return {
    async call(input: unknown) {
      if (!contextObject(input) || Object.keys(input).length !== 3
        || typeof input.date !== 'string' || !validOffset(input.tzOffset)) {
        throw new CoachingContextError(400, 'A check-in save requires the local date and timezone offset')
      }
      const checkIn = parseDailyCheckIn(input.checkIn) ?? parseLegacyDailyCheckIn(input.checkIn)
      if (!checkIn) throw new CoachingContextError(400, 'Use five whole-number ratings from 1 to 5.')
      const { principal, db } = await authorize()
      assertVerifiedContextPrincipal(principal, policy)
      const identity = await db.auth.getUser()
      if (identity.error || identity.data.user?.id !== principal.subject) {
        throw new CoachingContextError(401, 'Authenticated subject mismatch')
      }
      const date = formatUTCAsLocalDateWithOffset(new Date().toISOString(), input.tzOffset)
      if (input.date !== date) throw new CoachingContextError(409, 'The local date changed. Reopen Today and try again.')
      const saved = await saveDailyCheckIn(db, principal.subject, date, checkIn).catch(() => {
        throw new CoachingContextError(503, 'Could not confirm the check-in save')
      })
      return { content: [{ type: 'text' as const, text: 'Today check-in saved.' }], _meta: { savedCheckIn: { date, ...saved } } }
    },
  }
}

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
type ReadSessionDraft = (date: string, revision?: string) => ReturnType<typeof readDailySessionDraft>

async function projectSessionDraft(context: CoachingContext, workout: WorkoutToday, readDraft: ReadSessionDraft) {
  const { dailyCheckIn, localDate, requirements } = context
  if (dailyCheckIn.status !== 'saved') return { sessionDraftStatus: dailyCheckIn.status } as const
  const restrictions = requirements.training_constraints
  if (workout.safety.status === 'hold' || restrictions.status === 'needs_review') return { sessionDraftStatus: 'held' } as const
  if (!dailyCheckIn.revision || workout.safety.status === 'unavailable'
    || ['unavailable', 'truncated', 'invalid'].includes(restrictions.status)) return { sessionDraftStatus: 'unavailable' } as const

  const stored = await readDraft(localDate, dailyCheckIn.revision)
  if (stored.status !== 'saved') return { sessionDraftStatus: stored.status } as const
  const acceptedPlan: unknown = context.acceptedProgramming?.plan
  const acceptedPlanId = contextObject(acceptedPlan) && typeof acceptedPlan.id === 'string' ? acceptedPlan.id : null
  const safetyBinding = sessionDraftSafetyBinding(projectSessionDraftRequirement(restrictions), acceptedPlanId)
  const projected = readStoredSessionDraft(stored.draft, localDate, safetyBinding)
  return projected.status === 'saved' ? { sessionDraftStatus: projected.status, sessionDraft: projected.draft } as const
    : { sessionDraftStatus: projected.status } as const
}

// Previously cached widgets expect this field after saving. Give them the
// chat handoff without generating any training guidance.
const legacyCheckInHandoff = {
  title: 'Check-in saved',
  summary: 'In SociusFit chat, ask “Draft today’s session”.',
  reasons: [],
  actions: [],
}

const retiredCheckInPreview = {
  title: 'Open the updated Today view',
  summary: 'Reopen Today to save your five check-in answers. Then ask “Draft today’s session” in SociusFit chat.',
  reasons: [],
  actions: [],
}

function isRetiredPreview(value: unknown) {
  const fields = ['stress', 'fatigue', 'sleep'] as const
  return contextObject(value) && Object.keys(value).length === fields.length
    && fields.every(field => legacyDailyCheckInSchema.properties[field].enum.some(choice => choice === value[field]))
}

function projectWorkoutRecommendation(workout: WorkoutToday) {
  const { workoutRecommendation, safety } = workout
  const warning = safety.status === 'hold' ? {
    title: safety.reason === 'concerning_feedback' ? 'Review the saved pain report' : 'Review before training',
    reason: safety.reason === 'concerning_feedback' ? 'Your saved feedback flags concerning pain.'
      : safety.reason === 'recover' ? 'Your saved coaching decision calls for recovery.'
        : 'Your saved coaching decision calls for a pause.',
  } : safety.status === 'unavailable' ? {
    title: 'Training safety status unavailable',
    reason: 'Try again before choosing today’s training.',
  } : null
  return warning ? { ...workoutRecommendation, ...warning,
    status: 'recommended' as const, source: 'saved_recommendation' as const, reviewBeforeTraining: true } : workoutRecommendation
}

function projectToday(context: CoachingContext, workout: WorkoutToday, pairedRecovery: WorkoutRecovery) {
  const { lastWorkout, workoutEvidence } = workout
  const workoutRecommendation = projectWorkoutRecommendation(workout)
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
    nutritionWritesEnabled: boolean
    checkInEnabled: boolean
    sessionDraftSavingEnabled: boolean
    readWorkout: ReturnType<typeof createWorkoutTodayReader>
    readWorkoutRecovery: ReturnType<typeof createOwnedWorkoutRecoveryReader>
    readSessionDraft: ReadSessionDraft
  },
) {
  return {
    async call(input: unknown) {
      if (!contextObject(input) || Object.keys(input).some(key => key !== 'tzOffset' && key !== 'checkIn' && key !== 'sessionDraftOnly')) {
        throw new CoachingContextError(400, 'Reopen Today to view your saved check-in.')
      }
      // Cached pre-save widgets can still send their old three-field preview.
      // Return only an update notice, and never interpret or save those answers.
      const cachedPreview = 'checkIn' in input
      const draftOnly = 'sessionDraftOnly' in input
      if (draftOnly && (cachedPreview || input.sessionDraftOnly !== true || !('tzOffset' in input))) {
        throw new CoachingContextError(400, 'Refresh the saved Today draft with your current timezone offset.')
      }
      if (cachedPreview && (!('tzOffset' in input) || !isRetiredPreview(input.checkIn))) {
        throw new CoachingContextError(400, 'Reopen Today to view your saved check-in.')
      }
      const content = [{ type: 'text' as const, text: 'SociusFit Today opened.' }]
      // The host opens the global entry point with {}. The app requests data
      // after it can supply the athlete's local offset through the same host.
      if (!('tzOffset' in input)) return { content }
      const { tzOffset } = input
      if (!validOffset(tzOffset)) {
        throw new CoachingContextError(400, 'Invalid timezone offset')
      }
      const date = formatUTCAsLocalDateWithOffset(new Date().toISOString(), tzOffset)
      if (draftOnly) {
        const stored = await options.readSessionDraft(date)
        // Most polls precede the model's validation call. Skip the full coaching
        // snapshot until there is a stored draft that could be displayed.
        if (stored.status !== 'saved') return { content, _meta: { today: { date, sessionDraftStatus: stored.status } } }
      }
      const context = await readContext({ tzOffset, days: 7 })
      const workout = await options.readWorkout(context)
      const session = await projectSessionDraft(context, workout, options.readSessionDraft)
      const assessment = context.dailyCheckIn
      if (draftOnly) {
        const { title, reason, reviewBeforeTraining } = projectWorkoutRecommendation(workout)
        return { content, _meta: { today: { date: context.localDate, assessment,
          workoutRecommendation: { title, reason, reviewBeforeTraining }, ...session } } }
      }
      const pairedRecovery = await options.readWorkoutRecovery(workout.workoutEvidence)
      const today = projectToday(context, workout, pairedRecovery)
      const review = today.workoutRecommendation
      const handoff = cachedPreview || assessment.status === 'saved' ? (
        review.reviewBeforeTraining
          ? { title: review.title, summary: review.reason ?? 'Check the training safety status before drafting.', actions: [], reasons: [] }
          : cachedPreview ? retiredCheckInPreview : legacyCheckInHandoff
      ) : null
      const checkIn = assessment.status === 'saved' ? { status: 'saved' as const,
        checkIn: assessment.scale === '1-to-5' ? toLegacyDailyCheckIn(assessment.checkIn) : assessment.checkIn,
      } : assessment
      return { content, _meta: {
        today: {
          ...today,
          assessment,
          checkIn,
          ...session,
          ...(handoff ? { assessmentGuidance: handoff } : {}),
        },
        ...(options.activityEnabled ? { activityEnabled: true } : {}),
        ...(options.nutritionEnabled ? { nutritionEnabled: true } : {}),
        ...(options.nutritionWritesEnabled ? { nutritionWritesEnabled: true } : {}),
        ...(options.checkInEnabled ? { checkInEnabled: true } : {}),
        ...(options.sessionDraftSavingEnabled ? { sessionDraftSavingEnabled: true } : {}),
      } }
    },
  }
}
