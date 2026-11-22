import { createHash } from 'node:crypto'
import { isValidTimezoneOffset } from '../timezone-utils'
import { COACHING_CONTEXT_MAX_CHARACTERS, CoachingContextError, contextObject } from './coaching-context'
import { stableStringify } from './rolling-weekly-contracts'
import { sessionDraftHtml } from './session-draft-app-ui'
import type { DraftEvidenceResult } from './session-draft-evidence'

const workflowVersion = 'today-session-draft-v1'
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const
const timezoneOffset = { type: 'integer', minimum: -720, maximum: 840,
  description: 'Athlete’s current Date.getTimezoneOffset in minutes. Ask if unknown.' } as const
const textFields = {
  title: 120, objective: 280, goalId: 120, weekReview: 1000, checkInAdjustment: 500,
  rationale: 600, scaleWhen: 500, stopWhen: 500,
} as const
const workFields = { activity: 120, dose: 200, effort: 120, rest: 120 } as const
const phases = { warmUp: 1, mainWork: 1, supportingWork: 0, cooldown: 0 } as const
const planUses = ['follow', 'adjust', 'new'] as const
const maxWorkPerPhase = 5
const maxSources = 12

export const sessionDraftInstructions = ' For “Draft today’s session” or an edit to that draft, start with prepare_today_session_draft.'
  + ' Use the reviewed playbook and compare the four weeks of known completed work against the active goals. State evidence gaps and compare only compatible sessions.'
  + ' Select one objective and use the saved check-in to adjust the dose. Start from the accepted session when present and explain any adjustment.'
  + ' Ask one focused question if a missing constraint would change the session. If a tool returns a hold or missing-input message, relay it and wait.'
  + ' Present the draft through show_today_session_draft after validation. Drafting requires only the two read-only draft tools.'

function textProperties(fields: Record<string, number>) {
  return Object.fromEntries(Object.entries(fields).map(([key, maxLength]) => [key, { type: 'string', minLength: 1, maxLength }]))
}

const workSchema = { type: 'object', required: Object.keys(workFields), properties: textProperties(workFields), additionalProperties: false }
const draftProperties = {
  ...textProperties(textFields),
  ...Object.fromEntries(Object.entries(phases).map(([phase, minItems]) => [phase, {
    type: 'array', minItems, maxItems: maxWorkPerPhase, items: workSchema,
  }])),
  planUse: { type: 'string', enum: planUses, description: 'Follow or adjust the accepted session for today, or draft new work if there is no planned session.' },
  sourceWorkoutIds: { type: 'array', minItems: 1, maxItems: maxSources, uniqueItems: true,
    items: { type: 'string', minLength: 1, maxLength: 120 }, description: 'IDs of logged workouts from the prepared evidence that inform the draft.' },
}

export const sessionDraftResource = {
  uri: 'ui://socius/session-draft-v1.html', name: 'SociusFit session draft', mimeType: 'text/html;profile=mcp-app',
} as const

export const sessionDraftResourceContents = {
  ...sessionDraftResource, text: sessionDraftHtml,
  _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } },
    'openai/ui': { availableDisplayModes: ['inline'] } },
}

export const prepareTodaySessionDraftTool = {
  name: 'prepare_today_session_draft', title: 'Prepare today’s session draft',
  description: 'Use first when the athlete asks to draft today’s training session after a saved check-in. The fixed 28-day evidence, active goals, constraints, accepted session and reviewed playbook come from SociusFit. When ready, write one draft and call show_today_session_draft with the returned context ID. For a review hold or missing input, relay the returned message.',
  inputSchema: { type: 'object', required: ['tzOffset'], properties: { tzOffset: timezoneOffset }, additionalProperties: false },
  annotations: readOnly,
} as const

export const showTodaySessionDraftTool = {
  name: 'show_today_session_draft', title: 'Show today’s session draft',
  description: 'Validate and display one editable-in-chat training draft after prepare_today_session_draft. Compare the four weeks with the active goals, cite saved workout IDs, explain the check-in adjustment and any accepted-session change, and give runnable dose, effort, rest, scale and stop instructions. The result is a proposal.',
  inputSchema: { type: 'object', required: ['tzOffset', 'contextId', 'draft'], additionalProperties: false,
    properties: { tzOffset: timezoneOffset, contextId: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      draft: { type: 'object', required: Object.keys(draftProperties), properties: draftProperties, additionalProperties: false } } },
  annotations: readOnly,
  _meta: { ui: { resourceUri: sessionDraftResource.uri, visibility: ['app', 'model'] } },
} as const

type DraftWork = Record<keyof typeof workFields, string>
type SessionDraft = Record<keyof typeof textFields, string> & Record<keyof typeof phases, DraftWork[]> & {
  planUse: typeof planUses[number]; sourceWorkoutIds: string[]
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

function parseSessionDraft(value: unknown): SessionDraft {
  if (!exactObject(value, Object.keys(draftProperties))
    || !Object.entries(textFields).every(([key, limit]) => isText(value[key], limit))
    || !planUses.some(planUse => value.planUse === planUse)
    || !Array.isArray(value.sourceWorkoutIds) || value.sourceWorkoutIds.length < 1 || value.sourceWorkoutIds.length > maxSources
    || !value.sourceWorkoutIds.every(id => isText(id, 120)) || new Set(value.sourceWorkoutIds).size !== value.sourceWorkoutIds.length) {
    throw new CoachingContextError(400, 'Supply one complete draft with a goal, rationale and distinct logged workout references')
  }

  for (const [phase, minItems] of Object.entries(phases)) {
    const work = value[phase]
    if (!Array.isArray(work) || work.length < minItems || work.length > maxWorkPerPhase
      || !work.every(row => exactObject(row, Object.keys(workFields))
        && Object.entries(workFields).every(([key, limit]) => isText(row[key], limit)))) {
      throw new CoachingContextError(400, 'Supply activity, dose, effort and rest for each drafted exercise')
    }
  }
  return value as SessionDraft
}

type Evidence = Extract<DraftEvidenceResult, { status: 'ready' }>['evidence']

function contextIdFor(evidence: Evidence) {
  return createHash('sha256').update(stableStringify({ workflowVersion, evidence })).digest('hex')
}

export function createSessionDraftTools(readEvidence: (tzOffset: number) => Promise<DraftEvidenceResult>) {
  return {
    prepare: {
      async call(input: unknown) {
        if (!exactObject(input, ['tzOffset'])) throw new CoachingContextError(400, 'Supply only the timezone offset')
        const result = await readEvidence(readOffset(input.tzOffset))
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
        const usesAcceptedSession = draft.planUse !== 'new'
        if (!goal || sourceDates.some(date => date === undefined) || usesAcceptedSession !== evidence.hasPlannedSession) {
          throw new CoachingContextError(400, 'Use a prepared active goal, logged workouts and the correct accepted-session status')
        }

        const { date } = evidence
        const { title, objective, weekReview, checkInAdjustment, rationale, planUse, warmUp, mainWork, supportingWork, cooldown, scaleWhen, stopWhen } = draft
        const sessionDraft = { date, title, objective, goal: goal.statement, weekReview, checkInAdjustment, rationale, planUse,
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
