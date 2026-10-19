export type TimingKind = 'recovery' | 'sleep' | 'cycle'
type Row = Record<string, unknown>
const object = (value: unknown): value is Row => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const cycleId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0
const offset = (value: unknown): value is string => typeof value === 'string' && value !== '-00:00'
  && /^[+-](?:0\d|1[0-3]):[0-5]\d$|^[+-]14:00$/.test(value)

/** Do not truncate microseconds or accept Date.parse's calendar normalization. */
function instant(value: unknown): { raw: string; us: bigint } | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  // PostgreSQL has no ISO year zero, even though JavaScript Date accepts it.
  if (!m || m[1].startsWith('0000-') || Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4]) > 59
    || (m[6] !== 'Z' && !offset(m[6]))) return null
  const date = Date.parse(`${m[1]}T00:00:00Z`)
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== m[1]) return null
  const whole = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}${m[6]}`)
  if (!Number.isFinite(whole)) return null
  return { raw: value, us: BigInt(whole) * BigInt(1000) + BigInt((m[5] ?? '').padEnd(6, '0')) }
}

/** Complete provider snapshot or none. No health/date projection, source join,
 * network, clock read or user lookup. Recovery has no direct event interval.
 */
export function projectProviderTiming(kind: TimingKind, payload: unknown, legacy: object, ingestedAt: string) {
  if (!object(payload)) return null
  const row = legacy as Row
  const idValid = kind === 'sleep' ? uuid(payload.id) && payload.id === row.sleep_id
    : cycleId(kind === 'recovery' ? payload.cycle_id : payload.id)
      && (kind === 'recovery' ? payload.cycle_id : payload.id) === row.cycle_id
  if (!idValid || (kind === 'recovery' && !uuid(payload.sleep_id))
    || (kind === 'sleep' && !cycleId(payload.cycle_id))
    || typeof payload.score_state !== 'string' || !['SCORED', 'PENDING_SCORE', 'UNSCORABLE'].includes(payload.score_state)) return null
  const created = instant(payload.created_at), updated = instant(payload.updated_at), ingested = instant(ingestedAt)
  if (!created || !updated || !ingested || updated.us < created.us || updated.us > ingested.us) return null
  const start = kind === 'recovery' ? null : instant(payload.start)
  const end = kind === 'recovery' || (kind === 'cycle' && payload.end === null) ? null : instant(payload.end)
  if (kind !== 'recovery' && (!start || !offset(payload.timezone_offset) || start.us > ingested.us
    || (!end && !(kind === 'cycle' && payload.end === null))
    || (end && (end.us < start.us || end.us > ingested.us)))) return null
  return {
    provider_created_at: created.raw, provider_updated_at: updated.raw,
    provider_interval_start: start?.raw ?? null, provider_interval_end: end?.raw ?? null,
    provider_timezone_offset: kind === 'recovery' ? null : payload.timezone_offset as string,
    provider_score_state: payload.score_state, timing_ingested_at: ingested.raw,
    timing_mapping_version: 'whoop_timing_owner_v1',
    timing_provenance: { source: 'provider_payload', intervalRole: kind === 'recovery' ? 'none' : kind,
      legacyDate: 'unchanged_not_measurement_day', observationTime: 'not_assigned' },
    ...(kind === 'recovery' ? { provider_sleep_id: payload.sleep_id as string }
      : kind === 'sleep' ? { provider_cycle_id: String(payload.cycle_id) } : {}),
  }
}
