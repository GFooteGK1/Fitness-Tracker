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
const displayTextFields = {
  title: 120, objective: 280, weekReview: 1000, checkInAdjustment: 500,
  rationale: 600, scaleWhen: 500, stopWhen: 500,
} as const
const textFields = { ...displayTextFields, goalId: 120 } as const
const workFields = { activity: 120, dose: 200, effort: 120, rest: 120 } as const
const phases = ['warmUp', 'mainWork', 'supportingWork', 'cooldown'] as const
const planUses = ['follow', 'adjust', 'new'] as const
const dayTypes = ['training', 'recovery', 'rest'] as const
const maxWorkPerPhase = 5
const maxSources = 12
const daySchedules = ['planned', 'completed', 'skipped', 'scheduled_rest', 'unscheduled'] as const

export const sessionDraftInstructions = ' For any request to recommend, draft, or adjust today’s training, use prepare_today_session_draft before authoring.'
  + ' Pass the expectedLocalDate, tzOffset, and expectedCheckInRevision supplied by Today unchanged to prepare_today_session_draft. Keep the draft bound to that saved check-in.'
  + ' Treat an undated request for one personalized training session as a request for today unless another date is established.'
  + ' Use the reviewed playbook and compare the four weeks of known completed work against the active goals. State evidence gaps and compare only compatible sessions.'
  + ' Select one objective and use the saved check-in to adjust the dose. Respect the athlete’s current restrictions and available equipment. Start from the accepted session when appropriate and explain any adjustment.'
  + ' Run the workflow even without scheduled training. For daySchedule scheduled_rest, preserve the accepted rest day with planUse follow and a rest or light recovery draft. Treat unscheduled as an unknown schedule. Use empty exercise phases for full rest.'
  + ' On the 1-to-5 check-in, 1 is worst and 5 is best in every field. A 5 means very low stress, fatigue or soreness, very good sleep, or very high motivation. Treat relative-to-usual answers as qualitative.'
  + ' Ask one focused question if a missing constraint would change the session. When preparation is not ready or a call fails, relay the relevant message and resolve the issue before drafting. If the evidence changed, prepare it again.'
  + ' For ordinary chat previews, call show_today_session_draft to validate and display an unsaved draft. Tell the athlete the preview is unsaved. Share only a validated draft. Factual reads and general coaching references do not authorize a draft.'
  + ' Confirm saving to Today only when save_today_session_draft returns savedToToday: true.'

export const saveSessionDraftInstructions = ' When the athlete explicitly asks to save a session draft in Today, including the verified check-in workflow that requests it, prepare against the confirmed expectedLocalDate and call save_today_session_draft to validate, save, and display it. Use one draft tool per result. If the save is uncertain, say so and ask the athlete to check Today before retrying.'

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

export const legacySessionDraftResourceUris: readonly string[] = [
  'ui://socius/session-draft-v1.html',
  'ui://socius/session-draft-v2.html',
  'ui://socius/session-draft-v3.html',
]
export const sessionDraftResource = {
  uri: 'ui://socius/session-draft-v4.html', name: 'SociusFit session draft', mimeType: 'text/html;profile=mcp-app',
} as const

export const sessionDraftResourceContents = {
  ...sessionDraftResource, text: sessionDraftHtml,
  _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } },
    'openai/ui': { availableDisplayModes: ['inline'] } },
}

export const prepareTodaySessionDraftTool = {
  name: 'prepare_today_session_draft', title: 'Prepare today’s session draft',
  description: 'Use before authoring a requested Today draft or revision, including on a rest day. The fixed 28-day evidence, saved check-in, active goals, constraints, accepted schedule and reviewed playbook come from SociusFit. When ready, use the returned context ID with one draft. For an ordinary preview, use show_today_session_draft. For an explicit request to save to Today, use save_today_session_draft when available. If saving is unavailable, tell the athlete the draft remains unsaved. Resolve any other result or tool error before drafting.',
  inputSchema: { type: 'object', required: ['tzOffset'],
    properties: { tzOffset: timezoneOffset, expectedLocalDate: { type: 'string', format: 'date',
      description: 'The exact verified local date of the check-in. Pass it unchanged when starting a draft from Today.' },
    expectedCheckInRevision: { type: 'string', format: 'uuid',
      description: 'The exact check-in revision supplied by Today. Pass it unchanged when present.' } },
    additionalProperties: false },
  annotations: readOnly,
} as const

export const showTodaySessionDraftTool = {
  name: 'show_today_session_draft', title: 'Show today’s session draft',
  description: 'Validate and display one unsaved training, recovery or rest preview after prepare_today_session_draft. This read-only tool returns savedToToday: false. Cite the active goal and logged workout evidence and explain the check-in adjustment. Supply runnable details for exercise or empty phases for full rest.',
  inputSchema: { type: 'object', required: ['tzOffset', 'contextId', 'draft'], additionalProperties: false,
    properties: { tzOffset: timezoneOffset, contextId: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      draft: { type: 'object', required: requiredDraftFields, properties: draftProperties, additionalProperties: false } } },
  annotations: readOnly,
  _meta: { ui: { resourceUri: sessionDraftResource.uri, visibility: ['app', 'model'] } },
} as const

export const saveTodaySessionDraftTool = {
  ...showTodaySessionDraftTool,
  name: 'save_today_session_draft', title: 'Save today’s session draft',
  description: 'Validate, save and display one editable training, recovery or rest draft when the athlete asks to save it in Today. First call prepare_today_session_draft with the confirmed expectedLocalDate. The new draft replaces the previous draft for this local date. Confirm saving only when this tool returns savedToToday: true.',
  annotations: { ...readOnly, readOnlyHint: false },
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

function validPhaseRows(value: unknown): value is DraftWork[] {
  return Array.isArray(value) && value.length <= maxWorkPerPhase
    && value.every(row => exactObject(row, Object.keys(workFields))
      && Object.entries(workFields).every(([key, limit]) => isText(row[key], limit)))
}

function validPhases(draft: Record<typeof phases[number], DraftWork[]> & Pick<SessionDraft, 'dayType'>) {
  return draft.dayType === 'rest' ? phases.every(phase => draft[phase].length === 0)
    : draft.mainWork.length > 0 && (draft.dayType === 'recovery' || draft.warmUp.length > 0)
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

  if (!phases.every(phase => validPhaseRows(value[phase]))) {
    throw new CoachingContextError(400, 'Supply activity, dose, effort and rest for each drafted exercise')
  }
  const draft = value as SessionDraft
  if (!validPhases(draft)) throw new CoachingContextError(400, 'Use phases that match the training, recovery or rest draft')
  return draft
}

type Evidence = Extract<DraftEvidenceResult, { status: 'ready' }>['evidence']

function fingerprint(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

function contextIdFor(evidence: Evidence, checkInRevision?: string, dateBoundOffset?: number) {
  return fingerprint({ workflowVersion, evidence, ...(checkInRevision ? { checkInRevision } : {}),
    ...(dateBoundOffset === undefined ? {} : { expectedLocalDate: evidence.date, tzOffset: dateBoundOffset }) })
}

export function sessionDraftSafetyBinding(restrictions: unknown, acceptedPlanId: string | null) {
  return fingerprint({ restrictions, acceptedPlanId })
}

type ShownSessionDraft = Omit<SessionDraft, 'goalId' | 'sourceWorkoutIds'> & {
  date: string; goal: string; daySchedule: Evidence['daySchedule']; sourceDates: string[]; historyComplete: boolean
}
type StoredSessionDraft = { date: string; safetyBinding: string; draft: ShownSessionDraft }
const shownFields = { ...displayTextFields, goal: 500 }
const shownKeys = [...Object.keys(shownFields), ...phases, 'date', 'daySchedule', 'dayType', 'planUse', 'sourceDates', 'historyComplete']

export function readStoredSessionDraft(value: unknown, date: string, safetyBinding: string) {
  if (!exactObject(value, ['date', 'safetyBinding', 'draft']) || value.date !== date) return { status: 'unavailable' } as const
  if (value.safetyBinding !== safetyBinding) return { status: 'missing' } as const
  const draft = value.draft
  if (!exactObject(draft, shownKeys) || draft.date !== date || typeof draft.historyComplete !== 'boolean'
    || !Object.entries(shownFields).every(([key, limit]) => isText(draft[key], limit))
    || !daySchedules.some(schedule => draft.daySchedule === schedule)
    || !dayTypes.some(dayType => draft.dayType === dayType) || !planUses.some(planUse => draft.planUse === planUse)
    || !Array.isArray(draft.sourceDates) || draft.sourceDates.length < 1 || draft.sourceDates.length > maxSources
    || !draft.sourceDates.every(sourceDate => typeof sourceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sourceDate) && sourceDate <= date)
    || !phases.every(phase => validPhaseRows(draft[phase])) || !validPhases(draft as ShownSessionDraft)) {
    return { status: 'unavailable' } as const
  }
  return { status: 'saved', draft: draft as ShownSessionDraft } as const
}

type SaveSessionDraft = (date: string, tzOffset: number, checkInRevision: string, draft: StoredSessionDraft) => Promise<'saved' | 'stale' | 'unavailable'>

export function createSessionDraftTools(readEvidence: (tzOffset: number) => Promise<DraftEvidenceResult>, saveDraft?: SaveSessionDraft) {
  async function displayDraft(input: unknown, persist?: SaveSessionDraft) {
    if (!exactObject(input, ['tzOffset', 'contextId', 'draft']) || typeof input.contextId !== 'string' || !/^[a-f0-9]{64}$/.test(input.contextId)) {
      throw new CoachingContextError(400, 'Prepare the coaching evidence before showing a draft')
    }
    const draft = parseSessionDraft(input.draft)
    const tzOffset = readOffset(input.tzOffset)
    const result = await readEvidence(tzOffset)
    if (result.status !== 'ready') throw new CoachingContextError(409, result.message)
    const { evidence, checkInRevision } = result
    const dateBound = contextIdFor(evidence, checkInRevision, tzOffset) === input.contextId
    if (!dateBound && contextIdFor(evidence, checkInRevision) !== input.contextId) {
      throw new CoachingContextError(409, 'Today’s evidence changed. Prepare it again before showing a draft.')
    }
    if (persist && !dateBound) throw new CoachingContextError(409, 'Prepare the draft with the confirmed local date before saving it in Today.')

    const goal = evidence.goals.find(goalEntry => goalEntry.id === draft.goalId)
    const datesByWorkout = new Map(evidence.workouts.map(workout => [workout.id, workout.date]))
    const sourceDates = draft.sourceWorkoutIds.map(id => datesByWorkout.get(id))
    const matchesSchedule = evidence.daySchedule === 'scheduled_rest'
      ? draft.planUse === 'follow' && draft.dayType !== 'training'
      : evidence.hasPlannedSession
        ? draft.planUse === 'adjust' || (draft.planUse === 'follow' && draft.dayType !== 'rest')
        : draft.planUse === 'new'
    if (!goal || !sourceDates.every(date => date !== undefined) || !matchesSchedule) {
      throw new CoachingContextError(400, 'Use a prepared active goal, logged workouts and the correct accepted-session status')
    }

    const { date } = evidence
    const { title, objective, weekReview, checkInAdjustment, rationale, dayType, planUse, warmUp, mainWork, supportingWork, cooldown, scaleWhen, stopWhen } = draft
    const sessionDraft: ShownSessionDraft = { date, title, objective, goal: goal.statement, weekReview, checkInAdjustment, rationale, dayType, planUse,
      daySchedule: evidence.daySchedule,
      warmUp, mainWork, supportingWork, cooldown, scaleWhen, stopWhen,
      sourceDates: [...new Set(sourceDates)].sort(), historyComplete: evidence.historyCoverage.complete }
    if (persist) {
      if (!checkInRevision) throw new CoachingContextError(503, 'Saving a draft in Today is currently unavailable.')
      const safetyBinding = sessionDraftSafetyBinding(evidence.requirements.training_constraints, evidence.acceptedSession.planId)
      const receipt = await persist(date, tzOffset, checkInRevision, { date, safetyBinding, draft: sessionDraft })
      if (receipt === 'stale') throw new CoachingContextError(409, 'The saved check-in changed. Prepare it again before saving a draft.')
      if (receipt !== 'saved') throw new CoachingContextError(503, 'Could not confirm the draft was saved. Check Today before trying again.')
    }
    return {
      structuredContent: { status: 'validated', workflowVersion, contextId: input.contextId, date, savedToToday: Boolean(persist) },
      content: [{ type: 'text' as const, text: persist ? 'The SociusFit session draft was saved in Today.' : 'This SociusFit session draft is an unsaved preview.' }],
      _meta: { sessionDraft },
    }
  }

  return {
    prepare: {
      async call(input: unknown) {
        if (!exactObject(input, ['tzOffset']) && !exactObject(input, ['tzOffset', 'expectedLocalDate'])
          && !exactObject(input, ['tzOffset', 'expectedLocalDate', 'expectedCheckInRevision'])) {
          throw new CoachingContextError(400, 'Supply the timezone offset and the verified local date when available')
        }
        const tzOffset = readOffset(input.tzOffset)
        const { expectedLocalDate, expectedCheckInRevision } = input
        if ('expectedLocalDate' in input && (typeof expectedLocalDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expectedLocalDate))) {
          throw new CoachingContextError(400, 'Supply a verified local date in YYYY-MM-DD format')
        }
        if ('expectedCheckInRevision' in input && (typeof expectedCheckInRevision !== 'string'
          || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(expectedCheckInRevision))) {
          throw new CoachingContextError(400, 'Supply the verified check-in revision from Today')
        }
        const localDate = formatUTCAsLocalDateWithOffset(new Date().toISOString(), tzOffset)
        const staleMessage = 'The saved check-in was for a different local date. Open Today to draft for the current date.'
        if (expectedLocalDate !== undefined && expectedLocalDate !== localDate) throw new CoachingContextError(409, staleMessage)
        const result = await readEvidence(tzOffset)
        if (expectedLocalDate !== undefined && result.status === 'ready' && expectedLocalDate !== result.evidence.date) {
          throw new CoachingContextError(409, staleMessage)
        }
        if (expectedCheckInRevision !== undefined && result.status === 'ready' && expectedCheckInRevision !== result.checkInRevision) {
          throw new CoachingContextError(409, 'The saved check-in changed. Open Today to use the current answers.')
        }
        const structuredContent = result.status === 'ready'
          ? { status: result.status, evidence: result.evidence, workflowVersion,
            contextId: contextIdFor(result.evidence, result.checkInRevision, expectedLocalDate === undefined ? undefined : tzOffset) }
          : { ...result, workflowVersion }
        const text = JSON.stringify(structuredContent)
        if (text.length > COACHING_CONTEXT_MAX_CHARACTERS) {
          throw new CoachingContextError(503, 'The draft evidence exceeds the coaching context limit')
        }
        return { structuredContent, content: [{ type: 'text' as const, text }] }
      },
    },
    show: { call: (input: unknown) => displayDraft(input) },
    save: saveDraft ? { call: (input: unknown) => displayDraft(input, saveDraft) } : null,
  }
}
