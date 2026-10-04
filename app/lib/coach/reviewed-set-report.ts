/** Athlete-reported actuals, never a numerical prescription or inferred performance. */
import { parseReviewedSession, reviewedSessionActivities } from './reviewed-session-contract'
import { formatUTCAsLocalDateWithOffset } from '../timezone-utils'

export interface ReviewedSetReport {
  schemaVersion: 1 | 2
  activityId: string
  setNumber: number
  side: 'both' | 'left' | 'right'
  revision: number
  status: 'performed' | 'not_performed'
  performedAt: string
  repetitions: number | null
  durationSeconds: number | null
  distanceMetres: number | null
  load: { value: number; unit: 'lb' | 'kg'; convention: 'total' | 'per_hand' } | null
  rpe: { value: number; scale: 'effort_0_10' | 'rir_based' } | null
  /** Schema 2 requires an independent athlete estimate; absent in schema 1. */
  rir?: number | null
  restAfterSeconds: number | null
  stopped: boolean | null
  symptoms: string | null
  note: string | null
  velocity: { unit: 'm/s'; device: string; method: string;
    repetitions: Array<{ rep: number; meanConcentricVelocity: number }> } | null
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every(k => k in v)
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const finite = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max
const integer = (v: unknown, max: number): v is number => finite(v, max) && Number.isInteger(v)
const optionalNumber = (v: unknown, max: number) => v === null || finite(v, max)
const enumValue = (v: unknown, options: string[]) => typeof v === 'string' && options.includes(v)
function occurrenceTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-](0\d|1[0-4]):[0-5]\d)$/.test(value)
    || !Number.isFinite(Date.parse(value))) return false
  const suffix = value.endsWith('Z') ? null : value.slice(-6)
  const rawOffset = suffix ? (Number(suffix.slice(1, 3)) * 60 + Number(suffix.slice(4))) * (suffix[0] === '+' ? -1 : 1) : 0
  return formatUTCAsLocalDateWithOffset(value, rawOffset) === value.slice(0, 10)
}

/** Strict payload shape. Null stays unknown; no target is copied into actual work. */
export function parseReviewedSetReport(value: unknown): ReviewedSetReport | null {
  if (!record(value) || !keys(value, ['schemaVersion', 'activityId', 'setNumber', 'side', 'revision', 'status', 'performedAt',
    'repetitions', 'durationSeconds', 'distanceMetres', 'load', 'rpe', 'restAfterSeconds', 'stopped', 'symptoms', 'note', 'velocity',
    ...(value.schemaVersion === 2 ? ['rir'] : [])])
    || ![1, 2].includes(Number(value.schemaVersion)) || typeof value.schemaVersion !== 'number' || !text(value.activityId, 200)
    || !integer(value.setNumber, 1000) || value.setNumber < 1 || !integer(value.revision, 1000000) || value.revision < 1
    || !enumValue(value.side, ['both', 'left', 'right']) || !enumValue(value.status, ['performed', 'not_performed'])
    || !occurrenceTimestamp(value.performedAt)
    || !(value.repetitions === null || integer(value.repetitions, 1000))
    || !optionalNumber(value.durationSeconds, 86400) || !optionalNumber(value.distanceMetres, 1000000)
    || !optionalNumber(value.restAfterSeconds, 86400) || !(value.stopped === null || typeof value.stopped === 'boolean')
    || !(value.symptoms === null || text(value.symptoms, 500)) || !(value.note === null || text(value.note, 1000))) return null
  if (value.schemaVersion === 2 && !optionalNumber(value.rir, 1000)) return null
  const { load, rpe, velocity } = value
  if (load !== null && (!record(load) || !keys(load, ['value', 'unit', 'convention']) || !finite(load.value, 2000)
    || !enumValue(load.unit, ['lb', 'kg']) || !enumValue(load.convention, ['total', 'per_hand']))) return null
  if (rpe !== null && (!record(rpe) || !keys(rpe, ['value', 'scale']) || !finite(rpe.value, 10)
    || !enumValue(rpe.scale, ['effort_0_10', 'rir_based']))) return null
  if (velocity !== null) {
    if (!record(velocity) || !keys(velocity, ['unit', 'device', 'method', 'repetitions']) || velocity.unit !== 'm/s'
      || !text(velocity.device, 200) || !text(velocity.method, 200) || !Array.isArray(velocity.repetitions)
      || !velocity.repetitions.length || velocity.repetitions.length > 1000 || value.repetitions === null
      || velocity.repetitions.some(rep => !record(rep) || !keys(rep, ['rep', 'meanConcentricVelocity'])
        || !integer(rep.rep, Number(value.repetitions)) || rep.rep < 1 || !finite(rep.meanConcentricVelocity, 20))
      || new Set(velocity.repetitions.map(rep => rep.rep)).size !== velocity.repetitions.length) return null
  }
  if (value.status === 'not_performed' && ['repetitions', 'durationSeconds', 'distanceMetres', 'load', 'rpe', 'restAfterSeconds', 'velocity',
    ...(value.schemaVersion === 2 ? ['rir'] : [])]
    .some(key => value[key] !== null)) return null
  return structuredClone(value) as unknown as ReviewedSetReport
}

/** Resolves stable activity identity against the complete saved prescription. */
export function bindReviewedSetReport(prescription: unknown, input: unknown) {
  const session = parseReviewedSession(prescription), report = parseReviewedSetReport(input)
  if (!session || !report) return null
  const matches = reviewedSessionActivities(session.content).filter(activity => activity.id === report.activityId)
  if (matches.length !== 1) return null
  const activity = matches[0]
  const sides = activity.work.kind === 'distance' ? 1 : activity.work.sides
  if ((sides === 1) !== (report.side === 'both')) return null
  // Additional actual sets remain reports, not mutations of prescribed set count.
  return { report, activity: structuredClone(activity), prescription: session,
    exceedsPrescribedSets: report.setNumber > activity.sets }
}
