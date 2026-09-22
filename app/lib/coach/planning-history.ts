/** Source selection is shared; shadow dose interpretation is deliberately separate. */
export interface HistoryWorkoutRow {
  id: string; user_id: string; workout_date: string; blocks: unknown; rpe?: unknown
  created_at: string; updated_at?: string; execution_revision?: number
  execution_source?: string; execution_status?: string
  capture_revision?: number; capture_provenance?: unknown; captured_at?: string; capture_input_method?: string
}
export interface ActivityHistoryRevision {
  id: string; user_id: string; entity_kind: string; original_entity_id: string
  revision: number; record: unknown; provenance: unknown; captured_at: string; event_at: string; deleted: boolean
}
export interface HistorySourceIssue { sourceId: string; reason: string }
export interface HistoryCompletion {
  id: string; user_id: string; prescribed_session_id: string; occurred_at: string; created_at: string; responses: unknown
}
export interface ResolvedHistoryWorkout extends HistoryWorkoutRow {
  historySnapshotId: string | null
  historySnapshotAt: string
}
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))

export function resolveHistorySnapshot(input: {
  userId: string; asOf: string; mode: 'current' | 'historical_replay'
  workouts: HistoryWorkoutRow[]; revisions: ActivityHistoryRevision[]
}): { workouts: ResolvedHistoryWorkout[]; issues: HistorySourceIssue[] } {
  const asOf = Date.parse(input.asOf)
  if (!input.userId || !Number.isFinite(asOf)) throw new Error('History needs an owner and valid as-of time')
  if ([...input.workouts, ...input.revisions].some(row => row.user_id !== input.userId)) throw new Error('History ownership mismatch')
  const issues: HistorySourceIssue[] = []
  const rows: ResolvedHistoryWorkout[] = []
  const entities = new Set([...input.workouts.map(row => row.id), ...input.revisions.filter(row => row.entity_kind === 'workout').map(row => row.original_entity_id)])
  for (const id of entities) {
    const copies = input.workouts.filter(row => row.id === id)
    if (copies.some(row => JSON.stringify(row) !== JSON.stringify(copies[0]))) {
      issues.push({ sourceId: id, reason: 'conflicting_canonical_identity' }); continue
    }
    const current = copies[0]
    const revisions = input.revisions.filter(row => row.entity_kind === 'workout' && row.original_entity_id === id
      && Number.isFinite(Date.parse(row.captured_at)) && Date.parse(row.captured_at) <= asOf)
      .sort((a, b) => b.revision - a.revision)
    const revision = revisions[0]
    if (revision && revisions.some(other => other.revision === revision.revision && JSON.stringify(other) !== JSON.stringify(revision))) {
      issues.push({ sourceId: id, reason: 'conflicting_snapshot_revision' }); continue
    }
    if (input.mode === 'historical_replay') {
      if (!revision) {
        if (!current || Date.parse(current.created_at) <= asOf) issues.push({ sourceId: id, reason: 'historical_snapshot_unavailable' })
        continue
      }
      if (revision.deleted) continue
      if (!object(revision.record) || revision.record.id !== id || revision.record.user_id !== input.userId
        || typeof revision.record.workout_date !== 'string' || typeof revision.record.created_at !== 'string') {
        issues.push({ sourceId: id, reason: 'invalid_snapshot_identity' }); continue
      }
      rows.push({ ...revision.record as unknown as HistoryWorkoutRow, capture_revision: revision.revision,
        capture_provenance: revision.provenance, historySnapshotId: revision.id, historySnapshotAt: revision.captured_at })
      continue
    }
    if (!current) continue // canonical deletion cannot be resurrected by an old snapshot
    const updatedAt = [current.updated_at, current.captured_at, current.created_at].filter((value): value is string => typeof value === 'string')
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0]
    if (!Number.isFinite(Date.parse(updatedAt)) || Date.parse(updatedAt) > asOf
      || !Number.isFinite(Date.parse(current.created_at)) || Date.parse(current.created_at) > asOf) {
      issues.push({ sourceId: id, reason: 'current_record_outside_capture_window' }); continue
    }
    if (revision?.deleted && revision.revision >= (current.capture_revision ?? 1)) {
      issues.push({ sourceId: id, reason: 'canonical_record_conflicts_with_deleted_revision' }); continue
    }
    rows.push({ ...current, historySnapshotId: revision && revision.revision === current.capture_revision ? revision.id : null,
      historySnapshotAt: updatedAt })
  }
  return { workouts: rows, issues }
}

export function historyFieldProvenance(value: unknown, path: string, fallback = 'blocks'): {
  origin: string; reviewState: string
} {
  if (!object(value) || value.schemaVersion !== 1 || !object(value.fields)) return { origin: 'legacy_unknown', reviewState: 'unreviewed' }
  const field = value.fields[path] ?? value.fields[fallback]
  if (!object(field) || !['athlete_reported', 'model_estimated', 'copied_template', 'imported_unverified', 'legacy_unknown'].includes(String(field.origin))
    || !['unreviewed', 'athlete_confirmed', 'corrected'].includes(String(field.reviewState))) return { origin: 'legacy_unknown', reviewState: 'unreviewed' }
  return { origin: String(field.origin), reviewState: String(field.reviewState) }
}

/** The immutable completion request, never today's prescription, establishes this link. */
export function confirmedPrescriptionLink(row: HistoryWorkoutRow, completions: HistoryCompletion[], asOf: string): HistoryCompletion | null {
  const matches = completions.filter(item => object(item.responses) && item.responses.workoutId === row.id)
  const unique = [...new Map(matches.map(item => [item.id, item])).values()]
  if (unique.length !== 1 || matches.some(item => JSON.stringify(item) !== JSON.stringify(unique[0]))) return null
  const checkin = unique[0]
  if (checkin.user_id !== row.user_id || !object(checkin.responses)) return null
  const request = checkin.responses.completionRequest
  if (!object(request) || !object(request.performedWork) || !object(request.feedback)) return null
  const work = request.performedWork
  return checkin.responses.completionContractVersion === 2 && checkin.responses.resultStatus === 'completed'
    && request.contractVersion === 2 && request.status === 'completed' && request.sessionId === checkin.prescribed_session_id
    && request.feedback.outcome === 'as_planned' && typeof request.occurredAt === 'string' && Date.parse(request.occurredAt) === Date.parse(checkin.occurred_at)
    && Number.isFinite(Date.parse(checkin.created_at)) && Date.parse(checkin.created_at) <= Date.parse(asOf)
    && Date.parse(checkin.created_at) >= Date.parse(checkin.occurred_at) && Date.parse(checkin.occurred_at) <= Date.parse(asOf)
    && row.execution_source === 'program_runner' && row.execution_status === 'completed' && row.execution_revision === 0
    && (row.capture_revision === undefined || row.capture_revision === 1)
    && work.mode === 'as_prescribed' && work.blocks === null && work.inputText === null && work.workoutDate === row.workout_date
    ? checkin : null
}
