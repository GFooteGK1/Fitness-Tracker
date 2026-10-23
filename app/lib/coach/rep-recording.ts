import { object, text, number, integer, nullable, list, enumeration, valid } from './activity-input-schema'

/** The observed iOS array is a separate contract from the wrapped QWIK 1.10 import. */
export const REP_RECORDING_VERSION = 'qwik-ios-array-1' as const
const id = text(255)
const time = { ...text(40), pattern: '^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,6})?(?:Z|[+-](?:0\\d|1[0-4]):[0-5]\\d)$' }
const frame = integer(10_000_000)
const pause = object({ pause_number: integer(1000), start_frame: frame, end_frame: frame })
const phaseProperties = { id, rep_number: integer(1000), average_velocity: nullable(number(10, -10)),
  peak_velocity: nullable(number(10, -10)), peak_velocity_frame: nullable(frame), range_of_motion_meters: nullable(number(10, -10)),
  start_frame: nullable(frame), end_frame: nullable(frame), duration_millis: nullable(number(3_600_000)),
  is_concentric: { type: 'boolean' }, exercise_repetition_pauses: list(pause, 30, 0) }
const phase = object(phaseProperties, ['id', 'rep_number', 'is_concentric'])
export const repRecordingSchema = object({ schemaVersion: { type: 'integer', enum: [1] },
  source: object({ system: enumeration('qwik_vbt'), format: enumeration(REP_RECORDING_VERSION), parserVersion: enumeration('qwik-array-parser-1'),
    file: object({ name: text(255), sha256: { ...text(64), pattern: '^[a-f0-9]{64}$' }, byteLength: integer(5_000_000, 2),
      reference: text(500), retention: enumeration('user_retained_not_uploaded') }), setIndex: integer(999) }),
  units: object({ velocity: enumeration('m/s'), rangeOfMotion: enumeration('m'), duration: enumeration('ms'), frames: enumeration('index'),
    plateDiameter: { type: 'null' } }),
  set: object({ id, type: text(80), date: nullable(time), date_performed: nullable(time), weight: nullable(number(5000)),
    weight_unit: enumeration('lb', 'lbs', 'kg'), plate_diameter: nullable(number(1000)), rpe: nullable(text(80)),
    notes: nullable({ type: 'string', maxLength: 2000 }), exercise_sets_tags: list(text(80), 40, 0),
    is_archived: { type: 'boolean' }, exercise_name: text(200) }, ['id', 'exercise_name']),
  repetitions: list(object({ ordinal: integer(100, 1), concentricRepetition: nullable(phase), eccentricRepetition: nullable(phase) }, ['ordinal']), 100),
  rawTrace: object({ field: enumeration('bar_path'), state: enumeration('absent', 'null', 'array'), scalarCount: nullable(integer(5_000_000)) }),
  qualityFlags: list(object({ code: enumeration('starts_at_frame_one'), repOrdinal: integer(100, 1),
    phase: enumeration('concentricRepetition', 'eccentricRepetition') }), 200, 0),
})

export interface RepPhase {
  id: string; rep_number: number; is_concentric: boolean
  average_velocity?: number | null; peak_velocity?: number | null; peak_velocity_frame?: number | null
  range_of_motion_meters?: number | null; start_frame?: number | null; end_frame?: number | null; duration_millis?: number | null
  exercise_repetition_pauses?: { pause_number: number; start_frame: number; end_frame: number }[]
}
export interface RepRecording {
  schemaVersion: 1
  source: { system: 'qwik_vbt'; format: typeof REP_RECORDING_VERSION; parserVersion: 'qwik-array-parser-1';
    file: { name: string; sha256: string; byteLength: number; reference: string; retention: 'user_retained_not_uploaded' }; setIndex: number }
  units: { velocity: 'm/s'; rangeOfMotion: 'm'; duration: 'ms'; frames: 'index'; plateDiameter: null }
  set: { id: string; exercise_name: string; type?: string; date?: string | null; date_performed?: string | null;
    weight?: number | null; weight_unit?: 'lb' | 'lbs' | 'kg'; plate_diameter?: number | null; rpe?: string | null;
    notes?: string | null; exercise_sets_tags?: string[]; is_archived?: boolean }
  repetitions: { ordinal: number; concentricRepetition?: RepPhase | null; eccentricRepetition?: RepPhase | null }[]
  rawTrace: { field: 'bar_path'; state: 'absent' | 'null' | 'array'; scalarCount: number | null }
  qualityFlags: { code: 'starts_at_frame_one'; repOrdinal: number; phase: 'concentricRepetition' | 'eccentricRepetition' }[]
}

const phaseKeys = ['concentricRepetition', 'eccentricRepetition'] as const
function invalid(): never { throw new Error('Invalid structured repetition recording') }
const validTime = (v: string) => Number.isFinite(Date.parse(v)) && new Date(v.slice(0, 10)).toISOString().slice(0, 10) === v.slice(0, 10)

/** Closed schema + cross-field checks, also used by the external factual reader. No coercion. */
export function assertRepRecording(input: unknown): asserts input is RepRecording {
  if (!valid(input, repRecordingSchema)) invalid()
  const r = input as RepRecording
  for (const value of [r.set.date, r.set.date_performed]) if (typeof value === 'string' && !validTime(value)) invalid()
  if (r.rawTrace.state === 'array' ? r.rawTrace.scalarCount === null : r.rawTrace.scalarCount !== null) invalid()
  const ids = new Set<string>(), flags: RepRecording['qualityFlags'] = []
  for (const [i, rep] of r.repetitions.entries()) {
    if (rep.ordinal !== i + 1) invalid()
    for (const key of phaseKeys) {
      const p = rep[key]
      if (!p) continue // null and absent remain distinct in storage
      if (ids.has(p.id) || p.is_concentric !== (key === 'concentricRepetition')) invalid()
      ids.add(p.id)
      if (p.start_frame != null && p.end_frame != null && p.start_frame > p.end_frame) invalid()
      if (p.peak_velocity_frame != null && (p.start_frame != null && p.peak_velocity_frame < p.start_frame
        || p.end_frame != null && p.peak_velocity_frame > p.end_frame)) invalid()
      for (const pause of p.exercise_repetition_pauses ?? []) if (pause.start_frame > pause.end_frame
        || p.start_frame != null && pause.start_frame < p.start_frame || p.end_frame != null && pause.end_frame > p.end_frame) invalid()
      if (p.start_frame === 1) flags.push({ code: 'starts_at_frame_one', repOrdinal: rep.ordinal, phase: key })
    }
  }
  // A caveat documents an observed boundary, never an automatic exclusion.
  if (flags.length !== r.qualityFlags.length || flags.some((f, i) => f.code !== r.qualityFlags[i].code
    || f.repOrdinal !== r.qualityFlags[i].repOrdinal || f.phase !== r.qualityFlags[i].phase)) invalid()
}

export function isRepRecording(input: unknown): input is RepRecording {
  try { assertRepRecording(input); return true } catch { return false }
}

/** Parse locally; select source set IDs explicitly. Does not fetch references or save anything.
 * Exact original UTF-8 bytes are hashed, never JSON.stringify(decoded).
 * Unknown vendor leaves stay in the original file, not arbitrary workout metadata. */
export async function parseQwikArrayRecordings(rawText: string, options: {
  fileName: string; reference: string; sourceSetIds: string[]
}): Promise<RepRecording[]> {
  const bytes = new TextEncoder().encode(rawText)
  if (bytes.length < 2 || bytes.length > 5_000_000) invalid()
  const decoded: unknown = JSON.parse(rawText)
  if (!Array.isArray(decoded) || decoded.length === 0 || decoded.length > 1000
    || !options.sourceSetIds.length || options.sourceSetIds.length > 20 || new Set(options.sourceSetIds).size !== options.sourceSetIds.length) invalid()
  const hash = [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('')
  const setProperties = repRecordingSchema.properties!.set.properties!
  const copy = (row: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter(k => Object.hasOwn(row, k)).map(k => [k, structuredClone(row[k])]))
  return options.sourceSetIds.map(sourceId => {
    const matches = decoded.map((row, i) => ({ row, i })).filter(({ row }) => row && typeof row === 'object' && row.id === sourceId)
    if (matches.length !== 1) invalid()
    const { row, i } = matches[0]
    if (!Array.isArray(row.exercise_repetitions) || row.exercise_repetitions.length > 100 || row.exercise_repetitions.length === 0) invalid()
    const repetitions = row.exercise_repetitions.map((rep: unknown, index: number) => {
      if (!rep || typeof rep !== 'object' || Array.isArray(rep)) invalid()
      const result: Record<string, unknown> = { ordinal: index + 1 }
      for (const key of phaseKeys) if (Object.hasOwn(rep, key)) {
        const value = (rep as Record<string, unknown>)[key]
        if (value === null) result[key] = null
        else {
          if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
          result[key] = copy(value as Record<string, unknown>, Object.keys(phaseProperties))
        }
      }
      return result
    })
    const flags: RepRecording['qualityFlags'] = []
    for (const rep of repetitions) for (const key of phaseKeys) if (rep[key]?.start_frame === 1) flags.push({ code: 'starts_at_frame_one', repOrdinal: rep.ordinal, phase: key })
    const hasTrace = Object.hasOwn(row, 'bar_path')
    if (hasTrace && row.bar_path !== null && (!Array.isArray(row.bar_path) || row.bar_path.some((x: unknown) => typeof x !== 'number' || !Number.isFinite(x)))) invalid()
    const result = { schemaVersion: 1, source: { system: 'qwik_vbt', format: REP_RECORDING_VERSION, parserVersion: 'qwik-array-parser-1',
      file: { name: options.fileName, sha256: hash, byteLength: bytes.length, reference: options.reference, retention: 'user_retained_not_uploaded' }, setIndex: i },
    units: { velocity: 'm/s', rangeOfMotion: 'm', duration: 'ms', frames: 'index', plateDiameter: null },
    set: copy(row, Object.keys(setProperties)), repetitions,
    rawTrace: { field: 'bar_path', state: !hasTrace ? 'absent' : row.bar_path === null ? 'null' : 'array', scalarCount: Array.isArray(row.bar_path) ? row.bar_path.length : null }, qualityFlags: flags }
    assertRepRecording(result)
    return result
  })
}

/** Separate analysis: mean of per-rep measurements, NOT time/sample weighted.
 * Missing/null metrics are omitted and counted; boundary-caveated values remain included. */
export function summarizeRepRecording(recording: RepRecording, phase: typeof phaseKeys[number], metric: 'average_velocity' | 'peak_velocity') {
  assertRepRecording(recording)
  const values = recording.repetitions.flatMap(rep => typeof rep[phase]?.[metric] === 'number' ? [rep[phase]![metric] as number] : [])
  return { method: 'rep-arithmetic-summary-1' as const, phase, metric, unit: recording.units.velocity,
    includedCount: values.length, missingCount: recording.repetitions.length - values.length, boundaryPolicy: 'include_with_caveat' as const,
    mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null }
}
