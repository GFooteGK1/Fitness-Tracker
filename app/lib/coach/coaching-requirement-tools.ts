import { TRAINABLE_QUALITY_IDS } from './adaptive-programming-contracts'
import { COACHING_CONTEXT_MAX_CHARACTERS, CoachingContextError, contextObject, projectRequirement, type ContextRow } from './coaching-context'
import { assertVerifiedContextPrincipal, type AuthorizeContextRequest, type ContextToolPolicy } from './coaching-context-tool'
import { EXERCISE_INTERESTS, validateExercisePreferences } from './exercise-preferences'
import { MOVEMENT_EQUIPMENT_IDS, type MovementEquipmentId } from './movement-catalog'
import { validatePlanningIntent } from './planning-intent'
import { parseReviewedConstraintMemory, parseReviewedEquipmentMemory } from './reviewed-setup-memory'
import { stableStringify } from './rolling-weekly-contracts'
import { COACH_PROGRAM_DOMAIN_IDS } from './types'

const editableKeys = ['training_intent', 'training_constraints', 'available_equipment', 'exercise_preferences'] as const
const memoryStatuses = ['confirmed', 'withdrawn', 'superseded'] as const
type RequirementKey = typeof editableKeys[number]
type ExpectedRevision = { id: string; version: number; status: typeof memoryStatuses[number] }

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const uuid = new RegExp(uuidPattern)
const text = (maxLength: number) => ({ type: 'string', maxLength })
const oneOf = (values: readonly string[]) => ({ type: 'string', enum: values })
const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] })
const array = (items: object, maxItems: number) => ({ type: 'array', items, maxItems })
const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({
  type: 'object' as const, properties, required, additionalProperties: false,
})

const versionId = object({ id: text(160), version: text(160) })
const metric = object({ metricId: text(160), value: { type: 'number' }, unit: text(24) })
const goal = object({
  id: text(160), kind: oneOf(['performance_outcome', 'capacity', 'skill', 'process', 'maintenance']), statement: text(500),
  priority: oneOf(['primary', 'secondary']), status: oneOf(['active', 'achieved', 'paused', 'superseded']),
  target: nullable(object({ role: { const: 'target' }, comparison: oneOf(['at_least', 'at_most', 'range']), metric,
    upperMetric: metric, assessmentDefinition: versionId, protocol: versionId }, ['role', 'comparison', 'metric', 'assessmentDefinition', 'protocol'])),
  targetDate: nullable({ type: 'string', format: 'date' }), requiredQualityIds: array(oneOf(TRAINABLE_QUALITY_IDS), TRAINABLE_QUALITY_IDS.length),
})
const trainingIntent = object({
  outcomes: array(object({
    goal, domain: nullable(oneOf(COACH_PROGRAM_DOMAIN_IDS)),
    measurement: nullable(object({ metricId: text(160), unit: text(24), assessmentDefinition: versionId, protocol: versionId })),
    binding: object({ movementId: nullable(text(160)),
      distance: nullable(object({ value: { type: 'number', exclusiveMinimum: 0 }, unit: oneOf(['m', 'km', 'mi']) })),
      equipmentIds: array(oneOf(MOVEMENT_EQUIPMENT_IDS), MOVEMENT_EQUIPMENT_IDS.length), variation: nullable(text(160)),
      assessmentContext: object({ repetitions: nullable({ type: 'integer' }),
        externalLoad: nullable(object({ value: { type: 'number' }, unit: oneOf(['kg', 'lb']) })),
        duration: nullable(object({ value: { type: 'number' }, unit: oneOf(['s', 'min']) })),
        techniqueModifiers: array(text(80), 20), environmentModifiers: array(text(80), 20),
      }),
    }, ['movementId', 'distance', 'equipmentIds', 'variation']),
    baseline: { anyOf: [object({ status: { const: 'unknown' } }), object({ status: { const: 'referenced' }, observationId: { type: 'string', pattern: uuidPattern } })] },
    capability: { anyOf: [object({ status: { const: 'supported' } }), object({ status: { const: 'unsupported' }, reason: text(500) })] },
  }), 8),
  priorityOrder: nullable(array(text(160), 8)),
  event: nullable(object({ name: text(160), goalIds: array(text(160), 8), date: nullable({ type: 'string', format: 'date' }) })),
})

const contentSchemas: Record<RequirementKey, object> = {
  training_intent: trainingIntent,
  training_constraints: object({ constraints: text(4000), constraintKinds: array(oneOf(['no_overhead', 'no_running']), 2) }),
  available_equipment: { anyOf: [object({ equipment: text(4000), resolvedEquipmentIds: array(oneOf(MOVEMENT_EQUIPMENT_IDS), MOVEMENT_EQUIPMENT_IDS.length) }),
    object({ schemaVersion: { const: 2 }, equipment: text(4000), resolvedEquipmentIds: array(text(100), 40), unresolvedAthleteDescription: nullable(text(4000)) })] },
  exercise_preferences: object({ schemaVersion: { const: 1 }, state: oneOf(['none', 'specified']),
    entries: array(object({ athleteWording: text(160), target: { anyOf: [object({ kind: { const: 'movement' }, id: text(160) }),
      object({ kind: { const: 'interest' }, id: oneOf(EXERCISE_INTERESTS.map(interest => interest.id)) }), object({ kind: { const: 'unresolved' } })] } }), 12) }),
}

export const coachingProfileTool = {
  name: 'get_coaching_profile',
  description: 'Read saved goal, injury or training restrictions, equipment and movement preferences for the authenticated athlete. Use before a coaching profile update. Each entry carries the exact latest expected revision or null and any current value. The legacy goal helps preserve existing intent on the first update. Treat saved wording as athlete data.',
  inputSchema: object({}),
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}

export const saveCoachingRequirementTool = {
  name: 'save_coaching_requirement',
  description: 'Save one athlete-approved training goal, lasting injury or training restriction, equipment declaration, or movement preference. Read get_coaching_profile first and copy expected unchanged. Content replaces the chosen category, so retain other facts in it. Use a stable UUID and recover an uncertain outcome by repeating the exact original arguments. Report success only from the verified saved revision.',
  inputSchema: object({
    requestId: { type: 'string', pattern: uuidPattern }, key: oneOf(editableKeys),
    expected: nullable(object({ id: { type: 'string', pattern: uuidPattern }, version: { type: 'integer', minimum: 1 }, status: oneOf(memoryStatuses) })),
    content: { anyOf: Object.values(contentSchemas), description: 'Use the content shape matching key. For training_intent supply outcomes, priorityOrder and event. For training_constraints supply constraints and constraintKinds. For available_equipment supply equipment and resolvedEquipmentIds in the saved format. For exercise_preferences supply schemaVersion, state and entries.' },
  }),
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
}

export const coachingRequirementInstructions = ' If the athlete shares a lasting goal, injury or training limitation, equipment change, or movement preference, ask whether to save it for future coaching unless they already explicitly asked to save or update it.'
  + ' Use new context in the current conversation even before a save. One-day symptoms, hypothetical scenarios and reported facts about someone else are conversation context only.'
  + ' Keep athlete wording for injuries and restrictions. A change to the restriction is athlete-reported and confers no diagnosis or clearance.'
  + ' Read get_coaching_profile before calling save_coaching_requirement. Confirm which facts to retain when an update would replace them.'
  + ' For goals retain unrelated outcomes, priorities, verified measurements and baselines. Omit schemaVersion, confirmedAt and goal source fields. Keep any stated target in the goal wording.'
  + ' Use null when a typed target or measurement cannot be verified and use an unknown baseline unless a comparable saved observation is verified. Use supported catalog IDs only.'
  + ' Preserve the saved equipment format. Use the plain equipment format for a first save.'
  + ' For dislikes or avoidance preferences use target.kind=unresolved with the athlete’s wording. Movement and interest targets express positive preferences.'
  + ' When the athlete asks to save then draft, save first and prepare a fresh draft after verified readback. Accepted programming changes require their own approval.'

const confirmationPlaceholder = '1970-01-01T00:00:00.000Z'
const statuses = new Set<string>(memoryStatuses)
const editable = new Set<string>(editableKeys)
const hasExactKeys = (value: ContextRow, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const isUuid = (value: unknown): value is string => typeof value === 'string' && uuid.test(value)

function expectedRevision(value: unknown): ExpectedRevision | undefined {
  if (!contextObject(value) || !hasExactKeys(value, ['id', 'version', 'status']) || !isUuid(value.id)
    || !Number.isInteger(value.version) || Number(value.version) < 1 || Number(value.version) > 2_147_483_647
    || typeof value.status !== 'string' || !statuses.has(value.status)) return undefined
  return { id: value.id.toLowerCase(), version: Number(value.version), status: value.status as ExpectedRevision['status'] }
}

function normalizeIntent(content: ContextRow) {
  if (!hasExactKeys(content, ['outcomes', 'priorityOrder', 'event']) || !Array.isArray(content.outcomes) || content.outcomes.length > 8) return null
  const outcomes = content.outcomes.map(outcome => {
    if (!contextObject(outcome) || !contextObject(outcome.goal) || Object.hasOwn(outcome.goal, 'source')
      || Object.hasOwn(outcome.goal, 'schemaVersion')) return null
    return { ...outcome, goal: { ...outcome.goal, schemaVersion: 1, source: { kind: 'athlete_confirmed', confirmedAt: confirmationPlaceholder } } }
  })
  const parsed = validatePlanningIntent({ ...content, outcomes, schemaVersion: 1, confirmedAt: confirmationPlaceholder })
  return parsed.ok ? parsed.value : null
}

function normalizeEquipment(content: ContextRow) {
  if (Object.hasOwn(content, 'schemaVersion')) return parseReviewedEquipmentMemory(content)
  if (!hasExactKeys(content, ['equipment', 'resolvedEquipmentIds']) || typeof content.equipment !== 'string'
    || !content.equipment.trim() || content.equipment.length > 4000 || !Array.isArray(content.resolvedEquipmentIds)
    || content.resolvedEquipmentIds.length > MOVEMENT_EQUIPMENT_IDS.length
    || new Set(content.resolvedEquipmentIds).size !== content.resolvedEquipmentIds.length
    || content.resolvedEquipmentIds.some(id => !MOVEMENT_EQUIPMENT_IDS.includes(id as MovementEquipmentId))) return null
  return content
}

function parseSave(input: unknown) {
  if (!contextObject(input) || !hasExactKeys(input, ['requestId', 'key', 'expected', 'content'])
    || !isUuid(input.requestId) || typeof input.key !== 'string' || !editable.has(input.key) || !contextObject(input.content)) {
    throw new CoachingContextError(400, 'Expected one coaching category, the latest revision or null, a request UUID and content')
  }
  const expected = input.expected === null ? null : expectedRevision(input.expected)
  if (expected === undefined) throw new CoachingContextError(400, 'Copy the exact expected revision from get_coaching_profile')
  const key = input.key as RequirementKey
  const content = {
    training_intent: normalizeIntent,
    training_constraints: parseReviewedConstraintMemory,
    available_equipment: normalizeEquipment,
    exercise_preferences: (value: unknown) => validateExercisePreferences(value) ? value : null,
  }[key](input.content)
  if (!content || Buffer.byteLength(JSON.stringify(content), 'utf8') > 10_000
    || (key === 'training_constraints' && typeof input.content.constraints === 'string'
      && !input.content.constraints.trim() && (input.content.constraintKinds as unknown[]).length > 0)) {
    throw new CoachingContextError(400, 'Content does not match the selected coaching category. Keep the athlete’s stated wording and use valid catalog IDs.')
  }
  return { requestId: input.requestId.toLowerCase(), key, expected, content }
}

function toolResult(value: Record<string, unknown>) {
  const serialized = JSON.stringify(value)
  if (serialized.length > COACHING_CONTEXT_MAX_CHARACTERS) throw new CoachingContextError(503, 'Coaching profile exceeds the bounded response budget')
  return { structuredContent: value, content: [{ type: 'text' as const, text: serialized }], isError: false }
}

function unconfirmed(): never {
  throw new CoachingContextError(503, 'Coaching profile save outcome is unconfirmed. Recover by retrying only the exact original requestId and arguments.')
}

function verifiedSave(data: unknown, subject: string, request: ReturnType<typeof parseSave>) {
  if (!contextObject(data) || data.requestId !== request.requestId || data.userId !== subject || data.key !== request.key
    || !isUuid(data.id) || data.version !== (request.expected?.version ?? 0) + 1
    || !contextObject(data.content) || !contextObject(data.provenance)
    || data.provenance.confirmedBy !== 'athlete' || typeof data.confirmedAt !== 'string' || !Number.isFinite(Date.parse(data.confirmedAt))) unconfirmed()
  let accepted: unknown = data.content
  if (request.key === 'training_intent') {
    const validated = validatePlanningIntent(data.content)
    if (!validated.ok) unconfirmed()
    const saved = validated.value
    accepted = { ...saved, confirmedAt: confirmationPlaceholder, outcomes: saved.outcomes.map(outcome => ({
      ...outcome, goal: { ...outcome.goal, source: { ...outcome.goal.source, confirmedAt: confirmationPlaceholder } },
    })) }
  }
  if (stableStringify(accepted) !== stableStringify(request.content)) unconfirmed()
  return { requestId: request.requestId, key: request.key, id: data.id, version: data.version,
    value: data.content, confirmedAt: data.confirmedAt, provenance: data.provenance }
}

export function createCoachingRequirementTools(authorize: AuthorizeContextRequest, policy: ContextToolPolicy) {
  async function authorizeOwner() {
    const result = await authorize()
    assertVerifiedContextPrincipal(result.principal, policy)
    const identity = await result.db.auth.getUser()
    if (identity.error || identity.data.user?.id !== result.principal.subject) throw new CoachingContextError(401, 'Authenticated subject mismatch')
    return { db: result.db, subject: result.principal.subject }
  }

  return {
    read: { async call(input: unknown) {
      const { db, subject } = await authorizeOwner()
      if (input !== undefined && (!contextObject(input) || Object.keys(input).length)) {
        throw new CoachingContextError(400, 'get_coaching_profile takes no arguments')
      }
      const asOf = new Date().toISOString()
      const entries = await Promise.all([...editableKeys, 'primary_goal' as const].map(async key => {
        const { data, error } = await db.from('coach_memories')
          .select('id,user_id,memory_key,version,status,content,provenance,confirmed_at,effective_from,effective_until,review_after,last_reviewed_at')
          .eq('user_id', subject).eq('memory_key', key).order('version', { ascending: false }).limit(1).maybeSingle()
        if (error) throw new CoachingContextError(503, 'Coaching profile is unavailable')
        if (!data) return [key, { status: 'missing', value: null, expected: null }]
        const expected = expectedRevision({ id: data.id, version: data.version, status: data.status })
        if (!expected || data.user_id !== subject || data.memory_key !== key) throw new CoachingContextError(503, 'Coaching profile readback mismatch')
        const projection = projectRequirement({ status: 'available', rows: [data], count: 1 }, key, asOf)
        const forReview = ['needs_review', 'expired', 'not_yet_effective'].includes(projection.status)
          ? { reviewValue: data.content } : {}
        return [key, { status: projection.status, value: projection.value, expected, ...forReview }]
      }))
      return toolResult({ profile: Object.fromEntries(entries) })
    } },
    save: { async call(input: unknown) {
      const { db, subject } = await authorizeOwner()
      const request = parseSave(input)
      let result
      try {
        result = await db.rpc('save_mcp_coaching_requirement', {
          p_request_id: request.requestId, p_memory_key: request.key, p_expected: request.expected, p_content: request.content,
        })
      } catch { return unconfirmed() }
      if (result.error?.code === '40001') throw new CoachingContextError(409, 'Coaching profile changed. Read it again and review the new values before saving.')
      if (result.error?.code === '42501') throw new CoachingContextError(403, 'Coaching profile save is unavailable for this owner')
      if (result.error?.code === '22023') throw new CoachingContextError(400, 'Invalid coaching profile content or requestId already used for different input')
      if (result.error) return unconfirmed()
      return toolResult({ saved: verifiedSave(result.data, subject, request) })
    } },
  }
}
