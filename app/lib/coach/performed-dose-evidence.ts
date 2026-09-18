import { MOVEMENT_CATALOG } from './movement-catalog'
import { stableStringify } from './rolling-weekly-contracts'
import { historyFieldProvenance } from './planning-history'

type ObjectRecord = Record<string, unknown>
const object = (v: unknown): v is ObjectRecord => Boolean(v && typeof v === 'object' && !Array.isArray(v))
const time = (v: unknown) => typeof v === 'string' ? Date.parse(v) : NaN

export type EvidenceQuantity =
  | { kind: 'exact'; value: number; sourcePath: string }
  | { kind: 'bounded'; min: number; max: number; sourcePath: string }
  | { kind: 'unknown'; reason: string; sourcePath: string }

export interface DoseWorkoutSource {
  id: string; user_id: string; workout_date: string; blocks: unknown
  created_at?: string; updated_at?: string; execution_revision?: number
  execution_source?: string; execution_status?: string
  capture_revision?: number; capture_provenance?: unknown; captured_at?: string
  historySnapshotId?: string | null; historySnapshotAt?: string
}
export interface DoseCompletionSource {
  id: string; user_id: string; prescribed_session_id: string
  occurred_at: string; created_at?: string; responses: unknown
}
export interface DoseEvidenceSnapshot {
  userId: string; asOf: string; startsOn: string; endsOn: string
  retrievalComplete: boolean
  athleteCoverage: 'unknown' | 'reported_partial' | 'reported_complete'
  workouts: DoseWorkoutSource[]
  completions: DoseCompletionSource[]
}

function quantity(value: unknown, sourcePath: string, whole = false): EvidenceQuantity {
  const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && (!whole || Number.isInteger(n))
  if (valid(value)) return { kind: 'exact', value, sourcePath }
  if (object(value) && valid(value.min) && valid(value.max) && value.min <= value.max) {
    return value.min === value.max ? { kind: 'exact', value: value.min, sourcePath }
      : { kind: 'bounded', min: value.min, max: value.max, sourcePath }
  }
  return { kind: 'unknown', reason: value === undefined ? 'not_recorded' : 'invalid_or_unsupported_quantity', sourcePath }
}

/** Offline snapshot reader only. No policy, prompt, database writes or aggregation. */
export function normalizePerformedDoseEvidence(input: DoseEvidenceSnapshot) {
  const asOf = time(input.asOf)
  const validDay = (v: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
    const d = new Date(`${v}T00:00:00Z`)
    return d.getUTCFullYear() === Number(v.slice(0, 4)) && d.getUTCMonth() + 1 === Number(v.slice(5, 7)) && d.getUTCDate() === Number(v.slice(8, 10))
  }
  if (!input.userId || !Number.isFinite(asOf) || !validDay(input.startsOn) || !validDay(input.endsOn) || input.startsOn > input.endsOn) throw new Error('A dated owned snapshot is required')
  // Reject rather than silently mixing athlete records.
  if ([...input.workouts, ...input.completions].some(row => !row.id || row.user_id !== input.userId)) throw new Error('Evidence ownership mismatch')
  const issues: Array<{ sourceId: string; reason: string }> = []
  const conflictingCompletionIds = new Set(input.completions.filter(c => input.completions.some(other =>
    other.id === c.id && stableStringify(other) !== stableStringify(c))).map(c => c.id))
  for (const id of conflictingCompletionIds) issues.push({ sourceId: id, reason: 'conflicting_completion_identity' })
  const exposures: Array<{
    sourceId: string; workoutId: string; completionId: string | null; sessionId: string | null
    date: string; revision: number | null; sourcePath: string; movementId: string | null
    role: 'working' | 'preparation' | 'unknown'; basis: 'confirmed_prescription' | 'reported_work' | 'unverified_prescription' | 'legacy_unknown' | 'estimated_work'
    capturedAt: string; snapshotId: string | null; origin: string; reviewState: string
    unilateralConvention: unknown; equipment: unknown; protocol: unknown; effort: unknown
    quantityProvenance: Record<string, { origin: string; reviewState: string }>
    sets: EvidenceQuantity; repetitions: EvidenceQuantity; load: EvidenceQuantity; durationMinutes: EvidenceQuantity
    loadUnit: 'lb' | 'kg' | null; raw: ObjectRecord; limitations: string[]
  }> = []
  const groups = new Map<string, DoseWorkoutSource[]>()
  for (const row of input.workouts) groups.set(row.id, [...(groups.get(row.id) ?? []), row])
  for (const [id, copies] of groups) {
    if (copies.some(row => stableStringify(row) !== stableStringify(copies[0]))) {
      issues.push({ sourceId: id, reason: 'conflicting_revisions_require_an_explicit_snapshot' }); continue
    }
    const row = copies[0]
    if (!validDay(row.workout_date) || row.workout_date < input.startsOn || row.workout_date > input.endsOn) {
      issues.push({ sourceId: id, reason: 'outside_or_invalid_date_window' }); continue
    }
    const capturedAt = [row.historySnapshotAt, row.updated_at, row.captured_at, row.created_at]
      .filter((value): value is string => typeof value === 'string').sort((a, b) => time(b) - time(a))[0]
    if (!Number.isFinite(time(row.created_at)) || !Number.isFinite(time(capturedAt))
      || time(row.created_at) > asOf || time(capturedAt) > asOf || time(capturedAt) < time(row.created_at)) {
      issues.push({ sourceId: id, reason: 'historical_value_unavailable_without_valid_snapshot_timestamps' }); continue
    }
    if (row.execution_status && row.execution_status !== 'completed') {
      issues.push({ sourceId: id, reason: 'workout_not_completed' }); continue
    }
    const linked = input.completions.filter(c => object(c.responses) && c.responses.workoutId === id)
    const completions = [...new Map(linked.map(c => [stableStringify(c), c])).values()]
    const candidate = completions.length === 1 ? completions[0] : undefined
    const response = candidate && object(candidate.responses) ? candidate.responses : undefined
    const request = response && object(response.completionRequest) ? response.completionRequest : undefined
    const performed = request && object(request.performedWork) ? request.performedWork : undefined
    const feedback = request && object(request.feedback) ? request.feedback : undefined
    const confirmed = candidate && response?.completionContractVersion === 2 && response.resultStatus === 'completed'
      && !conflictingCompletionIds.has(candidate.id) && Boolean(candidate.prescribed_session_id)
      && request?.contractVersion === 2 && request.status === 'completed' && request.sessionId === candidate.prescribed_session_id
      && feedback?.outcome === 'as_planned' && time(request.occurredAt) === time(candidate.occurred_at)
      && Number.isFinite(time(candidate.created_at)) && time(candidate.created_at) <= asOf
      && Number.isFinite(time(candidate.occurred_at)) && time(candidate.occurred_at) <= asOf
      && time(candidate.created_at) >= time(candidate.occurred_at)
      && row.execution_source === 'program_runner' && row.execution_status === 'completed'
      && row.execution_revision === 0 && performed?.mode === 'as_prescribed'
      && (row.capture_revision === undefined || row.capture_revision === 1)
      && performed.blocks === null && performed.inputText === null
      && performed.workoutDate === row.workout_date
    if (linked.length && !confirmed) issues.push({ sourceId: id, reason: 'completion_does_not_confirm_current_prescription_snapshot' })
    const blocks = Array.isArray(row.blocks) ? row.blocks : object(row.blocks) && Array.isArray(row.blocks.blocks) ? row.blocks.blocks : null
    if (!blocks) { issues.push({ sourceId: id, reason: 'unsupported_blocks_shape' }); continue }
    const root = Array.isArray(row.blocks) ? 'blocks' : 'blocks.blocks'
    const start = exposures.length
    for (const [bi, block] of blocks.entries()) {
      if (!object(block)) { issues.push({ sourceId: id, reason: `unsupported_block:${bi}` }); continue }
      // Mixed representations are ambiguous, not two separate exposures.
      if (Array.isArray(block.exercises) && Array.isArray(block.movements)) {
        issues.push({ sourceId: id, reason: `ambiguous_block_representation:${bi}` }); continue
      }
      const canonical = Array.isArray(block.exercises)
      const entries = canonical ? block.exercises : block.movements
      if (!Array.isArray(entries)) { issues.push({ sourceId: id, reason: `unsupported_block_entries:${bi}` }); continue }
      for (const [ei, entry] of entries.entries()) {
        if (!object(entry)) { issues.push({ sourceId: id, reason: `unsupported_exercise:${bi}:${ei}` }); continue }
        const path = `${root}[${bi}].${canonical ? 'exercises' : 'movements'}[${ei}]`
        const name = typeof entry.name === 'string' ? entry.name.trim().toLowerCase() : null
        const byId = canonical ? MOVEMENT_CATALOG.find(m => m.id === entry.movementId) : undefined
        const byName = !canonical ? MOVEMENT_CATALOG.find(m => m.id === name || m.name.toLowerCase() === name) : undefined
        const movement = byId ?? byName
        const roleValue = entry.role ?? block.role
        const role = roleValue === 'specific_preparation' || block.role === 'specific_preparation' ? 'preparation' :
          ['priority_adaptation', 'secondary_adaptation', 'assistance_and_capacity', 'conditioning'].includes(String(roleValue)) ? 'working' : 'unknown'
        const dose = canonical && object(entry.dose) ? entry.dose : undefined
        const loadAnchor = canonical && object(entry.loadAnchor) && object(entry.loadAnchor.loadRange) ? entry.loadAnchor.loadRange : undefined
        const unit = canonical ? loadAnchor?.unit : entry.unit
        const provenance = historyFieldProvenance(row.capture_provenance, path)
        const basis = canonical ? confirmed ? 'confirmed_prescription' : 'unverified_prescription'
          : provenance.origin === 'athlete_reported' ? 'reported_work'
            : provenance.origin === 'legacy_unknown' ? 'legacy_unknown' : 'estimated_work'
        const sets = quantity(canonical ? dose?.kind === 'sets_reps' ? dose.sets : undefined : entry.sets, `${path}.${canonical ? 'dose.sets' : 'sets'}`, true)
        const repetitions = quantity(canonical ? dose?.kind === 'sets_reps' ? dose.repetitions : undefined : entry.reps, `${path}.${canonical ? 'dose.repetitions' : 'reps'}`, true)
        const load = quantity(canonical ? loadAnchor : entry.load, `${path}.${canonical ? 'loadAnchor.loadRange' : 'load'}`)
        const durationMinutes = quantity(canonical && dose?.kind === 'continuous' ? dose.durationMinutes : undefined, `${path}.dose.durationMinutes`)
        exposures.push({ sourceId: `workout:${id}`, workoutId: id, completionId: candidate?.id ?? null,
          sessionId: candidate?.prescribed_session_id ?? null, date: row.workout_date,
          revision: row.capture_revision ?? (Number.isInteger(row.execution_revision) ? row.execution_revision! : null),
          capturedAt: capturedAt!, snapshotId: row.historySnapshotId ?? null, ...provenance,
          unilateralConvention: structuredClone(entry.unilateralConvention ?? entry.perSide ?? null),
          equipment: structuredClone(entry.equipment ?? null), protocol: structuredClone(entry.protocol ?? null),
          effort: structuredClone(entry.effort ?? entry.rpe ?? null),
          quantityProvenance: Object.fromEntries(Object.entries({ sets, repetitions, load, durationMinutes }).map(([key, value]) => [key,
            historyFieldProvenance(row.capture_provenance, value.sourcePath, 'quantities')])),
          sourcePath: path, movementId: movement?.id ?? null, role, basis,
          sets, repetitions, load, durationMinutes, loadUnit: unit === 'lb' || unit === 'kg' ? unit : null,
          raw: structuredClone(entry), limitations: [
            'No protocol equivalence or complete weekly workload inferred.',
            ...(canonical ? ['Prescription ranges are not exact performed repetitions, load or effort.'] : ['Stored fields retain their capture origin and are not independently verified completed working sets.']),
            ...(role === 'unknown' ? ['Working versus preparation role is unknown.'] : []),
            ...(!movement ? ['Movement identity is unresolved; no alias inference.'] : []),
          ] })
      }
    }
    if (exposures.length === start) issues.push({ sourceId: id, reason: 'no_supported_exercise_entries' })
  }
  // Never merge unrelated same-day records merely because they look alike.
  for (const entry of exposures) if (exposures.some(other => other.workoutId !== entry.workoutId
    && other.date === entry.date && other.movementId !== null && other.movementId === entry.movementId)) {
    issues.push({ sourceId: entry.sourceId, reason: 'separate_same_day_record_may_be_duplicate_or_distinct_exposure' })
  }
  return { version: 'performed-dose-evidence-0.1.0' as const, mode: 'shadow_only' as const,
    userId: input.userId, asOf: input.asOf, window: { startsOn: input.startsOn, endsOn: input.endsOn },
    coverage: { retrievalComplete: input.retrievalComplete, athleteCoverage: input.athleteCoverage },
    exposures, issues, sources: structuredClone({ workouts: input.workouts, completions: input.completions }),
    numericPolicyEligible: false as const }
}

export type PerformedDoseEvidence = ReturnType<typeof normalizePerformedDoseEvidence>
