import { createHash } from 'node:crypto'
import { formatUTCAsLocalDateWithOffset, isValidTimezoneOffset } from '../timezone-utils'
import { COACHING_CONTEXT_MAX_CHARACTERS, CoachingContextError, contextObject } from './coaching-context'
import { stableStringify } from './rolling-weekly-contracts'
import { sessionDraftHtml } from './session-draft-app-ui'
import type { DraftEvidenceResult } from './session-draft-evidence'

const workflowVersion = 'today-session-draft-v4'
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const
const timezoneOffset = { type: 'integer', minimum: -720, maximum: 840,
  description: 'Athlete’s current Date.getTimezoneOffset in minutes. Ask if unknown.' } as const
const textFields = {
  title: 120, objective: 280, goalId: 120, weekReview: 1000, checkInAdjustment: 500,
  rationale: 600, scaleWhen: 500, stopWhen: 500,
} as const
const workFields = { activity: 120, dose: 200, effort: 120, rest: 120 } as const
const phases = ['warmUp', 'mainWork', 'supportingWork', 'cooldown'] as const
const planUses = ['follow', 'adjust', 'new'] as const
const dayTypes = ['training', 'recovery', 'rest'] as const
const maxWorkPerPhase = 5
const maxSources = 12

export const sessionDraftInstructions = ' For any request to recommend, draft, or adjust today’s training, start with prepare_today_session_draft.'
  + ' When Today includes expectedLocalDate and tzOffset, pass both values unchanged. Keep the draft bound to that saved date.'
  + ' Treat an undated request for one personalized training session as a request for today unless another date is established.'
  + ' Use the reviewed playbook and compare the four weeks of known completed work against the active goals. State evidence gaps and compare only compatible sessions.'
  + ' Select one objective and use the saved check-in to adjust the dose. Start from the accepted session when present and explain any adjustment.'
  + ' Run the workflow even without scheduled training. For daySchedule scheduled_rest, preserve the accepted rest day with planUse follow and a rest or light recovery draft. Treat unscheduled as an unknown schedule. Use empty exercise phases for full rest.'
  + ' On the 1-to-5 check-in, 1 is worst and 5 is best in every field. A 5 means very low stress, fatigue or soreness, very good sleep, or very high motivation. Treat relative-to-usual answers as qualitative.'
  + ' Ask one focused question if a missing constraint would change the session. When preparation is not ready or a call fails, relay the relevant message and resolve the issue before drafting. If the evidence changed, prepare it again.'
  + ' Call show_today_session_draft to validate and display the session. Share only a validated draft. Use these two read-only tools for every daily session draft. Factual reads and general coaching references do not authorize a draft.'

function textProperties(fields: Record<string, number>) {
  return Object.fromEntries(Object.entries(fields).map(([key, maxLength]) => [key, { type: 'string', minLength: 1, maxLength }]))
}

const workSchema = { type: 'object', required: Object.keys(workFields), properties: textProperties(workFields), additionalProperties: false }
const draftProperties = {
  ...textProperties(textFields),
  ...Object.fromEntries(phases.map(phase => [phase, {
    type: 'array', maxItems: maxWorkPerPhase, items: workSchema,
  }])),
  dayType: { type: 'string', enum: dayTypes, description: 'Training requires warm-up and main work. Recovery requires light main work. Full rest has no exercise phases.' },
  planUse: { type: 'string', enum: planUses, description: 'Follow or adjust the accepted session, follow a scheduled rest day, or draft new guidance on an unscheduled day.' },
  sourceWorkoutIds: { type: 'array', minItems: 1, maxItems: maxSources, uniqueItems: true,
    items: { type: 'string', minLength: 1, maxLength: 120 }, description: 'IDs of logged workouts from the prepared evidence that inform the draft.' },
}
const requiredDraftFields = Object.keys(draftProperties).filter(key => key !== 'dayType')

export const legacySessionDraftResourceUri = 'ui://socius/session-draft-v1.html'
export const sessionDraftResource = {
  uri: 'ui://socius/session-draft-v2.html', name: 'SociusFit session draft', mimeType: 'text/html;profile=mcp-app',
} as const

export const sessionDraftResourceContents = {
  ...sessionDraftResource, text: sessionDraftHtml,
  _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } },
    'openai/ui': { availableDisplayModes: ['inline'] } },
}

export const prepareTodaySessionDraftTool = {
  name: 'prepare_today_session_draft', title: 'Prepare today’s session draft',
  description: 'Use first after a Today check-in asks for a draft or when the athlete requests or revises one, including on a rest day. The fixed 28-day evidence, saved check-in, active goals, constraints, accepted schedule and reviewed playbook come from SociusFit. When ready, write one draft and call show_today_session_draft with the returned context ID. For any other result or tool error, resolve the issue before drafting a session.',
  inputSchema: { type: 'object', required: ['tzOffset'],
    properties: { tzOffset: timezoneOffset, expectedLocalDate: { type: 'string', format: 'date',
      description: 'The exact verified local date of the check-in. Pass it unchanged when starting a draft from Today.' } },
    additionalProperties: false },
  annotations: readOnly,
} as const

export const showTodaySessionDraftTool = {
  name: 'show_today_session_draft', title: 'Show today’s session draft',
  description: 'Validate and display one editable training, recovery or rest draft after prepare_today_session_draft. Cite the active goal and logged workout evidence and explain the check-in adjustment. Supply runnable details for exercise or empty phases for full rest.',
  inputSchema: { type: 'object', required: ['tzOffset', 'contextId', 'draft'], additionalProperties: false,
    properties: { tzOffset: timezoneOffset, contextId: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      draft: { type: 'object', required: requiredDraftFields, properties: draftProperties, additionalProperties: false } } },
  annotations: readOnly,
  _meta: { ui: { resourceUri: sessionDraftResource.uri, visibility: ['app', 'model'] } },
} as const

type DraftWork = Record<keyof typeof workFields, string>
type SessionDraft = Record<keyof typeof textFields, string> & Record<typeof phases[number], DraftWork[]> & {
  dayType: typeof dayTypes[number]; planUse: typeof planUses[number]; sourceWorkoutIds: string[]
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength && value.trim().length > 0
}

function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  return contextObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}

function readOffset(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || !isValidTimezoneOffset(value)) {
    throw new CoachingContextError(400, 'Supply the athlete’s current timezone offset')
  }
  return value
}

function parseSessionDraft(input: unknown): SessionDraft {
  // Older ChatGPT tool catalogs did not ask for dayType. Training remains the default.
  const value: Record<string, unknown> | null = contextObject(input) ? { dayType: 'training', ...input } : null
  if (!exactObject(value, Object.keys(draftProperties))
    || !Object.entries(textFields).every(([key, limit]) => isText(value[key], limit))
    || !dayTypes.some(dayType => value.dayType === dayType)
    || !planUses.some(planUse => value.planUse === planUse)
    || !Array.isArray(value.sourceWorkoutIds) || value.sourceWorkoutIds.length < 1 || value.sourceWorkoutIds.length > maxSources
    || !value.sourceWorkoutIds.every(id => isText(id, 120)) || new Set(value.sourceWorkoutIds).size !== value.sourceWorkoutIds.length) {
    throw new CoachingContextError(400, 'Supply one complete draft with a goal, rationale and distinct logged workout references')
  }

  for (const phase of phases) {
    const work = value[phase]
    if (!Array.isArray(work) || work.length > maxWorkPerPhase
      || !work.every(row => exactObject(row, Object.keys(workFields))
        && Object.entries(workFields).every(([key, limit]) => isText(row[key], limit)))) {
      throw new CoachingContextError(400, 'Supply activity, dose, effort and rest for each drafted exercise')
    }
  }
  const draft = value as SessionDraft
  const validPhases = draft.dayType === 'rest' ? phases.every(phase => draft[phase].length === 0)
    : draft.mainWork.length > 0 && (draft.dayType === 'recovery' || draft.warmUp.length > 0)
  if (!validPhases) throw new CoachingContextError(400, 'Use phases that match the training, recovery or rest draft')
  return draft
}

type Evidence = Extract<DraftEvidenceResult, { status: 'ready' }>['evidence']

function contextIdFor(evidence: Evidence) {
  return createHash('sha256').update(stableStringify({ workflowVersion, evidence })).digest('hex')
}

export function createSessionDraftTools(readEvidence: (tzOffset: number) => Promise<DraftEvidenceResult>) {
  return {
    prepare: {
      async call(input: unknown) {
        if (!exactObject(input, ['tzOffset']) && !exactObject(input, ['tzOffset', 'expectedLocalDate'])) {
          throw new CoachingContextError(400, 'Supply the timezone offset and the verified local date when available')
        }
        const tzOffset = readOffset(input.tzOffset)
        const { expectedLocalDate } = input
        if ('expectedLocalDate' in input && (typeof expectedLocalDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expectedLocalDate))) {
          throw new CoachingContextError(400, 'Supply a verified local date in YYYY-MM-DD format')
        }
        const localDate = formatUTCAsLocalDateWithOffset(new Date().toISOString(), tzOffset)
        const staleMessage = 'The saved check-in was for a different local date. Open Today to draft for the current date.'
        if (expectedLocalDate !== undefined && expectedLocalDate !== localDate) throw new CoachingContextError(409, staleMessage)
        const result = await readEvidence(tzOffset)
        if (expectedLocalDate !== undefined && result.status === 'ready' && expectedLocalDate !== result.evidence.date) {
          throw new CoachingContextError(409, staleMessage)
        }
        const structuredContent = result.status === 'ready'
          ? { ...result, workflowVersion, contextId: contextIdFor(result.evidence) }
          : { ...result, workflowVersion }
        const text = JSON.stringify(structuredContent)
        if (text.length > COACHING_CONTEXT_MAX_CHARACTERS) {
          throw new CoachingContextError(503, 'The draft evidence exceeds the coaching context limit')
        }
        return { structuredContent, content: [{ type: 'text' as const, text }] }
      },
    },
    show: {
      async call(input: unknown) {
        if (!exactObject(input, ['tzOffset', 'contextId', 'draft']) || typeof input.contextId !== 'string' || !/^[a-f0-9]{64}$/.test(input.contextId)) {
          throw new CoachingContextError(400, 'Prepare the coaching evidence before showing a draft')
        }
        const draft = parseSessionDraft(input.draft)
        const result = await readEvidence(readOffset(input.tzOffset))
        if (result.status !== 'ready') throw new CoachingContextError(409, result.message)
        const { evidence } = result
        if (contextIdFor(evidence) !== input.contextId) {
          throw new CoachingContextError(409, 'Today’s evidence changed. Prepare it again before showing a draft.')
        }

        const goal = evidence.goals.find(goalEntry => goalEntry.id === draft.goalId)
        const datesByWorkout = new Map(evidence.workouts.map(workout => [workout.id, workout.date]))
        const sourceDates = draft.sourceWorkoutIds.map(id => datesByWorkout.get(id))
        const matchesSchedule = evidence.daySchedule === 'scheduled_rest'
          ? draft.planUse === 'follow' && draft.dayType !== 'training'
          : evidence.hasPlannedSession
            ? draft.planUse === 'adjust' || (draft.planUse === 'follow' && draft.dayType !== 'rest')
            : draft.planUse === 'new'
        if (!goal || sourceDates.some(date => date === undefined) || !matchesSchedule) {
          throw new CoachingContextError(400, 'Use a prepared active goal, logged workouts and the correct accepted-session status')
        }

        const { date } = evidence
        const { title, objective, weekReview, checkInAdjustment, rationale, dayType, planUse, warmUp, mainWork, supportingWork, cooldown, scaleWhen, stopWhen } = draft
        const sessionDraft = { date, title, objective, goal: goal.statement, weekReview, checkInAdjustment, rationale, dayType, planUse,
          daySchedule: evidence.daySchedule,
          warmUp, mainWork, supportingWork, cooldown, scaleWhen, stopWhen,
          sourceDates: [...new Set(sourceDates)].sort(), historyComplete: evidence.historyCoverage.complete }
        return {
          structuredContent: { status: 'validated', workflowVersion, contextId: input.contextId, date },
          content: [{ type: 'text' as const, text: 'The SociusFit session draft is ready to review.' }],
          _meta: { sessionDraft },
        }
      },
    },
  }
}
