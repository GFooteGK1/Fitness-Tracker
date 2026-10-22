import { CoachingContextError } from './coaching-context'

// Small, closed JSON-schema vocabulary shared by descriptors and runtime validation.
// No coercion, defaults, arbitrary metadata, model calls or source identity in input.
type Schema = { type?: string; properties?: Record<string, Schema>; required?: readonly string[]; additionalProperties?: false;
  items?: Schema; minItems?: number; maxItems?: number; minLength?: number; maxLength?: number; pattern?: string;
  minimum?: number; maximum?: number; multipleOf?: number; enum?: readonly unknown[]; anyOf?: readonly Schema[]; description?: string }
const object = (properties: Record<string, Schema>, required: readonly string[] = Object.keys(properties)): Schema =>
  ({ type: 'object', properties, required, additionalProperties: false })
const text = (maxLength = 500): Schema => ({ type: 'string', minLength: 1, maxLength })
const number = (maximum: number, minimum = 0): Schema => ({ type: 'number', minimum, maximum })
const integer = (maximum: number, minimum = 0): Schema => ({ type: 'integer', minimum, maximum })
const nullable = (s: Schema): Schema => ({ anyOf: [s, { type: 'null' }] })
const list = (items: Schema, maxItems = 100, minItems = 1): Schema => ({ type: 'array', items, minItems, maxItems })
const enumeration = (...values: string[]): Schema => ({ type: 'string', enum: values })
const uuid: Schema = { ...text(36), pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' }
const date: Schema = { ...text(10), pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
const timestamp: Schema = { ...text(40), pattern: '^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,6})?(?:Z|[+-](?:0\\d|1[0-4]):[0-5]\\d)$' }
const field = object({ origin: enumeration('athlete_reported', 'model_estimated', 'copied_template', 'imported_unverified', 'legacy_unknown'),
  reviewState: enumeration('unreviewed', 'athlete_confirmed', 'corrected'), sourceReferences: list(text(500), 30, 0) })
// Per-field provenance is required for changed fields; untouched origins are never upgraded.
const provenance = object({ occurrence: field, fields: object(Object.fromEntries(
  ['blocks', 'quantities', 'rpe', 'notes', 'readiness', 'items', 'macros', 'meal_timestamp', 'meal_timing', 'input_text', 'workout_date', 'tags', 'total_duration_min', 'primary_score']
    .map(key => [key, field])), []) }, ['fields'])
const load = object({ value: nullable(number(5000)), unit: enumeration('lb', 'kg') })
const velocity = object({ value: nullable(number(10)), unit: enumeration('m/s'), metric: enumeration('mean_concentric', 'peak_concentric'),
  device: nullable(text(120)), measuredAt: nullable(timestamp) })
const setMeasurement = object({ blockIndex: integer(29), segmentIndex: integer(999), eventIndex: integer(999),
  collection: enumeration('sets', 'set_details'), setIndex: integer(999), velocity,
  provenance: object(Object.fromEntries(['value', 'unit', 'metric', 'device', 'measuredAt'].map(key => [key, field]))) })
const set = object({ id: uuid, reps: nullable(integer(10000)), load: nullable(load), rpe: nullable(number(10, 1)), rir: nullable(number(10)),
  velocity: nullable(velocity), notes: nullable(text(2000)) }, ['id'])
const amounts = object({ reps: nullable(integer(10000)), sets: nullable(integer(1000)), load: nullable(load), time_s: nullable(number(86400)),
  distance: nullable(object({ value: nullable(number(1000000)), unit: enumeration('m', 'km', 'mi', 'ft') })),
  set_details: list(set) }, [])
const readiness = nullable(object({ scale: enumeration('1-5'), value: nullable(integer(5, 1)), reportedAt: nullable(timestamp), notes: nullable(text(2000)) }))
const block = object({ block_type: enumeration('STRENGTH', 'CARDIO', 'AMRAP', 'FOR_TIME', 'EMOM'), title: text(200), session_readiness: readiness,
  segments: list(object({ rounds: nullable(integer(1000)), events: list(object({ movement_name: text(200), performed: amounts })) }), 20) }, ['block_type', 'segments'])
const workoutFields = { workout_date: date, input_text: { type: 'string', maxLength: 5000 } as Schema, blocks: list(block, 30),
  notes: nullable({ type: 'string', maxLength: 10000 }), rpe: nullable(number(10, 1)), total_duration_min: nullable(integer(1440)),
  tags: list(text(80), 30, 0), primary_score: nullable(text(500)) }
const macro = (maximum: number): Schema => ({ ...number(maximum), multipleOf: 0.01 })
const item = object({ food: text(), portion: text(), protein: macro(9999), carbs: macro(9999), fat: macro(9999), calories: macro(99999) })
const mealFields = { meal_timestamp: timestamp, meal_timing: nullable(enumeration('PRE_WORKOUT', 'POST_WORKOUT', 'BREAKFAST', 'LUNCH', 'DINNER', 'SNACK')),
  input_text: { type: 'string', maxLength: 5000 } as Schema, items: list(item, 50) }
const identity = { entityId: uuid, expectedRevision: integer(2147483647, 1), requestId: uuid }
export const activityToolSchemas = {
  create_workout: object({ requestId: uuid, record: object(workoutFields, ['workout_date', 'input_text', 'blocks']), provenance }),
  amend_workout: object({ ...identity, changes: object({ ...workoutFields, readiness, setMeasurements: list(setMeasurement, 100) }, []), provenance }),
  create_meal: object({ requestId: uuid, record: object(mealFields, ['meal_timestamp', 'items']), provenance }),
  amend_meal: object({ ...identity, changes: object(mealFields, []), provenance }),
  get_activity_record: object({ kind: enumeration('workout', 'meal'), entityId: uuid }),
  get_activity_write_status: object({ requestId: uuid }),
} as const
export type ActivityToolName = keyof typeof activityToolSchemas

function valid(value: unknown, s: Schema): boolean {
  if (s.anyOf) return s.anyOf.some(option => valid(value, option))
  if (s.enum && !s.enum.includes(value)) return false
  switch (s.type) {
    case 'null': return value === null
    case 'string': return typeof value === 'string' && value.length >= (s.minLength ?? 0) && value.length <= (s.maxLength ?? Infinity)
      && (!(s.minLength && s.minLength > 0) || value.trim().length >= s.minLength)
      && (!s.pattern || new RegExp(s.pattern).test(value))
    case 'integer': case 'number': return typeof value === 'number' && Number.isFinite(value) && (s.type !== 'integer' || Number.isSafeInteger(value))
      && value >= (s.minimum ?? -Infinity) && value <= (s.maximum ?? Infinity)
      && (!s.multipleOf || Math.abs(value / s.multipleOf - Math.round(value / s.multipleOf)) < 1e-7)
    case 'array': return Array.isArray(value) && value.length >= (s.minItems ?? 0) && value.length <= (s.maxItems ?? Infinity)
      && value.every(item => valid(item, s.items!))
    case 'object': return Boolean(value && typeof value === 'object' && !Array.isArray(value)
      && (s.required ?? []).every(key => Object.hasOwn(value, key))
      && Object.entries(value).every(([key, part]) => Object.hasOwn(s.properties!, key) && valid(part, s.properties![key])))
    default: return false
  }
}

export function validateActivityToolInput(name: ActivityToolName, input: unknown): asserts input is Record<string, any> {
  if (!valid(input, activityToolSchemas[name]) || JSON.stringify(input).length > 48000 || /data:(image|audio)\//i.test(JSON.stringify(input))) {
    throw new CoachingContextError(400, 'Invalid activity input. Use the typed schema; meal macros must be supplied in grams and kcal, never filled with zero for missing data.')
  }
  const value = input as Record<string, any>, record = value.record ?? value.changes
  if (!record) return
  const checkDate = (s: string) => Number.isFinite(Date.parse(s)) && Number.isFinite(Date.parse(s.slice(0, 10)))
    && new Date(s.slice(0, 10)).toISOString().slice(0, 10) === s.slice(0, 10)
  if (record.workout_date && !checkDate(record.workout_date) || record.meal_timestamp && !checkDate(record.meal_timestamp)) {
    throw new CoachingContextError(400, 'Invalid activity date')
  }
  const validateTimes = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(validateTimes); return }
    if (!value || typeof value !== 'object') return
    for (const [key, part] of Object.entries(value)) {
      if (['measuredAt', 'reportedAt'].includes(key) && typeof part === 'string' && !checkDate(part)) throw new CoachingContextError(400, 'Invalid measurement timestamp')
      validateTimes(part)
    }
  }
  validateTimes(record)
  if (record.setMeasurements) {
    if (record.blocks) throw new CoachingContextError(400, 'Set measurements cannot accompany replacement blocks')
    if (value.provenance.occurrence) throw new CoachingContextError(400, 'Set measurements cannot change occurrence provenance')
    const paths = record.setMeasurements.map((patch: Record<string, unknown>) =>
      [patch.blockIndex, patch.segmentIndex, patch.eventIndex, patch.collection, patch.setIndex].join(':'))
    if (new Set(paths).size !== paths.length) throw new CoachingContextError(400, 'Duplicate set measurement path')
  }
  if (record.items) for (const macro of ['protein', 'carbs', 'fat', 'calories']) {
    const total = record.items.reduce((sum: number, item: Record<string, number>) => sum + item[macro], 0)
    if (total > (macro === 'calories' ? 99999 : 9999)) throw new CoachingContextError(400, 'Meal total exceeds storage range')
  }
  const ids: string[] = []
  for (const b of record.blocks ?? []) for (const segment of b.segments) for (const event of segment.events) {
    for (const set of event.performed.set_details ?? []) ids.push(set.id.toLowerCase())
  }
  if (new Set(ids).size !== ids.length) throw new CoachingContextError(400, 'Each set needs a unique stable ID')
  if (name.startsWith('amend_') && !Object.keys(record).length) throw new CoachingContextError(400, 'A correction must specify changed fields')
}

/** Object key order cannot turn the same command into a different retry. Array order is meaningful. */
export function canonicalActivityJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalActivityJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, part]) => `${JSON.stringify(key)}:${canonicalActivityJson(part)}`).join(',')}}`
  return JSON.stringify(value)
}
